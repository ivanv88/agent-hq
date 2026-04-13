import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Notification } from '@lacc/shared';

interface NotificationContextValue {
  lastNotification: Notification | null;
  notify: (message: string, isError?: boolean) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [lastNotification, setLastNotification] = useState<Notification | null>(null);

  const notify = useCallback((message: string, isError = false) => {
    setLastNotification({ message, level: isError ? 'error' : 'info' });
  }, []);

  return (
    <NotificationContext.Provider value={{ lastNotification, notify }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotify must be used within NotificationProvider');
  return ctx.notify;
}

export function useLastNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useLastNotification must be used within NotificationProvider');
  return ctx.lastNotification;
}
