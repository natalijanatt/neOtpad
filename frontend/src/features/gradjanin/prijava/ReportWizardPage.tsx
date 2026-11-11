import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Loader2, PartyPopper, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { GeoPoint, Id, NewReportInput, PhotoReceipt, ReportSize, ReportType } from '@/domain/types';
import { Illustration } from '@/components/citizen/Illustration';
import { REPORT_TYPE_ICON, REPORT_TYPE_TONE } from '@/components/citizen/reportType';
import { ScreenHeader } from '@/components/citizen/ScreenHeader';
import { LocationPicker, type LocationSource } from '@/components/LocationPicker';
import { PhotoInput } from '@/components/PhotoInput';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateReport, useSettlementOptions } from '@/data/queries';
import { PIROT_CENTER } from '@/lib/geo';
import { REPORT_SIZE_LABEL, REPORT_TYPE_LABEL } from '@/lib/labels';
import { requiresDescription } from '@/lib/reports';
import { normalizeSearch } from '@/lib/search';
import { nearestSettlement } from '@/lib/settlements';
import { cn } from '@/lib/utils';
import { StepIndicator } from './StepIndicator';

const STEPS = ['Tip', 'Fotografija', 'Lokacija', 'Opis'];
const LAST_STEP = STEPS.length;

/** Naslov i objašnjenje svakog koraka — uvek na istom mestu, ispod indikatora. */
const STEP_COPY: Record<number, { title: string; description: string }> = {
  1: { title: 'Šta prijavljuješ?', description: 'Izaberi ono što najbolje opisuje problem.' },
  2: {
    title: 'Dodaj fotografiju',
    description: 'Ekipi pomaže da proceni količinu i nađe mesto. Prijava je potpuna i bez nje.',
  },
  3: { title: 'Gde se problem nalazi?', description: 'Postavi pin na mapi i proveri naselje.' },
  4: { title: 'Opiši i pošalji', description: 'Još par detalja, pa pregled pre slanja.' },
};

const TYPE_OPTIONS: Array<{ value: ReportType; hint: string }> = [
  { value: 'pun_kontejner', hint: 'Kontejner je pun, ali otpad još nije izvan njega' },
  { value: 'prelivanje', hint: 'Kese i otpad stoje pored kontejnera' },
  { value: 'divlja_deponija', hint: 'Otpad odložen van kontejnera, na otvorenom' },
  { value: 'ostecen_kontejner', hint: 'Polomljen, prevrnut ili izgoreo kontejner' },
  { value: 'drugo', hint: 'Kabasti otpad, šut, nešto drugo — opiši u poslednjem koraku' },
];

/** Veličina kao dugmad, ne select: jedan dodir umesto dva, a opcije su samo četiri. */
const SIZE_OPTIONS: Array<{ value: ReportSize | ''; label: string }> = [
  { value: '', label: 'Ne znam' },
  ...(['mala', 'srednja', 'velika'] as ReportSize[]).map((s) => ({ value: s, label: REPORT_SIZE_LABEL[s] })),
];

/**
 * Prijava problema. Šalje se na javnu rutu `POST /reports`: bez naloga i bez
 * imena prijavioca (docs/reports-mvp.md). Fotografije se otpremaju unapred
 * (`POST /reports/photos`) i prijava ih preuzima kroz `foto_ids` — obrnuti
 * redosled nije moguć jer anonimni prijavilac nikad ne dobije `id` prijave.
 * Potvrda je kratki kod, koji je jedini trag koji građanin kasnije može da
 * pokaže dispečeru, pa stoji krupno na kraju.
 */
