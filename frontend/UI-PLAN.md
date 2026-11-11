# Plan korisničkog interfejsa — Pametno upravljanje otpadom, Pirot

Plan razvoja frontenda po fazama. Svaka faza se završava nečim što može da se
pokaže. Kutije `[ ]` označavamo kako završavamo stavke.

**Legenda:** ⭐ = neophodno za demo · 🔹 = stretch

**Status faza:**

| Faza | Naziv | Status |
|---|---|---|
| 0 | Temelj | ✅ završeno |
| 1 | Građanin: prijava problema ⭐ | ✅ završeno |
| 2 | Građanin: informisanje | ⬜ |
| 3 | Operativa: mapa i kontejneri ⭐ | ⬜ |
| 4 | Operativa: prijave i AI prioritizacija | ⬜ |
| 5 | Operativa: rute i planiranje ⭐ | ⬜ |
| 6 | Analitika i rukovodstvo 🔹 | ⬜ |
| 7 | Angažovanje zajednice 🔹 | ⬜ |
| 8 | Poliranje i integracija sa backendom | ⬜ |

**Preporučeni redosled za hakaton:** 0 → 1 → 3 → 5 → 4 → 2 → 6 → 7 → 8

---

## Arhitektura (važi kroz sve faze)

### Dve zone u jednoj SPA

| Zona | Korisnik | Uređaj / layout | Ruta |
|---|---|---|---|
| **Građanin** | stanovnici, predsednici MZ | mobilni, bottom-nav | `/gradjanin/*` |
| **Operativa** | JKP, odeljenje za životnu sredinu, rukovodstvo | desktop, sidebar | `/operativa/*` |

Landing na `/` bira zonu. Bez autentifikacije za hakaton — uloga se bira na landingu.

### Stek

| Šta | Biblioteka | Zašto |
|---|---|---|
| Rutiranje | `react-router` v7 | standard, lazy rute po zoni |
| Stilovi | `tailwindcss` v4 + `@tailwindcss/vite` | brzina, tokeni u CSS-u |
| Komponente | **shadcn/ui** | gotove pristupačne komponente, kod je naš (u `src/components/ui/`), lako se prilagođava |
| Ikone | `lucide-react` | dolazi uz shadcn |
| Mapa | `leaflet` + `react-leaflet` | OSM pločice, bez API ključa |
| Grafikoni | `recharts` (kroz shadcn `chart`) | shadcn ima gotov wrapper |
| Podaci | `@tanstack/react-query` | uniformni loading/error/cache; olakšava zamenu mock → API |
| Obaveštenja | shadcn `sonner` | toast za „prijava poslata“ i sl. |

Jezik interfejsa: **srpski, latinica**. Bez i18n biblioteke.

### Sloj podataka — ključ za kasniju zamenu backa

Pravilo repoa: sav HTTP ide kroz `api` iz `src/api/client.ts`, tipiziran iz
`contracts/openapi.json`. Ugovor trenutno ima samo `/health`, pa mock **ne sme**
da bude lažni API poziv — živi u lokalnom sloju:

```
src/domain/types.ts     ← Container, Report, Truck, TruckRoute, DailyPlan, Hotspot, Settlement...
src/data/repo.ts        ← getContainers(), getReports(), createReport(), getDailyPlan()...
src/data/queries.ts     ← React Query hook-ovi (useContainers, useCreateReport...) — UI koristi OVO
src/data/mock/*.ts      ← fixture-i + in-memory store (store.ts) sa malim delay-om
```

Identifikatori u kodu su na engleskom (kao i backend DTO-ovi, npr. `HealthResponseDto`);
sve što korisnik vidi je na srpskom, preko mapa labela u `src/lib/labels.ts`.

- UI komponente **nikad** ne uvoze mock direktno — samo funkcije iz `repo.ts`.
- Kad backend objavi endpoint, menja se **samo telo funkcije** u `repo.ts`
  (`api.GET(...)` + mapper DTO → domain). UI ostaje netaknut.
- `domain/types.ts` dajemo backend timu kao predlog DTO oblika.
- Žarišta više nisu fixture: `GET /dumps` vraća 40 deponija koje i dalje stoje
  (registar ima 52; očišćene i one u sanaciji ispadaju, osim ako se ponovo
  stvaraju). Uvoz je `npm run import:deponije` iz istog CSV-a. `mock/hotspots.ts`
  i `npm run data:hotspots` ostaju samo za mock planer ruta (`mock/routes.ts`).
