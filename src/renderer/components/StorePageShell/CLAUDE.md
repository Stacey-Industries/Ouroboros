<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
This is a shared layout primitive — not a feature component. It exists solely so `McpStorePage` and `ExtensionStorePage` don't duplicate their header + tab bar structure. The style separation into `storePageShellStyles.ts` is intentional: it keeps the component file under the 300-line ESLint limit and makes the style objects individually importable (useful for the `tabStyle` function which takes a parameter).
`─────────────────────────────────────────────────`

# StorePageShell — Shared Store Layout Shell

Reusable tabbed-page layout primitive shared by `ExtensionStore` and `McpStore`. Renders a fixed header (title + subtitle + optional Refresh button), a Browse/Installed tab bar, and a scrollable content area.

## Key Files

| File | Role |
|---|---|
| `StorePageShell.tsx` | Shell component + private `ShellHeader` and `ShellTabBar` sub-components |
| `storePageShellStyles.ts` | All `React.CSSProperties` objects (and `tabStyle` factory function) isolated here |
| `index.ts` | Barrel — re-exports `StorePageShell`, `StorePageShellProps`, `StoreTab` |

## API

```ts
<StorePageShell
  title="Extensions"
  subtitle="Browse and install extensions"
  activeTab={activeTab}           // 'browse' | 'installed'
  onTabChange={setActiveTab}
  onRefresh={handleRefresh}       // optional — omit to hide Refresh button
>
  {/* page content renders in scrollable area */}
</StorePageShell>
```

`StoreTab = 'browse' | 'installed'` — the only two tabs; not extensible by design.

## Style Architecture

Styles are extracted to `storePageShellStyles.ts` rather than inlined — keeps the component file readable and under the 300-line ESLint limit. The `tabStyle(isActive: boolean)` export is a factory function (not a constant) because active/inactive state affects `fontWeight` and the bottom-border indicator.

Inline `style={{}}` props use CSS custom properties (`var(--border-default)`, `var(--interactive-accent)`, `var(--surface-raised)`) — never raw hex or `rgb()`. Tailwind token classes (`bg-surface-base`, `text-text-semantic-primary`, etc.) are used on elements where a class suffices.

## Consumers

| Component | Location |
|---|---|
| `ExtensionStorePage` | `src/renderer/components/ExtensionStore/ExtensionStorePage.tsx` |
| `McpStorePage` | `src/renderer/components/McpStore/McpStorePage.tsx` |

Both consumers own their own `activeTab` state and pass it down — this shell is stateless.

## Gotcha

`contentScrollStyle` sets `flex: 1; minHeight: 0` — the `minHeight: 0` is required for flex overflow scrolling to work correctly. Removing it causes the content area to expand past the container instead of scrolling.
<!-- claude-md-auto:end -->
