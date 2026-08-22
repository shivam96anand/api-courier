---
name: restbro-ui-theming
description: 'Restbro visual design system — CSS custom-property theme tokens, SCSS partial structure, BEM class naming, spacing/radius/transition scale, and the shared UI primitives (buttons, dialogs, toasts, themed selects, icons, scrollbars, Monaco themes). Use whenever writing or reviewing SCSS/CSS or DOM markup in src/renderer, adding a new panel/modal/button/table/dropdown, styling a new tab, fixing something that "looks off", or when a change must not break the 6 app themes (teal, sky, emerald, amber, coral, magenta). Prevents hardcoded colors, unimported style partials, native macOS select popups, and layouts that break the app''s symmetry.'
---

# Restbro — UI, Theme & Visual Symmetry

Restbro ships **6 runtime themes**. `ThemeManager` (`src/renderer/utils/theme-manager.ts`)
sets `document.body[data-theme]` and overwrites four CSS custom properties at
runtime: `--primary-color`, `--primary-dark`, `--primary-light`,
`--primary-color-rgb` (plus `--json-bracket`). Everything else comes from
`_variables.scss`.

**Consequence: any hardcoded color is a bug.** It will look correct on exactly
one theme and wrong on the other five.

## 1. Tokens — use these, never raw hex

Defined in [src/renderer/styles/_variables.scss](../../../src/renderer/styles/_variables.scss).

| Purpose | Token |
|---|---|
| Brand / active / focus | `--primary-color`, `--primary-dark`, `--primary-light` |
| Brand in `rgba()` | `rgba(var(--primary-color-rgb), 0.08)` |
| Surfaces (back→front) | `--bg-primary`, `--bg-secondary`, `--bg-tertiary` |
| Text | `--text-primary`, `--text-secondary` |
| Lines / hover | `--border-color`, `--hover-color` |
| Status | `--success-color`, `--error-color`, `--warning-color`, `--accent-color` |
| Status tints | `--success-bg`, `--warning-bg`, `--bg-error`, `rgba(var(--error-color-rgb), .08)` |
| Code / metrics | `--font-mono` |
| JSON syntax | `--json-string`, `--json-number`, `--json-key`, `--json-bracket`, … |
| Load-test / status pills | `--status-success`, `--status-redirect`, `--status-client-error`, `--status-server-error` |

Only `rgba(0,0,0,…)` and `rgba(255,255,255,…)` shadows/overlays are acceptable
literals. Need a new semantic color? Add a token to `_variables.scss` — do not
inline it.

## 2. Scale — match the neighbours

- **Radius:** 4–6px inputs/rows/small buttons · 8–12px cards, panels, popovers ·
  14–16px modals & large surfaces · `999px` pills.
- **Transition:** `all 0.12s ease` (dense controls) → `all 0.2s ease` (panels).
  Never exceed `0.3s`.
- **Font size:** 11–12px meta/labels · 13px body/controls · 14px inputs ·
  13px uppercase `letter-spacing: 0.5px` section headers.
- **Padding:** 4–8px dense rows · 10–14px panel headers · 20–24px modal bodies.
- **Elevation:** overlays use `rgba(0,0,0,0.6)` + `backdrop-filter: blur(6px)`;
  modals use `box-shadow: 0 20px 60px rgba(0,0,0,0.45)`.
- **Header accent:** panel headers commonly use
  `linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.04) 0%, var(--bg-primary) 100%)`.

## 3. File layout — one partial per feature

```
src/renderer/styles/_<feature>.scss     # new file
src/renderer/styles/main.scss           # @import 'feature';  ← MANDATORY
```

`main.scss` is the only entry point. **An unimported partial compiles to
nothing and fails silently** — the most common styling mistake in this repo.
Add the import with a one-line `//` comment, in the existing thematic order.

Large features split into several partials with a shared prefix
(`_mock-server-container.scss`, `_mock-server-sidebar.scss`, …) rather than one
huge file.

## 4. Class naming

Newer features use BEM with the feature as the block:

