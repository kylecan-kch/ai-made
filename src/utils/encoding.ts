/**
 * Text decoding helpers for imported files (VCF / CSV).
 *
 * Chinese contact files are frequently GBK/GB18030 encoded (old Android phones,
 * Excel on Chinese Windows "CSV" export) or UTF-16 (some Outlook exports).
 * Reading them with a hard-coded UTF-8 decoder silently produces mojibake, so we
 * sniff the BOM first, then try strict UTF-8, then fall back to GB18030
 * (a superset of GBK / GB2312).
 */

export type DetectedEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030';

export function detectTextEncoding(bytes: Uint8Array): DetectedEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'utf-8';
  } catch {
    return 'gb18030';
  }
}

/**
 * Decode raw file bytes into a JS string, auto-detecting UTF-8 / UTF-16 / GBK.
 * The returned string never starts with a BOM.
 */
export function decodeTextBuffer(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const enc = detectTextEncoding(bytes);
  let text: string;
  try {
    text = new TextDecoder(enc).decode(bytes);
  } catch {
    // Environment without the requested decoder (e.g. a runtime lacking full ICU)
    text = new TextDecoder('utf-8').decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Normalize a vCard CHARSET parameter into a label TextDecoder understands. */
export function normalizeCharsetLabel(charset: string): string {
  const c = (charset || '').trim().replace(/^"|"$/g, '').toLowerCase();
  if (!c) return 'utf-8';
  if (c === 'gb2312' || c === 'gbk' || c === 'cp936' || c === 'gb18030' || c === 'x-gbk') return 'gb18030';
  return c;
}
