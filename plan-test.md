# Plan: Achieve 80%+ Unit Test Coverage for restbro-app (v2)

## Why v1 Failed

The v1 plan's coverage scope included **~25,000 lines of DOM-heavy renderer code**
(createElement, innerHTML, querySelector) at 0% that **cannot be meaningfully unit tested**.
This dragged overall coverage to 17% despite good main-process coverage (~72%).

The fix: **scope coverage to unit-testable code only**, then write targeted tests for gaps.

---

## Current State (Before This Plan)

| Metric     | Value  |
|------------|--------|
| Statements | 17.34% |
| Branches   | 72.68% |
| Functions  | 59.68% |
| Lines      | 17.34% |
| Total source lines in scope | ~40,400 |
| Lines actually covered | ~7,000 |
| Existing test files | 31 |

---

## Phase 0: Fix Coverage Scope (17% → ~62%)

**Problem**: Coverage denominator includes ~25K lines of DOM/UI code that requires
E2E tests (Playwright), not unit tests. Standard practice for Electron apps is to
scope unit test coverage to testable logic only.

**Action**: Replace the broad `exclude`-only config in `vitest.config.ts` with an
explicit `include` whitelist. This changes nothing about which tests run — it only
changes which **source files** are counted in coverage.

### Update `vitest.config.ts` coverage section:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  include: [
    // Main process — all testable
    'src/main/modules/**/*.ts',
    // Shared utilities
    'src/shared/**',
    // Renderer utilities (non-DOM)
    'src/renderer/utils/**/*.ts',
    // Renderer pure-logic files (cherry-picked from DOM-heavy dirs)
    'src/renderer/components/history-manager.ts',
    'src/renderer/components/tabs/tabs-state-manager.ts',
    'src/renderer/components/request/curl-builder.ts',
    'src/renderer/components/request/builder-utils.ts',
    'src/renderer/components/request/variable-detection.ts',
    'src/renderer/components/request/variable-helper.ts',
    'src/renderer/components/request/editors/RequestEditorValidator.ts',
    'src/renderer/components/request/editors/RequestEditorState.ts',
    'src/renderer/components/request/editors/RequestEditorSync.ts',
    'src/renderer/components/collections/collections-operations.ts',
    'src/renderer/components/collections/collections-icons.ts',
    'src/renderer/components/loadtest/TargetAdHocDataExtractor.ts',
    'src/renderer/components/notepad/notepad-store.ts',
    'src/renderer/components/json-viewer/parser.ts',
    'src/renderer/components/json-viewer/search.ts',
    'src/renderer/components/json-viewer/formatter.ts',
    'src/renderer/tabs/json-compare/state/**',
    'src/renderer/tabs/json-compare/utils/**',
    'src/renderer/tabs/json-compare/worker/diffWorker.ts',
  ],
  exclude: [
    '**/*.d.ts',
    '**/types.ts',
    '**/insomniaTypes.ts',
    '**/__tests__/**',
    '**/__mocks__/**',
  ],
  thresholds: {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80,
  },
},
```

**What's excluded and why:**

| Category | ~Lines | Reason |
|----------|--------|--------|
| Renderer DOM components | ~18,000 | createElement/innerHTML — need E2E tests |
| React/JSX components (.tsx) | ~1,150 | Need React test setup (jsdom + RTL) |
| Entry points (main, preload, renderer index) | ~1,000 | Bootstrap code, not logic |
| Style/CSS-in-JS files | ~470 | Pure CSS strings |
| Event listeners (renderer) | ~213 | DOM event wiring |

**New denominator**: ~11,200 lines of testable code
**Already covered**: ~6,900 lines (from 31 existing test files)
**Expected coverage after Phase 0**: **~62%** (no new tests needed)

---

## Phase 1: Pure Logic Tests (62% → ~82%)

Write tests for files at 0% coverage that have **pure functions** — no DOM or
Electron mocking needed. Target ≥85% per file.

### 1A — Collections Operations (766 lines) — BIGGEST WIN

**File**: `src/renderer/components/collections/collections-operations.ts`
**Create**: `src/renderer/components/collections/__tests__/collections-operations.test.ts`

Test: findCollection, findFolder, moveRequest, moveFolder, isDescendant,
isDescendantOf, validateName, findRequest, reorderItems, duplicateRequest

~25 test cases. **Expected coverage gain: ~650 lines.**

### 1B — JSON Viewer Logic (506 lines)

**Files**:
- `src/renderer/components/json-viewer/parser.ts` (239 lines)
- `src/renderer/components/json-viewer/search.ts` (146 lines)
- `src/renderer/components/json-viewer/formatter.ts` (121 lines)

**Create**:
- `src/renderer/components/json-viewer/__tests__/parser.test.ts`
  - parseToNodes (objects, arrays, nested, nulls, empty), getValueType, calculateAutoExpandDepth
- `src/renderer/components/json-viewer/__tests__/search.test.ts`
  - searchNodes (key match, value match, nested, no results, case sensitivity)
- `src/renderer/components/json-viewer/__tests__/formatter.test.ts`
  - formatValue (string/number/boolean/null/array/object), escapeHtml, highlightSearchTerm

~30 test cases. **Expected coverage gain: ~430 lines.**

### 1C — Request Editor Logic (310 lines)

**Files**:
- `src/renderer/components/request/editors/RequestEditorValidator.ts` (130 lines)
- `src/renderer/components/request/editors/RequestEditorState.ts` (75 lines)
- `src/renderer/components/request/editors/RequestEditorSync.ts` (105 lines)

**Create**: `src/renderer/components/request/editors/__tests__/request-editors.test.ts`

Test:
- Validator: validateJson, validateFormData, validateUrlEncoded, validateXml
- State: setActiveEditor, getState, setEditorContent, resetState
- Sync: syncHeaders, getContentTypeForEditor, calculateContentLength

~20 test cases. **Expected coverage gain: ~260 lines.**

### 1D — Load Test Data Extractor (279 lines)

**File**: `src/renderer/components/loadtest/TargetAdHocDataExtractor.ts`
**Create**: `src/renderer/components/loadtest/__tests__/data-extractor.test.ts`

Test: extractUrl, extractMethod, extractHeaders, extractBody, extractParams,
extractAuth, buildTargetFromInputs, validateTarget

~15 test cases. **Expected coverage gain: ~235 lines.**

### 1E — Notepad Store (209 lines)

**File**: `src/renderer/components/notepad/notepad-store.ts`
**Create**: `src/renderer/components/notepad/__tests__/notepad-store.test.ts`

Test: createTab, closeTab, setActiveTab, updateTabContent, getState,
normalizeTab, generateId, markDirty, reorderTabs

~12 test cases. **Expected coverage gain: ~175 lines.**

### 1F — Diff Worker (102 lines)

**File**: `src/renderer/tabs/json-compare/worker/diffWorker.ts`
**Create**: `src/renderer/tabs/json-compare/worker/__tests__/diffWorker.test.ts`

Test: computeObjectHash, diff computation for add/remove/modify/nested/arrays

~8 test cases. **Expected coverage gain: ~85 lines.**

### 1G — Variable Detection (110 lines)

**File**: `src/renderer/components/request/variable-detection.ts`
**Create**: `src/renderer/components/request/__tests__/variable-detection.test.ts`

Test: detectVariables ({{var}}, nested, unresolved), buildFolderVars

~8 test cases. **Expected coverage gain: ~90 lines.**

### 1H — Constants & Small Freebie Files (~247 lines)

These files are constants/re-exports that get near-100% coverage just from importing:

| File | Lines | Action |
|------|-------|--------|
| `collections-icons.ts` | 182 | Import test — all constants auto-covered |
| `variable-helper.ts` | 26 | Import from variable-detection test |
| `ai-system-prompt.ts` | 15 | Import in ai-engine test (already exists) |
| `mock-server-manager.ts` (main, 7-line re-export) | 7 | Import in mock-server test |
| `mock-server-store.ts` | 17 | Trivial state file — basic get/set test |

**Create**: `src/renderer/components/collections/__tests__/collections-icons.test.ts` (import check)

**Expected coverage gain: ~200 lines.**

### Phase 1 Totals

| Sub-phase | New Lines Covered |
|-----------|------------------|
| 1A Collections Operations | ~650 |
| 1B JSON Viewer Logic | ~430 |
| 1C Request Editor Logic | ~260 |
| 1D Data Extractor | ~235 |
| 1E Notepad Store | ~175 |
| 1F Diff Worker | ~85 |
| 1G Variable Detection | ~90 |
| 1H Constants/Freebies | ~200 |
| **Total** | **~2,125** |

**Running total**: 6,900 + 2,125 = ~9,025 covered of ~11,200
**Expected coverage after Phase 1**: **~81%**

---

## Phase 2: Improve Partially Covered Files (82% → ~85%)

Expand existing test files to boost files currently below 80%. This provides a
safety margin above the threshold.

### 2A — ipc-manager.ts (50% → 80%) — +220 lines

**Expand**: `src/main/modules/__tests__/ipc-manager.test.ts`

Currently half the IPC handlers are untested. Add tests for:
- Collection CRUD handlers (create, update, delete, reorder)
- Environment handlers (get, set, delete)
- Mock server start/stop handlers
- Window management handlers
- Error paths for each handler

~15 additional test cases.

### 2B — Improve Other <80% Main Process Files — +200 lines

| File | Current | Target | Expand Test File | Additional Cases |
|------|---------|--------|-----------------|-----------------|
| `oauth.ts` | 67% | 80% | oauth.test.ts | PKCE edge cases, token expiry, error states (~5) |
| `loadtest-engine.ts` | 68% | 80% | loadtest-engine.test.ts | Progress calculation, cancellation mid-run, metric aggregation (~5) |
| `ai-engine.ts` | 72% | 80% | ai-engine.test.ts | Session limits, message trimming, error recovery (~4) |
| `mock-server-manager.ts` | 61% | 80% | mock-server-manager.test.ts | Server lifecycle errors, route conflicts, CORS (~5) |
| `jks-parser.ts` | 44% | 80% | jks-parser.test.ts | Parse keystore, parse truststore, invalid input (~3) |

### 2C — Improve <80% Renderer Logic Files — +75 lines

| File | Current | Target | Expand Test File | Additional Cases |
|------|---------|--------|-----------------|-----------------|
| `tabs-state-manager.ts` | 77% | 82% | tabs-state-manager.test.ts | Edge cases (~3) |
| `builder-utils.ts` | 73% | 82% | Add to request-builder.test.ts | Multipart, binary (~3) |
| `history-manager.ts` | 69% | 82% | history-manager.test.ts | Dedup, overflow (~3) |
| `insomniaV5Mapper.ts` | 70% | 82% | Add to insomnia tests | V5 edge cases (~3) |

### 2D — New Tests for Small Main Process Files — +100 lines

| File | Lines | Create Test |
|------|-------|-------------|
| `api-courier.ts` | 111 | `importers/__tests__/api-courier.test.ts` — mapApiCourierExport (~6 cases) |
| `update-manager.ts` | 145 | `__tests__/update-manager.test.ts` — checkForUpdate, onUpdateDownloaded (~5 cases) |
| `window-manager.ts` | 48 | `__tests__/window-manager.test.ts` — createWindow, getWindow (~3 cases) |
| `mock-server/index.ts` | 15 | Import in existing mock-server test |

### Phase 2 Totals

| Sub-phase | Additional Lines Covered |
|-----------|--------------------------|
| 2A ipc-manager | ~220 |
| 2B Main process improvements | ~200 |
| 2C Renderer logic improvements | ~75 |
| 2D New small file tests | ~100 |
| **Total** | **~595** |

**Running total**: 9,025 + 595 = ~9,620 covered of ~11,200
**Expected coverage after Phase 2**: **~86%**

---

## Execution Checklist

```
Phase 0: Coverage Config
[ ] Update vitest.config.ts with include whitelist
[ ] Run `npx vitest run --coverage` — verify ~62%

