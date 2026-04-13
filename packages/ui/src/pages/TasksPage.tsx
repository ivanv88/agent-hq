import { useState, useCallback } from 'react';
import type { Task, Notification } from '@lacc/shared';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { TaskList } from '../components/TaskList.js';
import { DetailPanel } from '../components/DetailPanel.js';

export interface TasksPageProps {
  tasks: Task[];
  activeRepo: string | null;
  modalOpen: boolean;
  openFeedback: (task: Task) => void;
  openMemory: (task: Task) => void;
  openCommit: (task: Task) => void;
  openMerge: (task: Task) => void;
  openMergeComplete: (task: Task) => void;
  openGitInit: (task: Task) => void;
  apiAction: (path: string, method?: string, body?: unknown) => Promise<void>;
  onNotify: (notification: Notification) => void;
}

export function TasksPage({
  tasks,
  activeRepo,
  modalOpen,
  openFeedback,
  openMemory,
  openCommit,
  openMerge,
  openMergeComplete,
  openGitInit,
  apiAction,
  onNotify,
}: TasksPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedTask = tasks.find(t => t.id === selectedId) ?? null;

  const taskIds = tasks
    .filter(t =>
      ['SPAWNING', 'WORKING', 'SPINNING', 'RATE_LIMITED', 'PAUSED', 'READY'].includes(t.status),
    )
    .map(t => t.id);

  const nextTask = useCallback(() => {
    if (!taskIds.length) return;
    const idx = selectedId ? taskIds.indexOf(selectedId) : -1;
    setSelectedId(taskIds[(idx + 1) % taskIds.length]);
  }, [taskIds, selectedId]);

  const prevTask = useCallback(() => {
    if (!taskIds.length) return;
    const idx = selectedId ? taskIds.indexOf(selectedId) : 0;
    setSelectedId(taskIds[(idx - 1 + taskIds.length) % taskIds.length]);
  }, [taskIds, selectedId]);

  const restartTask = useCallback(
    async (task: Task) => {
      const res = await fetch(`/tasks/${task.id}/restart`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json()) as { code?: string };
        if (data.code === 'NOT_A_GIT_REPO') openGitInit(task);
      }
    },
    [openGitInit],
  );

  useKeyboardShortcuts({
    disabled: modalOpen,
    onNew: () => {},
    onSettings: () => {},
    onNextTask: nextTask,
    onPrevTask: prevTask,
    onTabTerminal: () => {},
    onTabDiff: () => {},
    onTabPreview: () => {},
    onComplete: () => {
      if (selectedTask?.status === 'READY') openMergeComplete(selectedTask);
    },
    onDiscard: () => {
      if (selectedTask?.status === 'READY') apiAction(`/tasks/${selectedTask.id}/discard`);
    },
    onFeedback: () => {
      if (selectedTask) openFeedback(selectedTask);
    },
    onOpenEditor: () => {
      if (selectedTask?.worktreePath) apiAction(`/tasks/${selectedTask.id}/open-editor`);
    },
    onOpenBrowser: () => {
      if (selectedTask?.devServerUrl) window.open(selectedTask.devServerUrl, '_blank');
    },
    onKill: () => {
      if (selectedTask) apiAction(`/tasks/${selectedTask.id}`, 'DELETE');
    },
    onPause: () => {
      if (!selectedTask) return;
      const action = selectedTask.status === 'PAUSED' ? 'resume' : 'pause';
      apiAction(`/tasks/${selectedTask.id}/${action}`);
    },
    onResume: () => {
      if (selectedTask) apiAction(`/tasks/${selectedTask.id}/resume`);
    },
    onRestart: () => {
      if (selectedTask) restartTask(selectedTask);
    },
  });

  return (
    <div className="flex flex-1 min-h-0">
      <TaskList
        tasks={tasks}
        selectedId={selectedId}
        onSelect={setSelectedId}
        activeRepo={activeRepo}
      />
      <DetailPanel
        task={selectedTask}
        onComplete={openMergeComplete}
        onDiscard={task => apiAction(`/tasks/${task.id}/discard`)}
        onFeedback={openFeedback}
        onOpenEditor={task => apiAction(`/tasks/${task.id}/open-editor`)}
        onKill={task => apiAction(`/tasks/${task.id}`, 'DELETE')}
        onPause={task => apiAction(`/tasks/${task.id}/pause`)}
        onResume={task => apiAction(`/tasks/${task.id}/resume`)}
        onRestart={restartTask}
        onMemory={openMemory}
        onCommit={openCommit}
        onMerge={openMerge}
        onWorkflowContinue={async (taskId) => {
          await fetch(`/tasks/${taskId}/stage/continue`, { method: 'POST' });
        }}
        onWorkflowSkip={async (taskId) => {
          await fetch(`/tasks/${taskId}/stage/skip`, { method: 'POST' });
        }}
        onWorkflowRerun={async (taskId) => {
          await fetch(`/tasks/${taskId}/stage/rerun`, { method: 'POST' });
        }}
        onNotify={onNotify}
      />
    </div>
  );
}
