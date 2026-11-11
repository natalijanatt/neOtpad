# -*- coding: utf-8 -*-
"""Merge every source into the Pirot illegal-dump dataset.

Outputs
  data/pirot_divlje_deponije_lokacije.csv     one row per distinct location (master)
  data/pirot_divlje_deponije_opservacije.csv  one row per observation (location x date x source)
"""
import json, math, os, re, sys, unicodedata
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lpuo_table10 import TABELA_10

GEO = json.load(open("raw/geocode_cache.json", encoding="utf-8"))

# Nominatim mis-hits and places it could not resolve, fixed by hand against the plan's own
# descriptions; each is flagged with a coarse geo_preciznost so nothing looks more exact
# than it is.
MANUAL = {
    "Barje":       (43.1460, 22.5813, "ulica"),               # Ul. Timocka, Pirot
    "Zaluzje":     (43.1455, 22.6180, "priblizno_zona"),      # industrial zone / old Nisava bed
    "Crveni Breg": (43.1585, 22.6157, "priblizno_naselje"),   # "cetvrti kilometar", KO Berilovac
    "Belava":      (43.1730, 22.5500, "priblizno_naselje"),   # Gnjilan-Belava slope
    "Pirot":       (43.1528, 22.5860, "centar_grada"),
    # kp 6633/3 KO Pirot-van varos sits next to Kavak (6634/4), i.e. in Prisjansko
    # naselje inside Pirot - NOT the village of Prisjan 9 km to the south.
    "Prisjan":     (43.1390, 22.5885, "priblizno_naselje"),
    "Kompenzacioni bazen": (43.1455, 22.6180, "priblizno_zona"),
}
ALIAS = {"Zaluzje": "Zalužje"}                # ascii key -> cache key
EKOALERT_PLACEHOLDER = (43.1682819, 22.5956678)    # site default, not a real report location
LPUO_URL = "https://sepa.gov.rs/wp-content/uploads/2025/05/LPUO-Pirot.pdf"
SEPA_URL = "https://data.gov.rs/sr/datasets/deponije-sanitarne-nesanitarne-i-divlje/"


def _norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    for a, b in [("đ", "dj"), ("Đ", "Dj")]:
        s = s.replace(a, b)
    return s


def geo(name):
    """(lat, lon, precision) for a place name, or (None, None, 'nepoznato')."""
    key = _norm(name)
    if key in MANUAL:
        return MANUAL[key]
    g = GEO.get(name) or GEO.get(ALIAS.get(key, name))
    if not g:
        return (None, None, "nepoznato")
    street = g.get("osm_type") in ("residential", "tertiary", "secondary", "unclassified",
                                   "living_street", "service")
    return (round(g["lat"], 6), round(g["lon"], 6),
            "ulica" if street else "centroid_naselja")


def dist_m(a, b):
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


def slug(s):
    s = _norm(s)
    for a, b in [("ć", "c"), ("č", "c"), ("š", "s"), ("ž", "z")]:
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


locations, observations = [], []


def add_obs(loc_id, datum, godina, tip, izvor, url, opis, **kw):
    observations.append(dict(location_id=loc_id, datum=datum or "", godina=godina or "",
                             tip_dogadjaja=tip, izvor=izvor, izvor_url=url,
                             opis=re.sub(r"\s+", " ", str(opis or ""))[:400], **kw))


# ------------------------------------------------------- 1. SEPA / NRIZ national registry
LAT, LON = "Geografska širina", "Geografska dužina"
QTY = "Procenjena količina otpada (t)"
AREA = "Procenjena površina smetlišta (m2)"
CLEAN = "Koliko je puta čišćen prostor divlje deponije u toku izveštajne godine?"
REPEAT = "Da li se na istom mestu ponavlja divlje odlaganje otpada?"

sepa = pd.read_csv("raw/sepa/divlje_pirot.csv")
clusters = []  # [lat, lon, [row indexes]] - the registry repeats the same point yearly
for i, r in sepa.iterrows():
    p = (r[LAT], r[LON])
    for c in clusters:
        if dist_m(p, (c[0], c[1])) < 150:
            c[2].append(i)
            break
    else:
        clusters.append([p[0], p[1], [i]])

