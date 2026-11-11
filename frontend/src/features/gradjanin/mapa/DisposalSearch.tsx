import { useState } from 'react';
import { ArrowRight, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useSuggestDisposal } from '@/data/queries';
import type { DisposalSuggestion } from '@/domain/types';

/** Isto ograničenje kao na backendu (`DisposalQueryDto`): svaki znak ide plaćenom modelu. */
const MAX_LENGTH = 200;

/**
 * „Šta želiš da baciš?“ — slobodan tekst na bilo kom pismu i dijalektu. Šta
 * se radi sa odgovorom (uključi filter ili pokaži sakupljače) odlučuje stranica,
 * jer samo ona zna koji filteri postoje.
 */
export function DisposalSearch({ onResult }: { onResult: (result: DisposalSuggestion) => void }) {
  const [upit, setUpit] = useState('');
  const suggest = useSuggestDisposal();
  const text = upit.trim();

  const submit = () => {
    // Prazan ili ponovljen klik dok traje zahtev ne troši još jedan poziv.
    if (text.length < 2 || suggest.isPending) return;
    suggest.mutate(text, {
      onSuccess: onResult,
      onError: (error) => toast.error('Pretraga nije uspela', { description: error.message }),
    });
  };

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-forest" />
      <input
        type="search"
        value={upit}
        onChange={(e) => setUpit(e.target.value)}
        maxLength={MAX_LENGTH}
        placeholder="Šta želiš da baciš? npr. stari frižider, iverica…"
        aria-label="Šta želiš da odložiš"
        enterKeyHint="search"
        className="h-12 w-full rounded-full bg-card pr-14 pl-11 text-base shadow-sm ring-1 ring-foreground/5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-forest"
      />
      <button
        type="submit"
        disabled={text.length < 2 || suggest.isPending}
        aria-label="Pronađi"
        className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-forest text-white transition-opacity disabled:opacity-40"
      >
        {suggest.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
      </button>
    </form>
  );
}
