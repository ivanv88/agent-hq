const post = (path: string) => fetch(path, { method: 'POST' });
const del  = (path: string) => fetch(path, { method: 'DELETE' });
const postJson = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const taskService = {
  restart:          (id: string) => post(`/tasks/${id}/restart`),
  discard:          (id: string) => post(`/tasks/${id}/discard`),
  kill:             (id: string) => del(`/tasks/${id}`),
  pause:            (id: string) => post(`/tasks/${id}/pause`),
  resume:           (id: string) => post(`/tasks/${id}/resume`),
  openEditor:       (id: string) => post(`/tasks/${id}/open-editor`),
  compact:          (id: string) => post(`/tasks/${id}/compact`),
  checkpoint:       (id: string) => post(`/tasks/${id}/checkpoint`),
  feedback:         (id: string, text: string) => postJson(`/tasks/${id}/feedback`, { feedback: text }),
  workflowContinue: (id: string, context?: string) => postJson(`/tasks/${id}/stage/continue`, { context }),
  workflowSkip:     (id: string) => post(`/tasks/${id}/stage/skip`),
  workflowRerun:    (id: string) => post(`/tasks/${id}/stage/rerun`),
  gitPull:          (id: string) => post(`/api/tasks/${id}/git/pull`),
  gitPush:          (id: string) => post(`/api/tasks/${id}/git/push`),
  gitRebase:        (id: string) => post(`/api/tasks/${id}/git/rebase`),
  gitStash:         (id: string) => post(`/api/tasks/${id}/git/stash`),
  saveMemory:       (id: string) => post(`/api/tasks/${id}/memory-snapshot`),
  archive:          (id: string, level: 'archived' | 'summary' | 'deleted') =>
                      postJson(`/api/tasks/${id}/archive`, { level }),
  getMemory:        (id: string) => fetch(`/api/tasks/${id}/memory`),
  gitInit:          (path: string) => postJson('/fs/git-init', { path }),
};
