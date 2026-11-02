/**
 * 内置 SheetJS（utils/xlsx.mini.min.js）的版本、加载环境、读写往返与已知漏洞回归。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createMiniProgramLikeRequire } = require('./sandbox');

const UTILS = path.join(__dirname, '..', 'utils');

test('SheetJS 版本为 0.20.3（修复 CVE-2023-30533 / CVE-2024-22363），且在无 Buffer/TextDecoder 的沙箱中可加载', () => {
  const sb = createMiniProgramLikeRequire();
  for (const g of ['Buffer', 'TextDecoder', 'TextEncoder', 'window', 'document', 'process']) {
    assert.equal(vm.runInContext('typeof ' + g, sb.context), 'undefined', g);
  }
  const XLSX = sb.require('xlsx.mini.min.js');
  assert.equal(XLSX.version, '0.20.3');
  assert.equal(typeof XLSX.read, 'function');
  assert.equal(typeof XLSX.write, 'function');
  const head = fs.readFileSync(path.join(UTILS, 'xlsx.mini.min.js'), 'utf8').slice(0, 200);
  assert.match(head, /version="0\.20\.3"/);
});

test('xlsx 导出再导入：所有列逐格一致（中文、+86、前导 0、换行备注、多个号码）', () => {
  const sb = createMiniProgramLikeRequire();
  const table = sb.require('table.js');
  const addr = { street: '科技园 1 号', city: '深圳', region: '广东', postalCode: '010080', country: '中国', fullAddress: '广东深圳科技园 1 号' };
  const list = [
    { id: '1', fullName: '张三', familyName: '张', givenName: '三', phones: [{ number: '+8613800138000', type: 'CELL' }, { number: '07551234567', type: 'WORK' }, { number: '13900139000', type: 'HOME' }],
      emails: [{ address: 'zs@example.cn', type: 'WORK' }], organization: '=SUM(1)', department: '研发', jobTitle: '工程师', address: addr,
      notes: '第一行\n第二行，"引号"', birthday: '1990-01-02', website: 'https://x.cn', categories: ['VIP', '同事'] },
    { id: '2', fullName: 'Tom Lee', familyName: 'Lee', givenName: 'Tom', phones: [{ number: '010-88886661', type: 'CELL' }], emails: [], organization: '', department: '', jobTitle: '',
      address: { street: '', city: '', region: '', postalCode: '', country: '', fullAddress: '' }, notes: '', birthday: '', website: '', categories: [] }
  ];
  const buf = table.contactsToXlsxBuffer(list);
  const back = table.parseSpreadsheetBuffer(buf);
  assert.equal(back.length, 2);
  const a = JSON.parse(JSON.stringify(table.contactsToFormat1Rows(list)));
  const b = JSON.parse(JSON.stringify(table.contactsToFormat1Rows(back)));
  const norm = (v) => String(v).replace(/[\s-]/g, '');
  for (let i = 0; i < a.length; i++) {
    for (const col of table.FORMAT1_COLUMNS) {
      const want = /电话/.test(col) ? norm(a[i][col]) : a[i][col];
      assert.equal(b[i][col], want, `第 ${i + 1} 行 ${col}`);
    }
  }
  assert.equal(back[0].address.postalCode, '010080');
  assert.equal(back[0].phones[1].number, '07551234567');
});

test('CVE-2023-30533：批注 ref="__proto__" 的恶意 xlsx 不会污染 Object.prototype', () => {
  const sb = createMiniProgramLikeRequire();
  const table = sb.require('table.js');
  const buf = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'cve-2023-30533-comment-proto.xlsx')));
  try { table.parseSpreadsheetBuffer(buf); } catch (e) { /* 拒绝解析也可以，只要不污染原型 */ }
  assert.equal(vm.runInContext('({}).c', sb.context), undefined, '0.18.5 在这里会得到 [{a:"x",t:"hello",...}]');
  assert.equal(vm.runInContext('Object.prototype.hasOwnProperty("c")', sb.context), false);
});
