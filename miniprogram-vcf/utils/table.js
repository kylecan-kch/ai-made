/**
 * 表格（格式1）与联系人互转
 * 移植自 kylecan-kch/ai-made 的 src/utils/tableFormat.ts
 *  - 列定义、字段映射、别名识别逻辑与原版一致
 *  - CSV 读写改为纯 JS 实现（原版依赖 Blob / document 下载）
 *  - Excel(.xlsx/.xls) 读写使用内置的 SheetJS 精简版 utils/xlsx.mini.min.js（按需加载）
 */
var vcard = require('./vcard.js');
var generateId = vcard.generateId;
var splitFullName = vcard.splitFullName;
var normalizePhone = vcard.normalizePhone;

var FORMAT1_COLUMNS = [
  '姓名', '姓氏', '名字', '主要电话', '电话类型1', '备用电话', '电话类型2', '电子邮箱',
  '公司/组织', '部门', '职位', '详细地址', '城市', '省份/地区', '邮编', '国家',
  '备注信息', '生日', '网址', '分组标签'
];

function phoneTypeLabel(type) {
  return type === 'CELL' ? '手机' : type === 'WORK' ? '工作' : type === 'HOME' ? '住宅' : '其他';
}

/** 联系人 -> 格式1 行 */
function contactsToFormat1Rows(contacts) {
  return (contacts || []).map(function (c) {
    var phones = c.phones || [];
    var emails = c.emails || [];
    var addr = c.address || {};
    var p1 = phones[0];
    var p2 = phones[1];
    return {
      '姓名': c.fullName || '',
      '姓氏': c.familyName || '',
      '名字': c.givenName || '',
      '主要电话': p1 ? p1.number : '',
      '电话类型1': p1 ? phoneTypeLabel(p1.type) : '',
      // 原版在超过 2 个号码时会丢失第 3 个及以后的号码，这里改为全部用 ; 连接
      '备用电话': phones.length > 2
        ? phones.slice(1).map(function (p) { return p.number; }).join(';')
        : (p2 ? p2.number : ''),
      '电话类型2': p2 ? phoneTypeLabel(p2.type) : '',
      '电子邮箱': emails.map(function (e) { return e.address; }).join('; '),
      '公司/组织': c.organization || '',
      '部门': c.department || '',
      '职位': c.jobTitle || '',
      '详细地址': addr.street || addr.fullAddress || '',
      '城市': addr.city || '',
      '省份/地区': addr.region || '',
      '邮编': addr.postalCode || '',
      '国家': addr.country || '',
      '备注信息': c.notes || '',
      '生日': c.birthday || '',
      '网址': c.website || '',
      '分组标签': (c.categories || []).join(', ')
    };
  });
}

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[\s_\-/\\()（）]/g, '');
}

function splitMulti(s) {
  return s.split(/[,;，；]/).map(function (x) { return x.trim(); }).filter(Boolean);
}

/** 任意表头（中英文别名）或格式1 行 -> 联系人 */
function format1RowsToContacts(rawRows) {
  return (rawRows || []).map(function (row) {
    var entries = Object.keys(row).map(function (k) { return [normalizeKey(k), row[k]]; });
    function getVal(possibleKeys) {
      for (var i = 0; i < possibleKeys.length; i++) {
        var normK = normalizeKey(possibleKeys[i]);
        for (var j = 0; j < entries.length; j++) {
          var v = entries[j][1];
          if (entries[j][0] === normK && v !== undefined && v !== null) return String(v).trim();
        }
      }
      return '';
    }

    var fullName = getVal(['姓名', '联系人', '名称', 'name', 'fullname', 'contactname', 'displayName']);
    var familyName = getVal(['姓氏', '姓', 'familyname', 'lastname', 'surname']);
    var givenName = getVal(['名字', '名', 'givenname', 'firstname']);

    if (!fullName && (familyName || givenName)) {
      fullName = /^[\u4e00-\u9fa5]+$/.test(familyName + givenName)
        ? familyName + givenName
        : [givenName, familyName].filter(Boolean).join(' ');
    } else if (fullName && !familyName && !givenName) {
      var split = splitFullName(fullName);
      familyName = split.familyName;
      givenName = split.givenName;
    }

    var phones = [];
    var phone1 = getVal(['主要电话', '手机', '手机号', '电话', '电话1', '移动电话', 'phone', 'mobile', 'cell', 'tel', 'phone1']);
    var phone1Type = getVal(['电话类型1', '类型1', 'phonetype1']) || 'CELL';
    var phone2 = getVal(['备用电话', '电话2', '座机', '工作电话', 'phone2', 'secondaryphone', 'telephone']);
    var phone2Type = getVal(['电话类型2', '类型2', 'phonetype2']) || 'WORK';

    if (phone1) {
      phones.push({
        number: normalizePhone(phone1),
        type: phone1Type.indexOf('工') !== -1 ? 'WORK'
          : (phone1Type.indexOf('家') !== -1 || phone1Type.indexOf('宅') !== -1) ? 'HOME' : 'CELL'
      });
    }
    if (phone2) {
      splitMulti(phone2).forEach(function (p) {
        phones.push({
          number: normalizePhone(p),
          type: (phone2Type.indexOf('家') !== -1 || phone2Type.indexOf('宅') !== -1) ? 'HOME' : 'WORK'
        });
      });
    }

    var emails = [];
    var emailRaw = getVal(['电子邮箱', '邮箱', 'email', 'e-mail', 'mail']);
    if (emailRaw) {
      splitMulti(emailRaw).forEach(function (em) { emails.push({ address: em, type: 'WORK' }); });
    }

    var street = getVal(['详细地址', '地址', '街道', 'address', 'street', 'fulladdress']);
    var city = getVal(['城市', 'city']);
    var region = getVal(['省份/地区', '省份', '省', '州', 'province', 'state', 'region']);
    var postalCode = getVal(['邮编', '邮政编码', 'zip', 'zipcode', 'postalcode']);
    var country = getVal(['国家', 'country']);
    var categoriesRaw = getVal(['分组标签', '分组', '标签', '群组', 'category', 'categories', 'tags', 'group']);

    return {
      id: generateId(),
      fullName: fullName || '未命名联系人',
      familyName: familyName,
      givenName: givenName,
      phones: phones,
      emails: emails,
      organization: getVal(['公司/组织', '公司', '组织', '企业', '单位', 'company', 'organization', 'org']),
      department: getVal(['部门', '所属部门', '科室', 'department', 'dept', 'role']),
      jobTitle: getVal(['职位', '职务', '头衔', 'title', 'jobtitle', 'position']),
      address: {
        street: street,
        city: city,
        region: region,
        postalCode: postalCode,
        country: country,
        fullAddress: street || [country, region, city].filter(Boolean).join(' ')
      },
      notes: getVal(['备注信息', '备注', '说明', 'note', 'notes', 'remark', 'remarks', 'comment']),
      birthday: getVal(['生日', '出生日期', 'birthday', 'bday', 'dob']),
      website: getVal(['网址', '网站', '主页', 'url', 'website', 'homepage']),
      categories: categoriesRaw ? splitMulti(categoriesRaw) : []
    };
  }).filter(function (c) {
    return c.fullName !== '未命名联系人' || c.phones.length > 0 || c.emails.length > 0 || c.organization;
  });
}

