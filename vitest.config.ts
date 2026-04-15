import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
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
        // DOM-heavy renderer utils — need E2E tests, not unit tests
        'src/renderer/utils/confirm-dialog.ts',
        'src/renderer/utils/modal.ts',
        'src/renderer/utils/resize-manager.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});