for n, c in enumerate(sorted(clusters, key=lambda c: (c[0], c[1])), 1):
    rows = sepa.loc[c[2]]
    lid = "SEPA-%02d" % n
    godine = sorted(int(g) for g in rows["Godina"].unique())
    naselja = sorted({str(x).split(",")[0].strip() for x in rows["Naselje"]})
    ponavlja = set(rows[REPEAT])
    mlat, mlon = round(rows[LAT].mean(), 6), round(rows[LON].mean(), 6)
    locations.append(dict(
        location_id=lid,
        naziv="Divlja deponija %s (%.4f, %.4f)" % ("/".join(naselja), mlat, mlon),
        naselje="; ".join(naselja), lat=mlat, lon=mlon,
        geo_preciznost="registarska_tacka",
        katastarska_parcela="", katastarska_opstina="",
        prvi_put_zabelezena=str(min(godine)), poslednji_put_zabelezena=str(max(godine)),
        godine_evidentirana=";".join(str(g) for g in godine), broj_opservacija=len(rows),
        tip_otpada="komunalni (registar ne specificira)",
        povrsina_m2=rows[AREA].max(), zapremina_m3="", kolicina_t=rows[QTY].max(),
        ciscenja_godisnje=";".join(str(int(x)) for x in sorted(set(rows[CLEAN]))),
        ociscena_datum="",
        ponovo_se_stvara="da" if "Da" in ponavlja else "ne",
        status="aktivna (prijavljena i za %d)" % max(godine) if max(godine) >= 2023
               else "nije prijavljena posle %d" % max(godine),
        izvor="SEPA / NRIZ - Registar divljih deponija (data.gov.rs)", izvor_url=SEPA_URL,
        napomena="Prijavu podnosi Gradska uprava grada Pirota. Ista tacka se ponavlja iz "
                 "godine u godinu, pa godine_evidentirana cini vremensku seriju.",
    ))
    for _, r in rows.iterrows():
        add_obs(lid, "", int(r["Godina"]), "godisnja_evidencija", "SEPA/NRIZ", SEPA_URL,
                "%s; %s t; %s m2; ciscenja=%s; ponavlja=%s"
                % (r["Naselje"], r[QTY], r[AREA], r[CLEAN], r[REPEAT]),
                kolicina_t=r[QTY], povrsina_m2=r[AREA], lat=r[LAT], lon=r[LON])

# ------------------------------------------------------- 2. LPUO 2021-2031, Tabela br.10
# place used to geocode each plan row, in the plan's own row order
LPUO_GEO = ["Barje", "Prisjan", "Kavak", "Zaluzje", "Zaluzje", "Zaluzje", "Poljska Ržana",
            "Poljska Ržana", "Crveni Breg", "Gradašnica", "Sarlah", "Belava",
            "Zaluzje", "Trnjana", "Mali Jovanovac", "Veliko Selo", "Krupac", "Izvor",
            "Poljska Ržana"]
for n, (row, place) in enumerate(zip(TABELA_10, LPUO_GEO), 1):
    naziv, lok, kp, ko, m2, m3, nap = row
    lat, lon, prec = geo(place)
    lid = "LPUO-%02d" % n
    locations.append(dict(
        location_id=lid, naziv=naziv, naselje=place,
        lat=lat, lon=lon, geo_preciznost=prec,
        katastarska_parcela=kp, katastarska_opstina=ko,
        prvi_put_zabelezena="2020", poslednji_put_zabelezena="2021",
        godine_evidentirana="2020;2021", broj_opservacija=1,
        tip_otpada="mesoviti; plan navodi da po zapremini preovladjuju gradjevinski otpad i sut",
        povrsina_m2=m2 if m2 else "", zapremina_m3=m3, kolicina_t="",
        ciscenja_godisnje="", ociscena_datum="", ponovo_se_stvara="da",
        status="evidentirana u LPUO 2021-2031",
        izvor="Lokalni plan upravljanja otpadom grada Pirota 2021-2031, Tabela br.10 (str. 72-73)",
        izvor_url=LPUO_URL,
        napomena=("Lokacija po planu: %s." % lok) + ((" " + nap + ".") if nap else ""),
    ))
    add_obs(lid, "", 2020, "popis_u_planu", "LPUO Pirot 2021-2031", LPUO_URL,
            "%s; %s; kp %s KO %s; %s m2; %s m3. %s" % (naziv, lok, kp, ko, m2, m3, nap),
            povrsina_m2=m2 or "", zapremina_m3=m3, lat=lat, lon=lon)

