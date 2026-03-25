import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { EventEmitter } from 'events';
import { subprocess } from '../../src/meta/subprocess.js';
import { registerMetaRoutes } from '../../src/routes/meta.js';

const mockSpawn = vi.mocked(subprocess.spawn);

function createMockProcess(exitCode: number, stdout: string, stderr = '') {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = {
    write: vi.fn(),
    // Emit events only after stdin.end() — by then all listeners are attached
    end: vi.fn().mockImplementation(() => {
      setImmediate(() => {
        if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
        if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
        proc.emit('close', exitCode);
      });
    }),
  };
  return proc;
}

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify({ logger: false });
  registerMetaRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mockSpawn.mockReset();
});

describe('POST /meta', () => {
  it('returns 400 when message is missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/meta', body: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'message required' });
  });

  it('returns 200 with trimmed response from subprocess', async () => {
    mockSpawn.mockReturnValueOnce(createMockProcess(0, '  Hello from claude  \n') as any);

    const res = await app.inject({
      method: 'POST',
      url: '/meta',
      body: { message: 'create a workflow' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ response: 'Hello from claude' });
  });

  it('includes repoPath as an --add-dir argument', async () => {
    mockSpawn.mockReturnValueOnce(createMockProcess(0, 'ok') as any);

    await app.inject({
      method: 'POST',
      url: '/meta',
      body: { message: 'hello', repoPath: '/tmp/my-repo' },
    });

    const args = mockSpawn.mock.calls[0][1] as string[];
    const addDirValues = args
      .map((a, i) => (a === '--add-dir' ? args[i + 1] : null))
      .filter(Boolean);
    expect(addDirValues).toContain('/tmp/my-repo');
  });

  it('writes the full message to stdin', async () => {
    const proc = createMockProcess(0, 'done') as any;
    mockSpawn.mockReturnValueOnce(proc);

    await app.inject({
      method: 'POST',
      url: '/meta',
      body: { message: 'test message' },
    });

    expect(proc.stdin.write).toHaveBeenCalled();
    const written: string = proc.stdin.write.mock.calls[0][0];
    expect(written).toContain('test message');
  });

  it('returns 500 when subprocess exits with non-zero code', async () => {
    mockSpawn.mockReturnValueOnce(createMockProcess(1, '', 'auth error') as any);

    const res = await app.inject({
      method: 'POST',
      url: '/meta',
      body: { message: 'hello' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'Meta-Claude failed' });
  });
});

describe('GET /meta/history', () => {
  it('returns an array', async () => {
    const res = await app.inject({ method: 'GET', url: '/meta/history' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe('DELETE /meta/history', () => {
  it('returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/meta/history' });
    expect(res.statusCode).toBe(204);
  });
});
