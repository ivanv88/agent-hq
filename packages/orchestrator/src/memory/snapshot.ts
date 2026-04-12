import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Task } from '@lacc/shared';
import { getDb } from '../db/init.js';
import { getTaskStoragePath } from '../storage/lacc.js';

function readIfExists(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

function extractAssistantText(output: string): string {
  const lines = output.split('\n').filter(Boolean);
  const parts: string[] = [];
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'text') parts.push(block.text);
        }
      }
    } catch { /* skip non-JSON lines */ }
  }
  return parts.join('') || output;
}

function getUserMessages(taskId: string): string {
  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT content FROM logs WHERE task_id = ? ORDER BY created_at ASC`
    ).all(taskId) as Array<{ content: string }>;
    return rows
      .map(r => {
        try {
          const parsed = JSON.parse(r.content);
          if (parsed.type === 'user') return parsed.message?.content?.[0]?.text ?? '';
          return '';
        } catch { return ''; }
      })
      .filter(Boolean)
      .join('\n\n');
  } catch { return ''; }
}

export async function generateMemorySnapshot(task: Task): Promise<string> {
  const storagePath = getTaskStoragePath(task.repoPath, task.id);

  const contextParts: string[] = [
    `Original prompt:\n${task.prompt}`,
  ];

  if (storagePath) {
    for (const file of ['.spec.md', '.plan.md', '.review.md']) {
      const content = readIfExists(path.join(storagePath, file));
      if (content) contextParts.push(`${file}:\n${content}`);
    }
  }

  const userMessages = getUserMessages(task.id);
  if (userMessages) contextParts.push(`User feedback during task:\n${userMessages}`);

  const context = contextParts.join('\n\n---\n\n');

  const prompt = `Summarise this completed development task for future reference.
Produce a concise memory.md covering:
- What was built (2-3 sentences)
- Key decisions made and why
- Files changed (if known)
- Review findings and how addressed (if any)
- Deferred work or known issues
- Context a future developer needs to continue

Be concise. This is a reference document, not a report. Use markdown headers.

Context:
${context}`;

  return new Promise<string>((resolve) => {
    let output = '';
    const proc = spawn('claude', [
      '-p',
      '--output-format', 'stream-json',
      '--model', 'claude-haiku-4-5-20251001',
      '--dangerously-skip-permissions',
      prompt,
    ], { env: { ...process.env } });

    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.on('close', () => resolve(extractAssistantText(output) || output));
    proc.on('error', () => resolve(''));
  });
}

export async function saveMemorySnapshot(task: Task): Promise<string> {
  const content = await generateMemorySnapshot(task);
  if (!content) return '';

  const storagePath = getTaskStoragePath(task.repoPath, task.id);
  if (storagePath) {
    fs.writeFileSync(path.join(storagePath, 'memory.md'), content, 'utf-8');
  }

  return content;
}

export function readMemorySnapshot(repoPath: string, taskId: string): string | null {
  const storagePath = getTaskStoragePath(repoPath, taskId);
  if (!storagePath) return null;
  return readIfExists(path.join(storagePath, 'memory.md'));
}
