import type { TaskStatus } from '@lacc/shared';

const STATUS_COLORS: Record<TaskStatus, string> = {
  WORKING:      'var(--c-working)',
  SPINNING:     'var(--c-spinning)',
  READY:        'var(--c-ready)',
  DONE:         'var(--c-done)',
  FAILED:       'var(--c-failed)',
  SPAWNING:     'var(--c-spawning)',
  KILLED:       'var(--c-killed)',
  DISCARDED:    'var(--c-killed)',
  PAUSED:       'var(--c-paused)',
  RATE_LIMITED: 'var(--c-limited)',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  SPAWNING:     'Spawning',
  WORKING:      'Working',
  SPINNING:     'Spinning',
  RATE_LIMITED: 'Rate Limited',
  PAUSED:       'Paused',
  READY:        'Ready',
  DONE:         'Done',
  FAILED:       'Failed',
  KILLED:       'Killed',
  DISCARDED:    'Discarded',
};

const PULSE_STATUSES = new Set<TaskStatus>(['WORKING', 'SPINNING', 'SPAWNING']);

interface StatusIndicatorProps {
  status: TaskStatus;
  /** Show label next to dot */
  showLabel?: boolean;
  /** Custom label override */
  label?: string;
  className?: string;
}

export function StatusIndicator({ status, showLabel = true, label, className }: StatusIndicatorProps) {
  const color = STATUS_COLORS[status] ?? 'var(--color-text-default)';
  const shouldPulse = PULSE_STATUSES.has(status);
  const displayLabel = label ?? STATUS_LABELS[status];

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <div
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${shouldPulse ? 'animate-pulse-opacity' : ''}`}
        style={{ background: color }}
      />
      {showLabel && (
        <span
          className="text-xs font-semibold tracking-wide"
          style={{ color }}
        >
          {displayLabel}
        </span>
      )}
    </div>
  );
}

/** Get the color for a given status */
export function getStatusColor(status: TaskStatus): string {
  return STATUS_COLORS[status] ?? 'var(--color-text-default)';
}

/** Get the label for a given status */
export function getStatusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status];
}

/** Check if status should show pulse animation */
export function isActiveStatus(status: TaskStatus): boolean {
  return PULSE_STATUSES.has(status);
}

// Export for backward compatibility
export { STATUS_COLORS, STATUS_LABELS, PULSE_STATUSES };
