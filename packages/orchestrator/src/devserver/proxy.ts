import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Task } from '@lacc/shared';
import type { RepoConfig } from '../config/repo.js';

const execFileAsync = promisify(execFile);
const CERTS_DIR = path.join(os.homedir(), '.lacc-data', 'certs');
const CADDYFILE = '/etc/caddy/Caddyfile';

// Mutex for Caddyfile operations (Issue 48)
let caddyMutex = Promise.resolve();

function withCaddyMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = caddyMutex.then(() => fn());
  caddyMutex = next.then(() => {}, () => {});
  return next;
}

export async function setupProxy(task: Task, repoConfig: RepoConfig): Promise<string | null> {
  const hostname = repoConfig.proxyHostname ?? `task-${task.id.slice(0, 8)}.lacc.local`;

  return withCaddyMutex(async () => {
    // Add /etc/hosts entry
    await addHostsEntry(hostname).catch(err => {
      console.error('Hosts entry failed:', err);
    });

    // Generate cert
    const certPath = path.join(CERTS_DIR, `${hostname}.crt`);
    const keyPath = path.join(CERTS_DIR, `${hostname}.key`);

    const certOk = await generateCert(hostname, certPath, keyPath).catch(err => {
      console.error('Cert generation failed:', err);
      return false;
    });

    if (!certOk) {
      return null;
    }

    // Add Caddy block
    await appendCaddyBlock(hostname, task.devPort!, certPath, keyPath);
    await caddyReload().catch(err => console.error('Caddy reload failed:', err));

    return `https://${hostname}`;
  });
}

export async function teardownProxy(task: Task, repoConfig: RepoConfig): Promise<void> {
  const hostname = repoConfig.proxyHostname ?? `task-${task.id.slice(0, 8)}.lacc.local`;

  return withCaddyMutex(async () => {
    await removeHostsEntry(hostname).catch(() => {});
    await removeCaddyBlock(hostname);
    await caddyReload().catch(() => {});

    // Remove certs
    const certPath = path.join(CERTS_DIR, `${hostname}.crt`);
    const keyPath = path.join(CERTS_DIR, `${hostname}.key`);
    fs.rmSync(certPath, { force: true });
    fs.rmSync(keyPath, { force: true });
  });
}

async function addHostsEntry(hostname: string): Promise<void> {
  await execFileAsync('sudo', [
    path.join(os.homedir(), '.lacc-data', 'lacc-hosts'),
    'add', hostname, '127.0.0.1',
  ]);
}

async function removeHostsEntry(hostname: string): Promise<void> {
  await execFileAsync('sudo', [
    path.join(os.homedir(), '.lacc-data', 'lacc-hosts'),
    'remove', hostname,
  ]);
}

async function generateCert(hostname: string, certPath: string, keyPath: string): Promise<boolean> {
  try {
    await execFileAsync('mkcert', ['-cert-file', certPath, '-key-file', keyPath, hostname]);
    return true;
  } catch {
    // Fallback: generate self-signed cert via openssl
    try {
      await execFileAsync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048',
        '-keyout', keyPath, '-out', certPath,
        '-days', '365', '-nodes', '-subj', `/CN=${hostname}`,
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

async function appendCaddyBlock(hostname: string, port: number, certPath: string, keyPath: string): Promise<void> {
  const block = `
# lacc-task-${hostname}
${hostname} {
  tls ${certPath} ${keyPath}
  reverse_proxy localhost:${port}
}
`;
  fs.appendFileSync(CADDYFILE, block, 'utf-8');
}

async function removeCaddyBlock(hostname: string): Promise<void> {
  if (!fs.existsSync(CADDYFILE)) return;
  const content = fs.readFileSync(CADDYFILE, 'utf-8');
  const blockPattern = new RegExp(
    `\\n# lacc-task-${hostname}\\n.*?(?=\\n#|$)`,
    'gs'
  );
  const updated = content.replace(blockPattern, '');
  fs.writeFileSync(CADDYFILE, updated);
}

async function caddyReload(): Promise<void> {
  await execFileAsync('caddy', ['reload', '--config', CADDYFILE]);
}
