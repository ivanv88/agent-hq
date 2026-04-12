import { useState, useEffect, useRef } from 'react';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { Button } from '../components/ui/Button.js';
import { Input, inputClassName } from '../components/ui/Input.js';
import { ModalHeader } from '../components/ui/Modal.js';
import { Select } from '../components/ui/Select.js';
import { FormField, FormLabel } from '../components/ui/FormField.js';
import type { MetaMessage } from '@lacc/shared';

interface Config {
  poolSize: number;
  costAlertThreshold: number;
  spinDetectionWindowMin: number;
  globalLaccPath: string;
  editorCommand: string;
  defaultModel: string;
  defaultOversightMode: string;
  anthropicBaseUrl: string;
  metaModel: string;
  autoResumeRateLimited: boolean;
}

interface SkillOrAgent {
  name: string;
  filename: string;
  content: string;
}

type TabId = 'settings' | 'library' | 'workbench';

interface Props {
  onClose: () => void;
}

const TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'library', label: 'Library' },
  { id: 'workbench', label: 'Workbench' },
];

export function SettingsModal({ onClose }: Props) {
  const [tab, setTab] = useState<TabId>('settings');
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex flex-col gap-3" style={{ minHeight: '420px' }}>
        <ModalHeader
          title="Configuration"
          tabs={TABS}
          activeTab={tab}
          onTabChange={t => setTab(t as TabId)}
        />

        {tab === 'settings' && <SettingsTab onClose={onClose} />}
        {tab === 'library' && <LibraryTab refreshKey={libraryRefreshKey} />}
        {tab === 'workbench' && <WorkbenchTab onAfterSend={() => setLibraryRefreshKey(k => k + 1)} />}
      </div>
    </ModalOverlay>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/config').then(r => r.json()).then(setConfig).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch('/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {config && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Pool size"
              type="number"
              value={config.poolSize}
              onChange={e => setConfig(c => c ? { ...c, poolSize: Number(e.target.value) } : c)}
            />
            <FormField
              label="Cost alert ($)"
              type="number"
              value={config.costAlertThreshold}
              onChange={e => setConfig(c => c ? { ...c, costAlertThreshold: Number(e.target.value) } : c)}
            />
            <FormField
              label="Spin detect (min)"
              type="number"
              value={config.spinDetectionWindowMin}
              onChange={e => setConfig(c => c ? { ...c, spinDetectionWindowMin: Number(e.target.value) } : c)}
            />
            <FormField
              label="Global .lacc path"
              value={config.globalLaccPath}
              onChange={e => setConfig(c => c ? { ...c, globalLaccPath: e.target.value } : c)}
              placeholder="~/.lacc-data"
            />
            <FormField
              label="Editor command"
              value={config.editorCommand}
              onChange={e => setConfig(c => c ? { ...c, editorCommand: e.target.value } : c)}
            />
            <FormField
              label="Default model"
              value={config.defaultModel}
              onChange={e => setConfig(c => c ? { ...c, defaultModel: e.target.value } : c)}
            />
            <FormField
              label="Meta model"
              value={config.metaModel}
              onChange={e => setConfig(c => c ? { ...c, metaModel: e.target.value } : c)}
            />
            <div>
              <FormLabel>Default oversight</FormLabel>
              <Select
                value={config.defaultOversightMode}
                onChange={v => setConfig(c => c ? { ...c, defaultOversightMode: v } : c)}
                options={[
                  { value: 'GATE_ON_COMPLETION', label: 'Gate on completion' },
                  { value: 'GATE_ALWAYS', label: 'Gate always' },
                  { value: 'NOTIFY_ONLY', label: 'Notify only' },
                ]}
              />
            </div>
          </div>
          <FormField
            label="Anthropic Base URL (global override)"
            value={config.anthropicBaseUrl ?? ''}
            onChange={e => setConfig(c => c ? { ...c, anthropicBaseUrl: e.target.value } : c)}
            placeholder="https://api.anthropic.com (leave blank for default)"
          />

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.autoResumeRateLimited}
              onChange={e => setConfig(c => c ? { ...c, autoResumeRateLimited: e.target.checked } : c)}
              className="w-3.5 h-3.5 accent-[var(--c-accent)]"
            />
            <span className="text-[14px] text-[var(--text-muted)]">Auto-resume rate-limited tasks</span>
          </label>
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={onClose}
          style={{ background: 'transparent', border: '1px solid #1a1a28', color: 'var(--text-muted)' }}
        >
          Close
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={saving}
        >
          {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

// ─── Library Tab ──────────────────────────────────────────────────────────────

function LibraryTab({ refreshKey }: { refreshKey: number }) {
  const [skills, setSkills] = useState<SkillOrAgent[]>([]);
  const [agents, setAgents] = useState<SkillOrAgent[]>([]);
  const [selected, setSelected] = useState<SkillOrAgent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/config/skills').then(r => r.json()),
      fetch('/config/agents').then(r => r.json()),
    ]).then(([s, a]) => {
      setSkills(s as SkillOrAgent[]);
      setAgents(a as SkillOrAgent[]);
    }).catch(console.error).finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <div className="text-[14px] text-[var(--text-muted)] py-4">Loading...</div>;

  const total = skills.length + agents.length;

  return (
    <div className="flex gap-3 flex-1 min-h-0" style={{ height: '360px' }}>
      {/* File tree */}
      <div className="w-44 shrink-0 overflow-y-auto" style={{ border: '1px solid #13131f', borderRadius: 4, background: '#07070f' }}>
        {total === 0 && (
          <div className="text-[12px] text-[var(--text-ghost)] p-3">
            No skills or agents found in ~/.claude/
          </div>
        )}
        {skills.length > 0 && (
          <>
            <div className="text-[12px] text-[var(--text-ghost)] px-2 pt-2 pb-1 uppercase tracking-wider">Skills</div>
            {skills.map(s => (
              <button
                key={s.filename}
                onClick={() => setSelected(s)}
                className={`w-full text-left px-2 py-1 text-[14px] truncate ${selected?.filename === s.filename ? 'bg-[#111120] text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-\[#c0c0e0\] hover:bg-[#1e1e30]'}`}
                title={s.filename}
              >
                {s.name}
              </button>
            ))}
          </>
        )}
        {agents.length > 0 && (
          <>
            <div className="text-[12px] text-[var(--text-ghost)] px-2 pt-2 pb-1 uppercase tracking-wider">Agents</div>
            {agents.map(a => (
              <button
                key={a.filename}
                onClick={() => setSelected(a)}
                className={`w-full text-left px-2 py-1 text-[14px] truncate ${selected?.filename === a.filename ? 'bg-[#111120] text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-\[#c0c0e0\] hover:bg-[#1e1e30]'}`}
                title={a.filename}
              >
                {a.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Content viewer */}
      <div className="flex-1 overflow-y-auto" style={{ border: '1px solid #13131f', borderRadius: 4, background: '#060610' }}>
        {selected ? (
          <pre className="text-[14px] text-[var(--text-muted)] p-3 whitespace-pre-wrap font-mono leading-relaxed">
            {selected.content}
          </pre>
        ) : (
          <div className="text-[12px] text-[var(--text-ghost)] p-3">Select a skill or agent to view its content</div>
        )}
      </div>
    </div>
  );
}

// ─── Workbench Tab ────────────────────────────────────────────────────────────

function WorkbenchTab({ onAfterSend }: { onAfterSend?: () => void }) {
  const [history, setHistory] = useState<MetaMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/meta/history').then(r => r.json()).then(setHistory).catch(console.error);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);
    const userMsg: MetaMessage = { id: Date.now().toString(), role: 'user', content: msg, createdAt: new Date() };
    setHistory(h => [...h, userMsg]);
    try {
      const res = await fetch('/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json() as { response: string };
      const assistantMsg: MetaMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.response, createdAt: new Date() };
      setHistory(h => [...h, assistantMsg]);
      onAfterSend?.(); // refresh skills/agents in Library tab
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    setClearing(true);
    try {
      await fetch('/meta/history', { method: 'DELETE' });
      setHistory([]);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 flex-1" style={{ height: '360px' }}>
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[12px] text-[var(--text-ghost)]">Chat with meta-Claude to create skills and agents</span>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            disabled={clearing}
            className="text-[12px] text-[var(--text-muted)] hover:text-\[#c0c0e0\] disabled:opacity-50"
          >
            {clearing ? 'Clearing...' : 'Clear ↺'}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2" style={{ border: '1px solid #13131f', borderRadius: 4, background: '#060610' }}>
        {history.length === 0 && (
          <div className="text-[12px] text-[var(--text-muted)] text-center py-6">
            Ask meta-Claude to create skills or agents.<br />
            e.g. "Create a strict TypeScript linter agent"
          </div>
        )}
        {history.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] rounded px-2.5 py-1.5 text-[14px] leading-relaxed"
              style={
                msg.role === 'user'
                  ? { background: '#141428', border: '1px solid #3b3b60', color: '#c8c8e8' }
                  : { background: '#0c0c18', border: '1px solid #1e1e30', color: 'var(--text-muted)' }
              }
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div
              className="rounded px-2.5 py-1.5 text-[14px]"
              style={{ background: '#0c0c18', border: '1px solid #1e1e30', color: 'var(--text-muted)' }}
            >
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 shrink-0">
        <Input
          className="flex-1"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask meta-Claude..."
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={sending}
        />
        <Button
          variant="primary"
          onClick={send}
          disabled={sending || !input.trim()}
        >
          Send ↵
        </Button>
      </div>
    </div>
  );
}
