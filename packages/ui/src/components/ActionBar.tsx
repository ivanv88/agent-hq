import { useState, useEffect } from 'react';
import type { Task } from '@lacc/shared';
import { Button } from './ui/Button.js';

interface Props {
  task: Task;
  onComplete: () => void;
  onDiscard: () => void;
  onFeedback: () => void;
  onOpenEditor: () => void;
  onOpenBrowser: () => void;
  onKill: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMemory: () => void;
  onCommit: () => void;
  onMerge: () => void;
  onWorkflowContinue?: () => void;
  onWorkflowSkip?: () => void;
  onWorkflowRerun?: () => void;
}

export function ActionBar({
  task, onComplete, onDiscard, onFeedback,
  onOpenEditor, onOpenBrowser, onKill, onPause, onResume, onRestart, onMemory, onCommit, onMerge,
  onWorkflowContinue, onWorkflowSkip, onWorkflowRerun
}: Props) {

  if (task.status === 'READY') {
    // Workflow gate — show stage controls instead of review actions
    if (task.workflowName && task.workflowStatus === 'waiting_gate') {
      return (
        <div style={{ padding: '10px 20px', borderTop: '1px solid #2a1a08', background: '#0a0804',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ color: '#4a3020', fontSize: 13 }}>
            Stage complete · manual gate
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={onWorkflowRerun}>Re-run Stage</Button>
            <Button variant="ghost" size="sm" onClick={onWorkflowSkip}>Skip</Button>
            <Button variant="success" size="sm" onClick={onWorkflowContinue}>Continue →</Button>
          </div>
        </div>
      );
    }
    return (
      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid #1e1a08',
          background: '#0c0a04',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#4a4020', fontSize: 14, marginRight: 4 }}>Review actions:</span>

        <Button variant="success" onClick={onComplete} title="Merge & Complete (A)" kbd="A">
          Merge & Complete
        </Button>

        <Button variant="warning" onClick={onFeedback} title="Feedback (F)" kbd="F">
          Feedback
        </Button>

        <Button variant="danger" onClick={onDiscard} title="Discard (X)" kbd="X">
          Discard
        </Button>

        <Button variant="ghost" onClick={onMemory}>
          Memory
        </Button>

        {task.worktreePath && (
          <Button variant="ghost" onClick={onCommit}>Commit</Button>
        )}

        {task.worktreePath && (
          <Button
            variant="ghost"
            onClick={onOpenEditor}
            title="Open editor (O)"
            kbd="O"
            style={{ background: 'transparent', marginLeft: 'auto' }}
          >
            Open in Editor
          </Button>
        )}
      </div>
    );
  }

  if (['WORKING', 'SPINNING', 'SPAWNING'].includes(task.status)) {
    return (
      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid #13131f',
          background: '#060610',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {task.worktreePath && (
          <Button variant="ghost" size="sm" onClick={onOpenEditor} title="Open editor (O)">
            Editor
          </Button>
        )}

        <Button variant="ghost" size="sm" onClick={onPause} title="Pause (P)">
          Pause
        </Button>

        <Button variant="ghost" size="sm" onClick={onRestart} title="Restart (R)">
          Restart
        </Button>

        <Button variant="danger" size="sm" onClick={onKill} title="Kill (K)">
          Kill
        </Button>

        {task.devServerUrl && (
          <Button variant="ghost" size="sm" onClick={onOpenBrowser} title="Open browser (B)">
            Browser
          </Button>
        )}
      </div>
    );
  }

  if (task.status === 'PAUSED') {
    return (
      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid #13131f',
          background: '#060610',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <Button variant="success" size="sm" onClick={onResume} title="Resume (R)">
          Resume
        </Button>

        <Button variant="danger" size="sm" onClick={onKill} title="Kill (K)">
          Kill
        </Button>
      </div>
    );
  }

  if (task.status === 'RATE_LIMITED') {
    return (
      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid #13131f',
          background: '#060610',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>autoresume</span>
        <RateLimitCountdown retryAfter={task.rateLimitRetryAfter} />

        {task.worktreePath && (
          <Button variant="ghost" size="sm" onClick={onOpenEditor} title="Open editor (O)">
            Editor
          </Button>
        )}

        <Button variant="danger" size="sm" onClick={onKill} style={{ marginLeft: 'auto' }}>
          Discard
        </Button>
      </div>
    );
  }

  // DONE / KILLED / FAILED
  return (
    <div
      style={{
        padding: '10px 20px',
        borderTop: '1px solid #13131f',
        background: '#060610',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <Button variant="ghost" size="sm" onClick={onRestart} title="Restart (R)" kbd="R">
        Restart
      </Button>

      {task.worktreePath && (
        <Button variant="ghost" size="sm" onClick={onOpenEditor} title="Open editor (O)" kbd="O">
          Editor
        </Button>
      )}

      {task.worktreePath && (
        <>
          <Button variant="success" size="sm" onClick={onCommit}>Commit</Button>
          <Button variant="ghost" size="sm" onClick={onMerge}>Merge</Button>
        </>
      )}

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

