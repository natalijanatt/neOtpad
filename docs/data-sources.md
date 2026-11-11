# Data sources

Historical data on illegal dumps in Pirot, collected in `waste-scraper/`.
`waste-scraper/IZVORI.md` is the full provenance record — every source, how it was
extracted and where it lies. This page is the short version plus the caveats that
any model, map or API built on the data has to respect.

## Files

| File | Rows | What it is |
|---|---|---|
| `data/pirot_divlje_deponije_lokacije.csv` | ~63 | Source-level locations: coordinates, cadastral parcel, area/volume/tonnage, cleanings per year, `ponovo_se_stvara` (recurs) flag |
| `data/pirot_divlje_deponije_kanonske.csv` | ~52 | Canonical locations after de-duplication across sources, with `spajanje_pouzdanost` (merge confidence) |
| `data/pirot_divlje_deponije_opservacije.csv` | ~116 | Dated observations — the time series to train and validate recurrence/risk models on |
| `data/pirot_sepa_registar_2018_2024.csv` | 65 | Raw SEPA/NRIZ registry rows for Pirot |
| `data/pirotski_okrug_sepa_registar_2018_2024.csv` | 338 | Same, for the whole Pirot district |
| `data/pirot_naselja.csv` | 72 | Every settlement of the City of Pirot: centroid, LPUO size class, two dated coverage observations (2018 collection plan, 2024 container list) and where each came from |
| `data/pirot_naselja_aliasi.csv` | 27 | How the sources spell those settlements, including the names that are not settlements at all |
| `data/pirot_odvoz_seoska_naselja_2018.csv` | 31 | JP Komunalac's rural collection plan, transcribed verbatim |
| `data/pirot_raspored_plave_kante_2026.csv` | 208 | The published 2026 recycling schedule, per street and settlement |

`waste-scraper/raw/` holds the downloaded PDFs, XLSX and HTML. It is gitignored
for size; every URL is in `IZVORI.md`.

## Caveats

- **`geo_preciznost` is not decoration.** It separates a real registry point from
  a settlement centroid. Plotting or clustering the two as equally precise
  invents locations that were never surveyed.
- **The Eko Alert default coordinate.** `43.1682819, 22.5956678` is the reporting
  site's default, not a place. It means *unknown location*.
- **The 2017/2018 gap is methodological.** 2017 has no Pirot rows at all, and the
  2018 set of locations never reappears in later years. Dumps did not vanish; the
  reporting changed. Do not read it as a trend.
- **One report can cover several dumps.** The "a dozen dumps" report near Izvor is
  a single row. Counts are a lower bound.
- **Merge confidence travels with the row.** `spajanje_pouzdanost` records how sure
  the de-duplication was; a `srednja` merge should not be presented to a user as a
  single confirmed site without saying so.
- **Cleaned does not mean solved.** The city's own reporting says cleared
  construction-waste sites refill, and the LPUO states that after clearing a site
  a container must be placed or the dump returns. Recurrence is the signal worth
  modelling, not the raw count.
- **What counts as a dump that still stands.** `status` is free source prose, so
  `GET /dumps` reduces its leading clause to five states (`aktivna`,
  `prijavljeno`, `evidentirana`, `ocisceno`, `u_sanaciji`) and returns everything
  except the last two — plus any cleared site whose sources record it as
  refilling, because clearing without a container is not a fix. Crucially,
  *absence from later reports is not closure*: "nije prijavljena posle 2018" is
  the methodological break below, not a dump that went away, so those rows stay
  in. On the Pirot data this is 40 of 52. The reduction lives in SQL
  (`deponije.repository.ts`), because the same expression is what the filter
  tests — a second copy in a mapper would drift from it.
- **The size figures belong to the source rows, not to the site.** `povrsina_m2`,
  `zapremina_m3`, `kolicina_t` and `ociscena_datum` are deliberately absent from
  `app.deponija_kanonska`: each is the maximum or the pick of the rows merged into
  the site, and those rows keep their own provenance in `app.deponija_lokacija`.
  `GET /dumps` re-applies the same maximum on read rather than summing — the
  sources disagree about the same pile, so a sum would report a dump several times
  its real size.

## Column traps found while importing

These are properties of the exports, not of the importer; anything else reading
the CSVs directly has to handle them too.