/* ---------------- CSV ---------------- */

function detectDelimiter(text) {
  var firstLine = text.split(/\r?\n/)[0] || '';
  var candidates = [',', '\t', ';'];
  var best = ',';
  var bestCount = 0;
  candidates.forEach(function (d) {
    var n = firstLine.split(d).length - 1;
    if (n > bestCount) { best = d; bestCount = n; }
  });
  return best;
}

/** RFC 4180 CSV 解析 -> 二维数组 */
function parseCsvToArray(text, delimiter) {
  text = String(text || '').replace(/^\uFEFF/, '');
  delimiter = delimiter || detectDelimiter(text);
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); });
}

/** 二维数组（首行表头）-> 对象数组，等价于 sheet_to_json(defval:'') */
function arrayToObjects(rows) {
  if (!rows.length) return [];
  var header = rows[0].map(function (h) { return String(h).trim(); });
  return rows.slice(1).map(function (r) {
    var obj = {};
    header.forEach(function (h, idx) { if (h) obj[h] = r[idx] !== undefined ? r[idx] : ''; });
    return obj;
  });
}

function parseCsvText(text) {
  return format1RowsToContacts(arrayToObjects(parseCsvToArray(text)));
}

function csvEscape(v) {
  var s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** 联系人 -> CSV 文本（带 UTF-8 BOM，Excel 打开中文不乱码） */
function contactsToCsv(contacts, withBom) {
  var rows = contactsToFormat1Rows(contacts);
  var lines = [FORMAT1_COLUMNS.map(csvEscape).join(',')];
  rows.forEach(function (r) {
    lines.push(FORMAT1_COLUMNS.map(function (col) { return csvEscape(r[col]); }).join(','));
  });
  return (withBom === false ? '' : '\uFEFF') + lines.join('\r\n') + '\r\n';
}

/* ---------------- Excel (SheetJS) ---------------- */

var _XLSX = null;
function getXLSX() {
  if (!_XLSX) _XLSX = require('./xlsx.mini.min.js');
  return _XLSX;
}

/** 读取 xlsx/xls/csv 的 ArrayBuffer -> 联系人（与原版 parseSpreadsheetBuffer 一致） */
function parseSpreadsheetBuffer(buffer) {
  var XLSX = getXLSX();
  var data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  var workbook = XLSX.read(data, { type: 'array' });
  var firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  var rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
  return format1RowsToContacts(rawRows);
}

/** 联系人 -> xlsx 文件 ArrayBuffer（列宽、工作表名与原版一致） */
function contactsToXlsxBuffer(contacts) {
  var XLSX = getXLSX();
  var rows = contactsToFormat1Rows(contacts);
  var worksheet = XLSX.utils.json_to_sheet(rows, { header: FORMAT1_COLUMNS.slice() });
  var widths = { '姓名': 12, '姓氏': 8, '名字': 10, '主要电话': 16, '电子邮箱': 24, '公司/组织': 22, '详细地址': 30, '备注信息': 25 };
  worksheet['!cols'] = FORMAT1_COLUMNS.map(function (col) { return { wch: widths[col] || 14 }; });
  var workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '格式1_联系人表');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

/* ---------------- 演示数据（与原版一致） ---------------- */

function getDemoContacts() {
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

module.exports = {
  FORMAT1_COLUMNS: FORMAT1_COLUMNS,
  contactsToFormat1Rows: contactsToFormat1Rows,
  format1RowsToContacts: format1RowsToContacts,
  parseCsvToArray: parseCsvToArray,
  parseCsvText: parseCsvText,
  contactsToCsv: contactsToCsv,
  parseSpreadsheetBuffer: parseSpreadsheetBuffer,
  contactsToXlsxBuffer: contactsToXlsxBuffer,
  getDemoContacts: getDemoContacts
};
