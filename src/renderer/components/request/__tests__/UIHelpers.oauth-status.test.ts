// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UIHelpers } from '../UIHelpers';

vi.mock('../../../utils/icons', () => ({
  iconHtml: (name: string) => `<i data-icon="${name}"></i>`,
}));

function mountStatusBox(): HTMLElement {
  document.body.innerHTML = `
    <div id="oauth-status" class="oauth-status" style="display: none;">
      <span class="status-icon"></span>
      <span class="status-text"></span>
    </div>
  `;
  return document.getElementById('oauth-status') as HTMLElement;
}

describe('UIHelpers.updateOAuthStatus — error rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('never shows the raw JSON error body to the user', () => {
    const box = mountStatusBox();
    new UIHelpers().updateOAuthStatus(
      'Token request failed: 401 Unauthorized - {"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}',
      'error'
    );

    const text = box.querySelector('.status-text') as HTMLElement;
    expect(text.textContent).not.toContain('{');
    expect(text.textContent).not.toContain('error_description');
    expect(text.querySelector('.status-title')?.textContent).toBe(
      'Client is not allowed to use this grant'
    );
    expect(text.querySelector('.status-detail')?.textContent).toContain(
      'Invalid client or Invalid client credentials'
    );
    expect(text.querySelector('.status-hint')?.textContent).toBeTruthy();
    expect(box.classList.contains('status-error')).toBe(true);
  });

  it('escapes server-provided HTML instead of injecting it', () => {
    const box = mountStatusBox();
    new UIHelpers().updateOAuthStatus(
      'Token request failed: 400 Bad Request - {"error":"invalid_request","error_description":"<img src=x onerror=alert(1)>"}',
      'error'
    );

    const text = box.querySelector('.status-text') as HTMLElement;
    expect(text.querySelector('img')).toBeNull();
    expect(text.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('replaces previous error content on the next update', () => {
    const box = mountStatusBox();
    const helpers = new UIHelpers();

    helpers.updateOAuthStatus(
      'Token request failed: 401 Unauthorized - {"error":"invalid_client"}',
      'error'
    );
    helpers.updateOAuthStatus('Getting token...', 'loading');

    const text = box.querySelector('.status-text') as HTMLElement;
    expect(text.textContent).toBe('Getting token...');
    expect(text.querySelector('.status-title')).toBeNull();
  });
});
