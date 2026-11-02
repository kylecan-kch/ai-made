const test = require('node:test');
const assert = require('node:assert/strict');
const { createMiniProgramLikeRequire } = require('./sandbox');

// 所有被测模块都在“类小程序”沙箱中加载（无 Buffer/TextDecoder/DOM）
const sb = createMiniProgramLikeRequire();
const vcard = sb.require('vcard.js');
const table = sb.require('table.js');
const dedupe = sb.require('dedupe.js');
const encoding = sb.require('encoding.js');

// 从沙箱取出的对象原型属于另一个 realm，deepStrictEqual 前先转成本 realm 普通对象
const plain = (v) => JSON.parse(JSON.stringify(v));

test('沙箱中确实没有浏览器/Node 专有全局对象', () => {
  for (const g of ['Buffer', 'TextEncoder', 'TextDecoder', 'window', 'document', 'Blob', 'FileReader']) {
    assert.equal(sb.context[g], undefined, g);
  }
});

/* ---------- 原项目 vcard.test.ts 的用例（逐条移植） ---------- */

test('QP 编解码中文 UTF-8 往返', () => {
  const original = '张三-测试联系人';
  assert.equal(vcard.decodeQuotedPrintable(vcard.encodeQuotedPrintable(original), 'utf-8'), original);
});

test('splitFullName：单姓/复姓/西文姓名', () => {
  assert.deepEqual(plain(vcard.splitFullName('李明')), { familyName: '李', givenName: '明' });
  assert.deepEqual(plain(vcard.splitFullName('欧阳飞雪')), { familyName: '欧阳', givenName: '飞雪' });
  const w = vcard.splitFullName('John Doe');
  assert.equal(w.givenName, 'John');
  assert.equal(w.familyName, 'Doe');
});

