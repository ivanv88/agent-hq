import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface Props {
  taskId: string;
  active: boolean;
  /** When true, the terminal is hidden via CSS but stays mounted so the SSE
   *  connection and xterm state are preserved across tab switches. */
  hidden?: boolean;
}

export function Terminal({ taskId, active, hidden }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#060610',
        foreground: '#d4d4e8',
        cursor: '#6060a0',
        cursorAccent: '#060610',
        selectionBackground: '#1e1e30',
        black: '#080810',
        brightBlack: '#2e2e44',
      },
      fontSize: 14,
      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
      convertEol: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    // Defer fit until after browser has painted and container has real dimensions
    requestAnimationFrame(() => fit.fit());

    fitRef.current = fit;

    // Connect to SSE log stream with automatic reconnection.
    // The server replays full log history on every connect, so we track how
    // many lines we've already written and skip them on reconnect — no clear,
    // no glitch, only new lines are appended.
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let linesWritten = 0;

    const connectSSE = (linesToSkip = 0) => {
      if (destroyed) return;
      let skipRemaining = linesToSkip;
      // Whether the server sent an explicit end event on this connection.
      // Only set to true when the stream finishes normally; an onerror without
      // this flag means the connection dropped mid-stream and should reconnect.
      let receivedEndEvent = false;

      const es = new EventSource(`/tasks/${taskId}/logs`);
      esRef.current = es;

      es.onmessage = (evt) => {
        const data = evt.data as string;

        // End event arrives as a raw object string, not a stream-json line
        if (data === '{"type":"end"}') {
          receivedEndEvent = true;
          es.close();
          return;
        }

        if (skipRemaining > 0) {
          skipRemaining--;
          // Always increment — must match server send count exactly for
          // reconnect skip logic to work correctly
          linesWritten++;
          return;
        }

        // Always increment — must match server send count exactly for
        // reconnect skip logic to work correctly
        linesWritten++;

        const decoded = decodeStreamJsonLine(data);
        if (decoded) {
          term.write(decoded + '\r\n');
        }
      };

      es.onerror = (e) => {
        console.log('TERMINAL ONERROR 1', e);
        es.close();
        // Reconnect unless the stream ended cleanly (server sent end event) or
        // the component was destroyed. This correctly handles transient network
        // drops even before the first log line arrives.
        if (!destroyed && !receivedEndEvent) {
          reconnectTimer = setTimeout(() => connectSSE(linesWritten), 2000);
        }
      };
    };

    connectSSE();

    let fitTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (fitTimer !== null) clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        fitTimer = null;
        if (containerRef.current && containerRef.current.clientWidth > 0) fit.fit();
      }, 16);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      destroyed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (fitTimer !== null) clearTimeout(fitTimer);
      esRef.current?.close();
      resizeObserver.disconnect();
      // Defer xterm teardown (WebGL context, scrollback GC, DOM detach) to
      // browser idle time so it does not block the post-navigation paint frame.
      // Safari fallback: requestIdleCallback is not available there.
      const dispose = () => term.dispose();
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(dispose);
      } else {
        setTimeout(dispose, 200);
      }
    };
  }, [taskId]);

  useEffect(() => {
    if (active && fitRef.current) {
      fitRef.current.fit();
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={hidden ? { visibility: 'hidden', position: 'absolute', width: 0, height: 0 } : undefined}
    />
  );
}

function decodeStreamJsonLine(line: string): string | null {
  try {
    const parsed = JSON.parse(line);

    if (parsed.type === 'assistant' && parsed.message?.content) {
      const texts: string[] = [];
      for (const block of parsed.message.content) {
        if (block.type === 'text') {
          texts.push(block.text as string);
        } else if (block.type === 'tool_use') {
          const input = (block.input ?? {}) as Record<string, unknown>;
          let detail = '';
          switch (block.name) {
            case 'Bash':
            case 'mcp__bash__bash':
              detail = input.command ? ` ${String(input.command).split('\n')[0].slice(0, 120)}` : '';
              break;
            case 'Read': detail = input.file_path ? ` ${input.file_path}` : ''; break;
            case 'Write': detail = input.file_path ? ` ${input.file_path}` : ''; break;
            case 'Edit': detail = input.file_path ? ` ${input.file_path}` : ''; break;
            case 'Glob': detail = input.pattern ? ` ${input.pattern}` : ''; break;
            case 'Grep': detail = input.pattern ? ` "${input.pattern}"` : ''; break;
            case 'Agent':
              detail = input.prompt ? `\r\n  \x1b[2m${String(input.prompt).slice(0, 200)}\x1b[0m` : '';
              break;
            default: break;
          }
          texts.push(`\x1b[36m[${block.name as string}${detail}]\x1b[0m`);
        }
      }
      return texts.join('');
    }

    if (parsed.type === 'result') {
      const cost = parsed.total_cost_usd ? ` ($${(parsed.total_cost_usd as number).toFixed(4)})` : '';
      return `\x1b[2m[done${cost}]\x1b[0m`;
    }

    if (parsed.type === 'text') return parsed.text as string;

    // Errors — show in red so they're visible
    if (parsed.type === 'error') {
      const msg = (parsed.message ?? parsed.error ?? JSON.stringify(parsed)) as string;
      return `\x1b[31m[error] ${msg}\x1b[0m`;
    }

    // System init is just tool metadata — skip. Other system events show dimmed.
    if (parsed.type === 'system') {
      if (parsed.subtype === 'init') return null;
      const msg = parsed.message ?? parsed.subtype ?? JSON.stringify(parsed);
      return `\x1b[2m[system] ${msg}\x1b[0m`;
    }

    // tool_result — show bash output, skip others (too noisy)
    if (parsed.type === 'tool_result') {
      const content = parsed.content;
      if (typeof content === 'string' && content.trim()) {
        return `\x1b[2m${content.slice(0, 500)}${content.length > 500 ? '…' : ''}\x1b[0m`;
      }
      if (Array.isArray(content)) {
        const text = (content as Array<{ type: string; text?: string }>)
          .filter(b => b.type === 'text' && b.text)
          .map(b => b.text!)
          .join('\n');
        if (text.trim()) return `\x1b[2m${text.slice(0, 500)}${text.length > 500 ? '…' : ''}\x1b[0m`;
      }
      return null;
    }

    // Top-level tool_use (sub-agent events come this way)
    if (parsed.type === 'tool_use') {
      const input = (parsed.input ?? {}) as Record<string, unknown>;
      let detail = '';
      switch (parsed.name as string) {
        case 'Bash':
        case 'mcp__bash__bash':
          detail = input.command ? ` ${String(input.command).split('\n')[0].slice(0, 120)}` : '';
          break;
        case 'Read': detail = input.file_path ? ` ${input.file_path}` : ''; break;
        case 'Write': detail = input.file_path ? ` ${input.file_path}` : ''; break;
        case 'Edit': detail = input.file_path ? ` ${input.file_path}` : ''; break;
        case 'Glob': detail = input.pattern ? ` ${input.pattern}` : ''; break;
        case 'Grep': detail = input.pattern ? ` "${input.pattern}"` : ''; break;
        default: break;
      }
      return `\x1b[36m[${parsed.name as string}${detail}]\x1b[0m`;
    }

    return null; // skip unknown event types
  } catch {
    return line; // raw text fallback
  }
}
