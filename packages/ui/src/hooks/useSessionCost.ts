import { useState, useEffect } from 'react';
import type { WsEvent } from '@lacc/shared';

export function useSessionCost(lastEvent: WsEvent | null): number {
  const [sessionCost, setSessionCost] = useState(0);

  const fetchCost = () => {
    fetch('/session/cost')
      .then(r => r.json())
      .then((d: { totalCostUsd: number }) => setSessionCost(d.totalCostUsd))
      .catch(console.error);
  };

  useEffect(() => { fetchCost(); }, []);

  useEffect(() => {
    if (lastEvent?.type === 'COST_UPDATED') fetchCost();
  }, [lastEvent]);

  return sessionCost;
}
