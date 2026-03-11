import { useState, useEffect, useCallback } from 'react';
import type { Task, WsEvent } from '@lacc/shared';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/tasks')
      .then(r => r.json())
      .then((data: Task[]) => {
        setTasks(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  // Called directly by App for every WS event — bypasses the lastEvent
  // single-value indirection so back-to-back events (e.g. TASK_UPDATED then
  // NOTIFICATION) are never dropped by React 18 automatic batching.
  const handleWsEvent = useCallback((wsEvent: WsEvent) => {
    if (wsEvent.type === 'TASK_CREATED') {
      setTasks(prev => prev.some(t => t.id === wsEvent.task.id) ? prev : [wsEvent.task, ...prev]);
    } else if (wsEvent.type === 'TASK_UPDATED') {
      setTasks(prev =>
        prev.map(t => t.id === wsEvent.task.id ? wsEvent.task : t)
      );
    } else if (wsEvent.type === 'TASKS_CLEARED') {
      setTasks(prev => prev.filter(t => !['DONE', 'FAILED', 'KILLED', 'DISCARDED'].includes(t.status)));
    } else if ((wsEvent as { type: string }).type === 'RECONNECTED') {
      fetch('/tasks')
        .then(r => r.json())
        .then((data: Task[]) => setTasks(data))
        .catch(console.error);
    }
  }, []);

  const refresh = useCallback(() => {
    fetch('/tasks')
      .then(r => r.json())
      .then((data: Task[]) => setTasks(data))
      .catch(console.error);
  }, []);

  return { tasks, loading, refresh, handleWsEvent };
}
