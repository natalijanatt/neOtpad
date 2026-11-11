import { BrainCircuit, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ReportClassification } from '@/domain/types';
import { formatRelative } from '@/lib/format';
import {
  CLASSIFICATION_OUTCOME_LABEL,
  CLASSIFICATION_SOURCE_LABEL,
  REPORT_ACTION_LABEL,
  REPORT_SIZE_LABEL,
  REPORT_TYPE_LABEL,
  SUBCATEGORY_LABEL,
} from '@/lib/labels';
import { cn } from '@/lib/utils';

interface ClassificationCardProps {
  klasifikacija: ReportClassification | null;
  /** Tačna kada je predlog računat za verziju koja je trenutno na ekranu. */
  sveza: boolean;
  onReclassify?: () => void;
  busy?: boolean;
  className?: string;
}

/**
 * Automatski predlog trijaže, onakav kakav jeste: predlog.
 *
 * Prikazuje se sa izvorom i pouzdanošću jer to nisu detalji nego uslov —
 * dispečer koji ne zna da li gleda AI model ili prepoznate ključne reči ne može
 * da proceni koliko da mu veruje. Signali su tu iz istog razloga: „18 m od
 * kontejnera K-102, popunjen 91%“ je proverljivo, „model misli“ nije.
 */
export function ClassificationCard({ klasifikacija, sveza, onReclassify, busy, className }: ClassificationCardProps) {
  const dugme = onReclassify ? (
    <Button variant="outline" size="sm" onClick={onReclassify} disabled={busy}>
      <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} /> Klasifikuj ponovo
    </Button>
  ) : null;

  if (!klasifikacija) {
    return (
      <Card className={cn('gap-3 p-5', className)}>
        <Zaglavlje />
        <p className="text-sm text-muted-foreground text-pretty">
          Prijava još nije klasifikovana. Radnik u pozadini je preuzima u roku od nekoliko sekundi.
        </p>
        {dugme}
      </Card>
    );
  }

  if (klasifikacija.status !== 'uspesna') {
    return (
      <Card className={cn('gap-3 p-5', className)}>
        <Zaglavlje />
        <p className="text-sm text-muted-foreground text-pretty">
          {klasifikacija.status === 'na_cekanju'
            ? 'Klasifikacija je u redu čekanja.'
            : klasifikacija.status === 'zastarela'
              ? 'Predlog je zastareo jer je prijava u međuvremenu izmenjena.'
              : 'Klasifikacija nije uspela.'}
        </p>
        {klasifikacija.greska ? (
          <p className="rounded-lg bg-muted p-2.5 font-mono text-xs text-muted-foreground break-words">{klasifikacija.greska}</p>
        ) : null}
        {dugme}
      </Card>
    );
  }

  const pouzdanost = klasifikacija.pouzdanost ?? 0;
  const s = klasifikacija.signali;

  return (
    <Card className={cn('gap-3 p-5', className)}>
      <Zaglavlje />

      {/* Predlog vezan za staru verziju opisuje sadržaj koji više nije na ekranu. */}
      {sveza ? null : (
        <p className="flex items-start gap-2 rounded-lg bg-warning/20 p-2.5 text-xs text-warning-foreground text-pretty">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Predlog je računat za raniju verziju prijave; posle izmene više ne opisuje trenutni sadržaj.
        </p>
      )}

      <div className="grid gap-1.5 text-sm">
        <Red naziv="Nadležna služba" vrednost={<span className="font-medium">{klasifikacija.nadlezna_sluzba}</span>} />
        <Red naziv="Obrada" vrednost={klasifikacija.predlozeni_tip_obrade ? REPORT_ACTION_LABEL[klasifikacija.predlozeni_tip_obrade] : '—'} />
        <Red naziv="Tip" vrednost={klasifikacija.predlozeni_tip ? REPORT_TYPE_LABEL[klasifikacija.predlozeni_tip] : '—'} />
        <Red naziv="Podkategorija" vrednost={klasifikacija.predlozena_podkategorija ? SUBCATEGORY_LABEL[klasifikacija.predlozena_podkategorija] : '—'} />
        <Red naziv="Veličina" vrednost={klasifikacija.predlozena_velicina ? REPORT_SIZE_LABEL[klasifikacija.predlozena_velicina] : '—'} />
        <Red naziv="Prioritet" vrednost={klasifikacija.predlozeni_prioritet ? String(klasifikacija.predlozeni_prioritet) : '—'} />
      </div>

      {klasifikacija.obrazlozenje ? (
        <p className="rounded-lg bg-primary/5 p-3 text-sm text-pretty">{klasifikacija.obrazlozenje}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {klasifikacija.izvor ? CLASSIFICATION_SOURCE_LABEL[klasifikacija.izvor] : 'Nepoznat izvor'}
          {klasifikacija.model ? ` · ${klasifikacija.model}` : ''}
        </span>
        <span>Pouzdanost {Math.round(pouzdanost * 100)}%</span>
        {klasifikacija.obradjena_at ? <span>{formatRelative(klasifikacija.obradjena_at)}</span> : null}
        {klasifikacija.ishod ? <span>{CLASSIFICATION_OUTCOME_LABEL[klasifikacija.ishod]}</span> : null}
      </div>

      {/* Ono na čemu predlog stoji. Bez ovoga dispečer nema šta da proveri. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <span>
          {s.najblizi_kontejner_id
            ? `Najbliži kontejner ${s.najblizi_kontejner_m === null ? 'u naselju' : `na ${s.najblizi_kontejner_m} m`}`
            : 'Nema kontejnera u blizini'}
        </span>
        {/* Bez senzora nema ni procenta: nedostatak očitavanja nije prazan kontejner. */}
        <span>
          {s.najblizi_kontejner_punjenje === null ? 'Punjenje: nema senzora' : `Punjenje ${s.najblizi_kontejner_punjenje}%`}
        </span>
        {s.crna_tacka_m !== null ? <span>Crna tačka na {s.crna_tacka_m} m</span> : null}
        {s.kanonska_deponija_m !== null ? <span>Evidentirana deponija na {s.kanonska_deponija_m} m</span> : null}
        <span>Fotografija: {s.broj_fotografija}</span>
        {s.kandidata_za_duplikat > 0 ? <span>Mogućih duplikata: {s.kandidata_za_duplikat}</span> : null}
      </div>

      {dugme}
    </Card>
  );
}

function Zaglavlje() {
  return (
    <div className="flex items-start gap-2">
      <BrainCircuit className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium">Automatska klasifikacija</p>
        <p className="text-xs text-muted-foreground text-pretty">
          Predlog, ne odluka — prijava se menja samo kroz trijažu.
        </p>
      </div>
    </div>
  );
}

function Red({ naziv, vrednost }: { naziv: string; vrednost: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{naziv}</span>
      <span className="text-right">{vrednost}</span>
    </div>
  );
}
