interface Props {
  content: string;
  streaming: boolean;
}

export function TextMessage({ content, streaming }: Props) {
  return (
    <div className="max-w-[640px] text-text-body leading-relaxed text-[13px] whitespace-pre-wrap break-words">
      {content}
      {streaming && (
        <span className="inline-block w-[6px] h-[14px] bg-text-muted ml-0.5 animate-pulse-opacity align-text-bottom" />
      )}
    </div>
  );
}
