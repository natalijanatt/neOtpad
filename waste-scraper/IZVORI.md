# Izvori — šta je u svakom nađeno

Redosled je po korisnosti, ne hronološki.

---

## 1. SEPA / NRIZ — Registar divljih deponija (najvredniji izvor)

**URL:** https://data.gov.rs/sr/datasets/deponije-sanitarne-nesanitarne-i-divlje/
**Fajl:** `divlje-deponije.xlsx` (1,8 MB, ažuriran 27.04.2026)
**Obim:** 18.196 redova za celu Srbiju, 2017–2024. Od toga **65 redova za Pirot**,
338 za ceo Pirotski okrug.

Ovo je ono što se tražilo, a nije se očekivalo da postoji u mašinski čitljivom obliku.
Kolone koje nose sve:

- `Geografska širina` / `Geografska dužina` — **prave koordinate po lokaciji**
- `Procenjena količina otpada (t)` i `Procenjena površina smetlišta (m2)`
- `Koliko je puta čišćen prostor divlje deponije u toku izveštajne godine?`
- `Da li se na istom mestu ponavlja divlje odlaganje otpada?` — **gotovo `reappeared` polje**

Ista tačka se ponavlja iz godine u godinu, pa je ovo pravi panel: 15 zasebnih lokacija,
od kojih 10 ima neprekinut niz 2019–2024.

**Korekcija polazne pretpostavke:** u brifu je stajalo da Pirot nije dostavio podatke za
nacionalno evidentiranje 2024. U registru **postoji 10 pirotskih lokacija za 2024. godinu**,
podnosilac je Gradska uprava grada Pirota. Rupa u nizu je drugde — 2017. nema Pirota
uopšte, a set od 5 lokacija iz 2018. se nikada više ne ponavlja (potpuno drugačije tačke
od onih 2019+), što liči na promenu metodologije prijavljivanja, ne na nestanak deponija.

Uz ovo je preuzet i `nesanitarne-deponije.xlsx` (971 red, 49 kolona, uključujući godinu
početka i završetka deponovanja, poplavno područje, status projekta sanacije) i
`sanitarne-deponije.xlsx` (109 redova) — nisu ušli u finalni CSV jer za Pirot ne dodaju
nove lokacije, ali stoje u `raw/sepa/` ako zatreba baseline za ceo region.

GIS pregled istih podataka: https://www.nrizgis.sepa.gov.rs/kdd/ (ArcGIS JS 3.35 aplikacija;
podaci su isti kao u XLSX-u, pa XLSX ima prednost).

---

## 2. Lokalni plan upravljanja otpadom grada Pirota 2021–2031

**URL:** https://sepa.gov.rs/wp-content/uploads/2025/05/LPUO-Pirot.pdf (14,7 MB, 289 strana)

**Napomena o ekstrakciji:** `pdftotext` vraća samo cifre — ćirilični fontovi nemaju ToUnicode
mapu. PyMuPDF izvlači tekst ispravno. Ako neko ponavlja ovo, ne gubite vreme na poppler.

Izvučeno:

- **Tačka 4.4.1, Tabela br.10 (str. 72–73)** — popis od **19 divljih deponija** sa nazivom,
  opisom lokacije, **katastarskom parcelom**, površinom u m² i zapreminom u m³. Ovo je
  jedini izvor koji daje katastarske parcele. Ukupna količina po planu: **14.900 m³**,
  pretežno građevinski otpad i šut.
- Potvrđena je deponija **„Kavak — srednji put"** (kp 6634/4 KO Pirot-van varoš, 2.793 m²,
  150 m³) — plan joj posvećuje i fotografiju (Slika br.39).
- **Tačka 6.7 (str. 155–156)** — stara nesanitarna gradska deponija: **38 katastarskih
  parcela KO Pirot**, površina ~5 ha, dubina sloja ~10 m, a geodetskim snimkom iz jula 2019.
  utvrđena zapremina **V = 469.262,00 m³**. Idejni projekat sanacije: BMD Bau d.o.o. Beograd,
  decembar 2019, izabrana varijanta III.
