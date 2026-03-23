import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import type { FeedMessage } from '@lacc/shared';
import { TextMessage } from './TextMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolUseCard } from './ToolUseCard';
import { FileChangeCard } from './FileChangeCard';
import { TodoList } from './TodoList';
import { ResultCard } from './ResultCard';
import { UserMessage } from './UserMessage';
import { SystemInfo } from './SystemInfo';
import { ErrorMessage } from './ErrorMessage';
import { StageComplete } from './StageComplete';

interface Props {
  messages: FeedMessage[];
  taskId: string;
}

export function MessageFeed({ messages, taskId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  // True only when new messages arrived while user was scrolled up
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const initialLoadRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const prevMessageCountRef = useRef(0);

  // On task switch: reset state and jump to bottom on next render
  useEffect(() => {
    initialLoadRef.current = true;
    setUserScrolledUp(false);
    setHasUnseenMessages(false);
  }, [taskId]);

  // After render: handle scroll position
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (initialLoadRef.current && messages.length > 0) {
      // First meaningful render — jump to bottom instantly, no animation
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
      initialLoadRef.current = false;
      prevMessageCountRef.current = messages.length;
      // Reset the flag after the scroll event fires
      requestAnimationFrame(() => { programmaticScrollRef.current = false; });
      return;
    }

    // New messages arrived
    if (messages.length > prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      if (!userScrolledUp) {
        // User is at bottom — pin to bottom instantly
        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
        requestAnimationFrame(() => { programmaticScrollRef.current = false; });
      }
      if (userScrolledUp) {
        setHasUnseenMessages(true);
      }
    }
  }, [messages.length, userScrolledUp]);

  const handleScroll = useCallback(() => {
    // Ignore scroll events caused by our own programmatic scrolls
    if (programmaticScrollRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setUserScrolledUp(!atBottom);
    if (atBottom) setHasUnseenMessages(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setUserScrolledUp(false);
    setHasUnseenMessages(false);
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative"
      style={{ padding: '16px 20px' }}
      onScroll={handleScroll}
    >
      <div className="flex flex-col gap-4">
        {messages.map((msg) => (
          <FeedItem key={msg.id} message={msg} taskId={taskId} />
        ))}
      </div>

      {/* Resume auto-scroll button */}
      {hasUnseenMessages && (
        <button
          className="sticky bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-text-muted bg-surface-overlay border border-border-emphasis rounded-full px-3 py-1 hover:text-text-default hover:bg-surface-hover transition-colors duration-100 cursor-pointer"
          onClick={scrollToBottom}
        >
          ↓ New messages
        </button>
      )}
    </div>
  );
}

function FeedItem({ message, taskId }: { message: FeedMessage; taskId: string }) {
  const m = message as FeedMessage & { _result?: string; _isError?: boolean };

  switch (m.type) {
    case 'text':
      return <TextMessage content={m.content} streaming={m.streaming} />;
    case 'thinking':
      return <ThinkingBlock content={m.content} defaultCollapsed={m.collapsed} />;
    case 'tool_use':
      return (
        <ToolUseCard
          name={m.name}
          input={m.input}
          result={m._result}
          isError={m._isError}
        />
      );
    case 'tool_result':
      return (
        <div className="text-[12px] text-text-ghost whitespace-pre-wrap max-h-[200px] overflow-y-auto">
          {m.output.slice(0, 500)}{m.output.length > 500 ? '…' : ''}
        </div>
      );
    case 'file_change':
      return (
        <FileChangeCard
          action={m.action}
          path={m.path}
          insertions={m.insertions}
          deletions={m.deletions}
          onOpenFile={() => fetch(`/api/tasks/${taskId}/open-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: m.path }),
          })}
        />
      );
    case 'todo_list':
      return <TodoList todos={m.todos} />;
    case 'result':
      return <ResultCard cost={m.cost} durationMs={m.durationMs} status={m.status} />;
    case 'user_message':
      return <UserMessage content={m.content} timestamp={m.timestamp} />;
    case 'stage_complete':
      return (
        <StageComplete
          stageName={m.stageName}
          nextStageName={m.nextStageName}
          checkpointCreated={m.checkpointCreated}
        />
      );
    case 'error':
      return <ErrorMessage message={m.message} output={m.output} />;
    case 'system_info':
      return <SystemInfo text={m.text} />;
    default:
      return null;
  }
}
