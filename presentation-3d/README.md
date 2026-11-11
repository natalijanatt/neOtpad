# 3D demonstracija rada aplikacije

Gotov video: `out/pirot-3d-demonstracija.mp4` (44 sekunde, 1920 × 1080, 24 fps, bez naracije).

Pokretanje interaktivne verzije:

```powershell
cd presentation-3d
npm.cmd ci
npm.cmd start
```

Otvoriti http://localhost:5180/demo.html?play=1. Plejer podržava pauzu, pomeranje kroz video i ponovno puštanje.

Za izvoz u drugom terminalu: `npm.cmd run render:demo`. Za kontrolne kadrove: `npm.cmd run stills:demo`.
Koristi instalirani Chrome (putanja se može zadati promenljivom `CHROME_PATH`) i lokalni `bin/ffmpeg.exe`.

## Scenarij

| Vreme | Prikaz |
|---|---|
| 0–8 s | Kontejner u Berilovcu, presek, ultrazvučno merenje i rast popunjenosti do 93%. |
| 8–16 s | Animirana poruka: senzor → LoRaWAN gateway → server, provera i čuvanje očitavanja. |
| 16–21 s | Prioriteti na reljefu Pirota, izbor hitnih mesta, pripajanje usputnog kontejnera i određivanje redosleda obilaska. |
| 21–33 s | Kamion obilazi pet mesta, zastaje radi sakupljanja, nivoi padaju na 0%, povratak u bazu. |
| 33–41 s | Detalj podizanja i pražnjenja kontejnera preko zadnjeg utovara i potvrda novog stanja serveru. |
| 41–44 s | Završni prikaz celog ciklusa. |

Svaki segment je skraćen u odnosu na prvobitnih 78 sekundi, ali ne podjednako. Prenos od senzora do servera ide na 1,5× (8 umesto 12 sekundi) jer je to jedini korak koji se na terenu ne vidi — paket mora da se isprati putem; najveća skraćenja su u planiranju (5 umesto 14 sekundi). `EDIT` u `src/demo.js` određuje ritam i interaktivnog pregleda i MP4 izvoza.

## Podaci i obim demonstracije

Korišćena je postojeća 3D geometrija projekta, lokalni reljef iz `terrain.json` i koordinate naselja iz `src/data.js`. Sva očitavanja su simulirana: Berilovac 93%, Izvor 87%, Krupac 96%, Poljska Ržana 91%, Trnjana 18%, Blato 20%.

Ruta je **šematska**, između stvarnih koordinata naselja, bez putne mreže. Hitna mesta su ona sa popunjenošću od 80% ili više; za ta četiri prikaz bira najkraći obilazak enumeracijom 24 redosleda prema ravanskim rastojanjima.

Preostala dva kontejnera pokazuju da odluka ne zavisi samo od očitanog procenta. Za svaki se računa najjeftinije umetanje u već izabranu trasu: **Trnjana 18%** leži između Krupca i Poljske Ržane, umetanje košta oko 0,1 km i zato se prazni usput; **Blato 20%** je na suprotnoj strani kotline i traži skretanje od oko 12,5 km, pa ostaje van obilaska iako ima viši procenat. Prag umetanja je 1,5 km (`DETOUR_LIMIT` u `src/demo.js`). Kadar mape je zbog Blata širi nego u ranijoj verziji.

To nije izvršavanje produkcionog optimizatora niti navigaciona ruta. Ne prikazuje se izmišljena ušteda kilometara. Aplikacija koristi širi model prioriteta i ograničenja vozila opisan u `../docs/routing-heuristic.md`; sensor/server tok prati `../docs/sensor-telemetry.md`.

Detalj pražnjenja je uvećana ilustracija postupka sa prethodnog obilaska, a ne dodatna stanica. Kontejner se prazni onako kako se prazni u stvarnosti: stoji sa češljem (DIN EN 840) okrenutim ka zadnjoj strani kamiona, diže se dok češalj ne nalegne na šipku na zadnjem utovaru, pa se obrće oko te šipke tako da otvor dođe iznad sanduka; poklopac pada sam kada kontejner pređe prevojnu tačku. Obrtanje u suprotnu stranu bi otpad prosulo na put iza kamiona.

Jedini tekst u filmu je očitavanje kontejnera i naselje u kom stoji — na mapi kao `Berilovac 93%`, u krupnom planu iznad samog kontejnera. Ispražnjen kontejner piše `✓ 0%`. Naslovi, panel sa podacima i traka koraka su uklonjeni, a sa njima i ograda „3D demonstracija · simulirani podaci“ — ona sada mora da se kaže uz video ili napiše na slajdu. Kontejner van rute nema natpis „van rute“: njegova oznaka je prigušena, kao i marker naselja.
