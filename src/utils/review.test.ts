import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseVCard, generateVCard, unescapeVCard, decodeQuotedPrintable } from './vcard';
import {
  contactsToFormat1Rows,
  format1RowsToContacts,
  parseSpreadsheetBuffer,
  contactsToCsvString,
  guardCsvCell,
  getDemoContacts,
} from './tableFormat';
import { decodeTextBuffer } from './encoding';
import { findDuplicateGroups, mergeAllDuplicates, phoneKey } from './dedupe';
import type { Contact } from '../types/contact';

const enc = (s: string) => new TextEncoder().encode(s);
const toAB = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

function mk(id: string, fullName: string, phones: string[] = [], extra: Partial<Contact> = {}): Contact {
  return {
    id, fullName, familyName: '', givenName: '',
    phones: phones.map(n => ({ number: n, type: 'CELL' as const })),
    emails: [], organization: '', department: '', jobTitle: '',
    address: { street: '', city: '', region: '', postalCode: '', country: '' },
    notes: '', birthday: '', website: '', categories: [], ...extra,
  };
}

// ---------- VCF parsing ----------

test('QP soft line breaks (UTF-8 split across lines) are joined before decoding', () => {
  const vcf = 'BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=BC=A0;=E4=B8=89=E4=\r\n=B8=89;;;\r\n' +
    'NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:=E5=A4=87=\r\n=E6=B3=A8\r\nTEL;CELL:139\r\nEND:VCARD\r\n';
  const [c] = parseVCard(vcf);
  assert.equal(c.familyName, '张');
  assert.equal(c.givenName, '三三');
  assert.equal(c.fullName, '张三三');
  assert.equal(c.notes, '备注');
});

test('QP with CHARSET=GBK decodes via GB18030', () => {
  // 张三 in GBK = D5 C5 C8 FD
  const [c] = parseVCard('BEGIN:VCARD\nVERSION:2.1\nFN;CHARSET=GBK;ENCODING=QUOTED-PRINTABLE:=D5=C5=C8=FD\nEND:VCARD');
  assert.equal(c.fullName, '张三');
});

test('iOS/Google group prefixes (item1.TEL) are not dropped', () => {
  const [c] = parseVCard('BEGIN:VCARD\nVERSION:3.0\nFN:A\nitem1.TEL;type=pref:13800000000\nitem2.EMAIL;type=INTERNET:a@b.c\nitem3.URL:http://x\nitem4.ADR;type=HOME:;;路1号;北京;;;\nEND:VCARD');
  assert.equal(c.phones[0]?.number, '13800000000');
  assert.equal(c.emails[0]?.address, 'a@b.c');
  assert.equal(c.website, 'http://x');
  assert.equal(c.address.city, '北京');
});

test('repeated TYPE params are accumulated (TEL;TYPE=WORK;TYPE=VOICE is WORK)', () => {
  const [c] = parseVCard('BEGIN:VCARD\nVERSION:3.0\nFN:A\nTEL;TYPE=WORK;TYPE=VOICE:1\nTEL;type=HOME;type=VOICE;type=pref:2\nTEL;TYPE="work,voice";VALUE=uri:tel:3\nEND:VCARD');
  assert.deepEqual(c.phones.map(p => p.type), ['WORK', 'HOME', 'WORK']);
  assert.equal(c.phones[2].number, '3');
});

test('escaped separators inside structured values are respected', () => {
  const [c] = parseVCard('BEGIN:VCARD\nVERSION:3.0\nFN:A\nORG:A\\;B;Dept\nCATEGORIES:x\\,y,z\nNOTE:path C:\\\\new\nEND:VCARD');
  assert.equal(c.organization, 'A;B');
  assert.equal(c.department, 'Dept');
  assert.deepEqual(c.categories, ['x,y', 'z']);
  assert.equal(c.notes, 'path C:\\new');
  assert.equal(unescapeVCard('a\\\\nb'), 'a\\nb');
  assert.equal(unescapeVCard('a\\nb'), 'a\nb');
});