- Mock „AI“ postoji na dva mesta i oba su zamenljiva backendom: skor prioriteta nove
  prijave (`mock/store.ts`) i izbor stanica + poređenje sa fiksnim rasporedom (`mock/routes.ts`).

### Struktura foldera

```
frontend/src/
  api/              generisani klijent — NE DIRATI (hook blokira); jedini pravi poziv je /health (ApiStatus)
  app/              router.tsx, providers.tsx, layouts/
  components/ui/    shadcn komponente
  components/       zajedničke (PageHeader, EmptyState, StatusPill, FillLevelBadge, ApiStatus, ComingSoon, MapView...)
  domain/           tipovi
  data/             repo.ts + queries.ts + mock/
  features/
    gradjanin/      pocetna/, prijava/, prijave/, raspored/, mapa/, vodic/, vesti/, profil/
    operativa/      dashboard/, mapa/, kontejneri/, prijave/, rute/, analitika/, zajednica/, vesti/
  lib/              utils.ts (shadcn cn), format.ts, geo.ts, labels.ts, levels.ts
  styles/           globals.css (Tailwind + tokeni)
```

### Rute

```
/                             landing — izbor zone
/gradjanin                    početna (brze akcije + sledeći odvoz)
/gradjanin/prijava            čarobnjak za prijavu
/gradjanin/prijave            moje prijave
/gradjanin/prijave/:id        detalj prijave
/gradjanin/raspored           kada dolazi kamion
/gradjanin/mapa               mesta za odlaganje
/gradjanin/vodic              gde odlažem...?
/gradjanin/vesti              feed novosti JKP-a
/gradjanin/profil             bodovi, bedževi (Faza 7)

/operativa                    dashboard (KPI)
/operativa/mapa               interaktivna mapa sa slojevima
/operativa/kontejneri         tabela
/operativa/kontejneri/:id     detalj + predikcija
/operativa/prijave            red prijava po prioritetu
/operativa/prijave/:id        detalj + akcije
/operativa/rute               dnevni plan ruta
/operativa/analitika          trendovi, crne tačke (Faza 6)
/operativa/zajednica          rang naselja, akcije (Faza 7)
/operativa/vesti              uređivanje objava za građanski feed
```

### Dizajn tokeni

- Primarna: eko-zelena; neutralna pozadina; tamni režim opciono.
- **Popunjenost kontejnera:** `<50%` zelena · `50–79%` žuta · `80–94%` narandžasta · `≥95%` crvena
- **Prioritet prijave:** nizak · srednji · visok · kritičan
- **Status prijave:** primljeno → potvrđeno → u planu → rešeno (+ odbijeno)

---

## Faza 0 — Temelj

Bez vidljivih funkcija, ali sve posle ide brzo.

- [x] `npm install` u `frontend/`; dodati zavisnosti iz tabele
- [x] Path alias `@/` u `tsconfig.json` i `vite.config.ts` (traži ga shadcn)
- [x] Tailwind v4 + `npx shadcn@latest init`; `globals.css` sa tokenima boja
- [x] shadcn komponente: `button card badge input textarea select dialog sheet tabs table skeleton sonner separator tooltip label progress sidebar scroll-area`
- [x] `index.html`: `lang="sr-Latn"`, naslov, viewport
- [x] Router + `QueryClientProvider` + `Toaster` u `app/providers.tsx`
- [x] Layout **Građanin**: mobilni, bottom-nav (Početna · Prijavi · Raspored · Mapa · Profil)
- [x] Layout **Operativa**: sidebar + header, desktop
- [x] Landing `/` sa izborom zone
- [x] Zajedničke komponente: `PageHeader`, `EmptyState`, `ReportStatusPill`/`PriorityPill`, `FillLevelBadge`/`FillLevelBar`, `ApiStatus`, `ComingSoon`
- [x] `domain/types.ts` — svi domenski tipovi
- [x] `data/repo.ts` + `data/queries.ts` + `data/mock/` sa fixture-ima:
  - [x] žarišta — sada `GET /dumps` iz baze (40 aktivnih od 52 u registru); backend vraća i svedeno `stanje`, a skor rizika ostaje izveden u `lib/hotspots.ts` dok se `app.rizik` ne puni
  - [x] naselja — stvarna imena (Pirot, Sukovo, Petrovac, Krupac, Gnjilan, Gradašnica, Temska, Berilovac, Trnjana…)
  - [x] kontejneri (54: grad 9, prigradska 3, sela 2) sa istorijom 14 dana, predikcijom 7 dana i sezonskim skokovima
  - [x] kamioni (8)
  - [x] prijave (16, razni statusi i tipovi, sa AI skorom i objašnjenjima)
  - [x] raspored odvoza po naselju (fiksni: grad pon/sre/pet, prigradska uto/pet, sela 2× nedeljno)
  - [x] dnevni plan ruta (`mock/routes.ts`) — izbor stanica po hitnosti + poređenje sa fiksnim rasporedom
  - [x] mesta za odlaganje (reciklažna dvorišta, staklo/plastika, kabasti)
