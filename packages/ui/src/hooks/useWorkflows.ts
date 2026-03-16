import { useState, useEffect } from 'react';
import type { WorkflowDefinition } from '@lacc/shared';

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    fetch('/workflows')
      .then(r => r.json())
      .then((data: WorkflowDefinition[]) => { setWorkflows(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  return { workflows, loading, refresh };
}
