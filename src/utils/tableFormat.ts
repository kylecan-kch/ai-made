import * as XLSX from 'xlsx';
import { Contact, Format1Row, PhoneEntry, EmailEntry } from '../types/contact';
import { generateId, splitFullName, normalizePhone } from './vcard';
import { decodeTextBuffer } from './encoding';

/**
 * Standard Format 1 Table Columns ordered logically
 */
export const FORMAT1_COLUMNS = [
  '姓名',
  '姓氏',
  '名字',
  '主要电话',
  '电话类型1',
  '备用电话',
  '电话类型2',
  '电子邮箱',
  '公司/组织',
  '部门',
  '职位',
  '详细地址',
  '城市',
  '省份/地区',
  '邮编',
  '国家',
  '备注信息',
  '生日',
  '网址',
  '分组标签',
] as const;

/**
 * Convert internal Contact objects to standard Format 1 rows
 */
export function contactsToFormat1Rows(contacts: Contact[]): Format1Row[] {
  return contacts.map(c => {
    const primaryPhone = c.phones[0];
    const secondaryPhone = c.phones[1];
    const primaryEmail = c.emails[0];

    const row: Format1Row = {
      '姓名': c.fullName || '',
      '姓氏': c.familyName || '',
      '名字': c.givenName || '',
      '主要电话': primaryPhone?.number || '',
      '电话类型1': primaryPhone ? (primaryPhone.type === 'CELL' ? '手机' : primaryPhone.type === 'WORK' ? '工作' : primaryPhone.type === 'HOME' ? '住宅' : '其他') : '',
      // All phones after the first go into 备用电话 (";"-separated); previously the 3rd+ numbers were dropped
      '备用电话': c.phones.slice(1).map(p => p.number).filter(Boolean).join(';'),
      '电话类型2': secondaryPhone ? (secondaryPhone.type === 'CELL' ? '手机' : secondaryPhone.type === 'WORK' ? '工作' : secondaryPhone.type === 'HOME' ? '住宅' : '其他') : '',
      '电子邮箱': c.emails.map(e => e.address).join('; ') || '',
      '公司/组织': c.organization || '',
      '部门': c.department || '',
      '职位': c.jobTitle || '',
      '详细地址': c.address?.street || c.address?.fullAddress || '',
      '城市': c.address?.city || '',
      '省份/地区': c.address?.region || '',
      '邮编': c.address?.postalCode || '',
      '国家': c.address?.country || '',
      '备注信息': c.notes || '',
      '生日': c.birthday || '',
      '网址': c.website || '',
      '分组标签': c.categories?.join(', ') || '',
    };

    return row;
  });
}

/**
 * Map raw imported row keys to standard fields
 */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_\-/\\()（）]/g, '');
}

const normalizedKeyCache = new Map<string, string>();
function cachedNormalizeKey(key: string): string {
  let n = normalizedKeyCache.get(key);
  if (n === undefined) {
    n = normalizeKey(key);
    if (normalizedKeyCache.size < 10000) normalizedKeyCache.set(key, n);
  }
  return n;
}

/**
 * Undo the CSV formula-injection guard added on export ("'=..." -> "=...")
 */
function unguardCell(val: string): string {
  const m = /^="([^"]*)"$/.exec(val);
  if (m && isPhoneLike(m[1])) return m[1];
  return /^'[=+\-@\t\r]/.test(val) ? val.substring(1) : val;
}

const PHONE_LIKE_RE = /^\+?[0-9][0-9 \-()]*$/;

/**
 * Phone-number-like values (only + digits spaces - ( ), and starting with + or 0, or with >= 11 digits).
 * Excel turns these into 1.38E+10 or drops leading 0 / "+" when it opens a CSV, so they are exported as ="...".
 * The character whitelist means such a value can never smuggle in another formula.
 */
function isPhoneLike(s: string): boolean {
  if (s.length > 200 || !PHONE_LIKE_RE.test(s)) return false;
  if (s[0] === '+' || s[0] === '0') return true;
  return s.replace(/\D/g, '').length >= 11;
}

/**
 * Convert arbitrary or Format 1 table rows to Contact objects
 */
