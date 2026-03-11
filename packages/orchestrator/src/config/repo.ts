import fs from 'fs';
import path from 'path';
import type { OversightMode, DevServerMode } from '@lacc/shared';
import type { GlobalConfig } from './global.js';

export interface RepoConfig {
  devServerMode?: DevServerMode;
  devPort?: number;
  oversightMode?: OversightMode;
  model?: string;
  branchTemplate?: string;
  postCreateCommand?: string;
  proxyHostname?: string;
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
  if (!fs.existsSync(laccPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(laccPath, 'utf-8'));
  } catch {
    return {};
  }
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
