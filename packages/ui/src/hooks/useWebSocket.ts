import { useEffect, useRef, useCallback } from 'react';
import type { WsEvent } from '@lacc/shared';

type Dispatcher = (event: WsEvent) => void;

export function useWebSocket(onEvent: Dispatcher) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/events`);
    wsRef.current = ws;

    ws.onopen = () => {
      const wasRetrying = retryRef.current > 0;
      retryRef.current = 0;
      // Re-sync state after reconnect — we may have missed events while disconnected
      if (wasRetrying) {
        onEventRef.current({ type: 'RECONNECTED' } as unknown as WsEvent);
      }
    };

    ws.onmessage = (evt) => {
      try {
        const event: WsEvent = JSON.parse(evt.data as string);
        onEventRef.current(event);
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
      retryRef.current++;
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);
}
