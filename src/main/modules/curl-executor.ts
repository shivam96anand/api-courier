import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { URL } from 'url';
import {
  CurlExecuteRequest,
  CurlExecuteResponse,
  CurlParsed,
} from '../../shared/types';
import { resolveStatusText } from '../../shared/http-status';

/** Active curl requests for cancellation support */
const activeRequests = new Map<string, http.ClientRequest>();

/**
 * Default User-Agent applied when the user hasn't provided one,
 * mirroring what the system `curl` binary would send. Some APIs
 * (e.g. GitHub) reject requests without a User-Agent, so matching
 * terminal behavior here avoids spurious 403s.
 */
const DEFAULT_CURL_USER_AGENT = 'curl/8.4.0';

/** Human-readable labels for the shell operators we refuse to run. */
const SHELL_OPERATOR_LABELS: Record<string, string> = {
  '|': 'a pipe (|)',
  '||': 'a logical OR (||)',
  '&&': 'a logical AND (&&)',
  ';': 'a command separator (;)',
  '>': 'an output redirect (>)',
  '<': 'an input redirect (<)',
  '`': 'backtick command substitution (`)',
  '$(': 'command substitution ($(...))',
};

/**
 * Finds the first shell control operator that sits outside quotes.
 * Everything inside single/double quotes is data for the HTTP executor,
 * so `-d '{"a":"b|c"}'` must not be treated as a pipe.
 */
function findUnquotedShellOperator(
  input: string
): { operator: string; index: number } | null {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const prev = input[i - 1];
    if (ch === "'" && !inDouble && prev !== '\\') {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && prev !== '\\') {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble) {
      if (ch === '&' && input[i + 1] === '&')
        return { operator: '&&', index: i };
      if (ch === '|' && input[i + 1] === '|')
        return { operator: '||', index: i };
      if (ch === '$' && input[i + 1] === '(')
        return { operator: '$(', index: i };
      if (ch === '|' || ch === ';' || ch === '>' || ch === '<' || ch === '`') {
        return { operator: ch, index: i };
      }
    }
  }
  return null;
}

/**
 * Strip everything from the first unquoted shell pipeline / redirect /
 * command separator onward, so those tokens don't leak into the parsed
 * flags. Parsing stays lenient; {@link validateCurlCommand} is what
 * decides whether the command may actually run.
 */
function stripShellPipeline(input: string): string {
  const found = findUnquotedShellOperator(input);
  return found ? input.slice(0, found.index).trim() : input;
}

