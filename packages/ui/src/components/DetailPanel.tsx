import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Task } from '@lacc/shared';
import { DiffView } from './DiffView.js';
import { ActionBar } from './ActionBar.js';
import { Tabs, TabBadge, type Tab } from './ui/Tabs.js';
import { WorkflowTab } from './WorkflowTab.js';
import { MessageFeed, CommandBox, CommandPalette } from './feed/index.js';
import type { ParsedInput } from './feed/index.js';
import { useTaskFeed } from '../hooks/useTaskFeed.js';
import { useModal } from '../context/ModalContext.js';
import { useNotify } from '../context/NotificationContext.js';

type TabId = 'feed' | 'diff' | 'preview' | 'workflow' | 'memory';

interface Props {
  task: Task | null;
}

export function DetailPanel({ task }: Props) {
  const [tab, setTab] = useState<TabId>('feed');
  const [slashPrefix, setSlashPrefix] = useState<string | null>(null);
  const [memoryContent, setMemoryContent] = useState<string | null>(null);

  const { openMergeComplete, openFeedback, openGitInit } = useModal();
  const notify = useNotify();

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

  const restart = useCallback(async (t: Task) => {
    const res = await fetch(`/tasks/${t.id}/restart`, { method: 'POST' });
    if (!res.ok) {
      const data = (await res.json()) as { code?: string };
      if (data.code === 'NOT_A_GIT_REPO') openGitInit(t);
    }
  }, [openGitInit]);

  const dispatchCommand = useCallback((t: Task, command: string, args: string) => {
    switch (command) {
      case 'approve':
        openMergeComplete(t);
        break;
      case 'reject':
        fetch(`/tasks/${t.id}/discard`, { method: 'POST' });
        break;
      case 'continue':
        fetch(`/tasks/${t.id}/stage/continue`, { method: 'POST' });
        break;
      case 'skip':
        fetch(`/tasks/${t.id}/stage/skip`, { method: 'POST' });
        break;
      case 'rerun':
        fetch(`/tasks/${t.id}/stage/rerun`, { method: 'POST' });
        break;
      case 'pause':
        fetch(`/tasks/${t.id}/pause`, { method: 'POST' });
        break;
      case 'resume':
        fetch(`/tasks/${t.id}/resume`, { method: 'POST' });
        break;
      case 'restart':
        restart(t);
        break;
      case 'kill':
        fetch(`/tasks/${t.id}`, { method: 'DELETE' });
        break;
      case 'compact':
        fetch(`/tasks/${t.id}/compact`, { method: 'POST' });
        break;
      case 'checkpoint':
        fetch(`/tasks/${t.id}/checkpoint`, { method: 'POST' });
        break;
      case 'feedback':
        openFeedback(t);
        break;
      default:
        console.warn(`Unknown command: /${command}`);
    }
  }, [openMergeComplete, openFeedback, restart]);

  const handleCommandSubmit = useCallback((input: ParsedInput) => {
    if (!task) return;

    if (input.kind === 'command') {
      const displayText = `/${input.command}${input.args ? ` ${input.args}` : ''}`;
      appendUserMessage(displayText);
      dispatchCommand(task, input.command, input.args ?? '');
    } else if (input.kind === 'continue') {
      appendUserMessage(input.context ?? '/continue');
      fetch(`/tasks/${task.id}/stage/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: input.context }),
      });
    } else if (input.kind === 'feedback') {
      fetch(`/tasks/${task.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: input.text }),
      });
    }
  }, [task, appendUserMessage, dispatchCommand]);

  const handlePaletteSelect = useCallback((command: string) => {
    setSlashPrefix(null);
    if (task) {
      appendUserMessage(`/${command}`);
      dispatchCommand(task, command, '');
    }
  }, [task, appendUserMessage, dispatchCommand]);

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
            onContinue={(taskId) => fetch(`/tasks/${taskId}/stage/continue`, { method: 'POST' })}
            onSkipStage={(taskId) => fetch(`/tasks/${taskId}/stage/skip`, { method: 'POST' })}
            onRerunStage={(taskId) => fetch(`/tasks/${taskId}/stage/rerun`, { method: 'POST' })}
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

      <ActionBar task={task} />
    </div>
  );
}
