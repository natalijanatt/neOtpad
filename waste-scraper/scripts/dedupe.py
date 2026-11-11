# -*- coding: utf-8 -*-
"""Group the merged locations into physical sites.

The same dump is often present several times: the city reports it to the NRIZ registry AND
lists it in its own waste plan, citizens report the same corner years apart, and the
registry itself contains a coordinate typo. This assigns every row a `kanonski_id` without
deleting anything, so provenance survives and any merge can be undone by filtering on
`spajanje_pouzdanost`.

Run after build_dataset.py. Adds three columns to the locations CSV and writes
data/pirot_divlje_deponije_kanonske.csv - one row per physical site.
"""
import math
import pandas as pd

LOK = "data/pirot_divlje_deponije_lokacije.csv"
OBS = "data/pirot_divlje_deponije_opservacije.csv"
OUT = "data/pirot_divlje_deponije_kanonske.csv"

# How good a coordinate is, best first - decides which one the canonical row keeps.
PREC_RANK = ["registarska_tacka", "prijava_gradjanina", "ulica", "priblizno_zona",
             "priblizno_naselje", "centroid_naselja", "centar_grada", "nepoznato"]

# Merges that the sources themselves document. Not guesses.
CERTAIN = [
    (("SEPA-10", "SEPA-11"),
     "Registar: ista sirina 43.1481, duzina 22.5761 (2019-21) pa 22.5716 (2022-24) - "
     "zamenjene cifre. Ista povrsina 50 m2, nizovi godina se nadovezuju, a Pirot prijavljuje "
     "tacno 10 lokacija svake godine 2019-2024."),
    (("LPUO-02", "PRISJAN-01"),
     "Isto mesto pod dva imena: LPUO 'Prisjansko naselje Strelište' kp 6633/3 KO "
     "Pirot-van varos = 'Prisjan' iz saopstenja Regionalne deponije."),
    (("LPUO-07", "LPUO-08"),
     "Plan navodi dva reda na istoj katastarskoj parceli 3785/1 KO Poljska Rzana, iste "
     "povrsine 369.626 m2, sa razlicitim zapreminama (275 i 100 m3)."),
    (("EKOALERT-19", "EKOALERT-48"),
     "Obe prijave imenuju istu raskrsnicu Cara Dusana i Obiliceve, 2023. i 2026. - "
     "isto mesto posle tri godine, ne dve lokacije."),
]

# Registry point <-> plan entry, merged only when each is the other's nearest match.
# Mutual-nearest keeps one plan entry from swallowing several registry points.
CROSS_SOURCE_RADIUS_M = 800


def dist_m(a, b):
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


class Union:
    def __init__(self, ids):
        self.p = {i: i for i in ids}
        self.why = {}

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def join(self, a, b, pouzdanost, razlog):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra
        for k in (a, b):
            prev = self.why.get(k)
            # keep the strongest justification a row was merged under
            if prev is None or (prev[0] == "srednja" and pouzdanost == "visoka"):
                self.why[k] = (pouzdanost, razlog)


