import { useState } from 'react';
import type { WorkflowDefinition, WorkflowStageConfig, CommandDefinition } from '@lacc/shared';
import { Button } from './ui/Button.js';
import { Input } from './ui/Input.js';

interface Props {
  workflow: WorkflowDefinition | null;  // null = new workflow
  commands: CommandDefinition[];
  onSave: (workflow: WorkflowDefinition) => Promise<void>;
  onDelete?: (name: string) => Promise<void>;
  onCancel: () => void;
}

const GATE_OPTIONS = [
  { value: 'manual', label: 'manual' },
  { value: 'auto', label: 'auto' },
];

const labelCls = 'text-[11px] text-text-ghost uppercase tracking-[0.1em] mb-1 block';

function StageRow({
  stage,
  commands,
  onUpdate,
  onRemove,
  idx,
}: {
  stage: WorkflowStageConfig;
  commands: CommandDefinition[];
  onUpdate: (s: WorkflowStageConfig) => void;
  onRemove: () => void;
  idx: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border-default rounded bg-surface-inset">
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-inset transition-colors duration-100"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-text-ghost text-xs w-5">{idx + 1}</span>
        <span className="text-text-body text-sm flex-1">{stage.name || stage.id}</span>
        <span className="text-text-ghost text-xs">{'command' in stage.step ? stage.step.command : 'file' in stage.step ? stage.step.file : 'inline'}</span>
        <span className="text-text-ghost text-xs ml-2">{stage.gate}</span>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ padding: '2px 8px', fontSize: 11 }}>×</Button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border-default flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Stage ID</label>
              <Input value={stage.id} onChange={e => onUpdate({ ...stage, id: e.target.value })} placeholder="implement" />
            </div>
            <div>
              <label className={labelCls}>Name</label>
              <Input value={stage.name} onChange={e => onUpdate({ ...stage, name: e.target.value })} placeholder="Implement" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Command</label>
              <select
                value={'command' in stage.step ? stage.step.command : ''}
                onChange={e => onUpdate({ ...stage, step: { command: e.target.value } })}
                className="w-full bg-surface-base border border-border-default rounded px-2 py-1.5 text-sm text-text-body"
              >
                {commands.map(c => <option key={c.filename} value={c.filename}>{c.filename}</option>)}
                <option value="">-- custom --</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Gate</label>
              <select
                value={stage.gate}
                onChange={e => onUpdate({ ...stage, gate: e.target.value as WorkflowStageConfig['gate'] })}
                className="w-full bg-surface-base border border-border-default rounded px-2 py-1.5 text-sm text-text-body"
              >
                {GATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input type="checkbox" className="accent-green-500" checked={stage.optional}
                onChange={e => onUpdate({ ...stage, optional: e.target.checked })} />
              Optional
            </label>
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input type="checkbox" className="accent-green-500" checked={stage.canLoop}
                onChange={e => onUpdate({ ...stage, canLoop: e.target.checked })} />
              Can loop
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkflowEditor({ workflow, commands, onSave, onDelete, onCancel }: Props) {
  const isNew = !workflow;
  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [docsDir, setDocsDir] = useState(workflow?.docsDir ?? 'ai-docs');
  const [stages, setStages] = useState<WorkflowStageConfig[]>(workflow?.stages ?? []);
  const [saving, setSaving] = useState(false);

  const addStage = () => {
    setStages(prev => [...prev, {
      id: `stage${prev.length + 1}`,
      name: `Stage ${prev.length + 1}`,
      step: { command: commands[0]?.filename ?? '' },
      gate: 'manual',
      optional: false,
      canLoop: false,
    }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ name, description, docsDir, version: workflow?.version ?? 1, stages });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-text-bright text-sm font-medium">{isNew ? 'New Workflow' : workflow.name}</span>
        <div className="flex gap-2">
          {!isNew && onDelete && (
            <Button variant="danger" size="sm" onClick={() => onDelete(workflow.name)}>Delete</Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Workflow Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="feature-development" disabled={!isNew} />
        </div>
        <div>
          <label className={labelCls}>Docs Dir</label>
          <Input value={docsDir} onChange={e => setDocsDir(e.target.value)} placeholder="ai-docs" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this workflow does..." />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelCls} style={{ marginBottom: 0 }}>Stages</label>
          <Button variant="ghost" size="sm" onClick={addStage}>+ Add Stage</Button>
        </div>
        <div className="flex flex-col gap-1.5">
          {stages.map((stage, idx) => (
            <StageRow
              key={stage.id + idx}
              stage={stage}
              commands={commands}
              idx={idx}
              onUpdate={(updated: WorkflowStageConfig) => setStages(prev => prev.map((s, i) => i === idx ? updated : s))}
              onRemove={() => setStages(prev => prev.filter((_, i) => i !== idx))}
            />
          ))}
          {stages.length === 0 && (
            <div className="text-text-ghost text-sm text-center py-4">No stages yet. Click + Add Stage.</div>
          )}
        </div>
      </div>
    </div>
  );
}
