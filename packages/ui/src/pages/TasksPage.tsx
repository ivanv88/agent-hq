import { useState } from 'react';
import type { Task } from '@lacc/shared';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { TaskList } from '../components/TaskList.js';
import { DetailPanel } from '../components/DetailPanel.js';
import { useTaskActions } from '../hooks/useTaskActions.js';

export interface TasksPageProps {
  tasks: Task[];
  activeRepo: string | null;
  modalOpen: boolean;
}

export function TasksPage({ tasks, activeRepo, modalOpen }: TasksPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedTask = tasks.find(t => t.id === selectedId) ?? null;
  const actions = useTaskActions(selectedTask);

  const activeTaskIds = tasks
    .filter(t => ['SPAWNING', 'WORKING', 'SPINNING', 'RATE_LIMITED', 'PAUSED', 'READY'].includes(t.status))
    .map(t => t.id);

  const nextTask = () => {
    if (!activeTaskIds.length) return;
    const idx = selectedId ? activeTaskIds.indexOf(selectedId) : -1;
    setSelectedId(activeTaskIds[(idx + 1) % activeTaskIds.length]);
  };

  const prevTask = () => {
    if (!activeTaskIds.length) return;
    const idx = selectedId ? activeTaskIds.indexOf(selectedId) : 0;
    setSelectedId(activeTaskIds[(idx - 1 + activeTaskIds.length) % activeTaskIds.length]);
  };

  useKeyboardShortcuts({
    disabled: modalOpen,
    onNew: () => {},
    onSettings: () => {},
    onNextTask: nextTask,
    onPrevTask: prevTask,
    onTabTerminal: () => {},
    onTabDiff: () => {},
    onTabPreview: () => {},
    onComplete:    () => { if (selectedTask?.status === 'READY') actions.openMergeComplete(); },
    onDiscard:     () => { if (selectedTask?.status === 'READY') actions.discard(); },
    onFeedback:    actions.openFeedback,
    onOpenEditor:  () => { if (selectedTask?.worktreePath) actions.openEditor(); },
    onOpenBrowser: actions.openBrowser,
    onKill:        actions.kill,
    onPause:       () => {
      if (!selectedTask) return;
      selectedTask.status === 'PAUSED' ? actions.resume() : actions.pause();
    },
    onResume:      actions.resume,
    onRestart:     actions.restart,
  });

  return (
    <div className="flex flex-1 min-h-0">
      <TaskList tasks={tasks} selectedId={selectedId} onSelect={setSelectedId} activeRepo={activeRepo} />
      <DetailPanel task={selectedTask} />
    </div>
  );
}
