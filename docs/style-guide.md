# Style Guide

Visual reference for the LACC design system. All tokens are defined in `packages/ui/src/index.css`.

---

## Typography

Single font family throughout: **IBM Plex Mono** (monospace).

| Size | Usage |
|------|-------|
| 12px | Labels, hints, badges, kbd shortcuts |
| 14px | Body text, inputs, buttons, tabs |

Labels are uppercase with `tracking-[0.08em]`. Everything else is sentence case.

---

## Color Tokens

### Surfaces — elevation scale

Use surfaces to communicate depth. Higher = more elevated.

| Token | Hex | Use |
|-------|-----|-----|
| `surface-base` | `#07070f` | Page background, deepest layer |
| `surface-raised` | `#0c0c18` | Panels, modals, cards |
| `surface-overlay` | `#111120` | Dropdowns, active items, button backgrounds |
| `surface-hover` | `#191930` | Hover state for interactive elements |
| `surface-active` | `#1e1e30` | Pressed / active state |
| `surface-inset` | `#1a1a28` | Inset areas inside a panel |

**Rule:** pair adjacent tiers — a modal (`surface-raised`) uses `surface-overlay` buttons; a page-level element uses `surface-raised` cards.

### Borders

| Token | Hex | Use |
|-------|-----|-----|
| `border-subtle` | `#0d0d18` | Barely visible dividers |
| `border-dim` | `#10101c` | Subtle separators between items |
| `border-default` | `#13131f` | Default border on most elements |
| `border-emphasis` | `#1e1e30` | Visible borders on raised surfaces, button outlines |
| `border-accent` | `#3b3b60` | Focus rings, selected state, accent borders |

### Text — emphasis scale

| Token | Hex | Use |
|-------|-----|-----|
| `text-ghost` | `#444` | Decorative, truly secondary text |
| `text-disabled` | `#555` | Placeholder, disabled state |
| `text-muted` | `#666` | Labels, secondary info |
| `text-default` | `#888` | Default body text |
| `text-body` | `#b0b0c8` | Readable paragraph text |
| `text-bright` | `#c0c0e0` | Emphasized text, active states |
| `text-heading` | `#d4d4e8` | Titles, headings |

**Rule:** don't skip more than one tier without a visual reason. `text-muted` beside `text-heading` is fine; `text-ghost` beside `text-heading` needs a deliberate intent.

### Accent

| Token | Hex | Use |
|-------|-----|-----|
| `accent-primary` | `#9898d0` | Primary actions, links, highlights |
| `accent-primary-bright` | `#6060a0` | Active tab underlines, focused borders |
| `accent-subtle` | `#3a3a56` | Subtle accent backgrounds |

### Status colors

Each status has a foreground and a background token. Always use them as a pair.

| Status | Foreground | Background |
|--------|-----------|------------|
| Working | `status-working` `#4ade80` | `status-working-bg` `#0a1f10` |
| Spawning | `status-spawning` `#a78bfa` | `status-spawning-bg` `#14102a` |
| Spinning | `status-spinning` `#fb923c` | — |
| Review | `status-review` `#f0c040` | `status-review-bg` `#2a2010` |
| Done | `status-done` `#60a5fa` | `status-done-bg` `#0a1020` |
| Failed | `status-failed` `#f87171` | `status-failed-bg` `#1f0a0a` |
| Killed | `status-killed` `#555` | — |

Use `StatusIndicator` for in-context rendering. Use `getStatusColor()` / `getStatusLabel()` for programmatic access.

---

## Spacing

No formal spacing scale is enforced yet. These values appear consistently across components — prefer them over arbitrary numbers.

| Value | Tailwind | Common use |
|-------|----------|------------|
| 2px | `gap-0.5` | Tight icon + label pairs |
| 4px | `gap-1`, `p-1` | Chip padding, badge padding |
| 6px | `gap-1.5` | Status dot + label, radio options |
| 8px | `gap-2`, `p-2` | Button icon gap, list item padding |
| 12px | `gap-3`, `px-3` | Input horizontal padding, tab padding |
| 16px | `gap-4`, `px-4` | Button horizontal padding (md) |
| 28px | `p-7` | Modal inner padding |

---

## Borders & Radius

| Shape | Value | Use |
|-------|-------|-----|
| `rounded` / `rounded-[4px]` | 4px | Buttons, inputs, dropdowns, chips |
| `rounded-lg` | 8px | Modals |
| `rounded-full` | 50% | Status dots only |

Borders are always 1px solid. No thick borders.

---

## Animations

Defined in `index.css`, applied via utility class.

| Class | Duration | Use |
|-------|----------|-----|
| `animate-pulse-opacity` | 1.6s loop | Active status dots (WORKING, SPAWNING, SPINNING) |
| `animate-fade-up` | 0.18s | Modals appearing |
| `animate-slide-in` | 0.18s | Notifications sliding in |
| `animate-shimmer` | 1s loop | Loading / skeleton states |

Keep transitions short: `duration-100` (100ms) for hover/color changes on interactive elements.

---

## Scrollbars

Globally styled to be minimal (3px, transparent track). Don't override scrollbar styles per-component.