# ------------------------------------------------------- 3. old non-sanitary city dump
STARA_URL = ("https://pirot.rs/index.php/sr/11-latinica/vesti/"
             "8855-u-toku-sanacija-starog-smetlista-od-ekoloskog-problema-do-prostora-za-"
             "industriju-i-solarnu-elektranu")
STARA_KP = ("2130/1,2130/3,2131/2,2132/1,2132/3,2133/2,2134/2,2135/2,2136/1,2137/1,2137/2,"
            "2137/6,2138/1,2139/1,2140,2181/1,2181/4,2181/5,2181/6,2182,2183,2184,2185,2186,"
            "2187,2188,2189,2190/1,2190/4,6568/8,6568/9,6568/23,6568/28,6568/29,6568/30,"
            "6568/32,6568/33,6568/40")
locations.append(dict(
    location_id="STARA-01",
    naziv="Stara nesanitarna gradska deponija (staro gradsko smetliste)",
    naselje="Pirot - industrijska zona / staro korito Nisave",
    lat=43.1470, lon=22.6100, geo_preciznost="priblizno_zona",
    katastarska_parcela=STARA_KP, katastarska_opstina="Pirot",
    prvi_put_zabelezena="pre 2004", poslednji_put_zabelezena="2026",
    godine_evidentirana="2004;2019;2020;2026", broj_opservacija=4,
    tip_otpada="komunalni, bez prethodne pripreme, selekcije i kontrole; dubina sloja oko 10 m",
    povrsina_m2=50000, zapremina_m3=469262, kolicina_t="",
    ciscenja_godisnje="",
    ociscena_datum="u toku (faza 1 do kraja marta 2026, zavrsetak kraj 2026)",
    ponovo_se_stvara="ne", status="u sanaciji",
    izvor="LPUO Pirot 2021-2031 t.6.7 (geodetski snimak jul 2019); Grad Pirot 16.03.2026",
    izvor_url=STARA_URL,
    napomena="V=469.262 m3 na ~5 ha, 38 katastarskih parcela KO Pirot. Idejni projekat "
             "sanacije BMD Bau d.o.o. Beograd, decembar 2019, izabrana varijanta III. "
             "Sanacija 243 mil. RSD ministarstvo + 61 mil. RSD grad; po zavrsetku ~1,5 ha "
             "za industrijsku zonu i solarna elektrana 2,5 MW.",
))
for d, y, t, src, url, op in [
    ("", 2004, "strateski_dokument", "Strateski opstinski akcioni plan Pirota 2004",
     "https://www.pirot.rs/downloads/strategije/SAP_Pirot_SR.pdf",
     "Postojeca deponija u sanaciji, eksploatacioni vek do kraja 2004; neuslovna lokacija "
     "u industrijskoj zoni, u starom koritu reke."),
    ("2019-07", 2019, "geodetski_snimak", "LPUO Pirot 2021-2031 t.6.7", LPUO_URL,
     "Geodetskim snimkom utvrdjena zapremina odlozenog otpada V = 469.262,00 m3, "
     "povrsina ~5 ha, dubina sloja ~10 m."),
    ("2019-12", 2019, "projekat_sanacije", "LPUO Pirot 2021-2031 t.6.7", LPUO_URL,
     "Idejni projekat sanacije i rekultivacije gradskog smetlista, BMD Bau d.o.o. Beograd, "
     "decembar 2019."),
    ("2026-03-16", 2026, "sanacija_u_toku", "Grad Pirot", STARA_URL,
     "U toku sanacija; ~500.000 m3 otpada na preko 5 ha; prva faza do kraja marta 2026, "
     "kompletna sanacija i rekultivacija do kraja 2026."),
]:
    add_obs("STARA-01", d, y, t, src, url, op, lat=43.1470, lon=22.6100)

