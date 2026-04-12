import { useState } from 'react';
import type { Task } from '@lacc/shared';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { ModalHeader, ModalFooter } from '../components/ui/Modal.js';

type ArchiveLevel = 'archived' | 'summary' | 'deleted';

interface Props {
  task: Task;
  onConfirm: (level: ArchiveLevel) => void;
  onClose: () => void;
}

const LEVELS: Array<{ value: ArchiveLevel; label: string; description: string }> = [
  { value: 'archived', label: 'Archive', description: 'Keep memory + all artifacts, remove worktree' },
  { value: 'summary', label: 'Summary only', description: 'Keep memory.md only, remove everything else' },
  { value: 'deleted', label: 'Delete all', description: 'Remove everything including memory' },
];

export function ArchiveModal({ task, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<ArchiveLevel>('archived');

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Archive task?" />

      <div className="px-4 py-3 space-y-3">
        <p className="text-text-secondary text-sm">
          Branch <span className="text-text-primary font-mono">{task.branchName}</span> will
          not be deleted — push first if needed.
        </p>

        <div className="space-y-2">
          {LEVELS.map(({ value, label, description }) => (
            <label
              key={value}
              className="flex items-start gap-3 p-3 rounded cursor-pointer bg-surface-raised hover:bg-surface-hover duration-100"
            >
              <input
                type="radio"
                name="archiveLevel"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
                className="mt-0.5"
              />
              <div>
                <div className="text-text-primary text-sm font-medium">{label}</div>
                <div className="text-text-secondary text-xs">{description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <ModalFooter
        onCancel={onClose}
        onPrimary={() => onConfirm(selected)}
        primaryLabel="Confirm"
        primaryVariant={selected === 'deleted' ? 'danger' : 'primary'}
      />
    </ModalOverlay>
  );
}
