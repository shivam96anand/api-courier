import { describe, expect, it } from 'vitest';
import {
  generateCodeSnippet,
  CODE_LANGUAGES,
  CodeLanguage,
  CodeGenRequest,
} from '../code-generators';

const SIMPLE_GET: CodeGenRequest = {
  method: 'GET',
  url: 'https://api.example.com/users',
  headers: { Accept: 'application/json' },
};

const POST_JSON: CodeGenRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer token123',
  },
  body: '{"name":"Alice","age":30}',
  contentType: 'application/json',
};

describe('code-generators', () => {
  describe('CODE_LANGUAGES', () => {
    it('has 8 language options', () => {
      expect(CODE_LANGUAGES).toHaveLength(8);
    });

    it('each option has id and label', () => {
      for (const lang of CODE_LANGUAGES) {
        expect(lang.id).toBeTruthy();
        expect(lang.label).toBeTruthy();
      }
    });
  });

  describe('generateCodeSnippet', () => {
    it('generates code for all supported languages', () => {
      for (const lang of CODE_LANGUAGES) {
        const code = generateCodeSnippet(lang.id, SIMPLE_GET);
        expect(code).toBeTruthy();
        expect(code.length).toBeGreaterThan(10);
      }
    });

    it('returns unsupported message for unknown language', () => {
      const code = generateCodeSnippet(
        'unknown-lang' as CodeLanguage,
        SIMPLE_GET
      );
      expect(code).toBe('// Unsupported language');
    });
  });

  describe('javascript-fetch', () => {
    it('generates GET request', () => {
      const code = generateCodeSnippet('javascript-fetch', SIMPLE_GET);
      expect(code).toContain('fetch(');
      expect(code).toContain('https://api.example.com/users');
      expect(code).toContain("method: 'GET'");
      expect(code).toContain('Accept');
    });

    it('generates POST with body', () => {
      const code = generateCodeSnippet('javascript-fetch', POST_JSON);
      expect(code).toContain("method: 'POST'");
      expect(code).toContain('body:');
      expect(code).toContain('Alice');
    });

    it('omits body for GET', () => {
      const code = generateCodeSnippet('javascript-fetch', SIMPLE_GET);
      expect(code).not.toContain('body:');
    });
  });

  describe('javascript-axios', () => {
    it('generates GET request', () => {
      const code = generateCodeSnippet('javascript-axios', SIMPLE_GET);
      expect(code).toContain('axios');
      expect(code).toContain('https://api.example.com/users');
      expect(code).toContain('axios.get');
    });

    it('generates POST with data', () => {
      const code = generateCodeSnippet('javascript-axios', POST_JSON);
      expect(code).toContain('axios.post');
      expect(code).toContain('Alice');
    });
  });

  describe('python-requests', () => {
    it('generates GET request', () => {
      const code = generateCodeSnippet('python-requests', SIMPLE_GET);
      expect(code).toContain('import requests');
      expect(code).toContain('requests.get');
      expect(code).toContain('https://api.example.com/users');
    });

    it('generates POST with body', () => {
      const code = generateCodeSnippet('python-requests', POST_JSON);
      expect(code).toContain('requests.post');
      expect(code).toContain('data=');
    });

    it('includes headers', () => {
      const code = generateCodeSnippet('python-requests', POST_JSON);
      expect(code).toContain('headers=');
      expect(code).toContain('Authorization');
    });
  });

  describe('node-http', () => {
    it('generates code using https module for https URL', () => {
      const code = generateCodeSnippet('node-http', SIMPLE_GET);
      expect(code).toContain("require('https')");
      expect(code).toContain('api.example.com');
    });

    it('generates code using http module for http URL', () => {
      const httpReq: CodeGenRequest = {
        ...SIMPLE_GET,
        url: 'http://api.example.com/users',
      };
      const code = generateCodeSnippet('node-http', httpReq);
      expect(code).toContain("require('http')");
    });

    it('includes method in options', () => {
      const code = generateCodeSnippet('node-http', POST_JSON);
      expect(code).toContain("method: 'POST'");
    });
  });

  describe('java', () => {
    it('generates HttpURLConnection code', () => {
      const code = generateCodeSnippet('java', SIMPLE_GET);
      expect(code).toContain('HttpURLConnection');
      expect(code).toContain('https://api.example.com/users');
      expect(code).toContain('GET');
    });

    it('writes body for POST', () => {
      const code = generateCodeSnippet('java', POST_JSON);
      expect(code).toContain('setDoOutput(true)');
      expect(code).toContain('getOutputStream');
    });
  });

  describe('go', () => {
    it('generates Go net/http code', () => {
      const code = generateCodeSnippet('go', SIMPLE_GET);
      expect(code).toContain('net/http');
      expect(code).toContain('https://api.example.com/users');
      expect(code).toContain('http.NewRequest');
    });

    it('includes body for POST', () => {
      const code = generateCodeSnippet('go', POST_JSON);
      expect(code).toContain('strings.NewReader');
      expect(code).toContain('"POST"');
    });
  });

  describe('php-curl', () => {
    it('generates PHP cURL code', () => {
      const code = generateCodeSnippet('php-curl', SIMPLE_GET);
      expect(code).toContain('curl_init');
      expect(code).toContain('CURLOPT_URL');
      expect(code).toContain('https://api.example.com/users');
    });

    it('sets POST fields for POST', () => {
      const code = generateCodeSnippet('php-curl', POST_JSON);
      expect(code).toContain('CURLOPT_POSTFIELDS');
      expect(code).toContain('CURLOPT_CUSTOMREQUEST');
    });
  });

  describe('csharp', () => {
    it('generates C# HttpClient code', () => {
      const code = generateCodeSnippet('csharp', SIMPLE_GET);
      expect(code).toContain('HttpClient');
      expect(code).toContain('https://api.example.com/users');
    });

    it('sets content for POST', () => {
      const code = generateCodeSnippet('csharp', POST_JSON);
      expect(code).toContain('StringContent');
      expect(code).toContain('PostAsync');
    });
  });

  describe('special characters', () => {
    it('escapes single quotes in URL for JavaScript', () => {
      const req: CodeGenRequest = {
        method: 'GET',
        url: "https://api.example.com/users?name=O'Brien",
        headers: {},
      };
      const code = generateCodeSnippet('javascript-fetch', req);
      expect(code).toContain("O\\'Brien");
    });

    it('handles empty headers gracefully', () => {
      const req: CodeGenRequest = {
        method: 'GET',
        url: 'https://api.example.com/',
        headers: {},
      };
      for (const lang of CODE_LANGUAGES) {
        const code = generateCodeSnippet(lang.id, req);
        expect(code).toBeTruthy();
      }
    });

    it('handles request with no body for POST', () => {
      const req: CodeGenRequest = {
        method: 'POST',
        url: 'https://api.example.com/submit',
        headers: { 'Content-Type': 'text/plain' },
      };
      for (const lang of CODE_LANGUAGES) {
        const code = generateCodeSnippet(lang.id, req);
        expect(code).toBeTruthy();
      }
    });
  });
});
