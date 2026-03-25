// Wraps child_process.spawn behind a mutable object so tests can
// vi.spyOn(subprocess, 'spawn') — property access is resolved at call time,
// not import time, making it interceptable in ESM.
import { spawn as _spawn, type SpawnOptions } from 'child_process';

export const subprocess = {
  spawn(cmd: string, args: string[], opts: SpawnOptions) {
return _spawn(cmd, args, opts);
  },
};
