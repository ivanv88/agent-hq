import { useState, useCallback } from 'react';
import type { Task } from '@lacc/shared';

type Modal = 'new' | 'feedback' | 'memory' | 'commit' | 'merge' | 'mergeComplete' | 'gitInit' | null;

interface ModalState {
  type: Modal;
  task: Task | null;
}

export function useModalState() {
  const [state, setState] = useState<ModalState>({ type: null, task: null });

  const open = useCallback((type: Modal, task: Task | null = null) => {
    setState({ type, task });
  }, []);

  const close = useCallback(() => {
    setState({ type: null, task: null });
  }, []);

  const openNew      = useCallback(() => open('new'), [open]);
  const openFeedback = useCallback((task: Task) => open('feedback', task), [open]);
  const openMemory   = useCallback((task: Task) => open('memory', task), [open]);
  const openCommit        = useCallback((task: Task) => open('commit', task), [open]);
  const openMerge         = useCallback((task: Task) => open('merge', task), [open]);
  const openMergeComplete = useCallback((task: Task) => open('mergeComplete', task), [open]);
  const openGitInit       = useCallback((task: Task) => open('gitInit', task), [open]);

  return {
    modal: state.type,
    modalTask: state.task,
    openNew,
    openFeedback,
    openMemory,
    openCommit,
    openMerge,
    openMergeComplete,
    openGitInit,
    close,
  };
}