# ------------------------------------------------------- 4. Eko Alert citizen reports
DUMP_RE = re.compile(r"deponij|smetlišt|đubre|djubre|otpad|šut|smec|smeć",
                     re.I)
PLACE_KEYS = ["Sukovo", "Petrovac", "Izvor", "Zaskovci", "Staničenje", "Barje Čiflik",
              "Prčevac", "Tijabara", "Gradašnica", "Rogoz", "Barje", "Cara Dušana",
              "Svetozara Markovića", "Ustanička", "Nišavski odred",
              "Kompenzacioni bazen"]
def naziv_prijave(r):
    """Report title; some rows carry a URL in the title slot, so use the text instead."""
    t = (r.get("naslov") or "").strip()
    if not t or t.startswith("http") or t in ("/", "//"):
        t = re.sub(r"\s+", " ", r.get("opis", "")).strip()[:70] or "Prijava gradjanina"
    return t


for r in json.load(open("raw/ekoalert/problems.json", encoding="utf-8")):
    txt = "%s %s" % (r.get("naslov", ""), r.get("opis", ""))
    hay = slug("%s %s %s" % (r.get("mesto", ""), r.get("lokacija", ""), txt))
    if not DUMP_RE.search(txt) or "kladovo" in hay:
        continue  # not waste, or outside the Pirot area
    d = r.get("datum", "")
    iso = "%s-%s-%s" % (d[6:10], d[3:5], d[:2]) if re.match(r"\d{2}-\d{2}-\d{4}", d) else ""
    lid = "EKOALERT-%02d" % r["id"]
    lat = lon = None
    prec = "nepoznato"
    m = re.match(r"^\s*(-?\d+[.,]\d+)\s*[,;]\s*(-?\d+[.,]\d+)", str(r.get("koordinate", "")))
    if m:  # accept only coordinates that differ from the site's default placeholder
        la, lo = float(m.group(1).replace(",", ".")), float(m.group(2).replace(",", "."))
        if abs(la - EKOALERT_PLACEHOLDER[0]) > 1e-4 or abs(lo - EKOALERT_PLACEHOLDER[1]) > 1e-4:
            lat, lon, prec = la, lo, "prijava_gradjanina"
    if lat is None and re.search(r"kompezacion|kompenzacion", hay):
        lat, lon, prec = MANUAL["Kompenzacioni bazen"]
    if lat is None and re.search(r"gradasnick|gradašničk", hay):
        lat, lon, prec = geo("Gradašnica")
    if lat is None:
        for key in PLACE_KEYS:
            if slug(key) in hay:
                lat, lon, prec = geo(key)
                break
    locations.append(dict(
        location_id=lid, naziv=naziv_prijave(r),
        naselje=r.get("mesto", ""), lat=lat, lon=lon, geo_preciznost=prec,
        katastarska_parcela="4455" if "4455" in txt else "", katastarska_opstina="",
        prvi_put_zabelezena=iso, poslednji_put_zabelezena=iso,
        godine_evidentirana=iso[:4], broj_opservacija=1,
        tip_otpada=("gradjevinski" if re.search(r"gradjevinsk|građevinsk|šut", txt, re.I)
                    else "plastika/ambalaza" if re.search(r"plastičn|ambalaž", txt, re.I)
                    else "komunalni"),
        povrsina_m2="", zapremina_m3="", kolicina_t="", ciscenja_godisnje="", ociscena_datum="",
        ponovo_se_stvara=("da" if re.search(r"opet|stalno|danima|nedeljama|redovno", txt, re.I)
                          else "nepoznato"),
        status="prijavljeno",
        izvor="Eko Alert - prijava gradjanina", izvor_url=r["url"],
        napomena=re.sub(r"\s+", " ", r.get("opis", ""))[:300],
    ))
    add_obs(lid, iso, iso[:4], "prijava_gradjanina", "Eko Alert", r["url"],
            "%s: %s" % (r.get("naslov", ""), r.get("opis", "")), lat=lat or "", lon=lon or "")

