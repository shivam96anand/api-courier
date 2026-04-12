# JSON Compare Feature

A production-ready JSON comparison tool integrated into Restbro.

## Features

- **Auto-compare**: Automatically compares JSONs 300ms after valid input
- **Inline Highlighting**: Visual diff in Monaco editors with color-coded changes
  - 🟢 Green = Added (exists only in Right)
  - 🔴 Red = Removed (exists only in Left)
  - 🟠 Amber = Changed (different values)
- **Tabular View**: Virtualized table showing all differences
- **Interactive Navigation**: Click table rows to focus nodes in editors
- **Search & Filter**: Find specific paths/values, filter by change type
- **Actions**: Swap sides, clear, copy JSON
- **Keyboard Shortcuts**:
  - `Cmd/Ctrl+Enter` - Force compare
  - `Alt+↓/↑` - Next/Previous difference (planned)
- **Persistence**: State saved to localStorage
- **Performance**: Web Worker handles large JSONs (up to 5MB) without freezing UI

## Architecture

```
json-compare/
├── JsonCompareTab.tsx          # Main React component
├── components/
│   ├── JsonEditor.tsx         # Monaco editor wrapper
│   └── DiffTable.tsx          # Virtualized diff table
├── hooks/
│   └── useJsonDiff.ts         # Worker integration hook
├── worker/
│   └── diffWorker.ts          # Background diff computation
├── utils/
│   └── diffMap.ts             # Diff mapping utilities
├── state/
│   └── persist.ts             # localStorage persistence
└── types.ts                   # TypeScript definitions
```

## Integration

The feature is integrated via `JsonCompareTabManager` in `/src/renderer/components/JsonCompareTab.ts`, which wraps the React component for the vanilla TypeScript app architecture.

## Testing

Run unit tests:
```bash
npm test
```

Tests cover:
- JSON Pointer conversion
- Diff row building (adds/removes/changes)
- Edge cases (null vs undefined, type changes, nested objects, arrays)

## Dependencies

- `jsondiffpatch` - Structural JSON diffing
- `monaco-editor` - Code editor with syntax highlighting
- `@mui/material` - UI components
- `react-window` - Table virtualization

## Future Enhancements

1. More accurate AST-based path→position mapping (currently approximate)
2. Complete Next/Prev diff navigation shortcuts
3. Gutter overview for diff minimap
4. Three-way merge support
5. Custom diff rules (ignore paths/timestamps)
6. Export diff report