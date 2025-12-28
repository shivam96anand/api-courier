export type SystemVariableDefinition = {
  name: string;
  description: string;
  generator: () => string;
  aliases?: string[];
};

const WORDS = [
  'lunar', 'ember', 'signal', 'glow', 'vector', 'pixel', 'orbit', 'ripple', 'nova',
  'atlas', 'arrow', 'vivid', 'drift', 'shore', 'amber', 'pulse', 'mosaic', 'peak',
  'harbor', 'canyon', 'prairie', 'maple', 'amber', 'flint', 'ember', 'scarlet',
  'sable', 'ivory', 'cedar', 'spruce', 'thistle', 'echo', 'ember', 'cobalt'
];
const FIRST_NAMES = [
  'Ava', 'Liam', 'Maya', 'Noah', 'Zoe', 'Ethan', 'Ivy', 'Owen', 'Lila', 'Leo',
  'Nora', 'Kai', 'Mila', 'Aria', 'Eli', 'Sage', 'Rhea', 'Jude', 'Iris', 'Quinn'
];
const LAST_NAMES = [
  'Reed', 'Hayes', 'Clark', 'Parker', 'Reyes', 'Baker', 'Lopez', 'Stone', 'Cruz', 'Ward',
  'Bennett', 'Price', 'Woods', 'Cole', 'Nguyen', 'Patel', 'Kim', 'Diaz', 'Young', 'Shaw'
];
const COLORS = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'magenta', 'rose', 'slate', 'navy', 'olive'
];
const STATES = [
  'CA', 'NY', 'TX', 'FL', 'WA', 'IL', 'CO', 'AZ', 'MA', 'NC'
];
const COUNTRIES = [
  'United States', 'Canada', 'Mexico', 'United Kingdom', 'Germany',
  'France', 'Spain', 'India', 'Japan', 'Australia'
];
const CITIES = [
  'Seattle', 'Austin', 'Denver', 'Chicago', 'Boston', 'Phoenix', 'Portland', 'Miami',
  'Toronto', 'London'
];
const STREETS = [
  'Maple', 'Oak', 'Pine', 'Cedar', 'Elm', 'Sunset', 'River', 'Hill', 'Lake', 'Broad'
];
const TLDS = ['com', 'net', 'org', 'io', 'dev'];
const PASSWORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
const NANOID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  return min + Math.floor(getRandomNumber() * range);
}

function getRandomNumber(): number {
  const bytes = getRandomBytes(4);
  const value =
    bytes[0] * 0x1000000 +
    bytes[1] * 0x10000 +
    bytes[2] * 0x100 +
    bytes[3];
  return value / 0x100000000;
}

function getRandomBytes(length: number): Uint8Array {
  const cryptoObj = (globalThis as any)?.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }

  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function pick(list: string[]): string {
  return list[randomInt(0, list.length - 1)];
}

