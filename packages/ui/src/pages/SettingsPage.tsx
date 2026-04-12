import { useState, useEffect } from 'react';
import type { Config } from '../hooks/useConfig.js';
import { Button } from '../components/ui/Button.js';
import { Select } from '../components/ui/Select.js';
import { FormField, FormLabel } from '../components/ui/FormField.js';
import { Skeleton } from '../components/ui/Skeleton.js';

interface Props {
  config: Config | null;
  configLoading: boolean;
  onSave: (config: Config) => Promise<void>;
}

export function SettingsPage({ config: serverConfig, configLoading, onSave }: Props) {
  const [draft, setDraft] = useState<Config | null>(serverConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync draft when server config first arrives
  useEffect(() => {
    if (serverConfig !== null) setDraft(serverConfig);
  }, [serverConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Page header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border-default">
        <div className="text-text-ghost text-[11px] tracking-[0.1em] uppercase">
          Configuration
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col items-center">
        {configLoading ? (
          <SettingsSkeleton />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-4xl">
            {draft && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Pool size"
                    type="number"
                    value={draft.poolSize}
                    onChange={e => setDraft(c => c ? { ...c, poolSize: Number(e.target.value) } : c)}
                  />
                  <FormField
                    label="Cost alert ($)"
                    type="number"
                    value={draft.costAlertThreshold}
                    onChange={e => setDraft(c => c ? { ...c, costAlertThreshold: Number(e.target.value) } : c)}
                  />
                  <FormField
                    label="Spin detect (min)"
                    type="number"
                    value={draft.spinDetectionWindowMin}
                    onChange={e => setDraft(c => c ? { ...c, spinDetectionWindowMin: Number(e.target.value) } : c)}
                  />
                  <FormField
                    label="Global .lacc path"
                    value={draft.globalLaccPath}
                    onChange={e => setDraft(c => c ? { ...c, globalLaccPath: e.target.value } : c)}
                    placeholder="~/.lacc-data"
                  />
                  <FormField
                    label="Editor command"
                    value={draft.editorCommand}
                    onChange={e => setDraft(c => c ? { ...c, editorCommand: e.target.value } : c)}
                  />
                  <FormField
                    label="Default model"
                    value={draft.defaultModel}
                    onChange={e => setDraft(c => c ? { ...c, defaultModel: e.target.value } : c)}
                  />
                  <FormField
                    label="Meta model"
                    value={draft.metaModel}
                    onChange={e => setDraft(c => c ? { ...c, metaModel: e.target.value } : c)}
                  />
                  <div>
                    <FormLabel>Default oversight</FormLabel>
                    <Select
                      value={draft.defaultOversightMode}
                      onChange={v => setDraft(c => c ? { ...c, defaultOversightMode: v } : c)}
                      options={[
                        { value: 'GATE_ON_COMPLETION', label: 'Gate on completion' },
                        { value: 'GATE_ALWAYS', label: 'Gate always' },
                        { value: 'NOTIFY_ONLY', label: 'Notify only' },
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Session token limit (0 = unlimited)"
                    type="number"
                    value={draft.sessionTokenLimit}
                    onChange={e => setDraft(c => c ? { ...c, sessionTokenLimit: Number(e.target.value) } : c)}
                    hint="Used for session usage % in the top bar (subscription plans)"
                  />
                  <FormField
                    label="Weekly token limit (0 = unlimited)"
                    type="number"
                    value={draft.weeklyTokenLimit}
                    onChange={e => setDraft(c => c ? { ...c, weeklyTokenLimit: Number(e.target.value) } : c)}
                    hint="Used for weekly usage % in the top bar (subscription plans)"
                  />
                </div>

                <FormField
                  label="Anthropic Base URL (global override)"
                  value={draft.anthropicBaseUrl ?? ''}
                  onChange={e => setDraft(c => c ? { ...c, anthropicBaseUrl: e.target.value } : c)}
                  placeholder="https://api.anthropic.com (leave blank for default)"
                />

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.autoResumeRateLimited}
                    onChange={e => setDraft(c => c ? { ...c, autoResumeRateLimited: e.target.checked } : c)}
                    className="w-3.5 h-3.5 accent-[var(--color-accent-primary)]"
                  />
                  <span className="text-[14px] text-text-muted">Auto-resume rate-limited tasks</span>
                </label>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" variant="primary" disabled={saving || !draft}>
                {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-full" />
      </div>
      <Skeleton className="h-4 w-56" />
      <div className="flex justify-end pt-2">
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}
