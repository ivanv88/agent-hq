import Docker from 'dockerode';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

import type { Task } from '@lacc/shared';
import { getGlobalConfig } from '../config/global.js';
import {
  insertPooled,
  updatePoolStatus,
  claimOne,
  removePooled,
  getPooledByContainerId,
  listAllPooled,
} from '../db/pool.js';
import { broadcastWsEvent } from '../index.js';
import { getPoolStatus } from '../db/pool.js';

function isSocketAlive(socketPath: string): boolean {
  try {
    return fs.statSync(socketPath).isSocket();
  } catch {
    return false;
  }
}

function resolveDockerSocket(): string {
  // Explicit env var always wins
  const envHost = process.env.DOCKER_HOST;
  if (envHost?.startsWith('unix://')) return envHost.slice(7);

  // Read dockerProvider from config file directly — getGlobalConfig() is not yet populated
  // at module-load time since lifecycle.ts is imported before loadGlobalConfig() runs.
  const DESKTOP_SOCK = '/var/run/docker.sock';
  const COLIMA_SOCK = path.join(os.homedir(), '.colima', 'default', 'docker.sock');

  let provider = 'auto';
  try {
    const configPath = path.join(os.homedir(), '.lacc-data', 'config.json');
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (raw.dockerProvider) provider = raw.dockerProvider;
  } catch {
    // Config missing or unreadable — fall through to auto
  }

  if (provider === 'desktop') return DESKTOP_SOCK;
  if (provider === 'colima') return COLIMA_SOCK;

  // auto: prefer whichever socket is alive; Docker Desktop takes priority if both are up
  if (isSocketAlive(DESKTOP_SOCK)) return DESKTOP_SOCK;
  if (isSocketAlive(COLIMA_SOCK)) return COLIMA_SOCK;

  return DESKTOP_SOCK; // fallback — Dockerode will surface a clear error
}

export const docker = new Docker({ socketPath: resolveDockerSocket() });
const BASE_IMAGE = 'lacc-agent-base:latest';

// Track warming promises to avoid double-warming
let warmingCount = 0;

async function readOauthTokenFromKeychain(): Promise<{ accessToken: string; refreshToken?: string } | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password', '-s', 'Claude Code-credentials', '-w',
    ]);
    const json = JSON.parse(stdout.trim());
    const oauth = json?.claudeAiOauth;
    if (oauth?.accessToken) return { accessToken: oauth.accessToken, refreshToken: oauth.refreshToken };
  } catch {
    // Keychain not available or entry missing (non-macOS)
  }
  return null;
}

export async function warmOne(): Promise<void> {
  const id = randomUUID();
  warmingCount++;

  try {
    const container = await docker.createContainer({
      Image: BASE_IMAGE,
      name: `lacc-pool-${id.slice(0, 8)}`,
      Labels: { lacc: 'true', 'lacc-type': 'pool' },
      Cmd: ['sleep', 'infinity'],
      // No task-specific mounts in pool containers (Issue 3 fix)
    });

    await container.start();

    insertPooled({
      id,
      containerId: container.id,
      status: 'WARMING',
      imageTag: BASE_IMAGE,
      devPort: null,
      createdAt: new Date(),
    });

    broadcastWsEvent({ type: 'POOL_UPDATED', pool: getPoolStatus(getGlobalConfig().poolSize) });

    // Health check: verify claude binary
    const exec = await container.exec({
      Cmd: ['claude', '--version'],
      AttachStdout: true,
      AttachStderr: true,
    });

    await new Promise<void>((resolve, reject) => {
      exec.start({ Detach: false }, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
        if (err) return reject(err);
        if (!stream) return resolve();

        let output = '';
        stream.on('data', (d: Buffer) => { output += d.toString(); });
        stream.on('end', () => {
          if (output.toLowerCase().includes('claude')) resolve();
          else reject(new Error(`Health check failed: ${output}`));
        });
        stream.on('error', reject);
      });
    });

    updatePoolStatus(id, 'READY');
    broadcastWsEvent({ type: 'POOL_UPDATED', pool: getPoolStatus(getGlobalConfig().poolSize) });
  } catch (err) {
    console.error('warmOne failed:', err);
    // Remove from DB if it was inserted
    throw err;
  } finally {
    warmingCount--;
  }
}

