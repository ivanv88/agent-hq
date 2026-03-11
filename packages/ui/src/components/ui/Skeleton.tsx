interface Props {
  className?: string;
}

export function Skeleton({ className = '' }: Props) {
  return (
    <div className={`animate-pulse rounded bg-surface-raised ${className}`} />
  );
}
