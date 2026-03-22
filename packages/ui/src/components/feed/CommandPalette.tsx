import { useState, useEffect, useCallback } from 'react';
import type { TaskStatus } from '@lacc/shared';

interface Command {
  name: string;
  description: string;
  availableWhen: TaskStatus[] | 'always';
  args?: string;
}

const COMMANDS: Command[] = [
  // Workflow
  { name: 'continue',   description: 'Advance past workflow gate',       availableWhen: ['READY'], args: '[context]' },
  { name: 'skip',       description: 'Skip current stage',               availableWhen: ['READY'] },
  { name: 'rerun',      description: 'Re-run current stage',             availableWhen: ['READY'] },
  { name: 'restore',    description: 'Restore to checkpoint',            availableWhen: 'always', args: '[stage]' },

  // Agent control
  { name: 'approve',    description: 'Approve and generate PR draft',    availableWhen: ['READY'] },
  { name: 'reject',     description: 'Reject changes',                   availableWhen: ['READY'] },
  { name: 'pause',      description: 'Pause the agent',                  availableWhen: ['WORKING', 'SPINNING'] },
  { name: 'resume',     description: 'Resume paused or rate-limited',    availableWhen: ['PAUSED', 'RATE_LIMITED'] },
  { name: 'restart',    description: 'Restart with same prompt',         availableWhen: 'always' },
  { name: 'kill',       description: 'Kill the task',                    availableWhen: 'always' },

  // Info
  { name: 'cost',       description: 'Show cost breakdown',              availableWhen: 'always' },
  { name: 'diff',       description: 'Show current diff summary',        availableWhen: 'always' },
  { name: 'checkpoint', description: 'Create a checkpoint now',          availableWhen: ['WORKING'] },
  { name: 'compact',    description: 'Ask agent to compact context',     availableWhen: ['WORKING'] },
];

interface Props {
  filter: string;
  taskStatus: TaskStatus;
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function CommandPalette({ filter, taskStatus, onSelect, onClose }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Filter commands by name
  const searchTerm = filter.startsWith('/') ? filter.slice(1).toLowerCase() : '';
  const matched = COMMANDS.filter(c => c.name.startsWith(searchTerm));

  // Split into available and unavailable
  const available = matched.filter(c =>
    c.availableWhen === 'always' || c.availableWhen.includes(taskStatus),
  );
  const unavailable = matched.filter(c =>
    c.availableWhen !== 'always' && !c.availableWhen.includes(taskStatus),
  );

  // Clamp selection
  useEffect(() => {
    setSelectedIdx(0);
  }, [filter]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, available.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (available[selectedIdx]) {
        onSelect(available[selectedIdx].name);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [available, selectedIdx, onSelect, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (matched.length === 0) return null;

  const maxVisible = 6;
  const visibleAvailable = available.slice(0, maxVisible);
  const remainingSlots = maxVisible - visibleAvailable.length;
  const visibleUnavailable = remainingSlots > 0 ? unavailable.slice(0, remainingSlots) : [];

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 rounded text-[12px] overflow-hidden z-10 animate-fade-up"
      style={{
        background: 'var(--color-surface-overlay)',
        border: '1px solid var(--color-border-emphasis)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {visibleAvailable.map((cmd, idx) => (
        <div
          key={cmd.name}
          className="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors duration-100"
          style={{
            background: idx === selectedIdx ? 'var(--color-surface-hover)' : 'transparent',
          }}
          onClick={() => onSelect(cmd.name)}
          onMouseEnter={() => setSelectedIdx(idx)}
        >
          <span className="text-text-default font-mono">/{cmd.name}</span>
          {cmd.args && <span className="text-text-ghost">{cmd.args}</span>}
          <span className="ml-auto text-text-muted">{cmd.description}</span>
        </div>
      ))}

      {visibleUnavailable.length > 0 && (
        <>
          {visibleAvailable.length > 0 && (
            <div className="border-t border-border-dim" />
          )}
          {visibleUnavailable.map((cmd) => (
            <div
              key={cmd.name}
              className="flex items-center gap-3 px-3 py-2 opacity-40 cursor-default"
            >
              <span className="text-text-ghost font-mono">/{cmd.name}</span>
              {cmd.args && <span className="text-text-ghost">{cmd.args}</span>}
              <span className="ml-auto text-text-ghost">{cmd.description}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
