# -*- coding: utf-8 -*-
"""„Spisak sela u kojima su postavljeni kontejneri“ - JP „Komunalac“ Pirot, godišnji
izveštaj o poslovanju za 2024.

URL: (nije upisan - dokument je unakrsno pročitan van ovog repozitorijuma; pre nego što
se na ovu tabelu pozove bilo šta javno, URL i strana idu ovde i u IZVORI.md)

Šest godina noviji pogled na isto pitanje od plana iznošenja iz 2018
(`komunalac_odvoz_2018.py`), i bitno širi: tabela navodi 53 lokacije i ukupno 518
kontejnera u selima.

Tri stvari zbog kojih se iz nje NE sme čitati „53 od 71 sela“:

1. **Nisu sve lokacije naselja.** Kao i 2018, tabela meša sela i stajališta - Zavojsko
   jezero, Planinarski dom, Sukovski manastir, Sopotska petlja, „4. kilometar“, auto-put
   za Dimitrovgrad. Spisak stajališta ispod je primer iz unakrsnog čitanja, ne potpun
   prepis tabele.
2. **Belo Polje je u tabeli sa 11 kontejnera, a u trenutku izveštaja nije bilo zasebno
   zvanično naseljeno mesto** - Grad Pirot je tek 2025. pokrenuo inicijativu da mu se taj
   status odredi. Red postoji, naselje (još) ne.
3. **Odsustvo iz tabele nije odsustvo usluge.** Tabela govori isključivo o postavljenim
   zajedničkim kontejnerima. Isti izveštaj navodi da JP Komunalac ima i tri specijalna
   vozila za iznošenje otpada iz kanti, pa deo stanovništva može biti u sistemu i bez
   kontejnera. Zato ovaj modul daje `kontejneri_2024`, a NE dira
   `organizovano_prikupljanje`: to su dva različita tvrđenja.

Unakrsno sa zvaničnim spiskom od 72 naselja: 42 naselja su eksplicitno u tabeli, 29 nisu.
Ovde se prepisuje negativna strana - imena kojih u tabeli nema - jer je to ono što je iz
unakrsnog čitanja pouzdano poznato; pozitivnih 42 se izvodi oduzimanjem. Brojevi
kontejnera po selu nisu preuzeti, samo zbir.

Napomena o pisanju: unakrsno čitanje je dalo „Pokrovenik“; naselje se zove Pokrevenik
(`lpuo_naselja.ISPRAVKE`, OSM: Покревеник), pa ovde stoji zvanično ime.
"""

IZVOR = "JP Komunalac Pirot, Godišnji izveštaj o poslovanju za 2024 („Spisak sela u kojima su postavljeni kontejneri“)"
IZVOR_URL = ""
GODINA_IZVORA = 2024

# Zbirne brojke iz tabele.
BROJ_LOKACIJA = 53
UKUPNO_KONTEJNERA = 518

# Lokacije iz tabele koje nisu zvanična naseljena mesta. Primeri iz unakrsnog čitanja,
# ne potpun prepis - zato se broj naselja u tabeli ne računa kao 53 minus dužina ove
# liste, nego iz spiska imena ispod.
NIJE_NASELJE = [
    ("Zavojsko jezero", ""),
    ("Planinarski dom", ""),
    ("Sukovski manastir", ""),
    ("Sopotska petlja", ""),
    ("4. kilometar", ""),
    ("Auto-put za Dimitrovgrad", ""),
    ("Belo Polje", "11 kontejnera u tabeli; u trenutku izveštaja nije zasebno zvanično "
                   "naseljeno mesto - Grad Pirot je 2025. pokrenuo inicijativu za taj status"),
]

# Zvanična naseljena mesta grada Pirota kojih u tabeli NEMA (29 od 71 sela).
# „Nema kontejnere“ - ne „nema uslugu“; vidi tačku 3 u docstring-u.
BEZ_KONTEJNERA_2024 = [
    "Bazovik", "Basara", "Bela", "Berovica", "Velika Lukanja", "Gostuša", "Gradište",
    "Dobri Do", "Zaskovci", "Jalbotina", "Kamik", "Kumanovo", "Milojkovac", "Mirkovci",
    "Novi Zavoj", "Obrenovac", "Oreovica", "Orlja", "Pasjač", "Planinica", "Pokrevenik",
    "Prisjan", "Ragodeš", "Rosomač", "Rudinje", "Sinja Glava", "Topli Do", "Cerev Del",
    "Šugrin",
]


def sa_kontejnerima(sva_imena, grad):
    """Naselja koja tabela navodi - sve osim grada i spiska bez kontejnera.

    `sva_imena` je zvanični spisak naselja; grad se izuzima jer je tabela o selima.
    """
    bez = set(BEZ_KONTEJNERA_2024)
    nepoznato = bez - set(sva_imena)
    if nepoznato:
        raise SystemExit("BEZ_KONTEJNERA_2024 pominje imena kojih nema u spisku naselja: %s"
                         % ", ".join(sorted(nepoznato)))
    return [ime for ime in sva_imena if ime != grad and ime not in bez]


if __name__ == "__main__":
    from lpuo_naselja import GRAD, sva_naselja

    imena = [naziv for naziv, _, _ in sva_naselja()]
    sa = sa_kontejnerima(imena, GRAD)
    print("naselja ukupno: %d (grad + %d sela)" % (len(imena), len(imena) - 1))
    print("sa kontejnerima 2024: %d, bez: %d" % (len(sa), len(BEZ_KONTEJNERA_2024)))
    print("lokacija u tabeli: %d, kontejnera: %d" % (BROJ_LOKACIJA, UKUPNO_KONTEJNERA))
