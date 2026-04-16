/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabsRenderer } from '../tabs-renderer';
import { RequestTab, ApiRequest } from '../../../../shared/types';

function makeTab(id: string, name: string, active = false): RequestTab {
  return {
    id,
    name,
    request: {
      id: `req-${id}`,
      name,
      method: 'GET',
      url: '',
      headers: {},
    } as ApiRequest,
    isModified: false,
    requestMode: 'rest',
  };
}

describe('TabsRenderer', () => {
  let renderer: TabsRenderer;

  beforeEach(() => {
    document.body.innerHTML = '<div id="request-tab-list"></div>';
    renderer = new TabsRenderer();
  });

  it('renders tabs with correct count', () => {
    const tabs = [makeTab('1', 'Tab 1'), makeTab('2', 'Tab 2')];
    renderer.renderTabs(tabs, '1');

    const tabList = document.getElementById('request-tab-list')!;
    // 1 new-tab button + 2 tabs
    const buttons = tabList.querySelectorAll('button.request-tab');
    expect(buttons.length).toBe(3);
  });

  it('marks active tab with active class', () => {
    const tabs = [makeTab('1', 'Tab 1'), makeTab('2', 'Tab 2')];
    renderer.renderTabs(tabs, '2');

    const tabList = document.getElementById('request-tab-list')!;
    const activeTab = tabList.querySelector('.request-tab.active');
    expect(activeTab).toBeTruthy();
    expect((activeTab as HTMLElement).dataset.tabId).toBe('2');
  });

  it('makes tabs draggable', () => {
    const tabs = [makeTab('1', 'Tab 1'), makeTab('2', 'Tab 2')];
    renderer.renderTabs(tabs, '1');

    const tabList = document.getElementById('request-tab-list')!;
    const tabElements = tabList.querySelectorAll(
      'button.request-tab:not(.new-tab-button)'
    );
    tabElements.forEach((el) => {
      expect((el as HTMLElement).draggable).toBe(true);
    });
  });

  it('new tab button is not draggable', () => {
    const tabs = [makeTab('1', 'Tab 1')];
    renderer.renderTabs(tabs, '1');

    const newTabBtn = document.querySelector('.new-tab-button') as HTMLElement;
    expect(newTabBtn.draggable).toBeFalsy();
  });

  it('dispatches tab-reorder event on drop', () => {
    const tabs = [
      makeTab('1', 'Tab 1'),
      makeTab('2', 'Tab 2'),
      makeTab('3', 'Tab 3'),
    ];
    renderer.renderTabs(tabs, '1');

    const dispatched: CustomEvent[] = [];
    document.addEventListener('tab-reorder', ((e: CustomEvent) => {
      dispatched.push(e);
    }) as EventListener);

    const tabList = document.getElementById('request-tab-list')!;
    const tabElements = tabList.querySelectorAll(
      'button.request-tab:not(.new-tab-button)'
    );
    const tab1 = tabElements[0] as HTMLElement;
    const tab3 = tabElements[2] as HTMLElement;

    // Simulate dragstart on tab 1 using a plain Event (DragEvent not in jsdom)
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    (dragStartEvent as any).dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
    };
    tab1.dispatchEvent(dragStartEvent);

    // Simulate drop on tab 3
    const dropEvent = new Event('drop', { bubbles: true });
    (dropEvent as any).dataTransfer = { dropEffect: '' };
    (dropEvent as any).clientX = 0; // left side → dropBefore = true
    (dropEvent as any).preventDefault = vi.fn();
    tab3.dispatchEvent(dropEvent);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].detail.sourceTabId).toBe('1');
    expect(dispatched[0].detail.targetTabId).toBe('3');
  });

  it('adds dragging class on dragstart', () => {
    const tabs = [makeTab('1', 'Tab 1')];
    renderer.renderTabs(tabs, '1');

    const tab = document.querySelector(
      '.request-tab:not(.new-tab-button)'
    ) as HTMLElement;
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    (dragStartEvent as any).dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
    };
    tab.dispatchEvent(dragStartEvent);
    expect(tab.classList.contains('dragging')).toBe(true);
  });

  it('removes dragging class on dragend', () => {
    const tabs = [makeTab('1', 'Tab 1')];
    renderer.renderTabs(tabs, '1');

    const tab = document.querySelector(
      '.request-tab:not(.new-tab-button)'
    ) as HTMLElement;
    const startEvt = new Event('dragstart', { bubbles: true });
    (startEvt as any).dataTransfer = { effectAllowed: '', setData: vi.fn() };
    tab.dispatchEvent(startEvt);

    tab.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(tab.classList.contains('dragging')).toBe(false);
  });

  it('shows modified indicator', () => {
    const tab = makeTab('1', 'Tab 1');
    tab.isModified = true;
    renderer.renderTabs([tab], '1');

    const nameSpan = document.querySelector('.tab-name') as HTMLElement;
    expect(nameSpan.textContent).toContain('•');
  });
});
