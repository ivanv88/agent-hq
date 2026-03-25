import { useState } from 'react';
import type { CommandDefinition } from '@lacc/shared';
import { Button } from './ui/Button.js';
import { Input, Textarea } from './ui/Input.js';

interface Props {
  command: CommandDefinition | null;   // null = new command
  onSave: (command: CommandDefinition) => Promise<void>;
  onDelete?: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function CommandEditor({ command, onSave, onDelete, onCancel }: Props) {
  const isNew = !command;
  const [filename, setFilename] = useState(command?.filename ?? '');
  const [name, setName] = useState(command?.name ?? '');
  const [description, setDescription] = useState(command?.description ?? '');
  const [reads, setReads] = useState<string[]>(command?.reads ?? []);
  const [writes, setWrites] = useState<string[]>(command?.writes ?? []);
  const [prompt, setPrompt] = useState(command?.prompt ?? '');
  const [saving, setSaving] = useState(false);

  const labelCls = 'text-[11px] text-text-ghost uppercase tracking-[0.1em] mb-1 block';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ filename, name, description, reads, writes, promptUser: false, prompt });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-text-bright text-sm font-medium">{isNew ? 'New Command' : command.filename}</span>
        <div className="flex gap-2">
          {!isNew && onDelete && (
            <Button variant="danger" size="sm" onClick={() => onDelete(command.filename)}>Delete</Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Filename (stem)</label>
          <Input value={filename} onChange={e => setFilename(e.target.value)} placeholder="spec-from-jira" disabled={!isNew} />

        </div>
        <div>
          <label className={labelCls}>Display Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Write Technical Spec" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this command does..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Reads (one per line)</label>
          <Textarea
            className="min-h-[60px] font-mono text-xs"
            value={reads.join('\n')}
            onChange={e => setReads(e.target.value.split('\n').filter(Boolean))}
            placeholder="{{docs_dir}}/.jira.md"
          />
        </div>
        <div>
          <label className={labelCls}>Writes (one per line)</label>
          <Textarea
            className="min-h-[60px] font-mono text-xs"
            value={writes.join('\n')}
            onChange={e => setWrites(e.target.value.split('\n').filter(Boolean))}
            placeholder="{{docs_dir}}/.spec.md"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Prompt</label>
        <Textarea
          className="min-h-[200px] font-mono text-xs"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Read the task description at {{docs_dir}}/.jira.md..."
        />
      </div>
    </div>
  );
}
