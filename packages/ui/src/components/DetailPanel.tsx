import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Task } from '@lacc/shared';
import { DiffView } from './DiffView.js';
import { ActionBar } from './ActionBar.js';
import { Tabs, TabBadge, type Tab } from './ui/Tabs.js';
import { WorkflowTab } from './WorkflowTab.js';
import { MessageFeed, CommandBox, CommandPalette } from './feed/index.js';
import type { ParsedInput } from './feed/index.js';
import { useTaskFeed } from '../hooks/useTaskFeed.js';
import { useTaskActions } from '../hooks/useTaskActions.js';
import { taskService } from '../services/taskService.js';
import { useNotify } from '../context/NotificationContext.js';

type TabId = 'feed' | 'diff' | 'preview' | 'workflow' | 'memory';

interface Props {
  task: Task | null;
}

export function DetailPanel({ task }: Props) {
  const [tab, setTab] = useState<TabId>('feed');
  const [slashPrefix, setSlashPrefix] = useState<string | null>(null);
  const [memoryContent, setMemoryContent] = useState<string | null>(null);

  const actions = useTaskActions(task);
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
    if (showPreview) result.push({ id: 'preview', label: 'preview' });
    if (task?.workflowName) {
      result.splice(1, 0, {
        id: 'workflow',
        label: 'workflow',
        badge: task.workflowStatus === 'waiting_gate'
          ? <TabBadge variant="warning">gate</TabBadge>
          : undefined,
      });
    }
    if (memoryContent) result.push({ id: 'memory', label: 'memory' });
    return result;
  }, [showDiff, showPreview, task?.status, task?.workflowName, task?.workflowStatus, memoryContent]);

  useEffect(() => {
    if (!task) { setMemoryContent(null); return; }
    taskService.getMemory(task.id)
      .then(r => r.ok ? r.json() : null)
      .then(data => setMemoryContent(data?.content ?? null))
      .catch(() => setMemoryContent(null));
  }, [task?.id]);

  useEffect(() => {
    if (task?.workflowStatus === 'waiting_gate') setTab('workflow');
  }, [task?.workflowStatus]);

  async function handleRegenerateMemory() {
    if (!task) return;
    const res = await taskService.saveMemory(task.id);
    if (!res.ok) { notify((await res.json()).error ?? 'Regeneration failed', true); return; }
    const data = await res.json();
    setMemoryContent(data.content ?? null);
  }

  // Use a ref so command handlers never go stale without recreating
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const handleCommandSubmit = useCallback((input: ParsedInput) => {
    if (!task) return;
    const a = actionsRef.current;

    if (input.kind === 'command') {
      appendUserMessage(`/${input.command}${input.args ? ` ${input.args}` : ''}`);
      const commandMap: Record<string, () => void> = {
        approve:    a.openMergeComplete,
        reject:     a.discard,
        continue:   a.workflowContinue,
        skip:       a.workflowSkip,
        rerun:      a.workflowRerun,
        pause:      a.pause,
        resume:     a.resume,
        restart:    a.restart,
        kill:       a.kill,
        compact:    a.compact,
        checkpoint: a.checkpoint,
        feedback:   a.openFeedback,
      };
      (commandMap[input.command] ?? (() => console.warn(`Unknown command: /${input.command}`)))();
    } else if (input.kind === 'continue') {
      appendUserMessage(input.context ?? '/continue');
      a.workflowContinue(input.context);
    } else if (input.kind === 'feedback') {
      a.feedback(input.text ?? '');
    }
  }, [task, appendUserMessage]);

  const handlePaletteSelect = useCallback((command: string) => {
    setSlashPrefix(null);
    if (!task) return;
    appendUserMessage(`/${command}`);
    const a = actionsRef.current;
    const commandMap: Record<string, () => void> = {
      approve: a.openMergeComplete,
      reject: a.discard,
      pause: a.pause,
      resume: a.resume,
      restart: a.restart,
      kill: a.kill,
    };
    (commandMap[command] ?? (() => console.warn(`Unknown command: /${command}`)))();
  }, [task, appendUserMessage]);

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-[13px]">
        Select a task or press N to create one
      </div>
    );
  }

  return (
    <div className="animate-slide-in flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 20px',
          borderBottom: '1px solid #13131f', background: '#060610', flexShrink: 0 }}>
        <Tabs tabs={tabs} activeTab={tab} onChange={id => setTab(id as TabId)} variant="underline" />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center',
            gap: 8, fontSize: 12, paddingBottom: 1, paddingRight: 4 }}>
          {task.branchName && <span style={{ color: 'var(--text-ghost)' }}>{task.branchName}</span>}
          {task.costUsd > 0 && <span style={{ color: 'var(--text-muted)' }}>${task.costUsd.toFixed(4)}</span>}
          {task.contextTokensUsed && (
            <span style={{ color: 'var(--text-muted)' }}>{Math.round(task.contextTokensUsed / 1000)}k ctx</span>
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
              <CommandBox task={task} onSubmit={handleCommandSubmit} onSlashChange={setSlashPrefix} />
            </div>
          </>
        )}
        {tab === 'diff' && showDiff && (
          <DiffView key={task.id} taskId={task.id} active={tab === 'diff'} />
        )}
        {tab === 'workflow' && task.workflowName && (
          <WorkflowTab
            task={task}
            onContinue={(id) => taskService.workflowContinue(id)}
            onSkipStage={(id) => taskService.workflowSkip(id)}
            onRerunStage={(id) => taskService.workflowRerun(id)}
          />
        )}
        {tab === 'preview' && showPreview && (
          <div className="flex flex-col h-full">
            <div className="text-[12px] text-[var(--text-muted)] px-3 py-1 shrink-0">
              Note: preview may be blocked by X-Frame-Options headers.{' '}
              <button onClick={actions.openBrowser} className="text-blue-400 hover:underline">Open in new tab</button>
            </div>
            <iframe src={task.devServerUrl!} className="flex-1 border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms" title="Preview" />
          </div>
        )}
        {tab === 'memory' && memoryContent && (
          <div className="p-4 overflow-y-auto h-full">
            <div className="flex justify-end mb-2">
              <button onClick={handleRegenerateMemory}
                className="text-xs text-text-secondary hover:text-text-primary duration-100">
                Regenerate
              </button>
            </div>
            <div className="whitespace-pre-wrap text-text-secondary text-sm">{memoryContent}</div>
          </div>
        )}
      </div>

      <ActionBar task={task} />
    </div>
  );
}
