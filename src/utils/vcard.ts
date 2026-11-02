import { Contact, PhoneEntry, EmailEntry, AddressEntry, VCardExportOptions } from '../types/contact';
import { normalizeCharsetLabel } from './encoding';

/**
 * Decode Quoted-Printable string into UTF-8 or specified charset
 */
export function decodeQuotedPrintable(input: string, charset = 'utf-8'): string {
  // Strip soft line breaks (=\r\n or =\n)
  const normalized = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  const encoder = new TextEncoder();

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '=' && i + 2 < normalized.length) {
      const hex = normalized.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    const code = char.charCodeAt(0);
    if (code < 0x80) {
      bytes.push(code);
    } else {
      // Non-ASCII text that was not QP-encoded: keep it intact instead of truncating to one byte
      const cp = normalized.codePointAt(i)!;
      const encoded = encoder.encode(String.fromCodePoint(cp));
      for (let b = 0; b < encoded.length; b++) bytes.push(encoded[b]);
      if (cp > 0xffff) i++;
    }
  }

  const uint8 = new Uint8Array(bytes);
  const label = normalizeCharsetLabel(charset);
  try {
    return new TextDecoder(label).decode(uint8);
  } catch {
    // Unknown charset label: fall back to UTF-8 rather than returning raw =XX sequences
    return new TextDecoder('utf-8').decode(uint8);
  }
}

/**
 * Encode a string into Quoted-Printable UTF-8 format
 */
export function encodeQuotedPrintable(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    // Keep ASCII printable chars except '='
    if ((byte >= 33 && byte <= 60) || (byte >= 62 && byte <= 126)) {
      result += String.fromCharCode(byte);
    } else if (byte === 32) {
      result += ' ';
    } else {
      result += '=' + byte.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return result;
}

/**
 * Unescape vCard special characters like \, \; \n \\
 * Single pass so that an escaped backslash followed by "n" ("\\n") stays a literal "\n".
 */
export function unescapeVCard(val: string): string {
  if (!val) return '';
  if (val.indexOf('\\') === -1) return val;
  return val.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch));
}

/**
 * Split a raw (still escaped) vCard value on an unescaped separator.
 * "A\;B;C" split on ';' -> ["A\;B", "C"]
 */
export function splitEscaped(val: string, sep: string): string[] {
  if (val.indexOf('\\') === -1) return val.split(sep);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < val.length; i++) {
    const ch = val[i];
    if (ch === '\\' && i + 1 < val.length) {
      cur += ch + val[i + 1];
      i++;
      continue;
    }
    if (ch === sep) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Escape string for vCard value
 */
export function escapeVCard(val: string): string {
  if (!val) return '';
  return val
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n|\r/g, '\\n');
}

/**
 * Remove CR/LF from values that are written without escaping (EMAIL, URL, BDAY),
 * so that a field value can never inject extra vCard properties / cards.
 */