/** Collapse line continuations and repeated whitespace into one line. */
function normalizeCommand(raw: string): string {
  return raw
    .replace(/\\\s*\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type CurlValidation = { ok: true } | { ok: false; reason: string };

/**
 * Gate for {@link executeCurl}. Restbro runs curl commands through its own
 * Node HTTP client and never through a shell, so anything that only makes
 * sense to a shell is rejected rather than silently ignored.
 */
export function validateCurlCommand(raw: string): CurlValidation {
  const normalized = normalizeCommand(raw);

  if (!normalized) {
    return { ok: false, reason: 'Enter a cURL command to run.' };
  }

  const found = findUnquotedShellOperator(normalized);
  if (found) {
    const label = SHELL_OPERATOR_LABELS[found.operator] ?? found.operator;
    const hint =
      found.operator === '|' || found.operator === '||'
        ? ' Restbro already formats JSON responses, so piping to a tool like jq is not needed.'
        : ' Only a single curl command can be run here.';
    return {
      ok: false,
      reason: `This command contains ${label}, which Restbro does not run.${hint}`,
    };
  }

  const tokens = tokenize(normalized);
  // Tolerate a copied shell prompt marker such as "$ curl ...".
  const first = tokens[0] === '$' || tokens[0] === '#' ? tokens[1] : tokens[0];
  if ((first ?? '').toLowerCase() !== 'curl') {
    return {
      ok: false,
      reason:
        'Only curl commands can be run here. The command must start with "curl".',
    };
  }

  return { ok: true };
}

/**
 * Parse a raw curl command string into structured components.
 * Handles single-quoted, double-quoted, and unquoted arguments.
 */
export function parseCurlCommand(raw: string): CurlParsed {
  // Normalize line continuations and whitespace, then drop any trailing
  // shell pipeline so we only parse the curl invocation itself.
  const cleaned = stripShellPipeline(normalizeCommand(raw));

  const tokens = tokenize(cleaned);

  let method = 'GET';
  let url = '';
  const headers: Record<string, string> = {};
  let body: string | undefined;
  const flags: string[] = [];

  let i = 0;
  // Skip leading 'curl' if present
  if (tokens[0]?.toLowerCase() === 'curl') i = 1;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      method = (tokens[++i] || 'GET').toUpperCase();
    } else if (token === '-H' || token === '--header') {
      const headerStr = tokens[++i] || '';
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx > 0) {
        const key = headerStr.slice(0, colonIdx).trim();
        const val = headerStr.slice(colonIdx + 1).trim();
        headers[key] = val;
      }
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary'
    ) {
      const data = tokens[++i] || '';
      body = body ? `${body}&${data}` : data;
      if (method === 'GET') method = 'POST';
    } else if (token === '--data-urlencode') {
      const data = tokens[++i] || '';
      body = body ? `${body}&${data}` : data;
      if (method === 'GET') method = 'POST';
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (token === '-u' || token === '--user') {
      const credentials = tokens[++i] || '';
      headers['Authorization'] =
        `Basic ${Buffer.from(credentials).toString('base64')}`;
    } else if (token === '-A' || token === '--user-agent') {
      headers['User-Agent'] = tokens[++i] || '';
    } else if (token === '-b' || token === '--cookie') {
      headers['Cookie'] = tokens[++i] || '';
    } else if (token === '-e' || token === '--referer') {
      headers['Referer'] = tokens[++i] || '';
    } else if (
      token === '-k' ||
      token === '--insecure' ||
      token === '-L' ||
      token === '--location' ||
      token === '-v' ||
      token === '--verbose' ||
      token === '-s' ||
      token === '--silent' ||
      token === '-S' ||
      token === '--show-error' ||
      token === '-i' ||
      token === '--include' ||
      token === '--compressed'
    ) {
      flags.push(token);
    } else if (token === '--connect-timeout' || token === '--max-time') {
      flags.push(`${token} ${tokens[++i] || ''}`);
    } else if (!token.startsWith('-') && !url) {
      url = token;
    } else {
      // Collect unknown flags
      flags.push(token);
    }

    i++;
  }

  // If URL has no protocol, prepend https://
  if (url && !url.match(/^https?:\/\//i)) {
    url = `https://${url}`;
  }

  return { method, url, headers, body, flags };
}

/** Tokenize a curl command respecting quoted strings */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && input[i] === ' ') i++;
    if (i >= input.length) break;

    const ch = input[i];
    if (ch === "'" || ch === '"') {
      // Quoted string
      const quote = ch;
      i++;
      let token = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && quote === '"' && i + 1 < input.length) {
          i++;
          token += input[i];
        } else {
          token += input[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push(token);
    } else if (ch === '$' && i + 1 < input.length && input[i + 1] === "'") {
      // $'...' ANSI-C quoting (common in copied browser curls)
      i += 2;
      let token = '';
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
          token += input[i];
        } else {
          token += input[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push(token);
    } else {
      // Unquoted token
      let token = '';
      while (i < input.length && input[i] !== ' ') {
        token += input[i];
        i++;
      }
      tokens.push(token);
    }
  }

  return tokens;
}

