# UI Design Tokens — TODO

## Status

✅ **Phase 1 Complete**: Tailwind v4 `@theme` block added with semantic tokens. High-priority components migrated.

## Token System

Using Tailwind v4's `@theme` directive in `index.css`. Tokens auto-generate utilities like `bg-surface-overlay`, `text-text-muted`, `border-border-default`.

### Available Tokens

| Category | Tokens |
|----------|--------|
| **Surface** | `surface-base`, `surface-raised`, `surface-overlay`, `surface-hover`, `surface-active`, `surface-inset` |
| **Border** | `border-subtle`, `border-dim`, `border-default`, `border-emphasis`, `border-accent` |
| **Text** | `text-ghost`, `text-disabled`, `text-muted`, `text-default`, `text-body`, `text-bright`, `text-heading` |
| **Accent** | `accent-primary`, `accent-primary-bright`, `accent-subtle` |
| **Status** | `status-working`, `status-spawning`, `status-spinning`, `status-review`, `status-done`, `status-failed`, `status-killed` + `-bg` variants |

### Usage Pattern

```tsx
// Tailwind classes (preferred)
className="bg-surface-overlay text-text-bright border-border-emphasis"

// CSS variables for inline styles
style={{ color: 'var(--color-status-working)' }}
```

## Files Updated

### High priority (✅ complete)
- [x] `components/ui/ChipButton.tsx`
- [x] `components/ui/StatusIndicator.tsx`
- [x] `components/TaskList.tsx`
- [x] `components/ui/Button.tsx`
- [x] `components/ui/Tabs.tsx`
- [x] `components/ui/Input.tsx`
- [x] `components/ui/Modal.tsx`
- [x] `components/ui/ModalOverlay.tsx`

### Medium priority
- [ ] `components/ui/Select.tsx`
- [ ] `components/ui/Dropdown.tsx`
- [ ] `components/ui/RadioGroup.tsx`
- [ ] `components/DetailPanel.tsx`
- [ ] `components/ActionBar.tsx`

### Lower priority (modals)
- [ ] `modals/NewTaskModal.tsx`
- [ ] `modals/SettingsModal.tsx`
- [ ] `modals/FeedbackModal.tsx`
- [ ] `modals/MemoryModal.tsx`

## Notes

- Status colors kept as `--c-*` CSS variables for backward compat with existing JS/CSS
- `@theme` tokens reference hex values; `:root` vars now reference `@theme` tokens
- `color-mix()` used for hover states in Button.tsx (modern CSS, good browser support)
