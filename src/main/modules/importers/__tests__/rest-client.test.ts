import { describe, expect, it } from 'vitest';
import { isRestClientText, mapRestClientText } from '../rest-client';

describe('rest-client (.http) importer', () => {
  describe('isRestClientText', () => {
    it('detects valid .http content', () => {
      expect(isRestClientText('GET https://x\n')).toBe(true);
      expect(
        isRestClientText('### name\nGET https://x HTTP/1.1\nAccept: */*\n')
      ).toBe(true);
    });
    it('rejects JSON', () => {
      expect(isRestClientText('{"a":1}')).toBe(false);
    });
    it('rejects XML', () => {
      expect(isRestClientText('<?xml version="1.0"?>')).toBe(false);
    });
    it('rejects plain text without request line', () => {
      expect(isRestClientText('hello world')).toBe(false);
    });
  });

  it('parses multiple requests separated by ###', () => {
    const text = `@baseUrl = https://api.example.com

### Get users
GET {{baseUrl}}/users HTTP/1.1
Accept: application/json

### Create user
POST {{baseUrl}}/users
Content-Type: application/json

{
  "name": "alice"
}
`;
    const { rootFolder, environments } = mapRestClientText(text, 'My HTTP');
    expect(rootFolder.children).toHaveLength(2);

    const get = rootFolder.children![0].request!;
    expect(get.method).toBe('GET');
    expect(get.url).toBe('{{baseUrl}}/users');
    expect(get.headers).toEqual({ Accept: 'application/json' });
    expect(get.body).toEqual({ type: 'none', content: '' });

    const post = rootFolder.children![1].request!;
    expect(post.method).toBe('POST');
    expect(post.body).toEqual({
      type: 'json',
      content: '{\n  "name": "alice"\n}',
    });

    expect(environments).toHaveLength(1);
    expect(environments[0].variables).toEqual({
      baseUrl: 'https://api.example.com',
    });
  });

  it('handles a single request without ### separator', () => {
    const text = `GET https://x/ping
Accept: */*
`;
    const { rootFolder } = mapRestClientText(text);
    expect(rootFolder.children).toHaveLength(1);
    expect(rootFolder.children![0].request!.url).toBe('https://x/ping');
  });
});
