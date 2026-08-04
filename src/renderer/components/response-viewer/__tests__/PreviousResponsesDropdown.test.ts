/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { PreviousResponsesDropdown } from '../PreviousResponsesDropdown';
import { ApiResponse, HistoryItem } from '../../../../shared/types';

function makeResponse(timestamp: number): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{"ok":true}',
    time: 12,
    size: 11,
    timestamp,
  } as ApiResponse;
}

function makeHistoryItem(timestamp: number): HistoryItem {
  return {
    id: `h-${timestamp}`,
    request: {
      id: 'req-1',
      name: 'Test',
      method: 'GET',
      url: 'https://example.com',
      headers: {},
    },
    response: makeResponse(timestamp),
    timestamp: new Date(timestamp),
  } as HistoryItem;
}

/** Stands in for HistoryManager's synchronous `request-previous-responses` query. */
function serveHistory(items: HistoryItem[]): () => void {
  const handler = (e: Event): void => {
    const detail = (e as CustomEvent).detail;
    if (detail?.requestId === 'req-1')
      items.forEach((i) => detail.items.push(i));
  };
  document.addEventListener('request-previous-responses', handler);
  return () =>
    document.removeEventListener('request-previous-responses', handler);
}

describe('PreviousResponsesDropdown', () => {
  let host: HTMLElement;
  let dropdown: PreviousResponsesDropdown;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    host = document.getElementById('host') as HTMLElement;
    dropdown = new PreviousResponsesDropdown();
    dropdown.mount(host);
  });

  const button = (): HTMLButtonElement =>
    host.querySelector('.response-history-dropdown-btn') as HTMLButtonElement;

  it('stays available after the response is cleared when history exists', () => {
    const stop = serveHistory([makeHistoryItem(1000)]);

    dropdown.setContext('req-1', null);
    expect(button().style.display).toBe('');

    button().click();
    const rows = document.querySelectorAll('.response-history-row');
    expect(rows).toHaveLength(1);
    // Compare needs a current response as the left side — hidden without one.
    expect(document.querySelector('.response-history-row__compare')).toBeNull();
    expect(
      document.querySelector('.response-history-row__open')
    ).not.toBeNull();

    stop();
  });

  it('hides when the request has no history and no response', () => {
    const stop = serveHistory([]);
    dropdown.setContext('req-1', null);
    expect(button().style.display).toBe('none');
    stop();
  });

  it('excludes the response currently on screen', () => {
    const stop = serveHistory([makeHistoryItem(1000), makeHistoryItem(2000)]);

    dropdown.setContext('req-1', makeResponse(2000));
    button().click();

    expect(document.querySelectorAll('.response-history-row')).toHaveLength(1);
    expect(
      document.querySelector('.response-history-row__compare')
    ).not.toBeNull();

    stop();
  });

  it('dispatches a full request + response snapshot when Open is clicked', () => {
    const stop = serveHistory([makeHistoryItem(1000)]);
    const events: CustomEvent[] = [];
    const capture = (e: Event): void => {
      events.push(e as CustomEvent);
    };
    document.addEventListener('open-previous-request-response', capture);

    dropdown.setContext('req-1', null);
    button().click();
    (
      document.querySelector('.response-history-row__open') as HTMLButtonElement
    ).click();

    expect(events).toHaveLength(1);
    expect(events[0].detail.request.id).toBe('req-1');
    expect(events[0].detail.response.timestamp).toBe(1000);
    // Menu closes after opening
    expect(
      document.querySelector('.response-history-dropdown-menu')
    ).toBeNull();

    document.removeEventListener('open-previous-request-response', capture);
    stop();
  });

  it('falls back to a response-only display for legacy items without a request', () => {
    const legacy = makeHistoryItem(1000);
    delete (legacy as Partial<HistoryItem>).request;
    const stop = serveHistory([legacy]);

    const events: CustomEvent[] = [];
    const capture = (e: Event): void => {
      events.push(e as CustomEvent);
    };
    document.addEventListener('display-previous-response', capture);

    dropdown.setContext('req-1', null);
    button().click();
    (
      document.querySelector('.response-history-row__open') as HTMLButtonElement
    ).click();

    expect(events).toHaveLength(1);
    expect(events[0].detail.response.timestamp).toBe(1000);

    document.removeEventListener('display-previous-response', capture);
    stop();
  });
});
