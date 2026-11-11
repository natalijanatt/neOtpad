# -*- coding: utf-8 -*-
"""Scrape ekoalert.rs news (vest-prikaz.php?idVest=N), keep waste-related ones."""
import json, re, sys
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup

BASE = "https://ekoalert.rs/vest-prikaz.php?idVest={}"
HDRS = {"User-Agent": "Mozilla/5.0 (research; hackathon open-data)"}
KW = re.compile(r"deponij|smetlišt|smetlist|otpad|smeć|smec|đubre|djubre|kontejner|"
                r"šut|sut|čišćenj|ciscenj|akcij|zagađ|zagad", re.I)


def one(vid):
    try:
        r = requests.get(BASE.format(vid), headers=HDRS, timeout=25)
        if r.status_code != 200:
            return None
        r.encoding = "utf-8"
        soup = BeautifulSoup(r.text, "html.parser")
        for t in soup(["script", "style", "nav", "header", "footer"]):
            t.decompose()
        txt = re.sub(r"(\|\s*)+", "|", soup.get_text("|", strip=True))
        parts = [p.strip() for p in txt.split("|") if p.strip()]
        rec = {"idVest": vid, "url": BASE.format(vid)}
        LBL = ("Autor", "Datum", "Organizacija", "Lokacija", "Link")
        for i, p in enumerate(parts):
            if p in LBL and i + 1 < len(parts) and parts[i + 1] not in LBL:
                rec[p.lower()] = parts[i + 1]
        # title/body start right after the "Link" label (its value, if any, is a URL)
        try:
            k = parts.index("Link")
        except ValueError:
            k = max((i for i, p in enumerate(parts) if p == "Datum"), default=-1) + 1
        tail = parts[k + 1:]
        if tail and re.match(r"^(https?://|www\.)", tail[0]):
            rec["link"] = tail.pop(0)
        else:
            rec.pop("link", None)
        cut = next((i for i, p in enumerate(tail) if p.startswith("Pozovite nas")), len(tail))
        tail = tail[:cut]
        rec["naslov"] = tail[0] if tail else ""
        rec["tekst"] = " ".join(tail[1:])
        if not rec.get("datum") and not rec["naslov"]:
            return None
        return rec
    except Exception:
        return None


def main(maxid):
    with ThreadPoolExecutor(max_workers=8) as ex:
        recs = [r for r in ex.map(one, range(1, maxid + 1)) if r]
    json.dump(recs, open("raw/ekoalert/news_all.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    hits = [r for r in recs if KW.search(r["naslov"] + " " + r["tekst"])]
    json.dump(hits, open("raw/ekoalert/news_waste.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(f"total={len(recs)} waste-related={len(hits)}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 600)
