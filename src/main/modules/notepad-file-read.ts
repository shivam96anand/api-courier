/**
 * Reading a user-selected file into a string for the Notepad.
 *
 * The Notepad opens *any* file the user picks, so decoding has to be forgiving:
 * UTF-8 (with or without BOM) and UTF-16 (LE/BE) are decoded properly, and
 * binary files are rejected with a clear message instead of filling the editor
 * with replacement characters.
 */
import { readFile, stat } from 'fs/promises';

/** Hard cap on a file we will read into a string (50 MB). */
export const MAX_READ_BYTES = 50 * 1024 * 1024;

/** How much of the file is inspected when guessing text vs binary. */
const SNIFF_BYTES = 8192;

export interface ReadTextFileResult {
  content?: string;
  error?: string;
}

function decode(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString('utf16le');
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      // Node has no UTF-16BE decoder — swap to LE first.
      const swapped = Buffer.from(buffer.subarray(2));
      swapped.swap16();
      return swapped.toString('utf16le');
    }
  }
  const text = buffer.toString('utf-8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Heuristic used by most editors: a NUL byte in the first few KB, or a high
 * share of non-printable control bytes, means the file isn't text.
 */
export function looksBinary(buffer: Buffer): boolean {
  if (buffer.length >= 2) {
    const bom =
      (buffer[0] === 0xff && buffer[1] === 0xfe) ||
      (buffer[0] === 0xfe && buffer[1] === 0xff);
    if (bom) return false;
  }
  const sample = buffer.subarray(0, SNIFF_BYTES);
  if (sample.length === 0) return false;
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    // Allow tab, LF, VT, FF, CR and ESC; everything else below 0x20 is odd.
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20 && byte !== 0x1b)) {
      control++;
    }
  }
  return control / sample.length > 0.3;
}

/** Read a file as text, or return a user-facing error. */
export async function readTextFile(
  filePath: string
): Promise<ReadTextFileResult> {
  const fileStat = await stat(filePath);
  if (fileStat.isDirectory()) {
    return { error: 'That path is a folder, not a file.' };
  }
  if (fileStat.size > MAX_READ_BYTES) {
    return {
      error: `File too large (${Math.round(
        fileStat.size / (1024 * 1024)
      )} MB). Maximum supported is ${Math.round(
        MAX_READ_BYTES / (1024 * 1024)
      )} MB.`,
    };
  }
  const buffer = await readFile(filePath);
  if (looksBinary(buffer)) {
    return {
      error:
        'This looks like a binary file, so it can\u2019t be shown as text.',
    };
  }
  return { content: decode(buffer) };
}