# ------------------------------------------------------- 5. cleanup actions from news
EA = "https://ekoalert.rs/vest-prikaz.php?idVest=%d"
CLEANUPS = [
    ("CIST-01", "Berilovac", "2023-12-31", 2023,
     "U toku 2023. ociscene su dve divlje deponije sa teritorije sela; ocisceno i seosko "
     "groblje i kanal 'vada'; povecan broj kontejnera u saradnji sa JKP Komunalac.",
     "Eko Alert", EA % 131),
    ("CIST-02", "Poljska Ržana", "2023-11-01", 2023,
     "Velika volonterska radna akcija u Poljskoj Rzani.", "Eko Alert", EA % 119),
    ("CIST-03", "Crnoklište", "2023-07-20", 2023,
     "Volonterska akcija u selu Crnokliste.", "Eko Alert", EA % 17),
    ("CIST-04", "Tijabara", "2023-11-01", 2023,
     "Volonterska akcija u Starom Tigrovom naselju.", "Eko Alert", EA % 117),
    ("CIST-05", "Topli Do", "2023-11-04", 2023,
     "Volonterski kamp Topli Do 2023.", "Eko Alert", EA % 120),
    ("CIST-06", "Zaluzje", "2024-04-12", 2024,
     "Pirotski spontani eko aktivizam: gradjanin uklonio divlju deponiju iza starog gradskog "
     "kupalista (kompenzacioni bazen).", "Eko Alert", EA % 249),
    ("CIST-07", "Topli Do", "2024-04-30", 2024,
     "Uredjenje priobalja Toplodolske reke - volonterska akcija uklanjanja otpada sa obale.",
     "Eko Alert", EA % 276),
    ("CIST-08", "Rsovci", "2024-06-18", 2024,
     "Volonterska akcija u staroplaninskom selu Rsovci.", "Eko Alert", EA % 312),
    ("CIST-09", "Veliki Jovanovac", "2024-07-24", 2024,
     "Javni radovi u pirotskom selu Veliki Jovanovac.", "Eko Alert", EA % 348),
    ("CIST-10", "Pirot", "2019-05-29", 2019,
     "Javni radovi 2019: ciscenje divljih deponija, uredjenje Keja pored Nisave, ciscenje "
     "kanala i kanjona Vladikine ploce; 19 ugovora, 51 osoba.", "Grad Pirot",
     "https://pirot.rs/index.php/sr/11-latinica/vesti/4103-javni-radovi-ciscenje-divljih-"
     "deponija-uredenje-keja-pored-nisave-ciscenje-kanala-kanjona-vladikine-ploce"),
    ("CIST-11", "Pirot", "2023-06-15", 2023,
     "Javni radovi 2023 - ekoloske i komunalne akcije na teritoriji grada.",
     "Eko Alert", EA % 6),
]
for lid, place, d, y, opis, src, url in CLEANUPS:
    lat, lon, prec = geo(place)
    locations.append(dict(
        location_id=lid, naziv="Akcija ciscenja - %s" % place, naselje=place,
        lat=lat, lon=lon, geo_preciznost=prec,
        katastarska_parcela="", katastarska_opstina="",
        prvi_put_zabelezena=d, poslednji_put_zabelezena=d,
        godine_evidentirana=str(y), broj_opservacija=1,
        tip_otpada="komunalni", povrsina_m2="", zapremina_m3="", kolicina_t="",
        ciscenja_godisnje="1", ociscena_datum=d, ponovo_se_stvara="nepoznato",
        status="ocisceno", izvor=src, izvor_url=url, napomena=opis,
    ))
    add_obs(lid, d, y, "ciscenje", src, url, opis, lat=lat or "", lon=lon or "")

# ------------------------------------------------------- 6. Prisjan (regional landfill)
PRISJAN_URL = ("https://jkpdeponijapirot.rs/2025/02/05/resavanje-problema-gradevinskog-otpada-"
               "regionalna-deponija-dobija-novo-reciklazno-postrojenje/")
