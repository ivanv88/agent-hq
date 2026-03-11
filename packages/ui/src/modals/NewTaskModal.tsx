import { useState, useEffect, useRef } from 'react';
import type { SpawnTaskInput } from '@lacc/shared';
import { generateBranchPreview } from '../utils.js';
import { Button } from '../components/ui/Button.js';
import { Input, Textarea } from '../components/ui/Input.js';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { FolderPickerModal } from '../components/FolderPickerModal.js';

// ─── Oversight Info ───────────────────────────────────────────────────────────

function OversightInfo() {
  return (
    <div className="relative group inline-flex items-center">
      <span className="text-text-ghost group-hover:text-text-muted transition-colors duration-100 cursor-default text-xs select-none">
        ⓘ
      </span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-100 pointer-events-none w-64">
        <div className="bg-surface-overlay border border-border-emphasis rounded p-3 text-xs text-text-muted flex flex-col gap-2">
          <div><span className="text-text-bright">Gate on Done</span> — Runs freely, pauses for your review only when finished.</div>
          <div><span className="text-text-bright">Gate Always</span> — Pauses before every tool call and waits for your approval.</div>
          <div><span className="text-text-bright">Notify Only</span> — Fully autonomous, notifies you when done. No review gates.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Select ────────────────────────────────────────────────────────────

interface SelectOption { value: string; label: string }

function CustomSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const clickHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler, true);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler, true);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#07070f',
          borderWidth: 1, borderStyle: 'solid', borderColor: open ? '#3b3b5e' : '#1e1e30', borderRadius: 4,
          padding: '8px 12px', fontSize: 14, color: 'var(--text-bright)',
          fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span>{selected?.label ?? value}</span>
        <span style={{ color: '#555', fontSize: 12, marginLeft: 8 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: '#0c0c1a', border: '1px solid #2a2a3e', borderRadius: 4,
          marginTop: 2, overflow: 'hidden',
        }}>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px',
                fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
                background: o.value === value ? '#111120' : 'transparent',
                color: o.value === value ? '#c0c0e8' : '#888',
                borderBottom: '1px solid #13131f',
              }}
              onMouseEnter={ev => { if (o.value !== value) ev.currentTarget.style.background = '#1e1e30'; }}
              onMouseLeave={ev => { if (o.value !== value) ev.currentTarget.style.background = 'transparent'; }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onSubmit: (input: SpawnTaskInput) => Promise<void>;
  repoPaths: string[];
  activeRepo: string | null;
}