- **Tačka 5.11** — mere sanacije. Plan eksplicitno navodi da su divlje deponije posledica
  nepokrivenosti odvozom i da posle čišćenja treba postaviti kontejnere „jer se jedino na
  taj način može zaustaviti ponovno zagađenje već sanirane lokacije".
- **Tačka 4.3** — odvozom je obuhvaćeno 12.091 domaćinstvo u gradu i 3.688 u **31 naselju**,
  ukupno 15.779 domaćinstava i 1.100 pravnih lica. Ostala sela nemaju organizovan odvoz.
  Ovo je ključan prediktor za model.
- Regionalna deponija Pirot: kp 277 KO Pirot-van varoš, ~18 ha (16 ha pod ogradom),
  4,5 km SZ od centra, u eksploataciji od 2013.

---

## 3. Eko Alert — crowdsourced prijave građana

**Prijave:** https://ekoalert.rs/ekoproblem-prikaz.php?idProblem=N
**Vesti:** https://ekoalert.rs/vest-prikaz.php?idVest=N

Skrejpovano `idProblem` 1–80 i `idVest` 1–600. Rezultat: **23 prijave** (od kojih 16 o
otpadu na teritoriji Pirota) i **600 vesti**, od kojih 87 vezanih za otpad.

Svaka prijava ima strukturirana polja: Autor, Datum, Grad, Mesto, Lokacija, Koordinate,
naslov i opis. Pokrivenost 30.11.2023 – 31.08.2026.

Konkretne lokacije iz prijava koje ne postoje ni u jednom drugom izvoru:
raskrsnica Cara Dušana i Obilićeve (dva puta, 2023. i 2026., građevinski otpad),
selo Petrovac / raskrsnica ka Držini, Barje Čiflik, selo Zaskovci (Stara planina),
selo Staničenje (reka Temštica), naselje Prčevac kod tijabarskog groblja,
reka Rogoz kod naselja Barje, korito Gradašničke reke (kp 4455), Svetozara Markovića.

Prijava #30 (29.04.2024) navodi **„desetak deponija"** između akumulacionog jezera i sela
Izvor — jedna prijava, više lokacija; u datasetu je jedan red, što je potcenjeno.

Akcije čišćenja iz vesti (ušle kao `CIST-*` redovi): Berilovac (2 divlje deponije u 2023,
vest 131), Poljska Ržana, Crnoklište, Staro Tigrovo naselje, Topli Do, Rsovci,
Veliki Jovanovac, Toplodolska reka, i uklanjanje deponije iza starog gradskog kupališta.

**Zamke:** polje Koordinate je najčešće 43.1682819, 22.5956678 — to je default sajta, ne
prava lokacija. Polje Lokacija u vestima je uvek „Pirot" (sedište organizacije), iako
vesti pokrivaju celu Srbiju. ID-jevi 1–18, 35–38, 41–42, 44–45 vraćaju praznu stranicu.

---

## 4. Grad Pirot (pirot.rs)

Pretraga po `deponija` / `deponije` / `smetlište` dala je ~50 članaka. Relevantni:

