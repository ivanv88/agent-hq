import { useState } from 'react';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { FormTextarea } from '../components/ui/FormField.js';
import { ModalHeader, ModalFooter } from '../components/ui/Modal.js';
import type { Task } from '@lacc/shared';

interface Props {
  task: Task;
  onClose: () => void;
  onSubmit: (feedback: string) => Promise<void>;
}

export function FeedbackModal({ task, onClose, onSubmit }: Props) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(feedback);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <ModalHeader
          title="Feedback"
          subtitle={`Task: ${task.branchName} — Agent will resume with your instructions`}
        />

        <FormTextarea
          label="Instructions"
          className="min-h-[100px]"
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder="What should the agent do differently?"
          required
          autoFocus
        />

        <ModalFooter
          onCancel={onClose}
          primaryLabel="Send Feedback"
          loadingLabel="Sending..."
          primaryType="submit"
          primaryDisabled={!feedback.trim()}
          loading={submitting}
        />
      </form>
    </ModalOverlay>
  );
}
