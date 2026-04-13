import { useState, useEffect, useCallback } from 'react';
import type { Task } from '@lacc/shared';
import { Button } from './ui/Button.js';
import { ArchiveModal } from '../modals/ArchiveModal.js';
import { useModal } from '../context/ModalContext.js';
import { useNotify } from '../context/NotificationContext.js';

interface Props {
  task: Task;
}

export function ActionBar({ task }: Props) {
  const [showArchive, setShowArchive] = useState(false);
  const { openFeedback, openMemory, openCommit, openMerge, openMergeComplete, openGitInit } = useModal();
  const notify = useNotify();

  const restart = useCallback(async () => {
    const res = await fetch(`/tasks/${task.id}/restart`, { method: 'POST' });
    if (!res.ok) {
      const data = (await res.json()) as { code?: string };
      if (data.code === 'NOT_A_GIT_REPO') openGitInit(task);
    }
  }, [task, openGitInit]);

  const gitAction = useCallback(async (action: 'pull' | 'push' | 'rebase' | 'stash') => {
    const res = await fetch(`/api/tasks/${task.id}/git/${action}`, { method: 'POST' });
    const data = await res.json();
    if (!data.ok) notify(data.message ?? `${action} failed`, true);
    else notify(`${action.charAt(0).toUpperCase() + action.slice(1)}ed successfully`);
  }, [task.id, notify]);

  const saveMemory = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}/memory-snapshot`, { method: 'POST' });
    if (!res.ok) { notify((await res.json()).error ?? 'Snapshot failed', true); return; }
    notify('Memory snapshot saved');
  }, [task.id, notify]);

  const archive = useCallback(async (level: 'archived' | 'summary' | 'deleted') => {
    const res = await fetch(`/api/tasks/${task.id}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    });
    if (!res.ok) notify((await res.json()).error ?? 'Archive failed', true);
    setShowArchive(false);
  }, [task.id, notify]);

  const gitButtons = task.worktreePath ? (
    <>
      <span style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 4px' }} />
      <Button variant="ghost" size="sm" onClick={() => gitAction('rebase')}>Rebase</Button>
      <Button variant="ghost" size="sm" onClick={() => gitAction('pull')}>Pull</Button>
      <Button variant="ghost" size="sm" onClick={() => gitAction('push')}>Push</Button>
      <Button variant="ghost" size="sm" onClick={() => gitAction('stash')}>Stash</Button>
    </>
  ) : null;

  const archiveModal = showArchive ? (
    <ArchiveModal
      task={task}
      onConfirm={archive}
      onClose={() => setShowArchive(false)}
    />
  ) : null;

  if (task.status === 'READY') {
    if (task.workflowName && task.workflowStatus === 'waiting_gate') {
      return (
        <div style={{ padding: '10px 20px', borderTop: '1px solid #2a1a08', background: '#0a0804',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ color: '#4a3020', fontSize: 13 }}>
            Stage complete · manual gate
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => fetch(`/tasks/${task.id}/stage/rerun`, { method: 'POST' })}>Re-run Stage</Button>
            <Button variant="ghost" size="sm" onClick={() => fetch(`/tasks/${task.id}/stage/skip`, { method: 'POST' })}>Skip</Button>
            <Button variant="success" size="sm" onClick={() => fetch(`/tasks/${task.id}/stage/continue`, { method: 'POST' })}>Continue →</Button>
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
        <Button variant="success" onClick={() => openMergeComplete(task)} title="Merge & Complete (A)" kbd="A">
          Merge & Complete
        </Button>
        <Button variant="warning" onClick={() => openFeedback(task)} title="Feedback (F)" kbd="F">
          Feedback
        </Button>
        <Button variant="danger" onClick={() => fetch(`/tasks/${task.id}/discard`, { method: 'POST' })} title="Discard (X)" kbd="X">
          Discard
        </Button>
        <Button variant="ghost" onClick={() => openMemory(task)}>
          Memory
        </Button>
        {task.worktreePath && (
          <Button variant="ghost" onClick={() => openCommit(task)}>Commit</Button>
        )}
        {task.worktreePath && (
          <Button variant="ghost" onClick={() => fetch(`/tasks/${task.id}/open-editor`, { method: 'POST' })}
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
          <Button variant="ghost" size="sm" onClick={() => fetch(`/tasks/${task.id}/open-editor`, { method: 'POST' })} title="Open editor (O)">
            Editor
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => fetch(`/tasks/${task.id}/pause`, { method: 'POST' })} title="Pause (P)">
          Pause
        </Button>
        <Button variant="ghost" size="sm" onClick={restart} title="Restart (R)">
          Restart
        </Button>
        <Button variant="danger" size="sm" onClick={() => fetch(`/tasks/${task.id}`, { method: 'DELETE' })} title="Kill (K)">
          Kill
        </Button>
        {task.devServerUrl && (
          <Button variant="ghost" size="sm" onClick={() => window.open(task.devServerUrl!, '_blank')} title="Open browser (B)">
            Browser
          </Button>
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
        <Button variant="success" size="sm" onClick={() => fetch(`/tasks/${task.id}/resume`, { method: 'POST' })} title="Resume (R)">
          Resume
        </Button>
        <Button variant="danger" size="sm" onClick={() => fetch(`/tasks/${task.id}`, { method: 'DELETE' })} title="Kill (K)">
          Kill
        </Button>
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
          <Button variant="ghost" size="sm" onClick={() => fetch(`/tasks/${task.id}/open-editor`, { method: 'POST' })} title="Open editor (O)">
            Editor
          </Button>
        )}
        <Button variant="danger" size="sm" onClick={() => fetch(`/tasks/${task.id}`, { method: 'DELETE' })} style={{ marginLeft: 'auto' }}>
          Discard
        </Button>
        {gitButtons}
        {archiveModal}
      </div>
    );
  }

  // DONE / KILLED / FAILED
  return (
    <div style={{ padding: '10px 20px', borderTop: '1px solid #13131f', background: '#060610',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
      <Button variant="ghost" size="sm" onClick={restart} title="Restart (R)" kbd="R">
        Restart
      </Button>
      {task.worktreePath && (
        <Button variant="ghost" size="sm" onClick={() => fetch(`/tasks/${task.id}/open-editor`, { method: 'POST' })} title="Open editor (O)" kbd="O">
          Editor
        </Button>
      )}
      {task.worktreePath && (
        <>
          <Button variant="success" size="sm" onClick={() => openCommit(task)}>Commit</Button>
          <Button variant="ghost" size="sm" onClick={() => openMerge(task)}>Merge</Button>
        </>
      )}
      <span style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 4px' }} />
      <Button variant="ghost" size="sm" onClick={saveMemory}>Save memory</Button>
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