| Datum | Članak | Šta nosi |
|---|---|---|
| 29.05.2019 | [Javni radovi: Čišćenje divljih deponija…](https://pirot.rs/index.php/sr/11-latinica/vesti/4103-javni-radovi-ciscenje-divljih-deponija-uredenje-keja-pored-nisave-ciscenje-kanala-kanjona-vladikine-ploce) | 19 ugovora, 51 osoba; čišćenje divljih deponija kao stavka javnih radova |
| 15.07.2021 | [Stare navike nove divlje deponije](https://pirot.rs/index.php/sr/11-latinica/vesti/5563-stare-navike-nove-divlje-deponije) | Grad izdvaja značajna sredstva svake godine; najavljene mobilne kamere za identifikaciju počinilaca. Bez konkretnih lokacija |
| 22.02.2023 | [„Odzvonilo" divljim deponijama građevinskog otpada](https://pirot.rs/index.php/sr/11-latinica/vesti/6601-odzvonilo-divljim-deponijama-gradevinskog-otpada) | Eksplicitno: lokacije se posle čišćenja **ponovo pune**. Uzrok — rušenje i adaptacije. Uslov za građevinsku dozvolu postaje ugovor o zbrinjavanju otpada |
| 16.03.2026 | [U toku sanacija starog smetlišta](https://pirot.rs/index.php/sr/11-latinica/vesti/8855-u-toku-sanacija-starog-smetlista-od-ekoloskog-problema-do-prostora-za-industriju-i-solarnu-elektranu) | ~500.000 m³ na preko 5 ha; 243 mil. RSD ministarstvo + 61 mil. RSD grad; faza 1 do kraja marta 2026, sve do kraja 2026; posle toga 1,5 ha industrijska zona i solarna elektrana 2,5 MW; izvođač BMD Bau |

---

## 5. JKP „Regionalna deponija Pirot"

**URL:** https://jkpdeponijapirot.rs/2025/02/05/resavanje-problema-gradevinskog-otpada-regionalna-deponija-dobija-novo-reciklazno-postrojenje/
(05.02.2025)

Imenuje **Prisjan** kao dugogodišnje neuređeno odlagalište koje se planira zatvoriti i
sanirati, u saradnji Regionalne deponije i Gradske uprave. Finansiranje iz programa
Horizon; tehnička dokumentacija u 2025, pa javna nabavka.

Povezano sa LPUO stavkom „Prisjansko naselje Strelište", kp 6633/3 KO Pirot-van varoš,
28.801 m². **Pažnja:** ovo je Prisjansko naselje unutar Pirota (parcela 6633/3 je susedna
Kavaku, 6634/4), a ne selo Prisjan 9 km južno — Nominatim ovde greši i koordinata je
ručno ispravljena.

---

## 6. Strateški opštinski akcioni plan Pirota (2004)

**URL:** https://www.pirot.rs/downloads/strategije/SAP_Pirot_SR.pdf (80 strana)

Daje najraniju tačku u nizu i uzročnu formulaciju:

> „U seoskim naseljima ne postoji organizovan način odvoženja čvrstog otpada. Najčešće se
> baca u jame, pored potoka, puta ili direktno u reku, čime se formiraju brojne divlje
> deponije."

Takođe: pokrivenost odvozom 98% užeg gradskog jezgra, 90% urbanog područja, prigradska i
seoska naselja **potpuno izvan sistema**. Postojeća deponija je tada bila u sanaciji, sa
eksploatacionim vekom do kraja 2004, na neuslovnoj lokaciji u industrijskoj zoni, u starom
koritu reke — to je ista lokacija koja se sanira 2026.

Bez pojedinačnih lokacija deponija, ali vredi kao 2004. baseline i kao objašnjenje
prostornog obrasca.

---

## 7. JP „Komunalac" Pirot — ko stvarno dobija kamion

**URL:** http://www.komunalacpirot.rs/
**Fajlovi:** `raw/pdf/PROGRAM_POSLOVANJA-2018.pdf`, `raw/komunalac/`

Ovo je izvor koji je nedostajao. LPUO kaže da je organizovanim prikupljanjem obuhvaćeno
„3.688 домаћинстава у **31 насељима**", ali nigde ne kaže u kojima. Spisak postoji u
programu poslovanja samog preduzeća.

### 7.1 Program poslovanja za 2018, str. 9 — „План изношења смећа из сеоских насеља"

Tabela od 31 reda: naselje, **broj iznošenja nedeljno**, stanovnici i domaćinstva po
popisu 2011, **broj kontejnera od 1,1 m³** i godina postavljanja (svi 2013). Prepisano u
`scripts/komunalac_odvoz_2018.py`.

Dve stvari koje se vide tek poređenjem sa zvaničnim spiskom naselja iz LPUO:

- **31 red nisu 31 naselje.** Naselja je 23; ostalih osam su stajališta — Суковски
  Манастир, Насеље Свети Јован, Бело Поље, Комје, Врело, Планинарски дом,
  „4. километар" и „Пут ка Завојском језеру". Broj 31 iz LPUO je, dakle, broj redova ove
  tabele. Svako ko računa pokrivenost kao „31 od 72 naselja" greši za osam.
- **Uparivanje kolona je provereno, ne pretpostavljeno.** PDF drži imena i brojeve u
  odvojenim tekstualnim tokovima, pa je redosled morao da se potvrdi: svaki broj
  stanovnika pada tačno u kategoriju u koju je LPUO svrstao to naselje (Гњилан 2503 → I,
  Горња Држина 28 → III).

Zbir domaćinstava je 4.564, a LPUO kaže 3.688 — popisna domaćinstva, ne korisnici usluge.

**Ograničenje:** dokument je iz 2018, kontejneri iz 2013, a programi za 2025. i 2026.
ovu tabelu više ne objavljuju (provereno). Za stanje u 2026. treba poziv:
0800 100 102 / office@komunalac.rs.

### 7.1b Godišnji izveštaj o poslovanju za 2024 — „Spisak sela u kojima su postavljeni kontejneri"

**URL:** *nije upisan* — tabela je unakrsno pročitana van repozitorijuma. Pre nego što se
na nju pozove bilo šta javno, ovde idu URL i strana, a `raw/komunalac/` dobija fajl.
**Skript:** `scripts/komunalac_kontejneri_2024.py` → kolone `kontejneri_2024*` u
`data/pirot_naselja.csv`

Šest godina noviji pogled na isto pitanje od 7.1, i bitno širi: **53 lokacije, 518
kontejnera**. Unakrsno sa zvaničnim spiskom naselja: **42 naselja su u tabeli, 29 nisu.**
Svih 23 naselja iz plana za 2018 su i ovde — spisak iz 2024 je nadskup, ništa nije
ispalo.

Tri zamke, sve iste vrste kao u 7.1:

- **53 lokacije nisu 53 sela.** I ova tabela meša sela i stajališta: Завојско језеро,
  Планинарски дом, Суковски манастир, Сопотска петља, „4. километар", ауто-пут за
  Димитровград. Račun „53 od 71 sela" je pogrešan iz istog razloga iz kog je pogrešan i
  „31 od 72".
- **Бело Поље je u tabeli sa 11 kontejnera, a nije bilo zasebno zvanično naseljeno
  mesto** u trenutku izveštaja — Grad Pirot je tek 2025. pokrenuo inicijativu da mu se taj
  status odredi. Red postoji, naselje (još) ne.
- **Odsustvo iz tabele nije odsustvo usluge.** Tabela govori isključivo o postavljenim
  zajedničkim kontejnerima, a isti izveštaj navodi i **tri specijalna vozila za iznošenje
  otpada iz kanti**. Zato `kontejneri_2024 = ne` stoji u svojoj koloni i **ne dira**
  `organizovano_prikupljanje`: to su dva različita tvrđenja o dva različita dokumenta.

Prepisuje se **negativna strana** — 29 imena kojih u tabeli nema — jer je to ono što je iz
unakrsnog čitanja pouzdano poznato; 42 se izvode oduzimanjem. Brojevi kontejnera po selu
nisu preuzeti, samo zbir. Unakrsno čitanje je dalo pisanje „Покровеник"; naselje se zove
**Покревеник**, pa skript nosi zvanično ime.

### 7.2 Cenovnik za 2026

**URL:** http://www.komunalacpirot.rs/wp-content/uploads/CENOVNIK-2026-potpisan.pdf

Nabraja svih **19 gradskih mesnih zajednica** sa pripadajućim ulicama, i kaže da se za
„сва остала насеља" odvoženje naplaćuje po Tarifi 2. Time je pokrivenost grada dokument,
a ne procena, a spisak ulica po MZ je ono što vezuje imena kao „Тијабара", „Сарлах",
„М.З.Бериловска капија" i „Устаничка" za Pirot umesto da ostanu nerazrešena.

(Uzgredno: cenovnik se poziva na „Одлуку о месним заједницама, Сл. лист града **Ниша**" —
greška u njihovom dokumentu.)

### 7.3 Raspored pražnjenja plavih kanti 2026

**URL:** https://www.komunalacpirot.rs/raspored-praznjenja-plavih-kanti-2026-godina/
**Skript:** `scripts/scrape_komunalac_raspored.py` → `data/pirot_raspored_plave_kante_2026.csv`

208 ulica i naselja, svako vezano za sliku sa kalendarom za 2026. **Dan i ritam nisu u
tekstu stranice — stoje samo na slikama**, pa je mapa slika → (dan, ciklus, prvi datum)
pročitana ručno i zapisana u skriptu; skript pukne ako se na stranici pojavi grupa koju
ta mapa ne poznaje, umesto da je prećuti.

- Ritam je **dvonedeljni** („СВАКИ ДРУГИ ПОНЕДЕЉАК"), ne nedeljni.
- **Село Извор и Село Крупац su „СВАКЕ ЧЕТВРТЕ СРЕДЕ"** — sela dobijaju plavu kantu
  upola ređe od grada. Jedina grupa sa ciklusom od 28 dana.
- Plava kanta je **suvi reciklabilni otpad osim stakla** (LPUO t. 6.6.1, sistem „две
  канте": plava suva, zelena mokra, žuti kontejneri za staklo). Ovo dakle nije raspored
  odnošenja mešanog komunalnog otpada — takav raspored nigde nije objavljen.

---

## 8. OSM / Nominatim — koordinate naselja

**Skript:** `scripts/geocode.py`, keš u `raw/geocode_cache.json`

Za 48 naselja koja nijedan prikupljeni dokument ne locira. Tri zamke, sve tri ugrađene u
`build_naselja.py`:

- **Tip rezultata se mora proveriti.** Na ime naselja geokoder rado vrati nešto drugo:
  `Belava` je vrh, `Crveni Breg` vodopad, a `Pirot` — benzinska pumpa. Priznaju se samo
  `administrative`, `village`, `hamlet`, `town` unutar Grada Pirota.
- **`Barje` vraća selo u opštini Babušnica**, ne pirotsku mesnu zajednicu istog imena.
- **Tri imena iz LPUO ne postoje.** `Висока Ржана` je Височка Ржана, `Покрвеник` je
  Покревеник, а `Царев Дел` je **Церев Дел** (potvrđeno popisom 2022: 5 stanovnika,
  MZ Prisjan). Oba pisanja ulaze u bazu, plansko kao alias.

---

## Šta nije dalo rezultat

- **Regionalni prostorni plan Nišavskog/Topličkog/Pirotskog okruga** — opisuje problem
  lokalnih smetlišta u ruralnim područjima, ali bez popisa lokacija. Ništa što LPUO
  nema preciznije.
- **Energetski portal, broj 16 (septembar 2019)** — pominje potrebu da se završi mapiranje
  istorijskih deponija (lokacija, veličina, katastarska parcela). Trag je bio tačan:
  taj popis je i završen, i objavljen je u LPUO 2021–2031 kao Tabela br.10.
- **SEPA GIS `kdd` aplikacija** — nema zaseban javni REST endpoint u HTML-u; koristi iste
  podatke kao XLSX.

## Sledeći korak koji najviše vredi

Povlačenje geometrije 19 katastarskih parcela iz LPUO Tabele br.10 preko RGZ /
geosrbija.rs. Time bi 19 lokacija sa `geo_preciznost = centroid_naselja` dobilo pravi
poligon umesto tačke, a dataset bi imao i površinu iz katastra za unakrsnu proveru
površina koje plan navodi.