lat, lon, prec = geo("Prisjan")
locations.append(dict(
    location_id="PRISJAN-01", naziv="Divlje smetliste Prisjan (gradjevinski otpad)",
    naselje="Prisjan", lat=lat, lon=lon, geo_preciznost=prec,
    katastarska_parcela="6633/3", katastarska_opstina="Pirot-van varos",
    prvi_put_zabelezena="2020", poslednji_put_zabelezena="2025",
    godine_evidentirana="2020;2025", broj_opservacija=2,
    tip_otpada="gradjevinski otpad i sut",
    povrsina_m2=28801, zapremina_m3="", kolicina_t="",
    ciscenja_godisnje="", ociscena_datum="", ponovo_se_stvara="da",
    status="planirana sanacija / zatvaranje",
    izvor="JKP Regionalna deponija Pirot, 05.02.2025", izvor_url=PRISJAN_URL,
    napomena="Dugogodisnje neuredjeno odlagaliste gradjevinskog otpada; plan zatvaranja i "
             "sanacije u saradnji Regionalne deponije i Gradske uprave. Odgovara LPUO "
             "lokaciji 'Prisjansko naselje Strelište' (LPUO-02, kp 6633/3 KO Pirot-van varos).",
))
add_obs("PRISJAN-01", "2025-02-05", 2025, "najava_sanacije", "JKP Regionalna deponija Pirot",
        PRISJAN_URL,
        "Prisjan identifikovan kao neuredjeno odlagaliste koje se planira zatvoriti i "
        "sanirati; gradi se postrojenje za reciklazu gradjevinskog otpada.", lat=lat, lon=lon)

# ------------------------------------------------------- write
# The registry has coordinates but no names; the plan has names, parcels and volumes but no
# coordinates. Link a location to the nearest record from a *different* source so the two
# can be joined. 600 m is generous on purpose - it is a candidate link, not an identity.
def cross_link(recs, radius_m=600):
    for a in recs:
        if a["lat"] is None or pd.isna(a["lat"]):
            a["povezano_sa"] = ""
            a["povezano_rastojanje_m"] = ""
            continue
        src_a = a["location_id"].split("-")[0]
        best = None
        for b in recs:
            if b is a or b["location_id"].split("-")[0] == src_a:
                continue
            if b["lat"] is None or pd.isna(b["lat"]):
                continue
            d = dist_m((a["lat"], a["lon"]), (b["lat"], b["lon"]))
            if d <= radius_m and (best is None or d < best[1]):
                best = (b["location_id"], d)
        a["povezano_sa"] = best[0] if best else ""
        a["povezano_rastojanje_m"] = round(best[1]) if best else ""


cross_link(locations)
for r in locations:
    r["grad"] = "Pirot"

COLS = ["location_id", "naziv", "naselje", "grad", "lat", "lon", "geo_preciznost",
        "katastarska_parcela", "katastarska_opstina", "prvi_put_zabelezena",
        "poslednji_put_zabelezena", "godine_evidentirana", "broj_opservacija",
        "tip_otpada", "povrsina_m2", "zapremina_m3", "kolicina_t", "ciscenja_godisnje",
        "ociscena_datum", "ponovo_se_stvara", "status", "povezano_sa",
        "povezano_rastojanje_m", "izvor", "izvor_url", "napomena"]
loc = pd.DataFrame(locations)[COLS]
loc.to_csv("data/pirot_divlje_deponije_lokacije.csv", index=False, encoding="utf-8-sig")

OCOLS = ["location_id", "datum", "godina", "tip_dogadjaja", "lat", "lon", "povrsina_m2",
         "zapremina_m3", "kolicina_t", "izvor", "izvor_url", "opis"]
obs = pd.DataFrame(observations)
for c in OCOLS:
    if c not in obs:
        obs[c] = ""
obs = obs[OCOLS].sort_values(["godina", "location_id"], kind="stable")
obs.to_csv("data/pirot_divlje_deponije_opservacije.csv", index=False, encoding="utf-8-sig")

print("lokacije: %d redova" % len(loc))
print(loc.groupby("izvor").size().to_string())
print("\nopservacije: %d redova" % len(obs))
print(obs.groupby("tip_dogadjaja").size().to_string())
print("\nsa koordinatama: %d/%d" % (loc["lat"].notna().sum(), len(loc)))
print(loc.groupby("geo_preciznost").size().to_string())
