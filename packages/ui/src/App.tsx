import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import type { WsEvent, SpawnTaskInput, Notification } from '@lacc/shared';
import { useWebSocket } from './hooks/useWebSocket.js';
import { usePool } from './hooks/usePool.js';
import { useTasks } from './hooks/useTasks.js';
import { useConfig } from './hooks/useConfig.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useRepoPaths } from './hooks/useRepoPaths.js';
import { useSessionCost } from './hooks/useSessionCost.js';
import { useModalState } from './hooks/useModalState.js';
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
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isTasksPage = location.pathname === '/tasks' || location.pathname === '/';

  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const [lastNotification, setLastNotification] = useState<Notification | null>(null);

  const { repoPaths, activeRepo, setActiveRepo, addRepo, removeRepo } = useRepoPaths();
  const sessionCost = useSessionCost(lastEvent);
  const {
    modal, modalTask,
    openNew, openFeedback, openMemory, openCommit, openMerge, openMergeComplete, openGitInit,
    close,
  } = useModalState();

  const { tasks, handleWsEvent } = useTasks();

  const onWsEvent = useCallback((event: WsEvent) => {
    handleWsEvent(event);
    setLastEvent(event);
    if (event.type === 'NOTIFICATION') setLastNotification(event.notification);
  }, [handleWsEvent]);

  useWebSocket(onWsEvent);
  const pool = usePool(lastEvent);
  const { config, loading: configLoading, save: saveConfig } = useConfig();

  const apiAction = useCallback(async (path: string, method = 'POST', body?: unknown) => {
    await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  }, []);

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
    close();
    await fetch(`/tasks/${task.id}/restart`, { method: 'POST' });
  }, [modalTask, close]);

  const goToSettings = useCallback(() => navigate('/settings'), [navigate]);

  // Global shortcuts: new task + settings navigation
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
        sessionCost={sessionCost}
        repoPaths={repoPaths}
        activeRepo={activeRepo}
        onRepoSelect={setActiveRepo}
        onAddRepo={addRepo}
        onRemoveRepo={removeRepo}
        onNew={openNew}

        rateLimitRetryAfter={null}
      />

      <div className="flex flex-1 min-h-0">
        <NavRail />

        {/*
          TasksPage is always mounted so the Terminal (xterm canvas + SSE connection)
          survives route changes. Visibility is toggled with CSS only — no unmount.
          Keyboard shortcuts are disabled when hidden via modalOpen.
        */}
        <div className={isTasksPage ? 'flex flex-1 min-h-0' : 'hidden'}>
          <TasksPage
            tasks={tasks}
            activeRepo={activeRepo}
            modalOpen={modal !== null || !isTasksPage}
            openFeedback={openFeedback}
            openMemory={openMemory}
            openCommit={openCommit}
            openMerge={openMerge}
            openMergeComplete={openMergeComplete}
            openGitInit={openGitInit}
            apiAction={apiAction}
          />
        </div>

        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={null} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/kanban" element={<KanbanPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage config={config} configLoading={configLoading} onSave={saveConfig} />} />
        </Routes>
      </div>

      <NotificationStrip
        newNotification={lastNotification}
        onSelectTask={() => {}}
      />

      {modal === 'new' && (
        <NewTaskModal
          onClose={close}
          onSubmit={spawnTask}
          repoPaths={repoPaths}
          activeRepo={activeRepo}
        />
      )}
      {modal === 'feedback' && modalTask && (
        <FeedbackModal
          task={modalTask}
          onClose={close}
          onSubmit={async feedback => {
            await apiAction(`/tasks/${modalTask.id}/feedback`, 'POST', { feedback });
          }}
        />
      )}
      {modal === 'memory' && modalTask && (
        <MemoryModal task={modalTask} onClose={close} />
      )}
      {modal === 'commit' && modalTask && (
        <CommitModal task={modalTask} onClose={close} />
      )}
      {modal === 'merge' && modalTask && (
        <MergeModal task={modalTask} onClose={close} />
      )}
      {modal === 'mergeComplete' && modalTask && (
        <MergeModal task={modalTask} onClose={close} completeOnMerge />
      )}
      {modal === 'gitInit' && modalTask && (
        <GitInitModal task={modalTask} onConfirm={onGitInitConfirm} onClose={close} />
      )}
    </div>
  );
}
