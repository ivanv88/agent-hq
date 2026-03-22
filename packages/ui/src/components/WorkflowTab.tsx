import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Task, WorkflowDefinition, CheckpointInfo } from '@lacc/shared';
import { Button } from './ui/Button.js';

interface Props {
  task: Task;
  onContinue: (taskId: string) => void;
  onSkipStage: (taskId: string) => void;
  onRerunStage: (taskId: string) => void;
}

export function WorkflowTab({ task, onContinue, onSkipStage, onRerunStage }: Props) {
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [gatePreview, setGatePreview] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!task.workflowName) return;
    fetch(`/workflows/${encodeURIComponent(task.workflowName)}`)
      .then(r => r.ok ? r.json() : null)
      .then((wf: WorkflowDefinition | null) => setWorkflow(wf))
      .catch(() => {});
  }, [task.workflowName]);

  // Fetch checkpoints
  useEffect(() => {
    if (!task.workflowName) return;
    fetch(`/tasks/${task.id}/checkpoints`)
      .then(r => r.ok ? r.json() : [])
      .then((cps: CheckpointInfo[]) => setCheckpoints(cps))
      .catch(() => {});
  }, [task.id, task.workflowName, task.workflowStage, task.workflowStatus]);

  // Load the gate output doc for preview when waiting
  useEffect(() => {
    if (task.workflowStatus !== 'waiting_gate' || !task.workflowStage || !task.worktreePath || !workflow) {
      setGatePreview(null);
      return;
    }
    // Output doc preview is deferred to post-v1 (needs a /tasks/:id/file endpoint).
    setGatePreview(null);
  }, [task.workflowStatus, task.workflowStage, workflow]);

  const handleRestore = useCallback(async (stageId: string) => {
    setRestoring(true);
    try {
      const res = await fetch(`/tasks/${task.id}/checkpoints/${encodeURIComponent(stageId)}/restore`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('Restore failed:', body);
      }
    } catch (err) {
      console.error('Restore error:', err);
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
    }
  }, [task.id]);

  if (!task.workflowName) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-ghost text-[13px]">
        No workflow attached to this task.
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-ghost text-[13px]">
        Loading workflow...
      </div>
    );
  }

  const skipped = task.workflowSkippedStages ?? [];
  const activeStages = workflow.stages.filter(s => !skipped.includes(s.id));
  const currentIdx = activeStages.findIndex(s => s.id === task.workflowStage);
  const checkpointStageIds = new Set(checkpoints.map(cp => cp.stageId));

  // Find stages that would be undone when restoring to a given checkpoint
  function getUndoneStages(stageId: string): string[] {
    const cpIdx = activeStages.findIndex(s => s.id === stageId);
    if (cpIdx < 0) return [];
    return activeStages.slice(cpIdx).filter((s, i) => {
      const absIdx = cpIdx + i;
      return absIdx <= currentIdx && s.id !== stageId;
    }).map(s => s.name);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Stage progress list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
        <div className="text-text-ghost text-[11px] uppercase tracking-widest mb-3">
          Workflow: {workflow.name}
        </div>

        {/* Initial checkpoint row */}
        {checkpointStageIds.has('initial') && (
          <StageRow
            stageId="initial"
            stageName="Initial state"
            statusIcon="↺"
            statusColor="var(--text-ghost)"
            nameColor="var(--text-ghost)"
            gateLabel=""
            isHighlighted={false}
            hasCheckpoint={true}
            isRunning={task.workflowStatus === 'running'}
            confirmRestore={confirmRestore}
            restoring={restoring}
            undoneStages={getUndoneStages('initial')}
            onRestoreClick={() => setConfirmRestore('initial')}
            onRestoreCancel={() => setConfirmRestore(null)}
            onRestoreConfirm={() => handleRestore('initial')}
          />
        )}

        {activeStages.map((stage, idx) => {
          const isComplete = idx < currentIdx || task.workflowStatus === 'complete';
          const isActive = stage.id === task.workflowStage && task.workflowStatus === 'running';
          const isWaiting = stage.id === task.workflowStage && task.workflowStatus === 'waiting_gate';
          const wasRestored = stage.id === task.workflowStage && isWaiting && checkpointStageIds.has(stage.id);

          const statusIcon = wasRestored && !isActive ? '⟳' : isComplete ? '✓' : isActive ? '●' : isWaiting ? '⏸' : '○';
          const statusColor = isComplete
            ? 'var(--text-accent)'
            : isActive
            ? '#4ade80'
            : isWaiting
            ? '#fb923c'
            : 'var(--text-ghost)';

          const nameColor = isComplete
            ? 'var(--text-body)'
            : (isActive || isWaiting)
            ? 'var(--text-bright)'
            : 'var(--text-ghost)';

          // Show restore for completed stages that have a checkpoint
          const canRestore = isComplete && checkpointStageIds.has(stage.id);

          return (
            <StageRow
              key={stage.id}
              stageId={stage.id}
              stageName={stage.name}
              statusIcon={statusIcon}
              statusColor={statusColor}
              nameColor={nameColor}
              gateLabel={stage.gate === 'manual' ? 'manual' : 'auto'}
              isHighlighted={isActive || isWaiting}
              hasCheckpoint={canRestore}
              isRunning={task.workflowStatus === 'running'}
              confirmRestore={confirmRestore}
              restoring={restoring}
              undoneStages={getUndoneStages(stage.id)}
              onRestoreClick={() => setConfirmRestore(stage.id)}
              onRestoreCancel={() => setConfirmRestore(null)}
              onRestoreConfirm={() => handleRestore(stage.id)}
            />
          );
        })}
      </div>

      {/* Gate decision panel */}
      {task.workflowStatus === 'waiting_gate' && (
        <div
          className="border-t border-border-default flex-shrink-0"
          style={{ borderTopColor: '#2a1f08', background: '#0a0804' }}
        >
          {gatePreview && (
            <div
              className="p-4 max-h-48 overflow-y-auto text-[13px]"
              style={{ color: 'var(--text-body)', borderBottom: '1px solid #2a2a3e' }}
            >
              <ReactMarkdown>{gatePreview}</ReactMarkdown>
            </div>
          )}
          {checkpointStageIds.has(task.workflowStage ?? '') && (
            <div className="px-3 pt-2 text-[11px]" style={{ color: 'var(--text-ghost)' }}>
              Checkpoint created — restore available if next stage goes wrong
            </div>
          )}
          <div className="flex items-center gap-2 p-3">
            <span style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
              Stage complete — gate open
            </span>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={() => onRerunStage(task.id)}>
                Re-run
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onSkipStage(task.id)}>
                Skip
              </Button>
              <Button variant="success" size="sm" onClick={() => onContinue(task.id)}>
                Continue →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────

interface StageRowProps {
  stageId: string;
  stageName: string;
  statusIcon: string;
  statusColor: string;
  nameColor: string;
  gateLabel: string;
  isHighlighted: boolean;
  hasCheckpoint: boolean;
  isRunning: boolean;
  confirmRestore: string | null;
  restoring: boolean;
  undoneStages: string[];
  onRestoreClick: () => void;
  onRestoreCancel: () => void;
  onRestoreConfirm: () => void;
}

function StageRow({
  stageId,
  stageName,
  statusIcon,
  statusColor,
  nameColor,
  gateLabel,
  isHighlighted,
  hasCheckpoint,
  isRunning,
  confirmRestore,
  restoring,
  undoneStages,
  onRestoreClick,
  onRestoreCancel,
  onRestoreConfirm,
}: StageRowProps) {
  const isConfirming = confirmRestore === stageId;

  return (
    <div>
      <div
        className="group flex items-center gap-3 py-1.5 px-2 rounded"
        style={{ background: isHighlighted ? 'rgba(255,255,255,0.03)' : 'transparent' }}
      >
        <span style={{ color: statusColor, fontFamily: 'monospace', width: 16 }}>{statusIcon}</span>
        <span style={{ color: nameColor, fontSize: 13 }}>{stageName}</span>
        {gateLabel && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-ghost)' }}>
            {gateLabel}
          </span>
        )}
        {hasCheckpoint && !isRunning && !isConfirming && (
          <button
            onClick={onRestoreClick}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-100 text-[11px] px-1.5 py-0.5 rounded cursor-pointer"
            style={{
              color: 'var(--text-accent)',
              background: 'transparent',
              border: 'none',
              marginLeft: gateLabel ? '8px' : 'auto',
            }}
          >
            ↺ restore
          </button>
        )}
      </div>

      {/* Inline restore confirmation */}
      {isConfirming && (
        <div
          className="mx-2 mb-1 p-3 rounded text-[12px]"
          style={{
            background: 'var(--color-surface-overlay)',
            border: '1px solid var(--color-border-emphasis)',
          }}
        >
          <div style={{ color: 'var(--text-bright)', marginBottom: 4 }}>
            Restore to before {stageName}?
          </div>
          {undoneStages.length > 0 && (
            <div style={{ color: 'var(--text-ghost)', marginBottom: 8 }}>
              This will undo {undoneStages.join(' and ')} stage{undoneStages.length > 1 ? 's' : ''}.
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onRestoreCancel} disabled={restoring}>
              Cancel
            </Button>
            <Button variant="warning" size="sm" onClick={onRestoreConfirm} disabled={restoring}>
              {restoring ? 'Restoring...' : 'Restore ↺'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
