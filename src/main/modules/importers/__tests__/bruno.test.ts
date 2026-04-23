import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isBrunoCollectionDir, mapBrunoCollection } from '../bruno';

async function writeFile(p: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf-8');
}

describe('bruno collection importer', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restbro-bruno-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('isBrunoCollectionDir true when bruno.json declares collection', async () => {
    await writeFile(
      path.join(tmpDir, 'bruno.json'),
      JSON.stringify({ name: 'My API', version: '1', type: 'collection' })
    );
    expect(await isBrunoCollectionDir(tmpDir)).toBe(true);
  });

  it('isBrunoCollectionDir false for an unrelated folder', async () => {
    await writeFile(path.join(tmpDir, 'README.md'), 'hi');
    expect(await isBrunoCollectionDir(tmpDir)).toBe(false);
  });

  it('maps a typical collection: nested folders, request, env', async () => {
    await writeFile(
      path.join(tmpDir, 'bruno.json'),
      JSON.stringify({ name: 'Users API', version: '1', type: 'collection' })
    );

    // Folder with custom display name
    await writeFile(
      path.join(tmpDir, 'Users', 'folder.bru'),
      `meta {\n  name: User Endpoints\n}\n`
    );

    // GET request with headers, query, bearer auth
    await writeFile(
      path.join(tmpDir, 'Users', 'GetUser.bru'),
      `meta {
  name: Get User
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/users/{{id}}
  body: none
  auth: bearer
}

headers {
  Accept: application/json
}

params:query {
  verbose: true
  ~skip: x
}

auth:bearer {
  token: {{token}}
}
`
    );

    // POST request with json body
    await writeFile(
      path.join(tmpDir, 'Users', 'CreateUser.bru'),
      `meta {
  name: Create User
  type: http
  seq: 2
}

post {
  url: {{baseUrl}}/users
  body: json
  auth: none
}

body:json {
  {
    "name": "alice"
  }
}
`
    );

    // Environment
    await writeFile(
      path.join(tmpDir, 'environments', 'Dev.bru'),
      `vars {
  baseUrl: https://api.dev
  token: xyz
}
`
    );

    const { rootFolder, environments } = await mapBrunoCollection(tmpDir);

    expect(rootFolder.name).toBe('Users API');
    expect(rootFolder.children).toHaveLength(1);

    const folder = rootFolder.children![0];
    expect(folder.type).toBe('folder');
    expect(folder.name).toBe('User Endpoints');
    expect(folder.children).toHaveLength(2);

    // Children sorted alphabetically by file name → CreateUser, GetUser
    const create = folder.children!.find((c) => c.name === 'Create User')!;
    const get = folder.children!.find((c) => c.name === 'Get User')!;

    expect(get.request!.method).toBe('GET');
    expect(get.request!.url).toBe('{{baseUrl}}/users/{{id}}');
    expect(get.request!.headers).toEqual({ Accept: 'application/json' });
    expect(get.request!.params).toEqual({ verbose: 'true' });
    expect(get.request!.auth).toEqual({
      type: 'bearer',
      config: { token: '{{token}}' },
    });

    expect(create.request!.method).toBe('POST');
    expect(create.request!.body).toEqual({
      type: 'json',
      content: '  {\n    "name": "alice"\n  }',
    });

    expect(environments).toHaveLength(1);
    expect(environments[0].name).toBe('Dev');
    expect(environments[0].variables).toEqual({
      baseUrl: 'https://api.dev',
      token: 'xyz',
    });
  });

  it('skips files that do not contain a verb block', async () => {
    await writeFile(
      path.join(tmpDir, 'bruno.json'),
      JSON.stringify({ name: 'C', version: '1', type: 'collection' })
    );
    await writeFile(
      path.join(tmpDir, 'NotARequest.bru'),
      `meta {\n  name: stub\n}\n`
    );
    const { rootFolder } = await mapBrunoCollection(tmpDir);
    expect(rootFolder.children).toEqual([]);
  });

  it('falls back to filename when meta.name is missing', async () => {
    await writeFile(
      path.join(tmpDir, 'bruno.json'),
      JSON.stringify({ name: 'C', version: '1', type: 'collection' })
    );
    await writeFile(
      path.join(tmpDir, 'Ping.bru'),
      `get {\n  url: https://x/ping\n  body: none\n  auth: none\n}\n`
    );
    const { rootFolder } = await mapBrunoCollection(tmpDir);
    expect(rootFolder.children).toHaveLength(1);
    expect(rootFolder.children![0].name).toBe('Ping');
    expect(rootFolder.children![0].request!.url).toBe('https://x/ping');
  });

  it('throws when given a non-Bruno folder', async () => {
    await expect(mapBrunoCollection(tmpDir)).rejects.toThrow(
      /not a Bruno collection/
    );
  });
});
