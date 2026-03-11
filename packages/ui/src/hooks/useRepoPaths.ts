import { useState, useCallback, useEffect, useRef } from 'react';

export function useRepoPaths() {
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const repoPathsRef = useRef<string[]>([]);

  useEffect(() => {
    fetch('/config')
      .then(r => r.json())
      .then((d: { repoPaths?: string[] }) => {
        const paths = d.repoPaths ?? [];
        repoPathsRef.current = paths;
        setRepoPaths(paths);
      })
      .catch(console.error);
  }, []);

  const persist = useCallback((next: string[]) => {
    fetch('/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPaths: next }),
    }).catch(console.error);
  }, []);

  const addRepo = useCallback((p: string) => {
    if (repoPathsRef.current.includes(p)) return;
    const next = [...repoPathsRef.current, p];
    repoPathsRef.current = next;
    setRepoPaths(next);
    persist(next);
  }, [persist]);

  const removeRepo = useCallback((p: string) => {
    const next = repoPathsRef.current.filter(r => r !== p);
    repoPathsRef.current = next;
    setRepoPaths(next);
    setActiveRepo(prev => prev === p ? null : prev);
    persist(next);
  }, [persist]);

  return { repoPaths, activeRepo, setActiveRepo, addRepo, removeRepo };
}
