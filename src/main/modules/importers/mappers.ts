/**
 * Shared mapping utilities for converting Postman/Insomnia data to Restbro format
 */

import { randomBytes } from 'crypto';

export function generateId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Maps generic HTTP method strings to our HttpMethod type
 */
export function mapHttpMethod(method?: string): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' {
  const normalized = (method || 'GET').toUpperCase();
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  if (validMethods.includes(normalized)) {
    return normalized as any;
  }

  return 'GET';
}

/**
 * Maps Postman/Insomnia auth to Restbro auth format
 */
export function mapAuth(authConfig: any): { type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2'; config: Record<string, string> } {
  if (!authConfig || !authConfig.type || authConfig.type === 'noauth') {
    return { type: 'none', config: {} };
  }

  let type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2' = 'none';
  const rawType = authConfig.type;

  // Map to valid auth types
  if (rawType === 'basic') {
    type = 'basic';
  } else if (rawType === 'bearer') {
    type = 'bearer';
  } else if (rawType === 'apikey' || rawType === 'api-key') {
    type = 'api-key';
  } else if (rawType === 'oauth2') {
    type = 'oauth2';
  } else {
    // Unknown type, default to none
    return { type: 'none', config: {} };
  }

  const config: Record<string, string> = {};

  if (type === 'basic') {
    // Postman: auth.basic array with {key, value}
    if (Array.isArray(authConfig.basic)) {
      authConfig.basic.forEach((item: any) => {
        config[item.key] = String(item.value || '');
      });
    }
    // Insomnia: direct properties
    if (authConfig.username) config.username = String(authConfig.username);
    if (authConfig.password) config.password = String(authConfig.password);
  } else if (type === 'bearer') {
    // Postman: auth.bearer array
    if (Array.isArray(authConfig.bearer)) {
      authConfig.bearer.forEach((item: any) => {
        config[item.key] = String(item.value || '');
      });
    }
    // Insomnia: direct token property
    if (authConfig.token) config.token = String(authConfig.token);
  } else if (type === 'oauth2') {
    // Map OAuth2 fields - keep as strings with {{var}} preserved
    const oauth2Fields = [
      'grantType', 'accessTokenUrl', 'authUrl', 'clientId', 'clientSecret',
      'scope', 'accessToken', 'refreshToken', 'tokenUrl'
    ];

    if (Array.isArray(authConfig.oauth2)) {
      authConfig.oauth2.forEach((item: any) => {
        if (oauth2Fields.includes(item.key)) {
          config[item.key] = String(item.value || '');
        }
      });
    }

    // Direct properties
    oauth2Fields.forEach(field => {
      if (authConfig[field]) {
        config[field] = String(authConfig[field]);
      }
    });

    // Map Insomnia's accessTokenUrl to tokenUrl (our app expects tokenUrl)
    if (authConfig.accessTokenUrl && !config.tokenUrl) {
      config.tokenUrl = String(authConfig.accessTokenUrl);
    }
  } else if (type === 'api-key') {
    // API Key auth
    if (authConfig.key) config.key = String(authConfig.key);
    if (authConfig.value) config.value = String(authConfig.value);
    if (authConfig.in) {
      const location = String(authConfig.in);
      config.location = location;
      config.in = location;
    }
  }

  return { type, config };
}

/**
 * Sanitizes collection/folder/request names
 */
export function sanitizeName(name?: string | null): string {
  const sanitized = (name || '').trim();
  return sanitized || 'Untitled';
}

/**
 * Generates a unique name by appending suffix if needed
 */
export function makeUniqueName(name: string, existingNames: Set<string>): string {
  let candidate = name;
  let counter = 2;

  while (existingNames.has(candidate)) {
    candidate = `${name} (${counter})`;
    counter++;
  }

  existingNames.add(candidate);
  return candidate;
}

/**
 * Converts Postman variable array to Record
 */
export function mapVariablesArray(variables: any[]): Record<string, string> {
  const result: Record<string, string> = {};

  if (!Array.isArray(variables)) return result;

  variables.forEach(v => {
    if (v.key && (v.enabled === undefined || v.enabled === true)) {
      result[v.key] = String(v.value || '');
    }
  });

  return result;
}
