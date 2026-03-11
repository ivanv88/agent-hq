import { useState } from 'react';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { FormTextarea } from '../components/ui/FormField.js';
import { ModalHeader, ModalFooter } from '../components/ui/Modal.js';
import type { Task } from '@lacc/shared';

interface Props {
  task: Task;
  onClose: () => void;
}

function defaultMessage(task: Task): string {
  const first = task.prompt.split('\n')[0].slice(0, 72);
  return first;
}

export function CommitModal({ task, onClose }: Props) {
  const [message, setMessage] = useState(defaultMessage(task));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/tasks/${task.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Commit failed');
      }
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <ModalHeader
          title="Commit Changes"
          subtitle={`Branch: ${task.branchName}`}
        />

        <FormTextarea
          label="Commit message"
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="min-h-[80px]"
          required
          autoFocus
        />

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <ModalFooter
          onCancel={onClose}
          primaryLabel="Commit"
          loadingLabel="Committing..."
          successLabel="Committed!"
          primaryType="submit"
          primaryDisabled={!message.trim()}
          loading={loading}
          success={done}
        />
      </form>
    </ModalOverlay>
  );
}