test('generate -> parse round-trips special characters', () => {
  const src = mk('x', '张,三;\\测试', ['13800138000'], {
    organization: 'Org;Inc, Ltd', notes: '第一行\n第二行, ; \\ end', categories: ['a,b', 'c'],
  });
  for (const version of ['3.0', '4.0', '2.1'] as const) {
    const [c] = parseVCard(generateVCard([src], { version, encoding: 'utf-8' }));
    assert.equal(c.fullName, src.fullName, version);
    assert.equal(c.notes, src.notes, version);
    assert.equal(c.organization, 'Org;Inc, Ltd', version);
    assert.deepEqual(c.categories, ['a,b', 'c'], version);
  }
});

test('PHOTO with vCard 3.0 ENCODING=b is kept', () => {
  const [c] = parseVCard('BEGIN:VCARD\nVERSION:3.0\nFN:A\nPHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ\n  SkZJRg\nEND:VCARD');
  assert.equal(c.photo, 'data:image/jpeg;base64,/9j/4AAQSkZJRg');
});

test('missing END:VCARD does not swallow the previous card; parsing is linear', () => {
  const r = parseVCard('BEGIN:VCARD\nFN:A\nBEGIN:VCARD\nFN:B\nEND:VCARD');
  assert.deepEqual(r.map(c => c.fullName), ['A', 'B']);
  const adv = 'BEGIN:VCARD\nFN:x\n'.repeat(50000);
  const t0 = Date.now();
  assert.equal(parseVCard(adv).length, 50000);
  assert.ok(Date.now() - t0 < 3000, 'should be linear');
});

test('BOM, CRLF, CR-only and lowercase properties are handled', () => {
  const r = parseVCard('\uFEFFbegin:vcard\rversion:3.0\rfn:A\rtel:1\rend:vcard\r');
  assert.equal(r.length, 1);
  assert.equal(r[0].phones[0].number, '1');
});

test('EMAIL/URL/BDAY containing newlines cannot inject extra vCard lines', () => {
  const c = mk('x', 'A', ['1'], { emails: [{ address: 'a@b.c\r\nTEL:999', type: 'WORK' }], website: 'http://x\nNOTE:evil', birthday: '1990\r\nX:1' });
  const out = generateVCard([c], { version: '3.0', encoding: 'utf-8' });
  assert.ok(!/\r\nTEL:999/.test(out));
  assert.ok(!/\r\nNOTE:evil/.test(out));
  const [back] = parseVCard(out);
  assert.equal(back.phones.length, 1);
  assert.equal(back.notes, '');
});

test('decodeQuotedPrintable keeps non-ASCII text that was not encoded and tolerates unknown charsets', () => {
  assert.equal(decodeQuotedPrintable('张=E4=B8=89', 'utf-8'), '张三');
  assert.equal(decodeQuotedPrintable('=41', 'x-unknown-charset'), 'A');
});

// ---------- Encoding ----------

test('decodeTextBuffer detects UTF-8 (with/without BOM), GBK and UTF-16LE', () => {
  assert.equal(decodeTextBuffer(enc('\uFEFF张三')), '张三');
  assert.equal(decodeTextBuffer(enc('张三')), '张三');
  assert.equal(decodeTextBuffer(new Uint8Array([0xd5, 0xc5, 0xc8, 0xfd])), '张三');
  assert.equal(decodeTextBuffer(new Uint8Array([0xff, 0xfe, 0x20, 0x5f, 0x09, 0x4e])), '张三');
});

test('GBK-encoded raw (8bit) VCF decodes correctly after detection', () => {
  // FN:张三 with GBK bytes
  const bytes = new Uint8Array([...enc('BEGIN:VCARD\nVERSION:2.1\nFN;CHARSET=GBK:'), 0xd5, 0xc5, 0xc8, 0xfd, ...enc('\nEND:VCARD\n')]);
  assert.equal(parseVCard(decodeTextBuffer(bytes))[0].fullName, '张三');
});

