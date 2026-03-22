interface Props {
  stageName: string;
  nextStageName?: string;
  checkpointCreated: boolean;
}

export function StageComplete({ stageName, nextStageName, checkpointCreated }: Props) {
  return (
    <div className="border-t border-border-dim pt-2 text-[12px] text-text-muted flex items-center gap-2">
      <span style={{ color: 'var(--color-feed-accent-green)' }}>✓</span>
      <span className="text-text-default font-semibold">{stageName} complete</span>
      {checkpointCreated && (
        <>
          <span>·</span>
          <span>checkpoint saved</span>
        </>
      )}
      {nextStageName && (
        <>
          <span>·</span>
          <span className="text-text-body">next: {nextStageName}</span>
        </>
      )}
    </div>
  );
}
