import { useState } from 'react';

interface Props {
  message: string;
  output?: string;
}

export function ErrorMessage({ message, output }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded text-[12px]"
      style={{
        background: 'var(--color-status-failed-bg)',
        border: '1px solid color-mix(in srgb, var(--color-feed-accent-red) 30%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span style={{ color: 'var(--color-feed-accent-red)' }}>✗</span>
        <span className="text-text-body flex-1">{message}</span>
        {output && (
          <button
            className="text-text-ghost hover:text-text-default text-[11px] transition-colors duration-100"
            onClick={() => setExpanded(e => !e)}
          >
            [{expanded ? 'Hide' : 'View'} output]
          </button>
        )}
      </div>
      {expanded && output && (
        <pre className="px-3.5 pb-2.5 border-t border-border-dim pt-2 text-text-muted whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
          {output}
        </pre>
      )}
    </div>
  );
}
