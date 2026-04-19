/**
 * Hook: keyboard shortcuts for JSON Compare.
 *  - Cmd/Ctrl+Enter   force compare
 *  - Alt+ArrowDown    next diff
 *  - Alt+ArrowUp      previous diff
 *  - Cmd/Ctrl+Shift+F format both
 */
import { useEffect } from 'react';

interface ShortcutHandlers {
  onCompare: () => void;
  onNextDiff: () => void;
  onPrevDiff: () => void;
  onFormatBoth?: () => void;
}

export function useCompareShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        handlers.onCompare();
        return;
      }
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handlers.onNextDiff();
        return;
      }
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        handlers.onPrevDiff();
        return;
      }
      if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        if (handlers.onFormatBoth) {
          e.preventDefault();
          handlers.onFormatBoth();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlers]);
}