export async function maintain(targetSize: number): Promise<void> {
  const pool = getPoolStatus(targetSize);
  const active = pool.ready + pool.warming;
  const deficit = targetSize - active;

  for (let i = 0; i < deficit; i++) {
    warmOne().catch(err => console.error('warmOne error:', err));
  }
}

export async function claim(): Promise<{ id: string; containerId: string } | null> {
  const entry = claimOne();
  if (!entry) return null;

  const config = getGlobalConfig();
  maintain(config.poolSize).catch(err => console.error('maintain error:', err));

  return { id: entry.id, containerId: entry.containerId };
}

export async function adoptExisting(): Promise<void> {
  const containers = await docker.listContainers({
    all: true,
    filters: JSON.stringify({ label: ['lacc=true'] }),
  });

  const allPooled = listAllPooled();
  const pooledIds = new Set(allPooled.map(p => p.containerId));

  // Only running containers are usable — remove DB entries for anything else (missing or exited)
  const runningIds = new Set(containers.filter(c => c.State === 'running').map(c => c.Id));
  for (const pooled of allPooled) {
    if (!runningIds.has(pooled.containerId)) {
      removePooled(pooled.id);
    }
  }

  // Promote WARMING→READY for DB entries whose container is actually running
  for (const pooled of allPooled) {
    if (pooled.status === 'WARMING' && runningIds.has(pooled.containerId)) {
      updatePoolStatus(pooled.id, 'READY');
    }
  }

  // Re-adopt running containers not in DB
  for (const c of containers) {
    if (c.State !== 'running') continue;
    if (!pooledIds.has(c.Id) && c.Labels?.['lacc-type'] === 'pool') {
      const id = randomUUID();
      insertPooled({
        id,
        containerId: c.Id,
        status: 'READY',
        imageTag: c.Image,
        devPort: null,
        createdAt: new Date(c.Created * 1000),
      });
    }
  }
}

