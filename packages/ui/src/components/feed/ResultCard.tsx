interface Props {
  cost: number;
  durationMs: number;
  status: 'success' | 'error';
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

export function ResultCard({ cost, durationMs, status }: Props) {
  const isError = status === 'error';

  return (
    <div className="border-t border-border-dim pt-2 text-[12px] text-text-muted flex items-center gap-2">
      <span style={{ color: isError ? 'var(--color-feed-accent-red)' : 'var(--color-feed-accent-green)' }}>
        {isError ? '✗' : '✓'}
      </span>
      <span className="text-text-default font-semibold">
        {isError ? 'Failed' : 'Done'}
      </span>
      <span>·</span>
      <span>${cost.toFixed(2)}</span>
      <span>·</span>
      <span>{formatDuration(durationMs)}</span>
    </div>
  );
}
