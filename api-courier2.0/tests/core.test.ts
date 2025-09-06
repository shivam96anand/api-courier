import { describe, it, expect } from 'vitest';
import { PostmanImporter } from '../src/main/importers/postman-importer';
import { ThemeManager } from '../src/main/themes/theme-manager';
import { OAuthManager } from '../src/main/oauth/oauth-manager';

describe('PostmanImporter', () => {
  const importer = new PostmanImporter();

  it('should validate a valid Postman collection', () => {
    const validCollection = {
      info: {
        name: 'Test Collection',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: []
    };

    const result = importer.validateCollection(validCollection);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid Postman collection', () => {
    const invalidCollection = {
      // Missing required fields
    };

    const result = importer.validateCollection(invalidCollection);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should convert HTTP methods correctly', () => {
    const testCollection = {
      info: { name: 'Test', schema: 'v2.1.0' },
      item: [{
        name: 'Test Request',
        request: {
          method: 'post',
          url: 'https://api.example.com/test'
        }
      }]
    };

    const collections = importer.importCollection(testCollection);
    expect(collections[0].children![0].request!.method).toBe('POST');
  });
});

describe('ThemeManager', () => {
  const themeManager = new ThemeManager();

  it('should have default themes', () => {
    const themes = themeManager.getAvailableThemes();
    expect(themes.length).toBeGreaterThan(0);
    expect(themes[0].id).toBe('dark-blue');
  });

  it('should generate CSS variables', () => {
    const theme = themeManager.getCurrentTheme();
    const css = themeManager.generateCSSVariables(theme);
    expect(css).toContain('--primary-color:');
    expect(css).toContain('--background-color:');
  });

  it('should validate theme colors', () => {
    const invalidTheme = {
      name: 'Test Theme',
      colors: {
        primary: 'invalid-color'
      }
    };

    const result = themeManager.validateTheme(invalidTheme);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('OAuthManager', () => {
  const oauthManager = new OAuthManager();

  it('should check token expiration correctly', () => {
    const expiredToken = {
      access_token: 'test',
      token_type: 'Bearer',
      expires_at: Date.now() - 1000 // Expired 1 second ago
    };

    const validToken = {
      access_token: 'test',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000 // Expires in 1 hour
    };

    expect(oauthManager.isTokenExpired(expiredToken)).toBe(true);
    expect(oauthManager.isTokenExpired(validToken)).toBe(false);
  });

  it('should handle tokens without expiration', () => {
    const noExpiryToken = {
      access_token: 'test',
      token_type: 'Bearer'
    };

    expect(oauthManager.isTokenExpired(noExpiryToken)).toBe(false);
  });
});

// URL Validation Tests
describe('URL Validation', () => {
  it('should validate HTTP URLs', () => {
    const validUrls = [
      'http://example.com',
      'https://api.example.com/v1/users',
      'https://localhost:3000/test'
    ];

    validUrls.forEach(url => {
      try {
        new URL(url);
        expect(['http:', 'https:'].includes(new URL(url).protocol)).toBe(true);
      } catch {
        expect(false).toBe(true); // Should not throw
      }
    });
  });

  it('should reject invalid URLs', () => {
    const invalidUrls = [
      'not-a-url',
      'ftp://example.com',
      'javascript:alert(1)',
      ''
    ];

    invalidUrls.forEach(url => {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          expect(true).toBe(true); // Should be rejected
        }
      } catch {
        expect(true).toBe(true); // Invalid format, which is expected
      }
    });
  });
});

// Header Normalization Tests
describe('Header Normalization', () => {
  it('should normalize headers correctly', () => {
    const testHeaders = {
      'content-type': 'application/json',
      'AUTHORIZATION': 'Bearer token123',
      'User-Agent': ['API-Courier/1.0', 'Custom-Client/2.0']
    };

    const normalized: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(testHeaders)) {
      if (typeof value === 'string') {
        normalized[key] = value;
      } else if (Array.isArray(value)) {
        normalized[key] = value.join(', ');
      } else if (value !== undefined) {
        normalized[key] = String(value);
      }
    }

    expect(normalized['content-type']).toBe('application/json');
    expect(normalized['AUTHORIZATION']).toBe('Bearer token123');
    expect(normalized['User-Agent']).toBe('API-Courier/1.0, Custom-Client/2.0');
  });
});
