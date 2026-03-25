import { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Tabs } from '../components/ui/Tabs.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import type { MetaMessage } from '@lacc/shared';
import { WorkflowEditor } from '../components/WorkflowEditor.js';
import { CommandEditor } from '../components/CommandEditor.js';
import type { WorkflowDefinition, CommandDefinition } from '@lacc/shared';

interface SkillOrAgent {
  name: string;
  filename: string;
  content: string;
}

type TabId = 'library' | 'workbench' | 'workflows' | 'commands';

const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'workbench', label: 'Workbench' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'commands', label: 'Commands' },
];

interface LibraryPageProps {
  activeRepo?: string | null;
}

export function LibraryPage({ activeRepo }: LibraryPageProps) {
  const [tab, setTab] = useState<TabId>('library');
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Page header */}
      <div className="shrink-0 px-6 pt-5 border-b border-border-default">
        <div className="text-text-ghost text-[11px] tracking-[0.1em] uppercase mb-3">
          Library
        </div>
        <Tabs
          tabs={TABS}
          activeTab={tab}
          onChange={id => setTab(id as TabId)}
          variant="underline"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col px-6">
        {tab === 'library' && <LibraryTab refreshKey={libraryRefreshKey} />}
        {tab === 'workbench' && (
          <WorkbenchTab
            activeRepo={activeRepo}
            onAfterSend={() => setLibraryRefreshKey(k => k + 1)}
          />
        )}
        {tab === 'workflows' && <WorkflowsTab />}
        {tab === 'commands' && <CommandsTab />}
      </div>
    </div>
  );
}

