const test = require('node:test');
const assert = require('node:assert/strict');
const { createMiniProgramLikeRequire } = require('./sandbox');

// 与 utils.test.js 相同：在“类小程序”沙箱（无 Buffer/TextDecoder）中加载
const sb = createMiniProgramLikeRequire();
const table = sb.require('table.js');
const encoding = sb.require('encoding.js');
const plain = (v) => JSON.parse(JSON.stringify(v));
const u8 = (arr) => new Uint8Array(arr);

/* ---------- CSV ---------- */

test('CSV：字段中间的引号按普通字符处理，不吞掉后续行', () => {
  const rows = plain(table.parseCsvToArray('姓名,备注,手机\n张三,24" 显示器,13800138000\n李四,无,13900139000'));
  assert.deepEqual(rows, [
    ['姓名', '备注', '手机'],
    ['张三', '24" 显示器', '13800138000'],
    ['李四', '无', '13900139000']
  ]);
  assert.equal(table.parseCsvText('姓名,备注,手机\n张三,5\'10",138\n李四,x,139').length, 2);
});

test('CSV：字段开头的引号仍按 RFC 4180 处理（内含逗号、换行、""）', () => {
  const rows = plain(table.parseCsvToArray('a,b\r\n"x,1\ny","z""q"\r\n'));
  assert.deepEqual(rows, [['a', 'b'], ['x,1\ny', 'z"q']]);
});

test('CSV：重复表头不会让后一列覆盖前一列（与 SheetJS 一致改名为 _1）', () => {
  const c = table.parseCsvText('姓名,电话,电话\n张三,13800138000,13900139000')[0];
  assert.equal(c.phones[0].number, '13800138000');
});

test('表头别名缓存后结果不变：多别名同时存在时按优先级取值', () => {
  const c = table.format1RowsToContacts([{ ' Mobile ': '139', '手机': '138', 'E-Mail': 'a@b.cn', '公司 / 组织': 'X' }])[0];
  assert.equal(c.phones[0].number, '138'); // “手机”优先于 mobile
  assert.equal(c.emails[0].address, 'a@b.cn');
  assert.equal(c.organization, 'X');
  // null/undefined 视为缺失，回退到下一个同名列
  const d = table.format1RowsToContacts([{ '姓名': null, 'name': 'Tom' }])[0];
  assert.equal(d.fullName, 'Tom');
});

/* ---------- Excel ---------- */

test('xlsx：带前导 0 数字格式的单元格保留前导 0，普通长号码不变成科学计数法', () => {
  const XLSX = sb.require('xlsx.mini.min.js');
  const ws = XLSX.utils.aoa_to_sheet([['姓名', '手机', '备用电话', '邮编'], ['张三', 13800138000, 8613800138001, 80]]);
  ws.D2.z = '000000';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const c = table.parseSpreadsheetBuffer(buf)[0];
  assert.equal(c.phones[0].number, '13800138000');
  assert.equal(c.phones[1].number, '8613800138001');
  assert.equal(c.address.postalCode, '000080');
});

/* ---------- UTF-8 宽松解码（BOM 文件、QP 值都会用到） ---------- */

test('utf8Decode：截断的多字节序列只替换为一个 U+FFFD，后面的 ASCII 不丢', () => {
  assert.equal(encoding.utf8Decode(u8([0xe4, 0x41]), false), '\ufffdA');
  assert.equal(encoding.utf8Decode(u8([0xe5, 0xbc, 0x41, 0x42]), false), '\ufffdAB');
  assert.equal(encoding.utf8Decode(u8([0x41, 0xe4, 0xb8]), false), 'A\ufffd');
  assert.equal(encoding.utf8Decode(u8([0xe5, 0xbc, 0xa0, 0xe4, 0xb8, 0x89]), false), '张三');
  assert.equal(encoding.utf8Decode(u8([0xf0, 0x9f, 0x98, 0x80]), false), '😀');
});

test('utf8Decode：拒绝代理区与过长编码（fatal 模式返回 null，供编码探测）', () => {
  assert.equal(encoding.utf8Decode(u8([0xed, 0xa0, 0x80]), true), null); // U+D800
  assert.equal(encoding.utf8Decode(u8([0xe0, 0x80, 0x80]), true), null); // 过长
  assert.equal(encoding.utf8Decode(u8([0xf4, 0x90, 0x80, 0x80]), true), null); // > U+10FFFF
  assert.equal(encoding.utf8Decode(u8([0xed, 0xa0, 0x80]), false), '\ufffd\ufffd\ufffd');
});
