import { useState, useCallback } from 'react';
import type { Task } from '@lacc/shared';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { TaskList } from '../components/TaskList.js';
import { DetailPanel } from '../components/DetailPanel.js';
import { useModal } from '../context/ModalContext.js';

export interface TasksPageProps {
  tasks: Task[];
  activeRepo: string | null;
  modalOpen: boolean;
}

export function TasksPage({ tasks, activeRepo, modalOpen }: TasksPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { openMergeComplete, openFeedback, openGitInit } = useModal();

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

  const restartTask = useCallback(async (task: Task) => {
    const res = await fetch(`/tasks/${task.id}/restart`, { method: 'POST' });
    if (!res.ok) {
      const data = (await res.json()) as { code?: string };
      if (data.code === 'NOT_A_GIT_REPO') openGitInit(task);
    }
  }, [openGitInit]);

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
      if (selectedTask?.status === 'READY') fetch(`/tasks/${selectedTask.id}/discard`, { method: 'POST' });
    },
    onFeedback: () => {
      if (selectedTask) openFeedback(selectedTask);
    },
    onOpenEditor: () => {
      if (selectedTask?.worktreePath) fetch(`/tasks/${selectedTask.id}/open-editor`, { method: 'POST' });
    },
    onOpenBrowser: () => {
      if (selectedTask?.devServerUrl) window.open(selectedTask.devServerUrl, '_blank');
    },
    onKill: () => {
      if (selectedTask) fetch(`/tasks/${selectedTask.id}`, { method: 'DELETE' });
    },
    onPause: () => {
      if (!selectedTask) return;
      const action = selectedTask.status === 'PAUSED' ? 'resume' : 'pause';
      fetch(`/tasks/${selectedTask.id}/${action}`, { method: 'POST' });
    },
    onResume: () => {
      if (selectedTask) fetch(`/tasks/${selectedTask.id}/resume`, { method: 'POST' });
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
      <DetailPanel task={selectedTask} />
    </div>
  );
}