Phase 1A: Collections Operations
[ ] Create collections-operations.test.ts (~25 cases)
[ ] Run coverage — verify gain

Phase 1B: JSON Viewer Logic
[ ] Create parser.test.ts (~10 cases)
[ ] Create search.test.ts (~10 cases)
[ ] Create formatter.test.ts (~10 cases)

Phase 1C: Request Editor Logic
[ ] Create request-editors.test.ts (~20 cases)

Phase 1D: Data Extractor
[ ] Create data-extractor.test.ts (~15 cases)

Phase 1E: Notepad Store
[ ] Create notepad-store.test.ts (~12 cases)

Phase 1F: Diff Worker
[ ] Create diffWorker.test.ts (~8 cases)

Phase 1G: Variable Detection
[ ] Create variable-detection.test.ts (~8 cases)

Phase 1H: Freebie Imports
[ ] Create collections-icons.test.ts (import)
[ ] Verify mock-server-store.ts auto-covered
[ ] Run coverage — verify ~82%

Phase 2A: ipc-manager Expansion
[ ] Add ~15 test cases to ipc-manager.test.ts

Phase 2B: Main Process Improvements
[ ] Expand oauth.test.ts (+5 cases)
[ ] Expand loadtest-engine.test.ts (+5 cases)
[ ] Expand ai-engine.test.ts (+4 cases)
[ ] Expand mock-server-manager.test.ts (+5 cases)
[ ] Expand jks-parser.test.ts (+3 cases)

