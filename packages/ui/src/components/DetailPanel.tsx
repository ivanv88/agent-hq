import { useState, useMemo, useEffect } from 'react';
import type { Task } from '@lacc/shared';
import { Terminal } from './Terminal.js';
import { DiffView } from './DiffView.js';
import { ActionBar } from './ActionBar.js';
import { Tabs, TabBadge, type Tab } from './ui/Tabs.js';
import { WorkflowTab } from './WorkflowTab.js';

type TabId = 'terminal' | 'diff' | 'preview' | 'workflow';

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
}

export function DetailPanel({
  task, onComplete, onDiscard, onFeedback,
  onOpenEditor, onKill, onPause, onResume, onRestart, onMemory, onCommit, onMerge,
  onWorkflowContinue, onWorkflowSkip, onWorkflowRerun
}: Props) {
  const [tab, setTab] = useState<TabId>('terminal');

  const showDiff = task ? ['READY', 'DONE'].includes(task.status) : false;
  const showPreview = Boolean(task?.devServerUrl);

  const tabs = useMemo<Tab[]>(() => {
    const result: Tab[] = [{ id: 'terminal', label: 'terminal' }];
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
      result.splice(1, 0, {   // insert after terminal
        id: 'workflow',
        label: 'workflow',
        badge: task.workflowStatus === 'waiting_gate'
          ? <TabBadge variant="warning">gate</TabBadge>
          : undefined,
      });
    }
    return result;
  }, [showDiff, showPreview, task?.status, task?.workflowName, task?.workflowStatus]);

  useEffect(() => {
    if (task?.workflowStatus === 'waiting_gate') setTab('workflow');
  }, [task?.workflowStatus]);

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#666] text-[13px]">
        Select a task or press N to create one
      </div>
    );
  }

  const openBrowser = () => {
    if (task.devServerUrl) window.open(task.devServerUrl, '_blank');
  };

  const openEditor = () => {
    onOpenEditor(task);
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
      <div className="flex-1 overflow-hidden">
        {/* Terminal is always mounted so the SSE connection and xterm state
            survive tab switches. Visibility is toggled via CSS so the DOM
            node stays alive but takes no layout space when hidden. */}
        <Terminal key={`${task.id}-${task.retryCount}`} taskId={task.id} active={tab === 'terminal'} hidden={tab !== 'terminal'} />
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
      </div>

      {/* Action bar */}
      <ActionBar
        task={task}
        onComplete={() => onComplete(task)}
        onDiscard={() => onDiscard(task)}
        onFeedback={() => onFeedback(task)}
        onOpenEditor={openEditor}
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
      />
    </div>
  );
}
