import { useCallback, useState } from 'react';
import type { Id } from '@/domain/types';

const STORAGE_KEY = 'gradjanin-naselje:v1';

function readStored(): Id | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Privatni režim pregledača, isključen storage ili prekoračena kvota — radi bez pamćenja.
    return null;
  }
}

function writeStored(id: Id | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Isto — ova pogodnost nije kritična funkcija, tiho je preskačemo.
  }
}

/**
 * Pamti koje naselje je građanin izabrao (za raspored odvoza) preko sesija na
 * istom uređaju. Samo per-viewer pogodnost — nikad ne nosi stanje koje mora
 * pouzdano da preživi ili se deli između uređaja.
 */
export function useSettlementPreference(): [Id | null, (id: Id | null) => void] {
  const [settlementId, setSettlementId] = useState<Id | null>(() => readStored());

  const update = useCallback((id: Id | null) => {
    setSettlementId(id);
    writeStored(id);
  }, []);

  return [settlementId, update];
}
