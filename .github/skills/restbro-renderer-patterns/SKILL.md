---
name: restbro-renderer-patterns
description: 'Restbro renderer (sandboxed UI) architecture — vanilla TS "manager" classes, the document-level CustomEvent bus, nav-tab and request-tab systems, lazy initialization, React islands, and the sandbox rules. Use when adding or editing anything under src/renderer: a new tab, panel, dialog, sidebar, table, editor, keyboard shortcut, or cross-component communication. Also use when wiring a feature into src/renderer/index.ts, splitting an oversized manager, or deciding how two components should talk to each other. Prevents ipcRenderer/localStorage/fs usage in the renderer, god files, orphaned tabs, and ad-hoc global state.'
---

# Restbro — Renderer Patterns

The renderer runs with `sandbox: true`, `contextIsolation: true`,
`nodeIntegration: false`. It is a plain browser context: **no `require`, no
`fs`, no `ipcRenderer`, no Node globals.** The only capability surface is
`window.restbro.*` (see **restbro-main-process** for extending it).

There is no state framework. Coordination is:
**manager classes** + **`CustomEvent`s dispatched on `document`**.
Do not introduce Redux/Zustand/MobX/signals/an event-emitter library.

## 1. The manager class

Every feature is a class with a `constructor` that only grabs DOM refs and an
`initialize()` that does the work. Reference implementation:
[CurlToolManager.ts](../../../src/renderer/components/CurlToolManager.ts).

```ts
export class FeatureManager {
  private container: HTMLElement;
  private state: FeatureState = { /* … */ };

  constructor() {
    this.container = document.getElementById('feature-tab')!;
  }

  initialize(): void {
    this.render();              // one innerHTML template
    this.setupEventListeners(); // delegate from this.container
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="feature">
        <div class="feature__sidebar">…</div>
        <div class="feature__main">…</div>
      </div>`;
  }

  private setupEventListeners(): void { /* … */ }
}
```

Rules:

- **150–300 lines.** Past that, create `components/<feature>/` and split into
  `FeatureList.ts`, `FeatureEditor.ts`, … (see `components/mock-server/`,
  `components/collections/`, `components/request/`).
- Render once with a template string; then patch targeted nodes. Do not
  re-`innerHTML` the whole tab on every keystroke.
- Never store DOM refs captured before `render()`.
- Escape any user/response text injected into an `innerHTML` template, or build
  those nodes with `textContent` — response bodies and imported collections are
  untrusted input.
- Async work returns structured results; surface failures via `show-toast` or an
  inline error region, never `alert`.

## 2. The event bus

Cross-component communication is `document.dispatchEvent(new CustomEvent(...))`
with a kebab-case name and a `detail` object. Listeners attach on `document`.

```ts
document.dispatchEvent(
  new CustomEvent('response-received', { detail: { request, response } })
);

document.addEventListener('response-received', ((e: CustomEvent) => {
  const { request, response } = e.detail;
}) as EventListener);
```

Existing event names are catalogued in
[references/dom-events.md](./references/dom-events.md) — **reuse an existing
event before inventing one**. Emitting a duplicate-purpose event is how flows
drift apart.

Conventions:

- Name after what *happened* (`request-saved`, `collections-changed`), not what
  should happen — except for imperative bridges (`show-toast`, `switch-to-tab`,
  `open-request-in-tab`, `open-in-notepad`).
- Always dispatch on `document` (some UI is in fixed-position overlays, so
  bubbling from a container is unreliable).
- Keep `detail` serializable-ish and small; pass ids, not DOM nodes.

> **Gotcha:** `switch-to-tab` is handled only by `app-manager.ts`, which reads
> `e.detail.tab`. Send `{ tab: '<name>' }` — a `{ tabName }` payload is silently
> ignored.

## 3. Wiring into the app — `src/renderer/index.ts`

`RestbroRenderer` owns every manager. To add one:

1. Field + `new` in the constructor (DOM lookups only).
2. Call `initialize()` in `initialize()`, in dependency order:
   theme → app → tabs → collections → request → response → the rest.
   Async managers go in the existing `await Promise.all([...])`.
3. If the manager is heavy (Monaco / React / MUI), do **not** initialize eagerly
   — add it to `setupLazyTabInit()`'s `lazyMap` and expose
   `ensureInitialized()` so it boots on first `nav-tab-switched`.
4. Persisted state: read in `loadInitialState()`, write in `saveState()`.

Shared/global listeners (clipboard, zoom guard, `beforeunload`) live in
[event-listeners.ts](../../../src/renderer/event-listeners.ts), which receives
managers through a `deps` object. Native menu commands route through
[menu-action-router.ts](../../../src/renderer/components/menu-action-router.ts).

## 4. Adding a top-level nav tab

All four steps, or the tab is orphaned:

1. `src/renderer/index.html` — `<button class="nav-tab" data-tab="<name>">` in
   `.nav-tabs` (inline `ui-icon` SVG + label) **and**
   `<div id="<name>-tab" class="tab-content"></div>` in the content area.
   `AppManager.showTab()` resolves `#${tabName}-tab` by convention.
2. `src/main/modules/store-manager.ts` — add `<name>` to `defaultNavOrder` so
   fresh installs get it; existing users keep their saved order and it is
   appended by `AppManager.setNavOrder()`.
3. `src/renderer/index.ts` — construct + initialize (or lazy-init) the manager.
4. `src/renderer/styles/_<name>.scss` + `@import` in `main.scss`.

Tabs are drag-reorderable and reachable via `Cmd/Ctrl+1..9` by position — both
come free from `AppManager`; do not add per-tab shortcuts.

## 5. Request tabs (the API tab's inner tabs)

Split by responsibility — respect the split:

| File | Owns |
|---|---|
| `components/tabs-manager.ts` | public API / facade |
| `components/tabs/tabs-state-manager.ts` | tab array, active id, persistence shape |
| `components/tabs/tabs-renderer.ts` | DOM, drag-reorder, inline rename |
| `components/tabs/tabs-event-handler.ts` | reacting to app-wide events |

A `type: 'request'` collection carries **two** names — `collection.name`
(sidebar) and `collection.request.name` (tab title). Any rename/duplicate must
update both.

## 6. React islands

React + MUI is allowed **only** as an isolated island mounted by a vanilla
manager — the single precedent is `src/features/json-compare` wrapped by
`components/JsonCompareTab.ts`. Do not React-ify existing vanilla UI, and do not
add a second island without a strong reason.

## 7. Renderer checklist

- [ ] No `ipcRenderer`, `require`, `fs`, `localStorage`, `sessionStorage`, `fetch` to disk
- [ ] All I/O via `window.restbro.*`; guard optional APIs (`window.restbro?.system?.openExternal`)
- [ ] Manager under 300 lines, or split into `components/<feature>/`
- [ ] Reused an existing CustomEvent where one fits
- [ ] Registered in `index.ts`; heavy tabs lazy-initialized
- [ ] `_<feature>.scss` created **and** imported (see **restbro-ui-theming**)
- [ ] Pure logic extracted to a testable module (see **restbro-verification**)

## Maintaining this skill

Update this file in the same PR when you change `src/renderer/index.ts` (manager
list / init order / lazy map), `event-listeners.ts`, `app-manager.ts`, the
`.nav-tab` set in `index.html`, `defaultNavOrder` in `store-manager.ts`, or the
`components/tabs/*` split.

**Add or rename a `CustomEvent` → update
[references/dom-events.md](./references/dom-events.md)**, which you can diff against:

```bash
grep -rhoE "new CustomEvent\('[a-z0-9-]+'" src/renderer | sort -u
```
