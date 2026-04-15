import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted runs before vi.mock factories and imports
const { postMessageSpy } = vi.hoisted(() => {
  const postMessageSpy = vi.fn();
  (globalThis as any).self = Object.create(globalThis, {
    onmessage: { value: null, writable: true, configurable: true },
    postMessage: { value: postMessageSpy, writable: true, configurable: true },
  });
  return { postMessageSpy };
});

// Mock jsondiffpatch
vi.mock('jsondiffpatch', () => ({
  create: () => ({
    diff: (left: unknown, right: unknown) => {
      if (JSON.stringify(left) === JSON.stringify(right)) return undefined;
      return { _t: 'a' };
    },
  }),
  DiffPatcher: class {},
}));

// Mock buildDiffRows
vi.mock('../../utils/diffMap', () => ({
  buildDiffRows: (delta: any) => {
    if (!delta) return [];
    return [
      { path: '/test', type: 'changed', leftValue: 'a', rightValue: 'b' },
    ];
  },
}));

// Now import — this sets self.onmessage
import '../../worker/diffWorker';

describe('diffWorker', () => {
  beforeEach(() => {
    postMessageSpy.mockClear();
  });

  function sendMessage(data: any) {
    const event = { data } as MessageEvent;
    (self as any).onmessage(event);
  }

  it('ignores non-diff messages', () => {
    sendMessage({ type: 'ping' });
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('computes diff and posts result', () => {
    sendMessage({
      type: 'diff',
      leftJson: '{"a":1}',
      rightJson: '{"a":2}',
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'diff-result',
        result: expect.objectContaining({
          rows: expect.any(Array),
          stats: expect.objectContaining({
            added: expect.any(Number),
            removed: expect.any(Number),
            changed: expect.any(Number),
            totalTime: expect.any(Number),
          }),
        }),
      })
    );
  });

  it('posts error for invalid left JSON', () => {
    sendMessage({
      type: 'diff',
      leftJson: 'not-json',
      rightJson: '{}',
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        error: expect.stringContaining('Left JSON invalid'),
      })
    );
  });

  it('posts error for invalid right JSON', () => {
    sendMessage({
      type: 'diff',
      leftJson: '{}',
      rightJson: 'not-json',
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        error: expect.stringContaining('Right JSON invalid'),
      })
    );
  });

  it('handles identical JSON (no delta)', () => {
    sendMessage({
      type: 'diff',
      leftJson: '{"a":1}',
      rightJson: '{"a":1}',
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'diff-result',
        result: expect.objectContaining({
          rows: [],
          stats: expect.objectContaining({
            added: 0,
            removed: 0,
            changed: 0,
          }),
        }),
      })
    );
  });
});
