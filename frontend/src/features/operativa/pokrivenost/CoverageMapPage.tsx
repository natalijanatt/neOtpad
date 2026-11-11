import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { pinIcon } from '@/components/MultiMarkerMap';
import { PageHeader } from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useHotspots, useSettlementCoverage } from '@/data/queries';
import type { Hotspot, SettlementCoverage } from '@/domain/types';
import { PIROT_CENTER } from '@/lib/geo';
import { HOTSPOT_STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';

type LayerKey = 'ima' | 'nema' | 'deponije';

/**
 * Dva datirana pogleda na istu stvar, i namerno se ne spajaju u jedan broj: plan
 * iznošenja iz 2018 kaže koja sela kamion obilazi, izveštaj za 2024 kaže gde stoje
 * kontejneri. Spisak iz 2024 je širi (42 sela prema 23) i noviji, pa je podrazumevan,
 * ali odsustvo iz njega NIJE dokaz da naselje nema uslugu — zato prekidač, a ne
 * prepisivanje starijeg izvora novijim.
 */
type CoverageSource = 'kontejneri2024' | 'plan2018';

const COVERED_COLOR = 'var(--coverage-yes)';
const UNCOVERED_COLOR = 'var(--coverage-no)';
const DUMP_COLOR = 'var(--level-high)';
const DUMP_CLEARED_COLOR = 'var(--muted-foreground)';

const SOURCE_LABEL: Record<CoverageSource, string> = {
  kontejneri2024: 'Kontejneri (izveštaj 2024)',
  plan2018: 'Odvoz (plan 2018)',
};

/** Šta plavo i crveno znače kod izabranog izvora — naslov legende se menja s njim. */
const SOURCE_LEGEND: Record<CoverageSource, { yes: string; no: string }> = {
  kontejneri2024: { yes: 'Ima kontejnere', no: 'Nije na spisku' },
  plan2018: { yes: 'Naselja sa odvozom', no: 'Naselja bez odvoza' },
};

const SOURCE_NOTE: Record<CoverageSource, string> = {
  kontejneri2024:
    'Spisak sela sa postavljenim kontejnerima iz godišnjeg izveštaja JP Komunalac za 2024: 53 lokacije i 518 kontejnera, od čega se 42 poklapaju sa zvaničnim naseljima — ostalo su stajališta (Zavojsko jezero, Sukovski manastir, „4. kilometar“, auto-put za Dimitrovgrad) i Belo Polje, koje tada još nije bilo zasebno naseljeno mesto. Crveno znači „nije u toj tabeli“, a ne „nema uslugu“: isti izveštaj navodi i tri vozila za iznošenje otpada iz kanti, pa naselje može biti u sistemu i bez zajedničkih kontejnera.',
  plan2018:
    'Plan iznošenja smeća iz seoskih naselja, JP Komunalac, Program poslovanja za 2018 — 31 red, od kojih su 23 naselja, a ostalo stajališta; grad Pirot ulazi iz cenovnika za 2026. Za ostala naselja „nema odvoza“ je zaključak iz LPUO 2021-2031, ne prepis.',
};

const LPUO_CLASS_LABEL: Record<SettlementCoverage['lpuoClass'], string> = {
  grad: 'grad',
  I: 'preko 1.000 stanovnika',
  II: '100–1.000 stanovnika',
  III: 'ispod 100 stanovnika',
  IV: 'ispod 10 stanovnika',
};

/**
 * Da li naselje po izabranom izvoru dobija plavi pin. Grad u režimu 2024 nema podatak
 * (`containers2024 === null`) jer je tabela o selima — ali njegova pokrivenost stoji u
 * cenovniku za 2026, pa se crta plavo, a popup kaže iz kog izvora.
 */
function isCovered(n: SettlementCoverage, source: CoverageSource): boolean {
  if (source === 'plan2018') return n.hasOrganizedCollection;
  return n.containers2024 ?? n.hasOrganizedCollection;
}

/** Očišćene i one u sanaciji su istorija lokacije, a ne ono što tamo stoji danas. */
const isCleared = (h: Hotspot) => h.status === 'ocisceno' || h.status === 'u_sanaciji';

/**
 * Pulsira samo ono što traži potez: deponija prijavljena i za poslednju godinu
 * registra, ili sveža prijava građana. Kad bi treperilo svih 52, puls bi prestao
 * da išta znači — a upravo to razlikovanje je poenta karte.
 */
const isLive = (h: Hotspot) => !isCleared(h) && (h.status === 'aktivna' || h.status === 'prijavljeno');

export function CoverageMapPage() {
  const { data: naselja, isPending } = useSettlementCoverage();
  // `sve` namerno: ovo je pregled svega što je zabeleženo, uključujući očišćene
  // lokacije — one su dokaz da se mesto ponavlja, a ne prazan red.
  const { data: hotspots } = useHotspots({ sve: true });

  const [source, setSource] = useState<CoverageSource>('kontejneri2024');
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ ima: true, nema: true, deponije: true });
  const toggleLayer = (key: LayerKey) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  // 72 naselja i ~50 deponija — filtriranje po renderu je jeftinije od memoizacije.
  const covered = (naselja ?? []).filter((n) => isCovered(n, source));
  const uncovered = (naselja ?? []).filter((n) => !isCovered(n, source));
  const dumps = hotspots ?? [];

  const legend = SOURCE_LEGEND[source];
  const layerDefs: Array<{ key: LayerKey; label: string; icon: typeof CheckCircle2; color: string; count: number }> = [
    { key: 'ima', label: legend.yes, icon: CheckCircle2, color: COVERED_COLOR, count: covered.length },
    { key: 'nema', label: legend.no, icon: XCircle, color: UNCOVERED_COLOR, count: uncovered.length },
    { key: 'deponije', label: 'Divlje deponije', icon: Trash2, color: DUMP_COLOR, count: dumps.length },
  ];

  // Opština je razvučena od Bele Palanke do Stare planine; fiksan zoom bi
  // odsekao severna i istočna sela, a poenta prikaza je da se vidi svih 72.
  // Granice se računaju iz naselja, ne iz deponija — deponije su podskup.
  // Memoizacija nije štednja nego ispravnost: nov niz na svaki render bi
  // vratio prikaz na početak čim dispečer isključi sloj ili otvori popup.
  const bounds = useMemo<LatLngBoundsExpression | undefined>(
    () => (naselja?.length ? naselja.map((n) => [n.lat, n.lon] as [number, number]) : undefined),
    [naselja],
  );

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] flex-col gap-4">
      <PageHeader
        title="Pokrivenost"
        description="Svih 72 naselja grada Pirota: plavo tamo gde usluga stiže, crveno gde je izvor ne pominje. Preko toga registar divljih deponija — one nastaju upravo tamo gde odvoza nema."
        actions={
          <Select value={source} onValueChange={(v) => setSource(v as CoverageSource)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SOURCE_LABEL) as CoverageSource[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SOURCE_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {layerDefs.map(({ key, label, icon: Icon, color, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleLayer(key)}
            aria-pressed={layers[key]}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              layers[key] ? 'text-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
            style={layers[key] ? { borderColor: color, backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)` } : undefined}
          >
            <Icon className="size-3.5" style={{ color }} />
            {label}
            <span className="rounded-full bg-muted px-1.5 text-[10px]">{count}</span>
          </button>
        ))}
        <p className="ml-auto hidden text-xs text-muted-foreground lg:block">
          Puls = aktivna ili sveže prijavljena; veličina kruga = broj godina evidentiranja; isprekidan krug je očišćena ili u
          sanaciji.
        </p>
      </div>

      {isPending ? (
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border">
          <MapContainer center={[PIROT_CENTER.lat, PIROT_CENTER.lon]} zoom={11} className="h-full w-full" attributionControl={false}>
            {bounds ? <FitToSettlements bounds={bounds} /> : null}
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {/* Deponije se crtaju prve da bi pinovi naselja ostali iznad njih. */}
            {layers.deponije
              ? dumps.map((h) => {
                  const cleared = isCleared(h);
                  const color = cleared ? DUMP_CLEARED_COLOR : DUMP_COLOR;
                  return (
                    <CircleMarker
                      key={h.id}
                      center={[h.lat, h.lon]}
                      radius={5 + Math.min(h.yearsRecorded.length, 6) * 2}
                      pathOptions={{
                        color,
                        fillColor: color,
                        fillOpacity: cleared ? 0.15 : 0.35,
                        weight: 1.5,
                        dashArray: cleared ? '3 3' : undefined,
                        className: isLive(h) ? 'zariste-puls' : undefined,
                      }}
                    >
                      <Popup>
                        <DumpPopup hotspot={h} />
                      </Popup>
                    </CircleMarker>
                  );
                })
              : null}

            {(naselja ?? [])
              .filter((n) => (isCovered(n, source) ? layers.ima : layers.nema))
              .map((n) => (
                <Marker
                  key={n.id}
                  position={[n.lat, n.lon]}
                  icon={pinIcon(isCovered(n, source) ? COVERED_COLOR : UNCOVERED_COLOR, undefined, 24)}
                >
                  <Popup>
                    <SettlementPopup naselje={n} source={source} />
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{SOURCE_NOTE[source]}</p>
    </div>
  );
}

/**
 * Uklapa prikaz u sva naselja. Ide kao dete mape, a ne kao `bounds` na
 * `MapContainer`: kontejner je u flex koloni i u trenutku prvog crtanja još
 * nema konačnu visinu, pa bi Leaflet računao uklapanje po pogrešnoj — i
 * odsekao južna sela. `invalidateSize` prvo javi pravu veličinu.
 */
function FitToSettlements({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [28, 28] });
  }, [map, bounds]);
  return null;
}

function SettlementPopup({ naselje, source }: { naselje: SettlementCoverage; source: CoverageSource }) {
  const covered = isCovered(naselje, source);
  // Grad u režimu 2024: tabela o selima o njemu ne govori, pa se kaže odakle onda
  // dolazi plavo, umesto da pin tiho tvrdi nešto što izvor nije rekao.
  const fromOtherSource = source === 'kontejneri2024' && naselje.containers2024 === null;
  const badge = covered ? (source === 'kontejneri2024' ? 'ima kontejnere' : 'ima odvoz') : 'nije na spisku';

  return (
    <div className="min-w-56 space-y-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{naselje.name}</p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: covered ? COVERED_COLOR : UNCOVERED_COLOR }}
        >
          {badge}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{LPUO_CLASS_LABEL[naselje.lpuoClass]}</p>

      {naselje.pickupsPerWeek !== null ? (
        <p className="text-xs">
          Plan 2018: {naselje.pickupsPerWeek}× nedeljno
          {naselje.containers1100 !== null ? ` · ${naselje.containers1100} kontejnera od 1,1 m³` : ''}
        </p>
      ) : null}
      {naselje.households !== null ? (
        <p className="text-xs">
          {naselje.households.toLocaleString('sr-RS')} domaćinstava{' '}
          <span className="text-muted-foreground">(popisna brojka, ne broj korisnika)</span>
        </p>
      ) : null}

      {/* Oba izvora stoje uz svako naselje, i kad se ne slažu — razlika između 2018 i
          2024 je sama po sebi podatak (npr. Staničenje: nije u planu, ima kontejnere). */}
      <div className="space-y-0.5 border-t pt-1 text-[11px] text-muted-foreground">
        {fromOtherSource ? (
          <p>Izveštaj za 2024 je spisak sela; grad pokriva {naselje.coverageSource}.</p>
        ) : (
          <>
            <p>
              Kontejneri {naselje.containers2024Year ?? 2024}: {naselje.containers2024 ? 'na spisku' : 'nije na spisku'}
            </p>
            <p>
              Odvoz {naselje.coverageYear ?? 2018}: {naselje.hasOrganizedCollection ? 'u planu' : 'nije u planu'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function DumpPopup({ hotspot }: { hotspot: Hotspot }) {
  return (
    <div className="min-w-52 space-y-1 text-sm">
      <p className="font-semibold">
        {hotspot.id} · {hotspot.name}
      </p>
      <p className="text-xs text-muted-foreground">{hotspot.settlementName}</p>
      <p className="text-xs">
        {HOTSPOT_STATUS_LABEL[hotspot.status]} · evidentirano {hotspot.yearsRecorded.length}× ({hotspot.firstSeenYear}–
        {hotspot.lastSeenYear})
      </p>
      <p className="text-xs">
        Ponovo se stvara: <span className="font-medium">{hotspot.recurs}</span>
      </p>
      {hotspot.geoPrecision !== 'registarska_tacka' ? (
        <p className="text-[11px] text-muted-foreground">Koordinata je približna ({hotspot.geoPrecision.replace(/_/g, ' ')}).</p>
      ) : null}
    </div>
  );
}
