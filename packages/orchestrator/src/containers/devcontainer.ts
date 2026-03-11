import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import type { DevcontainerConfig } from '@lacc/shared';

const DevcontainerSchema = z.object({
  image: z.string().optional(),
  build: z.object({
    dockerfile: z.string().optional(),
    context: z.string().optional(),
    args: z.record(z.string()).optional(),
  }).optional(),
  forwardPorts: z.array(z.number()).optional(),
  postCreateCommand: z.union([z.string(), z.array(z.string())]).optional(),
  remoteEnv: z.record(z.string()).optional(),
  mounts: z.array(z.string()).optional(),
  dockerComposeFile: z.string().optional(),
}).passthrough();

export function readDevcontainerConfig(repoPath: string): DevcontainerConfig | null {
  const candidates = [
    path.join(repoPath, '.devcontainer', 'devcontainer.json'),
    path.join(repoPath, '.devcontainer.json'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      const result = DevcontainerSchema.safeParse(raw);

      if (!result.success) {
        console.warn(`Invalid devcontainer.json at ${candidate}:`, result.error.flatten());
        return null;
      }

      const data = result.data;

      if (data.dockerComposeFile) {
        console.warn(`Skipping devcontainer.json with dockerComposeFile (not supported): ${candidate}`);
        return null;
      }

      return {
        image: data.image,
        build: data.build as DevcontainerConfig['build'],
        forwardPorts: data.forwardPorts,
        postCreateCommand: data.postCreateCommand as DevcontainerConfig['postCreateCommand'],
        remoteEnv: data.remoteEnv,
        mounts: data.mounts,
      };
    } catch (err) {
      console.warn(`Failed to parse devcontainer.json at ${candidate}:`, err);
      return null;
    }
  }

  return null;
}
