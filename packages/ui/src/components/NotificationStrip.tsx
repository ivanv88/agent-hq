import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/Button.js';
import { useLastNotification } from '../context/NotificationContext.js';

interface NotifEntry {
  id: number;
  notification: { message: string; level?: string };
}

let _id = 0;

export function NotificationStrip() {
  const [entries, setEntries] = useState<NotifEntry[]>([]);
  const newNotification = useLastNotification();

  useEffect(() => {
    if (!newNotification) return;

    const entry: NotifEntry = { id: _id++, notification: newNotification };
    setEntries(prev => [entry, ...prev].slice(0, 10));

    const timeout = setTimeout(() => {
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    }, 60_000);

    return () => clearTimeout(timeout);
  }, [newNotification]);

  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-4 z-50 flex flex-col gap-2 items-start" style={{ left: 56 }}>
      {[...entries].reverse().map((e, index) => (
        <NotifCard
          key={e.id}
          entry={e}
          index={index}
          onDismiss={() => setEntries(prev => prev.filter(en => en.id !== e.id))}
        />
      ))}
    </div>
  );
}

function dotColorClass(level: string | undefined) {
  if (level === 'error')   return 'bg-status-failed';
  if (level === 'warning') return 'bg-status-spinning';
  return 'bg-status-working';
}

function NotifCard({ entry, index, onDismiss }: {
  entry: NotifEntry;
  index: number;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="animate-slide-in w-80 px-3 py-2 rounded border border-border-default bg-surface-raised hover:bg-surface-overlay cursor-pointer transition-colors duration-100 group"
      style={{ animationDelay: `${index * 0.05}s` }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-2">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[3px] ${dotColorClass(entry.notification.level)}`} />
        <span className={`text-text-muted text-[11px] flex-1 ${expanded ? 'whitespace-normal break-words' : 'truncate'}`}>
          {entry.notification.message}
        </span>
        <Button
          variant="icon"
          onClick={ev => { ev.stopPropagation(); onDismiss(); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
          style={{ width: 20, height: 20, padding: 2 }}
        >
          <X size={12} />
        </Button>
      </div>
    </div>
  );
}
