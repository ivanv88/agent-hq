# UI Best Practices

Guidelines extracted from clean, maintainable patterns in `packages/ui/src/`.

---

## 1. Design Tokens

All design tokens are defined in `packages/ui/src/index.css` under `@theme {}`. Tailwind v4 exposes them as utility classes automatically — no additional configuration needed.

### Token hierarchy

| Category | Token prefix | Example values |
|----------|-------------|----------------|
| Surface (backgrounds) | `surface-*` | `surface-base`, `surface-raised`, `surface-overlay`, `surface-hover`, `surface-active`, `surface-inset` |
| Border | `border-*` | `border-subtle`, `border-dim`, `border-default`, `border-emphasis`, `border-accent` |
| Text | `text-*` | `text-ghost`, `text-disabled`, `text-muted`, `text-default`, `text-body`, `text-bright`, `text-heading` |
| Accent | `accent-*` | `accent-primary`, `accent-primary-bright`, `accent-subtle` |
| Status | `status-*` | `status-working`, `status-review`, `status-failed`, … (and matching `-bg` variants) |

### Usage

Always reference tokens by name, never by raw hex value:

```tsx
// Good
<div className="bg-surface-raised border border-border-emphasis text-text-body" />

// Bad — hardcodes a value that bypasses the token system
<div style={{ background: '#0c0c18' }} />
```

---

## 2. Styling Rule: Tailwind First

Use Tailwind utility classes as the default. This includes interactive states — let CSS handle them, not JavaScript.

```tsx
// Good — CSS handles hover natively, no event handlers
<button className="bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-bright transition-colors duration-100">
  Click me
</button>

// Bad — JS in the hot path, more code, same result
<button
  onMouseEnter={e => Object.assign(e.currentTarget.style, hoverStyle)}
  onMouseLeave={e => Object.assign(e.currentTarget.style, baseStyle)}
  style={baseStyle}
>
  Click me
</button>
```

Tailwind covers hover, focus, disabled, and active states:

```tsx
<button className="
  bg-surface-overlay text-text-default
  hover:bg-surface-active hover:text-text-heading
  focus:outline-none focus:border-border-accent
  disabled:opacity-50 disabled:cursor-not-allowed
  transition-colors duration-100
" />
```

### Exception: CSS functions Tailwind cannot express

Use inline styles only when you need a CSS function that Tailwind cannot represent at compile time, such as `color-mix()`:

```tsx
// Acceptable — color-mix() cannot be a static Tailwind class
<button
  style={{
    background: 'color-mix(in srgb, var(--color-status-working-bg) 80%, var(--color-status-working) 20%)',
    border: '1px solid color-mix(in srgb, var(--color-status-working) 27%, transparent)',
  }}
/>
```

Everything else — spacing, color, typography, transitions, layout — uses Tailwind.

---

## 3. Component Patterns

### forwardRef on all primitive UI components

Any component that wraps a native HTML element must use `forwardRef` and set `displayName`. This allows consumers to pass refs and makes components readable in DevTools.

```tsx
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={`${inputClassName} ${className ?? ''}`} {...props} />
  )
);

Input.displayName = 'Input';
```

### Extend native element attributes

UI components should extend the HTML element's own attribute interface, not define a bespoke prop list. This gives consumers access to all native props (`id`, `aria-*`, `data-*`, `onFocus`, etc.) for free.

```tsx
// Good — consumers can pass any <button> attribute
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Bad — manually lists props, misses native attributes
interface ButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}
```

### Variant prop for visual modes

When a component has distinct visual modes, model them with a typed `variant` prop backed by a lookup object. Avoid branching logic spread across the render.

```tsx
type ButtonVariant = 'ghost' | 'primary' | 'success' | 'danger' | 'warning' | 'link';

const variantClasses: Record<ButtonVariant, string> = {
  ghost:   'bg-surface-overlay border border-border-emphasis text-text-default hover:bg-surface-active',
  primary: 'bg-surface-overlay border border-border-accent text-accent-primary font-semibold hover:bg-surface-hover',
  success: 'bg-status-working-bg border text-status-working font-semibold',
  // ...
};

// Consumed cleanly
<button className={`${baseClasses} ${variantClasses[variant]}`} />
```

Tabs, RadioGroup, and TabBadge follow the same pattern with their own `variant` props.

### Private sub-components

When a component has internal pieces that don't need to be exported, define them as plain functions in the same file. This keeps the module surface small and the logic co-located.

```tsx
// Internal — not exported
function SelectItem({ option, selected, onClick }: { ... }) { ... }

// Public
export function Select({ value, onChange, options }: SelectProps) {
  return (
    <div>
      {options.map(o => <SelectItem key={o.value} option={o} selected={...} onClick={...} />)}
    </div>
  );
}
```

---

## 4. Hook Patterns

### Single responsibility

Each hook owns one slice of state. Hooks do not reach into each other's state — they communicate through the `WsEvent` interface passed from `App`.

```
useWebSocket  →  delivers WsEvent to App
App           →  passes WsEvent down to:
  useTasks(wsEvent)   →  owns task list state
  usePool(wsEvent)    →  owns pool state
```

### Event-driven state updates (no polling)

Hooks hydrate initial state from a REST fetch, then apply incremental WebSocket events. This avoids polling loops and keeps state minimal.

