import type { FeedTodo } from '@lacc/shared';

interface Props {
  todos: FeedTodo[];
}

const statusIcons: Record<FeedTodo['status'], string> = {
  completed: '✓',
  in_progress: '●',
  pending: '○',
};

export function TodoList({ todos }: Props) {
  // High priority first, then medium, then low
  const sorted = [...todos].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <div className="text-[12px]">
      <div className="text-text-muted font-semibold mb-1">Tasks</div>
      <div className="border-t border-border-dim pt-1.5 space-y-0.5">
        {sorted.map((todo) => (
          <div
            key={todo.id}
            className={`flex items-start gap-2 py-0.5 ${
              todo.status === 'completed' ? 'text-text-ghost' : 'text-text-body'
            }`}
          >
            <span
              className={`w-3 shrink-0 text-center ${
                todo.status === 'in_progress' ? 'animate-pulse-opacity' : ''
              }`}
              style={{
                color: todo.status === 'completed'
                  ? 'var(--color-feed-accent-green)'
                  : todo.status === 'in_progress'
                    ? 'var(--color-feed-accent-blue)'
                    : 'var(--color-text-ghost)',
              }}
            >
              {statusIcons[todo.status]}
            </span>
            <span>{todo.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
