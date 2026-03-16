import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Task, WorkflowDefinition } from '@lacc/shared';
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

  useEffect(() => {
    if (!task.workflowName) return;
    fetch(`/workflows/${encodeURIComponent(task.workflowName)}`)
      .then(r => r.ok ? r.json() : null)
      .then((wf: WorkflowDefinition | null) => setWorkflow(wf))
      .catch(() => {});
  }, [task.workflowName]);

  // Load the gate output doc for preview when waiting
  useEffect(() => {
    if (task.workflowStatus !== 'waiting_gate' || !task.workflowStage || !task.worktreePath || !workflow) {
      setGatePreview(null);
      return;
    }
    // Output doc preview is deferred to post-v1 (needs a /tasks/:id/file endpoint).
    setGatePreview(null);
  }, [task.workflowStatus, task.workflowStage, workflow]);

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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Stage progress list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
        <div className="text-text-ghost text-[11px] uppercase tracking-widest mb-3">
          Workflow: {workflow.name}
        </div>

        {activeStages.map((stage, idx) => {
          const isComplete = idx < currentIdx || task.workflowStatus === 'complete';
          const isActive = stage.id === task.workflowStage && task.workflowStatus === 'running';
          const isWaiting = stage.id === task.workflowStage && task.workflowStatus === 'waiting_gate';

          const statusIcon = isComplete ? '✓' : isActive ? '●' : isWaiting ? '⏸' : '○';
          const statusColor = isComplete
            ? 'var(--text-accent)'
            : isActive
            ? '#4ade80'
            : isWaiting
            ? '#fb923c'
            : 'var(--text-ghost)';

          return (
            <div
              key={stage.id}
              className="flex items-center gap-3 py-1.5 px-2 rounded"
              style={{ background: (isActive || isWaiting) ? 'rgba(255,255,255,0.03)' : 'transparent' }}
            >
              <span style={{ color: statusColor, fontFamily: 'monospace', width: 16 }}>{statusIcon}</span>
              <span style={{ color: isComplete ? 'var(--text-body)' : isActive || isWaiting ? 'var(--text-bright)' : 'var(--text-ghost)', fontSize: 13 }}>
                {stage.name}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-ghost)' }}>
                {stage.gate === 'manual' ? 'manual' : 'auto'}
              </span>
            </div>
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
