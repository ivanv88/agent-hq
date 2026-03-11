import { useState, useEffect } from 'react';
import type { PoolStatus, WsEvent } from '@lacc/shared';

export function usePool(wsEvent: WsEvent | null) {
  const [pool, setPool] = useState<PoolStatus>({ ready: 0, warming: 0, claimed: 0, target: 2 });

  useEffect(() => {
    fetch('/pool')
      .then(r => r.json())
      .then((data: PoolStatus) => setPool(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (wsEvent?.type === 'POOL_UPDATED') {
      setPool(wsEvent.pool);
    }
  }, [wsEvent]);

  return pool;
}
