---
name: restbro-feature-workflow
description: 'Orchestrating workflow for adding or changing ANY capability in the Restbro Electron app — new tab, new tool, new request option, new setting, new dialog, new IPC call. Use when asked to "add a feature", "build a new tab", "wire this up end to end", "add a button that does X", or when a change touches more than one process (main / preload / renderer). Enforces the required layering sequence (shared types → IPC channel → main handler → preload bridge → renderer manager → SCSS → tests) so vibe-coded features do not break the architecture, theme, or UI symmetry. Routes to restbro-main-process, restbro-renderer-patterns, restbro-ui-theming and restbro-verification for the details of each layer.'
---

# Restbro — Adding or Changing a Feature

Restbro is a sandboxed Electron app. Every feature crosses process boundaries in
**one fixed direction**. Skipping a layer is the #1 way a well-intentioned change
breaks the app. Follow the sequence below top-to-bottom, every time.

## 0. Before writing code

1. Read [AGENTS.md](../../../AGENTS.md) — the non-negotiables.
2. Find the **closest existing feature** and copy its shape. Restbro's value is
   consistency; a feature that looks/behaves unlike its neighbours is a defect.
   - Full tab with sidebar + main pane → `src/renderer/components/CurlToolManager.ts`
   - Tab with sub-components → `src/renderer/components/mock-server/`
   - Modal/dialog → `src/renderer/components/settings/settings-modal.ts`
   - Main-process service → `src/main/modules/network-speed.ts`
3. Decide whether the work is **renderer-only** (pure UI on existing data — skip
   to step 5) or **needs main-process power** (files, network, native, secrets —
   do the full sequence).

## 1. Shared contract — `src/shared/types.ts`

Add/extend the domain types first so main and renderer literally cannot drift.
Types are the only thing both `tsconfig`s share. Never duplicate a shape.

## 2. IPC channel — `src/shared/ipc.ts`

Add a constant to `IPC_CHANNELS` with a `namespace:verb-noun` value
(`mockserver:start-server`). Group it under a `// Comment` block with its siblings.

> Channels are a **whitelist**. Never build a channel name at runtime, never add
> a generic pass-through handler.

## 3. Main handler — `src/main/modules/`

Register the handler in `ipc-manager.ts`, but put the *logic* in a focused module
(`≤ 300 lines`). See **restbro-main-process** for handler shape, path approval,
secret redaction and persistence rules.

## 4. Preload bridge — `src/preload/index.ts`

Two edits, both mandatory:

- Add the channel to the **inlined `IPC_CHANNELS` copy at the top of the file**
  (preload cannot import from `src/shared` in the sandbox — the duplication is
  deliberate; forgetting it yields `undefined` channel names at runtime).
- Add a typed method under the matching `restbroAPI.<group>` object.

Group names map 1:1 to channel namespaces: `store`, `request`, `collection`,
`loadtest`, `oauth`, `files`, `import`, `collectionsState`, `jsonViewerState`,
`backups`, `system`, `menu`, `notepad`, `ai`, `mockServer`, `curl`, `update`,
`network`. Reuse an existing group before inventing one.

Main→renderer pushes return an **unsubscribe function**:

```ts
onProgress: (cb: (p: Progress) => void): (() => void) => {
  ipcRenderer.on(IPC_CHANNELS.X_PROGRESS, (_, p) => cb(p));
  return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.X_PROGRESS);
},
```

## 5. Renderer — `src/renderer/components/`

Consume via `window.restbro.<group>.<method>()` only. Never `ipcRenderer`, `fs`,
`require`, `localStorage`, or `fetch`-to-disk. See **restbro-renderer-patterns**
for the manager class shape, DOM-event bus, and nav-tab wiring.

## 6. Styles — `src/renderer/styles/`

Create `_<feature>.scss` **and** `@import` it in `main.scss` with a one-line
comment — an unimported partial silently does nothing. See **restbro-ui-theming**
for tokens, naming and spacing so the feature matches the rest of the app.

## 7. Tests + gates

Add vitest coverage for any pure logic you introduced, then run the mandatory
gates. See **restbro-verification**.

## Definition of done

- [ ] Types in `src/shared/types.ts`, channel in `src/shared/ipc.ts`
- [ ] Main logic in its own `src/main/modules/*.ts` (≤ 300 lines), registered in `ipc-manager.ts`
- [ ] Channel added to **both** the preload inline map and `restbroAPI`
- [ ] Renderer touches only `window.restbro.*`
- [ ] `_<feature>.scss` created **and** imported in `main.scss`
- [ ] Zero hardcoded colors — CSS custom properties only
- [ ] No file over its budget (main ≤ 300, renderer 150–300)
- [ ] No secret logged, rendered, or persisted in plaintext
- [ ] `npm run lint && npm run build && npm test -- run` all clean

## Red flags — stop and rethink

| Symptom | What it means |
|---|---|
| `import { ipcRenderer }` in `src/renderer/**` | Bypassing the bridge; breaks sandbox |
| `localStorage` / `sessionStorage` | Persistence must go through `StoreManager` |
| `#2563eb` / `#1a1a1a` in SCSS | Theme will break on 5 of 6 themes |
| New `<select>` without `attachThemedSelect` | Native macOS popup ignores the theme |
| `window.alert` / `confirm` / `prompt` | Use `showConfirmDialog` / `Modal` / `show-toast` |
| A new 600-line manager | Split into `components/<feature>/` sub-modules |
| New top-level dependency | Justify it; Restbro stays lean and offline |
| Editing `dist/`, `release/`, `coverage/` | Generated — never commit |

## Maintaining this skill

This skill mirrors the layering contract. Re-read and update it in the same PR if
you change: the `IPC_CHANNELS` grouping in `src/shared/ipc.ts`, the
`restbroAPI` group names in `src/preload/index.ts`, the file-size budgets, or
any rule in `AGENTS.md` §4–§6. If a step here no longer matches the code, the
code wins — fix the skill.
