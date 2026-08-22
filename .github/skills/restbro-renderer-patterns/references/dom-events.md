# Restbro renderer — CustomEvent catalog

All events are dispatched on `document`. Reuse one of these before adding a new
name. Regenerate with:

```bash
grep -rhoE "new CustomEvent\('[a-z0-9-]+'" src/renderer | sort -u
```

## App shell / navigation

| Event | `detail` | Emitted by → consumed by |
|---|---|---|
| `nav-tab-switched` | `{ tab }` | `app-manager` → `index.ts` lazy init |
| `switch-to-tab` | `{ tab }` | anywhere → `app-manager` (key is `tab`, **not** `tabName`) |
| `nav-order-changed` | `{ order }` | `app-manager` → persistence |
| `theme-changed` | `{ theme }` | `theme-manager` → Monaco editors |
| `show-toast` | `{ type, message, durationMs? }` | anywhere → `toast-manager` |
| `open-history` | — | search toolbar / menu → `history-panel` |

## Collections

| Event | `detail` |
|---|---|
| `collections-changed` | `{ collections }` — triggers `saveState()` |
| `collection-renamed` | `{ collectionId, name }` |
| `collection-start-inline-rename` | `{ collectionId }` |
| `open-request-in-tab` | `{ request, collectionId }` |
| `request-saved` / `request-deleted` | `{ request }` / `{ requestId }` |
| `folder-variables-changed` | `{ collectionId }` |

## Request / response lifecycle

| Event | `detail` |
|---|---|
| `request-updated` | `{ request }` — fires on every keystroke |
| `request-sending` | `{ requestId }` |
| `response-received` | `{ request, response }` |
| `request-failed` | `{ requestId, error }` |
| `request-cancelled` / `request-cancel-trigger` | `{ requestId }` / — |
| `request-save-tab` | `{ tabId }` |
| `request-method-changed` | — |
| `request-mode-changed` / `request-mode-switched` / `request-mode-toggle-clicked` | mode payloads |
| `url-query-extracted` | `{ params }` |
| `params-editor-mutated` | — (bubbles) |
| `active-details-tab-changed` | `{ tab }` |
| `body-on-bodyless-method-toggled` | `{ enabled }` |
| `auth-inputs-rendered` / `oauth-advanced-toggled` | — |

## Response viewer

| Event | `detail` |
|---|---|
| `response-cleared` | `{ requestId }` |
| `response-view-preference-updated` | `{ … }` |
| `response-viewer-mode-changed` | `{ mode }` |
| `response-json-path-changed` | `{ path }` |
| `response-controls-state` | `{ … }` |
| `response-large-json-pretty-selected` | `{ … }` |
| `trigger-response-search` | — |
| `request-previous-responses` | `{ requestId }` |
| `display-previous-response` / `open-previous-request-response` | response payloads |

## Tabs

| Event | `detail` |
|---|---|
| `tabs-changed` | `{ tabs }` |
| `tab-changed` | `{ tabId }` |
| `tab-reorder` | `{ from, to }` |
| `tab-rename` | `{ tabId, name }` |
| `tab-closed-with-response` | `{ … }` |
| `mode-response-restored` | `{ … }` |
| `get-active-tab-data` | — (query pattern) |

## Environments

| Event | `detail` |
|---|---|
| `environment-changed` | — |
| `globals-updated` | — |
| `edit-variable-requested` | `{ name, scope }` |

## Cross-tool bridges

| Event | `detail` |
|---|---|
| `open-ask-ai` | `{ context }` |
| `open-in-notepad` | `{ text, title?, language? }` |
| `open-in-curl-tool` | `{ curlCommand }` |
| `json-compare-load` | `{ left, right, … }` |
| `loadtest-prefill-request` | request payload |
| `open-request-from-history` | `{ entry }` |
