# -*- coding: utf-8 -*-
"""Raspored pražnjenja plavih kanti JP „Komunalac“ Pirot za 2026.

URL: https://www.komunalacpirot.rs/raspored-praznjenja-plavih-kanti-2026-godina/
Piše: data/pirot_raspored_plave_kante_2026.csv

Stranica je spisak od ~200 ulica i naselja, gde svako ime vodi na sliku sa kalendarom za
2026. Dan i ritam nisu u tekstu - stoje na slici („SVAKI DRUGI PONEDELJAK“, sa označenim
datumima). Zato je mapa slika -> (dan, ritam, datum) ovde prepisana ručno, a skript
proverava da svaka slika sa stranice postoji u toj mapi: ako Komunalac doda grupu,
skript stane umesto da je prećuti.

Dve stvari koje ovaj raspored govori, a nijedan drugi izvor ne kaže:
  - plava kanta je suvi reciklabilni otpad osim stakla (LPUO 2021-2031, t. 6.6.1),
    pa ovo nije raspored odnošenja mešanog komunalnog otpada;
  - grad dobija plavu kantu svake druge nedelje, a Selo Izvor i Selo Krupac svake
    četvrte - upola ređe.
"""
import csv
import io
import os
import re
import sys
import urllib.parse
from html import unescape

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_naselja import norm  # noqa: E402

URL = "https://www.komunalacpirot.rs/raspored-praznjenja-plavih-kanti-2026-godina/"
HDRS = {"User-Agent": "pirot-waste-hackathon/1.0 (open data research)",
        "Accept": "text/html,application/xhtml+xml"}
RAW = "raw/komunalac"
DATA = "data"
IZVOR = "JP Komunalac Pirot, Raspored pražnjenja plavih kanti 2026"

# slika -> (dan u nedelji, ciklus u danima, prvi odvoz u 2026)
# Prepisano sa kalendara na svakoj slici; referentni datum je prvi označeni dan u januaru.
GRUPE = {
    "ponedeljak-1-26": (1, 14, "2026-01-12"),
    "ponedeljak-2-26": (1, 14, "2026-01-05"),
    "utorak-1-26":     (2, 14, "2026-01-13"),
    "utorak-2-26":     (2, 14, "2026-01-06"),
    "sreda-1-26":      (3, 14, "2026-01-14"),
    "sreda-2-26":      (3, 14, "2026-01-07"),
    # „SVAKE ČETVRTE SREDE“ - jedina grupa sa ciklusom od 28 dana, i jedina koja su sela
    "sreda-3-26-1":    (3, 28, "2026-01-14"),
    "četvrtak_1_262":  (4, 14, "2026-01-01"),
    "četvrtak-2-26":   (4, 14, "2026-01-08"),
    "petak-1-26":      (5, 14, "2026-01-02"),
    "petak-2-26":      (5, 14, "2026-01-09"),
}


def preuzmi():
    os.makedirs(RAW, exist_ok=True)
    kes = os.path.join(RAW, "raspored_plave_kante_2026.html")
    if not os.path.exists(kes):
        r = requests.get(URL, headers=HDRS, timeout=40)
        r.raise_for_status()
        io.open(kes, "w", encoding="utf-8").write(r.text)
    return io.open(kes, encoding="utf-8").read()


def ucitaj_naselja():
    """(naziv po normalizovanom imenu, ukljucujuci aliase)"""
    po_imenu = {}
    with io.open(DATA + "/pirot_naselja.csv", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            po_imenu[norm(r["naziv"])] = r["naziv"]
    with io.open(DATA + "/pirot_naselja_aliasi.csv", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            po_imenu.setdefault(norm(r["alias"]), r["naselje"])
    return po_imenu


def main():
    html = preuzmi()
    telo = html[html.find("entry-content"):]
    telo = telo[:telo.find("</div>", telo.find("</p>"))]
    parovi = [(urllib.parse.unquote(slika), unescape(re.sub(r"<[^>]+>", "", ime)).strip())
              for slika, ime in re.findall(
                  r'<a href="[^"]*/uploads/([^"]+?)\.png">(.*?)</a>', telo, re.S)]

    nepoznate = {s for s, _ in parovi} - set(GRUPE)
    if nepoznate:
        raise SystemExit("nova grupa na stranici, dan i ritam se moraju pročitati sa slike: %s"
                         % ", ".join(sorted(nepoznate)))

    naselja = ucitaj_naselja()
    redovi, neprepoznate = [], []
    for slika, ime in parovi:
        dan, ciklus, datum = GRUPE[slika]
        naselje = naselja.get(norm(ime))
        if naselje is None:
            # Spisak je pretežno pirotskih ulica; ime koje nije naselje je ulica u gradu.
            # Ono što nije ni jedno ni drugo ide u napomenu, ne u tišinu.
            neprepoznate.append(ime)
        redovi.append({
            "zona": "" if naselje and norm(naselje) == norm(ime) else ime,
            "naselje": naselje or "Pirot",
            # Plava kanta je suvi reciklabilni otpad osim stakla (LPUO t. 6.6.1).
            # Kolona stoji u fajlu da bi raspored za zelenu kantu, kad se nađe,
            # ušao istim putem umesto da tip bude zakucan u importeru.
            "tip_otpada": "suvi_reciklabilni",
            "dan_u_nedelji": dan,
            "ciklus_dana": ciklus,
            "referentni_datum": datum,
            "grupa": slika,
            "izvor": IZVOR,
            "izvor_url": URL,
            "napomena": "" if naselje else "ulica ili deo grada Pirota",
        })

    redovi.sort(key=lambda r: (r["naselje"], r["dan_u_nedelji"], r["zona"]))
    put = os.path.join(DATA, "pirot_raspored_plave_kante_2026.csv")
    with io.open(put, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(redovi[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(redovi)

    print("%s  %d redova" % (put, len(redovi)))
    print("vezano za naselje: %d, ulica u gradu: %d"
          % (len(redovi) - len(neprepoznate), len(neprepoznate)))
    for naselje in sorted({r["naselje"] for r in redovi if r["naselje"] != "Pirot"}):
        print("  %s" % naselje)


if __name__ == "__main__":
    main()
