import fs from 'fs';
import path from 'path';
import os from 'os';

function getDataDir(): string {
  return process.env.LACC_DATA_DIR_OVERRIDE ?? path.join(os.homedir(), '.lacc-data');
}

function getRegistryPath(): string {
  return path.join(getDataDir(), 'registry.json');
}

export interface RegistryEntry {
  name: string;
  remoteUrl: string | null;
}

export type Registry = Record<string, RegistryEntry>;

function readRegistry(): Registry {
  try {
    return JSON.parse(fs.readFileSync(getRegistryPath(), 'utf-8')) as Registry;
  } catch {
    return {};
  }
}

function writeRegistry(reg: Registry): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.writeFileSync(getRegistryPath(), JSON.stringify(reg, null, 2));
}

export function getRepoName(repoPath: string): string | null {
  return readRegistry()[repoPath]?.name ?? null;
}

export function getRepoEntry(repoPath: string): RegistryEntry | null {
  return readRegistry()[repoPath] ?? null;
}

export function registerRepo(repoPath: string, name: string, remoteUrl: string | null): void {
  const reg = readRegistry();
  reg[repoPath] = { name, remoteUrl };
  writeRegistry(reg);
}

export function updateRemoteUrl(repoPath: string, remoteUrl: string | null): void {
  const reg = readRegistry();
  if (reg[repoPath]) {
    reg[repoPath].remoteUrl = remoteUrl;
    writeRegistry(reg);
  }
}

export function unregisterRepo(repoPath: string): void {
  const reg = readRegistry();
  delete reg[repoPath];
  writeRegistry(reg);
}

/** Returns suggested name + whether it conflicts with an existing entry */
export function resolveRepoName(repoPath: string): { suggested: string; conflict: boolean } {
  const suggested = path.basename(repoPath);
  const reg = readRegistry();
  const conflict = Object.entries(reg).some(
    ([existingPath, entry]) => entry.name === suggested && existingPath !== repoPath
  );
  return { suggested, conflict };
}

export function listRegistry(): Array<{ repoPath: string } & RegistryEntry> {
  return Object.entries(readRegistry()).map(([repoPath, entry]) => ({ repoPath, ...entry }));
}
