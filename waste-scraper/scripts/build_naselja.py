# -*- coding: utf-8 -*-
"""Sastavlja tri CSV-a o naseljima grada Pirota iz već prikupljenih izvora.

    data/pirot_naselja.csv                    72 naselja: koordinata + pokrivenost
    data/pirot_naselja_aliasi.csv             kako ih izvori pišu
    data/pirot_odvoz_seoska_naselja_2018.csv  plan JP Komunalac, verbatim

Ništa se ovde ne izmišlja. Ime naselja dolazi iz LPUO spiska, pokrivenost iz plana JP
Komunalac, koordinata iz geokeša / registra / već geokodiranih redova o deponijama, i
svaki red nosi kolonu koja kaže odakle mu šta.

Pokretanje: python scripts/build_naselja.py   (iz waste-scraper/)
Za naselja bez koordinate prvo: python scripts/geocode.py <fajl-sa-imenima>
"""
import csv
import io
import json
import os
import re
import unicodedata

from komunalac_odvoz_2018 import (GODINA_IZVORA, GRAD_IZVOR, GRAD_IZVOR_URL, IZVOR,
                                  IZVOR_URL, KONTEJNERI_POSTAVLJENI, PLAN_2018)
from komunalac_kontejneri_2024 import (GODINA_IZVORA as KONT_2024_GODINA,
                                       IZVOR as KONT_2024_IZVOR, sa_kontejnerima)
from lpuo_naselja import GRAD, ISPRAVKE, sva_naselja

DATA = "data"
CACHE = "raw/geocode_cache.json"

# OSM tipovi koje priznajemo kao naseljeno mesto.
NASELJENO_MESTO = {"administrative", "town", "village", "hamlet"}

# Šifre mesta koje SEPA/NRIZ registar nosi uz naselje ("Gnjilan, Pirot, 732222").
# Registar pominje samo naselja sa deponijom, pa ostalih 67 ostaje bez šifre dok se ne
# nađe zvanični spisak RGZ-a.
SIFRE_MESTA = {
    "Pirot": "732575", "Gnjilan": "732222", "Gradašnica": "732265",
    "Gradište": "732273", "Krupac": "732397",
}

# Kako izvori pišu imena koja nisu naselja, i zašto ipak pripadaju nekom naselju.
# Bez ovoga ostaju bez naselja i deponija se ne vidi ni na jednoj listi po selima.
ALIASI = [
    # gradske mesne zajednice i ulice - cenovnik JP Komunalac za 2026 nabraja svih 19
    # gradskih MZ sa pripadajućim ulicama, pa je pripadnost gradu dokument, ne procena
    ("Tijabara", GRAD, "KOMUNALAC", "gradska mesna zajednica (cenovnik 2026, MZ 19)"),
    ("Sarlah", GRAD, "LPUO", "deo Pirota; OSM: Сарлах, Пирот"),
    ("Naselje Prčevac", GRAD, "LPUO", "gradska mesna zajednica (cenovnik 2026, MZ 11)"),
    ("Prčevac", GRAD, "KOMUNALAC", "gradska mesna zajednica (cenovnik 2026, MZ 11)"),
    ("Barje", GRAD, "LPUO", "gradska mesna zajednica (cenovnik 2026, MZ 1); istoimeno selo je u opštini Babušnica"),
    ("Kavak", GRAD, "LPUO", "ulica u MZ Rogoz (cenovnik 2026); OSM: Кавак, Присјанско Насеље, Пирот"),
    ("M.Z.Berilovskakapija", GRAD, "EKOALERT", "gradska mesna zajednica Berilovačka Kapija (cenovnik 2026, MZ 3)"),
    ("Ustanička ulica", GRAD, "EKOALERT", "ulica u MZ Tigrovo naselje (cenovnik 2026)"),
    ("cara dusana", GRAD, "EKOALERT", "ulica u MZ Berilovačka Kapija (cenovnik 2026)"),
    ("cara dušana", GRAD, "EKOALERT", "ulica u MZ Berilovačka Kapija (cenovnik 2026)"),
    ("svetozara markovića  Tijabara", GRAD, "EKOALERT", "ulica u MZ Tigrovo naselje (cenovnik 2026)"),
    ("Pirot-grad", GRAD, "EKOALERT", "grad"),
    ("Pirot - industrijska zona / staro korito Nisave", GRAD, "LPUO", "LPUO tabela 10: KO Pirot"),
    # zaseoci i lokaliteti van grada, vezani preko katastarske opštine iz LPUO tabele 10
    ("Crveni Breg", "Berilovac", "LPUO", "LPUO tabela 10: „Četvrti kilometar - Crveni Breg“, KO Berilovac"),
    # pisanje sa „selo“ ispred, iz prijava građana
    ("selo sukovo", "Sukovo", "EKOALERT", ""),
    ("selo Izvor", "Izvor", "EKOALERT", ""),
    ("selo petrovac", "Petrovac", "EKOALERT", ""),
    ("selo Stanićenje", "Staničenje", "EKOALERT", ""),
    ("Selo Izvor", "Izvor", "KOMUNALAC", ""),
    ("Selo Krupac", "Krupac", "KOMUNALAC", ""),
]