export function format1RowsToContacts(rawRows: Record<string, any>[]): Contact[] {
  return rawRows.map(row => {
    // Find matching keys dynamically
    // Build the normalized-header lookup once per row (was O(aliases x columns) regex work per field)
    const lookup = new Map<string, string>();
    for (const rowKey in row) {
      const val = row[rowKey];
      if (val === undefined || val === null) continue;
      const str = unguardCell(String(val).trim());
      if (!str) continue;
      const nk = cachedNormalizeKey(rowKey);
      if (!lookup.has(nk)) lookup.set(nk, str);
    }
    const getVal = (possibleKeys: string[]): string => {
      for (const k of possibleKeys) {
        // Empty cells no longer shadow a later alias column (e.g. empty 手机 + filled 电话)
        const v = lookup.get(cachedNormalizeKey(k));
        if (v) return v;
      }
      return '';
    };

    const fullNameRaw = getVal(['姓名', '联系人', '名称', 'name', 'fullname', 'contactname', 'displayName']);
    let familyName = getVal(['姓氏', '姓', 'familyname', 'lastname', 'surname']);
    let givenName = getVal(['名字', '名', 'givenname', 'firstname']);

    let fullName = fullNameRaw;
    if (!fullName && (familyName || givenName)) {
      fullName = /^[\u4e00-\u9fa5]+$/.test(familyName + givenName)
        ? familyName + givenName
        : [givenName, familyName].filter(Boolean).join(' ');
    } else if (fullName && (!familyName && !givenName)) {
      const split = splitFullName(fullName);
      familyName = split.familyName;
      givenName = split.givenName;
    }

    // Phones
    const phones: PhoneEntry[] = [];
    const phone1 = getVal(['主要电话', '手机', '手机号', '电话', '电话1', '移动电话', 'phone', 'mobile', 'cell', 'tel', 'phone1']);
    const phone1Type = getVal(['电话类型1', '类型1', 'phonetype1']) || 'CELL';
    const phone2 = getVal(['备用电话', '电话2', '座机', '工作电话', 'phone2', 'secondaryphone', 'telephone']);
    const phone2Type = getVal(['电话类型2', '类型2', 'phonetype2']) || 'WORK';

    if (phone1) {
      phones.push({
        number: normalizePhone(phone1),
        type: phone1Type.includes('工') ? 'WORK' : phone1Type.includes('家') || phone1Type.includes('宅') ? 'HOME' : 'CELL',
      });
    }
    if (phone2) {
      // Could be multiple phones separated by semicolon or comma
      const multi = phone2.split(/[,;，；]/).map(s => s.trim()).filter(Boolean);
      for (const p of multi) {
        phones.push({
          number: normalizePhone(p),
          type: phone2Type.includes('家') || phone2Type.includes('宅') ? 'HOME' : 'WORK',
        });
      }
    }

    // Emails
    const emails: EmailEntry[] = [];
    const emailRaw = getVal(['电子邮箱', '邮箱', 'email', 'e-mail', 'mail']);
    if (emailRaw) {
      const emailList = emailRaw.split(/[,;，；]/).map(s => s.trim()).filter(Boolean);
      for (const em of emailList) {
        emails.push({
          address: em,
          type: 'WORK',
        });
      }
    }

    const organization = getVal(['公司/组织', '公司', '组织', '企业', '单位', 'company', 'organization', 'org']);
    const department = getVal(['部门', '所属部门', '科室', 'department', 'dept', 'role']);
    const jobTitle = getVal(['职位', '职务', '头衔', 'title', 'jobtitle', 'position']);
    
    // Address
    const street = getVal(['详细地址', '地址', '街道', 'address', 'street', 'fulladdress']);
    const city = getVal(['城市', 'city']);
    const region = getVal(['省份/地区', '省份', '省', '州', 'province', 'state', 'region']);
    const postalCode = getVal(['邮编', '邮政编码', 'zip', 'zipcode', 'postalcode']);
    const country = getVal(['国家', 'country']);

    const notes = getVal(['备注信息', '备注', '说明', 'note', 'notes', 'remark', 'remarks', 'comment']);
    const birthday = getVal(['生日', '出生日期', 'birthday', 'bday', 'dob']);
    const website = getVal(['网址', '网站', '主页', 'url', 'website', 'homepage']);
    
    const categoriesRaw = getVal(['分组标签', '分组', '标签', '群组', 'category', 'categories', 'tags', 'group']);
    const categories = categoriesRaw ? categoriesRaw.split(/[,;，；]/).map(s => s.trim()).filter(Boolean) : [];

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
      address: {
        street,
        city,
        region,
        postalCode,
        country,
        fullAddress: street || [country, region, city].filter(Boolean).join(' '),
      },
      notes,
      birthday,
      website,
      categories,
    };
  }).filter(c => c.fullName !== '未命名联系人' || c.phones.length > 0 || c.emails.length > 0 || c.organization);
}

/**
 * Export contacts to Excel (.xlsx) file
 */
export function exportContactsToExcel(contacts: Contact[], fileName = '联系人数据_格式1.xlsx') {
  const rows = contactsToFormat1Rows(contacts);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...FORMAT1_COLUMNS] });
  
  // Set nice column widths
  const colWidths = FORMAT1_COLUMNS.map(col => {
    switch (col) {
      case '姓名': return { wch: 12 };
      case '姓氏': return { wch: 8 };
      case '名字': return { wch: 10 };
      case '主要电话': return { wch: 16 };
      case '电子邮箱': return { wch: 24 };
      case '公司/组织': return { wch: 22 };
      case '详细地址': return { wch: 30 };
      case '备注信息': return { wch: 25 };
      default: return { wch: 14 };
    }
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '格式1_联系人表');
  XLSX.writeFile(workbook, fileName);
}

