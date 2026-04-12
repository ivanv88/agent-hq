import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { OversightMode, DevServerMode } from '@lacc/shared';
import type { GlobalConfig } from './global.js';

export interface RepoConfig {
  // Existing fields — unchanged
  devServerMode?: DevServerMode;
  devPort?: number;
  oversightMode?: OversightMode;
  model?: string;
  branchTemplate?: string;
  postCreateCommand?: string;
  proxyHostname?: string;
  // New fields
  commitLacc?: boolean;
  defaultWorkflow?: string | null;
  baseBranch?: string;
}

export interface MergedConfig extends GlobalConfig {
  devServerMode: DevServerMode;
  devPort?: number;
  oversightMode: OversightMode;
  branchTemplate: string;
  postCreateCommand?: string;
  proxyHostname?: string;
}

export function loadRepoConfig(repoPath: string): RepoConfig {
  const laccPath = path.join(repoPath, '.lacc');

  // 1. .lacc/ directory with config.yml (new format)
  try {
    const stat = fs.statSync(laccPath);
    if (stat.isDirectory()) {
      const configYml = path.join(laccPath, 'config.yml');
      if (fs.existsSync(configYml)) {
        const raw = yaml.load(fs.readFileSync(configYml, 'utf-8'));
        return (raw as RepoConfig) ?? {};
      }
      return {};
    }
  } catch {
    // laccPath doesn't exist — fall through
  }

  // 2. .lacc as a flat JSON file (legacy format — read-only support)
  try {
    const stat = fs.statSync(laccPath);
    if (stat.isFile()) {
      return JSON.parse(fs.readFileSync(laccPath, 'utf-8')) as RepoConfig;
    }
  } catch {
    // not found or parse error
  }

  return {};
}

export function mergeConfigs(global: GlobalConfig, repo: RepoConfig): MergedConfig {
  return {
    ...global,
    devServerMode: repo.devServerMode ?? 'port',
    devPort: repo.devPort,
    oversightMode: repo.oversightMode ?? global.defaultOversightMode,
    branchTemplate: repo.branchTemplate ?? global.branchTemplate,
    postCreateCommand: repo.postCreateCommand,
    proxyHostname: repo.proxyHostname,
  };
}
