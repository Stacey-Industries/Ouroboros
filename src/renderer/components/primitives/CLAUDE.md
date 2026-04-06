<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The barrel (`index.ts`) re-exports both component implementations and their prop types together — this is the React ecosystem's standard pattern for keeping consumers from needing to know internal file structure. It also means renaming `Button.tsx` to `ButtonBase.tsx` only requires updating the barrel, not every consumer.
`─────────────────────────────────────────────────`

Generated `src/renderer/components/primitives/CLAUDE.md`. Key things captured:

- The **variant lookup table pattern** (`Record<Variant, string>`) used consistently across all components — and why it's better than ternaries (exhaustive at compile time)
- The `danger` button's **hardcoded rgba exception** — the one color token gap
- `Dropdown`'s **stateless open/close** — parent owns state, no click-outside handling built in
- `inputSize` vs `size` naming — avoids clobbering the native HTML attribute
- `Surface`'s polymorphic `as` prop
- React 19 ref-as-prop pattern (no `forwardRef` needed)
- Barrel import convention
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# Primitives — Unstyled-to-Tokenized Component Layer

Stateless, zero-logic UI building blocks. Every component is a thin wrapper that maps typed variant/size props to design-token Tailwind classes. No hooks, no side effects, no state.

## Key Files

| File | Role |
|---|---|
| `types.ts` | Union types for all variant/size props (`ButtonVariant`, `SurfaceLevel`, etc.) |
| `Surface.tsx` | Semantic background container — replaces bare `<div>` with a theme-level (`base`/`panel`/`raised`/`overlay`/`inset`) |
| `Button.tsx` | Four variants (`primary`/`ghost`/`danger`/`accent-muted`), two sizes, icon mode (square padding) |
| `Badge.tsx` | Status pill — six variants mapping to status and interactive tokens, Tailwind `/20` opacity trick |
| `Card.tsx` | Bordered panel with optional `glass-card` CSS class for frosted glass effect |
| `Dropdown.tsx` | Positioned overlay container — renders `null` when `open={false}` |
| `Menu.tsx` | `<Menu>` + `<MenuItem>` pair — semantic `role="menu"` / `"listbox"` |
| `Input.tsx` | Controlled/uncontrolled input — `inputSize` prop (not `size`, avoids HTML attribute clash) |
| `TextArea.tsx` | Same token treatment as `Input`, resize-y only |
| `Divider.tsx` | `<hr>` with `border-border-subtle` |
| `index.ts` | Barrel — re-exports all components and their prop types + the shared union types |

## Patterns

**Variant lookup tables** — every component uses a `Record<Variant, string>` constant (`variantClass`, `sizeClass`, etc.) rather than inline ternaries. Adding a new variant means: add it to `types.ts`, add the entry to the record. TypeScript will error at compile time if the record is missing a key.

**`className` merging** — all components append the consumer's `className` last via `${className ?? ''}`. Consumer classes win over defaults.

**`ref` forwarding** — `Button` and `Input` declare `ref?: React.Ref<...>` in their props interface. React 19 passes refs as props, so no `forwardRef` wrapper is needed.

**`Surface` polymorphism** — the `as` prop accepts `'div' | 'section' | 'aside' | 'nav' | 'main'`, letting it render any block semantic element without wrapper proliferation.

## Gotchas

- **`danger` button uses a hardcoded rgba** — `rgba(248,81,73,0.1)` for its hover scrim. No `status-error/10` token utility exists. This is a documented exception to the no-hardcoded-colors rule.
- **`Dropdown` is headless-open-state-only** — it does not manage its own open/close state and has no click-outside handling. The parent component owns `open` and closes it.
- **`Card` glass mode** uses the `glass-card` CSS class, not inline styles — that class must be defined in `globals.css` or a theme stylesheet.
- **`Input` uses `inputSize` not `size`** — `size` is a native HTML attribute on `<input>` (character width hint). Using it would silently set the wrong thing.
- **`Menu`/`MenuItem` are plain `<div>`s** — keyboard navigation and focus management are the consumer's responsibility. These only provide visual structure.

## Relationship to Token System

All classes reference tokens from `src/renderer/styles/tokens.css` (registered in `globals.css @theme`). Never add raw hex or `rgb()` values here — use the token Tailwind utilities documented in the parent renderer `CLAUDE.md`.

## Consuming

Always import from the barrel:

```ts
import { Button, Surface, Badge } from '@renderer/components/primitives';
```

Never import directly from individual files — the barrel is the public API.
