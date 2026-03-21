import { useState, useMemo } from 'react';
import type { Task, TaskStatus } from '@lacc/shared';
import { ChipButton } from './ui/ChipButton.js';
import { StatusIndicator, getStatusColor } from './ui/StatusIndicator.js';
import { elapsedStr } from '../utils.js';

type Filter = 'all' | 'active' | 'review' | 'done';

const ACTIVE_STATUSES: TaskStatus[] = ['SPAWNING', 'WORKING', 'SPINNING', 'RATE_LIMITED', 'PAUSED'];
const REVIEW_STATUSES: TaskStatus[] = ['READY'];
const DONE_STATUSES: TaskStatus[] = ['DONE', 'FAILED', 'KILLED', 'DISCARDED'];

interface Props {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeRepo: string | null;
}

export function TaskList({ tasks, selectedId, onSelect, activeRepo }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    let result = tasks;
    if (activeRepo) result = result.filter(t => t.repoPath === activeRepo);
    if (filter === 'active') result = result.filter(t => ACTIVE_STATUSES.includes(t.status));
    else if (filter === 'review') result = result.filter(t => REVIEW_STATUSES.includes(t.status));
    else if (filter === 'done') result = result.filter(t => DONE_STATUSES.includes(t.status));

    // Sort: active first, then by createdAt desc
    return [...result].sort((a, b) => {
      const aActive = ACTIVE_STATUSES.includes(a.status) ? 0 : 1;
      const bActive = ACTIVE_STATUSES.includes(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tasks, filter, activeRepo]);

  return (
    <div className="w-[280px] shrink-0 flex flex-col border-r border-border-default bg-surface-base">
      {/* Filter row */}
      <div className="flex shrink-0 px-3 py-2 border-b border-border-dim gap-1.5 items-center">
        {(['all', 'active', 'review', 'done'] as Filter[]).map(f => (
          <ChipButton
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </ChipButton>
        ))}
      </div>

      {/* Task rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            No tasks
          </div>
        )}
        {filtered.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            selected={task.id === selectedId}
            onClick={() => onSelect(task.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, selected, onClick }: { task: Task; selected: boolean; onClick: () => void }) {
  const statusColor = getStatusColor(task.status);
  const isDimmed = task.status === 'DONE' || task.status === 'KILLED' || task.status === 'DISCARDED';
  const isSpawning = task.status === 'SPAWNING';

  const contextRatio = task.contextTokensUsed != null ? task.contextTokensUsed / 200_000 : 0;
  const showContextBar = contextRatio > 0.7;

  const branchDisplay = (task.branchName ?? '').replace(/^lacc\//, '');

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left block cursor-pointer
        border-b border-border-subtle border-l-[3px]
        hover:bg-surface-active transition-colors
        ${selected ? 'bg-surface-overlay' : 'bg-transparent'}
        ${isSpawning ? 'animate-shimmer' : ''}
      `}
      style={{
        padding: '11px 14px',
        borderLeftColor: selected ? statusColor : 'transparent',
      }}
    >
      {/* Top line: status + elapsed */}
      <div className="flex items-center justify-between mb-1.5">
        <StatusIndicator status={task.status} />
        <span className="text-xs text-text-muted">
          {elapsedStr(task.startedAt)}
        </span>
      </div>

      {/* Prompt text — 2-line clamp */}
      <div
        className={`
          text-sm leading-snug mb-1.5
          line-clamp-2
          ${isDimmed ? 'text-text-disabled' : 'text-text-body'}
        `}
      >
        {task.status === 'SPAWNING' && task.planFirst
          ? 'Planning...'
          : task.prompt}
      </div>

      {/* Bottom row: branch + cost */}
      <div className="flex items-center justify-between">
        <span className="truncate max-w-[140px] text-xs font-mono text-text-muted">
          {branchDisplay}
        </span>
        {task.costUsd > 0 && (
          <span className={`text-xs ${task.costUsd > 4 ? 'text-status-spinning' : 'text-accent-subtle'}`}>
            ${task.costUsd.toFixed(2)}
          </span>
        )}
      </div>

      {/* Context progress bar — only shown at >70% */}
      {showContextBar && (
        <div className="mt-1 h-0.5 rounded overflow-hidden bg-surface-inset">
          <div
            className="h-full rounded"
            style={{
              width: `${Math.min(100, contextRatio * 100)}%`,
              background: contextRatio >= 0.85 ? 'var(--c-failed)' : '#f0c040',
            }}
          />
        </div>
      )}
    </button>
  );
}
