import { useState, useEffect } from 'react';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { FormTextarea } from '../components/ui/FormField.js';
import { RadioGroup } from '../components/ui/RadioGroup.js';
import { ModalHeader, ModalFooter } from '../components/ui/Modal.js';
import type { Task } from '@lacc/shared';

interface Props {
  task: Task;
  onClose: () => void;
}

export function MemoryModal({ task, onClose }: Props) {
  const [content, setContent] = useState('');
  const [target, setTarget] = useState<'auto' | 'project'>('auto');

  // Pre-fill from last decoded agent output
  useEffect(() => {
    fetch(`/tasks/${task.id}/logs`)
      .then(r => r.text())
      .then(text => {
        // Parse SSE lines: "data: {json}"
        const lines = text.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6));
        let lastAssistant = '';
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            if (parsed.type === 'assistant') {
              const msgContent = (parsed.message as Record<string, unknown>)?.content;
              if (Array.isArray(msgContent)) {
                for (const block of msgContent as Array<Record<string, unknown>>) {
                  if (block.type === 'text' && typeof block.text === 'string') {
                    lastAssistant = block.text;
                  }
                }
              }
            }
          } catch { /* skip */ }
        }
        if (lastAssistant) setContent(lastAssistant.slice(0, 2000));
      })
      .catch(console.error);
  }, [task.id]);
  const [result, setResult] = useState<{ path: string; lineCount?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/tasks/${task.id}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, target }),
      });
      const data = await res.json() as { path: string; lineCount?: number };
      setResult(data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <ModalHeader title="Save Memory" />

        <RadioGroup
          options={[
            { value: 'auto', label: 'Agent memory (~/.claude/...)' },
            { value: 'project', label: 'Project CLAUDE.md' },
          ]}
          value={target}
          onChange={v => setTarget(v as 'auto' | 'project')}
          variant="inline"
        />

        <FormTextarea
          label="Content"
          className="min-h-[120px]"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Note to save..."
          required
          autoFocus
        />

        {result && (
          <div className="text-[14px] text-[#4ade80]">
            Saved to {result.path}
            {result.lineCount && result.lineCount > 150 && (
              <span className="ml-2 text-[#f0c040]">⚠ CLAUDE.md is large ({result.lineCount} lines)</span>
            )}
          </div>
        )}

        <ModalFooter
          cancelLabel="Close"
          onCancel={onClose}
          primaryLabel={result ? undefined : 'Save'}
          loadingLabel="Saving..."
          primaryType="submit"
          primaryDisabled={!content.trim()}
          loading={submitting}
          primaryVariant="primary"
        />
      </form>
    </ModalOverlay>
  );
}
