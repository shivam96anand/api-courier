/**
 * Code snippet generators for API requests.
 * Each generator takes a request descriptor and returns a code string.
 */

export interface CodeGenRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  contentType?: string;
}

export type CodeLanguage =
  | 'javascript-fetch'
  | 'javascript-axios'
  | 'python-requests'
  | 'node-http'
  | 'java'
  | 'go'
  | 'php-curl'
  | 'csharp';

export interface CodeLanguageOption {
  id: CodeLanguage;
  label: string;
}

export const CODE_LANGUAGES: CodeLanguageOption[] = [
  { id: 'javascript-fetch', label: 'JavaScript - Fetch' },
  { id: 'javascript-axios', label: 'JavaScript - Axios' },
  { id: 'python-requests', label: 'Python - Requests' },
  { id: 'node-http', label: 'Node.js - http' },
  { id: 'java', label: 'Java - HttpURLConnection' },
  { id: 'go', label: 'Go - net/http' },
  { id: 'php-curl', label: 'PHP - cURL' },
  { id: 'csharp', label: 'C# - HttpClient' },
];

export function generateCodeSnippet(
  lang: CodeLanguage,
  req: CodeGenRequest
): string {
  switch (lang) {
    case 'javascript-fetch':
      return generateJsFetch(req);
    case 'javascript-axios':
      return generateJsAxios(req);
    case 'python-requests':
      return generatePythonRequests(req);
    case 'node-http':
      return generateNodeHttp(req);
    case 'java':
      return generateJava(req);
    case 'go':
      return generateGo(req);
    case 'php-curl':
      return generatePhpCurl(req);
    case 'csharp':
      return generateCsharp(req);
    default:
      return '// Unsupported language';
  }
}

