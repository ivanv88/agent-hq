import { useState, useRef, useCallback, useEffect } from 'react';
import type { Task, TaskStatus } from '@lacc/shared';

export type ParsedInput =
  | { kind: 'feedback'; text: string }
  | { kind: 'command'; command: string; args: string }
  | { kind: 'continue'; context?: string };

interface Props {
  task: Task;
  onSubmit: (input: ParsedInput) => void;
  /** Called when user types "/" — parent can show command palette */
  onSlashChange?: (prefix: string | null) => void;
}

function getPlaceholder(status: TaskStatus, workflowStatus: string | null): string {
  if (workflowStatus === 'waiting_gate') return 'Continue to next stage, or add context first...';
  switch (status) {
    case 'WORKING':
    case 'SPINNING':
      return 'Give feedback or /command...';
    case 'READY':
      return 'Feedback before approval, or /approve...';
    case 'RATE_LIMITED':
      return 'Task rate limited · /resume when ready';
    case 'DONE':
    case 'FAILED':
    case 'KILLED':
    case 'DISCARDED':
      return 'Restart with new context, or /command...';
    default:
      return 'Type a message...';
  }
}

function getSubmitLabel(status: TaskStatus, workflowStatus: string | null): string {
  if (workflowStatus === 'waiting_gate') return 'Continue →';
  switch (status) {
    case 'WORKING':
    case 'SPINNING':
    case 'READY':
      return 'Send ↑';
    case 'DONE':
    case 'FAILED':
    case 'KILLED':
      return 'Restart ↑';
    default:
      return 'Send ↑';
  }
}

export function CommandBox({ task, onSubmit, onSlashChange }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const placeholder = getPlaceholder(task.status, task.workflowStatus);
  const submitLabel = getSubmitLabel(task.status, task.workflowStatus);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  // Notify parent about slash prefix
  useEffect(() => {
    if (text.startsWith('/')) {
      onSlashChange?.(text);
    } else {
      onSlashChange?.(null);
    }
  }, [text, onSlashChange]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    let input: ParsedInput;

    if (trimmed.startsWith('/')) {
      const spaceIdx = trimmed.indexOf(' ');
      const command = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
      const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
      input = { kind: 'command', command, args };
    } else if (task.workflowStatus === 'waiting_gate') {
      input = { kind: 'continue', context: trimmed || undefined };
    } else {
      input = { kind: 'feedback', text: trimmed };
    }

    onSubmit(input);
    setText('');
    onSlashChange?.(null);
  }, [text, task.workflowStatus, onSubmit, onSlashChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const canSubmit = text.trim().length > 0;

  return (
    <div
      className="shrink-0"
      style={{
        borderTop: '1px solid var(--color-border-default)',
        background: 'var(--color-surface-raised)',
      }}
    >
      <div
        className="flex items-end gap-2 px-4 py-2"
        style={{
          border: focused ? '1px solid color-mix(in srgb, var(--color-feed-accent-blue) 50%, transparent)' : '1px solid transparent',
          borderRadius: 4,
          margin: 4,
          background: 'var(--color-surface-overlay)',
          transition: 'border-color 0.1s',
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent text-text-body text-[13px] resize-none outline-none placeholder:text-text-ghost leading-relaxed"
          style={{ minHeight: 28, maxHeight: 120 }}
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="text-[12px] shrink-0 px-3 py-1 rounded transition-colors duration-100 cursor-pointer disabled:cursor-default"
          style={{
            background: canSubmit ? 'var(--color-surface-active)' : 'transparent',
            color: canSubmit ? 'var(--color-text-body)' : 'var(--color-text-ghost)',
            border: canSubmit ? '1px solid var(--color-border-emphasis)' : '1px solid transparent',
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