- [x] `npm run typecheck` i `npm run build` prolaze; `npm run dev` radi
- [x] Dashboard KPI kartice i građanska početna već čitaju mock (dokaz da lanac queries → repo → mock radi)

**Rezultat:** app se pokreće, navigacija radi, stranice su ljušture (`ComingSoon` sa brojem faze).

Pokretanje: `cd frontend && npm install && npm run dev` → http://localhost:5173

---

## Faza 1 — Građanin: prijava problema ⭐

Prvi zahtev izazova — „digitalna platforma za prijavljivanje problema sa otpadom“.

- [x] Čarobnjak `/gradjanin/prijava` (stepper, 4 koraka):
  - [x] Korak 1 — tip: prepunjen kontejner / divlja deponija / drugo
  - [x] Korak 2 — fotografija: `<input type="file" accept="image/*" capture>` + preview
  - [x] Korak 3 — lokacija: mapa sa pinom + „koristi moju lokaciju“ (geolocation) + izbor naselja
  - [x] Korak 4 — opis + pregled + „Pošalji“
- [x] Potvrda: broj prijave, status, toast
- [x] `/gradjanin/prijave` — lista mojih prijava (kartice, status pill, datum)
- [x] `/gradjanin/prijave/:id` — detalj sa vremenskom linijom statusa
- [x] `createPrijava()` upisuje u mock store; lista se osvežava (react-query invalidate)
- [x] Početna `/gradjanin`: veliko dugme „Prijavi problem“ + poslednja prijava

**Rezultat:** kompletan tok prijave na telefonu; prijava se čuva tokom sesije.

Dodatno urađeno (van originalnog opisa, ali deo iste celine):
- `LocationPicker` (`src/components/LocationPicker.tsx`) — Leaflet mapa, klik/prevlačenje pina, dugme geolokacije; najbliže naselje se automatski predlaže (`lib/settlements.ts`) i može se ručno promeniti.
- `PhotoInput` (`src/components/PhotoInput.tsx`) — slikaj/iz galerije, čuva se kao data URL (mock, bez pravog uploada).
- Ekran „Prijava je poslata“ sa brojem prijave i CTA na detalj/početnu.
- Timeline na `/gradjanin/prijave/:id` posebno renderuje slučaj „odbijeno“ (samo Primljeno → Odbijeno, sa razlogom).
- Ručno provereno u browseru (mobilni viewport): svi koraci čarobnjaka, slanje, detalj, lista sa filterima Sve/Otvorene/Zatvorene, osvežavanje početne.

---

## Faza 2 — Građanin: informisanje

- [ ] `/gradjanin/raspored` — izbor naselja (pamti se u `localStorage`) → sledeći odvoz + nedeljni raspored
- [ ] Početna prikazuje „Sledeći odvoz u {naselje}: {dan}“
- [ ] `/gradjanin/mapa` — mesta za odlaganje sa filterom po vrsti otpada
- [ ] `/gradjanin/vodic` — „Gde odlažem…?“ pretraga po vrsti otpada (baterije, ulje, kabasti, građevinski…)
- [ ] Info-sekcija „Nemaš pametni telefon?“ — statički prikaz SMS/Viber kanala i uloge MZ

**Rezultat:** građanska zona kompletna osim gamifikacije.

---

## Faza 3 — Operativa: mapa i kontejneri ⭐

Vizuelni centar demo-a.

- [ ] `/operativa` dashboard — KPI kartice:
  - [ ] kontejneri ≥80%
  - [ ] predviđena prelivanja u narednih 48h
  - [ ] aktivne prijave (nove / u toku)
  - [ ] kamioni na terenu danas
  - [ ] mini lista „hitno“ (top 5 kontejnera + top 5 prijava)