```scss
.curl-tool { }
.curl-tool__sidebar { }
.curl-tool__action-btn--primary { }
```

Older areas use flat kebab-case (`.request-line`, `.method-badge`). **Match the
file you are editing**; use BEM for anything new. Never use utility-class soup,
Tailwind, CSS-in-JS, or inline `style=` for anything themable.

## 5. Reuse the primitives — don't rebuild them

| Need | Use | Where |
|---|---|---|
| Confirmation | `showConfirmDialog({ title, message, destructive })` | `utils/confirm-dialog.ts` |
| Text prompt | `new Modal().show(title, placeholder, value)` | `utils/modal.ts` |
| Transient message | `document.dispatchEvent(new CustomEvent('show-toast', { detail: { type, message } }))` | `components/toast-manager.ts` |
| Dropdown | `attachThemedSelect(selectEl)` after populating `<option>`s | `utils/themed-select.ts` |
| Icon | `iconHtml('trash', 'ui-icon--sm')` / `createIconElement(...)` | `utils/icons.ts` |
| Button | `.btn-toolbar`, `.send-btn`, `.cancel-btn`, `.mode-segment__btn` | `_buttons.scss` |
| Scrollbars | nothing — global `::-webkit-scrollbar` already applies | `_scrollbars.scss` |

Hard rules:

- **Never** `window.alert` / `confirm` / `prompt` — they render OS chrome.
- **Every** `<select>` must get `attachThemedSelect`, or macOS draws an unthemed
  native popup.
- **Never** set `scrollbar-width` — it disables the app-wide webkit scrollbar
  styling on newer Chromium.
- Inline SVG uses `class="ui-icon"` with `stroke="currentColor"`, `fill="none"`;
  size via `--sm` / `--lg` / `--xl` modifiers, not hardcoded `width`.

## 6. Monaco editors

Monaco does not read CSS variables. Editors define a theme from the live token
values and **must re-apply it on theme change**:

```ts
document.addEventListener('theme-changed', () => this.updateMonacoTheme());
```

- Read the current color with
  `getComputedStyle(document.documentElement).getPropertyValue('--primary-color')`.
- `monaco.editor.setTheme()` is **global** — it affects every editor. Register
  one shared theme (`restbro-json` includes XML token rules for exactly this
  reason) instead of calling `setTheme` per editor. See
  `MonacoXmlEditor.applyTheme()` for the non-clobbering pattern.
- Always set `scrollbarSlider.background/hoverBackground/activeBackground` so
  Monaco's sliders match the native ones.

## 7. Layout & flow conventions

- Tab panels are `#<name>-tab.tab-content`; only the active one has `.active`.
- Feature shells follow **sidebar (200–260px, `--bg-primary`, right border) +
  flexible main pane**, both `height: 100%`, `overflow: hidden`, with scrolling
  pushed to the innermost list/body.
- Empty states are centered, `--text-secondary`, ~12px, `opacity: 0.6`.
- Resizable splits go through `resizeManager` (`utils/resize-manager.ts`), not
  ad-hoc mouse handlers.
- Respect the `layoutMode` setting (`horizontal` / `vertical`) for request/response splits.

## 8. Self-check before finishing

```bash
# should print nothing
grep -nE '#[0-9a-fA-F]{3,8}\b' src/renderer/styles/_<feature>.scss | grep -v 'rgba\|000\|fff'
grep -n "feature" src/renderer/styles/main.scss   # must show the @import
```

Then switch through all 6 themes (theme button in the header) and confirm the
feature reads correctly on each.

## Maintaining this skill

Update this file in the same PR when you change `_variables.scss` tokens, the
theme list in `utils/theme-manager.ts` (also mirrored in main's
`menu-manager.ts` `THEME_NAMES`), the shared primitives in `utils/` and
`toast-manager.ts`, the `IconName` union in `utils/icons.ts`, or the button
classes in `_buttons.scss`. If the token table or theme names here drift from
the code, the code wins — fix the skill.
