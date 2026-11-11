import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, Copy, Send, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { isConflict } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  queryKeys,
  useContainerOptions,
  useReportByCode,
  useResolveReport,
  useSettlementOptions,
  useTriageReport,
} from '@/data/queries';
import type { Priority, ReportAction, ReportDetail, ReportSize, ReportType } from '@/domain/types';
import { CLASSIFICATION_SOURCE_LABEL, PRIORITY_LABEL, REPORT_ACTION_LABEL, REPORT_SIZE_LABEL, REPORT_TYPE_LABEL } from '@/lib/labels';
import { feedbackPath, freshProposal, needsRefinement, recommendedAction, REPORT_ACTION_HINT, REPORT_ACTION_VERB } from '@/lib/reports';
import { cn } from '@/lib/utils';

type DialogKind = 'potvrda' | 'odbijanje' | 'duplikat' | 'resavanje';

const PRIORITIES: Priority[] = [1, 2, 3, 4, 5];
const ACTIONS: ReportAction[] = ['odvoz', 'ciscenje', 'odrzavanje', 'provera_lokacije'];
/** Svi tipovi iz ugovora — dispečer sme i ono što građanin u čarobnjaku ne vidi (`nedostaje_kontejner`). */
const TYPES = Object.keys(REPORT_TYPE_LABEL) as ReportType[];
const SIZES = Object.keys(REPORT_SIZE_LABEL) as ReportSize[];

/**
 * Trijaža prijave prema `POST /reports/{id}/triage` i `/resolve`.
 *
 * Svaka izmena nosi `verzija` iz poslednjeg čitanja i obavezan `razlog`; ako je
 * neko drugi u međuvremenu menjao prijavu, backend vraća 409 i ovde se to
 * prikazuje kao poziv da se detalj osveži, a ne kao greška u unosu
 * (docs/reports-mvp.md).
 *
 * Potvrda sme da ispravi tip, veličinu i naselje — SMS prijava „KONTEJNER
 * PREPUN“ stiže bez ičega od toga, a dispečer to sazna telefonom. Odbijanje i
 * duplikat ne smeju da menjaju sadržaj, pa ta polja postoje samo u potvrdi.
 */