- **`geo_preciznost` has seven values, the database enum has four.** The import
  maps them like this:

  | CSV | `app.geo_preciznost` |
  |---|---|
  | `registarska_tacka` | `registarska_tacka` |
  | `centroid_naselja` | `centroid_naselja` |
  | `ulica`, `centar_grada`, `priblizno_naselje`, `priblizno_zona`, `prijava_gradjanina` | `geokodirano` |

  The five collapsed values are all coordinates derived from a text description.
  The distinction worth keeping is surveyed / centroid / derived, and that one
  survives the mapping.
- **`prvi_put_zabelezena` is not always a year.** Registry rows carry `2018`, Eko
  Alert rows carry the full report date (`2023-11-30`, read as 2023), and
  STARA-01 carries the prose `pre 2004`. "Before 2004" is a bound, not a year, so
  it imports as NULL — the 2004 evidence is already in `godine_evidentirana`.
- **`ciscenja_godisnje` can be a list.** A merged row carries one value per year
  (`0;1`). The column holds one number and the import keeps the maximum;
  claiming the site is never cleaned would both erase work done and inflate its
  risk score.
- **`ociscena_datum` can be prose.** STARA-01 holds
  `u toku (faza 1 do kraja marta 2026, zavrsetak kraj 2026)`. It imports as NULL
  and the reading stays in `status`.
- **An observation date can be a month.** `2019-07` means "some time in July".
  `datum` stays NULL and `godina` carries what the source knew.
- **The canonical file's `povrsina_m2`, `zapremina_m3` and `kolicina_t` are
  aggregates**, exactly the maximum over the source rows merged into that site
  (verified across all 52). They are therefore not stored on
  `app.deponija_kanonska`: the measurements live on `app.deponija_lokacija` with
  the provenance that produced them.
- **`naselje` is not a settlement list.** Alongside village names it contains
  streets (`Ustanička ulica`, `cara dušana`), descriptions
  (`Kompezacioni bazen - staro gradsko kupališta`) and rows naming three villages
  at once (`Gnjilan; Gradašnica; Gradište`). None of these resolve to a
  settlement, and none of them may invent one.
- **EKOALERT-30 is about ten dumps.** "Iz pravca akumulacionog jezera ka selu
  Izvoru postoji desetak deponija" is one row; the import writes
  `broj_deponija = 10` for it. Every other row is 1 and every count in the system
  remains a lower bound.

## Importing

```bash
cd backend
npm run import:deponije -- --dry-run     # runs every statement, then rolls back
npm run import:deponije                  # commits
npm run import:deponije -- --report r.json
```

The code is in `backend/src/deponije/import/`: `deponije-csv.ts` holds the
mapping rules above and nothing else, so each trap has a test in
`deponije-csv.spec.ts` that fails when a future export changes shape.

Re-running is the normal case. Canonical sites and locations upsert on
`kanonski_id` and `location_id`; observations have no key of their own — one
location can be recorded twice in the same year by two documents — so they are
deleted and rewritten for the locations the import owns.

## The import is no longer the only writer

A citizen report confirmed as a `divlja_deponija` writes an observation too, so
the register keeps growing after the last CSV harvest. The two writers share
`app.deponija_opservacija` and the boundary between them is one column:

- **`prijava_id is null` means the import owns the row.** Its wholesale delete is
  scoped to that, because a report's observation hangs off a canonical site with
  no `deponija_lokacija` of its own — exactly the shape the delete's second
  branch reaches. Without the guard every citizen observation would disappear on
  the next `import:deponije`.
- **`broj_opservacija`, `godine_evidentirana` and `poslednji_put_zabelezena` on
  `deponija_kanonska` stay the import's property.** It overwrites them from the
  CSV on every run, so a report that bumped one would silently lose it later. The
  count of citizen observations is therefore read with a join, the same rule the
  register already applies to `povrsina_m2` and `kolicina_t`.
- **`kanonski_id` is namespaced.** The CSV owns `K-nn`; a site first observed by
  a report gets `P-nnnn` from `app.deponija_prijava_seq`. Sharing the namespace
  would mean the next import upserting over a row that was never in a CSV.
- **Counts never mix.** `izvorna_serija` carries a `prijave-sistem` group whose
  numbers grow with app adoption rather than with dumping. Three methodologies
  now meet in this table and only two of them were ever comparable with each
  other.

**Settlement links are a separate decision.** A name resolves through
`app.naselje` and `app.naselje_alias` or it does not resolve at all: the row
keeps its coordinates, `naselje_id` stays NULL and the name appears on the import
report. Creating a village from a string in a PDF would put a settlement on the
coverage map carrying an `organizovano_prikupljanje` flag nobody ever checked,
and that flag is the one the whole model leans on. With the four settlements
currently seeded, 40 names are waiting for that decision.

