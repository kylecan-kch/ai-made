import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVCard,
  generateVCard,
  decodeQuotedPrintable,
  encodeQuotedPrintable,
  splitFullName,
} from './vcard';
import {
  contactsToFormat1Rows,
  format1RowsToContacts,
  getDemoContacts,
} from './tableFormat';

test('Quoted-Printable encoding and decoding works with UTF-8 Chinese characters', () => {
  const original = '张三-测试联系人';
  const encoded = encodeQuotedPrintable(original);
  const decoded = decodeQuotedPrintable(encoded, 'utf-8');
  assert.equal(decoded, original);
});

test('splitFullName handles Chinese single and compound surnames, and Western names', () => {
  const single = splitFullName('李明');
  assert.equal(single.familyName, '李');
  assert.equal(single.givenName, '明');

  const compound = splitFullName('欧阳飞雪');
  assert.equal(compound.familyName, '欧阳');
  assert.equal(compound.givenName, '飞雪');

  const western = splitFullName('John Doe');
  assert.equal(western.givenName, 'John');
  assert.equal(western.familyName, 'Doe');
});

test('parseVCard accurately extracts vCard 3.0 contacts', () => {
  const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:王小强
N:王;小强;;;
TEL;TYPE=CELL,VOICE:13800138000
TEL;TYPE=WORK,VOICE:021-12345678
EMAIL;TYPE=INTERNET,WORK:wangxq@example.com
ORG:未来科技;智能部门
TITLE:高级工程师
ADR;TYPE=WORK:;;海淀大街10号;北京;北京市;100080;中国
NOTE:重要伙伴
CATEGORIES:VIP,合作伙伴
END:VCARD`;

  const contacts = parseVCard(vcfContent);
  assert.equal(contacts.length, 1);
  const c = contacts[0];
  assert.equal(c.fullName, '王小强');
  assert.equal(c.familyName, '王');
  assert.equal(c.givenName, '小强');
  assert.equal(c.phones.length, 2);
  assert.equal(c.phones[0].number, '13800138000');
  assert.equal(c.phones[0].type, 'CELL');
  assert.equal(c.phones[1].number, '021-12345678');
  assert.equal(c.emails[0].address, 'wangxq@example.com');
  assert.equal(c.organization, '未来科技');
  assert.equal(c.department, '智能部门');
  assert.equal(c.jobTitle, '高级工程师');
  assert.equal(c.notes, '重要伙伴');
  assert.deepEqual(c.categories, ['VIP', '合作伙伴']);
});

test('parseVCard handles Quoted-Printable encoded vCard 2.1 from Android/Outlook', () => {
  // =E5=BC=A0=E4=B8=89 is 张三 in UTF-8 hex
  const vcf21 = `BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=BC=A0;=E4=B8=89;;;
FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=BC=A0=E4=B8=89
TEL;CELL:13900001111
END:VCARD`;

  const contacts = parseVCard(vcf21);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].fullName, '张三');
  assert.equal(contacts[0].familyName, '张');
  assert.equal(contacts[0].givenName, '三');
  assert.equal(contacts[0].phones[0].number, '13900001111');
});

test('generateVCard produces valid vCard that round-trips correctly', () => {
  const demos = getDemoContacts();
  const vcfString = generateVCard(demos, { version: '3.0', encoding: 'utf-8' });
  assert.ok(vcfString.includes('BEGIN:VCARD'));
  assert.ok(vcfString.includes('FN:张伟'));
  assert.ok(vcfString.includes('TEL;TYPE=CELL,VOICE:13800138001'));

  // Roundtrip parse
  const reparsed = parseVCard(vcfString);
  assert.equal(reparsed.length, demos.length);
  assert.equal(reparsed[0].fullName, '张伟');
  assert.equal(reparsed[1].fullName, '李娜');
});

test('Format 1 table row conversion works two-way', () => {
  const demos = getDemoContacts();
  const format1Rows = contactsToFormat1Rows(demos);
  assert.equal(format1Rows.length, demos.length);
  assert.equal(format1Rows[0]['姓名'], '张伟');
  assert.equal(format1Rows[0]['主要电话'], '13800138001');

  // Convert back to contacts
  const restored = format1RowsToContacts(format1Rows);
  assert.equal(restored.length, demos.length);
  assert.equal(restored[0].fullName, '张伟');
  assert.equal(restored[0].phones[0].number, '13800138001');
});
