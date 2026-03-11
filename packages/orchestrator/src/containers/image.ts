import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DevcontainerConfig } from '@lacc/shared';
import { docker } from './lifecycle.js';

// Cache: repoPath → resolved image tag
const imageCache = new Map<string, string>();

export async function resolveImage(
  repoPath: string,
  devcontainerConfig: DevcontainerConfig | null
): Promise<string> {
  const cached = imageCache.get(repoPath);
  if (cached) return cached;

  let imageTag: string;

  if (devcontainerConfig?.image) {
    // Priority 1: use specified image
    imageTag = devcontainerConfig.image;
    await ensureImageAvailable(imageTag);
  } else if (devcontainerConfig?.build?.dockerfile) {
    // Priority 2: build from Dockerfile
    const dockerfilePath = path.resolve(
      repoPath,
      devcontainerConfig.build.context ?? '.',
      devcontainerConfig.build.dockerfile
    );

    const hash = hashFile(dockerfilePath);
    imageTag = `lacc-devcontainer-${hash}`;

    const exists = await imageExists(imageTag);
    if (!exists) {
      await buildImage(
        dockerfilePath,
        path.resolve(repoPath, devcontainerConfig.build.context ?? '.'),
        imageTag,
        devcontainerConfig.build.args
      );
    }
  } else {
    // Priority 3: fallback to base image
    imageTag = 'lacc-agent-base:latest';
  }

  imageCache.set(repoPath, imageTag);
  return imageTag;
}

function hashFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
  } catch {
    return 'unknown';
  }
}

async function imageExists(tag: string): Promise<boolean> {
  try {
    await docker.getImage(tag).inspect();
    return true;
  } catch {
    return false;
  }
}

async function ensureImageAvailable(tag: string): Promise<void> {
  if (await imageExists(tag)) return;

  await new Promise<void>((resolve, reject) => {
    docker.pull(tag, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

async function buildImage(
  dockerfilePath: string,
  contextPath: string,
  tag: string,
  buildArgs?: Record<string, string>
): Promise<void> {
  const buildArgsFormatted = buildArgs
    ? Object.fromEntries(Object.entries(buildArgs).map(([k, v]) => [k, v]))
    : {};

  const stream = await docker.buildImage(
    { context: contextPath, src: [path.basename(dockerfilePath)] },
    { t: tag, buildargs: buildArgsFormatted }
  );

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