## The strongest predictor available

The LPUO 2021-2031 records that organised collection reaches **15,779 households**
- 12,091 in the city and 3,688 across **31 settlements** - plus 1,100 legal
entities. Which 31 it never says. That list is in JP Komunalac's own business
programme, and it is now imported; see below. Carry the coverage flag into every
model and map layer rather than treating all settlements alike.

## Settlements

The City of Pirot has **72 settlements**. The only complete list in any collected
document is the LPUO's size classification (p. 117), which sorts them into four
classes by the 2011 census: 5 over 1,000 inhabitants, 31 between 100 and 1,000,
28 under 100, 7 under 10. `waste-scraper/scripts/lpuo_naselja.py` holds it
verbatim.

- **The plan misspells three of them.** `Visoka Rzana` is Visocka Rzana,
  `Pokrvenik` is Pokrevenik, `Carev Del` is **Cerev Del** - the last is a
  different word, not a one-letter slip. Each correction is checked against OSM:
  the planned spelling matches nothing inside the City of Pirot, the corrected one
  does. Both spellings are imported - the real name as the settlement, the plan's
  as an alias - so a document using the plan's spelling still finds the village.
- **Coordinates come from three places, in this order of trust:** an OSM
  administrative/village/hamlet result, a `centroid_naselja` row already in the
  dump exports, then a registry point. The OSM lookup is filtered by result type
  on purpose - searching a settlement name happily returns something else:
  `Belava` is a mountain peak, `Crveni Breg` a waterfall, and `Pirot` a petrol
  station.
- **Place codes exist for five settlements.** The SEPA registry carries
  `sifra_mesta` only for settlements that reported a dump, so the natural key for
  the import is the name within the municipality.

## Organised collection: which settlements, and since when

`app.naselje.organizovano_prikupljanje` is the most load-bearing flag in the
system - dumps appear where collection does not reach - so it is worth being
precise about where its value comes from.

**The source is JP Komunalac's Program poslovanja za 2018, p. 9**, a table titled
"Plan iznosenja smeca iz seoskih naselja": the villages the utility serves, how
many times a week, how many households, and how many 1.1 m3 containers stand
there (all placed in 2013). It is transcribed in
`waste-scraper/scripts/komunalac_odvoz_2018.py`.

- **The table has exactly 31 rows**, which is where the LPUO's "31 settlements"
  comes from - but **only 23 of those rows are settlements**. The other eight are
  collection stops: Sukovski Manastir, Naselje Sveti Jovan, Belo Polje, Komje,
  Vrelo, a mountain lodge, "4. kilometar", and the road around Zavoj lake.
  Anything reporting coverage as "31 of 72 settlements" is wrong by eight.
- **`ne` for the other 48 settlements is a conclusion, not a transcription.** The
  plan is the utility's complete rural list and the LPUO states the remaining
  villages have no organised collection. The reasoning travels with the row:
  `pokrivenost_izvor` in the CSV and `app.pokrivenost_naselja.izvor` in the
  database both say so.
- **The document is from 2018.** The 2025 and 2026 business programmes no longer
  publish this table, so nothing newer is public. `app.pokrivenost_naselja` keeps
  coverage as a dated observation per source, so a 2026 answer from the utility
  lands next to the 2018 one instead of erasing it - the difference between them
  is the thing worth seeing. Confirming the current state means asking:
  0800 100 102 / office@komunalac.rs.
- **The household counts are census figures, not subscribers.** They sum to 4,564
  across the 23 settlements, while the LPUO says the service reaches 3,688
  households.

## The 2024 container list: a second, wider observation

JP Komunalac's **annual report for 2024** carries a table titled *"Spisak sela u kojima su
postavljeni kontejneri"*: **53 locations, 518 containers**. Transcribed in
`waste-scraper/scripts/komunalac_kontejneri_2024.py`, it lands in `pirot_naselja.csv` as
`kontejneri_2024`, `kontejneri_2024_izvor` and `kontejneri_2024_godina`.

Cross-referenced against the 72 official settlements: **42 settlements appear in the
table, 29 do not.** All 23 settlements from the 2018 plan are still here — the 2024 list
is a superset, nothing dropped out. The nineteen that gained containers between the two
documents (Staničenje, for one) are the single clearest sign the network grew.

Three traps, all the same species as the 2018 ones:

