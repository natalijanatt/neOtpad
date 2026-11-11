# -*- coding: utf-8 -*-
"""Geocode Pirot-area place names via OSM Nominatim, with an on-disk cache."""
import json, os, sys, time
import requests

CACHE = "raw/geocode_cache.json"
URL = "https://nominatim.openstreetmap.org/search"
HDRS = {"User-Agent": "pirot-waste-hackathon/1.0 (open data research)"}
# bounding box around the City of Pirot territory
VIEWBOX = "22.28,43.45,23.10,42.95"


def load():
    return json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}


def geocode(name, cache=None):
    cache = load() if cache is None else cache
    if name in cache:
        return cache[name]
    params = {"q": f"{name}, Pirot, Srbija", "format": "jsonv2", "limit": 1,
              "countrycodes": "rs", "viewbox": VIEWBOX, "bounded": 1}
    try:
        r = requests.get(URL, params=params, headers=HDRS, timeout=25)
        js = r.json()
    except Exception:
        js = []
    if not js:  # retry unbounded, still restricted to Serbia
        try:
            r = requests.get(URL, params={"q": f"{name}, Pirot, Srbija", "format": "jsonv2",
                                          "limit": 1, "countrycodes": "rs"},
                             headers=HDRS, timeout=25)
            js = r.json()
        except Exception:
            js = []
    res = ({"lat": float(js[0]["lat"]), "lon": float(js[0]["lon"]),
            "display_name": js[0]["display_name"], "osm_type": js[0].get("type", "")}
           if js else None)
    cache[name] = res
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    time.sleep(1.1)  # Nominatim usage policy: max 1 req/s
    return res


if __name__ == "__main__":
    names = [l.strip() for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
    c = load()
    for n in names:
        r = geocode(n, c)
        print(f"{n}\t{r['lat'] if r else ''}\t{r['lon'] if r else ''}\t{(r or {}).get('display_name','NOT FOUND')[:70]}")