export function ReportActions({ report }: { report: ReportDetail }) {
  const client = useQueryClient();
  const triage = useTriageReport();
  const resolve = useResolveReport();
  const busy = triage.isPending || resolve.isPending;

  // Predlog klasifikatora za OVU verziju prijave; null kad ga nema ili je
  // zastareo. Popunjava polja, ne odlučuje ih — dispečer i dalje bira.
  //
  // Pravilo popunjavanja, jedno za sva polja: pobeđuje vrednost koju je čovek
  // svesno uneo, a predlog popunjava ono što je prazno. Otuda `velicina`,
  // `kontejner_id` i `prioritet` uzimaju prijavu ispred predloga. `tip` je
  // izuzetak jer ga forma tera građanina da izabere, pa nije svestan odgovor
  // nego pogađanje — i po podacima je polje koje najčešće promaši.
  //
  // Posledica koju treba znati pri čitanju `ishod`: pošto je forma
  // pre-popunjena, dispečer koji samo klikne „Potvrdi" proizvodi `prihvacena`.
  // Ta mera govori da predlog nije izazvao prigovor, ne da je nezavisno
  // potvrđen (docs/report-classification.md).
  const predlog = freshProposal(report);

  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [razlog, setRazlog] = useState('');
  const [obrada, setObrada] = useState<ReportAction>(predlog?.predlozeni_tip_obrade ?? recommendedAction(report));
  const [prioritet, setPrioritet] = useState<Priority>(
    (report.prioritet as Priority | null) ?? (predlog?.predlozeni_prioritet as Priority | null) ?? 3,
  );
  // Prijava pre predloga: kontejner koji je građanin stvarno izabrao nije procena.
  const [kontejnerId, setKontejnerId] = useState<string>(report.kontejner_id ?? predlog?.predlozeni_kontejner_id ?? '');
  const [tip, setTip] = useState<ReportType>(predlog?.predlozeni_tip ?? report.tip);
  const [velicina, setVelicina] = useState<ReportSize | ''>(report.velicina ?? predlog?.predlozena_velicina ?? '');
  const [naseljeId, setNaseljeId] = useState<string>(report.naselje_id ?? '');
  const [duplikatKod, setDuplikatKod] = useState('');

  const settlements = useSettlementOptions();
  // Spisak kontejnera prati IZABRANO naselje, ne ono sa prijave: backend proverava
  // da kontejner pripada naselju i odbija nesklad.
  const containers = useContainerOptions(naseljeId || undefined);
  // Duplikat traži UUID originala, a dispečer u ruci ima kratki kod sa potvrde.
  const original = useReportByCode(duplikatKod.trim());

  const preporuka = predlog?.predlozeni_tip_obrade ?? recommendedAction(report);
  const open = report.status === 'nova' || report.status === 'potvrdjena';
  const canResolve = report.status === 'potvrdjena' && !needsRefinement(report);

  const close = () => {
    setDialog(null);
    setRazlog('');
    setDuplikatKod('');
  };

  const onError = (error: Error) => {
    if (isConflict(error)) {
      void client.invalidateQueries({ queryKey: queryKeys.report(report.id) });
      toast.error('Prijava je u međuvremenu izmenjena', { description: 'Detalj je osvežen — proveri stanje pa ponovi odluku.' });
      close();
      return;
    }
    toast.error('Odluka nije sačuvana', { description: error.message });
  };

  const submit = () => {
    const tekst = razlog.trim();
    if (!tekst) return;

    if (dialog === 'resavanje') {
      resolve.mutate(
        { id: report.id, verzija: report.verzija, razlog: tekst },
        {
          onSuccess: () => {
            toast.success('Prijava je rešena', { description: `${report.kratki_kod} je zatvorena.` });
            close();
          },
          onError,
        },
      );
      return;
    }

    if (dialog === 'potvrda') {
      // `odvoz` bez kontejnera backend odbija: odvozi se kontejner, ne tačka.
      if (obrada === 'odvoz' && !kontejnerId) {
        toast.error('Odvoz traži kontejner', { description: 'Izaberi kontejner ili stavi čišćenje/proveru lokacije.' });
        return;
      }
      // Ispravke idu samo kad se razlikuju od prijave — telo trijaže tada
      // kaže tačno šta je dispečer promenio, što je i ono što istorija beleži.
      const corrections = {
        ...(tip !== report.tip ? { tip } : {}),
        ...(velicina && velicina !== report.velicina ? { velicina } : {}),
        ...(naseljeId && naseljeId !== report.naselje_id ? { naselje_id: naseljeId } : {}),
      };
      triage.mutate(
        {
          id: report.id,
          verzija: report.verzija,
          odluka: 'potvrdjena',
          tip_obrade: obrada,
          prioritet,
          razlog: tekst,
          ...corrections,
          ...(kontejnerId ? { kontejner_id: kontejnerId } : {}),
        },
        {
          onSuccess: () => {
            toast.success('Prijava potvrđena', { description: `${REPORT_ACTION_LABEL[obrada]} · prioritet ${prioritet}` });
            close();
          },
          onError,
        },
      );
      return;
    }

    if (dialog === 'duplikat') {
      const duplikat_od = original.data?.id;
      if (!duplikat_od) {
        toast.error('Original nije pronađen', { description: 'Unesi kratki kod starije prijave (npr. PR-A1B2C3D4E5F6).' });
        return;
      }
      triage.mutate(
        { id: report.id, verzija: report.verzija, odluka: 'duplikat', duplikat_od, razlog: tekst },
        {
          onSuccess: () => {
            toast.success('Označeno kao duplikat', { description: `Vezano za ${original.data?.kratki_kod}.` });
            close();
          },
          onError,
        },
      );
      return;
    }

    triage.mutate(
      { id: report.id, verzija: report.verzija, odluka: 'odbijena', razlog: tekst },
      {
        onSuccess: () => {
          toast.success('Prijava odbijena', { description: feedbackPath(report) });
          close();
        },
        onError,
      },
    );
  };

  if (!open) {
    return (
      <Card className="gap-2 p-5">
        <p className="font-medium">Prijava je zatvorena</p>
        <p className="text-sm text-muted-foreground">
          {report.status === 'resena'
            ? 'Rešena — nema daljih akcija.'
            : report.status === 'duplikat'
              ? 'Duplikat starije prijave; posao se vodi na originalu.'
              : 'Odbijena — razlog je u toku prijave.'}
        </p>
        {/* Zatvorena prijava se ne može ponovo otvoriti: nova pojava je nova prijava. */}
        <p className="text-xs text-muted-foreground text-pretty">
          Backend ne dozvoljava izmene zatvorene prijave. Nova pojava na istom mestu je nova prijava.
        </p>
        <p className="text-xs text-muted-foreground text-pretty">{feedbackPath(report)}</p>
      </Card>
    );
  }

  return (
    <Card className="gap-4 p-5">
      <div>
        <p className="font-medium">Trijaža</p>
        <p className="text-xs text-muted-foreground">
          {report.status === 'nova' ? 'Odluči šta se radi sa prijavom.' : 'Prijava je potvrđena — zatvori je kad ekipa javi da je gotovo.'}
        </p>
      </div>

      {/* Odluka nije gotova dok ne stigne do prijavioca, a sa sela prijava
          često dolazi SMS-om ili preko MZ — tada nema naloga u aplikaciji. */}
      <p className="flex items-start gap-2 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground text-pretty">
        <Send className="mt-0.5 size-3.5 shrink-0" />
        {feedbackPath(report)}
      </p>

      <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="font-medium">Predlog obrade: {REPORT_ACTION_LABEL[preporuka].toLowerCase()}</p>
          <p className="text-xs text-muted-foreground text-pretty">
            {predlog?.obrazlozenje ?? REPORT_ACTION_HINT[preporuka]}
          </p>
          {/* Izvor i pouzdanost stoje uz predlog jer bez njih dispečer ne zna
              koliko da mu veruje: AI model i prepoznate ključne reči nisu isto. */}
          {predlog ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {predlog.izvor ? CLASSIFICATION_SOURCE_LABEL[predlog.izvor] : 'Automatski'} ·{' '}
              pouzdanost {Math.round((predlog.pouzdanost ?? 0) * 100)}% · {predlog.nadlezna_sluzba}
            </p>
          ) : null}
        </div>
      </div>

      {needsRefinement(report) ? (
        <p className="rounded-lg bg-warning/20 p-2.5 text-xs text-warning-foreground text-pretty">
          Obrada je „provera lokacije“ — prijava mora prvo da dobije konkretnu obradu, pa tek onda može da se zatvori.
        </p>
      ) : null}

      <div className="grid gap-2">
        <Button onClick={() => setDialog('potvrda')} disabled={busy}>
          <Check /> {report.status === 'nova' ? 'Potvrdi i odredi obradu' : 'Izmeni potvrdu'}
        </Button>

        {canResolve ? (
          <Button variant="outline" onClick={() => setDialog('resavanje')} disabled={busy}>
            <CheckCheck /> Označi kao rešeno
          </Button>
        ) : null}

        <Button variant="outline" className="justify-start" onClick={() => setDialog('duplikat')} disabled={busy}>
          <Copy /> Duplikat starije prijave
        </Button>

        <Button
          variant="ghost"
          className="justify-start text-destructive hover:text-destructive"
          onClick={() => setDialog('odbijanje')}
          disabled={busy}
        >
          <XCircle /> Odbij prijavu
        </Button>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'potvrda'
                ? 'Potvrda prijave'
                : dialog === 'resavanje'
                  ? 'Označi kao rešeno'
                  : dialog === 'duplikat'
                    ? 'Duplikat starije prijave'
                    : 'Odbij prijavu'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'potvrda'
                ? 'Obrada i prioritet idu uz potvrdu; razlog ostaje trajno u istoriji prijave.'
                : dialog === 'resavanje'
                  ? 'Beleška o tome šta je stvarno urađeno na terenu.'
                  : dialog === 'duplikat'
                    ? 'Unesi kratki kod prijave koja je original; posao se dalje vodi na njoj.'
                    : 'Razlog odbijanja vidi i prijavilac — napiši ga tako da mu bude jasan.'}
            </DialogDescription>
          </DialogHeader>

          {dialog === 'potvrda' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tip problema</Label>
                  <Select value={tip} onValueChange={(v) => setTip(v as ReportType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {REPORT_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Veličina</Label>
                  <Select value={velicina || 'nepoznata'} onValueChange={(v) => setVelicina(v === 'nepoznata' ? '' : (v as ReportSize))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nepoznata">Nije procenjena</SelectItem>
                      {SIZES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {REPORT_SIZE_LABEL[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {tip !== report.tip || (velicina || null) !== report.velicina ? (
                <p className="text-xs text-muted-foreground text-pretty">
                  Ispravka prijavljenog ({REPORT_TYPE_LABEL[report.tip].toLowerCase()}
                  {report.velicina ? `, ${REPORT_SIZE_LABEL[report.velicina].toLowerCase()}` : ''}) — ostaje zabeležena u
                  istoriji.
                </p>
              ) : null}

              <div className="space-y-1.5">
                <Label>Naselje</Label>
                <Select
                  value={naseljeId || 'bez'}
                  onValueChange={(v) => {
                    setNaseljeId(v === 'bez' ? '' : v);
                    // Kontejner iz starog naselja u novom ne postoji.
                    setKontejnerId('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={settlements.isPending ? 'Učitavam…' : 'Naselje nije određeno'} />
                  </SelectTrigger>
                  <SelectContent>
                    {!report.naselje_id ? <SelectItem value="bez">Nije određeno</SelectItem> : null}
                    {settlements.data?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.naziv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Obrada</Label>
                <Select value={obrada} onValueChange={(v) => setObrada(v as ReportAction)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {REPORT_ACTION_VERB[a]}
                        {a === preporuka ? ' · predlog' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground text-pretty">{REPORT_ACTION_HINT[obrada]}</p>
              </div>

              <div className="space-y-1.5">
                <Label>Kontejner {obrada === 'odvoz' ? '(obavezno za odvoz)' : '(opciono)'}</Label>
                <Select value={kontejnerId || 'bez'} onValueChange={(v) => setKontejnerId(v === 'bez' ? '' : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={containers.isPending ? 'Učitavam…' : 'Bez kontejnera'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bez">Bez kontejnera</SelectItem>
                    {containers.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.naziv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Prioritet</Label>
                <Select value={String(prioritet)} onValueChange={(v) => setPrioritet(Number(v) as Priority)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        {PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {dialog === 'duplikat' ? (
            <div className="space-y-1.5">
              <Label htmlFor="duplikat">Kratki kod originala</Label>
              <Input
                id="duplikat"
                value={duplikatKod}
                onChange={(e) => setDuplikatKod(e.target.value)}
                placeholder="PR-A1B2C3D4E5F6"
                autoComplete="off"
              />
              <p className={cn('text-xs', original.data ? 'text-success' : 'text-muted-foreground')}>
                {duplikatKod.trim().length < 4
                  ? 'Kod stoji na potvrdi prijave.'
                  : original.isPending
                    ? 'Tražim prijavu…'
                    : original.data
                      ? `Pronađeno: ${original.data.kratki_kod}`
                      : 'Nema prijave sa tim kodom.'}
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="razlog">Razlog</Label>
            <Textarea
              id="razlog"
              value={razlog}
              onChange={(e) => setRazlog(e.target.value)}
              rows={3}
              placeholder={
                dialog === 'potvrda'
                  ? 'npr. Provereno telefonom sa predsednikom MZ.'
                  : dialog === 'resavanje'
                    ? 'npr. Kontejner ispražnjen, okolni otpad uklonjen.'
                    : dialog === 'duplikat'
                      ? 'npr. Ista lokacija kao starija prijava.'
                      : 'npr. Lokacija nije u nadležnosti JKP-a.'
              }
            />
            <p className="text-xs text-muted-foreground">Razlog je obavezan i ostaje u istoriji prijave.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Otkaži
            </Button>
            <Button
              variant={dialog === 'odbijanje' ? 'destructive' : 'default'}
              onClick={submit}
              disabled={busy || !razlog.trim()}
            >
              {busy ? 'Čuvam…' : 'Sačuvaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
