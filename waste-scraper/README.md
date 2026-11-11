# Istorijski sloj divljih deponija — grad Pirot

Objedinjen dataset divljih deponija, nesanitarnih smetlišta i prijava građana na teritoriji
grada Pirota, sklopljen iz pet nezavisnih izvora. Ne postoji gotov CSV sa ovim podacima —
ovde je napravljen spajanjem nacionalnog registra, lokalnog plana upravljanja otpadom,
gradskih izveštaja i crowdsourced prijava.

## Šta je unutra

| Fajl | Redova | Šta je |
|---|---|---|
| `data/pirot_divlje_deponije_kanonske.csv` | **52** | **Deduplicirano** — jedan red po *fizičkoj* lokaciji. Počnite odavde |
| `data/pirot_divlje_deponije_lokacije.csv` | 63 | Jedan red po zapisu u izvoru (isto mesto može biti više puta) |
| `data/pirot_divlje_deponije_opservacije.csv` | 116 | **Long format** — jedan red po opservaciji (lokacija × datum × izvor) |
| `data/pirot_sepa_registar_2018_2024.csv` | 65 | Sirov izvod iz nacionalnog registra, samo Pirot |
| `data/pirotski_okrug_sepa_registar_2018_2024.csv` | 338 | Isto, ceo Pirotski okrug (za poređenje/baseline) |
| `data/pirot_naselja.csv` | **72** | **Sva naselja grada Pirota** — centroid, veličinska kategorija po LPUO, i da li ima organizovan odvoz |
| `data/pirot_naselja_aliasi.csv` | 27 | Kako izvori pišu ta naselja, plus imena koja uopšte nisu naselja (ulice, gradske MZ) |
| `data/pirot_odvoz_seoska_naselja_2018.csv` | 31 | Plan iznošenja smeća iz seoskih naselja, JP Komunalac 2018 — prepis |
| `data/pirot_raspored_plave_kante_2026.csv` | 208 | Objavljeni raspored pražnjenja plavih kanti za 2026, po ulici i naselju |

Pokrivenost: **2004–2026**. 63 zapisa iz izvora se svode na **52 fizičke lokacije**, sve sa
koordinatama.

Sva tri fajla su povezana kolonom `kanonski_id`.

## Za predikciju hotspotova

`opservacije.csv` je oblik koji vam treba za model — panel po godinama. Konkretno:

