import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { ContainerDetail } from '@/domain/types';
import { formatDateTime } from '@/lib/format';
import { SEASONAL_EVENT_LABEL } from '@/lib/labels';

/** Isti prag koji backend koristi za `vreme_kriticnog` i za alarm prelivanja. */
const CRITICAL_LEVEL = 95;

const config = {
  istorija: { label: 'Izmereno', color: 'var(--chart-1)' },
  predikcija: { label: 'Predviđeno', color: 'var(--chart-4)' },
  opseg: { label: 'Opseg p10–p90', color: 'var(--chart-4)' },
} satisfies ChartConfig;

interface Point {
  at: string;
  label: string;
  istorija?: number;
  predikcija?: number;
  /** Recharts crta „traku“ kao oblast između dve vrednosti — otuda par, a ne dva niza. */
  opseg?: [number, number];
  praznjenje?: boolean;
}

/**
 * Izmerena istorija i kriva prognoze na jednoj osi.
 *
 * Opseg p10–p90 je ono što model zaista tvrdi: srednja linija je procena, a
 * traka je rasejanje koje su pokazali prethodni ciklusi ovog kontejnera
 * (docs/fill-forecasting.md). Prikazivanje samo srednje linije obećalo bi
 * preciznost koju prognoza nema.
 */
export function FillChart({ container }: { container: ContainerDetail }) {
  const points: Point[] = container.history.map((r) => ({
    at: r.at,
    label: formatDateTime(r.at),
    istorija: r.level,
    praznjenje: r.orientation === 'emptying',
  }));

  // Predikcija počinje od poslednjeg merenja da bi linije bile spojene.
  const last = points[points.length - 1];
  if (last?.istorija !== undefined) {
    last.predikcija = last.istorija;
    last.opseg = [last.istorija, last.istorija];
  }

  for (const f of container.forecast) {
    points.push({ at: f.at, label: formatDateTime(f.at), predikcija: f.p50, opseg: [f.p10, f.p90] });
  }

  const todayLabel = last?.label;
  const praznjenja = points.filter((p) => p.praznjenje);

  return (
    <ChartContainer config={config} className="aspect-[2.2/1] w-full">
      <ComposedChart data={points} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={Math.ceil(points.length / 8)} tickMargin={6} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />

        <ReferenceLine y={CRITICAL_LEVEL} stroke="var(--level-critical)" strokeDasharray="4 4" label={{ value: 'prag 95%', position: 'insideTopRight', fill: 'var(--level-critical)', fontSize: 11 }} />
        {todayLabel ? <ReferenceLine x={todayLabel} stroke="var(--muted-foreground)" label={{ value: 'danas', position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 11 }} /> : null}

        {/* Pražnjenje je mesto gde se kriva resetuje; bez oznake izgleda kao pad merenja. */}
        {praznjenja.map((p) => (
          <ReferenceDot key={p.at} x={p.label} y={p.istorija ?? 0} r={3.5} fill="var(--success)" stroke="none" />
        ))}

        {container.seasonalEvents.map((e) => {
          const p = points.find((pt) => pt.at.slice(0, 10) === e.date);
          if (!p) return null;
          return (
            <ReferenceLine
              key={e.date + e.kind}
              x={p.label}
              stroke="var(--warning)"
              strokeDasharray="2 3"
              label={{ value: SEASONAL_EVENT_LABEL[e.kind], position: 'insideBottomLeft', fill: 'var(--warning-foreground)', fontSize: 11 }}
            />
          );
        })}

        <Area type="monotone" dataKey="opseg" stroke="none" fill="var(--color-opseg)" fillOpacity={0.15} isAnimationActive={false} />
        <Area type="monotone" dataKey="istorija" stroke="var(--color-istorija)" fill="var(--color-istorija)" fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="predikcija" stroke="var(--color-predikcija)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
