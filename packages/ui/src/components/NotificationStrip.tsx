import { useEffect, useState } from 'react';
import type { Notification } from '@lacc/shared';

interface NotifEntry {
  id: number;
  notification: Notification;
  at: number;
}

let _id = 0;

interface Props {
  newNotification: Notification | null;
  onSelectTask: (taskId: string) => void;
}

export function NotificationStrip({ newNotification, onSelectTask }: Props) {
  const [entries, setEntries] = useState<NotifEntry[]>([]);

  useEffect(() => {
    if (!newNotification) return;

    const entry: NotifEntry = { id: _id++, notification: newNotification, at: Date.now() };
    setEntries(prev => [entry, ...prev].slice(0, 20));

    // Auto-fade after 60s
    const timeout = setTimeout(() => {
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    }, 60_000);

    return () => clearTimeout(timeout);
  }, [newNotification]);

  if (entries.length === 0) return null;

  const dotColor = (level: Notification['level']) =>
    level === 'error' ? '#f87171' :
    level === 'warning' ? '#fb923c' :
    '#4ade80';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{ background: '#05050e', borderTop: '1px solid #13131f', minHeight: 32 }}
    >
      <div className="flex items-stretch overflow-x-auto" style={{ height: '100%' }}>
        {entries.map((e, index) => (
          <div
            key={e.id}
            className="animate-fade-up"
            onClick={() => {
              if (e.notification.taskId) onSelectTask(e.notification.taskId);
              setEntries(prev => prev.filter(en => en.id !== e.id));
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRight: '1px solid #1e1e30',
              cursor: 'pointer',
              flex: 1,
              minWidth: 0,
              animationDelay: `${index * 0.06}s`,
            }}
            onMouseEnter={el => (el.currentTarget.style.background = '#1e1e30')}
            onMouseLeave={el => (el.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: dotColor(e.notification.level),
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: '#606080',
                fontSize: 12,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {e.notification.message}
            </span>
            <button
              onClick={ev => {
                ev.stopPropagation();
                setEntries(prev => prev.filter(en => en.id !== e.id));
              }}
              style={{
                color: '#2a2a40',
                background: 'transparent',
                border: 'none',
                fontSize: 13,
                cursor: 'pointer',
                lineHeight: 1,
                flexShrink: 0,
                padding: '0 2px',
              }}
              onMouseEnter={ev => (ev.currentTarget.style.color = '#888')}
              onMouseLeave={ev => (ev.currentTarget.style.color = '#2a2a40')}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