- **13 kanonskih lokacija** ima seriju od bar 3 godine; 10 ih ima neprekinut niz 2019–2024
  (ista tačka, ponovljena svake godine, sa poljem „da li se odlaganje ponavlja").
- **Target varijabla `ponovo_se_stvara`** je popunjena za 32 kanonske lokacije: 30× `da`, 2× `ne`.
  To je već skoro spreman label — problem je što je jako neizbalansiran, što je samo po
  sebi nalaz: očišćene divlje deponije se u Pirotu gotovo uvek vraćaju.
- **`ciscenja_godisnje`** iz registra: 0 ili 1 puta godišnje po lokaciji. Lokacije koje
  se čiste (`1`) su bez izuzetka one koje se i ponavljaju.

Feature-i koje vredi izvući iz priloženih koordinata: udaljenost od najbližeg naselja, od
puta, od reke (Nišava, Gradašnička reka, Rogoz, Temštica), od Regionalne deponije
(43.19, 22.54 — oko 4,5 km SZ od centra), i da li naselje ima organizovan odvoz.

Taj poslednji feature više nije pretpostavka: `pirot_naselja.csv` ga nosi za svih 72
naselja, iz plana samog JP Komunalac (vidi ispod). **23 sela su na ruti, 48 nisu** — i to
je najjači prediktor koji ovaj dataset ima.

## Sloj naselja — ko dobija kamion

`pirot_naselja.csv` je gazetir grada: svih **72 naselja** sa spiska iz LPUO 2021–2031
(str. 117), sa centroidom i sa odgovorom na pitanje ima li organizovan odvoz.

| Kolona | Opis |
|---|---|
| `naziv` | Ispravno ime naselja |
| `naziv_u_lpuo` | Pisanje iz plana, kad se razlikuje — plan greši u tri imena: `Висока Ржана` → Височка Ржана, `Покрвеник` → Покревеник, `Царев Дел` → **Церев Дел** |
| `sifra_mesta` | Šifra mesta iz SEPA registra. Postoji za 5 naselja — registar pominje samo ona koja su prijavila deponiju |
| `lat`, `lon`, `geo_izvor` | WGS84 i odakle koordinata. `OSM/administrative` je centar naselja; `deponije/centroid_naselja` je već geokodirana tačka iz ovog dataseta; `SEPA` je tačka prijave, ne centar sela |
| `kategorija_lpuo` | I (>1.000 stanovnika), II (100–1.000), III (<100), IV (<10), `grad`. Za 49 naselja je ovo jedini podatak o veličini |
| `organizovano_prikupljanje` | `da` / `ne`. **`ne` je zaključak, ne prepis** — plan JP Komunalac je kompletan spisak sela na ruti, a LPUO kaže da ostala nemaju odvoz |
| `pokrivenost_izvor`, `pokrivenost_godina` | Iz kog dokumenta i koje godine je taj odgovor. Prepisati ovo uz svaki grafikon pokrivenosti |
| `odvoz_nedeljno`, `broj_kontejnera_1100l`, `broj_stanovnika_2011`, `broj_domacinstava` | Iz plana za 2018; prazno za naselja koja plan ne pominje |

**Zamka koju treba znati napamet:** LPUO kaže „3.688 домаћинстава у **31 насељима**", i
plan JP Komunalac zaista ima 31 red — ali **osam od tih redova nisu naselja** nego
stajališta (Суковски Манастир, Планинарски дом, „4. километар", пут око Завојског језера,
Бело Поље, Комје, Врело, Насеље Свети Јован). Naselja je 23. Pokrivenost izračunata kao
„31 od 72" greši za osam.

`pirot_naselja_aliasi.csv` postoji jer izvori naselja pišu kako stignu — `selo sukovo`,
`Pirot-grad`, `М.З.Бериловскакапија`, `cara dušana`. Svaki alias nosi `napomena` sa
razlogom (najčešće: to je gradska mesna zajednica ili ulica iz cenovnika za 2026).
Sedam imena namerno **nije** razrešeno jer se izvori ne slažu — `Zaluzje` (zona koju LPUO
deli između KO Izvor i KO Pirot), `Belava` (kosa između dva sela), višestruka imena tipa
`Gnjilan; Gradašnica; Gradište`.

`pirot_raspored_plave_kante_2026.csv` je jedini objavljeni raspored odvoza. Plava kanta je
**suvi reciklabilni otpad osim stakla** (LPUO t. 6.6.1), ne mešani komunalni — takav
raspored nije objavljen nigde. Ritam je dvonedeljni, a **Село Извор и Село Крупац су на
28 dana**, upola ređe od grada. Dan i ritam se ne vide u tekstu stranice nego samo na
slikama kalendara, pa su pročitani ručno i zapisani u skriptu.

## Rečnik podataka — `lokacije.csv`

| Kolona | Opis |
|---|---|
| `location_id` | Prefiks označava izvor: `SEPA-`, `LPUO-`, `EKOALERT-`, `CIST-`, `STARA-`, `PRISJAN-` |
| `naziv` | Naziv lokacije po izvoru |
| `naselje`, `grad` | Naselje / katastarska opština, grad je uvek Pirot |
| `lat`, `lon` | WGS84 |
| `geo_preciznost` | **Čitati obavezno.** `registarska_tacka` = zvanična tačka iz NRIZ-a; `prijava_gradjanina` = koordinata iz same prijave; `ulica` / `centroid_naselja` / `priblizno_zona` / `priblizno_naselje` / `centar_grada` = geokodirano iz opisa, **nije tačna lokacija deponije** |
| `katastarska_parcela`, `katastarska_opstina` | Iz LPUO Tabele br.10 i projekta sanacije |
| `prvi_put_zabelezena`, `poslednji_put_zabelezena` | Godina ili ISO datum |
| `godine_evidentirana` | Sve godine u kojima se lokacija pojavljuje, `;`-razdvojeno |
| `broj_opservacija` | Koliko puta se javlja u izvorima |
| `tip_otpada` | komunalni / građevinski / mešoviti / plastika |
| `povrsina_m2`, `zapremina_m3`, `kolicina_t` | Različiti izvori mere različito — LPUO daje m² i m³, NRIZ daje m² i tone |
| `ciscenja_godisnje` | Broj čišćenja u izveštajnoj godini (NRIZ) |
| `ociscena_datum` | Datum zabeležene akcije čišćenja |
| `ponovo_se_stvara` | `da` / `ne` / `nepoznato` — traženo `reappeared` polje |
| `status` | aktivna / u sanaciji / očišćeno / prijavljeno / planirana sanacija |
| `povezano_sa`, `povezano_rastojanje_m` | Najbliži zapis iz **drugog** izvora u krugu od 600 m. Registar ima koordinate bez imena, plan ima imena i parcele bez koordinata — ova kolona ih spaja. Kandidat za spajanje, **nije potvrđen identitet**; rastojanje 0 m obično znači da oba koriste isti centroid naselja |
| `izvor`, `izvor_url` | Citat po redu |
| `napomena` | Originalni opis lokacije / tekst prijave |
| `kanonski_id` | `K-NN` — ista vrednost znači isto fizičko mesto. Join ključ ka `kanonske.csv` i `opservacije.csv` |
| `spajanje_pouzdanost` | Prazno = red nije ni sa čim spojen. `visoka` = spajanje dokumentovano u samom izvoru. `srednja` = zaključeno iz blizine + istog prijavljivača |
| `spajanje_razlog` | Rečenica objašnjenja za svako spajanje |

### `kanonske.csv` — dodatne kolone

`broj_izvornih_redova` (koliko zapisa je spojeno), `broj_opservacija`, `izvori` (koji izvori
su doprineli, npr. `LPUO | SEPA`), `izvorni_redovi` (lista `location_id` vrednosti).
Koordinata je uzeta iz reda sa najboljom `geo_preciznost` u grupi, a mere (`zapremina_m3`,
`kolicina_t`, `povrsina_m2`) su maksimum po grupi — različiti izvori mere različito.

**Zašto se ovo isplati:** spojeni redovi nose i registarsku koordinatu i podatke iz plana.
`K-26` „Romsko naselje" ima tačnu tačku iz NRIZ-a (43.1475, 22.5805), 50 m³ i katastarsku
parcelu 4080/209 iz plana, 5 t iz registra i niz 2019–2024 — ništa od toga nijedan izvor
nema sam.

### Pravila spajanja

11 grupa, 22 reda zahvaćeno.

- **`visoka` (4 grupe)** — spajanje piše u izvoru: greška u registru (zamenjene cifre
  koordinate), ista katastarska parcela, isto mesto pod dva imena, ista raskrsnica u dve
  prijave.
- **`srednja` (7 grupa)** — zapis iz NRIZ registra i stavka iz LPUO koji su *uzajamno*
  najbliži par u krugu od 800 m. Uzajamnost je bitna: sprečava da jedna stavka iz plana
  proguta više registarskih tačaka. Rastojanja od 200–700 m deluju veliko, ali LPUO
  koordinate nisu izvorne nego geokodirane iz opisa.

Ništa se ne briše. `spajanje_pouzdanost == 'srednja'` isključuje sve zaključene spojeve
ako se ne slažete sa procenom.

`opservacije.csv` ima `tip_dogadjaja`: `godisnja_evidencija`, `popis_u_planu`,
`prijava_gradjanina`, `ciscenje`, `geodetski_snimak`, `projekat_sanacije`,
`sanacija_u_toku`, `najava_sanacije`, `strateski_dokument`.

## Reprodukcija

```bash
pip install pandas requests beautifulsoup4 lxml openpyxl pymupdf

python scripts/scrape_ekoalert.py 80          # prijave građana -> raw/ekoalert/problems.json
python scripts/scrape_ekoalert_news.py 600    # vesti -> raw/ekoalert/news_waste.json
python scripts/geocode.py scripts/places.txt  # OSM Nominatim, keširano u raw/geocode_cache.json
python scripts/build_dataset.py               # -> data/lokacije.csv, opservacije.csv
python scripts/dedupe.py                      # dodaje kanonski_id, -> data/kanonske.csv

python scripts/build_naselja.py               # LPUO + Komunalac + OSM -> 3 CSV-a o naseljima
python scripts/scrape_komunalac_raspored.py   # raspored plavih kanti 2026
```

XLSX iz nacionalnog registra i oba PDF-a se preuzimaju ručno (URL-ovi u `IZVORI.md`) i
raspakuju u `raw/sepa/` odnosno `raw/pdf/`.

## Ograničenja

1. **Koordinate nisu jednako pouzdane.** Samo 15 SEPA tačaka i 1 prijava građanina imaju
   koordinatu iz izvora. Ostalih 47 je geokodirano iz tekstualnog opisa preko Nominatima —
   koristite `geo_preciznost` kao težinu, ne tretirajte sve tačke ravnopravno.
2. **LPUO Tabela br.10 nema koordinate**, samo katastarske parcele. Tačna geometrija se
   može dobiti iz RGZ katastra (`geosrbija.rs`) po parceli — to bi bio sledeći korak i
   najveći pojedinačni skok u kvalitetu podataka.
3. **Zbir zapremina iz plana se ne poklapa.** Suma kolone iz Tabele br.10 je 11.515 m³, a
   plan u tekstu navodi ukupno 14.900 m³. Razlika je verovatno u stavkama „3000 m³ i više"
   i „250–300 m³" koje su u tabeli date opisno.
4. **Eko Alert koordinate su uglavnom placeholder.** Sajt upisuje 43.1682819, 22.5956678
   (centar Pirota) kada korisnik ne unese koordinatu — te vrednosti su odbačene, nisu
   upisane u dataset kao prave.
5. **Prijave građana nisu verifikovane** i pokrivaju samo 2023–2026, uz prekid (ID-jevi
   1–18, 35–38, 41–42, 44–45 na sajtu vraćaju praznu stranicu).
6. **Jedan spoj je sporan i namerno nije napravljen.** `SEPA-07` je 279 m od stare gradske
   deponije (`STARA-01`), bliže nego od `LPUO-04` sa kojom je spojena (683 m). Nisu spojene
   jer je stara deponija sanitarno-tehnički drugačija kategorija — 5 ha i 469.000 m³ u
   sanaciji, naspram male divlje deponije od 15 t. Ako vam za model treba prostorna
   agregacija, proverite ovaj par.
7. **Eko Alert vesti su nacionalne, ne samo pirotske** — polje „Lokacija" je uvek „Pirot"
   jer je to sedište organizacije. Akcije čišćenja u datasetu su ručno filtrirane na one
   koje eksplicitno imenuju pirotsko naselje.
