import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Task, Notification } from '@lacc/shared';
import { DiffView } from './DiffView.js';
import { ActionBar } from './ActionBar.js';
import { Tabs, TabBadge, type Tab } from './ui/Tabs.js';
import { WorkflowTab } from './WorkflowTab.js';
import { MessageFeed, CommandBox, CommandPalette } from './feed/index.js';
import type { ParsedInput } from './feed/index.js';
import { useTaskFeed } from '../hooks/useTaskFeed.js';

type TabId = 'feed' | 'diff' | 'preview' | 'workflow' | 'memory';

interface Props {
  task: Task | null;
  onComplete: (task: Task) => void;
  onDiscard: (task: Task) => void;
  onFeedback: (task: Task) => void;
  onOpenEditor: (task: Task) => void;
  onKill: (task: Task) => void;
  onPause: (task: Task) => void;
  onResume: (task: Task) => void;
  onRestart: (task: Task) => void;
  onMemory: (task: Task) => void;
  onCommit: (task: Task) => void;
  onMerge: (task: Task) => void;
  onWorkflowContinue: (taskId: string) => void;
  onWorkflowSkip: (taskId: string) => void;
  onWorkflowRerun: (taskId: string) => void;
  onNotify: (notification: Notification) => void;
}

export function DetailPanel({
  task, onComplete, onDiscard, onFeedback,
  onOpenEditor, onKill, onPause, onResume, onRestart, onMemory, onCommit, onMerge,
  onWorkflowContinue, onWorkflowSkip, onWorkflowRerun, onNotify
}: Props) {
  const [tab, setTab] = useState<TabId>('feed');
  const [slashPrefix, setSlashPrefix] = useState<string | null>(null);
  const [memoryContent, setMemoryContent] = useState<string | null>(null);

  const notify = (message: string, isError = false) => {
    onNotify({ message, level: isError ? 'error' : 'info' });
  };

  const { messages, appendUserMessage } = useTaskFeed(task?.id ?? null, task?.retryCount ?? 0);

  const showDiff = task ? ['READY', 'DONE'].includes(task.status) : false;
  const showPreview = Boolean(task?.devServerUrl);

  const tabs = useMemo<Tab[]>(() => {
    const result: Tab[] = [{ id: 'feed', label: 'feed' }];
    if (showDiff) {
      result.push({
        id: 'diff',
        label: 'diff',
        badge: task?.status === 'READY' ? <TabBadge variant="warning">review</TabBadge> : undefined,
      });
    }
    if (showPreview) {
      result.push({ id: 'preview', label: 'preview' });
    }
    if (task?.workflowName) {
      result.splice(1, 0, {
        id: 'workflow',
        label: 'workflow',
        badge: task.workflowStatus === 'waiting_gate'
          ? <TabBadge variant="warning">gate</TabBadge>
          : undefined,
      });
    }
    if (memoryContent) {
      result.push({ id: 'memory', label: 'memory' });
    }
    return result;
  }, [showDiff, showPreview, task?.status, task?.workflowName, task?.workflowStatus, memoryContent]);

  useEffect(() => {
    if (!task) { setMemoryContent(null); return; }
    fetch(`/api/tasks/${task.id}/memory`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setMemoryContent(data?.content ?? null))
      .catch(() => setMemoryContent(null));
  }, [task?.id]);

  useEffect(() => {
    if (task?.workflowStatus === 'waiting_gate') setTab('workflow');
  }, [task?.workflowStatus]);

  // Route CommandBox submissions to the correct API
  const handleCommandSubmit = useCallback((input: ParsedInput) => {
    if (!task) return;

    if (input.kind === 'command') {
      // Commands are ephemeral — show client-side only
      const displayText = `/${input.command}${input.args ? ` ${input.args}` : ''}`;
      appendUserMessage(displayText);
      routeCommand(task, input.command, input.args, {
        onComplete, onDiscard, onFeedback, onKill, onPause, onResume, onRestart,
        onWorkflowContinue, onWorkflowSkip, onWorkflowRerun,
      });
    } else if (input.kind === 'continue') {
      appendUserMessage(input.context ?? '/continue');
      fetch(`/tasks/${task.id}/stage/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: input.context }),
      });
    } else if (input.kind === 'feedback') {
      // Don't appendUserMessage — server injects user_message into the SSE
      // stream via injectLogLine, so it arrives live and replays in order
      fetch(`/tasks/${task.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: input.text }),
      });
    }
  }, [task, appendUserMessage, onComplete, onDiscard, onFeedback, onKill, onPause, onResume, onRestart, onWorkflowContinue, onWorkflowSkip, onWorkflowRerun]);

  const handlePaletteSelect = useCallback((command: string) => {
    setSlashPrefix(null);
    // Insert command into the box — handled by filling text
    // For now, route immediately
    if (task) {
      appendUserMessage(`/${command}`);
      routeCommand(task, command, '', {
        onComplete, onDiscard, onFeedback, onKill, onPause, onResume, onRestart,
        onWorkflowContinue, onWorkflowSkip, onWorkflowRerun,
      });
    }
  }, [task, appendUserMessage, onComplete, onDiscard, onFeedback, onKill, onPause, onResume, onRestart, onWorkflowContinue, onWorkflowSkip, onWorkflowRerun]);

  function handleRegenerateMemory() {
    if (!task) return;
    fetch(`/api/tasks/${task.id}/memory-snapshot`, { method: 'POST' })
      .then(async r => {
        if (!r.ok) { notify((await r.json()).error ?? 'Regeneration failed', true); return; }
        const data = await r.json();
        setMemoryContent(data.content ?? null);
      })
      .catch(() => notify('Regeneration failed — network error', true));
  }

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-[13px]">
        Select a task or press N to create one
      </div>
    );
  }

  const openBrowser = () => {
    if (task.devServerUrl) window.open(task.devServerUrl, '_blank');
  };

  return (
    <div className="animate-slide-in flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '0 20px',
          borderBottom: '1px solid #13131f',
          background: '#060610',
          flexShrink: 0,
        }}
      >
        <Tabs
          tabs={tabs}
          activeTab={tab}
          onChange={id => setTab(id as TabId)}
          variant="underline"
        />

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            paddingBottom: 1,
            paddingRight: 4,
          }}
        >
          {task.branchName && (
            <span style={{ color: 'var(--text-ghost)' }}>{task.branchName}</span>
          )}
          {task.costUsd > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>${task.costUsd.toFixed(4)}</span>
          )}
          {task.contextTokensUsed && (
            <span style={{ color: 'var(--text-muted)' }}>
              {Math.round(task.contextTokensUsed / 1000)}k ctx
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {tab === 'feed' && (
          <>
            <MessageFeed
              key={`${task.id}-${task.retryCount}`}
              messages={messages}
              taskId={task.id}
            />
            <div className="relative shrink-0">
              {slashPrefix && (
                <CommandPalette
                  filter={slashPrefix}
                  taskStatus={task.status}
                  onSelect={handlePaletteSelect}
                  onClose={() => setSlashPrefix(null)}
                />
              )}
              <CommandBox
                task={task}
                onSubmit={handleCommandSubmit}
                onSlashChange={setSlashPrefix}
              />
            </div>
          </>
        )}
        {tab === 'diff' && showDiff && (
          <DiffView key={task.id} taskId={task.id} active={tab === 'diff'} />
        )}
        {tab === 'workflow' && task?.workflowName && (
          <WorkflowTab
            task={task}
            onContinue={onWorkflowContinue}
            onSkipStage={onWorkflowSkip}
            onRerunStage={onWorkflowRerun}
          />
        )}
        {tab === 'preview' && showPreview && (
          <div className="flex flex-col h-full">
            <div className="text-[12px] text-[var(--text-muted)] px-3 py-1 shrink-0">
              Note: preview may be blocked by X-Frame-Options headers.{' '}
              <button onClick={openBrowser} className="text-blue-400 hover:underline">Open in new tab</button>
            </div>
            <iframe
              src={task.devServerUrl!}
              className="flex-1 border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="Preview"
            />
          </div>
        )}
        {tab === 'memory' && memoryContent && (
          <div className="p-4 overflow-y-auto h-full">
            <div className="flex justify-end mb-2">
              <button
                onClick={handleRegenerateMemory}
                className="text-xs text-text-secondary hover:text-text-primary duration-100"
              >
                Regenerate
              </button>
            </div>
            <div className="whitespace-pre-wrap text-text-secondary text-sm">
              {memoryContent}
            </div>
          </div>
        )}
      </div>

      {/* Action bar — kept alongside CommandBox for buttons not yet in palette */}
      <ActionBar
        task={task}
        onComplete={() => onComplete(task)}
        onDiscard={() => onDiscard(task)}
        onFeedback={() => onFeedback(task)}
        onOpenEditor={() => onOpenEditor(task)}
        onOpenBrowser={openBrowser}
        onKill={() => onKill(task)}
        onPause={() => onPause(task)}
        onResume={() => onResume(task)}
        onRestart={() => onRestart(task)}
        onMemory={() => onMemory(task)}
        onCommit={() => onCommit(task)}
        onMerge={() => onMerge(task)}
        onWorkflowContinue={() => onWorkflowContinue(task.id)}
        onWorkflowSkip={() => onWorkflowSkip(task.id)}
        onWorkflowRerun={() => onWorkflowRerun(task.id)}
        onSaveMemory={() => {
          fetch(`/api/tasks/${task.id}/memory-snapshot`, { method: 'POST' })
            .then(async r => {
              if (!r.ok) { notify((await r.json()).error ?? 'Snapshot failed', true); return; }
              const data = await r.json();
              setMemoryContent(data.content ?? null);
              notify('Memory snapshot saved');
            })
            .catch(() => notify('Snapshot failed — network error', true));
        }}
        onArchive={(level) => {
          fetch(`/api/tasks/${task.id}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level }),
          })
            .then(async r => {
              if (!r.ok) { notify((await r.json()).error ?? 'Archive failed', true); }
            })
            .catch(() => notify('Archive failed — network error', true));
        }}
        onGitPull={() => {
          fetch(`/api/tasks/${task.id}/git/pull`, { method: 'POST' })
            .then(async r => {
              const data = await r.json();
              if (!data.ok) notify(data.message ?? 'Pull failed', true);
              else notify('Pulled successfully');
            })
            .catch(() => notify('Pull failed — network error', true));
        }}
        onGitPush={() => {
          fetch(`/api/tasks/${task.id}/git/push`, { method: 'POST' })
            .then(async r => {
              const data = await r.json();
              if (!data.ok) notify(data.message ?? 'Push failed', true);
              else notify('Pushed successfully');
            })
            .catch(() => notify('Push failed — network error', true));
        }}
        onGitRebase={() => {
          fetch(`/api/tasks/${task.id}/git/rebase`, { method: 'POST' })
            .then(async r => {
              const data = await r.json();
              if (!data.ok) notify(data.message ?? 'Rebase failed', true);
              else notify('Rebased successfully');
            })
            .catch(() => notify('Rebase failed — network error', true));
        }}
        onGitStash={() => {
          fetch(`/api/tasks/${task.id}/git/stash`, { method: 'POST' })
            .then(async r => {
              const data = await r.json();
              if (!data.ok) notify(data.message ?? 'Stash failed', true);
              else notify('Stashed successfully');
            })
            .catch(() => notify('Stash failed — network error', true));
        }}
      />
    </div>
  );
}

/** Route a slash command to the correct API call or callback */
function routeCommand(
  task: Task,
  command: string,
  args: string,
  actions: {
    onComplete: (task: Task) => void;
    onDiscard: (task: Task) => void;
    onFeedback: (task: Task) => void;
    onKill: (task: Task) => void;
    onPause: (task: Task) => void;
    onResume: (task: Task) => void;
    onRestart: (task: Task) => void;
    onWorkflowContinue: (taskId: string) => void;
    onWorkflowSkip: (taskId: string) => void;
    onWorkflowRerun: (taskId: string) => void;
  },
) {
  switch (command) {
    case 'approve':
      actions.onComplete(task);
      break;
    case 'reject':
      actions.onDiscard(task);
      break;
    case 'continue':
      actions.onWorkflowContinue(task.id);
      break;
    case 'skip':
      actions.onWorkflowSkip(task.id);
      break;
    case 'rerun':
      actions.onWorkflowRerun(task.id);
      break;
    case 'pause':
      actions.onPause(task);
      break;
    case 'resume':
      actions.onResume(task);
      break;
    case 'restart':
      actions.onRestart(task);
      break;
    case 'kill':
      actions.onKill(task);
      break;
    case 'compact':
      fetch(`/tasks/${task.id}/compact`, { method: 'POST' });
      break;
    case 'checkpoint':
      fetch(`/tasks/${task.id}/checkpoint`, { method: 'POST' });
      break;
    // cost and diff are client-side — no-op for now, would inject a local FeedMessage
    case 'cost':
    case 'diff':
      break;
    default:
      console.warn(`Unknown command: /${command}`);
  }
}
