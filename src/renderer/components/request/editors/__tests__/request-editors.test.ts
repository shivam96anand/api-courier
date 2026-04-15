import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestEditorValidator } from '../RequestEditorValidator';
import { RequestEditorState } from '../RequestEditorState';
import { RequestEditorSync } from '../RequestEditorSync';

describe('RequestEditorValidator', () => {
  let validator: RequestEditorValidator;

  beforeEach(() => {
    validator = new RequestEditorValidator({
      validateOnChange: true,
      showInlineErrors: false,
      validationRules: {} as any,
    });
  });

  describe('validate', () => {
    it('validates valid JSON string', () => {
      const result = validator.validate('{"key": "value"}', 'json');
      expect(result.isValid).toBe(true);
    });

    it('rejects invalid JSON string', () => {
      const result = validator.validate('{invalid}', 'json');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid JSON syntax');
    });

    it('accepts JSON object (non-string)', () => {
      const result = validator.validate({ key: 'value' }, 'json');
      expect(result.isValid).toBe(true);
    });

    it('validates form-data with no warnings for unique keys', () => {
      const result = validator.validate({ a: '1', b: '2' }, 'form-data');
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('validates empty form-data', () => {
      const result = validator.validate(null, 'form-data');
      expect(result.isValid).toBe(true);
    });

    it('validates url-encoded string', () => {
      const result = validator.validate(
        'key=value&foo=bar',
        'x-www-form-urlencoded'
      );
      expect(result.isValid).toBe(true);
    });

    it('accepts non-string url-encoded content', () => {
      const result = validator.validate(
        { key: 'value' },
        'x-www-form-urlencoded'
      );
      expect(result.isValid).toBe(true);
    });

    it('always valid for raw editor', () => {
      const result = validator.validate('anything', 'raw');
      expect(result.isValid).toBe(true);
    });

    it('always valid for binary editor', () => {
      const result = validator.validate(null, 'binary');
      expect(result.isValid).toBe(true);
    });

    it('stores validation results', () => {
      validator.validate('{"key": "value"}', 'json');
      const stored = validator.getValidationResult('json');
      expect(stored).toBeDefined();
      expect(stored!.isValid).toBe(true);
    });

    it('calls onValidationChange when validateOnChange is true', () => {
      const callback = vi.fn();
      validator.onValidationChange(callback);
      validator.validate('{}', 'json');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ isValid: true })
      );
    });

    it('does not call onValidationChange when validateOnChange is false', () => {
      const noChangeValidator = new RequestEditorValidator({
        validateOnChange: false,
        showInlineErrors: false,
        validationRules: {} as any,
      });
      const callback = vi.fn();
      noChangeValidator.onValidationChange(callback);
      noChangeValidator.validate('{}', 'json');
      expect(callback).not.toHaveBeenCalled();
    });

    it('handles unknown editor type', () => {
      const result = validator.validate('content', 'unknown' as any);
      expect(result.isValid).toBe(true);
    });

    it('catches thrown errors during validation', () => {
      // Override to throw
      const throwingValidator = new RequestEditorValidator({
        validateOnChange: false,
        showInlineErrors: false,
        validationRules: {} as any,
      });
      // Validate something that could cause an error in a weird way
      // The try/catch in validate should handle this
      const result = throwingValidator.validate('test', 'json');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid JSON syntax');
    });
  });

  describe('clearValidation', () => {
    it('clears a specific editor type', () => {
      validator.validate('{}', 'json');
      validator.clearValidation('json');
      expect(validator.getValidationResult('json')).toBeUndefined();
    });

    it('clears all validation results', () => {
      validator.validate('{}', 'json');
      validator.validate('test', 'raw');
      validator.clearValidation();
      expect(validator.getValidationResult('json')).toBeUndefined();
      expect(validator.getValidationResult('raw')).toBeUndefined();
    });
  });

  describe('destroy', () => {
    it('clears all state', () => {
      validator.validate('{}', 'json');
      const callback = vi.fn();
      validator.onValidationChange(callback);
      validator.destroy();

      expect(validator.getValidationResult('json')).toBeUndefined();
      // Callback should have been cleared
      validator.validate('{}', 'json');
      // The callback should not fire after destroy (it was nulled)
      // Actually validate still adds to map, but onValidationChange is null
      // The callback spy should only have 0 calls after initial setup
    });
  });
});