function randomHex(length: number): string {
  const bytes = getRandomBytes(Math.ceil(length / 2));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function generateUuidV4(): string {
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateNanoId(length = 21): string {
  const bytes = getRandomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += NANOID_ALPHABET[bytes[i] % NANOID_ALPHABET.length];
  }
  return id;
}

function encodeTimeToBase32(timeMs: number): string {
  let value = timeMs;
  let output = '';
  for (let i = 0; i < 10; i++) {
    output = CROCKFORD_BASE32[value % 32] + output;
    value = Math.floor(value / 32);
  }
  return output.padStart(10, '0');
}

function generateUlid(): string {
  const timePart = encodeTimeToBase32(Date.now());
  let randomPart = '';
  for (let i = 0; i < 16; i++) {
    randomPart += CROCKFORD_BASE32[randomInt(0, 31)];
  }
  return `${timePart}${randomPart}`;
}

function generateUsername(): string {
  const first = pick(FIRST_NAMES).toLowerCase();
  const last = pick(LAST_NAMES).toLowerCase();
  return `${first}.${last}${randomInt(1, 99)}`;
}

function generateEmail(): string {
  return `${generateUsername()}@${generateDomainName()}`;
}

function generateDomainName(): string {
  return `${pick(WORDS).toLowerCase()}.${pick(TLDS)}`;
}

function generateUrl(): string {
  return `https://www.${generateDomainName()}/${pick(WORDS).toLowerCase()}`;
}

function generatePhoneNumber(): string {
  return `${randomInt(200, 999)}-${randomInt(100, 999)}-${randomInt(1000, 9999)}`;
}

function generateStreetAddress(): string {
  return `${randomInt(100, 9999)} ${pick(STREETS)} St`;
}

function generateIPv4(): string {
  return `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function generateIPv6(): string {
  const groups = Array.from({ length: 8 }, () => randomHex(4));
  return groups.join(':');
}

function generateMacAddress(): string {
  const bytes = getRandomBytes(6);
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(':');
}

function generatePassword(length = 12): string {
  const bytes = getRandomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }
  return password;
}

function generateWords(min = 2, max = 5): string {
  const count = randomInt(min, max);
  const words = Array.from({ length: count }, () => pick(WORDS).toLowerCase());
  return words.join(' ');
}

function generateSentence(): string {
  const words = generateWords(6, 12);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

function generateParagraph(sentences = randomInt(2, 4)): string {
  const chunks = Array.from({ length: sentences }, () => generateSentence());
  return chunks.join(' ');
}

const SYSTEM_VARIABLES: SystemVariableDefinition[] = [
  {
    name: 'uuid',
    description: 'Random UUID v4',
    generator: generateUuidV4,
    aliases: ['guid', 'randomUUID']
  },
  {
    name: 'timestamp',
    description: 'Unix timestamp in seconds',
    generator: () => Math.floor(Date.now() / 1000).toString()
  },
  {
    name: 'timestampMs',
    description: 'Unix timestamp in milliseconds',
    generator: () => Date.now().toString()
  },
  {
    name: 'isoTimestamp',
    description: 'ISO-8601 timestamp',
    generator: () => new Date().toISOString(),
    aliases: ['now']
  },
  {
    name: 'date',
    description: 'Current date (YYYY-MM-DD)',
    generator: () => formatDate(new Date())
  },
  {
    name: 'time',
    description: 'Current time (HH:mm:ss)',
    generator: () => formatTime(new Date())
  },
  {
    name: 'randomInt',
    description: 'Random integer between 0 and 1000',
    generator: () => randomInt(0, 1000).toString()
  },
  {
    name: 'randomBoolean',
    description: 'Random boolean value',
    generator: () => (randomInt(0, 1) === 1).toString()
  },
  {
    name: 'randomFirstName',
    description: 'Random first name',
    generator: () => pick(FIRST_NAMES)
  },
  {
    name: 'randomLastName',
    description: 'Random last name',
    generator: () => pick(LAST_NAMES)
  },
  {
    name: 'randomFullName',
    description: 'Random full name',
    generator: () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`
  },
  {
    name: 'randomUserName',
    description: 'Random username',
    generator: generateUsername
  },
  {
    name: 'randomEmail',
    description: 'Random email address',
    generator: generateEmail
  },
  {
    name: 'randomPassword',
    description: 'Random password',
    generator: () => generatePassword(12)
  },
  {
    name: 'randomPhoneNumber',
    description: 'Random phone number',
    generator: generatePhoneNumber
  },
  {
    name: 'randomColor',
    description: 'Random color name',
    generator: () => pick(COLORS)
  },
  {
    name: 'randomHexColor',
    description: 'Random hex color',
    generator: () => `#${randomHex(6)}`
  },
  {
    name: 'randomStreetAddress',
    description: 'Random street address',
    generator: generateStreetAddress
  },
  {
    name: 'randomCity',
    description: 'Random city',
    generator: () => pick(CITIES)
  },
  {
    name: 'randomState',
    description: 'Random state code',
    generator: () => pick(STATES)
  },
  {
    name: 'randomCountry',
    description: 'Random country name',
    generator: () => pick(COUNTRIES)
  },
  {
    name: 'randomZipCode',
    description: 'Random postal code',
    generator: () => randomInt(10000, 99999).toString()
  },
  {
    name: 'randomIP',
    description: 'Random IPv4 address',
    generator: generateIPv4,
    aliases: ['randomIPv4']
  },
  {
    name: 'randomIPv6',
    description: 'Random IPv6 address',
    generator: generateIPv6
  },
  {
    name: 'randomMacAddress',
    description: 'Random MAC address',
    generator: generateMacAddress
  },
  {
    name: 'randomWord',
    description: 'Random word',
    generator: () => pick(WORDS).toLowerCase()
  },
  {
    name: 'randomWords',
    description: 'Random words',
    generator: () => generateWords(2, 5)
  },
  {
    name: 'randomLoremSentence',
    description: 'Random lorem sentence',
    generator: generateSentence
  },
  {
    name: 'randomLoremParagraph',
    description: 'Random lorem paragraph',
    generator: () => generateParagraph(randomInt(2, 4))
  },
  {
    name: 'randomLoremParagraphs',
    description: 'Random lorem paragraphs',
    generator: () => Array.from({ length: randomInt(2, 3) }, () => generateParagraph()).join('\n\n')
  },
  {
    name: 'randomDomainName',
    description: 'Random domain name',
    generator: generateDomainName
  },
  {
    name: 'randomUrl',
    description: 'Random URL',
    generator: generateUrl
  },
  {
    name: 'ulid',
    description: 'ULID (time-sortable id)',
    generator: generateUlid
  },
  {
    name: 'nanoid',
    description: 'Nano ID',
    generator: () => generateNanoId(21)
  }
];

export function getSystemVariableDefinitions(): SystemVariableDefinition[] {
  return SYSTEM_VARIABLES;
}

export function resolveSystemVariable(name: string): string | undefined {
  const match = SYSTEM_VARIABLES.find(def =>
    def.name === name || (def.aliases && def.aliases.includes(name))
  );
  return match ? match.generator() : undefined;
}