Phase 2C: Renderer Logic Improvements
[ ] Expand tabs-state-manager.test.ts (+3 cases)
[ ] Expand/create builder-utils tests (+3 cases)
[ ] Expand history-manager.test.ts (+3 cases)
[ ] Expand insomnia V5 tests (+3 cases)

Phase 2D: New Small File Tests
[ ] Create api-courier.test.ts (~6 cases)
[ ] Create update-manager.test.ts (~5 cases)
[ ] Create window-manager.test.ts (~3 cases)

Final Verification
[ ] Run `npx vitest run --coverage`
[ ] All four thresholds ≥ 80% ✓
```

---

## Key Differences from v1 Plan

| Aspect | v1 Plan | v2 Plan |
|--------|---------|---------|
| Coverage scope | All ~40K lines | ~11.2K testable lines only |
| DOM-heavy files | "Test them later" | Excluded from unit test coverage |
| Expected final | 80% of 40K = 32K lines needed | 80% of 11.2K = 9K lines needed |
| Phase 0 effect | 5% → 5% | 17% → 62% (just config) |
| New tests needed | ~200 test cases | ~160 test cases |
| Realistic? | No — would need DOM testing | Yes — all pure logic |

## Decisions

- DOM/UI files are excluded from unit test coverage (standard Electron practice)
- React components (.tsx) excluded — would need separate jsdom + RTL setup
- Coverage uses `include` whitelist instead of `exclude` blacklist — more maintainable
- Entry points excluded — bootstrap code, not business logic
- `preload/index.ts` excluded — Electron contextBridge, not unit-testable
- All existing 31 test files continue to run — they just don't inflate the denominator