function escapeJs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function escapePy(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function escapeJava(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function escapeGo(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function escapePhp(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// ── JavaScript Fetch ──
function generateJsFetch(req: CodeGenRequest): string {
  const lines: string[] = [];
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD';
  const headerEntries = Object.entries(req.headers);

  lines.push(`const response = await fetch('${escapeJs(req.url)}', {`);
  lines.push(`  method: '${req.method}',`);

  if (headerEntries.length > 0) {
    lines.push('  headers: {');
    headerEntries.forEach(([k, v]) => {
      lines.push(`    '${escapeJs(k)}': '${escapeJs(v)}',`);
    });
    lines.push('  },');
  }

  if (hasBody) {
    lines.push(`  body: '${escapeJs(req.body!)}',`);
  }

  lines.push('});');
  lines.push('');
  lines.push('const data = await response.json();');
  lines.push('console.log(data);');

  return lines.join('\n');
}

// ── JavaScript Axios ──
function generateJsAxios(req: CodeGenRequest): string {
  const lines: string[] = [];
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD';
  const headerEntries = Object.entries(req.headers);
  const methodLower = req.method.toLowerCase();

  lines.push("const axios = require('axios');");
  lines.push('');

  if (hasBody) {
    lines.push(
      `const response = await axios.${methodLower}('${escapeJs(req.url)}', '${escapeJs(req.body!)}', {`
    );
  } else {
    lines.push(
      `const response = await axios.${methodLower}('${escapeJs(req.url)}', {`
    );
  }

  if (headerEntries.length > 0) {
    lines.push('  headers: {');
    headerEntries.forEach(([k, v]) => {
      lines.push(`    '${escapeJs(k)}': '${escapeJs(v)}',`);
    });
    lines.push('  },');
  }

  lines.push('});');
  lines.push('');
  lines.push('console.log(response.data);');

  return lines.join('\n');
}

// ── Python Requests ──
function generatePythonRequests(req: CodeGenRequest): string {
  const lines: string[] = [];
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD';
  const headerEntries = Object.entries(req.headers);
  const methodLower = req.method.toLowerCase();

  lines.push('import requests');
  lines.push('');

  if (headerEntries.length > 0) {
    lines.push('headers = {');
    headerEntries.forEach(([k, v]) => {
      lines.push(`    '${escapePy(k)}': '${escapePy(v)}',`);
    });
    lines.push('}');
    lines.push('');
  }

  const args: string[] = [`'${escapePy(req.url)}'`];
  if (headerEntries.length > 0) args.push('headers=headers');
  if (hasBody) args.push(`data='${escapePy(req.body!)}'`);

  lines.push(`response = requests.${methodLower}(${args.join(', ')})`);
  lines.push('');
  lines.push('print(response.status_code)');
  lines.push('print(response.json())');

  return lines.join('\n');
}

// ── Node.js http ──
function generateNodeHttp(req: CodeGenRequest): string {
  const lines: string[] = [];
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD';
  const headerEntries = Object.entries(req.headers);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(req.url);
  } catch {
    parsedUrl = new URL('http://localhost');
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const mod = isHttps ? 'https' : 'http';

  lines.push(`const ${mod} = require('${mod}');`);
  lines.push('');
  lines.push('const options = {');
  lines.push(`  hostname: '${escapeJs(parsedUrl.hostname)}',`);
  if (parsedUrl.port) {
    lines.push(`  port: ${parsedUrl.port},`);
  }
  lines.push(`  path: '${escapeJs(parsedUrl.pathname + parsedUrl.search)}',`);
  lines.push(`  method: '${req.method}',`);

  if (headerEntries.length > 0) {
    lines.push('  headers: {');
    headerEntries.forEach(([k, v]) => {
      lines.push(`    '${escapeJs(k)}': '${escapeJs(v)}',`);
    });
    lines.push('  },');
  }

  lines.push('};');
  lines.push('');
  lines.push(`const req = ${mod}.request(options, (res) => {`);
  lines.push("  let data = '';");
  lines.push("  res.on('data', (chunk) => { data += chunk; });");
  lines.push("  res.on('end', () => { console.log(data); });");
  lines.push('});');
  lines.push('');
  lines.push("req.on('error', (e) => { console.error(e); });");

  if (hasBody) {
    lines.push(`req.write('${escapeJs(req.body!)}');`);
  }

  lines.push('req.end();');

  return lines.join('\n');
}

// ── Java HttpURLConnection ──
function generateJava(req: CodeGenRequest): string {
  const lines: string[] = [];
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD';
  const headerEntries = Object.entries(req.headers);

  lines.push('import java.net.HttpURLConnection;');
  lines.push('import java.net.URL;');
  lines.push('import java.io.*;');
  lines.push('');
  lines.push(`URL url = new URL("${escapeJava(req.url)}");`);
  lines.push(
    'HttpURLConnection con = (HttpURLConnection) url.openConnection();'
  );
  lines.push(`con.setRequestMethod("${req.method}");`);

  headerEntries.forEach(([k, v]) => {
    lines.push(
      `con.setRequestProperty("${escapeJava(k)}", "${escapeJava(v)}");`
    );
  });

  if (hasBody) {
    lines.push('con.setDoOutput(true);');
    lines.push('try (OutputStream os = con.getOutputStream()) {');
    lines.push(
      `    byte[] input = "${escapeJava(req.body!)}".getBytes("utf-8");`
    );
    lines.push('    os.write(input, 0, input.length);');
    lines.push('}');
  }

  lines.push('');
  lines.push('int status = con.getResponseCode();');
  lines.push(
    'BufferedReader in = new BufferedReader(new InputStreamReader(con.getInputStream()));'
  );
  lines.push('String line;');
  lines.push('StringBuilder content = new StringBuilder();');
  lines.push('while ((line = in.readLine()) != null) {');
  lines.push('    content.append(line);');
  lines.push('}');
  lines.push('in.close();');
  lines.push('con.disconnect();');
  lines.push('System.out.println(content.toString());');

  return lines.join('\n');
}

// ── Go net/http ──
function generateGo(req: CodeGenRequest): string {
  const lines: string[] = [];
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD';
  const headerEntries = Object.entries(req.headers);

  lines.push('package main');
  lines.push('');
  lines.push('import (');
  lines.push('    "fmt"');
  lines.push('    "io"');
  lines.push('    "net/http"');
  if (hasBody) lines.push('    "strings"');
  lines.push(')');
  lines.push('');
  lines.push('func main() {');

  if (hasBody) {
    lines.push(`    body := strings.NewReader("${escapeGo(req.body!)}")`);
    lines.push(
      `    req, err := http.NewRequest("${req.method}", "${escapeGo(req.url)}", body)`
    );
  } else {
    lines.push(
      `    req, err := http.NewRequest("${req.method}", "${escapeGo(req.url)}", nil)`
    );
  }

  lines.push('    if err != nil {');
  lines.push('        panic(err)');
  lines.push('    }');

  headerEntries.forEach(([k, v]) => {
    lines.push(`    req.Header.Set("${escapeGo(k)}", "${escapeGo(v)}")`);
  });

  lines.push('');
  lines.push('    client := &http.Client{}');
  lines.push('    resp, err := client.Do(req)');
  lines.push('    if err != nil {');
  lines.push('        panic(err)');
  lines.push('    }');
  lines.push('    defer resp.Body.Close()');
  lines.push('');
  lines.push('    respBody, _ := io.ReadAll(resp.Body)');
  lines.push('    fmt.Println(string(respBody))');
  lines.push('}');

  return lines.join('\n');
}

// ── PHP cURL ──
function generatePhpCurl(req: CodeGenRequest): string {
  const lines: string[] = [];
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD';
  const headerEntries = Object.entries(req.headers);

  lines.push('<?php');
  lines.push('');
  lines.push('$ch = curl_init();');
  lines.push(`curl_setopt($ch, CURLOPT_URL, '${escapePhp(req.url)}');`);
  lines.push('curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);');
  lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${req.method}');`);

  if (headerEntries.length > 0) {
    lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [');
    headerEntries.forEach(([k, v]) => {
      lines.push(`    '${escapePhp(k)}: ${escapePhp(v)}',`);
    });
    lines.push(']);');
  }

  if (hasBody) {
    lines.push(
      `curl_setopt($ch, CURLOPT_POSTFIELDS, '${escapePhp(req.body!)}');`
    );
  }

  lines.push('');
  lines.push('$response = curl_exec($ch);');
  lines.push('curl_close($ch);');
  lines.push('');
  lines.push('echo $response;');

  return lines.join('\n');
}

// ── C# HttpClient ──
function generateCsharp(req: CodeGenRequest): string {
  const lines: string[] = [];
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD';
  const headerEntries = Object.entries(req.headers);

  lines.push('using System.Net.Http;');
  lines.push('');
  lines.push('var client = new HttpClient();');

  const contentTypeHeader = headerEntries.find(
    ([k]) => k.toLowerCase() === 'content-type'
  );
  const nonContentHeaders = headerEntries.filter(
    ([k]) => k.toLowerCase() !== 'content-type'
  );

  nonContentHeaders.forEach(([k, v]) => {
    lines.push(
      `client.DefaultRequestHeaders.Add("${escapeJava(k)}", "${escapeJava(v)}");`
    );
  });

  if (hasBody) {
    const ct = contentTypeHeader?.[1] || req.contentType || 'text/plain';
    lines.push(
      `var content = new StringContent("${escapeJava(req.body!)}", System.Text.Encoding.UTF8, "${escapeJava(ct)}");`
    );
  }

  const methodMap: Record<string, string> = {
    GET: 'GetAsync',
    POST: 'PostAsync',
    PUT: 'PutAsync',
    DELETE: 'DeleteAsync',
    PATCH: 'PatchAsync',
  };

  const asyncMethod = methodMap[req.method];
  if (asyncMethod && !hasBody) {
    lines.push(
      `var response = await client.${asyncMethod}("${escapeJava(req.url)}");`
    );
  } else if (asyncMethod && hasBody) {
    lines.push(
      `var response = await client.${asyncMethod}("${escapeJava(req.url)}", content);`
    );
  } else {
    lines.push(
      `var request = new HttpRequestMessage(new HttpMethod("${req.method}"), "${escapeJava(req.url)}");`
    );
    if (hasBody) lines.push('request.Content = content;');
    lines.push('var response = await client.SendAsync(request);');
  }

  lines.push('var body = await response.Content.ReadAsStringAsync();');
  lines.push('Console.WriteLine(body);');

  return lines.join('\n');
}