def main():
    l = pd.read_csv(LOK)
    u = Union(list(l.location_id))

    for ids, razlog in CERTAIN:
        for other in ids[1:]:
            u.join(ids[0], other, "visoka", razlog)

    sepa = l[l.location_id.str.startswith("SEPA-")]
    lpuo = l[l.location_id.str.startswith("LPUO-")]

    def nearest(row, frame):
        best = None
        for _, o in frame.iterrows():
            d = dist_m((row.lat, row.lon), (o.lat, o.lon))
            if best is None or d < best[0]:
                best = (d, o.location_id)
        return best

    near_lpuo = {r.location_id: nearest(r, lpuo) for _, r in sepa.iterrows()}
    near_sepa = {r.location_id: nearest(r, sepa) for _, r in lpuo.iterrows()}
    for sid, (d, lid) in near_lpuo.items():
        if d <= CROSS_SOURCE_RADIUS_M and near_sepa[lid][1] == sid:
            u.join(sid, lid, "srednja",
                   "Uzajamno najblizi par registar<->plan na %d m; isti prijavljivac "
                   "(Gradska uprava) i isto naselje. Rastojanje je naduvano jer LPUO "
                   "koordinata nije izvorna nego geokodirana." % round(d))

    # stable canonical ids, ordered by the group's best coordinate
    groups = {}
    for lid in l.location_id:
        groups.setdefault(u.find(lid), []).append(lid)
    order = sorted(groups.values(),
                   key=lambda g: tuple(l[l.location_id.isin(g)][["lat", "lon"]].min()))
    kid = {lid: "K-%02d" % n for n, g in enumerate(order, 1) for lid in g}

    l["kanonski_id"] = l.location_id.map(kid)
    l["spajanje_pouzdanost"] = l.location_id.map(lambda x: u.why.get(x, ("", ""))[0])
    l["spajanje_razlog"] = l.location_id.map(lambda x: u.why.get(x, ("", ""))[1])
    l.to_csv(LOK, index=False, encoding="utf-8-sig")

    # ---- canonical table: one row per physical site
    obs = pd.read_csv(OBS)
    obs["kanonski_id"] = obs.location_id.map(kid)
    obs.to_csv(OBS, index=False, encoding="utf-8-sig")

    def first_year(s):
        yrs = [int(y) for v in s.dropna().astype(str) for y in v.replace(";", " ").split()
               if y.isdigit() and len(y) == 4]
        return min(yrs) if yrs else ""

    rows = []
    for k, g in l.groupby("kanonski_id"):
        g = g.copy()
        g["rank"] = g.geo_preciznost.map(lambda p: PREC_RANK.index(p)
                                         if p in PREC_RANK else len(PREC_RANK))
        best = g.sort_values("rank").iloc[0]
        gobs = obs[obs.kanonski_id == k]
        godine = sorted({int(y) for v in g.godine_evidentirana.dropna().astype(str)
                         for y in v.replace(";", " ").split() if y.isdigit()}
                        | {int(y) for y in gobs.godina.dropna() if str(y).isdigit()})
        ponavlja = set(g.ponovo_se_stvara.dropna())
        rows.append(dict(
            kanonski_id=k,
            naziv=" | ".join(dict.fromkeys(g.naziv.dropna().astype(str))),
            naselje="; ".join(dict.fromkeys(
                p.strip() for x in g.naselje.dropna().astype(str)
                for p in x.split(";") if p.strip())),
            lat=best.lat, lon=best.lon, geo_preciznost=best.geo_preciznost,
            katastarska_parcela="; ".join(dict.fromkeys(
                x for x in g.katastarska_parcela.dropna().astype(str) if x.strip())),
            prvi_put_zabelezena=min(godine) if godine else "",
            poslednji_put_zabelezena=max(godine) if godine else "",
            godine_evidentirana=";".join(str(y) for y in godine),
            broj_izvornih_redova=len(g), broj_opservacija=len(gobs),
            izvori=" | ".join(sorted({x.split("-")[0] for x in g.location_id})),
            povrsina_m2=pd.to_numeric(g.povrsina_m2, errors="coerce").max(),
            zapremina_m3=pd.to_numeric(g.zapremina_m3, errors="coerce").max(),
            kolicina_t=pd.to_numeric(g.kolicina_t, errors="coerce").max(),
            ociscena_datum="; ".join(x for x in g.ociscena_datum.dropna().astype(str)
                                     if x.strip()),
            ponovo_se_stvara="da" if "da" in ponavlja
                             else "ne" if "ne" in ponavlja else "nepoznato",
            status="; ".join(dict.fromkeys(g.status.dropna().astype(str))),
            spajanje_pouzdanost="; ".join(dict.fromkeys(
                x for x in g.spajanje_pouzdanost.dropna().astype(str) if x.strip())),
            izvorni_redovi=";".join(g.location_id),
        ))
    kan = pd.DataFrame(rows).sort_values("kanonski_id")
    kan.to_csv(OUT, index=False, encoding="utf-8-sig")

    spojene = (l.spajanje_pouzdanost != "").sum()
    print("izvornih redova: %d  ->  kanonskih lokacija: %d" % (len(l), len(kan)))
    print("redova zahvacenih spajanjem: %d" % spojene)
    print(l[l.spajanje_pouzdanost != ""].groupby("spajanje_pouzdanost").size().to_string())
    print("\ngrupe sa vise od jednog reda:")
    for _, r in kan[kan.broj_izvornih_redova > 1].iterrows():
        print("  %s  n=%d  %-14s %s" % (r.kanonski_id, r.broj_izvornih_redova,
                                        r.spajanje_pouzdanost, r.izvorni_redovi))


if __name__ == "__main__":
    main()