export function ReportWizardPage() {
  const navigate = useNavigate();
  const createReport = useCreateReport();
  const settlements = useSettlementOptions();

  const [step, setStep] = useState(1);
  // Smer poslednjeg prelaza, samo za animaciju: napred klizi zdesna, nazad sleva.
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [tip, setTip] = useState<ReportType | null>(null);
  const [fotografije, setFotografije] = useState<PhotoReceipt[]>([]);
  const [location, setLocation] = useState<GeoPoint>(PIROT_CENTER);
  // Da li je pin ikad postavljen (GPS ili rukom). Dok nije, mapa sme sama da
  // ga stavi na lokaciju uređaja; posle toga to bi pregazilo ono što je
  // korisnik izabrao — pogotovo pri povratku na korak sa „Nazad“.
  const [locationTouched, setLocationTouched] = useState(false);
  const [naseljeId, setNaseljeId] = useState<Id>('');
  const [manualSettlement, setManualSettlement] = useState(false);
  const [opis, setOpis] = useState('');
  const [opisLokacije, setOpisLokacije] = useState('');
  const [velicina, setVelicina] = useState<ReportSize | ''>('');
  const [submitted, setSubmitted] = useState<{ kod: string; id: string } | null>(null);

  /**
   * Naselje se bira iz šifarnika backenda — ID iz mock liste API ne poznaje.
   * Najbliže naselje po koordinati i dalje računamo lokalno (mock ima
   * centroide), pa se po imenu spaja sa stavkom iz šifarnika.
   */
  const suggestSettlement = (point: GeoPoint) => {
    if (manualSettlement || !settlements.data) return;
    const nearest = nearestSettlement(point);
    const match = settlements.data.find((s) => normalizeSearch(s.naziv) === normalizeSearch(nearest.name));
    if (match) setNaseljeId(match.id);
  };

  const handleLocationChange = (point: GeoPoint, source: LocationSource) => {
    // GPS koji stigne posle ručnog pomeranja (spor fix) ne sme da vrati pin.
    if (source === 'device' && locationTouched) return;
    setLocationTouched(true);
    setLocation(point);
    suggestSettlement(point);
  };

  // GPS sa već datom dozvolom stiže za deo sekunde, a spisak naselja sa sela
  // može i duže: predlog u tom trenutku nema u čemu da traži i select ostane
  // prazan iako pin stoji na pravom mestu. Kad spisak stigne, ponovi predlog
  // za već postavljen pin — samo ako korisnik nije sam izabrao naselje.
  useEffect(() => {
    if (!settlements.data || !locationTouched || manualSettlement || naseljeId) return;
    suggestSettlement(location);
    // `suggestSettlement` se pravi svaki render; zavisnosti su ono što stvarno menja ishod.
  }, [settlements.data, locationTouched, manualSettlement, naseljeId, location]);

  const needsOpis = tip !== null && requiresDescription(tip);
  const canProceed =
    step === 1 ? tip !== null : step === 3 ? naseljeId !== '' : step === 4 ? !needsOpis || opis.trim().length > 0 : true;

  const goTo = (target: number) => {
    setDirection(target > step ? 'forward' : 'back');
    setStep(Math.min(Math.max(target, 1), LAST_STEP));
  };
  const goNext = () => {
    if (step === 2) suggestSettlement(location);
    goTo(step + 1);
  };
  const goBack = () => goTo(step - 1);

  const handleSubmit = () => {
    if (!tip || !naseljeId || (needsOpis && !opis.trim())) return;
    const input: NewReportInput = {
      tip,
      naselje_id: naseljeId,
      // Tačka iz mape je merena na uređaju korisnika; preciznost se ne izmišlja.
      tacka: { lat: location.lat, lon: location.lon },
      preciznost_lokacije: 'gps',
      ...(opis.trim() ? { opis: opis.trim() } : {}),
      ...(opisLokacije.trim() ? { opis_lokacije: opisLokacije.trim() } : {}),
      ...(velicina ? { velicina } : {}),
      ...(fotografije.length ? { fotografije } : {}),
    };
    createReport.mutate(input, {
      onSuccess: (report) => {
        toast.success('Prijava je poslata', { description: `Broj prijave: ${report.kratki_kod}` });
        setSubmitted({ kod: report.kratki_kod, id: report.id });
      },
      onError: (error) => {
        toast.error('Prijava nije poslata', { description: error.message });
      },
    });
  };

  const copyCode = async (kod: string) => {
    try {
      await navigator.clipboard.writeText(kod);
      toast.success('Broj prijave je kopiran');
    } catch {
      // Stariji WebView bez clipboard API-ja: broj je i dalje na ekranu.
      toast.error('Kopiranje nije uspelo — prepiši broj ručno.');
    }
  };

  const settlementName = settlements.data?.find((s) => s.id === naseljeId)?.naziv;

  if (submitted) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="relative">
          <Illustration name="hvala" fallback={PartyPopper} className="size-36" />
          <span className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full bg-forest text-white ring-4 ring-background">
            <CheckCircle2 className="size-5" />
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Prijava je poslata</h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">Hvala — operativa će je pregledati.</p>
        </div>

        <div className="w-full max-w-xs rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
          <p className="text-xs text-muted-foreground">Broj prijave</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-wider">{submitted.kod}</p>
          <Button variant="secondary" className="mt-3 h-10 w-full rounded-full" onClick={() => copyCode(submitted.kod)}>
            <Copy /> Kopiraj broj
          </Button>
        </div>

        <p className="max-w-xs text-sm text-muted-foreground text-pretty">
          Zapiši ili slikaj ovaj broj. Prijava je anonimna, pa je broj jedini način da o njoj pitaš telefonom u JKP-u.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button className="h-11 rounded-full" onClick={() => navigate(`/gradjanin/prijave/${submitted.id}`)}>
            Vidi prijavu
          </Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={() => navigate('/gradjanin')}>
            Na početnu
          </Button>
        </div>
      </div>
    );
  }

  const copy = STEP_COPY[step]!;

  return (
    // Donji padding ostavlja mesto za fiksnu traku sa dugmadima, da poslednje
    // polje koraka ne ostane sakriveno ispod nje.
    <div className="space-y-5 pb-24">
      <ScreenHeader title="Prijavi problem" backTo="/gradjanin" />
      <StepIndicator steps={STEPS} current={step} onStepClick={goTo} />

      {/* `key` remontira sadržaj pri promeni koraka, pa animacija krene iznova. */}
      <div
        key={step}
        className={cn(
          'space-y-4 animate-in fade-in duration-200',
          direction === 'forward' ? 'slide-in-from-right-4' : 'slide-in-from-left-4',
        )}
      >
        <div>
          <h2 className="text-lg font-bold">{copy.title}</h2>
          <p className="text-sm text-muted-foreground text-pretty">{copy.description}</p>
        </div>

        {step === 1 ? (
          <div className="space-y-2" role="radiogroup" aria-label="Tip problema">
            {TYPE_OPTIONS.map(({ value, hint }) => {
              const Icon = REPORT_TYPE_ICON[value];
              const selected = tip === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTip(value)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-3xl bg-card p-4 text-left shadow-sm ring-1 transition-all',
                    selected ? 'ring-2 ring-forest' : 'ring-foreground/5 hover:bg-card/80',
                  )}
                >
                  <span className={cn('flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl transition-colors', REPORT_TYPE_TONE[value])}>
                    {/* Ilustracija tipa (public/illustrations/tip-*.png) ako postoji, inače ikonica. */}
                    <Illustration name={`tip-${value}`} fallback={Icon} plain className="size-full" iconClassName="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{REPORT_TYPE_LABEL[value]}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
                      selected ? 'bg-forest text-white' : 'bg-muted',
                    )}
                  >
                    {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <PhotoInput value={fotografije} onChange={setFotografije} />
            {/* Bucket je javan: sve što je na slici vidi svako sa linkom (docs/media-storage.md). */}
            <p className="rounded-2xl bg-sunflower/30 px-4 py-3 text-xs text-warning-foreground text-pretty">
              Slikaj otpad, ne ljude, tablice ni kućne brojeve — fotografija je javno dostupna operativi i ne može se
              naknadno povući sa tvoje strane.
            </p>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <LocationPicker value={location} onChange={handleLocationChange} autoLocate={!locationTouched} />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="settlement">Naselje</Label>
                {naseljeId && !manualSettlement ? (
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    <Sparkles className="size-3" /> predloženo po lokaciji
                  </span>
                ) : null}
              </div>
              <Select
                value={naseljeId}
                onValueChange={(v) => {
                  setNaseljeId(v);
                  setManualSettlement(true);
                }}
              >
                <SelectTrigger id="settlement" className="w-full">
                  <SelectValue placeholder={settlements.isPending ? 'Učitavam naselja…' : 'Izaberi naselje'} />
                </SelectTrigger>
                <SelectContent>
                  {settlements.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.naziv}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {settlements.isError ? (
                <p className="text-xs text-destructive">Spisak naselja nije učitan — proveri vezu pa pokušaj ponovo.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="landmark">Orijentir (opciono)</Label>
              <Input
                id="landmark"
                placeholder="npr. kod doma kulture, iza škole"
                value={opisLokacije}
                onChange={(e) => setOpisLokacije(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Pomaže ekipi da nađe mesto kad je tačka na mapi približna.</p>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="description">Opiši problem {needsOpis ? '' : '(opciono)'}</Label>
              <Textarea
                id="description"
                placeholder="Npr. Kontejner je pun već dva dana, kese stoje pored…"
                value={opis}
                onChange={(e) => setOpis(e.target.value)}
                rows={4}
              />
              {needsOpis ? <p className="text-xs text-muted-foreground">Za prijavu tipa „Drugo“ opis je obavezan.</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label>Koliko je veliko (opciono)</Label>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Veličina problema">
                {SIZE_OPTIONS.map(({ value, label }) => {
                  const selected = velicina === value;
                  return (
                    <button
                      key={value || 'nepoznato'}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setVelicina(value)}
                      className={cn(
                        'rounded-full px-2 py-2.5 text-sm font-medium transition-colors',
                        selected ? 'bg-forest text-white shadow-sm' : 'bg-card ring-1 ring-foreground/10 hover:bg-muted',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Velika gomila traži ekipu sa mašinama, ne redovno vozilo.</p>
            </div>

            <Card className="gap-3 rounded-3xl p-4 ring-foreground/5">
              <p className="text-xs font-semibold text-muted-foreground">Pregled prijave</p>
              <dl className="divide-y text-sm">
                <SummaryRow label="Tip" value={tip ? REPORT_TYPE_LABEL[tip] : '—'} onEdit={() => goTo(1)} />
                <SummaryRow
                  label="Fotografija"
                  value={
                    fotografije.length === 0
                      ? 'Bez fotografije'
                      : fotografije.length === 1
                        ? '1 otpremljena'
                        : `${fotografije.length} otpremljene`
                  }
                  onEdit={() => goTo(2)}
                />
                <SummaryRow
                  label="Lokacija"
                  value={settlementName ?? '—'}
                  hint={opisLokacije.trim() || 'pin na mapi'}
                  onEdit={() => goTo(3)}
                />
              </dl>
              <p className="text-xs text-muted-foreground text-pretty">
                Prijava se šalje anonimno — ime i broj telefona se ne traže ni ne čuvaju.
              </p>
            </Card>
          </>
        ) : null}
      </div>

      {/* Dugmad su na istom mestu na svakom koraku: koraci su različite
          visine, pa bi „Dalje“ na dnu sadržaja skakalo i korisnik bi ga
          tražio. Traka stoji iznad donje navigacije (h-16), a donji padding
          pokriva „+“ koji viri iznad njene ivice. */}
      <div
        className="fixed inset-x-0 bottom-(--citizen-nav-h) z-30 mx-auto w-full max-w-md bg-gradient-to-t from-background via-background/95 to-background/0 px-4 pt-6 pb-2"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex gap-2">
          {step > 1 ? (
            <Button variant="outline" className="h-12 rounded-full px-4" onClick={goBack} disabled={createReport.isPending}>
              <ArrowLeft />
              Nazad
            </Button>
          ) : null}
          {step < LAST_STEP ? (
            <Button className="h-12 flex-1 rounded-full text-base" onClick={goNext} disabled={!canProceed}>
              {/* Fotografija je opciona — dugme to kaže, da se ne traži „Preskoči“. */}
              {step === 2 && fotografije.length === 0 ? 'Nastavi bez fotografije' : 'Dalje'}
              <ArrowRight />
            </Button>
          ) : (
            <Button
              className="h-12 flex-1 rounded-full bg-rose text-base text-white hover:bg-rose/90"
              onClick={handleSubmit}
              disabled={!canProceed || createReport.isPending}
            >
              {createReport.isPending ? <Loader2 className="animate-spin" /> : null}
              {createReport.isPending ? 'Šaljem…' : 'Pošalji prijavu'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Red pregleda sa linkom nazad na korak — ispravka bez tri puta „Nazad“. */
function SummaryRow({ label, value, hint, onEdit }: { label: string; value: string; hint?: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">
        <span className="block truncate">{value}</span>
        {hint ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}
      </dd>
      <button type="button" onClick={onEdit} className="shrink-0 rounded-full bg-green-tea px-2.5 py-1 text-xs font-semibold text-forest">
        Izmeni
      </button>
    </div>
  );
}