test('parseVCard 解析 vCard 3.0', () => {
  const vcf = `BEGIN:VCARD
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
  const cs = vcard.parseVCard(vcf);
  assert.equal(cs.length, 1);
  const c = cs[0];
  assert.equal(c.fullName, '王小强');
  assert.equal(c.familyName, '王');
  assert.equal(c.givenName, '小强');
  assert.equal(c.phones.length, 2);
  assert.deepEqual(plain(c.phones), [{ number: '13800138000', type: 'CELL' }, { number: '021-12345678', type: 'WORK' }]);
  assert.equal(c.emails[0].address, 'wangxq@example.com');
  assert.equal(c.emails[0].type, 'WORK');
  assert.equal(c.organization, '未来科技');
  assert.equal(c.department, '智能部门');
  assert.equal(c.jobTitle, '高级工程师');
  assert.equal(c.address.street, '海淀大街10号');
  assert.equal(c.address.city, '北京');
  assert.equal(c.address.postalCode, '100080');
  assert.equal(c.notes, '重要伙伴');
  assert.deepEqual(plain(c.categories), ['VIP', '合作伙伴']);
});

test('parseVCard 解析 Android/Outlook 的 vCard 2.1 QP', () => {
  const vcf21 = `BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=BC=A0;=E4=B8=89;;;
FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=BC=A0=E4=B8=89
TEL;CELL:13900001111
END:VCARD`;
  const cs = vcard.parseVCard(vcf21);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].fullName, '张三');
  assert.equal(cs[0].familyName, '张');
  assert.equal(cs[0].givenName, '三');
  assert.equal(cs[0].phones[0].number, '13900001111');
});

test('generateVCard 生成后可正确回读', () => {
  const demos = table.getDemoContacts();
  const out = vcard.generateVCard(demos, { version: '3.0', encoding: 'utf-8' });
  assert.ok(out.includes('BEGIN:VCARD'));
  assert.ok(out.includes('FN:张伟'));
  assert.ok(out.includes('TEL;TYPE=CELL,VOICE:13800138001'));
  const re = vcard.parseVCard(out);
  assert.equal(re.length, demos.length);
  assert.equal(re[0].fullName, '张伟');
  assert.equal(re[1].fullName, '李娜');
});

test('格式1 表格行双向转换', () => {
  const demos = table.getDemoContacts();
  const rows = table.contactsToFormat1Rows(demos);
  assert.equal(rows.length, demos.length);
  assert.equal(rows[0]['姓名'], '张伟');
  assert.equal(rows[0]['主要电话'], '13800138001');
  const restored = table.format1RowsToContacts(rows);
  assert.equal(restored.length, demos.length);
  assert.equal(restored[0].fullName, '张伟');
  assert.equal(restored[0].phones[0].number, '13800138001');
});

/* ---------- 新增用例 ---------- */

test('QP 软换行跨行 + 多个电话 + GBK 字符集 + 只有 FN 时自动拆分复姓', () => {
  // 欧阳娜娜 的 UTF-8，故意用 "=" 软换行拆成两行
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:2.1',
    'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E6=AC=A7=E9=98=B3=',
    '=E5=A8=9C=E5=A8=9C',
    'TEL;CELL;VOICE:138 0013 8000',
    'TEL;WORK;VOICE:010-12345678',
    'TEL;HOME:0755-8888888',
    'NOTE;CHARSET=GBK;ENCODING=QUOTED-PRINTABLE:=D5=C5=C8=FD',
    'END:VCARD'
  ].join('\r\n');
  const [c] = vcard.parseVCard(vcf);
  assert.equal(c.fullName, '欧阳娜娜');
  assert.equal(c.familyName, '欧阳');
  assert.equal(c.givenName, '娜娜');
  assert.deepEqual(plain(c.phones.map(p => p.type)), ['CELL', 'WORK', 'HOME']);
  assert.equal(c.notes, '张三');
});

test('iOS 分组前缀 item1.TEL / 重复 TYPE 参数 / RFC 折行 / 转义字符', () => {
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:李;雷;;;',
    'item1.TEL;TYPE=WORK;TYPE=VOICE:+86 10 8888 0000',
    'item2.EMAIL;type=INTERNET;type=HOME:lilei@example.com',
    'NOTE:第一行\\n第二行\\, 含逗号\\; 分号',
    'ORG:很长很长的公司名',
    ' 续行部分',
    'END:VCARD'
  ].join('\n');
  const [c] = vcard.parseVCard(vcf);
  assert.equal(c.fullName, '李雷');
  assert.deepEqual(plain(c.phones), [{ number: '+86 10 8888 0000', type: 'WORK' }]);
  assert.deepEqual(plain(c.emails), [{ address: 'lilei@example.com', type: 'HOME' }]);
  assert.equal(c.notes, '第一行\n第二行, 含逗号; 分号');
  assert.equal(c.organization, '很长很长的公司名续行部分');
});

test('vCard 4.0 与 2.1 QP 生成并回读', () => {
  const demos = table.getDemoContacts();
  for (const opts of [{ version: '4.0', encoding: 'utf-8' }, { version: '2.1', encoding: 'quoted-printable' }, { version: '2.1', encoding: 'utf-8' }]) {
    const out = vcard.generateVCard(demos, opts);
    const re = vcard.parseVCard(out);
    assert.equal(re.length, demos.length, JSON.stringify(opts));
    re.forEach((c, i) => {
      assert.equal(c.fullName, demos[i].fullName);
      assert.equal(c.familyName, demos[i].familyName);
      assert.deepEqual(plain(c.phones.map(p => p.number)), plain(demos[i].phones.map(p => p.number.replace(/[\s-]/g, ''))));
      assert.equal(c.organization, demos[i].organization);
      assert.equal(c.notes, demos[i].notes);
    });
    if (opts.encoding === 'quoted-printable') assert.ok(out.includes('FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=BC=A0=E4=BC=9F'));
  }
});

test('往返：VCF -> 表格(CSV) -> VCF，关键字段不丢失', () => {
  const src = `BEGIN:VCARD
VERSION:3.0
FN:诸葛亮
TEL;TYPE=CELL:13800000001
TEL;TYPE=WORK:010-66668888
TEL;TYPE=HOME:020-12345678
EMAIL;TYPE=WORK:kongming@shu.cn
EMAIL;TYPE=HOME:zgl@qq.com
ORG:蜀汉丞相府;军师处
TITLE:丞相
ADR:;;卧龙岗1号;南阳;河南;473000;中国
NOTE:鞠躬尽瘁，"死而后已"
BDAY:0181-07-23
URL:https://shu.example.com
CATEGORIES:军师,重要
END:VCARD
BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=BC=A0;=E4=B8=89;;;
TEL;CELL:139 0000 1111
END:VCARD`;
  const contacts = vcard.parseVCard(src);
  assert.equal(contacts.length, 2);
  const csv = table.contactsToCsv(contacts);
  assert.equal(csv.charCodeAt(0), 0xfeff, '应带 UTF-8 BOM');
  const fromCsv = table.parseCsvText(csv);
  assert.equal(fromCsv.length, 2);
  const vcf2 = vcard.generateVCard(fromCsv, { version: '3.0', encoding: 'utf-8' });
  const back = vcard.parseVCard(vcf2);
  const a = back[0];
  assert.equal(a.fullName, '诸葛亮');
  assert.equal(a.familyName, '诸葛');
  assert.deepEqual(plain(a.phones.map(p => p.number)), ['13800000001', '010-66668888'.replace(/-/g, ''), '020-12345678'.replace(/-/g, '')]);
  assert.deepEqual(plain(a.emails.map(e => e.address)), ['kongming@shu.cn', 'zgl@qq.com']);
  assert.equal(a.organization, '蜀汉丞相府');
  assert.equal(a.department, '军师处');
  assert.equal(a.jobTitle, '丞相');
  assert.equal(a.address.city, '南阳');
  assert.equal(a.address.postalCode, '473000');
  assert.equal(a.notes, '鞠躬尽瘁，"死而后已"');
  assert.equal(a.birthday, '0181-07-23');
  assert.equal(a.website, 'https://shu.example.com');
  assert.deepEqual(plain(a.categories), ['军师', '重要']);
  assert.equal(back[1].fullName, '张三');
  assert.equal(back[1].phones[0].number, '13900001111');
});

test('往返：VCF -> Excel(xlsx, SheetJS 在沙箱中运行) -> VCF', () => {
  const demos = table.getDemoContacts();
  const buf = table.contactsToXlsxBuffer(demos);
  assert.ok(buf.byteLength > 1000);
  // xlsx 本质是 zip，PK 头
  const u8 = new Uint8Array(buf);
  assert.equal(u8[0], 0x50);
  assert.equal(u8[1], 0x4b);
  const restored = table.parseSpreadsheetBuffer(buf);
  assert.equal(restored.length, demos.length);
  const back = vcard.parseVCard(vcard.generateVCard(restored, { version: '3.0', encoding: 'utf-8' }));
  back.forEach((c, i) => {
    assert.equal(c.fullName, demos[i].fullName);
    assert.equal(c.phones[0].number, demos[i].phones[0].number.replace(/-/g, ''));
    assert.equal(c.organization, demos[i].organization);
    assert.equal(c.address.city, demos[i].address.city);
  });
});

test('CSV 解析：英文表头别名、引号、Tab 分隔、GBK 文件自动识别', () => {
  const csv = 'Name,Mobile,Email,Company,Notes\r\n"Doe, John",+1 415 555 0100,"a@x.com;b@y.com",ACME,"多行\n备注"\r\n王五,13700000000,,,\r\n';
  const cs = table.parseCsvText(csv);
  assert.equal(cs.length, 2);
  assert.equal(cs[0].fullName, 'Doe, John');
  assert.equal(cs[0].emails.length, 2);
  assert.equal(cs[0].notes, '多行\n备注');
  assert.equal(cs[1].familyName, '王');

  const tsv = '姓名\t手机\n赵六\t13600000000\n';
  assert.equal(table.parseCsvText(tsv)[0].phones[0].number, '13600000000');

  // "姓名,手机\r\n张三,138" 的 GBK 字节
  const gbk = new Uint8Array([0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xca, 0xd6, 0xbb, 0xfa, 0x0d, 0x0a, 0xd5, 0xc5, 0xc8, 0xfd, 0x2c, 0x31, 0x33, 0x38]);
  const dec = encoding.decodeAuto(gbk);
  assert.equal(dec.encoding, 'GBK');
  assert.equal(dec.text, '姓名,手机\r\n张三,138');

  const utf8bom = encoding.utf8Encode('\uFEFFBEGIN:VCARD\nFN:测试😀\nEND:VCARD');
  const d2 = encoding.decodeAuto(utf8bom);
  assert.equal(vcard.parseVCard(d2.text)[0].fullName, '测试😀');
});

test('超过 2 个号码导出表格时不丢失（修复原版问题）', () => {
  const c = vcard.parseVCard('BEGIN:VCARD\nFN:多号\nTEL;CELL:1\nTEL;WORK:2\nTEL;HOME:3\nEND:VCARD')[0];
  const row = table.contactsToFormat1Rows([c])[0];
  assert.equal(row['备用电话'], '2;3');
  assert.equal(table.format1RowsToContacts([row])[0].phones.length, 3);
});

test('查重合并：号码/姓名重复，连锁重复只保留一条', () => {
  const list = vcard.parseVCard(`BEGIN:VCARD
FN:张三
TEL:138-0000-0000
NOTE:A
END:VCARD
BEGIN:VCARD
FN:张三丰
TEL:13800000000
EMAIL:z@x.com
NOTE:B
END:VCARD
BEGIN:VCARD
FN:张三
TEL:13900000000
CATEGORIES:同事
END:VCARD
BEGIN:VCARD
FN:李四
TEL:13700000000
END:VCARD`);
  const groups = dedupe.findDuplicateGroups(list);
  assert.equal(groups.length, 2);
  const res = dedupe.mergeDuplicates(list);
  assert.equal(res.contacts.length, 2);
  assert.equal(res.removed, 2);
  const m = res.contacts[0];
  assert.equal(m.fullName, '张三');
  // 138-0000-0000 与 13800000000 归一化后是同一号码，只保留首个写法
  assert.deepEqual(plain(m.phones.map(p => p.number)), ['138-0000-0000', '13900000000']);
  assert.equal(m.emails[0].address, 'z@x.com');
  assert.equal(m.notes, 'A；B');
  assert.deepEqual(plain(m.categories), ['同事']);
  assert.equal(res.contacts[1].fullName, '李四');
});