export async function configure(
  poolEntryId: string | null,
  claimedContainerId: string | null,
  task: Task,
  worktreePath: string
): Promise<string> {
  // Issue 3 resolution: stop + rm claimed container, recreate with task-specific mounts
  if (claimedContainerId) {
    try {
      const old = docker.getContainer(claimedContainerId);
      await old.stop({ t: 2 }).catch(() => {});
      await old.remove({ force: true }).catch(() => {});
    } catch {
      // ignore
    }
    if (poolEntryId) {
      removePooled(poolEntryId);
    }
  }

  const config = getGlobalConfig();
  const claudeDir = path.join(os.homedir(), '.claude');
  const claudeJson = path.join(os.homedir(), '.claude.json');
  const sshDir = path.join(os.homedir(), '.ssh');

  const binds: string[] = [
    `${worktreePath}:/workspace`,
    `${claudeDir}:/home/node/.claude`, // no :ro — auto-memory needs write access (Issue 26 fix)
    `${claudeJson}:/home/node/.claude.json`, // claude CLI config file (separate from .claude/ dir)
    `${sshDir}:/home/node/.ssh:ro`,
    `${task.repoPath}:/original-repo:ro`, // Issue 7 fix
  ];

  // Mount global LACC library read-only
  const laccDataDir = path.join(os.homedir(), '.lacc-data');
  binds.push(`${laccDataDir}:/lacc-global:ro`);

  // Mount task storage at /workspace/.lacc if repo uses global mode
  const { getContainerTaskMount } = await import('../storage/lacc.js');
  const { hostPath, needsExplicitMount } = getContainerTaskMount(
    task.repoPath,
    worktreePath,
    task.id,
  );
  if (needsExplicitMount && hostPath) {
    binds.push(`${hostPath}:/workspace/.lacc`);
  }

  const env: string[] = [
    `LACC_TASK_ID=${task.id}`,
    `LACC_REPO_PATH=${task.repoPath}`,
  ];

  if (config.anthropicApiKey) {
    env.push(`ANTHROPIC_API_KEY=${config.anthropicApiKey}`);
  } else {
    // No API key configured — try macOS Keychain OAuth credentials (Pro/subscription users)
    const oauth = await readOauthTokenFromKeychain();
    if (oauth) {
      env.push(`CLAUDE_CODE_OAUTH_TOKEN=${oauth.accessToken}`);
      if (oauth.refreshToken) env.push(`CLAUDE_CODE_OAUTH_REFRESH_TOKEN=${oauth.refreshToken}`);
    }
  }

  // Issue 51: only set ANTHROPIC_BASE_URL if non-empty
  const baseUrl = (task as Task & { anthropicBaseUrl?: string }).anthropicBaseUrl;
  if (baseUrl && baseUrl.length > 0) {
    env.push(`ANTHROPIC_BASE_URL=${baseUrl}`);
  }

  const portBindings: Docker.PortMap = {};
  const exposedPorts: Record<string, Record<string, unknown>> = {};

  if (task.devPort) {
    const portKey = `${task.devPort}/tcp`;
    portBindings[portKey] = [{ HostPort: String(task.devPort) }];
    exposedPorts[portKey] = {};
  }

  const container = await docker.createContainer({
    Image: await resolveImageForTask(task),
    name: `lacc-task-${task.id.slice(0, 8)}`,
    Labels: { lacc: 'true', 'lacc-type': 'task', 'lacc-task-id': task.id },
    Cmd: ['sleep', 'infinity'],
    Env: env,
    ExposedPorts: exposedPorts,
    HostConfig: {
      Binds: binds,
      PortBindings: portBindings,
    },
  });

  await container.start();
  return container.id;
}

async function resolveImageForTask(task: Task): Promise<string> {
  // For now, use base image. In Stage 2.3, this will use image.ts resolver.
  const { readDevcontainerConfig } = await import('./devcontainer.js');
  const { resolveImage } = await import('./image.js');
  const devConfig = readDevcontainerConfig(task.repoPath);
  return resolveImage(task.repoPath, devConfig);
}

export async function watchExecUntilDone(
  exec: import('dockerode').Exec,
  taskId: string,
  execId: string,
): Promise<void> {
  const { logEmitter } = await import('../streaming/logs.js');
  let ended = false;

  const endEvent = `end:${taskId}:${execId}`;
  logEmitter.once(endEvent, () => { ended = true; });

  const poll = async (): Promise<void> => {
    if (ended) return;
    try {
      const info = await exec.inspect() as { Running: boolean };
      if (!info.Running) {
        if (!ended) {
          ended = true;
          logEmitter.emit(endEvent);
        }
        return;
      }
    } catch {
      // container gone
      if (!ended) {
        ended = true;
        logEmitter.emit(endEvent);
      }
      return;
    }
    setTimeout(() => { poll().catch(() => {}); }, 3_000);
  };

  setTimeout(() => { poll().catch(() => {}); }, 3_000);
}

