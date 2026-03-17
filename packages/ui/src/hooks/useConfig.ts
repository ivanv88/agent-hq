import { useState, useEffect, useCallback } from 'react';

export interface Config {
  poolSize: number;
  costAlertThreshold: number;
  spinDetectionWindowMin: number;
  worktreeAutoDeleteHours: number;
  editorCommand: string;
  defaultModel: string;
  defaultOversightMode: string;
  anthropicBaseUrl: string;
  metaModel: string;
  autoResumeRateLimited: boolean;
  sessionTokenLimit: number;
  weeklyTokenLimit: number;
  hasApiKey: boolean;
}

export interface UseConfigResult {
  config: Config | null;
  loading: boolean;
  save: (updated: Config) => Promise<void>;
}

export function useConfig(): UseConfigResult {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/config')
      .then(r => r.json())
      .then((data: Config) => {
        setConfig(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const save = useCallback(async (updated: Config) => {
    await fetch('/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setConfig(updated);
  }, []);

  return { config, loading, save };
}