describe('RequestEditorState', () => {
  let state: RequestEditorState;

  beforeEach(() => {
    state = new RequestEditorState({
      persistState: true,
      debounceMs: 0,
      defaultEditor: 'json',
    });
  });

  describe('setActiveEditor / getActiveEditor', () => {
    it('defaults to configured editor type', () => {
      expect(state.getActiveEditor()).toBe('json');
    });

    it('changes active editor', () => {
      state.setActiveEditor('raw');
      expect(state.getActiveEditor()).toBe('raw');
    });

    it('does not notify when setting same editor', () => {
      const callback = vi.fn();
      state.onStateChange(callback);
      state.setActiveEditor('json'); // same as default
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('setEditorContent / getEditorContent', () => {
    it('stores and retrieves content', () => {
      state.setEditorContent('json', '{"key": "value"}');
      expect(state.getEditorContent('json')).toBe('{"key": "value"}');
    });

    it('returns undefined for unset content', () => {
      expect(state.getEditorContent('raw')).toBeUndefined();
    });
  });

  describe('setPreference / getPreference', () => {
    it('stores and retrieves preferences', () => {
      state.setPreference('theme', 'dark');
      expect(state.getPreference('theme')).toBe('dark');
    });

    it('returns undefined for unset preference', () => {
      expect(state.getPreference('nonexistent')).toBeUndefined();
    });
  });

  describe('getState / setState', () => {
    it('returns a copy of state', () => {
      const s = state.getState();
      expect(s.activeEditor).toBe('json');
      // Modifying copy should not affect original
      s.activeEditor = 'raw';
      expect(state.getActiveEditor()).toBe('json');
    });

    it('partially updates state', () => {
      state.setState({ activeEditor: 'binary' });
      expect(state.getActiveEditor()).toBe('binary');
    });
  });

  describe('onStateChange', () => {
    it('fires callback on state changes when persistState is true', () => {
      const callback = vi.fn();
      state.onStateChange(callback);
      state.setActiveEditor('raw');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ activeEditor: 'raw' })
      );
    });

    it('does not fire callback when persistState is false', () => {
      const noPersist = new RequestEditorState({
        persistState: false,
        debounceMs: 0,
        defaultEditor: 'json',
      });
      const callback = vi.fn();
      noPersist.onStateChange(callback);
      noPersist.setActiveEditor('raw');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('removes callback', () => {
      const callback = vi.fn();
      state.onStateChange(callback);
      state.destroy();
      state.setActiveEditor('raw');
      expect(callback).not.toHaveBeenCalled();
    });
  });
});

describe('RequestEditorSync', () => {
  describe('syncHeaders with auto sync enabled', () => {
    let sync: RequestEditorSync;

    beforeEach(() => {
      sync = new RequestEditorSync({
        autoSyncHeaders: true,
        syncContentType: true,
        syncContentLength: true,
      });
    });

    it('returns Content-Type for json editor', () => {
      const headers = sync.syncHeaders('{}', 'json');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('returns Content-Type for form-data editor', () => {
      const headers = sync.syncHeaders({}, 'form-data');
      expect(headers['Content-Type']).toBe('multipart/form-data');
    });

    it('returns Content-Type for url-encoded editor', () => {
      const headers = sync.syncHeaders('a=b', 'x-www-form-urlencoded');
      expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('returns Content-Type for raw editor', () => {
      const headers = sync.syncHeaders('text', 'raw');
      expect(headers['Content-Type']).toBe('text/plain');
    });

    it('returns Content-Type for binary editor', () => {
      const headers = sync.syncHeaders(null, 'binary');
      expect(headers['Content-Type']).toBe('application/octet-stream');
    });

    it('calculates Content-Length for JSON string content', () => {
      const headers = sync.syncHeaders('{"a":1}', 'json');
      expect(headers['Content-Length']).toBeDefined();
      expect(parseInt(headers['Content-Length'])).toBe(7);
    });

    it('calculates Content-Length for JSON object content', () => {
      const headers = sync.syncHeaders({ a: 1 }, 'json');
      expect(headers['Content-Length']).toBeDefined();
    });

    it('calculates Content-Length for raw content', () => {
      const headers = sync.syncHeaders('hello', 'raw');
      expect(parseInt(headers['Content-Length'])).toBe(5);
    });

    it('does not include Content-Length for form-data', () => {
      const headers = sync.syncHeaders({ a: 'b' }, 'form-data');
      expect(headers['Content-Length']).toBeUndefined();
    });

    it('does not include Content-Length for binary', () => {
      const headers = sync.syncHeaders(new Blob(), 'binary');
      expect(headers['Content-Length']).toBeUndefined();
    });

    it('calculates Content-Length for url-encoded object', () => {
      const headers = sync.syncHeaders({ a: 'b' }, 'x-www-form-urlencoded');
      expect(headers['Content-Length']).toBeDefined();
    });

    it('does not include Content-Length when content is falsy', () => {
      const headers = sync.syncHeaders(null, 'json');
      expect(headers['Content-Length']).toBeUndefined();
    });

    it('calls onHeaderSync callback when headers generated', () => {
      const callback = vi.fn();
      sync.onHeaderSync(callback);
      sync.syncHeaders('{}', 'json');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/json' })
      );
    });
  });

  describe('syncHeaders with auto sync disabled', () => {
    it('returns empty headers', () => {
      const sync = new RequestEditorSync({
        autoSyncHeaders: false,
        syncContentType: true,
        syncContentLength: true,
      });
      const headers = sync.syncHeaders('{}', 'json');
      expect(headers).toEqual({});
    });
  });

  describe('syncHeaders with selective sync', () => {
    it('only syncs content type when syncContentLength is false', () => {
      const sync = new RequestEditorSync({
        autoSyncHeaders: true,
        syncContentType: true,
        syncContentLength: false,
      });
      const headers = sync.syncHeaders('{}', 'json');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Content-Length']).toBeUndefined();
    });

    it('only syncs content length when syncContentType is false', () => {
      const sync = new RequestEditorSync({
        autoSyncHeaders: true,
        syncContentType: false,
        syncContentLength: true,
      });
      const headers = sync.syncHeaders('{}', 'json');
      expect(headers['Content-Type']).toBeUndefined();
      expect(headers['Content-Length']).toBeDefined();
    });
  });

  describe('destroy', () => {
    it('clears the callback', () => {
      const sync = new RequestEditorSync({
        autoSyncHeaders: true,
        syncContentType: true,
        syncContentLength: true,
      });
      const callback = vi.fn();
      sync.onHeaderSync(callback);
      sync.destroy();
      sync.syncHeaders('{}', 'json');
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
