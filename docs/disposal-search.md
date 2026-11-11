# Disposal search, drop-off sites and waste collectors

"Gde da odložim?" on the citizen map (`/gradjanin/mapa`): the citizen types
what they want to get rid of, in whatever words and script they use, and gets
either the places on the map that take it or the people who do. It serves the
prevention goal in `CLAUDE.md`: an old wardrobe with nowhere obvious to go is
how a roadside dump starts.

## The flow

```
"staro gvožđe"  ──▶ POST /disposal/suggest  ──▶ { materijal: metal, sakupljaci[], kontakt }
                                                        │
        frontend: does any site from GET /disposal/sites list `metal` in materijali?
            yes ──▶ map narrows to those sites + "Pronađeno" toast
            no  ──▶ popup: collectors who take it, then JKP „Regionalna deponija Pirot"
```

**Nothing in code maps a material to a site.** Sites and collectors each state
what they take in one shared vocabulary, and the match is a data question. An
earlier draft matched a material to a site's *type name*, which filed "metal"
as unmatched even when a site on the map took metal — the reason this rule
exists.

## One vocabulary: `app.materijal_otpada`

`staklo`, `plastika`, `papir`, `kabasti`, `elektronski`, `baterije`, `gume`,
`zeleni`, `metal`, `iverica`, `drvo`, `tekstil`, `gradjevinski`. Used by the
classifier's output, `mesto_odlaganja.materijali` and `sakupljac.materijali`.
Deliberately not `app.tip_otpada`, which names container streams (`komunalni`,
`suvi_reciklabilni`) — a different question.

Classification rules (the prompt and the keyword table agree):

- An electrical appliance is `elektronski` even though it is mostly metal.
- Particle-board furniture is `iverica`, not `kabasti`.
- Several items named → the first one.
- Not about disposal ("kako je vreme sutra") → **null**, never a guess.

## Drop-off sites (`app.mesto_odlaganja`)

**Real sites only, each with a required `izvor`.** A pin sends a person
somewhere, so nothing goes on the map without a source. On 2026-09-19 that was
two places:

| Site | Takes (materijali) | Location | Source |
|---|---|---|---|
| Otkup i prodaja sekundarnih sirovina KROLUKS | metal, baterije (car batteries) | Vojvode Mišića — street only, geocoded (Nominatim) | PTT imenik Srbije listing |
| JKP „Regionalna deponija Pirot" | — (mixed waste) | "4,5 km SZ od centra", parcel 277 — approximate | LPUO, `waste-scraper/IZVORI.md` §2 |

What could **not** be sourced, and is therefore not on the map: a working
recycling yard (Pirot has a site set aside for one, at project stage in 2023),
e-waste or battery drop-off points, glass/paper points. The earlier map showed
11 such sites; all were invented demo data and were removed.

`geo_preciznost` reuses the dump tables' enum: both rows are `geokodirano`, and
the UI says "lokacija na mapi je približna". `tip` (deponija, otkup_sirovina,
reciklazno_dvoriste) is what a site *is* — icon, colour, chip — not what it takes.

Adding a real site is an `insert` with its `materijali` and `izvor`; the map's
chips and the search's matches follow without a code change.

## Collectors (`app.sakupljac`)

Sakupljači sekundarnih sirovina: people who take what JKP does not.

- **Not staff.** A `korisnik` signs in to act inside the system; a collector
  never signs in — they are a contact handed out. Separate table, not a new
  `uloga_korisnika`.
- **Minimal data:** first name, last name, phone — plus `materijali`, the one
  column the feature cannot work without ("who takes metal").
- **Phone numbers are public by design**, the opposite of
  `gradjanin.telefon_e164`. So only an **administrator** can add a collector
  (nobody can publish a stranger's number), and there is no public list — a
  citizen only sees the few who match their query (max 10).
- Stored as E.164; the API accepts "064 123 4567", "064/123-45-67", "00381…"
  or a Pirot landline and normalises, so one number cannot become two rows.
- The 5 seeded collectors are **demo** (`5eed…` ids): made-up names and
  numbers. Replace them with real, consenting collectors before public use —
  the popup offers tap-to-call.

## The classifier

Behind the `WASTE_CLASSIFIER` token:

| | When | Cost |
|---|---|---|
| `OpenAiWasteClassifier` | `OPENAI_API_KEY` is set | ~770 tokens per uncached query |
| `KeywordWasteClassifier` | no key, **and** as the fallback of the above | free |

The model is an improvement, never a dependency: HTTP error, timeout (8 s),
broken JSON or a category outside the enum all fall back to keywords, and the
search still answers. `izvor` in the response says which one did. Output is
strict structured JSON, validated again on our side. User text goes in its own
message, never into the prompt.

### Choosing the model

A one-off test with 33 phrases people actually type — Cyrillic, no diacritics, ijekavian, the
Torlakian speech of Pirot ("kude da go iznesem"), trade words (univer, šut,
šperploča), typos, and three that are not about disposal. On 2026-09-19:

| Classifier | Correct | Median latency |
|---|---|---|
| `gpt-5.6-luna` | **33/33** | 0.93 s |
| keyword table | 29/33 (31/33 after adding ćebad/jorgan/karoserija) | — |

The keyword table's remaining misses are typos ("frizder", "iverca"); none of
its misses were wrong guesses. This was a one-off check; the script that ran
it was removed so no routine command can spend money. Unit tests fake `fetch`
and never reach OpenAI.

`gpt-5.6-luna` spent 0 reasoning tokens, and rejects `temperature: 0` and
`reasoning_effort: 'minimal'`, so the adapter sends neither.

### Cost controls

A public endpoint that reaches a paid model is a bill anyone can run up:

- 30 searches per 10 minutes per address (429 after).
- 200-character input cap (DTO and input field); `max_completion_tokens: 200`.
- 500-entry in-process memo of model answers, keyed on the normalised text
  ("Frižider" = "frizider"). Fallback answers are not cached.
- Frontend: the search is a mutation, never refetched on its own.

## The default contact

Every answer carries JKP „Regionalna deponija Pirot"
(`backend/src/disposal/default-contact.ts`). **Its phone (`010 322 540`) and
email (`kontakt@example.com`) are demo placeholders**: the utility's site refuses
automated requests, so real values could not be verified. Replace before this
reaches anyone outside the team.

## Without a smartphone

The search box is app-only, but the answer *is* a phone number — collectors and
the landfill are reached by calling, which a relative or a local-community
president can do. The classifier is a service with no HTTP or map knowledge, so
when the SMS/Viber gateway (`POST /messages/inbound`, planned) arrives, "gde da
bacim frizider" by SMS can go through the same `DisposalService.suggest`.

## API

| Method | Path | operationId | Access |
|---|---|---|---|
| GET | `/disposal/sites` | `listDisposalSites` | public |
| POST | `/disposal/suggest` | `suggestDisposal` | public, rate-limited |
| GET | `/collectors` | `listCollectors` | admin |
| POST | `/collectors` | `createCollector` | admin; 409 on a duplicate phone |
| DELETE | `/collectors/{id}` | `deleteCollector` | admin |

## Not yet decided

- **Real landfill contact** — see above.
- **More real sites.** Only two could be sourced; the utility (JKP Komunalac,
  Regionalna deponija) is the source for the rest.
- **An admin screen for collectors.** Managed through the API (Swagger at
  `/docs`) for now.
