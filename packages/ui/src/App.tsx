import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import type { WsEvent, SpawnTaskInput } from '@lacc/shared';
import { useWebSocket } from './hooks/useWebSocket.js';
import { usePool } from './hooks/usePool.js';
import { useTasks } from './hooks/useTasks.js';
import { useConfig } from './hooks/useConfig.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useRepoPaths } from './hooks/useRepoPaths.js';
import { useSessionCost } from './hooks/useSessionCost.js';
import { ModalProvider, useModal } from './context/ModalContext.js';
import { NotificationProvider } from './context/NotificationContext.js';
import { TopBar } from './components/TopBar.js';
import { NavRail } from './components/NavRail.js';
import { NotificationStrip } from './components/NotificationStrip.js';
import { NewTaskModal } from './modals/NewTaskModal.js';
import { FeedbackModal } from './modals/FeedbackModal.js';
import { MemoryModal } from './modals/MemoryModal.js';
import { GitInitModal } from './modals/GitInitModal.js';
import { CommitModal } from './modals/CommitModal.js';
import { MergeModal } from './modals/MergeModal.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { TasksPage } from './pages/TasksPage.js';
import { KanbanPage } from './pages/KanbanPage.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export function App() {
  return (
    <ModalProvider>
      <NotificationProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </NotificationProvider>
    </ModalProvider>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isTasksPage = location.pathname === '/tasks' || location.pathname === '/';

  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  const { repoPaths, activeRepo, setActiveRepo, addRepo, removeRepo } = useRepoPaths();
  const sessionUsage = useSessionCost(lastEvent);
  const { modal, modalTask, openNew, closeModal } = useModal();

  const { tasks, handleWsEvent } = useTasks();

  const onWsEvent = useCallback((event: WsEvent) => {
    handleWsEvent(event);
    setLastEvent(event);
  }, [handleWsEvent]);

  useWebSocket(onWsEvent);
  const pool = usePool(lastEvent);
  const { config, loading: configLoading, save: saveConfig } = useConfig();

  const spawnTask = useCallback(async (input: SpawnTaskInput) => {
    const res = await fetch('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw data;
  }, []);

  const onGitInitConfirm = useCallback(async () => {
    if (!modalTask) return;
    const task = modalTask;
    await fetch('/fs/git-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: task.repoPath }),
    });
    closeModal();
    await fetch(`/tasks/${task.id}/restart`, { method: 'POST' });
  }, [modalTask, closeModal]);

  const goToSettings = useCallback(() => navigate('/settings'), [navigate]);

  useKeyboardShortcuts({
    disabled: modal !== null,
    onNew: openNew,
    onSettings: goToSettings,
    onNextTask: () => {},
    onPrevTask: () => {},
    onTabTerminal: () => {},
    onTabDiff: () => {},
    onTabPreview: () => {},
    onComplete: () => {},
    onDiscard: () => {},
    onFeedback: () => {},
    onOpenEditor: () => {},
    onOpenBrowser: () => {},
    onKill: () => {},
    onPause: () => {},
    onResume: () => {},
    onRestart: () => {},
  });

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        pool={pool}
        sessionCost={sessionUsage.costUsd}
        sessionTokens={sessionUsage.sessionTokens}
        weeklyTokens={sessionUsage.weeklyTokens}
        sessionTokenLimit={sessionUsage.sessionTokenLimit}
        weeklyTokenLimit={sessionUsage.weeklyTokenLimit}
        hasApiKey={config?.hasApiKey ?? false}
        repoPaths={repoPaths}
        activeRepo={activeRepo}
        onRepoSelect={setActiveRepo}
        onAddRepo={addRepo}
        onRemoveRepo={removeRepo}
        onNew={openNew}
        rateLimitRetryAfter={
          tasks
            .filter(t => t.status === 'RATE_LIMITED' && t.rateLimitRetryAfter != null)
            .reduce<number | null>((min, t) =>
              min === null || t.rateLimitRetryAfter! < min ? t.rateLimitRetryAfter! : min
            , null)
        }
      />

      <div className="flex flex-1 min-h-0">
        <NavRail />

        <div className={isTasksPage ? 'flex flex-1 min-h-0' : 'hidden'}>
          <TasksPage
            tasks={tasks}
            activeRepo={activeRepo}
            modalOpen={modal !== null || !isTasksPage}
          />
        </div>

        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={null} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/kanban" element={<KanbanPage />} />
          <Route path="/library" element={<LibraryPage activeRepo={activeRepo} />} />
          <Route path="/settings" element={<SettingsPage config={config} configLoading={configLoading} onSave={saveConfig} />} />
        </Routes>
      </div>

      <NotificationStrip />

      {modal === 'new' && (
        <NewTaskModal
          onClose={closeModal}
          onSubmit={spawnTask}
          repoPaths={repoPaths}
          activeRepo={activeRepo}
        />
      )}
      {modal === 'feedback' && modalTask && (
        <FeedbackModal
          task={modalTask}
          onClose={closeModal}
          onSubmit={async feedback => {
            await fetch(`/tasks/${modalTask.id}/feedback`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ feedback }),
            });
          }}
        />
      )}
      {modal === 'memory' && modalTask && (
        <MemoryModal task={modalTask} onClose={closeModal} />
      )}
      {modal === 'commit' && modalTask && (
        <CommitModal task={modalTask} onClose={closeModal} />
      )}
      {modal === 'merge' && modalTask && (
        <MergeModal task={modalTask} onClose={closeModal} />
      )}
      {modal === 'mergeComplete' && modalTask && (
        <MergeModal task={modalTask} onClose={closeModal} completeOnMerge />
      )}
      {modal === 'gitInit' && modalTask && (
        <GitInitModal task={modalTask} onConfirm={onGitInitConfirm} onClose={closeModal} />
      )}
    </div>
  );
}
