#!/usr/bin/env tsx
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(os.homedir(), '.lacc-data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

function checkCommand(cmd: string): boolean {
  const result = spawnSync('which', [cmd], { stdio: 'pipe' });
  return result.status === 0;
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   LACC — Local Agent Command Center  ║');
  console.log('║          Setup                       ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Step 1: Docker build
  console.log('Step 1: Building Docker base image...');
  const dockerBin = spawnSync('which', ['docker'], { stdio: 'pipe' }).stdout?.toString().trim() || 'docker';
  try {
    execSync(`${dockerBin} build -t lacc-agent-base docker/agent-base/`, {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    console.log('✓ Docker image built\n');
  } catch {
    console.error('✗ Docker build failed. Is Docker running?\n');
  }

  // Step 2: Create data directories + default config
  console.log('Step 2: Creating ~/.lacc-data/ directories...');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'worktrees'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'certs'), { recursive: true });

  if (!fs.existsSync(CONFIG_PATH)) {
    const defaults = {
      poolSize: 2,
      costAlertThreshold: 1.0,
      spinDetectionWindowMin: 5,
      worktreeAutoDeleteHours: 24,
      editorCommand: 'code',
      defaultModel: 'claude-sonnet-4-6',
      defaultOversightMode: 'GATE_ON_COMPLETION',
      anthropicApiKey: '',
      metaModel: 'claude-haiku-4-5-20251001',
      branchTemplate: '{type}/{ticket}-{slug}-{date}',
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
  }
  console.log('✓ Directories and config created\n');

  // Step 3: Check Docker / Colima
  console.log('Step 3: Checking Docker daemon...');
  const dockerRunning = spawnSync('docker', ['info'], { stdio: 'pipe' }).status === 0;
  const hasColima = checkCommand('colima');
  if (dockerRunning) {
    console.log('✓ Docker daemon is running\n');
  } else if (hasColima) {
    console.log('  Docker is not running. Colima is installed — run "npm run dev" to start it automatically.\n');
  } else {
    console.log('  Docker is not running and Colima is not installed.');
    console.log('  Install Colima (recommended): brew install colima');
    console.log('  Or start Docker Desktop manually.\n');
  }

  // Step 4: Check Caddy
  console.log('Step 4: Checking Caddy...');
  const hasCaddy = checkCommand('caddy');
  if (hasCaddy) {
    console.log('✓ Caddy found\n');
  } else {
    console.log('  Caddy not found. Proxy mode will not be available.');
    console.log('  Install: https://caddyserver.com/docs/install\n');
  }

  // Step 5: Caddy setup
  if (hasCaddy) {
    console.log('Step 5: Starting Caddy daemon...');
    // Stop any existing instances first to avoid duplicates
    spawnSync('pkill', ['-x', 'caddy'], { stdio: 'pipe' });
    const result = spawnSync('caddy', ['start', '--watch'], { stdio: 'ignore' });
    if (result.status !== 0) {
      console.log('  Caddy failed to start — proxy mode may not be available\n');
    } else {
      console.log('✓ Caddy daemon started\n');
    }
  }

  // Final
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Setup complete!');
  console.log('');
  console.log('To start LACC:');
  console.log('  npm run build && npm start');
  console.log('');
  console.log('For development:');
  console.log('  npm run dev');
  console.log('');
  console.log('Open: http://localhost:7842');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
