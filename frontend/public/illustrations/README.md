# Ilustracije za građanski deo

Komponenta `src/components/citizen/Illustration.tsx` učitava `/illustrations/<name>.png`.
Dok fajl ne postoji, prikazuje se zamena (obojeni oblik + ikonica), pa aplikacija radi
i bez slika. Kad generišeš sliku, sačuvaj je ovde pod tačnim imenom — ništa u kodu
ne treba da se menja.

## Fajlovi koje aplikacija traži

| Fajl           | Gde se vidi                                  | Šta prikazuje                                         |
| -------------- | -------------------------------------------- | ----------------------------------------------------- |
| `kamion.png`   | Početna (kartica „Sledeći odvoz“), Raspored | Mali komunalni kamion, tri četvrtine, veseo, bez teksta |
| `prijava.png`  | Početna (kartica „Prijavi problem“)          | Osoba fotografiše telefonom pun kontejner              |
| `hvala.png`    | Kraj čarobnjaka prijave                      | Osoba sa podignutim palcem pored čistog kontejnera     |
| `bodovi.png`   | Profil (kartica bodova)                      | Pehar/medalja sa listom, konfete                       |
| `tip-pun_kontejner.png` | Čarobnjak prijave, korak „Tip“      | Zeleni kontejner pun do vrha, poklopac odignut         |
| `tip-prelivanje.png`    | Čarobnjak prijave, korak „Tip“      | Isti kontejner + kese na zemlji pored njega            |
| `tip-divlja_deponija.png` | Čarobnjak prijave, korak „Tip“    | Gomila otpada na livadi, bez kontejnera                |
| `tip-ostecen_kontejner.png` | Čarobnjak prijave, korak „Tip“  | Prevrnut kontejner sa slomljenim točkom                |
| `tip-drugo.png`         | Čarobnjak prijave, korak „Tip“      | Kabasti otpad: stari dušek i nekoliko dasaka           |

Slike `tip-*` stoje u pločici 56×56 px na obojenoj podlozi (zelena / žuta /
koralna po tipu), pa motiv treba da bude **jedan objekat, krupan, bez scene** —
kao ikonica-ilustracija, ne kao slika sa pozadinom.

Format: PNG sa **providnom pozadinom**, kvadrat 1024×1024, glavni motiv centriran
sa ~10% margine (kartice ga skaliraju na 80–150 px).

**Zamka:** generator često vrati JPG sa *nacrtanim* sivo-belim kockicama umesto
prave providnosti. Skini ih skriptom (traži Python sa numpy, scipy i Pillow):

```bash
python scripts/strip-checkerboard.py ulaz.jpg public/illustrations/ime.png
```

Skripta skida neutralne svetle piksele povezane sa ivicom, iseče prazninu,
vrati kvadrat i smanji na 512 px (dovoljno za 150 px na 3× ekranu).

## Stil (isti u svakom promptu)

Paleta je obavezna, da se slike slažu sa UI tokenima iz `src/styles/globals.css`:

- forest `#588265` (tamnozelena, glavna)
- jade `#92C3A4` (svetlozelena)
- sour apple `#DBF5BE` (bledo zelena)
- sunflower `#FFCE55` (žuta)
- vibrant rose `#FB6E52` (koralna, akcenat)
- green tea `#F2F6EB` (pozadina — ali u PNG-u pozadina ostaje providna)

Zajednički deo prompta (Nano Banana / Gemini image), zalepi ispred svakog opisa:

```
Flat vector illustration, friendly and modern app style, similar to Duolingo and
Headspace onboarding art. Simple rounded shapes, no outlines, soft organic blobs
behind the subject, subtle grain texture. Limited palette ONLY: dark green #588265,
light green #92C3A4, pale green #DBF5BE, yellow #FFCE55, coral #FB6E52, cream #F2F6EB,
plus white and a dark charcoal #1F2A22 for small details. No text, no logos, no
gradients, no drop shadows. Transparent background, square 1024x1024, subject
centered with 10% margin.
```

## Promptovi po fajlu

**kamion.png**
```
<zajednički deo> Subject: a small cute municipal garbage truck seen from a 3/4
front angle, dark green cab, pale green body, coral wheel rims, a tiny leaf
symbol on the door, driving on a soft green blob. Cheerful, slightly rounded
proportions like a toy.
```

**prijava.png**
```
<zajednički deo> Subject: a young woman in a yellow jacket taking a photo with
her phone of an overflowing green waste container next to a coral trash bag; a
small location pin floats above the container. Rural village hint: a low stone
wall and a tree behind, drawn as simple blobs.
```

**hvala.png**
```
<zajednički deo> Subject: a smiling man giving a thumbs up next to a clean,
closed green waste container; a few confetti dots in yellow and coral around
him; a small green sprout growing beside the container.
```

**bodovi.png**
```
<zajednički deo> Subject: a golden trophy cup (#FFCE55) with a dark green leaf
emblem on the front, standing on a pale green blob, three coral and green
confetti pieces in the air, a small medal ribbon in coral leaning on the base.
```

## Promptovi za `tip-*` (kante i otpad)

Za svih pet koristi isti prefiks, pa se razlikuje samo predmet:

```
<zajednički deo> Single object icon-illustration, one subject only, no scene,
no ground, no background shapes. Chunky rounded shapes with a slight 3/4 view,
like the recycling bins in modern eco apps. Subject:
```

- `tip-pun_kontejner`: `a dark green wheeled municipal waste container, lid
  slightly lifted by bags overflowing from the top, nothing on the ground.`
- `tip-prelivanje`: `a dark green wheeled waste container with the lid open and
  three coral and yellow garbage bags piled on the ground beside it.`
- `tip-divlja_deponija`: `a messy pile of mixed waste — bags, a tire, a broken
  crate, bottles — with no container, one small green sprout at the edge.`
- `tip-ostecen_kontejner`: `a dark green wheeled waste container tipped over on
  its side, one wheel missing, a crack on the lid.`
- `tip-drugo`: `a rolled-up old mattress leaning on two wooden planks and a
  cardboard box, bulky household waste.`

## Vrste otpada (opciono)

Ako se ista ideja želi i na mapi/vodiču (staklo, plastika, papir, kabasti,
elektronski, baterije, gume, zeleni, reciklažno dvorište), generiši po jednu
po istom prefiksu — npr. `a green glass bottle and a jar`, `a crushed PET
bottle and a plastic bag`, `a stack of folded cardboard`, `an old CRT monitor
and a phone`, `two AA batteries and a pill blister` — i sačuvaj kao
`otpad-<tip>.png`. Slotovi u kodu za njih još ne postoje; dodaju se na isti
način kao `tip-*` (jedan `Illustration` unutar obojene pločice).

## Ikonice

Interfejs koristi `lucide-react` (linijske ikonice) obojene tokenima palete, u
zaobljenim „pločicama“ — to daje konzistentan set bez generisanja. Ako se ipak
želi ilustrovan set (kao u referentnim aplikacijama), generiši svaku po istom
zajedničkom promptu, uz „single icon, 512x512, one object only“, i uvezi ih
preko iste `Illustration` komponente. Predlog motiva: kontejner (pun / prazan /
oštećen), gomila otpada (divlja deponija), kamion, mapa sa pinom, kalendar,
list/reciklaža, pehar, SMS oblačić.
