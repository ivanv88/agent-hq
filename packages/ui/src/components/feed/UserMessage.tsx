interface Props {
  content: string;
  timestamp: Date;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function UserMessage({ content, timestamp }: Props) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[480px] rounded px-3.5 py-2.5 text-[13px] leading-relaxed animate-slide-in"
        style={{
          background: 'var(--color-feed-user-bg)',
          border: '1px solid var(--color-feed-user-border)',
        }}
      >
        <div className="text-text-body whitespace-pre-wrap break-words">{content}</div>
        <div className="text-[11px] text-text-ghost text-right mt-1">
          you · {formatTime(timestamp)}
        </div>
      </div>
    </div>
  );
}
