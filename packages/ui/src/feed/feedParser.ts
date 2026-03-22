import type { FeedMessage, FeedTodo } from '@lacc/shared';

let counter = 0;
function nextId(): string {
  return `feed-${Date.now()}-${counter++}`;
}

/**
 * Parse a single stream-json line into one or more FeedMessages.
 * Returns an array because an assistant message can contain multiple content blocks.
 */
export function parseFeedLine(line: string): FeedMessage[] {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line);
  } catch {
    return [];
  }

  // System init — show model + session id as a subtle header
  if (event.type === 'system' && event.subtype === 'init') {
    return [{
      id: nextId(),
      type: 'system_info',
      text: `${event.model as string}  ·  session ${(event.session_id as string).slice(0, 8)}`,
    }];
  }

  // Assistant message — may contain multiple content blocks
  if (event.type === 'assistant' && event.message) {
    const msg = event.message as Record<string, unknown>;
    const content = msg.content as Array<Record<string, unknown>>;
    if (!Array.isArray(content)) return [];

    const messages: FeedMessage[] = [];
    for (const block of content) {
      if (block.type === 'thinking' && (block.thinking as string)?.trim()) {
        messages.push({
          id: nextId(),
          type: 'thinking',
          content: block.thinking as string,
          collapsed: true,
        });
      } else if (block.type === 'text' && (block.text as string)?.trim()) {
        messages.push({
          id: nextId(),
          type: 'text',
          content: block.text as string,
          streaming: false,
        });
      } else if (block.type === 'tool_use') {
        messages.push(parseToolUse(block));
      }
    }
    return messages;
  }

  // Top-level tool_use (sub-agent events)
  if (event.type === 'tool_use' && event.name) {
    return [parseToolUse(event)];
  }

  // Tool result
  if (event.type === 'tool_result') {
    const output = extractToolResultText(event.content);
    return [{
      id: nextId(),
      type: 'tool_result',
      toolName: '',
      output,
      isError: event.is_error === true,
      collapsed: true,
    }];
  }

  // Result — final summary
  if (event.type === 'result') {
    return [{
      id: nextId(),
      type: 'result',
      cost: (event.total_cost_usd as number) ?? 0,
      durationMs: (event.duration_ms as number) ?? 0,
      status: event.is_error ? 'error' : 'success',
    }];
  }

  // User message (persisted by feedback endpoint)
  if (event.type === 'user_message') {
    return [{
      id: nextId(),
      type: 'user_message',
      content: (event.content as string) ?? '',
      timestamp: new Date((event.timestamp as string) ?? Date.now()),
    }];
  }

  // Error
  if (event.type === 'error') {
    return [{
      id: nextId(),
      type: 'error',
      message: (event.message ?? event.error ?? 'Unknown error') as string,
    }];
  }

  // System events (non-init)
  if (event.type === 'system') {
    const msg = event.message ?? event.subtype;
    if (msg) {
      return [{
        id: nextId(),
        type: 'system_info',
        text: msg as string,
      }];
    }
  }

  return [];
}

function parseToolUse(block: Record<string, unknown>): FeedMessage {
  const id = nextId();
  const name = block.name as string;
  const input = (block.input ?? {}) as Record<string, unknown>;

  // File operations → file_change cards
  if (name === 'Write' || name === 'Edit') {
    return {
      id,
      type: 'file_change',
      action: name as 'Write' | 'Edit',
      path: (input.file_path ?? input.path ?? '') as string,
    };
  }
  if (name === 'Read') {
    return {
      id,
      type: 'file_change',
      action: 'Read',
      path: (input.file_path ?? input.path ?? '') as string,
    };
  }

  // Todo updates
  if (name === 'TodoWrite') {
    return {
      id,
      type: 'todo_list',
      todos: (input.todos as FeedTodo[]) ?? [],
    };
  }

  // Everything else — generic tool card
  return {
    id,
    type: 'tool_use',
    name,
    input,
    collapsed: true,
  };
}

function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text!)
      .join('\n');
  }
  return '';
}

/**
 * Get a concise summary string for a tool_use card's collapsed state.
 */
export function getToolSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash':
    case 'mcp__bash__bash':
      return input.command
        ? String(input.command).split('\n')[0].slice(0, 80)
        : '';
    case 'Grep':
      return input.pattern ? `"${input.pattern}"` : '';
    case 'Glob':
      return input.pattern ? String(input.pattern) : '';
    case 'Agent':
    case 'Task':
      return input.prompt
        ? String(input.prompt).slice(0, 60)
        : '';
    default:
      return '';
  }
}
