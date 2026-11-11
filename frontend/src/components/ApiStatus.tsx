import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

/**
 * `/health` iz ugovora: pokazuje da li backend (ili Prism mock) radi. Prijave i
 * šifarnici idu preko njega, pa pad servisa znači prazan red prijava —
 * kontejneri, rute i žarišta su i dalje lokalni podaci i rade bez njega.
 */
export function ApiStatus({ className }: { className?: string }) {
  const { data, isError, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data: health, error } = await api.GET('/health');
      if (error || !health) throw new Error('API vratio grešku');
      return health;
    },
    retry: 0,
    refetchInterval: 60_000,
  });

  const state = isPending ? 'checking' : isError ? 'offline' : data?.status === 'ok' ? 'ok' : 'degraded';
  const label = {
    checking: 'Provera API-ja…',
    offline: 'API nedostupan — prijave se ne učitavaju',
    ok: `API ${data?.version ?? ''} · prijave uživo`,
    degraded: 'API degradiran — baza nedostupna',
  }[state];
  const dot = {
    checking: 'bg-muted-foreground/50',
    offline: 'bg-muted-foreground/50',
    ok: 'bg-success',
    degraded: 'bg-warning',
  }[state];

  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)} title={label}>
      <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  );
}
