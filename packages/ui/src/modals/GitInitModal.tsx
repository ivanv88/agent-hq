import { useState } from 'react';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { ModalHeader, ModalFooter } from '../components/ui/Modal.js';
import type { Task } from '@lacc/shared';

interface Props {
  task: Task;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function GitInitModal({ task, onConfirm, onClose }: Props) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex flex-col gap-4">
        <ModalHeader
          title="Not a Git Repository"
          subtitle={`Initialize git in: ${task.repoPath}`}
        />

        <p className="text-sm text-text-muted">
          The selected path is not a git repository. Would you like to initialize git there?
          This will run <code className="text-text-base bg-surface-raised px-1 rounded">git init</code> and create an initial commit.
        </p>

        <ModalFooter
          onCancel={onClose}
          primaryLabel="Initialize Git"
          loadingLabel="Initializing..."
          loading={loading}
          onPrimary={handleConfirm}
        />
      </div>
    </ModalOverlay>
  );
}
