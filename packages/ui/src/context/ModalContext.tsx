import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Task } from '@lacc/shared';

export type ModalType = 'new' | 'feedback' | 'memory' | 'commit' | 'merge' | 'mergeComplete' | 'gitInit';

interface ModalContextValue {
  modal: ModalType | null;
  modalTask: Task | null;
  openModal: (type: ModalType, task?: Task) => void;
  closeModal: () => void;
  openNew: () => void;
  openFeedback: (task: Task) => void;
  openMemory: (task: Task) => void;
  openCommit: (task: Task) => void;
  openMerge: (task: Task) => void;
  openMergeComplete: (task: Task) => void;
  openGitInit: (task: Task) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalType | null>(null);
  const [modalTask, setModalTask] = useState<Task | null>(null);

  const openModal = useCallback((type: ModalType, task?: Task) => {
    setModal(type);
    setModalTask(task ?? null);
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setModalTask(null);
  }, []);

  const openNew          = useCallback(() => openModal('new'), [openModal]);
  const openFeedback     = useCallback((task: Task) => openModal('feedback', task), [openModal]);
  const openMemory       = useCallback((task: Task) => openModal('memory', task), [openModal]);
  const openCommit       = useCallback((task: Task) => openModal('commit', task), [openModal]);
  const openMerge        = useCallback((task: Task) => openModal('merge', task), [openModal]);
  const openMergeComplete = useCallback((task: Task) => openModal('mergeComplete', task), [openModal]);
  const openGitInit      = useCallback((task: Task) => openModal('gitInit', task), [openModal]);

  return (
    <ModalContext.Provider value={{
      modal, modalTask, openModal, closeModal,
      openNew, openFeedback, openMemory, openCommit, openMerge, openMergeComplete, openGitInit,
    }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
