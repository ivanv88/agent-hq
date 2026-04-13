import { useState, useEffect } from 'react';
import type { Task } from '@lacc/shared';
import { Button } from './ui/Button.js';
import { ArchiveModal } from '../modals/ArchiveModal.js';
import { useTaskActions } from '../hooks/useTaskActions.js';

interface Props {
  task: Task;
}

export function ActionBar({ task }: Props) {
  const [showArchive, setShowArchive] = useState(false);
  const actions = useTaskActions(task);

  const gitButtons = task.worktreePath ? (
    <>
      <span style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 4px' }} />
      <Button variant="ghost" size="sm" onClick={actions.gitRebase}>Rebase</Button>
      <Button variant="ghost" size="sm" onClick={actions.gitPull}>Pull</Button>
      <Button variant="ghost" size="sm" onClick={actions.gitPush}>Push</Button>
      <Button variant="ghost" size="sm" onClick={actions.gitStash}>Stash</Button>
    </>
  ) : null;

  const archiveModal = showArchive ? (
    <ArchiveModal
      task={task}
      onConfirm={(level) => actions.archive(level)}
      onClose={() => setShowArchive(false)}
    />
  ) : null;

  if (task.status === 'READY') {
    if (task.workflowName && task.workflowStatus === 'waiting_gate') {
      return (
        <div style={{ padding: '10px 20px', borderTop: '1px solid #2a1a08', background: '#0a0804',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ color: '#4a3020', fontSize: 13 }}>Stage complete · manual gate</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={actions.workflowRerun}>Re-run Stage</Button>
            <Button variant="ghost" size="sm" onClick={actions.workflowSkip}>Skip</Button>
            <Button variant="success" size="sm" onClick={() => actions.workflowContinue()}>Continue →</Button>
          </div>
          {gitButtons}
          {archiveModal}
        </div>
      );
    }
    return (
      <div style={{ padding: '10px 20px', borderTop: '1px solid #1e1a08', background: '#0c0a04',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ color: '#4a4020', fontSize: 14, marginRight: 4 }}>Review actions:</span>
        <Button variant="success" onClick={actions.openMergeComplete} title="Merge & Complete (A)" kbd="A">
          Merge & Complete
        </Button>
        <Button variant="warning" onClick={actions.openFeedback} title="Feedback (F)" kbd="F">
          Feedback
        </Button>
        <Button variant="danger" onClick={actions.discard} title="Discard (X)" kbd="X">
          Discard
        </Button>
        <Button variant="ghost" onClick={actions.openMemory}>Memory</Button>
        {task.worktreePath && (
          <Button variant="ghost" onClick={actions.openCommit}>Commit</Button>
        )}
        {task.worktreePath && (
          <Button variant="ghost" onClick={actions.openEditor}
            title="Open editor (O)" kbd="O"
            style={{ background: 'transparent', marginLeft: 'auto' }}>
            Open in Editor
          </Button>
        )}
        {gitButtons}
        {archiveModal}
      </div>
    );
  }

  if (['WORKING', 'SPINNING', 'SPAWNING'].includes(task.status)) {
    return (
      <div style={{ padding: '10px 20px', borderTop: '1px solid #13131f', background: '#060610',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        {task.worktreePath && (
          <Button variant="ghost" size="sm" onClick={actions.openEditor} title="Open editor (O)">Editor</Button>
        )}
        <Button variant="ghost" size="sm" onClick={actions.pause} title="Pause (P)">Pause</Button>
        <Button variant="ghost" size="sm" onClick={actions.restart} title="Restart (R)">Restart</Button>
        <Button variant="danger" size="sm" onClick={actions.kill} title="Kill (K)">Kill</Button>
        {task.devServerUrl && (
          <Button variant="ghost" size="sm" onClick={actions.openBrowser} title="Open browser (B)">Browser</Button>
        )}
        {gitButtons}
        {archiveModal}
      </div>
    );
  }

  if (task.status === 'PAUSED') {
    return (
      <div style={{ padding: '10px 20px', borderTop: '1px solid #13131f', background: '#060610',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Button variant="success" size="sm" onClick={actions.resume} title="Resume (R)">Resume</Button>
        <Button variant="danger" size="sm" onClick={actions.kill} title="Kill (K)">Kill</Button>
        {gitButtons}
        {archiveModal}
      </div>
    );
  }

  if (task.status === 'RATE_LIMITED') {
    return (
      <div style={{ padding: '10px 20px', borderTop: '1px solid #13131f', background: '#060610',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>autoresume</span>
        <RateLimitCountdown retryAfter={task.rateLimitRetryAfter} />
        {task.worktreePath && (
          <Button variant="ghost" size="sm" onClick={actions.openEditor} title="Open editor (O)">Editor</Button>
        )}
        <Button variant="danger" size="sm" onClick={actions.kill} style={{ marginLeft: 'auto' }}>Discard</Button>
        {gitButtons}
        {archiveModal}
      </div>
    );
  }

  // DONE / KILLED / FAILED
  return (
    <div style={{ padding: '10px 20px', borderTop: '1px solid #13131f', background: '#060610',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
      <Button variant="ghost" size="sm" onClick={actions.restart} title="Restart (R)" kbd="R">Restart</Button>
      {task.worktreePath && (
        <Button variant="ghost" size="sm" onClick={actions.openEditor} title="Open editor (O)" kbd="O">Editor</Button>
      )}
      {task.worktreePath && (
        <>
          <Button variant="success" size="sm" onClick={actions.openCommit}>Commit</Button>
          <Button variant="ghost" size="sm" onClick={actions.openMerge}>Merge</Button>
        </>
      )}
      <span style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 4px' }} />
      <Button variant="ghost" size="sm" onClick={actions.saveMemory}>Save memory</Button>
      <Button variant="ghost" size="sm" onClick={() => setShowArchive(true)}>Archive ▾</Button>
      {gitButtons}
      {archiveModal}
    </div>
  );
}

function RateLimitCountdown({ retryAfter }: { retryAfter: number | null }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!retryAfter) return;
    const update = () => {
      const ms = retryAfter - Date.now();
      if (ms <= 0) { setRemaining('ready'); return; }
      const s = Math.ceil(ms / 1000);
      const m = Math.floor(s / 60);
      setRemaining(m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [retryAfter]);

  return (
    <span style={{ color: '#fb923c', fontSize: 14, fontFamily: 'monospace' }}>
      {remaining || 'waiting...'}
    </span>
  );
}
