import { useState } from 'react';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { FormTextarea } from '../components/ui/FormField.js';
import { ModalHeader, ModalFooter } from '../components/ui/Modal.js';
import type { Task } from '@lacc/shared';

type MergeStrategy = 'regular' | 'squash' | 'ffOnly';

interface Props {
  task: Task;
  onClose: () => void;
  /** When true, posts to /complete and kills container + worktree on success */
  completeOnMerge?: boolean;
}

export function MergeModal({ task, onClose, completeOnMerge = false }: Props) {
  const [strategy, setStrategy] = useState<MergeStrategy>('regular');
  const [message, setMessage] = useState(task.prompt.split('\n')[0].slice(0, 72));
  const [stageAll, setStageAll] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const endpoint = completeOnMerge ? `/tasks/${task.id}/complete` : `/tasks/${task.id}/merge`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squash: strategy === 'squash',
          ffOnly: strategy === 'ffOnly',
          message: strategy === 'squash' ? message : undefined,
          stageAll,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Merge failed');
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
          title={completeOnMerge ? 'Merge & Complete' : 'Merge Branch'}
          subtitle={`${task.branchName} → ${task.baseBranch}`}
        />

        {completeOnMerge && (
          <p className="text-sm text-text-muted">
            This will merge the branch into <span className="text-text-base font-mono">{task.baseBranch}</span>,
            then kill the container and remove the worktree. This cannot be undone.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-text-base">
            <input
              type="radio"
              name="strategy"
              checked={strategy === 'regular'}
              onChange={() => setStrategy('regular')}
            />
            Regular merge (--no-ff)
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-text-base">
            <input
              type="radio"
              name="strategy"
              checked={strategy === 'squash'}
              onChange={() => setStrategy('squash')}
            />
            Squash merge — combine all commits into one
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-text-base">
            <input
              type="radio"
              name="strategy"
              checked={strategy === 'ffOnly'}
              onChange={() => setStrategy('ffOnly')}
            />
            Fast-forward only (--ff-only)
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-text-base mt-1">
          <input
            type="checkbox"
            checked={stageAll}
            onChange={e => setStageAll(e.target.checked)}
          />
          Stage all uncommitted changes before merging
        </label>

        {strategy === 'squash' && (
          <FormTextarea
            label="Commit message"
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="min-h-[80px]"
            required
          />
        )}

        {error && (
          <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
        )}

        <ModalFooter
          onCancel={onClose}
          primaryLabel={completeOnMerge ? 'Merge & Complete' : 'Merge'}
          loadingLabel="Merging..."
          successLabel={completeOnMerge ? 'Done!' : 'Merged!'}
          primaryType="submit"
          primaryDisabled={strategy === 'squash' && !message.trim()}
          loading={loading}
          success={done}
        />
      </form>
    </ModalOverlay>
  );
}