export async function startClaude(containerId: string, task: Task): Promise<{ stream: NodeJS.ReadableStream; exec: import('dockerode').Exec }> {
  const container = docker.getContainer(containerId);

  const cmd = [
    'claude',
    '-p',                                    // Issue 1 fix: --print flag
    '--output-format', 'stream-json',
    '--verbose',                             // required for stream-json in claude 2.1.68+
    '--dangerously-skip-permissions',
    '--model', task.model,
  ];

  if (task.planFirst) {
    cmd.push('--permission-mode', 'plan');
  }

  if (task.agentName) {
    cmd.push('--agent', task.agentName);
  }

  // Issue 5: --session-name omitted (flag does not exist)
  // Issue 52: skillNames not wired (no --skill flag exists)

  // Prompt MUST come before --add-dir: --add-dir is variadic and consumes trailing args
  cmd.push(task.prompt.replace(/\0/g, ''));
  cmd.push('--add-dir', '/original-repo');  // Issue 7 fix: container-internal path
  cmd.push('--add-dir', '/workspace/.lacc');
  cmd.push('--add-dir', '/lacc-global');

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/workspace',
  });

  return new Promise((resolve, reject) => {
    exec.start({ Detach: false }, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) return reject(err);
      if (!stream) return reject(new Error('No exec stream'));
      resolve({ stream, exec });
    });
  });
}

export async function runPostCreate(containerId: string, cmd: string | string[]): Promise<void> {
  const container = docker.getContainer(containerId);

  // Issue 30: wrap string commands in sh -c
  const execCmd = Array.isArray(cmd) ? cmd : ['sh', '-c', cmd];

  const exec = await container.exec({
    Cmd: execCmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/workspace',
  });

  await new Promise<void>((resolve, reject) => {
    exec.start({ Detach: false }, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) return reject(err);
      if (!stream) return resolve();
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  });
}

export async function pauseContainer(containerId: string): Promise<void> {
  await docker.getContainer(containerId).pause();
}

export async function resumeContainer(containerId: string): Promise<void> {
  await docker.getContainer(containerId).unpause();
}

export async function isContainerPaused(containerId: string): Promise<boolean> {
  try {
    const info = await docker.getContainer(containerId).inspect() as { State: { Paused: boolean } };
    return info.State.Paused === true;
  } catch {
    return false;
  }
}

export async function resumeClaudeAfterRateLimit(
  containerId: string,
  task: Task,
): Promise<{ stream: NodeJS.ReadableStream; exec: import('dockerode').Exec }> {
  const container = docker.getContainer(containerId);

  // Unpause the frozen container
  await container.unpause();

  // Kill the old frozen Claude process — start fresh with --continue
  const killExec = await container.exec({
    Cmd: ['sh', '-c', 'pkill -f "claude -p" || true'],
    AttachStdout: false,
    AttachStderr: false,
  });
  await new Promise<void>(resolve => {
    killExec.start({ Detach: true }, () => resolve());
  });

  // Wait for the old process to exit
  await new Promise(resolve => setTimeout(resolve, 500));

  // Start fresh Claude in continue mode — prompt before --add-dir (variadic)
  const cmd = [
    'claude',
    '-p',
    '--continue',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
    '--model', task.model,
    'continue with your previous task',
    '--add-dir', '/original-repo',
  ];

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/workspace',
  });

  return new Promise((resolve, reject) => {
    exec.start({ Detach: false }, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) return reject(err);
      if (!stream) return reject(new Error('No exec stream'));
      resolve({ stream, exec });
    });
  });
}

export async function killContainer(containerId: string, gracePeriodMs = 10_000): Promise<void> {
  const container = docker.getContainer(containerId);
  try {
    await container.stop({ t: Math.floor(gracePeriodMs / 1000) });
  } catch {
    // container may already be stopped
  }
  try {
    await container.remove({ force: true });
  } catch {
    // ignore
  }
}

export async function killImmediate(containerId: string): Promise<void> {
  try {
    await docker.getContainer(containerId).remove({ force: true });
  } catch {
    // ignore
  }
}

// Kills any container labelled with this task ID — catches containers created
// but not yet saved to DB (e.g. configure() succeeded but start() failed).
export async function killTaskContainerIfExists(taskId: string): Promise<void> {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: [`lacc-task-id=${taskId}`] }),
    });
    for (const c of containers) {
      await killImmediate(c.Id);
    }
  } catch {
    // ignore — best effort
  }
}