function stripLineBreaks(val: string): string {
  return val.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Generate a random unique ID
 */
export function generateId(): string {
  return 'c_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

/**
 * Infer Chinese or Western name splitting if only Full Name is provided
 */
export function splitFullName(fullName: string): { familyName: string; givenName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { familyName: '', givenName: '' };

  // Common Chinese two-character compound surnames
  const compoundSurnames = [
    '欧阳', '太史', '端木', '上官', '司马', '东方', '独孤', '南宫', '万俟', '闻人', 
    '夏侯', '诸葛', '尉迟', '公羊', '赫连', '澹台', '皇甫', '宗政', '濮阳', '淳于', 
    '单于', '太叔', '申屠', '公孙', '仲孙', '轩辕', '令狐', '钟离', '宇文', '长孙', 
    '慕容', '鲜于', '闾丘', '司徒', '司空', '亓官', '司寇', '仉督', '子车', '颛孙'
  ];

  // If Chinese (CJK characters) without spaces
  const isChinese = /^[\u4e00-\u9fa5]+$/.test(trimmed);
  if (isChinese) {
    if (trimmed.length === 1) {
      return { familyName: trimmed, givenName: '' };
    }
    for (const compound of compoundSurnames) {
      if (trimmed.startsWith(compound)) {
        return {
          familyName: compound,
          givenName: trimmed.substring(compound.length),
        };
      }
    }
    // Single character surname
    return {
      familyName: trimmed.charAt(0),
      givenName: trimmed.substring(1),
    };
  }

  // Western or space-separated names
  if (trimmed.includes(' ')) {
    const parts = trimmed.split(/\s+/);
    if (parts.length === 2) {
      return { givenName: parts[0], familyName: parts[1] };
    }
    return {
      givenName: parts.slice(0, -1).join(' '),
      familyName: parts[parts.length - 1],
    };
  }

  return { familyName: trimmed, givenName: '' };
}

/**
 * Clean and normalize phone number
 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[\s-]/g, '').trim();
}

/**
 * Split raw file content into logical vCard property lines.
 * - Handles CRLF / LF / CR
 * - RFC 2425/6350 line folding (continuation line starts with space or tab)
 * - vCard 2.1 Quoted-Printable soft line breaks (line ends with "=" and continues on the next line)
 */
function toLogicalLines(rawContent: string): string[] {
  const physical = rawContent.split(/\r\n|\r|\n/);
  const logical: string[] = [];
  let qpOpen = false;
  for (const line of physical) {
    if (logical.length > 0 && qpOpen && line.trim().toUpperCase() !== 'END:VCARD') {
      // Previous QP line ended with a soft break "=": drop the "=" and join
      const prev = logical[logical.length - 1];
      logical[logical.length - 1] = prev.slice(0, -1) + line;
    } else if (logical.length > 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
      logical[logical.length - 1] += line.substring(1);
    } else {
      logical.push(line);
    }
    const cur = logical[logical.length - 1];
    qpOpen = cur.charCodeAt(cur.length - 1) === 61 /* '=' */ && /^[^:]*QUOTED-PRINTABLE/i.test(cur);
  }
  return logical;
}

/** Index of the first ':' that is not inside a double-quoted parameter value */
function findValueColon(line: string): number {
  const simple = line.indexOf(':');
  const quote = line.indexOf('"');
  if (quote === -1 || (simple !== -1 && simple < quote)) return simple;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) return i;
  }
  return -1;
}

/** Split on a separator that is not inside double quotes */
function splitOutsideQuotes(str: string, sep: string): string[] {
  if (str.indexOf('"') === -1) return str.split(sep);
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of str) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

interface ParsedProperty {
  name: string;
  params: Record<string, string>;
  rawValue: string;
}

