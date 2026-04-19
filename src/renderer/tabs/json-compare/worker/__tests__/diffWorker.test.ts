import { describe, it, expect, beforeEach, vi } from 'vitest';

interface SelfStub {
  onmessage: ((e: { data: unknown }) => void) | null;
  postMessage: (data: unknown) => void;
}

const { postMessageSpy } = vi.hoisted(() => {
  const postMessageSpy = vi.fn();
  const stub: SelfStub = { onmessage: null, postMessage: postMessageSpy };
  Object.defineProperty(globalThis, 'self', {
    value: stub,
    writable: true,
    configurable: true,
  });
  return { postMessageSpy };
});

vi.mock('jsondiffpatch', () => ({
  create: () => ({
    diff: (left: unknown, right: unknown) =>
      JSON.stringify(left) === JSON.stringify(right) ? undefined : { _t: 'a' },
  }),
  DiffPatcher: class {},
}));

vi.mock('../../utils/diffMap', () => ({
  buildDiffRows: (delta: unknown) =>
    delta
      ? [{ path: '/test', type: 'changed', leftValue: 'a', rightValue: 'b' }]
      : [],
  filterDiffRowsByIgnorePaths: (rows: unknown[]) => rows,
  computeDecorations: () => ({ leftDecorations: [], rightDecorations: [] }),
}));

import '../../worker/diffWorker';

function send(data: Record<string, unknown>): void {
  const stub = globalThis as unknown as { self: SelfStub };
  stub.self.onmessage!({ data });
}

describe('diffWorker', () => {
  beforeEach(() => postMessageSpy.mockClear());

  it('ignores non-diff messages', () => {
    send({ type: 'ping', requestId: 1 });
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('computes diff and echoes requestId', () => {
    send({
      type: 'diff',
      requestId: 7,
      leftJson: '{"a":1}',
      rightJson: '{"a":2}',
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'diff-result',
        requestId: 7,
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

  it('posts error with requestId for invalid left JSON', () => {
    send({
      type: 'diff',
      requestId: 11,
      leftJson: 'not-json',
      rightJson: '{}',
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        requestId: 11,
        error: expect.stringContaining('Left JSON invalid'),
      })
    );
  });

  it('posts error for invalid right JSON', () => {
    send({
      type: 'diff',
      requestId: 12,
      leftJson: '{}',
      rightJson: 'not-json',
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        requestId: 12,
        error: expect.stringContaining('Right JSON invalid'),
      })
    );
  });

  it('handles identical JSON (empty rows)', () => {
    send({
      type: 'diff',
      requestId: 13,
      leftJson: '{"a":1}',
      rightJson: '{"a":1}',
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'diff-result',
        requestId: 13,
        result: expect.objectContaining({ rows: [] }),
      })
    );
  });
});
