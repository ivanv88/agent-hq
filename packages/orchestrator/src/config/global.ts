import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ConfigPatch, DockerProvider, OversightMode } from '@lacc/shared';

export interface GlobalConfig {
  poolSize: number;
  costAlertThreshold: number;
  spinDetectionWindowMin: number;
  worktreeAutoDeleteHours: number;
  editorCommand: string;
  defaultModel: string;
  defaultOversightMode: OversightMode;
  anthropicApiKey: string;
  anthropicBaseUrl: string;
  metaModel: string;
  branchTemplate: string;
  repoPaths: string[];
  autoResumeRateLimited: boolean;
  dockerProvider: DockerProvider;
}

const DATA_DIR = path.join(os.homedir(), '.lacc-data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULTS: GlobalConfig = {
  poolSize: 2,
  costAlertThreshold: 1.0,
  spinDetectionWindowMin: 5,
  worktreeAutoDeleteHours: 24,
  editorCommand: 'code',
  defaultModel: 'claude-sonnet-4-6',
  defaultOversightMode: 'GATE_ON_COMPLETION',
  anthropicApiKey: '',
  anthropicBaseUrl: '',
  metaModel: 'claude-haiku-4-5-20251001',
  branchTemplate: '{type}/{ticket}-{slug}-{date}',
  repoPaths: [],
  autoResumeRateLimited: true,
  dockerProvider: 'auto',
};

let _config: GlobalConfig = { ...DEFAULTS };

export function loadGlobalConfig(): GlobalConfig {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
    _config = { ...DEFAULTS };
    return _config;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    _config = { ...DEFAULTS, ...raw };
  } catch (err) {
    console.warn(`[config] Failed to parse ${CONFIG_PATH}, using defaults:`, err);
    _config = { ...DEFAULTS };
  }

  return _config;
}

export function getGlobalConfig(): GlobalConfig {
  return _config;
}

export function saveGlobalConfig(patch: ConfigPatch): GlobalConfig {
  _config = { ..._config, ...patch } as GlobalConfig;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2));
  return _config;
}
