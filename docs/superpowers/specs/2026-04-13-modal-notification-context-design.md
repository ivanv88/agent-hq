# Modal & Notification Context Refactor

**Date:** 2026-04-13  
**Status:** Approved

## Goal

Eliminate prop drilling of modal openers and `onNotify` across `AppShell → TasksPage → DetailPanel → ActionBar` by introducing two React contexts. Simultaneously apply the container/UI pattern so leaf containers own their own concerns directly.

## Motivation

- 6 modal opener callbacks drilled 3 levels deep; every new modal adds 3–4 touch points
- `onNotify` threaded through every level of the tree
- `DetailPanel` has 16 props, 12 of them callbacks
- `ActionBar` is a passive prop-receiver despite having no meaningful UI decisions to delegate upward
- Adding any new modal or task action currently requires changes in 4 files

## New Files

### `src/context/ModalContext.tsx`

Replaces `src/hooks/useModalState.ts` (deleted).

- State: `modal: ModalType | null`, `modalTask: Task | null`
- Exports: `ModalProvider`, `useModal()`
- `useModal()` returns `{ modal, modalTask, openModal(type, task?), closeModal() }`
- `ModalType` union is the same as today: `'new' | 'feedback' | 'memory' | 'commit' | 'merge' | 'mergeComplete' | 'gitInit'`

### `src/context/NotificationContext.tsx`

- State: `lastNotification: Notification | null`
- Exports: `NotificationProvider`, `useNotify()`
- `useNotify()` returns `notify(message: string, isError?: boolean)`
- `NotificationStrip` reads `lastNotification` from context instead of receiving it as a prop

Both providers wrap `AppShell`'s JSX root.

## Changed Files

### `AppShell` (`App.tsx`)

- Wraps render in `<ModalProvider><NotificationProvider>`
- Reads `useModal()` to render the active modal (replaces explicit `modal === 'x'` checks driven by `useModalState`)
- Reads notification context to supply `NotificationStrip`
- Drops all 6 modal opener props from `TasksPage` call
- Drops `onNotify` from `TasksPage` call
- `useModalState` import removed

**TasksPage call before:** 11 props  
**TasksPage call after:** 3 props (`tasks`, `activeRepo`, `modalOpen`)

### `TasksPage`

- Props interface shrinks to `{ tasks, activeRepo, modalOpen }`
- Keyboard shortcut handlers call `useModal()` directly for modal-opening actions
- Passes only `task: Task | null` to `DetailPanel`

**DetailPanel call before:** 16 props  
**DetailPanel call after:** 1 prop (`task`)

### `DetailPanel`

- Props interface: `{ task: Task | null }`
- Uses `useModal()` for any action that opens a modal
- Uses `useNotify()` for all notifications
- Workflow callbacks (`onContinue`, `onSkip`, `onRerun`) become inline `fetch` calls
- `routeCommand()` updated: modal-opening commands call `useModal()`, API commands call `fetch` directly
- `onNotify` prop and all modal opener props removed

**ActionBar call before:** ~15 props  
**ActionBar call after:** 1 prop (`task`)

### `ActionBar`

- Props interface: `{ task: Task }`
- Uses `useModal()` for all modal-opening actions
- Uses `useNotify()` for all notifications
- All fetch calls (git pull/push/rebase/stash, archive, memory snapshot) are inline
- `restartTask` logic (checks `NOT_A_GIT_REPO`, opens gitInit modal) moves here from `TasksPage`

## Deleted Files

- `src/hooks/useModalState.ts` — logic absorbed into `ModalContext`

## Prop Count Summary

| Component | Before | After |
|---|---|---|
| `TasksPage` | 11 | 3 |
| `DetailPanel` | 16 | 1 |
| `ActionBar` | ~15 | 1 |

## Future Migration

`useModal()` and `useNotify()` are the only API consumers touch. Swapping the context implementation for Zustand is a single-file change per context with zero changes to consumers.

## Testing

No new unit tests required — no new logic introduced, only restructured. Run `cd packages/ui && npx vitest run` after implementation to confirm nothing regressed. Manually verify: open each modal type, confirm notifications appear, confirm all ActionBar actions still work.
