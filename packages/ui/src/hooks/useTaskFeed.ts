import { useEffect, useRef, useState, useCallback } from 'react';
import type { FeedMessage } from '@lacc/shared';
import { parseFeedLine } from '../feed/feedParser';

/**
 * Hook that connects to the SSE log stream for a task and maintains
 * a parsed FeedMessage array. Replaces the Terminal's SSE logic.
 *
 * On reconnect, replays from server and skips already-parsed lines
 * (same stateful replay as Terminal.tsx).
 */
export function useTaskFeed(taskId: string | null, retryCount = 0) {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const linesWrittenRef = useRef(0);
  const prevTaskIdRef = useRef<string | null>(null);

  // Append a user message to the feed (for CommandBox submissions)
  const appendUserMessage = useCallback((content: string) => {
    const msg: FeedMessage = {
      id: `user-${Date.now()}`,
      type: 'user_message',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  useEffect(() => {
    if (!taskId) {
      setMessages([]);
      return;
    }

    const taskChanged = taskId !== prevTaskIdRef.current;
    prevTaskIdRef.current = taskId;

    if (taskChanged) {
      // Different task selected — start fresh
      setMessages([]);
      linesWrittenRef.current = 0;
    }
    // On retry (same task, retryCount changed): keep existing messages and
    // line counter. SSE reconnects and replays — old lines get skipped via
    // linesWrittenRef, new lines (user_message + restarted agent output)
    // append in order.
    setConnected(false);

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let es: EventSource | null = null;

    const connectSSE = (linesToSkip = 0) => {
      if (destroyed) return;
      let skipRemaining = linesToSkip;
      let receivedEndEvent = false;

      es = new EventSource(`/tasks/${taskId}/logs`);
      setConnected(true);

      es.onmessage = (evt) => {
        const data = evt.data as string;

        if (data === '{"type":"end"}') {
          receivedEndEvent = true;
          es?.close();
          return;
        }

        if (skipRemaining > 0) {
          skipRemaining--;
          linesWrittenRef.current++;
          return;
        }

        linesWrittenRef.current++;

        const parsed = parseFeedLine(data);
        if (parsed.length === 0) return;

        setMessages(prev => {
          const next = [...prev];
          for (const msg of parsed) {
            if (msg.type === 'tool_result') {
              // Try to merge into last tool_use
              let merged = false;
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].type === 'tool_use') {
                  next[i] = {
                    ...next[i],
                    _result: (msg as FeedMessage & { type: 'tool_result' }).output,
                    _isError: (msg as FeedMessage & { type: 'tool_result' }).isError,
                  } as FeedMessage & { type: 'tool_use' } & { _result: string; _isError: boolean };
                  merged = true;
                  break;
                }
              }
              if (!merged) next.push(msg);
            } else {
              next.push(msg);
            }
          }
          return next;
        });
      };

      es.onerror = () => {
        es?.close();
        setConnected(false);
        if (!destroyed && !receivedEndEvent) {
          reconnectTimer = setTimeout(
            () => connectSSE(linesWrittenRef.current),
            2000,
          );
        }
      };
    };

    connectSSE();

    return () => {
      destroyed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      es?.close();
      setConnected(false);
    };
  }, [taskId, retryCount]);

  return { messages, connected, appendUserMessage };
}
