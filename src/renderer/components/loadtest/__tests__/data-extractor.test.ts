/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TargetAdHocDataExtractor } from '../TargetAdHocDataExtractor';

function createContainer(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('TargetAdHocDataExtractor', () => {
  describe('validate', () => {
    it('returns error for empty URL', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: '',
      });
      expect(errors).toContain('URL is required');
    });

    it('returns error for whitespace-only URL', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: '   ',
      });
      expect(errors).toContain('URL is required');
    });

    it('returns error for invalid URL format', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: 'not-a-valid-url',
      });
      expect(errors).toContain('Invalid URL format');
    });

    it('returns no errors for valid URL', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: 'https://example.com/api',
      });
      expect(errors).toHaveLength(0);
    });

    it('returns error for OAuth2 without token or config', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: 'https://example.com',
        auth: { type: 'oauth2', data: {} },
      });
      expect(errors).toContain(
        'OAuth2 requires an access token or token URL and client ID'
      );
    });

    it('accepts OAuth2 with access token', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: 'https://example.com',
        auth: { type: 'oauth2', data: { accessToken: 'tok-123' } },
      });
      expect(errors).toHaveLength(0);
    });

    it('accepts OAuth2 with tokenUrl and clientId', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: 'https://example.com',
        auth: {
          type: 'oauth2',
          data: {
            tokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client',
          },
        },
      });
      expect(errors).toHaveLength(0);
    });

    it('does not check OAuth2 config for other auth types', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: 'https://example.com',
        auth: { type: 'bearer', data: { token: 'abc' } },
      });
      expect(errors).toHaveLength(0);
    });

    it('accepts no auth', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'POST',
        url: 'https://example.com',
        auth: { type: 'none' },
      });
      expect(errors).toHaveLength(0);
    });

    it('returns multiple errors at once', () => {
      const errors = TargetAdHocDataExtractor.validate({
        kind: 'adhoc',
        method: 'GET',
        url: '',
        auth: { type: 'oauth2', data: {} },
      });
      expect(errors.length).toBeGreaterThanOrEqual(2);
      expect(errors).toContain('URL is required');
      expect(errors).toContain(
        'OAuth2 requires an access token or token URL and client ID'
      );
    });
  });

  describe('getKeyValuePairs', () => {
    it('returns empty object when editor not found', () => {
      const container = createContainer('<div></div>');
      const result = TargetAdHocDataExtractor.getKeyValuePairs(
        container,
        'nonexistent'
      );
      expect(result).toEqual({});
    });

    it('extracts enabled key-value pairs', () => {
      const container = createContainer(`
        <div id="test-editor">
          <div class="kv-row">
            <input class="kv-checkbox" type="checkbox" checked />
            <input class="key-input" value="Authorization" />
            <input class="value-input" value="Bearer token" />
          </div>
        </div>
      `);
      const result = TargetAdHocDataExtractor.getKeyValuePairs(
        container,
        'test-editor'
      );
      expect(result).toEqual({ Authorization: 'Bearer token' });
    });

    it('skips unchecked rows', () => {
      const container = createContainer(`
        <div id="test-editor">
          <div class="kv-row">
            <input class="kv-checkbox" type="checkbox" />
            <input class="key-input" value="Disabled-Key" />
            <input class="value-input" value="Disabled-Value" />
          </div>
        </div>
      `);
      const result = TargetAdHocDataExtractor.getKeyValuePairs(
        container,
        'test-editor'
      );
      expect(result).toEqual({});
    });

    it('skips rows with empty key or value', () => {
      const container = createContainer(`
        <div id="test-editor">
          <div class="kv-row">
            <input class="kv-checkbox" type="checkbox" checked />
            <input class="key-input" value="" />
            <input class="value-input" value="some-value" />
          </div>
          <div class="kv-row">
            <input class="kv-checkbox" type="checkbox" checked />
            <input class="key-input" value="some-key" />
            <input class="value-input" value="" />
          </div>
        </div>
      `);
      const result = TargetAdHocDataExtractor.getKeyValuePairs(
        container,
        'test-editor'
      );
      expect(result).toEqual({});
    });

    it('extracts multiple pairs', () => {
      const container = createContainer(`
        <div id="test-editor">
          <div class="kv-row">
            <input class="kv-checkbox" type="checkbox" checked />
            <input class="key-input" value="key1" />
            <input class="value-input" value="val1" />
          </div>
          <div class="kv-row">
            <input class="kv-checkbox" type="checkbox" checked />
            <input class="key-input" value="key2" />
            <input class="value-input" value="val2" />
          </div>
        </div>
      `);
      const result = TargetAdHocDataExtractor.getKeyValuePairs(
        container,
        'test-editor'
      );
      expect(result).toEqual({ key1: 'val1', key2: 'val2' });
    });
  });

  describe('getAuthConfig', () => {
    it('returns none auth type', () => {
      const container = createContainer(`
        <select id="target-auth-type"><option value="none" selected>None</option></select>
      `);
      const result = TargetAdHocDataExtractor.getAuthConfig(container);
      expect(result).toEqual({ type: 'none' });
    });

    it('extracts basic auth config', () => {
      const container = createContainer(`
        <select id="target-auth-type"><option value="basic" selected>Basic</option></select>
        <input id="auth-username" value="user" />
        <input id="auth-password" value="pass" />
      `);
      const result = TargetAdHocDataExtractor.getAuthConfig(container);
      expect(result.type).toBe('basic');
      expect(result.data.username).toBe('user');
      expect(result.data.password).toBe('pass');
    });

    it('extracts bearer auth config', () => {
      const container = createContainer(`
        <select id="target-auth-type"><option value="bearer" selected>Bearer</option></select>
        <input id="auth-token" value="my-token" />
      `);
      const result = TargetAdHocDataExtractor.getAuthConfig(container);
      expect(result.type).toBe('bearer');
      expect(result.data.token).toBe('my-token');
    });

    it('extracts apikey auth config', () => {
      const container = createContainer(`
        <select id="target-auth-type"><option value="apikey" selected>API Key</option></select>
        <input id="auth-key" value="X-API-Key" />
        <input id="auth-value" value="secret" />
        <select id="auth-location"><option value="header" selected>Header</option></select>
      `);
      const result = TargetAdHocDataExtractor.getAuthConfig(container);
      expect(result.type).toBe('apikey');
      expect(result.data.key).toBe('X-API-Key');
      expect(result.data.value).toBe('secret');
      expect(result.data.location).toBe('header');
    });
  });

  describe('getBodyConfig', () => {
    it('extracts body type and content', () => {
      const container = createContainer(`
        <input type="radio" name="target-body-type" value="json" checked />
        <textarea id="target-request-body">{"key":"value"}</textarea>
      `);
      const result = TargetAdHocDataExtractor.getBodyConfig(container);
      expect(result.type).toBe('json');
      expect(result.content).toBe('{"key":"value"}');
    });

    it('returns empty content for empty textarea', () => {
      const container = createContainer(`
        <input type="radio" name="target-body-type" value="raw" checked />
        <textarea id="target-request-body"></textarea>
      `);
      const result = TargetAdHocDataExtractor.getBodyConfig(container);
      expect(result.type).toBe('raw');
      expect(result.content).toBe('');
    });
  });

  describe('getTarget', () => {
    it('extracts complete target configuration', () => {
      const container = createContainer(`
        <select id="target-method"><option value="POST" selected>POST</option></select>
        <input id="target-url" value="https://api.example.com/data" />
        <div id="target-params-editor"></div>
        <div id="target-headers-editor">
          <div class="kv-row">
            <input class="kv-checkbox" type="checkbox" checked />
            <input class="key-input" value="Accept" />
            <input class="value-input" value="application/json" />
          </div>
        </div>
        <select id="target-auth-type"><option value="none" selected>None</option></select>
        <input type="radio" name="target-body-type" value="json" checked />
        <textarea id="target-request-body">{"test":true}</textarea>
      `);
      const target = TargetAdHocDataExtractor.getTarget(container);
      expect(target.kind).toBe('adhoc');
      expect(target.method).toBe('POST');
      expect(target.url).toBe('https://api.example.com/data');
      expect(target.headers).toEqual({ Accept: 'application/json' });
      expect(target.auth).toEqual({ type: 'none' });
      expect(target.body?.type).toBe('json');
      expect(target.body?.content).toBe('{"test":true}');
    });
  });
});