export function NewTaskModal({ onClose, onSubmit, repoPaths, activeRepo }: Props) {
  const [repoPath, setRepoPath] = useState(activeRepo ?? repoPaths[0] ?? '');
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState<SpawnTaskInput['taskType']>('feature');
  const [oversightMode, setOversightMode] = useState<SpawnTaskInput['oversightMode']>('GATE_ON_COMPLETION');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [ticket, setTicket] = useState('');
  const [planFirst, setPlanFirst] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gitInitPath, setGitInitPath] = useState<string | null>(null);

  const [prompts, setPrompts] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [agents, setAgents] = useState<Array<{ name: string; filename: string }>>([]);
  const [skills, setSkills] = useState<Array<{ name: string; filename: string }>>([]);
  const [useCustomPath, setUseCustomPath] = useState(repoPaths.length === 0 || (activeRepo !== null && !repoPaths.includes(activeRepo)));
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [devServerMode, setDevServerMode] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchEdited, setBranchEdited] = useState(false);

  const branchPreview = generateBranchPreview(taskType ?? 'feature', ticket, prompt);

  // Auto-fill branch from prompt/ticket unless user has manually edited it
  useEffect(() => {
    if (!branchEdited && branchPreview) setBranchName(branchPreview);
  }, [branchPreview, branchEdited]);

  useEffect(() => {
    Promise.all([
      fetch('/prompts').then(r => r.json()),
      fetch('/config/agents').then(r => r.json()),
      fetch('/config/skills').then(r => r.json()),
    ]).then(([p, a, s]) => {
      setPrompts((p as Array<{ text: string }>).map(x => x.text));
      setAgents(a as Array<{ name: string; filename: string }>);
      setSkills(s as Array<{ name: string; filename: string }>);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!repoPath) { setDevServerMode(null); return; }
    const t = setTimeout(() => {
      fetch(`/config/repo?path=${encodeURIComponent(repoPath)}`)
        .then(r => r.json())
        .then((d: { devServerMode?: string }) => setDevServerMode(d.devServerMode ?? null))
        .catch(() => setDevServerMode(null));
    }, 500);
    return () => clearTimeout(t);
  }, [repoPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        repoPath, prompt, taskType, oversightMode, model, ticket, planFirst,
        branchName: branchName || undefined,
        agentName: agentName || undefined,
        skillNames: skillNames.length > 0 ? skillNames : undefined,
        anthropicBaseUrl: anthropicBaseUrl || undefined,
      });
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === 'NOT_A_GIT_REPO') {
        setGitInitPath(repoPath);
      } else {
        console.error(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGitInit = async () => {
    if (!gitInitPath) return;
    setSubmitting(true);
    try {
      const res = await fetch('/fs/git-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: gitInitPath }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }
      setGitInitPath(null);
      await onSubmit({
        repoPath, prompt, taskType, oversightMode, model, ticket, planFirst,
        branchName: branchName || undefined,
        agentName: agentName || undefined,
        skillNames: skillNames.length > 0 ? skillNames : undefined,
        anthropicBaseUrl: anthropicBaseUrl || undefined,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSkill = (name: string) => {
    setSkillNames(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
  };

  const labelCls = 'text-[12px] text-[var(--text-muted)] mb-2 block tracking-[0.08em] uppercase';

  return (
    <ModalOverlay onClose={onClose} className="!max-w-[90vw]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 style={{ color: 'var(--text-bright)', fontSize: 14, fontWeight: 600 }}>New Task</h2>

        {/* Repo path */}
        <div>
          <label className={labelCls}>Repository</label>
          <div className="flex gap-1.5">
            {repoPaths.length > 0 && !useCustomPath ? (
              <div className="flex-1">
                <CustomSelect
                  value={repoPath}
                  onChange={v => {
                    if (v === '__custom__') { setUseCustomPath(true); setRepoPath(''); }
                    else setRepoPath(v);
                  }}
                  options={[
                    ...repoPaths.map(r => ({ value: r, label: r.split('/').pop() || r })),
                    { value: '__custom__', label: '+ Custom path…' },
                  ]}
                />
              </div>
            ) : (
              <Input
                value={repoPath}
                onChange={e => setRepoPath(e.target.value)}
                placeholder="/path/to/repo"
                required
                autoFocus={!repoPaths.length}
                className="flex-1"
              />
            )}
            <button
              type="button"
              onClick={() => setShowFolderPicker(true)}
              title="Browse filesystem"
              className="px-2.5 bg-surface-base border border-border-emphasis rounded cursor-pointer text-text-disabled hover:text-text-body transition-colors duration-100 flex-shrink-0 text-base"
            >
              📁
            </button>
          </div>
          {repoPaths.length > 0 && useCustomPath && (
            <button
              type="button"
              onClick={() => { setUseCustomPath(false); setRepoPath(activeRepo ?? repoPaths[0]); }}
              className="mt-1 text-xs text-text-ghost hover:text-text-muted bg-transparent border-none cursor-pointer transition-colors duration-100"
            >
              ← Use saved repos
            </button>
          )}
          {showFolderPicker && (
            <FolderPickerModal
              initialPath={repoPath || undefined}
              onSelect={p => { setRepoPath(p); setUseCustomPath(true); setShowFolderPicker(false); }}
              onClose={() => setShowFolderPicker(false)}
            />
          )}
          {devServerMode && (
            <div className="text-xs text-text-muted mt-1">
              Dev server: <span className="text-text-default">{devServerMode}</span>
            </div>
          )}
        </div>

        {/* Prompt */}
        <div className="relative">
          <label className={labelCls}>
            Prompt
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="ml-2 hover:text-[#c0c0e8] transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="History (↑)"
            >↑</button>
          </label>
          <Textarea
            className="min-h-[80px]"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe what you want the agent to do..."
            required
            onKeyDown={e => { if (e.key === 'ArrowUp' && !prompt) setShowHistory(true); }}
          />
          {showHistory && prompts.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-0.5 max-h-40 overflow-y-auto" style={{ background: '#0c0c1a', border: '1px solid #2a2a3e', borderRadius: 4 }}>
              {prompts.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setPrompt(p); setShowHistory(false); }}
                  className="w-full text-left truncate"
                  style={{ padding: '8px 12px', fontSize: 14, color: 'var(--text-muted)', borderBottom: '1px solid #13131f' }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = '#111120')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Task type</label>
            <CustomSelect
              value={taskType ?? 'feature'}
              onChange={v => setTaskType(v as SpawnTaskInput['taskType'])}
              options={['feature', 'fix', 'refactor', 'test', 'chore', 'docs'].map(t => ({ value: t, label: t }))}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[12px] text-[var(--text-muted)] tracking-[0.08em] uppercase">Oversight</span>
              <OversightInfo />
            </div>
            <div className="flex gap-1.5">
              {([
                ['GATE_ON_COMPLETION', 'Gate on Done', 'Agent runs freely and pauses for your review only when done'],
                ['GATE_ALWAYS',        'Gate Always',  'Agent pauses and waits for your approval before every tool call'],
                ['NOTIFY_ONLY',        'Notify Only',  'Agent runs fully autonomously and only notifies you when done'],
              ] as const).map(([val, lbl, tip]) => (
                <button
                  key={val}
                  type="button"
                  title={tip}
                  onClick={() => setOversightMode(val)}
                  style={{
                    flex: 1,
                    background: oversightMode === val ? '#141428' : '#080812',
                    border: `1px solid ${oversightMode === val ? '#3b3b60' : '#1a1a28'}`,
                    color: oversightMode === val ? '#9898d0' : '#888',
                    borderRadius: 4, fontSize: 14, padding: '8px 4px', cursor: 'pointer',
                    transition: 'background 0.1s, color 0.1s',
                  }}
                  onMouseEnter={ev => { ev.currentTarget.style.background = oversightMode === val ? '#1e1e38' : '#141428'; ev.currentTarget.style.color = '#b0b0e0'; }}
                  onMouseLeave={ev => { ev.currentTarget.style.background = oversightMode === val ? '#141428' : '#080812'; ev.currentTarget.style.color = oversightMode === val ? '#9898d0' : '#888'; }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Ticket (optional)</label>
            <Input value={ticket} onChange={e => setTicket(e.target.value)} placeholder="ENG-123" />
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <CustomSelect
              value={model}
              onChange={setModel}
              options={[
                { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
                { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
                { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5' },
              ]}
            />
          </div>
        </div>

        {/* Agent + Skills */}
        {(agents.length > 0 || skills.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {agents.length > 0 && (
              <div>
                <label className={labelCls}>Agent (optional)</label>
                <CustomSelect
                  value={agentName}
                  onChange={setAgentName}
                  options={[{ value: '', label: 'None' }, ...agents.map(a => ({ value: a.name, label: a.name }))]}
                />
              </div>
            )}
            {skills.length > 0 && (
              <div>
                <label className={labelCls}>Skills</label>
                <div className="max-h-24 overflow-y-auto" style={{ border: '1px solid #1e1e30', borderRadius: 4, background: '#07070f' }}>
                  {skills.map(s => (
                    <label
                      key={s.filename}
                      className="flex items-center gap-2 cursor-pointer"
                      style={{ padding: '6px 10px', fontSize: 14, color: 'var(--text-muted)' }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = '#1e1e30')}
                      onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                    >
                      <input type="checkbox" checked={skillNames.includes(s.name)} onChange={() => toggleSkill(s.name)} className="accent-green-500" />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelCls}>Branch name</label>
          <Input
            value={branchName}
            onChange={e => { setBranchName(e.target.value); setBranchEdited(true); }}
            placeholder="lacc/feature-..."
          />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="planFirst" checked={planFirst} onChange={e => setPlanFirst(e.target.checked)} className="accent-green-500" />
          <label htmlFor="planFirst" style={{ fontSize: 14, color: 'var(--text-muted)' }}>Plan first (--permission-mode plan)</label>
        </div>

        {/* Advanced */}
        <div>
          <Button
            variant="link"
            onClick={() => setShowAdvanced(v => !v)}
            style={{ fontSize: 14, color: 'var(--text-muted)' }}
          >
            {showAdvanced ? '▾' : '▸'} Advanced
          </Button>
          {showAdvanced && (
            <div className="mt-2">
              <label className={labelCls}>Anthropic Base URL (override)</label>
              <Input
                value={anthropicBaseUrl}
                onChange={e => setAnthropicBaseUrl(e.target.value)}
                placeholder="https://api.anthropic.com (leave blank for default)"
              />
            </div>
          )}
        </div>

        {gitInitPath && (
          <div className="rounded border border-border-accent bg-surface-inset p-3 flex flex-col gap-2">
            <p className="text-sm text-text-body">
              <span className="text-text-bright font-semibold">Not a git repository.</span>{' '}
              Initialize git in <span className="font-mono text-text-bright">{gitInitPath}</span>?
            </p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={handleGitInit} disabled={submitting}>
                {submitting ? 'Initializing…' : 'Yes, git init'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setGitInitPath(null)} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid #1a1a28', color: 'var(--text-muted)' }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
          >
            {submitting ? 'Spawning...' : 'Spawn Task'}
          </Button>
        </div>
      </form>
    </ModalOverlay>
  );
}
