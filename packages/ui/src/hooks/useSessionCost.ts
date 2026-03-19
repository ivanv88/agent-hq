import { useState, useEffect } from 'react';
import type { WsEvent } from '@lacc/shared';

export interface SessionUsage {
  costUsd: number;
  sessionTokens: number;
  weeklyTokens: number;
  sessionTokenLimit: number;
  weeklyTokenLimit: number;
}

const INITIAL: SessionUsage = {
  costUsd: 0,
  sessionTokens: 0,
  weeklyTokens: 0,
  sessionTokenLimit: 100_000,
  weeklyTokenLimit: 1_000_000,
};

export function useSessionCost(lastEvent: WsEvent | null): SessionUsage {
  const [usage, setUsage] = useState<SessionUsage>(INITIAL);

  const fetchCost = () => {
    fetch('/session/cost')
      .then(r => r.json())
      .then((d: any) => setUsage({ ...d, costUsd: d.totalCostUsd ?? 0 }))
      .catch(console.error);
  };

  useEffect(() => { fetchCost(); }, []);

  useEffect(() => {
    if (lastEvent?.type === 'COST_UPDATED') fetchCost();
  }, [lastEvent]);

  return usage;
}
