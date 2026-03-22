interface Props {
  text: string;
}

export function SystemInfo({ text }: Props) {
  return (
    <div className="text-[11px] text-text-ghost font-mono">
      {text}
    </div>
  );
}