// ─── Library Tab ───────────────────────────────────────────────────────────────

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
    ])
      .then(([s, a]) => {
        setSkills(s as SkillOrAgent[]);
        setAgents(a as SkillOrAgent[]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex gap-4 py-5">
        <div className="w-48 shrink-0 flex flex-col gap-1 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
        <div className="flex-1 rounded border border-border-default bg-surface-base p-3 flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className={`h-3 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      </div>
    );
  }

  const total = skills.length + agents.length;

  return (
    <div className="flex-1 min-h-0 flex gap-4 py-5">
      {/* File tree */}
      <div className="w-48 shrink-0 overflow-y-auto rounded border border-border-default bg-surface-base">
        {total === 0 && (
          <div className="text-[12px] text-text-ghost p-3">
            No skills or agents found in ~/.lacc-data/.claude/
          </div>
        )}
        {skills.length > 0 && (
          <>
            <div className="text-[12px] text-text-ghost px-2 pt-2 pb-1 uppercase tracking-wider">
              Skills
            </div>
            {skills.map(s => (
              <button
                key={s.filename}
                onClick={() => setSelected(s)}
                className={`w-full text-left px-2 py-1 text-[14px] truncate transition-colors duration-100 ${
                  selected?.filename === s.filename
                    ? 'bg-surface-overlay text-text-body'
                    : 'text-text-muted hover:text-text-bright hover:bg-surface-active'
                }`}
                title={s.filename}
              >
                {s.name}
              </button>
            ))}
          </>
        )}
        {agents.length > 0 && (
          <>
            <div className="text-[12px] text-text-ghost px-2 pt-2 pb-1 uppercase tracking-wider">
              Agents
            </div>
            {agents.map(a => (
              <button
                key={a.filename}
                onClick={() => setSelected(a)}
                className={`w-full text-left px-2 py-1 text-[14px] truncate transition-colors duration-100 ${
                  selected?.filename === a.filename
                    ? 'bg-surface-overlay text-text-body'
                    : 'text-text-muted hover:text-text-bright hover:bg-surface-active'
                }`}
                title={a.filename}
              >
                {a.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Content viewer */}
      <div className="flex-1 overflow-y-auto rounded border border-border-default bg-surface-base">
        {selected ? (
          <pre className="text-[14px] text-text-muted p-3 whitespace-pre-wrap font-mono leading-relaxed">
            {selected.content}
          </pre>
        ) : (
          <div className="text-[12px] text-text-ghost p-3">
            Select a skill or agent to view its content
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workbench Tab ─────────────────────────────────────────────────────────────

function WorkbenchTab({ activeRepo, onAfterSend }: { activeRepo?: string | null; onAfterSend?: () => void }) {
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
    const userMsg: MetaMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      createdAt: new Date(),
    };
    setHistory(h => [...h, userMsg]);
    try {
      const res = await fetch('/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, repoPath: activeRepo ?? undefined }),
      });
      const data = (await res.json()) as { response: string };
      const assistantMsg: MetaMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        createdAt: new Date(),
      };
      setHistory(h => [...h, assistantMsg]);
      onAfterSend?.();
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
    <div className="flex-1 min-h-0 flex flex-col gap-2 py-5">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[12px] text-text-ghost">
          Chat with meta-Claude to create skills and agents
        </span>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            disabled={clearing}
            className="text-[12px] text-text-muted hover:text-text-bright disabled:opacity-50 transition-colors duration-100"
          >
            {clearing ? 'Clearing...' : 'Clear ↺'}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2 rounded border border-border-default bg-surface-base">
        {history.length === 0 && (
          <div className="text-[12px] text-text-muted text-center py-6">
            Ask meta-Claude to create skills or agents.
            <br />
            e.g. "Create a strict TypeScript linter agent"
          </div>
        )}
        {history.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded px-2.5 py-1.5 text-[14px] leading-relaxed border ${
                msg.role === 'user'
                  ? 'bg-surface-overlay border-border-accent text-text-bright'
                  : 'bg-surface-raised border-border-emphasis text-text-muted'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded px-2.5 py-1.5 text-[14px] bg-surface-raised border border-border-emphasis text-text-muted">
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
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={sending}
        />
        <Button variant="primary" onClick={send} disabled={sending || !input.trim()}>
          Send ↵
        </Button>
      </div>
    </div>
  );
}

// ─── Workflows Tab ──────────────────────────────────────────────────────────

function WorkflowsTab() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [selected, setSelected] = useState<WorkflowDefinition | null | 'new'>(null);

  const load = () => {
    Promise.all([
      fetch('/workflows').then(r => r.json()),
      fetch('/commands').then(r => r.json()),
    ]).then(([wfs, cmds]) => {
      setWorkflows(wfs as WorkflowDefinition[]);
      setCommands(cmds as CommandDefinition[]);
    }).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  if (selected !== null) {
    return (
      <WorkflowEditor
        workflow={selected === 'new' ? null : selected}
        commands={commands}
        onSave={async (wf) => {
          const isNew = selected === 'new';
          await fetch(isNew ? '/workflows' : `/workflows/${wf.name}`, {
            method: isNew ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(wf),
          });
          load();
          setSelected(null);
        }}
        onDelete={async (name) => {
          await fetch(`/workflows/${name}`, { method: 'DELETE' });
          load();
          setSelected(null);
        }}
        onCancel={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center justify-between">
        <span className="text-text-ghost text-xs uppercase tracking-widest">Workflows</span>
        <Button variant="ghost" size="sm" onClick={() => setSelected('new')}>+ New</Button>
      </div>
      {workflows.length === 0 && (
        <div className="text-text-ghost text-sm text-center py-8">
          No workflows yet. Click + New to create one.
        </div>
      )}
      {workflows.map(wf => (
        <div
          key={wf.name}
          className="flex items-center gap-3 px-3 py-2.5 rounded border border-border-default cursor-pointer hover:bg-surface-inset transition-colors duration-100"
          onClick={() => setSelected(wf)}
        >
          <span className="text-text-body text-sm flex-1">{wf.name}</span>
          <span className="text-text-ghost text-xs">{wf.stages.length} stages</span>
          <span className="text-text-ghost text-xs">{wf.description}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Commands Tab ────────────────────────────────────────────────────────────

function CommandsTab() {
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [selected, setSelected] = useState<CommandDefinition | null | 'new'>(null);

  const load = () => {
    fetch('/commands').then(r => r.json()).then(setCommands).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  if (selected !== null) {
    return (
      <CommandEditor
        command={selected === 'new' ? null : selected}
        onSave={async (cmd) => {
          const isNew = selected === 'new';
          await fetch(isNew ? '/commands' : `/commands/${cmd.filename}`, {
            method: isNew ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cmd),
          });
          load();
          setSelected(null);
        }}
        onDelete={async (name) => {
          await fetch(`/commands/${name}`, { method: 'DELETE' });
          load();
          setSelected(null);
        }}
        onCancel={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center justify-between">
        <span className="text-text-ghost text-xs uppercase tracking-widest">Commands</span>
        <Button variant="ghost" size="sm" onClick={() => setSelected('new')}>+ New</Button>
      </div>
      {commands.length === 0 && (
        <div className="text-text-ghost text-sm text-center py-8">
          No commands yet. Click + New to create one.
        </div>
      )}
      {commands.map(cmd => (
        <div
          key={cmd.filename}
          className="flex items-center gap-3 px-3 py-2.5 rounded border border-border-default cursor-pointer hover:bg-surface-inset transition-colors duration-100"
          onClick={() => setSelected(cmd)}
        >
          <span className="text-text-body text-sm flex-1">{cmd.name}</span>
          <span className="text-text-ghost text-xs font-mono">{cmd.filename}</span>
          <span className="text-text-ghost text-xs">{cmd.description}</span>
        </div>
      ))}
    </div>
  );
}