```ts
export function useTasks(wsEvent: WsEvent | null) {
  const [tasks, setTasks] = useState<Task[]>([]);

  // Initial load
  useEffect(() => {
    fetch('/tasks').then(r => r.json()).then(setTasks).catch(console.error);
  }, []);

  // Incremental updates
  useEffect(() => {
    if (!wsEvent) return;
    if (wsEvent.type === 'TASK_CREATED') {
      setTasks(prev => prev.some(t => t.id === wsEvent.task.id) ? prev : [wsEvent.task, ...prev]);
    } else if (wsEvent.type === 'TASK_UPDATED') {
      setTasks(prev => prev.map(t => t.id === wsEvent.task.id ? wsEvent.task : t));
    }
  }, [wsEvent]);
}
```

### Stable callback ref (avoiding stale closures)

When a hook accepts a callback that may change identity on every render (e.g. an inline function), store it in a ref. This lets the internal implementation stay stable without requiring the caller to memoize.

```ts
export function useWebSocket(onEvent: Dispatcher) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;  // always current, never stale

  const connect = useCallback(() => {
    ws.onmessage = (evt) => {
      // Reads from ref — always calls the latest version
      onEventRef.current(JSON.parse(evt.data));
    };
  }, []); // stable — no dependency on onEvent
}
```

### Click-outside with proper cleanup

Use `useEffect` to attach document-level listeners when a dropdown/popover is open. Always return a cleanup function.

```ts
useEffect(() => {
  if (!open) return;
  const clickHandler = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  };
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  };
  document.addEventListener('mousedown', clickHandler);
  document.addEventListener('keydown', keyHandler, true);
  return () => {
    document.removeEventListener('mousedown', clickHandler);
    document.removeEventListener('keydown', keyHandler, true);
  };
}, [open]);
```

---

## 5. Modal Pattern

### ModalOverlay handles all backdrop behavior

Escape-to-close and click-outside are wired once in `ModalOverlay`. Individual modals never re-implement these.

```tsx
// ModalOverlay.tsx — owns backdrop behavior
export function ModalOverlay({ children, onClose }: ModalOverlayProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="animate-fade-up w-full max-w-2xl ...">
        {children}
      </div>
    </div>
  );
}

// A modal — just wraps ModalOverlay
export function NewTaskModal({ onClose, onSubmit }: Props) {
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="New Task" />
      {/* content */}
      <ModalFooter onCancel={onClose} onPrimary={handleSubmit} />
    </ModalOverlay>
  );
}
```

### ModalHeader + ModalFooter composition

Modals compose `ModalHeader` (title, optional subtitle, optional tab strip) and `ModalFooter` (cancel + primary button with loading/success states) rather than re-implementing chrome each time.

---

## 6. Status Rendering

### Export component and helper functions together

`StatusIndicator` exposes both a ready-to-render component and bare helper functions for cases where a component is overkill (e.g. computing a color for a canvas or a tooltip string).

```tsx
// Component — renders dot + label
<StatusIndicator status={task.status} />

// Helpers — for programmatic access
const color = getStatusColor(task.status);
const label = getStatusLabel(task.status);
const pulsing = isActiveStatus(task.status);
```

The underlying maps (`STATUS_COLORS`, `STATUS_LABELS`, `PULSE_STATUSES`) are also exported for direct access when needed.

### Status CSS classes for dynamic application

For cases where status is applied to arbitrary elements (e.g. a list row), global CSS classes are defined in `index.css`:

```css
.status-WORKING         { color: var(--c-working); }
.status-AWAITING_REVIEW { color: var(--c-review); }
/* etc. */
```

Applied in TSX as:

```tsx
<span className={`status-${task.status}`}>{task.status}</span>
```

---

## 7. Form Fields

### FormField / FormTextarea compose label + input + hint/error

Never render a raw `<input>` with a label beside it. Use `FormField` or `FormTextarea`, which handle label, hint text, and error state consistently.

```tsx
<FormField
  label="Branch"
  hint="Leave blank to auto-generate"
  error={errors.branch}
  value={branch}
  onChange={e => setBranch(e.target.value)}
/>
```

### Label style is a shared constant

The label style (`labelClassName`) is exported from `FormField.tsx` so it can be used standalone when only a label element is needed, without duplicating the class string.

```tsx
import { labelClassName } from './ui/FormField.js';

<label className={labelClassName}>Custom label</label>
```

---

## 8. Notifications

### Always use NotificationStrip — never custom banners

All ephemeral feedback (success, error, warnings) must go through `NotificationStrip`. Never add inline `<div>` banners or local state-based feedback UI inside components.

`NotificationStrip` is rendered once in `AppShell` and fed via `lastNotification` state:

```tsx
// App.tsx (AppShell)
const [lastNotification, setLastNotification] = useState<Notification | null>(null);

// Feed it to the strip
<NotificationStrip newNotification={lastNotification} onSelectTask={...} />

// Pass the setter down to components that need to notify
<TasksPage onNotify={setLastNotification} ... />
```

Components receive `onNotify: (notification: Notification) => void` as a prop and call it directly:

```tsx
// In a component
onNotify({ message: 'Pushed successfully', level: 'info' });
onNotify({ message: 'Push failed', level: 'error' });
```

The `Notification` type is:

```ts
interface Notification {
  message: string;
  level: 'info' | 'warning' | 'error';
  taskId?: string;  // optional — strip will make it clickable
}
```

### Do not use local feedback state

This pattern is forbidden:

```tsx
// BAD — do not do this
const [feedback, setFeedback] = useState<string | null>(null);
// ...
{feedback && <div className="...">{feedback}</div>}
```

Thread `onNotify` through props instead.
