# Domain glossary

Serbian domain terms that appear in the source data, and therefore in database
columns, API fields and the UI. Keep these spellings; do not invent English
synonyms for them mid-codebase.

| Term | Meaning |
|---|---|
| `divlja deponija` | illegal dump / fly-tipping site |
| `naselje` | settlement (village or urban neighbourhood) |
| `mesna zajednica` | local community — administrative sub-unit, and the unit the "cleanest village" competition scores |
| `kontejner` | shared waste container (the sensored unit; not a household bin) |
| `sabirno mesto` | collection point serving several households |
| `odvoz` | collection round |
| `prelivanje` | container overflow |
| `sanacija` | remediation of a dump site |
| `katastarska parcela` | cadastral parcel — the identifier the city plan uses for dump sites |
| `slava` | village or family patron-saint day; a recurring local waste spike |
| `vašar` | fair; another recurring spike |
| `JKP` | *javno komunalno preduzeće*, the municipal utility operating the trucks |
| `LPUO` | *Lokalni plan upravljanja otpadom*, the city's 2021–2031 waste-management plan |
| `SEPA` / `NRIZ` | national environmental agency and its register — the source of the illegal-dump registry data |
| `plava kanta` | the blue bin: dry recyclables **except glass**. In the schema this is `tip_otpada = 'suvi_reciklabilni'`, because paper, plastic and metal travel together to the separation line |
| `zelena kanta` | the green bin: wet and everything not recyclable — `tip_otpada = 'komunalni'` |
| `žuti kontejner` | the yellow 1.1 m³ container, for glass only |
| `iznošenje smeća` | the utility's own term for household collection; the phrase to look for in JP Komunalac documents |
| `pokrivenost` | whether organised collection reaches a settlement. Three-state (`da` / `ne` / `nepoznato`), never a boolean — see `pokrivenost_naselja` |
| `sakupljač sekundarnih sirovina` | a collector of secondary raw materials — takes scrap metal, e-waste, particle board and similar that JKP does not; `app.sakupljac` |
| `otkup sirovina` | a business that buys secondary raw materials (scrap metal, car batteries); a drop-off site type |
| `iverica` | particle board (also "univer", MDF, "medijapan"); most cheap furniture, and a collector's material, not a container's |
| `ciklus odvoza` | how often the round returns: the published schedule is fortnightly, and monthly for two villages, not weekly |

## Naming rule

Domain fields that mirror source data keep the Serbian name (`naselje`,
`divlja_deponija`, `prelivanje`). Framework-level code — services, modules,
generic infrastructure — stays English. The point is that a column name can be
traced back to the CSV it came from without a translation table.