# Imena koja namerno ostaju nerazrešena, sa razlogom - da se ne bi u svakoj sledećoj
# reviziji ponovo ispitivala.
NERAZRESENO = {
    "Zaluzje": "zona u starom koritu Nišave; LPUO tabela 10 je deli između KO Izvor i KO Pirot",
    "Belava": "vrh/kosa između Gnjilana i Velikog Suvodola; izvori je vezuju za oba",
    "Kompezacioni bazen - staro gradsko kupališta": "dve različite lokacije spojene u jedno ime",
}


def norm(s):
    s = s.lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.replace("đ", "dj")).strip()


def ucitaj_koordinate():
    """naselje -> (lat, lon, izvor). Redosled izvora je redosled pouzdanosti."""
    coords = {}

    def dodaj(ime, lat, lon, izvor):
        coords.setdefault(norm(ime), (float(lat), float(lon), izvor))

    # 1. OSM, ali samo ako je rezultat zaista naseljeno mesto. Geokoder na ime sela rado
    # vrati vrh, vodopad ili pumpu: „Belava“ je peak, „Crveni Breg“ waterfall, a na
    # „Pirot“ vraća benzinsku pumpu. Tip rezultata je jedino što ih razdvaja.
    if os.path.exists(CACHE):
        for ime, v in json.load(io.open(CACHE, encoding="utf-8")).items():
            tip = (v or {}).get("osm_type")
            if v and "Град Пирот" in v.get("display_name", "") and tip in NASELJENO_MESTO:
                dodaj(ime, v["lat"], v["lon"], "OSM/" + tip)

    # 2. tačka iz registra divljih deponija, ali samo ako je već označena kao centroid
    with io.open(DATA + "/pirot_divlje_deponije_lokacije.csv", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            if r["geo_preciznost"] == "centroid_naselja":
                dodaj(r["naselje"], r["lat"], r["lon"], "deponije/centroid_naselja")

    # 3. koordinata prijave iz SEPA registra - tačka deponije, ne centar sela, pa poslednja
    with io.open(DATA + "/pirot_sepa_registar_2018_2024.csv", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            m = re.match(r"^(.*?),\s*Pirot,\s*(\d+)$", r["Naselje"].strip())
            if m:
                dodaj(m.group(1), r["Geografska širina"], r["Geografska dužina"], "SEPA")

    return coords


def main():
    coords = ucitaj_koordinate()
    plan = {naselje: red for red in PLAN_2018 if (naselje := red[1])}
    # Šest godina noviji spisak, i odgovara na drugo pitanje: gde stoje kontejneri, a ne
    # koga kamion obilazi. Zato ide u zasebne kolone i ne dira `organizovano_prikupljanje`.
    sva_imena = [naziv for naziv, _, _ in sva_naselja()]
    kont_2024 = set(sa_kontejnerima(sva_imena, GRAD))

    naselja, bez_koordinate = [], []
    for naziv, u_planu, kategorija in sva_naselja():
        k = coords.get(norm(naziv))
        if k is None:
            bez_koordinate.append(naziv)
            continue

        red = plan.get(naziv)
        pokriveno = "da" if (red or naziv == GRAD) else "ne"
        naselja.append({
            "naziv": naziv,
            "naziv_u_lpuo": u_planu if u_planu != naziv else "",
            "sifra_mesta": SIFRE_MESTA.get(naziv, ""),
            "lat": "%.6f" % k[0],
            "lon": "%.6f" % k[1],
            "geo_izvor": k[2],
            "kategorija_lpuo": kategorija,
            "organizovano_prikupljanje": pokriveno,
            # Za sela je „ne“ zaključak, ne prepis: plan JP Komunalac je kompletan spisak
            # sela u koja se izvozi, a LPUO kaže da ostala sela nemaju organizovano
            # odnošenje. Kolona to mora da kaže naglas.
            "pokrivenost_izvor": (IZVOR if red else GRAD_IZVOR if naziv == GRAD
                                  else "%s (naselja nema u planu) + LPUO 2021-2031" % IZVOR),
            "pokrivenost_izvor_url": (IZVOR_URL if red else GRAD_IZVOR_URL if naziv == GRAD
                                     else IZVOR_URL),
            "pokrivenost_godina": GODINA_IZVORA if red or naziv != GRAD else 2026,
            "odvoz_nedeljno": red[2] if red else "",
            "broj_stanovnika_2011": red[3] if red and red[3] else "",
            "broj_domacinstava": red[4] if red and red[4] else (12091 if naziv == GRAD else ""),
            "broj_kontejnera_1100l": red[5] if red else "",
            # Prazno za grad: tabela iz 2024 je spisak SELA sa kontejnerima, pa o gradu
            # ne tvrdi ništa - ni „da“ ni „ne“ ne bi bilo prepis.
            "kontejneri_2024": "" if naziv == GRAD else ("da" if naziv in kont_2024 else "ne"),
            "kontejneri_2024_izvor": "" if naziv == GRAD else KONT_2024_IZVOR,
            "kontejneri_2024_godina": "" if naziv == GRAD else KONT_2024_GODINA,
        })

    if bez_koordinate:
        raise SystemExit("bez koordinate: %s\nprvo pokreni scripts/geocode.py"
                         % ", ".join(bez_koordinate))

    upisi("pirot_naselja.csv", naselja)

    poznata = {n["naziv"] for n in naselja}
    aliasi = [{"alias": a, "naselje": n, "izvor": i, "napomena": o}
              for a, n, i, o in ALIASI]
    # Plansko pisanje imena ostaje upotrebljivo, jer ga dokumenti i dalje koriste.
    aliasi += [{"alias": pogresno, "naselje": tacno, "izvor": "LPUO",
                "napomena": "pisanje iz LPUO 2021-2031"}
               for pogresno, tacno in ISPRAVKE.items()]
    # Skraćenice iz plana JP Komunalac.
    for stajaliste, naselje, *_ in PLAN_2018:
        if naselje and stajaliste != naselje:
            aliasi.append({"alias": stajaliste, "naselje": naselje, "izvor": "KOMUNALAC",
                           "napomena": "pisanje iz plana iznošenja 2018"})
    for a in aliasi:
        if a["naselje"] not in poznata:
            raise SystemExit("alias %r pokazuje na nepoznato naselje %r" % (a["alias"], a["naselje"]))
    upisi("pirot_naselja_aliasi.csv", aliasi)

    upisi("pirot_odvoz_seoska_naselja_2018.csv", [{
        "redni_broj": i,
        "stajaliste": stajaliste,
        "naselje": naselje or "",
        "je_naselje": "da" if naselje else "ne",
        "odvoz_nedeljno": ned,
        "broj_stanovnika_2011": st if st else "",
        "broj_domacinstava_2011": dom if dom else "",
        "broj_kontejnera_1100l": kont,
        "kontejneri_postavljeni": KONTEJNERI_POSTAVLJENI,
        "izvor": IZVOR,
        "izvor_url": IZVOR_URL,
    } for i, (stajaliste, naselje, ned, st, dom, kont) in enumerate(PLAN_2018, 1)])

    print("naselja: %d (pokriveno %d, sa kontejnerima 2024: %d)" % (
        len(naselja), sum(1 for n in naselja if n["organizovano_prikupljanje"] == "da"),
        sum(1 for n in naselja if n["kontejneri_2024"] == "da")))
    print("aliasi: %d" % len(aliasi))
    print("namerno nerazrešeno: %s" % ", ".join(sorted(NERAZRESENO)))


def upisi(ime, redovi):
    put = os.path.join(DATA, ime)
    with io.open(put, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(redovi[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(redovi)
    print("  %s  %d redova" % (put, len(redovi)))


if __name__ == "__main__":
    main()