/**
 * Make a cell safe for opening the CSV in Excel/WPS:
 *  - phone-number-like values (13800138000, 013800138000, +8613800138000, 010000) are written as ="..." so Excel
 *    shows them verbatim as text instead of 1.38E+10 / dropping the leading 0 or "+"; import reverses this.
 *  - other values starting with =, +, -, @, TAB, CR get a leading ' (CSV / formula injection); import reverses this.
 */
export function guardCsvCell(val: string): string {
  if (!val) return val;
  if (isPhoneLike(val)) return '="' + val + '"';
  if (/^[=@\t\r]/.test(val)) return "'" + val;
  if (/^[+-]/.test(val) && !/^[+-]?[\d\s().-]*$/.test(val)) return "'" + val;
  return val;
}

/**
 * Build Format 1 CSV text (without BOM)
 */
export function contactsToCsvString(contacts: Contact[]): string {
  const rows = contactsToFormat1Rows(contacts).map(r => {
    const guarded: Record<string, string> = {};
    for (const col of FORMAT1_COLUMNS) guarded[col] = guardCsvCell((r as Record<string, string>)[col] || '');
    return guarded;
  });
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...FORMAT1_COLUMNS] });
  return XLSX.utils.sheet_to_csv(worksheet);
}

/**
 * Export contacts to CSV file
 */
