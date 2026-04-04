// eslint-disable-next-line @typescript-eslint/no-var-requires
const jksJs = require('jks-js') as {
  toPem: (
    keystore: Buffer,
    password: string
  ) => Record<string, { cert?: string; key?: string; ca?: string }>;
};

export interface JksKeystoreResult {
  cert?: string;
  key?: string;
}

export interface JksTruststoreResult {
  ca?: string;
}

/**
 * Parses a JKS keystore and returns combined PEM cert + key strings.
 * Concatenates all aliases found in the keystore.
 */
export function parseKeystoreJks(base64: string, password: string): JksKeystoreResult {
  const buf = Buffer.from(base64, 'base64');
  const parsed = jksJs.toPem(buf, password);
  const certs: string[] = [];
  const keys: string[] = [];

  for (const alias of Object.keys(parsed)) {
    const entry = parsed[alias];
    if (entry.cert) certs.push(entry.cert);
    if (entry.key) keys.push(entry.key);
  }

  return {
    cert: certs.length > 0 ? certs.join('\n') : undefined,
    key: keys.length > 0 ? keys.join('\n') : undefined,
  };
}

/**
 * Parses a JKS truststore and returns a combined PEM CA cert string.
 * Handles both `ca` entries (TrustedKeyEntry) and plain `cert` entries.
 */
export function parseTruststoreJks(base64: string, password: string): JksTruststoreResult {
  const buf = Buffer.from(base64, 'base64');
  const parsed = jksJs.toPem(buf, password);
  const cas: string[] = [];

  for (const alias of Object.keys(parsed)) {
    const entry = parsed[alias];
    if (entry.ca) cas.push(entry.ca);
    else if (entry.cert) cas.push(entry.cert); // some truststores use cert entries
  }

  return {
    ca: cas.length > 0 ? cas.join('\n') : undefined,
  };
}
