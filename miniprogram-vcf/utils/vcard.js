/**
 * vCard (.vcf) 解析与生成
 * 移植自 kylecan-kch/ai-made 的 src/utils/vcard.ts，去掉 TextEncoder/TextDecoder 等浏览器依赖，
 * 改为纯 JS 实现，可在微信小程序与 Node 中运行。
 *
 * 相比原版的小幅增强（不改变原有输出格式）：
 *  - 支持 Quoted-Printable 软换行跨行（以 "=" 结尾的行与下一行拼接）
 *  - 支持 iOS 的分组前缀，如 item1.TEL / item1.EMAIL
 *  - 同一属性出现多个 TYPE 参数（TYPE=CELL;TYPE=VOICE）时合并而不是覆盖
 *  - 支持 CHARSET=GBK/GB2312 的 QP 内容（使用内置 GBK 码表）
 */
var encoding = require('./encoding.js');

function padHex(n) {
  var h = n.toString(16).toUpperCase();
  return h.length < 2 ? '0' + h : h;
}

/** Quoted-Printable 解码（按 charset 解码为字符串） */
function decodeQuotedPrintable(input, charset) {
  charset = charset || 'utf-8';
  try {
    var normalized = String(input).replace(/=\r?\n/g, '');
    var bytes = [];
    for (var i = 0; i < normalized.length; i++) {
      var ch = normalized[i];
      if (ch === "=" && i + 2 < normalized.length) {
        var hex = normalized.substring(i + 1, i + 3);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      var code = ch.charCodeAt(0);
      if (code < 0x80) {
        bytes.push(code);
      } else {
        // 非 ASCII 原样字符：按 UTF-8 展开
        var enc = encoding.utf8Encode(ch);
        for (var k = 0; k < enc.length; k++) bytes.push(enc[k]);
      }
    }
    return encoding.decodeBytes(new Uint8Array(bytes), charset);
  } catch (err) {
    return String(input).replace(/=([0-9A-Fa-f]{2})/g, function (_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }
}

/** Quoted-Printable 编码（UTF-8） */
function encodeQuotedPrintable(str) {
  var bytes = encoding.utf8Encode(str || '');
  var result = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if ((b >= 33 && b <= 60) || (b >= 62 && b <= 126)) {
      result += String.fromCharCode(b);
    } else if (b === 32) {
      result += ' ';
    } else {
      result += '=' + padHex(b);
    }
  }
  return result;
}

function unescapeVCard(val) {
  if (!val) return '';
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeVCard(val) {
  if (!val) return '';
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function generateId() {
  return 'c_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

var COMPOUND_SURNAMES = [
  '欧阳', '太史', '端木', '上官', '司马', '东方', '独孤', '南宫', '万俟', '闻人',
  '夏侯', '诸葛', '尉迟', '公羊', '赫连', '澹台', '皇甫', '宗政', '濮阳', '淳于',
  '单于', '太叔', '申屠', '公孙', '仲孙', '轩辕', '令狐', '钟离', '宇文', '长孙',
  '慕容', '鲜于', '闾丘', '司徒', '司空', '亓官', '司寇', '仉督', '子车', '颛孙'
];

/** 根据全名拆分姓/名（支持中文复姓与西文姓名） */
function splitFullName(fullName) {
  var trimmed = String(fullName || '').trim();
  if (!trimmed) return { familyName: '', givenName: '' };

  if (/^[\u4e00-\u9fa5]+$/.test(trimmed)) {
    if (trimmed.length === 1) return { familyName: trimmed, givenName: '' };
    for (var i = 0; i < COMPOUND_SURNAMES.length; i++) {
      var compound = COMPOUND_SURNAMES[i];
      if (trimmed.indexOf(compound) === 0) {
        return { familyName: compound, givenName: trimmed.substring(compound.length) };
      }
    }
    return { familyName: trimmed.charAt(0), givenName: trimmed.substring(1) };
  }

  if (trimmed.indexOf(' ') !== -1) {
    var parts = trimmed.split(/\s+/);
    if (parts.length === 2) return { givenName: parts[0], familyName: parts[1] };
    return { givenName: parts.slice(0, -1).join(' '), familyName: parts[parts.length - 1] };
  }
  return { familyName: trimmed, givenName: '' };
}

function normalizePhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/[\s-]/g, '').trim();
}

function emptyAddress() {
  return { street: '', city: '', region: '', postalCode: '', country: '', fullAddress: '' };
}

/** 把行拆开，处理 RFC 折行与 QP 软换行 */
function splitLines(cardContent) {
  var raw = cardContent.split(/\r\n|\n|\r/);
  var lines = [];
  for (var i = 0; i < raw.length; i++) {
    var line = raw[i];
    // QP 软换行：属性含 QUOTED-PRINTABLE 且行尾为 "="，与下一行拼接
    if (/QUOTED-PRINTABLE/i.test(line.split(':')[0])) {
      while (/=$/.test(line) && i + 1 < raw.length) {
        line = line.slice(0, -1) + raw[++i].replace(/^[ \t]/, '');
      }
    }
    line = line.trim();
    if (line) lines.push(line);
  }
  return lines;
}

/** 解析 .vcf 文本为联系人数组 */
function parseVCard(rawContent) {
  if (!rawContent || !String(rawContent).trim()) return [];
  rawContent = String(rawContent).replace(/^\uFEFF/, '');

  // 1. RFC 折行：换行后紧跟空格/Tab 视为续行
  var unfolded = rawContent.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/\r[ \t]/g, '');

  // 2. 按 BEGIN:VCARD ... END:VCARD 切分
  var cardRegex = /BEGIN:VCARD([\s\S]*?)END:VCARD/gi;
  var contacts = [];
  var match;

  while ((match = cardRegex.exec(unfolded)) !== null) {
    var lines = splitLines(match[1]);

    var fullName = '';
    var familyName = '';
    var givenName = '';
    var phones = [];
    var emails = [];
    var organization = '';
    var department = '';
    var jobTitle = '';
    var address = emptyAddress();
    var notes = '';
    var birthday = '';
    var website = '';
    var categories = [];
    var photo;

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      var propAndParams = line.substring(0, colonIdx).trim();
      var value = line.substring(colonIdx + 1).trim();

      var paramParts = propAndParams.split(';');
      var propName = paramParts[0].toUpperCase();
      // 去掉 iOS 分组前缀 item1.TEL -> TEL
      var dot = propName.lastIndexOf('.');
      if (dot !== -1) propName = propName.substring(dot + 1);

      var params = {};
      for (var p = 1; p < paramParts.length; p++) {
        var paramStr = paramParts[p];
        if (paramStr.indexOf('=') !== -1) {
          var eq = paramStr.indexOf('=');
          var key = paramStr.substring(0, eq).toUpperCase();
          var val = paramStr.substring(eq + 1).replace(/"/g, '').toUpperCase();
          params[key] = params[key] ? params[key] + ',' + val : val;
        } else {
          params[paramStr.toUpperCase()] = 'TRUE';
        }
      }

      var isQP = params['ENCODING'] === 'QUOTED-PRINTABLE' || params.hasOwnProperty('QUOTED-PRINTABLE');
      var charset = params['CHARSET'] || 'UTF-8';
      value = isQP ? decodeQuotedPrintable(value, charset) : unescapeVCard(value);

      var typeParam = params['TYPE'] || '';
      switch (propName) {
        case 'FN':
          fullName = value;
          break;

        case 'N': {
          var nParts = value.split(';');
          familyName = (nParts[0] || '').trim();
          givenName = (nParts[1] || '').trim();
          break;
        }

        case 'TEL': {
          if (!value) break;
          var pType = 'CELL';
          if (typeParam.indexOf('WORK') !== -1 || params['WORK']) pType = 'WORK';
          else if (typeParam.indexOf('HOME') !== -1 || params['HOME']) pType = 'HOME';
          else if (typeParam.indexOf('MAIN') !== -1 || params['MAIN']) pType = 'MAIN';
          else if (typeParam.indexOf('CELL') !== -1 || typeParam.indexOf('VOICE') !== -1 || params['CELL']) pType = 'CELL';
          else if (typeParam.indexOf('OTHER') !== -1) pType = 'OTHER';
          var cleanVal = value.replace(/^tel:/i, '').trim();
          if (cleanVal) phones.push({ number: cleanVal, type: pType });
          break;
        }

        case 'EMAIL': {
          if (!value) break;
          var eType = 'OTHER';
          if (typeParam.indexOf('WORK') !== -1 || params['WORK']) eType = 'WORK';
          else if (typeParam.indexOf('HOME') !== -1 || params['HOME']) eType = 'HOME';
          emails.push({ address: value, type: eType });
          break;
        }

        case 'ORG': {
          var orgParts = value.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
          if (orgParts.length > 0) {
            organization = orgParts[0];
            if (orgParts.length > 1) department = orgParts.slice(1).join(' / ');
          }
          break;
        }

        case 'TITLE':
          jobTitle = value;
          break;

        case 'ROLE':
          if (!department) department = value;
          break;

        case 'ADR': {
          var a = value.split(';').map(function (s) { return s.trim(); });
          var street = [a[0], a[1], a[2]].filter(Boolean).join(' ');
          var city = a[3] || '';
          var region = a[4] || '';
          var postalCode = a[5] || '';
          var country = a[6] || '';
          address = {
            street: street,
            city: city,
            region: region,
            postalCode: postalCode,
            country: country,
            fullAddress: [country, region, city, street].filter(Boolean).join(' ')
          };
          break;
        }

        case 'NOTE':
          notes = value;
          break;

        case 'BDAY':
          birthday = value;
          break;

        case 'URL':
          website = value;
          break;

        case 'CATEGORIES':
        case 'X-CATEGORIES':
        case 'X-GROUP-MEMBERSHIP': {
          var cats = value.split(/[,;]/).map(function (c) { return c.trim(); }).filter(Boolean);
          categories = categories.concat(cats);
          break;
        }

        case 'PHOTO': {
          if (value.indexOf('data:image') === 0 || value.indexOf('http') === 0) {
            photo = value;
          } else if (params['ENCODING'] === 'BASE64' || params['ENCODING'] === 'B' || params['BASE64'] || params['B']) {
            var photoType = params['TYPE'] ? params['TYPE'].split(',')[0].toLowerCase() : 'jpeg';
            photo = 'data:image/' + photoType + ';base64,' + value.replace(/\s+/g, '');
          }
          break;
        }
      }
    }

    if (!fullName && (familyName || givenName)) {
      if (/^[\u4e00-\u9fa5]+$/.test(familyName + givenName)) fullName = familyName + givenName;
      else fullName = [givenName, familyName].filter(Boolean).join(' ');
    } else if (fullName && !familyName && !givenName) {
      var split = splitFullName(fullName);
      familyName = split.familyName;
      givenName = split.givenName;
    }

    if (fullName || phones.length > 0 || emails.length > 0 || organization) {
      var uniqCats = [];
      categories.forEach(function (c) { if (uniqCats.indexOf(c) === -1) uniqCats.push(c); });
      contacts.push({
        id: generateId(),
        fullName: fullName || '未命名联系人',
        familyName: familyName,
        givenName: givenName,
        phones: phones,
        emails: emails,
        organization: organization,
        department: department,
        jobTitle: jobTitle,
        address: address,
        notes: notes,
        birthday: birthday,
        website: website,
        categories: uniqCats,
        photo: photo
      });
    }
  }
  return contacts;
}

/**
 * 生成 vCard 文本
 * @param {Array} contacts
 * @param {{version:'3.0'|'2.1'|'4.0', encoding:'utf-8'|'quoted-printable'}} options
 */
function generateVCard(contacts, options) {
  options = options || { version: '3.0', encoding: 'utf-8' };
  var version = options.version || '3.0';
  var is21 = version === '2.1';
  var is40 = version === '4.0';
  var useQP = options.encoding === 'quoted-printable';
  var qp = useQP && is21;

  var cards = (contacts || []).map(function (c) {
    var lines = [];
    lines.push('BEGIN:VCARD');
    lines.push('VERSION:' + version);
    lines.push('PRODID:-//VCF Contacts Hub//CN');

    var fName = c.familyName || '';
    var gName = c.givenName || '';
    var fullName = c.fullName || (fName + gName) || '联系人';

    if (qp) {
      lines.push('N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + encodeQuotedPrintable(fName) + ';' + encodeQuotedPrintable(gName) + ';;;');
      lines.push('FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + encodeQuotedPrintable(fullName));
    } else {
      lines.push('N:' + escapeVCard(fName) + ';' + escapeVCard(gName) + ';;;');
      lines.push('FN:' + escapeVCard(fullName));
    }

    if (c.organization || c.department) {
      if (qp) {
        var orgVal = [c.organization || '', c.department || ''].filter(Boolean).join(';');
        lines.push('ORG;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + encodeQuotedPrintable(orgVal));
      } else {
        lines.push('ORG:' + escapeVCard(c.organization || '') + (c.department ? ';' + escapeVCard(c.department) : ''));
      }
    }

    if (c.jobTitle) {
      lines.push(qp
        ? 'TITLE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + encodeQuotedPrintable(c.jobTitle)
        : 'TITLE:' + escapeVCard(c.jobTitle));
    }

    (c.phones || []).forEach(function (phone) {
      var num = normalizePhone(phone.number);
      if (!num) return;
      var type = phone.type || 'CELL';
      if (is21) lines.push('TEL;' + type + ';VOICE:' + num);
      else if (is40) lines.push('TEL;TYPE="' + type.toLowerCase() + ',voice";VALUE=uri:tel:' + num);
      else lines.push('TEL;TYPE=' + type + ',VOICE:' + num);
    });

    (c.emails || []).forEach(function (email) {
      var addr = String(email.address || '').trim();
      if (!addr) return;
      var type = email.type || 'INTERNET';
      if (is21) lines.push('EMAIL;' + type + ':' + addr);
      else if (is40) lines.push('EMAIL;TYPE=' + type.toLowerCase() + ':' + addr);
      else lines.push('EMAIL;TYPE=INTERNET,' + type + ':' + addr);
    });

    var adr = c.address;
    if (adr && (adr.street || adr.city || adr.fullAddress)) {
      var street = adr.street || adr.fullAddress || '';
      lines.push('ADR;TYPE=WORK:;;' + escapeVCard(street) + ';' + escapeVCard(adr.city || '') + ';' +
        escapeVCard(adr.region || '') + ';' + escapeVCard(adr.postalCode || '') + ';' + escapeVCard(adr.country || ''));
    }

    if (c.birthday) lines.push('BDAY:' + String(c.birthday).replace(/\//g, '-'));
    if (c.website) lines.push('URL:' + c.website);

    if (c.notes) {
      lines.push(qp
        ? 'NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + encodeQuotedPrintable(c.notes)
        : 'NOTE:' + escapeVCard(c.notes));
    }

    if (c.categories && c.categories.length > 0) {
      lines.push('CATEGORIES:' + c.categories.map(function (cat) { return escapeVCard(cat); }).join(','));
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  });

  return cards.join('\r\n') + '\r\n';
}

module.exports = {
  decodeQuotedPrintable: decodeQuotedPrintable,
  encodeQuotedPrintable: encodeQuotedPrintable,
  unescapeVCard: unescapeVCard,
  escapeVCard: escapeVCard,
  generateId: generateId,
  splitFullName: splitFullName,
  normalizePhone: normalizePhone,
  parseVCard: parseVCard,
  generateVCard: generateVCard
};
