import { useState } from 'react';

interface Props {
  content: string;
  defaultCollapsed?: boolean;
}

export function ThinkingBlock({ content, defaultCollapsed = true }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      className="text-[12px] cursor-pointer select-none"
      style={{ color: 'var(--color-feed-accent-purple)' }}
      onClick={() => setCollapsed(c => !c)}
    >
      <span className="opacity-60">
        {collapsed ? '▸' : '▾'} Thinking
      </span>
      {!collapsed && (
        <div className="mt-1 border-t border-border-dim pt-2 text-text-muted whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
}
