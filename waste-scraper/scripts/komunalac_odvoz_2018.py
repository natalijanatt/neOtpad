# -*- coding: utf-8 -*-
"""„План изношења смећа из сеоских насеља“ - JP „Komunalac“ Pirot, Program poslovanja
za 2018, str. 9 (raw/pdf/PROGRAM_POSLOVANJA-2018.pdf).

URL: http://www.komunalacpirot.rs/wp-content/uploads/PROGRAM_POSLOVANJA-2018.pdf

Ovo je jedini objavljeni spisak sela u koja JP Komunalac izvozi smeće. LPUO navodi samo
zbir - „3.688 домаћинстава у 31 насељима“ - a ova tabela ima tačno 31 red, pa je broj iz
plana broj redova ove tabele.

Osam redova nisu naselja nego stajališta (manastir, planinarski dom, „4. kilometar“, put
oko Zavojskog jezera). Zato se pokrivenost ne sme računati kao „31 od 72 naselja“:
naselja je 23.

Kolone su plan-ove: broj iznošenja nedeljno, popis 2011 (stanovnici, domaćinstva), broj
kontejnera 1,1 m3 i godina postavljanja. Brojevi stanovnika svakog reda padaju tačno u
kategoriju u koju je LPUO svrstao to naselje, čime je uparivanje kolona provereno - PDF
ime i brojeve drži u odvojenim tekstualnim tokovima, pa se redosled morao potvrditi.

Brojevi domaćinstava su popisni, ne broj korisnika usluge: njihov zbir je 4.564, dok LPUO
kaže da se usluga pruža za 3.688 domaćinstava.
"""

# stajaliste, naselje (None = nije naselje), odvoz_nedeljno, stanovnika_2011,
# domacinstava_2011, kontejnera_1100l
PLAN_2018 = [
    ("Temska",                               "Temska",           2, 707,  289, 21),
    ("Rasnica",                              "Rasnica",          2, 323,  113, 10),
    ("Barje Čiflik",                         "Barje Čiflik",     2, 593,  212, 16),
    ("Blato",                                "Blato",            2, 573,  222, 12),
    ("Kostur",                               "Kostur",           2, 241,  101, 8),
    ("Sukovo",                               "Sukovo",           2, 657,  247, 13),
    ("Belo Polje",                           None,               2, None, None, 7),
    ("Držina",                               "Držina",           2, 381,  132, 8),
    ("Gornja Držina",                        "Gornja Držina",    2, 28,   14,  1),
    ("Sukovski Manastir",                    None,               2, None, None, 1),
    ("Komje",                                None,               2, None, None, 2),
    ("Gnjilan",                              "Gnjilan",          3, 2503, 802, 28),
    ("Gradašnica",                           "Gradašnica",       3, 363,  126, 11),
    ("Izvor",                                "Izvor",            2, 734,  243, 14),
    ("Krupac",                               "Krupac",           2, 1301, 441, 28),
    ("Naselje Sveti Jovan",                  None,               2, None, None, 2),
    ("Veliko selo",                          "Veliko Selo",      2, 276,  113, 9),
    ("M. Jovanovac",                         "Mali Jovanovac",   2, 116,  47,  4),
    ("V. Jovanovac",                         "Veliki Jovanovac", 2, 335,  132, 7),
    ("Trnjana",                              "Trnjana",          2, 143,  62,  4),
    ("Poljska Ržana",                        "Poljska Ržana",    2, 1268, 421, 30),
    ("Berilovac",                            "Berilovac",        2, 1189, 564, 15),
    ("Dojkinci",                             "Dojkinci",         1, 174,  105, 8),
    ("Rsovci",                               "Rsovci",           1, 114,  66,  4),
    ("Vrelo",                                None,               1, None, None, 6),
    ("Височка ржана",                        "Visočka Ržana",    1, 32,   25,  3),
    ("Planinarski dom",                      None,               1, None, None, 2),
    ("Brlog",                                "Brlog",            1, 44,   36,  4),
    ("4.kilometar",                          None,               1, None, None, 5),
    ("Jelovica",                             "Jelovica",         1, 88,   51,  3),
    ("Put ka Zavojskom jezeru i oko jezera", None,               1, None, None, 21),
]

IZVOR = "JP Komunalac Pirot, Program poslovanja za 2018, str. 9"
IZVOR_URL = "http://www.komunalacpirot.rs/wp-content/uploads/PROGRAM_POSLOVANJA-2018.pdf"
GODINA_IZVORA = 2018
KONTEJNERI_POSTAVLJENI = 2013

# Grad nije u ovoj tabeli - ona pokriva sela. Gradsku pokrivenost daje cenovnik za 2026,
# koji nabraja 19 gradskih mesnih zajednica sa njihovim ulicama i naplaćuje odvoženje
# smeća po Tarifi 1.
GRAD_IZVOR = "JP Komunalac Pirot, Cenovnik za 2026 (19 gradskih mesnih zajednica, Tarifa 1)"
GRAD_IZVOR_URL = "http://www.komunalacpirot.rs/wp-content/uploads/CENOVNIK-2026-potpisan.pdf"


def pokrivena_naselja():
    """Imena naselja iz plana - 23 od 31 reda."""
    return [naselje for _, naselje, *_ in PLAN_2018 if naselje]


if __name__ == "__main__":
    print("redova: %d, naselja: %d" % (len(PLAN_2018), len(pokrivena_naselja())))
    print("domaćinstava (popis 2011): %d" % sum(r[4] or 0 for r in PLAN_2018))