// ---------- CSV / XLSX ----------

test('BOM-less UTF-8 CSV with Chinese headers imports (was 0 contacts)', () => {
  const csv = '姓名,主要电话,邮编,备注信息\n张三,013800138000,010000,"a,b\nc"\n李四,+8613800138000,1e5,x\n\n,,,\n';
  const r = parseSpreadsheetBuffer(toAB(enc(csv)));
  assert.equal(r.length, 2);
  assert.equal(r[0].phones[0].number, '013800138000'); // leading zero kept
  assert.equal(r[0].address.postalCode, '010000');
  assert.equal(r[0].notes, 'a,b\nc'); // quoted comma + newline
  assert.equal(r[1].phones[0].number, '+8613800138000'); // "+" kept
  assert.equal(r[1].address.postalCode, '1e5'); // not coerced to 100000
});

test('GBK CSV (Excel on Chinese Windows) imports', () => {
  const header = [0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xd6, 0xf7, 0xd2, 0xaa, 0xb5, 0xe7, 0xbb, 0xb0, 0x0a]; // 姓名,主要电话
  const row = [0xd5, 0xc5, 0xc8, 0xfd, 0x2c, 0x31, 0x0a]; // 张三,1
  const r = parseSpreadsheetBuffer(toAB(new Uint8Array([...header, ...row])));
  assert.equal(r.length, 1);
  assert.equal(r[0].fullName, '张三');
});

test('table export keeps 3rd+ phone numbers', () => {
  const c = mk('x', 'A', ['1', '2', '3']);
  const [row] = contactsToFormat1Rows([c]);
  assert.equal(row['备用电话'], '2;3');
  const [back] = format1RowsToContacts([row]);
  assert.deepEqual(back.phones.map(p => p.number), ['1', '2', '3']);
});

test('CSV export guards formula injection but leaves phone numbers alone, and import reverses it', () => {
  assert.equal(guardCsvCell('=HYPERLINK("http://evil")'), `'=HYPERLINK("http://evil")`);
  assert.equal(guardCsvCell('@SUM(1)'), `'@SUM(1)`);
  assert.equal(guardCsvCell('+cmd|calc'), `'+cmd|calc`);
  assert.equal(guardCsvCell('+86 138-0013-8000'), '="+86 138-0013-8000"');
  assert.equal(guardCsvCell('-'), '-');
  const c = mk('x', '=1+1', ['+8613800138000'], { notes: '@evil' });
  const csv = contactsToCsvString([c]);
  assert.ok(csv.includes(`'=1+1`));
  const [back] = parseSpreadsheetBuffer(toAB(enc(csv)));
  assert.equal(back.fullName, '=1+1');
  assert.equal(back.notes, '@evil');
  assert.equal(back.phones[0].number, '+8613800138000');
});

test('empty alias column does not shadow a filled one; first non-empty sheet is used', () => {
  const [c] = format1RowsToContacts([{ '姓名': '王五', '手机': '', '电话': '13900000000' }]);
  assert.equal(c.phones[0]?.number, '13900000000');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明'], ['请在第二个工作表填写']]), '说明');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['姓名', '主要电话'], ['赵六', '13700000000']]), '联系人');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const r = parseSpreadsheetBuffer(buf);
  assert.equal(r.length, 1);
  assert.equal(r[0].fullName, '赵六');
});

test('XLSX date-formatted 生日 cells become yyyy-mm-dd instead of a serial number', () => {
  const ws = XLSX.utils.aoa_to_sheet([['姓名', '生日', '主要电话'], ['张三', 32888, 13800138000]]);
  ws['B2'].z = 'm/d/yy';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 's');
  const [c] = parseSpreadsheetBuffer(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  assert.equal(c.birthday, '1990-01-15');
  assert.equal(c.phones[0].number, '13800138000');
});

