# -*- coding: utf-8 -*-
"""Spisak naselja grada Pirota iz LPUO 2021-2031 (raw/pdf/LPUO-Pirot.pdf, str. 117).

Plan naselja svrstava u četiri kategorije po broju stanovnika iz popisa 2011, i to je
jedini spisak svih naselja grada koji postoji u nekom od prikupljenih dokumenata.
Transkribovano verbatim iz tekstualnog sloja PDF-a, ćirilica preslovljena u latinicu.

Tri imena su u planu pogrešno napisana. Ispravke nisu pretpostavka - proverene su
geokodiranjem (pogrešan oblik ne postoji u OSM-u, ispravan daje naselje unutar Grada
Pirota) i, za Cerev Del, popisom 2022. Oba oblika ulaze u bazu: ispravan kao naziv,
planski kao alias, da bi svaki dokument koji koristi plansko pisanje i dalje pogađao
naselje.
"""

# kategorija -> naselja, redosledom kojim ih plan navodi
KATEGORIJE = {
    # preko 1.000 stanovnika
    "I": ["Berilovac", "Gnjilan", "Krupac", "Novi Zavoj", "Poljska Ržana"],
    # 100-1.000 stanovnika
    "II": [
        "Bazovik", "Barje Čiflik", "Blato", "Veliki Jovanovac", "Veliki Suvodol",
        "Veliko Selo", "Vojnegovac", "Vranište", "Gradašnica", "Dojkinci", "Držina",
        "Izvor", "Kostur", "Mali Jovanovac", "Mali Suvodol", "Obrenovac", "Petrovac",
        "Ponor", "Ragodeš", "Rasnica", "Rsovci", "Rudinje", "Sopot", "Srećkovac",
        "Staničenje", "Sukovo", "Temska", "Trnjana", "Cerova", "Crnoklište",
        "Činiglavci",
    ],
    # manje od 100 stanovnika
    "III": [
        "Bela", "Brlog", "Visoka Ržana", "Vlasi", "Gornja Držina", "Gostuša",
        "Gradište", "Dobri Do", "Zaskovci", "Jalbotina", "Jelovica", "Kamik",
        "Koprivštica", "Nišor", "Oreovica", "Orlja", "Osmakova", "Pakleštica",
        "Pasjač", "Pokrvenik", "Prisjan", "Rosomač", "Sinja Glava", "Slavinja",
        "Topli Do", "Carev Del", "Crvenčevo", "Šugrin",
    ],
    # manje od 10 stanovnika
    "IV": ["Basara", "Berovica", "Velika Lukanja", "Kumanovo", "Milojkovac",
           "Mirkovci", "Planinica"],
}

# plansko pisanje -> stvarno ime naselja
ISPRAVKE = {
    "Visoka Ržana": "Visočka Ržana",   # OSM: Височка Ржана, Град Пирот
    "Pokrvenik": "Pokrevenik",         # OSM: Покревеник; isto piše i cenovnik JP Komunalac (ul. Покревеничка)
    "Carev Del": "Cerev Del",          # OSM i popis 2022: Церев Дел, MZ Prisjan
}

# Grad je u planu obrađen odvojeno od sela, pa ga nijedna kategorija ne sadrži.
GRAD = "Pirot"


def sva_naselja():
    """[(naziv, naziv_u_planu, kategorija)] - 72 naselja, grad prvi."""
    redovi = [(GRAD, GRAD, "grad")]
    for kategorija, imena in KATEGORIJE.items():
        for ime in imena:
            redovi.append((ISPRAVKE.get(ime, ime), ime, kategorija))
    return redovi


if __name__ == "__main__":
    for naziv, u_planu, kat in sva_naselja():
        oznaka = "" if naziv == u_planu else "  (plan: %s)" % u_planu
        print("%-4s %s%s" % (kat, naziv, oznaka))
