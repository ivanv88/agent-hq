import { useCallback, useRef } from 'react';
import type { Task } from '@lacc/shared';
import { taskService } from '../services/taskService.js';
import { useModal } from '../context/ModalContext.js';
import { useNotify } from '../context/NotificationContext.js';

export interface TaskActions {
  restart:           () => void;
  discard:           () => void;
  kill:              () => void;
  pause:             () => void;
  resume:            () => void;
  openEditor:        () => void;
  openBrowser:       () => void;
  compact:           () => void;
  checkpoint:        () => void;
  feedback:          (text: string) => void;
  workflowContinue:  (context?: string) => void;
  workflowSkip:      () => void;
  workflowRerun:     () => void;
  gitPull:           () => void;
  gitPush:           () => void;
  gitRebase:         () => void;
  gitStash:          () => void;
  saveMemory:        () => void;
  archive:           (level: 'archived' | 'summary' | 'deleted') => void;
  openFeedback:      () => void;
  openMemory:        () => void;
  openCommit:        () => void;
  openMerge:         () => void;
  openMergeComplete: () => void;
}

/**
 * Returns stable action callbacks for a task. All actions are no-ops when task is null.
 * Uses a ref internally so callbacks never go stale without changing identity.
 */
export function useTaskActions(task: Task | null): TaskActions {
  const modal = useModal();
  const notify = useNotify();

  // Keep latest values in a ref so stable callbacks always see current state.
  const ref = useRef({ task, modal, notify });
  ref.current = { task, modal, notify };

  const restart = useCallback(async () => {
    const { task, modal } = ref.current;
    if (!task) return;
    const res = await taskService.restart(task.id);
    if (!res.ok) {
      const data = (await res.json()) as { code?: string };
      if (data.code === 'NOT_A_GIT_REPO') modal.openGitInit(task);
    }
  }, []);

  const gitOp = useCallback(async (
    op: 'gitPull' | 'gitPush' | 'gitRebase' | 'gitStash',
    label: string,
  ) => {
    const { task, notify } = ref.current;
    if (!task) return;
    const res = await taskService[op](task.id);
    const data = await res.json();
    if (!data.ok) notify(data.message ?? `${label} failed`, true);
    else notify(`${label} successful`);
  }, []);

  const saveMemory = useCallback(async () => {
    const { task, notify } = ref.current;
    if (!task) return;
    const res = await taskService.saveMemory(task.id);
    if (!res.ok) { notify((await res.json()).error ?? 'Snapshot failed', true); return; }
    notify('Memory snapshot saved');
  }, []);

  const archive = useCallback(async (level: 'archived' | 'summary' | 'deleted') => {
    const { task, notify } = ref.current;
    if (!task) return;
    const res = await taskService.archive(task.id, level);
    if (!res.ok) notify((await res.json()).error ?? 'Archive failed', true);
  }, []);

  return {
    restart,
    discard:           () => ref.current.task && taskService.discard(ref.current.task.id),
    kill:              () => ref.current.task && taskService.kill(ref.current.task.id),
    pause:             () => ref.current.task && taskService.pause(ref.current.task.id),
    resume:            () => ref.current.task && taskService.resume(ref.current.task.id),
    openEditor:        () => ref.current.task && taskService.openEditor(ref.current.task.id),
    openBrowser:       () => ref.current.task?.devServerUrl && window.open(ref.current.task.devServerUrl, '_blank'),
    compact:           () => ref.current.task && taskService.compact(ref.current.task.id),
    checkpoint:        () => ref.current.task && taskService.checkpoint(ref.current.task.id),
    feedback:          (text) => ref.current.task && taskService.feedback(ref.current.task.id, text),
    workflowContinue:  (ctx) => ref.current.task && taskService.workflowContinue(ref.current.task.id, ctx),
    workflowSkip:      () => ref.current.task && taskService.workflowSkip(ref.current.task.id),
    workflowRerun:     () => ref.current.task && taskService.workflowRerun(ref.current.task.id),
    gitPull:           () => gitOp('gitPull', 'Pull'),
    gitPush:           () => gitOp('gitPush', 'Push'),
    gitRebase:         () => gitOp('gitRebase', 'Rebase'),
    gitStash:          () => gitOp('gitStash', 'Stash'),
    saveMemory,
    archive,
    openFeedback:      () => ref.current.task && ref.current.modal.openFeedback(ref.current.task),
    openMemory:        () => ref.current.task && ref.current.modal.openMemory(ref.current.task),
    openCommit:        () => ref.current.task && ref.current.modal.openCommit(ref.current.task),
    openMerge:         () => ref.current.task && ref.current.modal.openMerge(ref.current.task),
    openMergeComplete: () => ref.current.task && ref.current.modal.openMergeComplete(ref.current.task),
  };
}