export function exportContactsToCsv(contacts: Contact[], fileName = '联系人数据_格式1.csv') {
  const csvOutput = contactsToCsvString(contacts);

  // Add BOM for proper Chinese characters in Excel CSV
  const blob = new Blob(['\uFEFF' + csvOutput], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export const XLS_UNSUPPORTED_MESSAGE =
  '暂不支持旧版 Excel（.xls）文件。请用 Excel / WPS 打开后“另存为” .xlsx 格式（或 CSV），再导入另存后的文件。';

function isBinarySpreadsheet(bytes: Uint8Array): boolean {
  // XLSX / ODS (zip: "PK\x03\x04")
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Legacy Excel 97-2003 .xls is an OLE2 compound file (D0 CF 11 E0 A1 B1 1A E1); also catches a renamed .xls */
export function isLegacyXls(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

/** Excel serial date -> yyyy-mm-dd (1900 date system) */
function excelSerialToDate(serial: number): string {
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return String(serial);
  return d.toISOString().slice(0, 10);
}

function isDateFormat(fmt?: string): boolean {
  if (!fmt || /^general$/i.test(fmt)) return false;
  const stripped = fmt.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[yd]/i.test(stripped);
}

/** Replace numeric date cells by yyyy-mm-dd text so 生日 does not become "32888" */
function normalizeDateCells(ws: XLSX.WorkSheet) {
  for (const addr in ws) {
    if (addr[0] === '!') continue;
    const cell = ws[addr] as XLSX.CellObject;
    if (cell && cell.t === 'n' && typeof cell.v === 'number' && isDateFormat(cell.z as string | undefined)) {
      cell.v = excelSerialToDate(cell.v);
      cell.t = 's';
      delete cell.w;
    }
  }
}

/**
 * Read Excel or CSV file from ArrayBuffer
 */
export function parseSpreadsheetBuffer(buffer: ArrayBuffer): Contact[] {
  const bytes = new Uint8Array(buffer);
  // .xls support was dropped in 1.0.1 (same as the mini program): ask the user to re-save as .xlsx
  if (isLegacyXls(bytes)) throw new Error(XLS_UNSUPPORTED_MESSAGE);
  let workbook: XLSX.WorkBook;
  if (isBinarySpreadsheet(bytes)) {
    workbook = XLSX.read(bytes, { type: 'array', cellNF: true });
  } else {
    // CSV / TSV text: detect UTF-8 (with or without BOM) / GBK / UTF-16 ourselves; SheetJS treats BOM-less
    // bytes as Latin-1, which turned every Chinese header into mojibake and imported 0 contacts.
    // raw: true keeps cell text verbatim (leading zeros, "+86", "1e5" are not coerced into numbers).
    workbook = XLSX.read(decodeTextBuffer(bytes), { type: 'string', raw: true });
  }

  // Use the first sheet that actually yields contacts (e.g. skip an "说明" cover sheet)
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    normalizeDateCells(worksheet);
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    const contacts = format1RowsToContacts(rawRows);
    if (contacts.length > 0) return contacts;
  }
  return [];
}

/**
 * Generate standard demo contacts (bilingual, varied roles, tags, notes)
 */
export function getDemoContacts(): Contact[] {
  return [
    {
      id: 'demo-1',
      fullName: '张伟',
      familyName: '张',
      givenName: '伟',
      phones: [
        { number: '13800138001', type: 'CELL' },
        { number: '010-88886661', type: 'WORK' },
      ],
      emails: [
        { address: 'zhangwei@example.com', type: 'WORK' },
      ],
      organization: '未来云创科技有限公司',
      department: '技术研发部',
      jobTitle: '首席技术官 (CTO)',
      address: {
        street: '中关村南大街1号鼎好大厦A座18层',
        city: '北京市',
        region: '北京',
        postalCode: '100080',
        country: '中国',
        fullAddress: '北京市 海淀区 中关村南大街1号鼎好大厦A座18层',
      },
      notes: '核心战略合作伙伴，微信同手机号',
      birthday: '1988-06-15',
      website: 'https://futurecloud.example.com',
      categories: ['VIP客户', '技术专家', '合作伙伴'],
    },
    {
      id: 'demo-2',
      fullName: '李娜',
      familyName: '李',
      givenName: '娜',
      phones: [
        { number: '13912345678', type: 'CELL' },
      ],
      emails: [
        { address: 'lina.sales@globaltrade.cn', type: 'WORK' },
        { address: 'lina_personal@gmail.com', type: 'HOME' },
      ],
      organization: '环球聚力商贸集团',
      department: '国际业务部',
      jobTitle: '高级商务总监',
      address: {
        street: '陆家嘴环路1000号恒生银行大厦26楼',
        city: '上海市',
        region: '上海',
        postalCode: '200120',
        country: '中国',
        fullAddress: '上海市 浦东新区 陆家嘴环路1000号',
      },
      notes: '2026年度重点客户，定期跟进季度合同',
      birthday: '1992-11-23',
      website: 'https://globaltrade.cn',
      categories: ['VIP客户', '重要客户'],
    },
    {
      id: 'demo-3',
      fullName: '诸葛孔明',
      familyName: '诸葛',
      givenName: '孔明',
      phones: [
        { number: '18688889999', type: 'CELL' },
      ],
      emails: [
        { address: 'zhuge@shuhan.org', type: 'WORK' },
      ],
      organization: '智略咨询顾问有限公司',
      department: '战略规划部',
      jobTitle: '首席架构师兼合伙人',
      address: {
        street: '高新南四道18号创维半导体设计大厦',
        city: '深圳市',
        region: '广东省',
        postalCode: '518057',
        country: '中国',
        fullAddress: '广东省 深圳市 南山区 高新南四道18号',
      },
      notes: '复姓智能测试用例，精通系统全局规划',
      birthday: '1985-04-14',
      website: 'https://strategy.example.com',
      categories: ['智库专家', '战略咨询'],
    },
    {
      id: 'demo-4',
      fullName: 'David Miller',
      familyName: 'Miller',
      givenName: 'David',
      phones: [
        { number: '+1-415-555-0199', type: 'CELL' },
        { number: '+1-415-555-0188', type: 'WORK' },
      ],
      emails: [
        { address: 'david.miller@siliconedge.io', type: 'WORK' },
      ],
      organization: 'Silicon Edge Ventures',
      department: 'Investment Team',
      jobTitle: 'Managing Director',
      address: {
        street: '555 California St, Suite 3200',
        city: 'San Francisco',
        region: 'CA',
        postalCode: '94104',
        country: 'USA',
        fullAddress: '555 California St, Suite 3200, San Francisco, CA 94104, USA',
      },
      notes: 'Overseas venture investor, preferred timezone PST',
      birthday: '1982-09-08',
      website: 'https://siliconedge.io',
      categories: ['海外投资', 'VC'],
    },
    {
      id: 'demo-5',
      fullName: '王敏敏',
      familyName: '王',
      givenName: '敏敏',
      phones: [
        { number: '15011223344', type: 'CELL' },
      ],
      emails: [
        { address: 'wangminmin@designlab.cn', type: 'WORK' },
      ],
      organization: '极光交互体验实验室',
      department: 'UI/UX设计中心',
      jobTitle: '资深产品体验师',
      address: {
        street: '天府大道中段天府软件园G区',
        city: '成都市',
        region: '四川省',
        postalCode: '610041',
        country: '中国',
        fullAddress: '四川省 成都市 高新区 天府软件园G区',
      },
      notes: '负责移动端设计标准审查',
      birthday: '1995-03-30',
      website: '',
      categories: ['设计师', '产品体验'],
    },
  ];
}

/**
 * Generate standard Format 1 template file (.xlsx)
 */
export function downloadStandardTemplate() {
  const sampleContacts = getDemoContacts();
  exportContactsToExcel(sampleContacts, '联系人信息标准表格_格式1.xlsx');
}
