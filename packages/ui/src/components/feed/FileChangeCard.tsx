interface Props {
  action: 'Read' | 'Write' | 'Edit';
  path: string;
  insertions?: number;
  deletions?: number;
}

const icons: Record<string, string> = {
  Read: '◎',
  Write: '⊕',
  Edit: '✎',
};

export function FileChangeCard({ action, path, insertions, deletions }: Props) {
  const isRead = action === 'Read';

  return (
    <div
      className={`flex items-center gap-2 text-[12px] py-0.5 px-1 rounded hover:bg-surface-hover transition-colors duration-100 cursor-default ${
        isRead ? 'text-text-ghost' : 'text-text-default'
      }`}
    >
      <span className="w-4 text-center shrink-0">{icons[action]}</span>
      <span className="font-mono truncate flex-1">{path}</span>
      <span className="flex gap-2 shrink-0 text-[11px]">
        {insertions != null && insertions > 0 && (
          <span style={{ color: 'var(--color-feed-accent-green)' }}>+{insertions}</span>
        )}
        {deletions != null && deletions > 0 && (
          <span style={{ color: 'var(--color-feed-accent-red)' }}>-{deletions}</span>
        )}
        {isRead && <span className="text-text-ghost">(read)</span>}
        {action === 'Write' && insertions == null && (
          <span className="text-text-muted">new file</span>
        )}
      </span>
    </div>
  );
}