/** Execute a parsed curl command using Node http/https */
export async function executeCurl(
  request: CurlExecuteRequest
): Promise<CurlExecuteResponse> {
  const { id, rawCommand } = request;
  const parsed = parseCurlCommand(rawCommand);
  const startTime = Date.now();

  // Enforced here rather than only in the renderer: this handler is
  // reachable from any renderer code holding the preload bridge.
  const validation = validateCurlCommand(rawCommand);
  if (!validation.ok) {
    return {
      id,
      status: 0,
      statusText: 'Blocked',
      headers: {},
      body: validation.reason,
      time: 0,
      size: 0,
      parsed,
      error: validation.reason,
    };
  }

  if (!parsed.url) {
    return {
      id,
      status: 0,
      statusText: 'Error',
      headers: {},
      body: 'No URL found in curl command',
      time: 0,
      size: 0,
      parsed,
      error: 'No URL found in curl command',
    };
  }

  try {
    const parsedUrl = new URL(parsed.url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    const insecure = parsed.flags.some((f) => f === '-k' || f === '--insecure');
    const followRedirects = parsed.flags.some(
      (f) => f === '-L' || f === '--location'
    );

    const doRequest = (
      targetUrl: URL,
      redirectCount: number
    ): Promise<CurlExecuteResponse> => {
      return new Promise((resolve) => {
        // Apply curl's implicit defaults so behavior matches the
        // terminal `curl` binary. Only fill in headers the user hasn't
        // explicitly provided (case-insensitive check).
        const requestHeaders: Record<string, string> = { ...parsed.headers };
        const lowerKeys = new Set(
          Object.keys(requestHeaders).map((k) => k.toLowerCase())
        );
        if (!lowerKeys.has('user-agent')) {
          requestHeaders['User-Agent'] = DEFAULT_CURL_USER_AGENT;
        }
        if (!lowerKeys.has('accept')) {
          requestHeaders['Accept'] = '*/*';
        }

        const options: http.RequestOptions = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
          path: targetUrl.pathname + targetUrl.search,
          method: parsed.method,
          headers: requestHeaders,
          ...(insecure && targetUrl.protocol === 'https:'
            ? { rejectUnauthorized: false }
            : {}),
        };

        const reqModule = targetUrl.protocol === 'https:' ? https : http;
        const req = reqModule.request(options, (res) => {
          // Handle redirects
          if (
            followRedirects &&
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location &&
            redirectCount < 10
          ) {
            const redirectUrl = new URL(
              res.headers.location,
              targetUrl.toString()
            );
            res.resume(); // Drain response
            resolve(doRequest(redirectUrl, redirectCount + 1));
            return;
          }

          const chunks: Buffer[] = [];
          const isGzip = res.headers['content-encoding'] === 'gzip';
          const isBr = res.headers['content-encoding'] === 'br';
          const isDeflate = res.headers['content-encoding'] === 'deflate';

          let stream: NodeJS.ReadableStream = res;
          if (isGzip) stream = res.pipe(zlib.createGunzip());
          else if (isBr) stream = res.pipe(zlib.createBrotliDecompress());
          else if (isDeflate) stream = res.pipe(zlib.createInflate());

          stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          stream.on('end', () => {
            activeRequests.delete(id);
            const bodyBuf = Buffer.concat(chunks);
            const bodyStr = bodyBuf.toString('utf-8');
            const endTime = Date.now();

            const responseHeaders: Record<string, string> = {};
            for (const [key, val] of Object.entries(res.headers)) {
              responseHeaders[key] = Array.isArray(val)
                ? val.join(', ')
                : val || '';
            }

            resolve({
              id,
              status: res.statusCode || 0,
              statusText: resolveStatusText(res.statusCode, res.statusMessage),
              headers: responseHeaders,
              body: bodyStr,
              time: endTime - startTime,
              size: bodyBuf.length,
              parsed,
            });
          });

          stream.on('error', (err) => {
            activeRequests.delete(id);
            resolve({
              id,
              status: res.statusCode || 0,
              statusText: 'Decompression Error',
              headers: {},
              body: err.message,
              time: Date.now() - startTime,
              size: 0,
              parsed,
              error: err.message,
            });
          });
        });

        req.on('error', (err) => {
          activeRequests.delete(id);
          resolve({
            id,
            status: 0,
            statusText: 'Error',
            headers: {},
            body: err.message,
            time: Date.now() - startTime,
            size: 0,
            parsed,
            error: err.message,
          });
        });

        activeRequests.set(id, req);

        if (parsed.body) {
          req.write(parsed.body);
        }
        req.end();
      });
    };

    return await doRequest(parsedUrl, 0);
  } catch (err: any) {
    return {
      id,
      status: 0,
      statusText: 'Error',
      headers: {},
      body: err.message || String(err),
      time: Date.now() - startTime,
      size: 0,
      parsed,
      error: err.message || String(err),
    };
  }
}

/** Cancel an active curl request */
export function cancelCurl(requestId: string): boolean {
  const req = activeRequests.get(requestId);
  if (req) {
    req.destroy();
    activeRequests.delete(requestId);
    return true;
  }
  return false;
}
