#!/usr/bin/env tsx
/**
 * Ensures the Docker daemon is running before starting LACC.
 *
 * Provider resolution order:
 *   1. config.json `dockerProvider` setting ('auto' | 'desktop' | 'colima')
 *   2. 'auto' — starts Colima if Docker is not already responding
 *
 * Also ensures the lacc-agent-base image exists, building it if missing.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.lacc-data', 'config.json');
const PROJECT_ROOT = process.cwd();

function readDockerProvider(): string {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return raw.dockerProvider ?? 'auto';
  } catch {
    return 'auto';
  }
}

function isDockerResponding(): boolean {
  return spawnSync('docker', ['info'], { stdio: 'pipe' }).status === 0;
}

function hasColima(): boolean {
  return spawnSync('which', ['colima'], { stdio: 'pipe' }).status === 0;
}

function isColimaRunning(): boolean {
  return spawnSync('colima', ['status'], { stdio: 'pipe' }).status === 0;
}

function startColima(): boolean {
  console.log('Starting Colima...');
  return spawnSync('colima', ['start'], { stdio: 'inherit' }).status === 0;
}

function imageExists(name: string): boolean {
  const result = spawnSync('docker', ['images', '-q', name], { stdio: 'pipe' });
  return result.status === 0 && result.stdout.toString().trim().length > 0;
}

function buildImage(): boolean {
  console.log('Building lacc-agent-base image...');
  const result = spawnSync(
    'docker', ['build', '-t', 'lacc-agent-base', 'docker/agent-base/'],
    { stdio: 'inherit', cwd: PROJECT_ROOT }
  );
  return result.status === 0;
}

async function ensureDaemon(provider: string): Promise<void> {
  if (provider === 'desktop') {
    if (!isDockerResponding()) {
      console.error('✗ Docker Desktop is not running. Please start it manually.');
      process.exit(1);
    }
    return;
  }

  if (provider === 'colima') {
    if (!hasColima()) {
      console.error('✗ dockerProvider is set to "colima" but Colima is not installed.');
      console.error('  Install: brew install colima');
      process.exit(1);
    }
    if (!isColimaRunning()) {
      if (!startColima()) {
        console.error('✗ Failed to start Colima. Run "colima start" manually for details.');
        process.exit(1);
      }
    }
    if (!isDockerResponding()) {
      console.error('✗ Colima is running but Docker is not responding. Try: colima stop && colima start');
      process.exit(1);
    }
    return;
  }

  // auto: Docker already up — nothing to do
  if (isDockerResponding()) return;

  // auto: try Colima
  if (hasColima()) {
    if (isColimaRunning()) {
      console.warn('⚠ Colima is running but Docker is not responding. Try: colima stop && colima start');
      process.exit(1);
    }
    if (!startColima()) {
      console.error('✗ Failed to start Colima. Run "colima start" manually for details.');
      process.exit(1);
    }
    if (!isDockerResponding()) {
      console.error('✗ Colima started but Docker is still not responding. Check "colima status".');
      process.exit(1);
    }
    console.log('✓ Colima started');
    return;
  }

  // auto: no Docker, no Colima
  console.error('✗ Docker daemon is not running and Colima is not installed.');
  console.error('  Options:');
  console.error('    • Start Docker Desktop');
  console.error('    • Install Colima: brew install colima');
  process.exit(1);
}

async function main() {
  const provider = readDockerProvider();

  await ensureDaemon(provider);

  // Ensure the agent base image exists — it's context-specific (Colima vs Desktop each have their own)
  if (!imageExists('lacc-agent-base:latest')) {
    console.log('lacc-agent-base image not found in current Docker context.');
    if (!buildImage()) {
      console.error('✗ Failed to build lacc-agent-base image.');
      process.exit(1);
    }
    console.log('✓ lacc-agent-base image built');
  }
}

main().catch(err => {
  console.error('Docker startup check failed:', err);
  process.exit(1);
});