- [ ] `MapView` komponenta (react-leaflet) — jedna, koristi se svuda
- [ ] `/operativa/mapa` — slojevi sa uključi/isključi:
  - [ ] kontejneri — marker obojen po popunjenosti
  - [ ] istorijska žarišta — krug, veličina = broj godina evidentiranja, boja = `ponovo_se_stvara`
  - [ ] prijave građana — po statusu
  - [ ] filter po naselju i nivou rizika
  - [ ] klik na marker → popup sa sažetkom + link na detalj
- [ ] `/operativa/kontejneri` — tabela (shadcn `table`): naselje, popunjenost, trend, predviđeno kritično, poslednji odvoz; sort + filter
- [ ] `/operativa/kontejneri/:id` — detalj:
  - [ ] grafik: istorija 14 dana + predviđena kriva 7 dana + linija praga
  - [ ] „Kritično za X dana“ istaknuto
  - [ ] sezonske napomene (vikend, slava, vašar) kao bedževi na grafiku
  - [ ] mini mapa lokacije

**Rezultat:** operater vidi stanje sistema (mock „real-time“).

---

## Faza 4 — Operativa: prijave i AI prioritizacija

- [ ] `/operativa/prijave` — red sortiran po AI prioritetu; filteri: status, tip, naselje
- [ ] Prioritet sa **objašnjenjem** (mock): „blizu žarišta K-26 koje se ponavlja“, „3 prijave u 2 dana“, „kontejner na 92%“
- [ ] `/operativa/prijave/:id` — fotografija, mapa, istorija lokacije, povezani kontejner
- [ ] Akcije: **Dodaj u sledeću rutu** / **Poseban tim** / **Odbij** (sa razlogom) → promena statusa
- [ ] Deljeni mock store: promena statusa se odmah vidi u građanskim „Moje prijave“

**Rezultat:** zatvoren krug građanin ↔ operativa.

---

## Faza 5 — Operativa: rute i planiranje ⭐

„Wow“ za žiri — podaci → odluka.

- [ ] `/operativa/rute` — izbor dana; 8 kamiona kao kartice/tabovi
- [ ] Po kamionu: lista stanica (redosled, naselje, kontejner, procenjeno vreme)
- [ ] Svaka stanica nosi **razlog**: predviđeno prelivanje / prijava građana / rizik od divlje deponije / redovan obilazak
- [ ] Rute iscrtane na mapi (polyline, boja po kamionu), klik na kamion fokusira rutu
- [ ] Dugme „Generiši plan za sutra“ (mock — vraća unapred pripremljen plan uz kratku animaciju)
- [ ] Panel **poređenje sa fiksnim rasporedom**: km, broj stanica, pokriven rizik, preskočena sela bez potrebe
- [ ] Stanice dodate iz Faze 4 („Dodaj u sledeću rutu“) se pojavljuju u planu

**Rezultat:** jasno pokazuje prelaz sa fiksnog na prediktivni sistem.

---

## Faza 6 — Analitika i rukovodstvo 🔹

- [ ] `/operativa/analitika` — tabovi: Trendovi · Crne tačke · Ušteda
- [ ] Trendovi: prelivanja po nedelji, prijave po naselju, stopa ponovnog pojavljivanja deponija
- [ ] **Rang crnih tačaka** sa preporukom sistema: dodatni kontejner / češći odvoz / promena lokacije / akcija čišćenja
- [ ] Ušteda vs fiksni raspored: km, gorivo, broj prelivanja (mock serija po mesecima)
- [ ] „Pogled rukovodstva“ — sažetak na dashboardu sa 3–4 ključna broja

---

## Faza 7 — Angažovanje zajednice 🔹

- [ ] `/gradjanin/profil` — bodovi, bedževi, istorija (potvrđena prijava, učešće u akciji, reciklaža)
- [ ] `/operativa/zajednica` i deo na građanskoj strani — **„Najčistije selo meseca“** rang naselja
- [ ] Akcije čišćenja: lista događaja + „Prijavi učešće“
- [ ] Obaveštenja u aplikaciji: „Tvoja prijava je potvrđena, +10 bodova“

---

## Vesti — feed novosti (van faza)

Informisanje građana iz tačke 7 zahteva izazova: kada dolazi kamion, kada je
akcija čišćenja, šta ide u koju kantu.

- [x] `/gradjanin/vesti` — feed kartica (naslov, tekst, slika, datum), zakačene
  objave uvek na vrhu, pa najnovije prvo
