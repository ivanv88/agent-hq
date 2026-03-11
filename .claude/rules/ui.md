---
paths:
  - "packages/ui/**"
---

# UI Rules

Full patterns and code examples: `ai-docs/ui-best-practices.md`. These rules are mandatory — no exceptions unless instructed so.

## Design Tokens

- Always use token classes (`bg-surface-*`, `text-text-*`, `border-border-*`, `text-accent-*`, `status-*`) — never raw hex values
- Never use inline `style={{ color: '#...' }}` or `style={{ background: '#...' }}` for anything covered by a token
- Pair adjacent surface tiers: a modal (`surface-raised`) uses `surface-overlay` buttons; don't skip tiers without reason
- Status colors always used as fg+bg pairs (e.g. `status-working` + `status-working-bg`)

## Styling

- Tailwind utility classes first for all spacing, color, typography, layout, transitions
- Inline styles only for CSS functions Tailwind cannot express at compile time (e.g. `color-mix()`)
- Interactive states (hover, focus, disabled, active) handled via Tailwind variants — not JS event handlers
- Transitions: `duration-100` for hover/color changes on interactive elements

## Component Patterns

- All primitive components wrapping a native HTML element use `forwardRef` + set `displayName`
- Props interfaces extend the native HTML element's attribute interface (`React.ButtonHTMLAttributes<HTMLButtonElement>`, etc.)
- Visual variants use a typed `variant` prop backed by a `Record<Variant, string>` lookup — no scattered ternaries or conditional class logic
- Internal sub-components that don't need exporting are plain functions in the same file

## Hook Patterns

- Each hook owns one slice of state — hooks do not reach into each other's state
- State hydrated from REST on mount, then updated incrementally via WebSocket events — no polling
- Callbacks that may change identity on every render are stored in a ref to avoid stale closures
- Document-level listeners (click-outside, keydown) always return a cleanup function from `useEffect`

## Modals

- All modals compose `ModalOverlay` — never re-implement backdrop, escape-to-close, or click-outside
- Modal chrome uses `ModalHeader` + `ModalFooter` — not custom implementations per modal

## Form Fields

- Never render a raw `<input>` or `<textarea>` with a label beside it — always use `FormField` or `FormTextarea`
- Standalone label elements import `labelClassName` from `FormField.tsx` instead of duplicating the class string

## Status Rendering

- Use `<StatusIndicator>` for rendering status in context
- Use `getStatusColor()` / `getStatusLabel()` / `isActiveStatus()` for programmatic access
- Use `.status-${task.status}` CSS classes for applying status color to arbitrary elements
