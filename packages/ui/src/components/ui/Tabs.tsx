import { useState } from 'react';

export interface Tab {
  id: string;
  label: string;
  badge?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  /** 'underline' for DetailPanel style, 'pill' for SettingsModal style */
  variant?: 'underline' | 'pill';
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, variant = 'underline', className }: TabsProps) {
  if (variant === 'pill') {
    return (
      <div className={`flex gap-1 ${className ?? ''}`}>
        {tabs.map(tab => (
          <PillTab
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            onClick={() => !tab.disabled && onChange(tab.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-0 ${className ?? ''}`}>
      {tabs.map(tab => (
        <UnderlineTab
          key={tab.id}
          tab={tab}
          active={activeTab === tab.id}
          onClick={() => !tab.disabled && onChange(tab.id)}
        />
      ))}
    </div>
  );
}

function UnderlineTab({
  tab,
  active,
  onClick,
}: {
  tab: Tab;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={tab.disabled}
      style={{
        background: hovered ? 'var(--color-surface-hover)' : 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--color-accent-primary-bright)' : '2px solid transparent',
        color: active || hovered ? 'var(--color-text-bright)' : 'var(--color-text-muted)',
        padding: '8px 14px',
        cursor: tab.disabled ? 'not-allowed' : 'pointer',
        fontSize: 14,
        textTransform: 'capitalize',
        letterSpacing: '0.04em',
        marginBottom: -1,
        display: 'flex',
        alignItems: 'center',
        transition: 'background 0.1s, color 0.1s',
        opacity: tab.disabled ? 0.5 : 1,
      }}
    >
      {tab.label}
      {tab.badge}
    </button>
  );
}

function PillTab({
  tab,
  active,
  onClick,
}: {
  tab: Tab;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={tab.disabled}
      className="capitalize"
      style={{
        background: active ? 'var(--color-surface-overlay)' : hovered ? 'var(--color-surface-active)' : 'transparent',
        border: 'none',
        borderRadius: 4,
        color: active || hovered ? 'var(--color-text-bright)' : 'var(--color-text-muted)',
        padding: '4px 12px',
        cursor: tab.disabled ? 'not-allowed' : 'pointer',
        fontSize: 14,
        transition: 'background 0.1s, color 0.1s',
        opacity: tab.disabled ? 0.5 : 1,
      }}
    >
      {tab.label}
      {tab.badge}
    </button>
  );
}

// Helper for creating tab badge (e.g., "review" badge in DetailPanel)
export function TabBadge({
  children,
  variant = 'warning',
}: {
  children: React.ReactNode;
  variant?: 'warning' | 'info' | 'success' | 'danger';
}) {
  const colors = {
    warning: { bg: 'var(--color-status-review-bg)', color: 'var(--color-status-review)' },
    info: { bg: 'var(--color-status-done-bg)', color: 'var(--color-status-done)' },
    success: { bg: 'var(--color-status-working-bg)', color: 'var(--color-status-working)' },
    danger: { bg: 'var(--color-status-failed-bg)', color: 'var(--color-status-failed)' },
  };
  const c = colors[variant];

  return (
    <span
      style={{
        marginLeft: 6,
        background: c.bg,
        color: c.color,
        borderRadius: 2,
        padding: '0 4px',
        fontSize: 12,
      }}
    >
      {children}
    </span>
  );
}
