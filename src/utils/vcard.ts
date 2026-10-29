import { Contact, PhoneEntry, EmailEntry, AddressEntry, VCardExportOptions } from '../types/contact';

/**
 * Decode Quoted-Printable string into UTF-8 or specified charset
 */
export function decodeQuotedPrintable(input: string, charset = 'utf-8'): string {
  try {
    // Strip soft line breaks (=\r\n or =\n)
    const normalized = input.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    
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
      bytes.push(char.charCodeAt(0));
    }
    
    const uint8 = new Uint8Array(bytes);
    const decoder = new TextDecoder(charset.toLowerCase().includes('gb') ? 'gbk' : 'utf-8');
    return decoder.decode(uint8);
  } catch (err) {
    // Fallback if decoder fails
    return input.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
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
 */
export function unescapeVCard(val: string): string {
  if (!val) return '';
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
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
    .replace(/\r?\n/g, '\\n');
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
 * Parse raw .vcf string into an array of Contact objects
 */
export function parseVCard(rawContent: string): Contact[] {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  // 1. Unfold lines: RFC vCard allows long lines wrapped with newline followed by space or tab
  const unfolded = rawContent.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/\r[ \t]/g, '');

  // 2. Split cards by BEGIN:VCARD and END:VCARD
  const cardRegex = /BEGIN:VCARD([\s\S]*?)END:VCARD/gi;
  const contacts: Contact[] = [];
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(unfolded)) !== null) {
    const cardContent = match[1];
    const lines = cardContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

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
      // Find colon separating prop+params from value
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const propAndParams = line.substring(0, colonIdx).trim();
      let value = line.substring(colonIdx + 1).trim();

      // Parse parameters (e.g., TEL;TYPE=CELL,VOICE or N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE)
      const paramParts = propAndParams.split(';');
      const propName = paramParts[0].toUpperCase();
      const params: Record<string, string> = {};

      for (let p = 1; p < paramParts.length; p++) {
        const paramStr = paramParts[p];
        if (paramStr.includes('=')) {
          const [key, val] = paramStr.split('=');
          params[key.toUpperCase()] = (val || '').toUpperCase();
        } else {
          // Sometimes TYPE is implicit e.g. TEL;CELL or TEL;WORK
          params[paramStr.toUpperCase()] = 'TRUE';
        }
      }

      // Check for Quoted-Printable encoding
      const isQP = params['ENCODING'] === 'QUOTED-PRINTABLE' || Object.keys(params).some(k => k === 'QUOTED-PRINTABLE');
      const charset = params['CHARSET'] || 'UTF-8';

      if (isQP) {
        value = decodeQuotedPrintable(value, charset);
      } else {
        value = unescapeVCard(value);
      }

      // Process fields
      switch (propName) {
        case 'FN': {
          fullName = value;
          break;
        }

        case 'N': {
          // RFC N is: Family;Given;Middle;Prefix;Suffix
          const nParts = value.split(';');
          familyName = (nParts[0] || '').trim();
          givenName = (nParts[1] || '').trim();
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
          emails.push({ address: value, type: eType });
          break;
        }

        case 'ORG': {
          // RFC ORG is: OrgName;Department;Division
          const orgParts = value.split(';').map(s => s.trim()).filter(Boolean);
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
          const adrParts = value.split(';').map(s => s.trim());
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
          const cats = value.split(/[,;]/).map(c => c.trim()).filter(Boolean);
          categories.push(...cats);
          break;
        }

        case 'PHOTO': {
          if (value.startsWith('data:image') || value.startsWith('http')) {
            photo = value;
          } else if (params['ENCODING'] === 'BASE64' || params['B']) {
            const photoType = params['TYPE'] ? params['TYPE'].toLowerCase() : 'jpeg';
            photo = `data:image/${photoType};base64,${value.replace(/\s+/g, '')}`;
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
    if (fullName || phones.length > 0 || emails.length > 0 || organization) {
      contacts.push({
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
      });
    }
  }

  return contacts;
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
        const addr = email.address.trim();
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
      lines.push(`BDAY:${c.birthday.replace(/\//g, '-')}`);
    }

    // Website
    if (c.website) {
      lines.push(`URL:${c.website}`);
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
