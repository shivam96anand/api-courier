/**
 * @vitest-environment jsdom
 *
 * SOAP/XML responses render into a Monaco XML editor rather than the JSON one.
 * The response action buttons used to look only at the JSON editor, so Top,
 * Bottom, Enlarge and friends silently did nothing in SOAP mode.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResponseViewer } from '../ResponseViewer';
import { ResponseActions } from '../ResponseActions';
import { ResponseTabs } from '../ResponseTabs';
import { ApiResponse } from '../../../../shared/types';

const xmlEditor = {
  dispose: vi.fn(),
  setWordWrap: vi.fn(),
  setFontSize: vi.fn(),
  getEditor: vi.fn(() => null),
  scrollToTop: vi.fn(),
  scrollToBottom: vi.fn(),
  foldAll: vi.fn(),
  unfoldAll: vi.fn(),
  triggerFind: vi.fn(),
  toggleFind: vi.fn(),
};

vi.mock('../../request/MonacoJsonEditor', () => ({
  MonacoJsonEditor: vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
    setWordWrap: vi.fn(),
    setFontSize: vi.fn(),
    getEditor: vi.fn(() => null),
  })),
}));

vi.mock('../../request/MonacoXmlEditor', () => ({
  MonacoXmlEditor: vi.fn().mockImplementation(() => xmlEditor),
}));

vi.mock('../../json-viewer/utilities', () => ({
  JsonViewerUtilities: { format: vi.fn(), openFullscreenMonaco: vi.fn() },
}));

const openFullscreenXml = vi.fn();
vi.mock('../fullscreen-xml', () => ({
  openFullscreenXml: (...args: unknown[]) => openFullscreenXml(...args),
}));

const SOAP_BODY =
  '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Ok/></soap:Body></soap:Envelope>';

function soapResponse(): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/xml' },
    body: SOAP_BODY,
    time: 12,
    size: SOAP_BODY.length,
    timestamp: Date.now(),
  };
}

describe('ResponseViewer — SOAP/XML action buttons', () => {
  let viewer: ResponseViewer;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    viewer = new ResponseViewer(container, {
      maxResponseDisplaySize: 10 * 1024 * 1024,
    });
    await viewer.displayResponse(soapResponse(), 'soap');
  });

  it('renders the body through the XML editor', () => {
    expect(viewer.isXmlBody()).toBe(true);
    expect(viewer.isJsonBody()).toBe(false);
  });

  it('Top scrolls the XML editor', () => {
    viewer.scrollToTop();
    expect(xmlEditor.scrollToTop).toHaveBeenCalled();
  });

  it('Bottom scrolls the XML editor', () => {
    viewer.scrollToBottom();
    expect(xmlEditor.scrollToBottom).toHaveBeenCalled();
  });

  it('Collapse / Expand fold the XML editor', () => {
    viewer.collapseAll();
    viewer.expandAll();
    expect(xmlEditor.foldAll).toHaveBeenCalled();
    expect(xmlEditor.unfoldAll).toHaveBeenCalled();
  });

  it('search toggles the XML editor find widget', () => {
    viewer.toggleMonacoSearch();
    expect(xmlEditor.toggleFind).toHaveBeenCalled();
  });

  it('Enlarge opens the fullscreen XML viewer', () => {
    viewer.openFullscreen();
    expect(openFullscreenXml).toHaveBeenCalledTimes(1);
    expect(openFullscreenXml.mock.calls[0][0]).toContain('soap:Envelope');
  });

  it('exposes pretty-printed XML for the Notepad action', () => {
    const xml = viewer.getPrettyXml();
    expect(xml).toContain('soap:Envelope');
    expect(xml).toContain('\n');
  });
});

describe('ResponseActions.updateVisibility — XML body', () => {
  it('keeps Collapse/Expand/Notepad available', () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const actions = new ResponseActions(container);

    actions.updateVisibility(soapResponse(), 'body', false, true);

    const display = (id: string): string =>
      (document.querySelector(`#${id}`) as HTMLElement).style.display;
    expect(display('collapse-btn')).toBe('');
    expect(display('expand-btn')).toBe('');
    expect(display('top-btn')).toBe('');
    expect(display('open-notepad-btn')).toBe('');
  });
});

describe('ResponseTabs.updateActionButtons — XML body', () => {
  it('shows Search for XML but keeps Export JSON-only', () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const tabs = new ResponseTabs(container, {
      defaultTab: 'body',
      enabledTabs: ['body', 'headers'],
    });

    tabs.updateActionButtons(true, false, true);

    const search = document.querySelector<HTMLElement>('#response-search-icon');
    const exportBtn = document.querySelector<HTMLElement>(
      '#response-export-icon'
    );
    expect(search?.style.display).toBe('');
    expect(exportBtn?.style.display).toBe('none');
  });
});
