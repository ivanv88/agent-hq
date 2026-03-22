import { useState } from 'react';
import { getToolSummary } from '../../feed/feedParser';

interface Props {
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  defaultCollapsed?: boolean;
}

const borderColors: Record<string, string> = {
  Bash: 'var(--color-feed-accent-blue)',
  mcp__bash__bash: 'var(--color-feed-accent-blue)',
  Read: 'var(--color-text-muted)',
  Write: 'var(--color-feed-accent-green)',
  Edit: 'var(--color-feed-accent-orange)',
  Grep: 'var(--color-feed-accent-blue)',
  Glob: 'var(--color-feed-accent-blue)',
  Agent: 'var(--color-feed-accent-purple)',
  Task: 'var(--color-feed-accent-purple)',
};

function getToolDisplayName(name: string): string {
  if (name === 'mcp__bash__bash') return 'Bash';
  return name;
}

export function ToolUseCard({ name, input, result, isError, defaultCollapsed = true }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const summary = getToolSummary(name, input);
  const borderColor = borderColors[name] ?? 'var(--color-border-emphasis)';
  const displayName = getToolDisplayName(name);

  return (
    <div
      className="rounded text-[12px] cursor-pointer select-none"
      style={{
        background: 'var(--color-feed-tool-bg)',
        border: '1px solid var(--color-feed-tool-border)',
        borderLeftWidth: 2,
        borderLeftColor: borderColor,
      }}
      onClick={() => setCollapsed(c => !c)}
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span className="text-[11px]">⚡</span>
        <span className="font-semibold" style={{ color: borderColor }}>
          {displayName}
        </span>
        {collapsed && summary && (
          <span className="text-text-muted truncate flex-1 ml-1">{summary}</span>
        )}
        <span className="ml-auto text-text-ghost text-[11px]">
          {collapsed ? '[+]' : '[−]'}
        </span>
      </div>

      {!collapsed && (
        <div className="px-3.5 pb-2.5 border-t border-border-dim">
          {summary && (
            <pre className="mt-2 text-text-body whitespace-pre-wrap break-all leading-relaxed">
              {name === 'Bash' || name === 'mcp__bash__bash'
                ? String(input.command ?? '')
                : summary}
            </pre>
          )}
          {result && (
            <details className="mt-2">
              <summary className="text-text-muted cursor-pointer hover:text-text-default">
                ▸ Output
              </summary>
              <pre
                className="mt-1 whitespace-pre-wrap break-all leading-relaxed max-h-[300px] overflow-y-auto"
                style={{ color: isError ? 'var(--color-feed-accent-red)' : 'var(--color-text-muted)' }}
              >
                {result}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
