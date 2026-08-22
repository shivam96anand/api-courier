/**
 * @vitest-environment jsdom
 *
 * Cmd/Ctrl+F must follow the region the user is working in: the collections
 * panel owns it after a click in the sidebar, even when a response is on
 * screen; otherwise it belongs to the response body search.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollectionsCore } from '../collections-core';

type CorePrivates = {
  setupPanelActivityTracking: () => void;
  setupKeyboardShortcuts: () => void;
};

function setupDom(): void {
  document.body.innerHTML = `
    <div id="api-tab" class="tab-content active">
      <div class="collections-panel">
        <div class="collections-tree" id="collections-tree">
          <div class="collection-item" id="item-a">A</div>
        </div>
        <div class="collections-bottom-bar">
          <input type="text" id="collections-search" class="search-input" />
        </div>
      </div>
      <div id="response-body">
        <div id="response-monaco-json-container"></div>
      </div>
    </div>
  `;
}

function click(selector: string): void {
  document
    .querySelector(selector)!
    .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
}

function pressFind(): void {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true })
  );
}

describe('collections Cmd/Ctrl+F routing', () => {
  let responseSearchTriggered: boolean;

  beforeEach(() => {
    vi.restoreAllMocks();
    setupDom();

    responseSearchTriggered = false;
    document.addEventListener('trigger-response-search', () => {
      responseSearchTriggered = true;
    });

    const core = new CollectionsCore() as unknown as CorePrivates;
    core.setupPanelActivityTracking();
    core.setupKeyboardShortcuts();
  });

  it('focuses the collections search after clicking in the collections panel', () => {
    click('#item-a');
    pressFind();

    expect(document.activeElement?.id).toBe('collections-search');
    expect(responseSearchTriggered).toBe(false);
  });

  it('still focuses the collections search when focus was stolen by another panel', () => {
    click('#item-a');
    (
      document.getElementById('response-monaco-json-container') as HTMLElement
    ).tabIndex = 0;
    document.getElementById('response-monaco-json-container')!.focus();
    pressFind();

    expect(document.activeElement?.id).toBe('collections-search');
    expect(responseSearchTriggered).toBe(false);
  });

  it('triggers the response search when the user is working outside the panel', () => {
    click('#response-body');
    pressFind();

    expect(responseSearchTriggered).toBe(true);
    expect(document.activeElement?.id).not.toBe('collections-search');
  });

  it('focuses the collections search when there is no response on screen', () => {
    document.getElementById('response-body')!.innerHTML = '';
    click('#response-body');
    pressFind();

    expect(responseSearchTriggered).toBe(false);
    expect(document.activeElement?.id).toBe('collections-search');
  });
});