function parsePropertyLine(line: string): ParsedProperty | null {
  const colonIdx = findValueColon(line);
  if (colonIdx === -1) return null;
  const propAndParams = line.substring(0, colonIdx).trim();
  const rawValue = line.substring(colonIdx + 1).trim();
  const paramParts = splitOutsideQuotes(propAndParams, ';');
  // Strip group prefix, e.g. iOS / Google "item1.TEL" -> "TEL"
  let name = paramParts[0].trim().toUpperCase();
  const dot = name.lastIndexOf('.');
  if (dot !== -1) name = name.substring(dot + 1);

  const params: Record<string, string> = {};
  const types: string[] = [];
  for (let p = 1; p < paramParts.length; p++) {
    const paramStr = paramParts[p].trim();
    if (!paramStr) continue;
    const eq = paramStr.indexOf('=');
    if (eq !== -1) {
      const key = paramStr.substring(0, eq).trim().toUpperCase();
      const val = paramStr.substring(eq + 1).trim().replace(/"/g, '').toUpperCase();
      if (key === 'TYPE') {
        types.push(val);
      } else {
        params[key] = val;
      }
    } else {
      // vCard 2.1 bare parameters, e.g. TEL;CELL or TEL;WORK;VOICE
      const bare = paramStr.toUpperCase();
      params[bare] = 'TRUE';
      if (bare !== 'QUOTED-PRINTABLE' && bare !== 'BASE64' && bare !== '8BIT') types.push(bare);
    }
  }
  // Repeated TYPE params (iOS: TEL;type=WORK;type=VOICE;type=pref) are accumulated instead of overwritten
  if (types.length > 0) params['TYPE'] = types.join(',');
  return { name, params, rawValue };
}

/**
 * Parse raw .vcf string into an array of Contact objects
 */
export function parseVCard(rawContent: string): Contact[] {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }
  const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;

  // Line-based state machine (linear time; tolerant of a missing END:VCARD)
  const cards: string[][] = [];
  let current: string[] | null = null;
  for (const rawLine of toLogicalLines(content)) {
    const line = rawLine.trim();
    if (!line) continue;
    const upper = line.length === 11 || line.length === 9 ? line.toUpperCase() : '';
    if (upper === 'BEGIN:VCARD') {
      if (current) cards.push(current);
      current = [];
    } else if (upper === 'END:VCARD') {
      if (current) cards.push(current);
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  if (current && current.length > 0) cards.push(current);

  const contacts: Contact[] = [];
  for (const lines of cards) {
    const contact = parseCardLines(lines);
    if (contact) contacts.push(contact);
  }
  return contacts;
}

/** Split a structured value (N / ORG / ADR) on unescaped ';' and unescape each component */
function splitComponents(escaped: string, sep: string): string[] {
  const parts = splitEscaped(escaped, sep);
  for (let i = 0; i < parts.length; i++) parts[i] = unescapeVCard(parts[i]).trim();
  return parts;
}

function parseCardLines(lines: string[]): Contact | null {
    let fullName = '';
    let familyName = '';
    let givenName = '';
    const phones: PhoneEntry[] = [];
    const emails: EmailEntry[] = [];
    let organization = '';
    let department = '';
    let jobTitle = '';
    let address: AddressEntry = {
      street: '',
      city: '',
      region: '',
      postalCode: '',
      country: '',
      fullAddress: '',
    };
    let notes = '';
    let birthday = '';
    let website = '';
    const categories: string[] = [];
    let photo: string | undefined = undefined;

    for (const line of lines) {
      const prop = parsePropertyLine(line);
      if (!prop) continue;
      const { name: propName, params, rawValue } = prop;

      // Check for Quoted-Printable encoding
      const isQP = params['ENCODING'] === 'QUOTED-PRINTABLE' || params['QUOTED-PRINTABLE'] === 'TRUE';
      const charset = params['CHARSET'] || 'UTF-8';
      // Raw (still escaped) value: QP is decoded first, vCard escapes are resolved per component
      const escaped = isQP ? decodeQuotedPrintable(rawValue, charset) : rawValue;
      const value = unescapeVCard(escaped).trim();

      // Process fields
      switch (propName) {
        case 'FN': {
          fullName = value;
          break;
        }

        case 'N': {
          // RFC N is: Family;Given;Middle;Prefix;Suffix
          const nParts = splitComponents(escaped, ';');
          familyName = nParts[0] || '';
          givenName = nParts[1] || '';
          break;
        }

        case 'TEL': {
          if (!value) break;
          // Determine type
          let pType: PhoneEntry['type'] = 'CELL';
          const typeParam = params['TYPE'] || '';
          if (typeParam.includes('WORK') || params['WORK']) {
            pType = 'WORK';
          } else if (typeParam.includes('HOME') || params['HOME']) {
            pType = 'HOME';
          } else if (typeParam.includes('MAIN') || params['MAIN']) {
            pType = 'MAIN';
          } else if (typeParam.includes('CELL') || typeParam.includes('VOICE') || params['CELL']) {
            pType = 'CELL';
          } else if (typeParam.includes('OTHER')) {
            pType = 'OTHER';
          }
          // Value may contain tel: URI
          const cleanVal = value.replace(/^tel:/i, '').trim();
          if (cleanVal) {
            phones.push({ number: cleanVal, type: pType });
          }
          break;
        }

        case 'EMAIL': {
          if (!value) break;
          let eType: EmailEntry['type'] = 'OTHER';
          const typeParam = params['TYPE'] || '';
          if (typeParam.includes('WORK') || params['WORK']) {
            eType = 'WORK';
          } else if (typeParam.includes('HOME') || params['HOME']) {
            eType = 'HOME';
          } else {
            eType = 'OTHER';
          }
          emails.push({ address: value.replace(/^mailto:/i, ''), type: eType });
          break;
        }

        case 'ORG': {
          // RFC ORG is: OrgName;Department;Division
          const orgParts = splitComponents(escaped, ';').filter(Boolean);
          if (orgParts.length > 0) {
            organization = orgParts[0];
            if (orgParts.length > 1) {
              department = orgParts.slice(1).join(' / ');
            }
          }
          break;
        }

        case 'TITLE': {
          jobTitle = value;
          break;
        }

        case 'ROLE': {
          if (!department) {
            department = value;
          }
          break;
        }

        case 'ADR': {
          // RFC ADR is: PO Box;Extended;Street;City;Region;PostalCode;Country
          const adrParts = splitComponents(escaped, ';');
          const street = [adrParts[0], adrParts[1], adrParts[2]].filter(Boolean).join(' ');
          const city = adrParts[3] || '';
          const region = adrParts[4] || '';
          const postalCode = adrParts[5] || '';
          const country = adrParts[6] || '';

          const fullAddr = [country, region, city, street].filter(Boolean).join(' ');
          address = {
            street,
            city,
            region,
            postalCode,
            country,
            fullAddress: fullAddr,
          };
          break;
        }

        case 'NOTE': {
          notes = value;
          break;
        }

        case 'BDAY': {
          birthday = value;
          break;
        }

        case 'URL': {
          website = value;
          break;
        }

        case 'CATEGORIES':
        case 'X-CATEGORIES':
        case 'X-GROUP-MEMBERSHIP': {
          const cats = splitEscaped(escaped, ',')
            .flatMap(c => splitEscaped(c, ';'))
            .map(c => unescapeVCard(c).trim())
            .filter(Boolean);
          categories.push(...cats);
          break;
        }

        case 'PHOTO': {
          const encodingParam = params['ENCODING'] || '';
          if (rawValue.startsWith('data:image') || /^https?:/i.test(rawValue)) {
            photo = rawValue;
          } else if (encodingParam === 'BASE64' || encodingParam === 'B' || params['BASE64'] || params['B']) {
            // vCard 3.0 uses ENCODING=b, vCard 2.1 uses ENCODING=BASE64
            const typeList = (params['TYPE'] || '').split(',').filter(t => /^[A-Z0-9.+-]+$/.test(t) && t !== 'PREF');
            const photoType = typeList.length > 0 ? typeList[0].toLowerCase().replace(/^image\//, '') : 'jpeg';
            photo = `data:image/${photoType};base64,${rawValue.replace(/\s+/g, '')}`;
          }
          break;
        }
      }
    }

    // Resolve full name & structured name
    if (!fullName && (familyName || givenName)) {
      // If Chinese characters, surname + given name
      if (/^[\u4e00-\u9fa5]+$/.test(familyName + givenName)) {
        fullName = familyName + givenName;
      } else {
        fullName = [givenName, familyName].filter(Boolean).join(' ');
      }
    } else if (fullName && !familyName && !givenName) {
      const split = splitFullName(fullName);
      familyName = split.familyName;
      givenName = split.givenName;
    }

    // Only add if there is some useful data (name, phone, or email)
    if (!(fullName || phones.length > 0 || emails.length > 0 || organization)) return null;
    return {
      id: generateId(),
      fullName: fullName || '未命名联系人',
      familyName,
      givenName,
      phones,
      emails,
      organization,
      department,
      jobTitle,
      address,
      notes,
      birthday,
      website,
      categories: Array.from(new Set(categories)),
      photo,
    };
}

/**
 * Generate standard RFC vCard string from Contact array
 */
export function generateVCard(contacts: Contact[], options: VCardExportOptions = { version: '3.0', encoding: 'utf-8' }): string {
  const version = options.version || '3.0';
  const is21 = version === '2.1';
  const is40 = version === '4.0';
  const useQP = options.encoding === 'quoted-printable';

  const cards = contacts.map(c => {
    const lines: string[] = [];
    lines.push('BEGIN:VCARD');
    lines.push(`VERSION:${version}`);
    lines.push('PRODID:-//VCF Contacts Hub//CN');

    // N and FN
    const fName = c.familyName || '';
    const gName = c.givenName || '';
    const fullName = c.fullName || (fName + gName) || '联系人';

    if (useQP && is21) {
      lines.push(`N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${encodeQuotedPrintable(fName)};${encodeQuotedPrintable(gName)};;;`);
      lines.push(`FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${encodeQuotedPrintable(fullName)}`);
    } else {
      lines.push(`N:${escapeVCard(fName)};${escapeVCard(gName)};;;`);
      lines.push(`FN:${escapeVCard(fullName)}`);
    }

    // Organization & Department
    if (c.organization || c.department) {
      const orgVal = [c.organization || '', c.department || ''].filter(Boolean).join(';');
      if (useQP && is21) {
        lines.push(`ORG;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${encodeQuotedPrintable(orgVal)}`);
      } else {
        lines.push(`ORG:${escapeVCard(c.organization || '')}${c.department ? ';' + escapeVCard(c.department) : ''}`);
      }
    }

    // Job Title
    if (c.jobTitle) {
      if (useQP && is21) {
        lines.push(`TITLE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${encodeQuotedPrintable(c.jobTitle)}`);
      } else {
        lines.push(`TITLE:${escapeVCard(c.jobTitle)}`);
      }
    }

    // Phones
    if (c.phones && c.phones.length > 0) {
      for (const phone of c.phones) {
        const num = normalizePhone(phone.number);
        if (!num) continue;
        const type = phone.type || 'CELL';
        if (is21) {
          lines.push(`TEL;${type};VOICE:${num}`);
        } else if (is40) {
          lines.push(`TEL;TYPE="${type.toLowerCase()},voice";VALUE=uri:tel:${num}`);
        } else {
          // vCard 3.0 standard
          lines.push(`TEL;TYPE=${type},VOICE:${num}`);
        }
      }
    }

    // Emails
    if (c.emails && c.emails.length > 0) {
      for (const email of c.emails) {
        const addr = stripLineBreaks(email.address || '');
        if (!addr) continue;
        const type = email.type || 'INTERNET';
        if (is21) {
          lines.push(`EMAIL;${type}:${addr}`);
        } else if (is40) {
          lines.push(`EMAIL;TYPE=${type.toLowerCase()}:${addr}`);
        } else {
          lines.push(`EMAIL;TYPE=INTERNET,${type}:${addr}`);
        }
      }
    }

    // Address
    if (c.address && (c.address.street || c.address.city || c.address.fullAddress)) {
      const adr = c.address;
      const street = adr.street || adr.fullAddress || '';
      const city = adr.city || '';
      const region = adr.region || '';
      const postal = adr.postalCode || '';
      const country = adr.country || '';
      lines.push(`ADR;TYPE=WORK:;;${escapeVCard(street)};${escapeVCard(city)};${escapeVCard(region)};${escapeVCard(postal)};${escapeVCard(country)}`);
    }

    // Birthday
    if (c.birthday) {
      lines.push(`BDAY:${stripLineBreaks(c.birthday).replace(/\//g, '-')}`);
    }

    // Website
    if (c.website) {
      lines.push(`URL:${stripLineBreaks(c.website)}`);
    }

    // Note
    if (c.notes) {
      if (useQP && is21) {
        lines.push(`NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${encodeQuotedPrintable(c.notes)}`);
      } else {
        lines.push(`NOTE:${escapeVCard(c.notes)}`);
      }
    }

    // Categories
    if (c.categories && c.categories.length > 0) {
      lines.push(`CATEGORIES:${c.categories.map(cat => escapeVCard(cat)).join(',')}`);
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  });

  return cards.join('\r\n') + '\r\n';
}
