# -*- coding: utf-8 -*-
"""Scrape ekoalert.rs eko-problem reports (idProblem=1..N) into JSON."""
import json, re, sys, time
import requests
from bs4 import BeautifulSoup

BASE = "https://ekoalert.rs/ekoproblem-prikaz.php?idProblem={}"
HDRS = {"User-Agent": "Mozilla/5.0 (research; hackathon open-data)"}
LABELS = ["Autor", "Datum", "Grad", "Mesto", "Lokacija", "Koordinate"]


def parse(html, pid):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "nav", "header", "footer"]):
        t.decompose()
    txt = soup.get_text("|", strip=True)
    txt = re.sub(r"(\|\s*)+", "|", txt)
    parts = [p.strip() for p in txt.split("|")]
    rec = {"id": pid, "url": BASE.format(pid)}
    for i, p in enumerate(parts):
        if p in LABELS and i + 1 < len(parts):
            nxt = parts[i + 1]
            rec[p.lower()] = "" if nxt in LABELS else nxt
    # title + description = the two entries after the Koordinate value block
    try:
        k = parts.index("Koordinate")
        tail = [p for p in parts[k + 1:] if p and p not in LABELS]
        # drop the coordinate value itself if it looks like coords
        if tail and re.match(r"^-?\d+\.\d+\s*,?\s*-?\d+\.\d+$", tail[0]):
            rec["koordinate"] = tail.pop(0)
        cut = next((i for i, p in enumerate(tail) if p.startswith("Pozovite nas")), len(tail))
        tail = tail[:cut]
        rec["naslov"] = tail[0] if tail else ""
        rec["opis"] = " ".join(tail[1:]) if len(tail) > 1 else ""
    except ValueError:
        pass
    imgs = [i.get("src") for i in BeautifulSoup(html, "html.parser").select("img") if i.get("src")]
    rec["slike"] = [s for s in imgs if "logo" not in s.lower() and "assets/images" not in s]
    return rec


def main(maxid=80):
    out = []
    for pid in range(1, maxid + 1):
        try:
            r = requests.get(BASE.format(pid), headers=HDRS, timeout=25)
        except Exception as e:
            print(f"{pid}: ERR {e}", file=sys.stderr); continue
        if r.status_code != 200:
            print(f"{pid}: HTTP {r.status_code}", file=sys.stderr); continue
        r.encoding = "utf-8"
        open(f"raw/ekoalert/problem_{pid}.html", "w", encoding="utf-8").write(r.text)
        rec = parse(r.text, pid)
        if rec.get("datum") or rec.get("naslov"):
            out.append(rec)
            print(f"{pid}: {rec.get('datum','?')} | {rec.get('mesto','?')} | {rec.get('naslov','')[:60]}")
        else:
            print(f"{pid}: (empty)", file=sys.stderr)
        time.sleep(0.4)
    json.dump(out, open("raw/ekoalert/problems.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(f"\nSaved {len(out)} records -> raw/ekoalert/problems.json")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 80)