- [x] Filter „Sve / moje naselje“; opštinske objave (`naselje_id = null`)
  ostaju vidljive i u filtru naselja — tako ih vraća i backend
- [x] Početna građanina prikazuje prvu objavu iz feeda i link na sve
- [x] `/operativa/vesti` — dodavanje, izmena, brisanje i kačenje objava, sa
  pregledom koji koristi istu `NewsCard` komponentu kao građanska strana
- [x] Povezano sa backendom: `GET /news` (javno), `POST`/`PATCH`/`DELETE /news`
  (administrator). Mock sloja za vesti više nema; posle svake izmene se
  invalidira ključ `['news']`, pa građanski feed pokazuje novo stanje

Odluke koje nisu očigledne iz koda:

- **Objavljivanje je administratorska radnja** (`lib/news.ts` → `canManageNews`).
  Isto proverava i backend (`AdminOnly`); ovde stoji da bi dugmad bila skrivena
  umesto da vrate 403. To je jedino mesto koje treba dirati ako se pravo proširi.
- **Svaka objava nosi SMS/Viber verziju** (`sms_tekst`). Feed je samo jedan
  kanal — selo bez pametnog telefona mora da dobije istu vest (CLAUDE.md, „Do
  not assume a smartphone“). Prazno polje je svesna odluka da objava ostaje samo
  u aplikaciji, a ne propust.
- **Granica SMS-a nije 160 nego zavisi od azbuke**: jedno č/ć/š/ž/đ prebacuje
  poruku u UCS-2 i granica pada na 70. Forma to računa istim pravilom kao
  backend (`lib/news.ts` ↔ `backend/src/news/news.sms.ts`), da bi korisnik video
  upozorenje pre slanja umesto 400 sa servera.
- **Izmena ne pomera vreme objave**: ispravka pravopisa ne sme da preskoči vest
  objavljenu u međuvremenu. `azurirana_at` se prikazuje posebno.
- **Izmena i kačenje nose `verzija`** iz poslednjeg čitanja; 409 znači da je neko
  drugi već menjao objavu, pa se lista osvežava umesto da se prepiše tuđa izmena.
- **Slika je URL, ne upload.** Objekat-storage za slike vesti još ne postoji
  (`docs/news-feed.md`), pa forma prima adresu već postavljene slike.
- **Lajkovi i komentari su demo.** Backend reakcije nema, pa `repo.getNews`
  dodaje `engagement` iz `mock/engagement.ts` — isti obrazac kao `photoUrl` na
  prijavi. Brojevi su seedovani ID-jem objave (stabilni pri osvežavanju); lajk
  se menja samo lokalno i ne čuva se, a broj komentara nije dugme jer komentara
  nema odakle da se otvore. Red se prikazuje samo u građanskom feedu.
- **Deljenje je pravo, ne demo.** `navigator.share` na telefonu otvara Viber,
  WhatsApp ili SMS — to je put kojim vest stiže do komšije bez aplikacije.
  Deli se `sms_tekst` kad postoji, jer je već napisan za telefon. Na desktopu se
  link kopira. Link vodi na `/gradjanin/vesti#vest-<id>` i feed skroluje do
  objave kad stigne sa API-ja.

---

## Faza 8 — Poliranje i integracija sa backendom

- [ ] Zamena mock → API po funkciji u `repo.ts`, kako endpointi stižu u `contracts/openapi.json`
  (može krenuti ranije, paralelno sa fazama 3+)
- [ ] Audit loading / error / empty stanja na svim ekranima (skeleton umesto „Loading…“)
- [ ] Responsivnost: građanin na 360px, operativa na 1280px+; tablet za oba
- [ ] Osnovna pristupačnost: fokus, labele, kontrast
- [ ] **Demo režim**: dugme „Simuliraj +1 dan“ — senzori se pune, predikcija se pomera, nova prijava stiže
- [ ] `npm run build` prolazi bez grešaka

---

## Radna pravila

- Grana po fazi: `feat/ui-faza-N-naziv`, PR na `main`.
- Pre commita hook pokreće `api:generate` + `tsc --noEmit` — `node_modules` mora biti instaliran i tipovi moraju prolaziti.
- Ne dirati `src/api/generated/` (hook blokira) ni `contracts/openapi.json` (generiše backend).
- Nema `fetch`/`axios` — kad stigne ugovor, samo `api` iz `src/api/client.ts`.
- Kad backend pita „kakav oblik podataka vam treba“ → pokazujemo `src/domain/types.ts`.
