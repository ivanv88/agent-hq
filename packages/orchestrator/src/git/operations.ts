import simpleGit from 'simple-git';

export interface GitResult {
  ok: boolean;
  conflict?: boolean;
  conflictedFiles?: string[];
  message?: string;
}

export async function gitPull(worktreePath: string): Promise<GitResult> {
  try {
    await simpleGit(worktreePath).pull();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function gitPush(worktreePath: string): Promise<GitResult> {
  try {
    await simpleGit(worktreePath).push();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function gitRebase(worktreePath: string, branch: string = 'main'): Promise<GitResult> {
  const git = simpleGit(worktreePath);
  try {
    await git.rebase([branch]);
    return { ok: true };
  } catch {
    // Check for conflicts
    try {
      const status = await git.status();
      if (status.conflicted.length > 0) {
        return {
          ok: false,
          conflict: true,
          conflictedFiles: status.conflicted,
          message: `Rebase conflict in ${status.conflicted.length} file(s). Resolve manually or reset.`,
        };
      }
    } catch {
      // fallthrough
    }
    return { ok: false, message: 'Rebase failed' };
  }
}

export async function gitReset(worktreePath: string, hard: boolean = false): Promise<GitResult> {
  try {
    const git = simpleGit(worktreePath);
    if (hard) {
      await git.reset(['--hard', 'HEAD']);
    } else {
      await git.reset(['HEAD']);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function gitStash(worktreePath: string): Promise<GitResult> {
  try {
    await simpleGit(worktreePath).stash();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function gitStashPop(worktreePath: string): Promise<GitResult> {
  try {
    await simpleGit(worktreePath).stash(['pop']);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}
