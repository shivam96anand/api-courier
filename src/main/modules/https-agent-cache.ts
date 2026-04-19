import * as https from 'https';
import * as crypto from 'crypto';
import type { ApiRequest } from '../../shared/types';
import { parseKeystoreJks, parseTruststoreJks } from './jks-parser';

/**
 * https.Agent factory + cache.
 *
 * Why a cache: every mTLS request was previously building a brand-new
 * https.Agent (and re-parsing the JKS keystore) on every send. Agents own
 * the underlying TCP connection pool, so a fresh agent per request defeats
 * keep-alive entirely — visible as 200-400 ms of extra TLS handshake on
 * every request to the same host.
 *
 * The cache key is a fingerprint of the materially-different agent options
 * (cert / key / ca / pfx / passphrase / rejectUnauthorized). When two
 * requests share the same fingerprint they share an Agent and therefore a
 * connection pool.
 */

const agentCache = new Map<string, https.Agent>();

/**
 * Build (or return a cached) https.Agent for a request. Returns `undefined`
 * when the request neither uses mTLS certs nor explicitly opts into
 * insecure TLS — letting Node fall back to the default global agent.
 */
export function getHttpsAgentForRequest(
  request: ApiRequest
): https.Agent | undefined {
  const agentOptions: https.AgentOptions = {};

  if (request.soapCerts) {
    const sc = request.soapCerts;
    if (!sc.mode || sc.mode === 'jks') {
      if (sc.keystoreJks && sc.keystorePassword) {
        const ks = parseKeystoreJks(sc.keystoreJks, sc.keystorePassword);
        if (ks.cert) agentOptions.cert = ks.cert;
        if (ks.key) agentOptions.key = ks.key;
      }
      if (sc.truststoreJks && sc.truststorePassword) {
        const ts = parseTruststoreJks(sc.truststoreJks, sc.truststorePassword);
        if (ts.ca) agentOptions.ca = ts.ca;
      }
    } else {
      if (sc.clientCert?.content) agentOptions.cert = sc.clientCert.content;
      if (sc.clientKey?.content) agentOptions.key = sc.clientKey.content;
      if (sc.caCert?.content) agentOptions.ca = sc.caCert.content;
      if (sc.pfx?.content)
        agentOptions.pfx = Buffer.from(sc.pfx.content, 'base64');
      if (sc.passphrase) agentOptions.passphrase = sc.passphrase;
    }
  }

  if (request.allowInsecureTls) {
    agentOptions.rejectUnauthorized = false;
  }

  // No relevant options → use Node's default global agent.
  if (Object.keys(agentOptions).length === 0) {
    return undefined;
  }

  // Always enable keep-alive for cached agents — the whole point of caching
  // is to reuse the underlying TCP/TLS connection.
  agentOptions.keepAlive = true;

  const key = fingerprintAgentOptions(agentOptions);
  let agent = agentCache.get(key);
  if (!agent) {
    agent = new https.Agent(agentOptions);
    agentCache.set(key, agent);
  }
  return agent;
}

function fingerprintAgentOptions(opts: https.AgentOptions): string {
  const hash = crypto.createHash('sha256');
  const norm = (
    v: string | Buffer | (string | Buffer)[] | undefined
  ): string => {
    if (v === undefined) return '';
    if (Array.isArray(v)) return v.map((x) => norm(x)).join('|');
    if (Buffer.isBuffer(v)) return v.toString('base64');
    return v;
  };
  hash.update(norm(opts.cert as string | Buffer | undefined));
  hash.update('|');
  hash.update(norm(opts.key as string | Buffer | undefined));
  hash.update('|');
  hash.update(norm(opts.ca as string | Buffer | undefined));
  hash.update('|');
  hash.update(norm(opts.pfx as string | Buffer | undefined));
  hash.update('|');
  hash.update(opts.passphrase || '');
  hash.update('|');
  hash.update(opts.rejectUnauthorized === false ? 'insecure' : 'secure');
  return hash.digest('hex');
}

/** Test-only helper: drop the cache (also useful when settings change). */
export function clearHttpsAgentCache(): void {
  for (const agent of agentCache.values()) {
    agent.destroy();
  }
  agentCache.clear();
}