test('XLSX round trip of demo contacts', () => {
  const rows = contactsToFormat1Rows(getDemoContacts());
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 's');
  const back = parseSpreadsheetBuffer(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  assert.equal(back.length, 5);
  assert.equal(back[3].phones[0].number, '+1-415-555-0199'.replace(/-/g, ''));
});

// ---------- Dedupe ----------

test('phoneKey normalizes +86 / 0086 / spaces / dashes', () => {
  assert.equal(phoneKey('+86 138-0013-8000'), '13800138000');
  assert.equal(phoneKey('0086 13800138000'), '13800138000');
  assert.equal(phoneKey('(010) 8888-6661'), '01088886661');
});

test('dedupe merges transitively and never emits a contact twice', () => {
  const A = mk('A', '张伟', ['13800138000']);
  const B = mk('B', 'Zhang Wei', ['+86 138 0013 8000']);
  const C = mk('C', '张伟', []);
  const D = mk('D', '路人', ['13900000000']);
  const contacts = [D, A, B, C];
  const groups = findDuplicateGroups(contacts);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map(c => c.id), ['A', 'B', 'C']);
  const merged = mergeAllDuplicates(contacts);
  assert.deepEqual(merged.map(c => c.id), ['D', 'A']); // order preserved, merged record at first member's position
  assert.equal(merged[1].phones.length, 1); // same number in two formats is kept once
});

test('merge keeps union of data and does not mutate inputs', () => {
  const A = mk('A', '李娜', ['13912345678'], { notes: 'n1', categories: ['VIP'] });
  const B = mk('B', '李娜', ['13700000000'], { notes: 'n2', organization: 'Org', photo: 'data:image/png;base64,xx', address: { street: '路1号', city: '上海', region: '', postalCode: '', country: '' } });
  const [m] = mergeAllDuplicates([A, B]);
  assert.deepEqual(m.phones.map(p => p.number), ['13912345678', '13700000000']);
  assert.equal(m.notes, 'n1；n2');
  assert.equal(m.organization, 'Org');
  assert.equal(m.photo, 'data:image/png;base64,xx');
  assert.equal(m.address.city, '上海');
  m.address.city = 'changed';
  assert.equal(B.address.city, '上海');
  assert.equal(A.phones.length, 1);
});

test('CSV export keeps long numbers / leading 0 / + as text in Excel (no scientific notation) and import reverses it', () => {
  assert.equal(guardCsvCell('13800138000'), '="13800138000"');
  assert.equal(guardCsvCell('013800138000'), '="013800138000"');
  assert.equal(guardCsvCell('+8613800138000'), '="+8613800138000"');
  assert.equal(guardCsvCell('010000'), '="010000"');
  assert.equal(guardCsvCell('100080'), '100080');
  assert.equal(guardCsvCell('1988-06-15'), '1988-06-15');
  assert.equal(guardCsvCell('-'), '-');
  assert.equal(guardCsvCell('=1+1'), `'=1+1`);
  const c = mk('x', '张三', ['13800138000', '+8613900139000', '07551234567'], {
    address: { street: '', city: '', region: '', postalCode: '010000', country: '', fullAddress: '' },
  });
  const csv = contactsToCsvString([c]);
  assert.ok(csv.includes('"=""13800138000"""'), csv);
  assert.ok(!/(^|,)13800138000(,|$)/m.test(csv));
  const [back] = parseSpreadsheetBuffer(toAB(enc(csv)));
  assert.deepEqual(back.phones.map(p => p.number), ['13800138000', '+8613900139000', '07551234567']);
  assert.equal(back.address.postalCode, '010000');
});

test('legacy .xls (OLE2) is rejected with a "save as .xlsx" hint; .xlsx still works', () => {
  const ole = new Uint8Array(512);
  ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  assert.throws(() => parseSpreadsheetBuffer(toAB(ole)), /\.xls.*另存为.*\.xlsx/);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['姓名', '主要电话'], ['赵六', '13700000000']]), 'S');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  assert.equal(parseSpreadsheetBuffer(out)[0].fullName, '赵六');
});