- **53 locations are not 53 villages.** The table mixes villages with collection stops:
  Zavojsko jezero, Planinarski dom, Sukovski manastir, Sopotska petlja, "4. kilometar",
  the Dimitrovgrad motorway. "53 of 71 villages" is wrong for the same reason "31 of 72"
  was.
- **Belo Polje is in the table with 11 containers but was not a separate official
  settlement** when the report was written; the City of Pirot only moved to give it that
  status in 2025. The row exists, the settlement does not — yet.
- **Absence from the table is not absence of service.** It records placed *shared
  containers* only, and the same report lists **three special vehicles for emptying
  bins** (`kante`), so a settlement can be in the system without a shared container.
  This is why `kontejneri_2024 = ne` lives in its own column and **does not touch**
  `organizovano_prikupljanje`. Anything that colours a map red off this column must say
  "not on the container list", never "no collection".

Only the **negative side** is transcribed — the 29 names the table omits — because that is
what the cross-reference established; the 42 are derived by subtraction. Per-village
container counts were not taken, only the total. The cross-reference spelled it
"Pokrovenik"; the settlement is **Pokrevenik**, so the script carries the official name.

**The source URL is not recorded yet.** The table was read outside this repository, so
`IZVORI.md` 7.1b holds a placeholder. Fill in the URL and page before anything public
cites this figure.

## The collection schedule that exists today

JP Komunalac publishes one schedule: [praznjenje plavih kanti za
2026](https://www.komunalacpirot.rs/raspored-praznjenja-plavih-kanti-2026-godina/),
208 streets and settlements. Three things about it shape the schema:

- **The blue bin is not mixed waste.** Pirot runs the LPUO's "two bins" scheme
  (t. 6.6.1): blue for dry recyclables **except glass**, green for wet, and
  separate yellow 1.1 m3 containers for glass. The blue stream is paper, plastic
  and metal travelling together to the separation line at the regional landfill,
  which is why `app.tip_otpada` has `suvi_reciklabilni` rather than reusing one
  material.
- **It is fortnightly, not weekly.** Each street links to an image reading "SVAKI
  DRUGI PONEDELJAK" with the 2026 dates marked. `app.plan_odvoza` therefore
  carries `ciklus_dana` and a `referentni_datum` to anchor the cycle; a weekday
  alone would promise a truck on a Monday it never comes.
- **Villages get it half as often.** Selo Izvor and Selo Krupac are on a 28-day
  cycle ("svake cetvrte srede"), against 14 days for the city.

The day and the rhythm are only on the images, so
`scripts/scrape_komunalac_raspored.py` keeps a hand-read map of image -> (day,
cycle, first date) and **fails** if the page grows a group that map does not know,
rather than importing it silently.

## Importing

```bash
cd backend
npm run import:naselja       # settlements, aliases, coverage, schedule
npm run import:deponije      # historical dumps - run after the settlements exist
```

Both take `--dry-run` (executes every statement, then rolls back) and
`--report <file>`. Re-running is the normal case: settlements upsert on name
within the municipality, dumps on `kanonski_id` / `location_id`, coverage on
settlement + source + year. Rows with no key of their own - dump observations,
schedule entries - are replaced wholesale, scoped to the locations or the source
the import owns.

Regenerating the CSVs from the sources:

```bash
cd waste-scraper
python scripts/build_naselja.py              # LPUO + Komunalac + OSM -> three CSVs
python scripts/scrape_komunalac_raspored.py  # the 2026 schedule
```

**Settlement links are still a decision where the sources disagree.** A name
resolves through `app.naselje` and `app.naselje_alias` or it does not resolve at
all: the row keeps its coordinates, `naselje_id` stays NULL, and the name appears
on the import report. Seven names stay unresolved on purpose, each for a reason
recorded in `build_naselja.py`:

| Name | Why it has no settlement |
|---|---|
| `Zaluzje`, `Pirot; Zaluzje` | A zone in the old Nisava riverbed; LPUO Table 10 splits it between KO Izvor and KO Pirot |
| `Belava`, `Gnjilan; Belava` | A ridge between Gnjilan and Veliki Suvodol; the sources attach it to both |
| `Gnjilan; Gradasnica; Gradiste`, `Gnjilan; Sarlah` | Several settlements named at once, with no agreement between them |
| `Kompezacioni bazen - staro gradsko kupalista` | Two different locations merged into one name |

A multi-name row does resolve when every part means the same place, which is how
`Pirot; Kavak` becomes Pirot.
