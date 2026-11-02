/**
 * 代码审查补充用例：vCard 2.1/3.0/4.0 边界情况 + GBK/GB18030 解码
 * 同样在“类小程序”沙箱中加载（无 Buffer/TextDecoder/DOM）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMiniProgramLikeRequire } = require('./sandbox');

const sb = createMiniProgramLikeRequire();
const vcard = sb.require('vcard.js');
const encoding = sb.require('encoding.js');
const plain = (v) => JSON.parse(JSON.stringify(v));
const card = (...lines) => ['BEGIN:VCARD', ...lines, 'END:VCARD'].join('\r\n');

test('unescapeVCard：转义的反斜杠后跟 n 不应变成换行', () => {
  assert.equal(vcard.unescapeVCard('C:\\\\new'), 'C:\\new');
  assert.equal(vcard.unescapeVCard('a\\nb\\Nc'), 'a\nb\nc');
  assert.equal(vcard.unescapeVCard('x\\,y\\;z\\\\'), 'x,y;z\\');
  const [c] = vcard.parseVCard(card('VERSION:3.0', 'FN:A', 'NOTE:C:\\\\new\\nline2'));
  assert.equal(c.notes, 'C:\\new\nline2');
});

test('N / ORG / ADR / CATEGORIES 中转义的 ; 与 , 不参与切分', () => {
  const [c] = vcard.parseVCard(card(
    'VERSION:3.0',
    'N:O\\;Brien;Pat;;;',
    'FN:Pat O;Brien',
    'ORG:A\\;B 公司;研发部',
    'ADR;TYPE=WORK:;;1\\;2 号楼\\, 东门;深圳;广东;518000;中国',
    'CATEGORIES:朋友\\,同事,VIP'
  ));
  assert.equal(c.familyName, 'O;Brien');
  assert.equal(c.givenName, 'Pat');
  assert.equal(c.organization, 'A;B 公司');
  assert.equal(c.department, '研发部');
  assert.equal(c.address.street, '1;2 号楼, 东门');
  assert.equal(c.address.city, '深圳');
  assert.equal(c.address.postalCode, '518000');
  assert.deepEqual(plain(c.categories), ['朋友,同事', 'VIP']);
});

test('生成 -> 解析往返：含 ; , \\ 的字段不变形', () => {
  const src = [{
    fullName: '测试;一号', familyName: '测试;', givenName: '一号',
    phones: [{ number: '13800000000', type: 'CELL' }], emails: [],
    organization: 'A;B,C', department: 'D\\E', jobTitle: '',
    address: { street: '1;2 号', city: '城,市', region: '', postalCode: '', country: '', fullAddress: '' },
    notes: '路径 C:\\new\n第二行', birthday: '', website: '', categories: ['x,y', 'z']
  }];
  for (const version of ['3.0', '4.0']) {
    const [c] = vcard.parseVCard(vcard.generateVCard(src, { version, encoding: 'utf-8' }));
    assert.equal(c.fullName, '测试;一号', version);
    assert.equal(c.familyName, '测试;', version);
    assert.equal(c.organization, 'A;B,C', version);
    assert.equal(c.department, 'D\\E', version);
    assert.equal(c.address.street, '1;2 号', version);
    assert.equal(c.address.city, '城,市', version);
    assert.equal(c.notes, '路径 C:\\new\n第二行', version);
    assert.deepEqual(plain(c.categories), ['x,y', 'z'], version);
  }
});

test('QP 软换行后续行以空格开头时不会多出 "="', () => {
  const vcf = card(
    'VERSION:2.1',
    'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=BC=A0=',
    ' =E4=B8=89',
    'NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:=E7=AC=AC=E4=B8=80=E8=A1=8C=0D=0A=',
    '=E7=AC=AC=E4=BA=8C=E8=A1=8C',
    'TEL;CELL:13800000000'
  );
  const [c] = vcard.parseVCard(vcf);
  assert.equal(c.fullName, '张三');
  assert.equal(c.notes, '第一行\r\n第二行');
  assert.equal(c.phones.length, 1);
});

test('小写参数 charset/encoding、2.1 裸 QUOTED-PRINTABLE 参数', () => {
  const [a, b] = vcard.parseVCard([
    card('VERSION:2.1', 'FN;charset=utf-8;encoding=quoted-printable:=E5=BC=A0'),
    card('VERSION:2.1', 'FN;CHARSET=GB2312;QUOTED-PRINTABLE:=C0=EE=CB=C4')
  ].join('\r\n'));
  assert.equal(a.fullName, '张');
  assert.equal(b.fullName, '李四');
});

test('NOTE 正文中出现 END:VCARD 不截断名片；BEGIN/END 大小写不敏感', () => {
  const list = vcard.parseVCard([
    'begin:vcard', 'version:3.0', 'fn:甲', 'NOTE:内容 END:VCARD 之后', 'TEL:1', 'end:vcard'
  ].join('\n'));
  assert.equal(list.length, 1);
  assert.equal(list[0].notes, '内容 END:VCARD 之后');
  assert.equal(list[0].phones.length, 1);
});

test('嵌套 vCard（2.1 AGENT）不打断外层名片', () => {
  const list = vcard.parseVCard(card(
    'VERSION:2.1', 'FN:外层', 'AGENT:', 'BEGIN:VCARD', 'VERSION:2.1', 'FN:内层', 'END:VCARD', 'TEL:123'
  ));
  assert.equal(list.length, 1);
  assert.equal(list[0].fullName, '外层');
  assert.deepEqual(plain(list[0].phones.map(p => p.number)), ['123']);
});

test('BOM、CRLF / LF / 单独 CR 行尾混用', () => {
  const vcf = '\uFEFFBEGIN:VCARD\rVERSION:3.0\r\nFN:甲\nTEL:1\rEND:VCARD\r\nBEGIN:VCARD\nFN:乙\nEND:VCARD';
  const list = vcard.parseVCard(vcf);
  assert.deepEqual(plain(list.map(c => c.fullName)), ['甲', '乙']);
});

test('空名片被跳过；只有 N 时生成 FN；FN 为空时由 N 生成', () => {
  const list = vcard.parseVCard([
    card('VERSION:3.0'),
    card('VERSION:3.0', 'N:;;;;', 'FN:'),
    card('VERSION:3.0', 'N:Smith;John;;;'),
    card('VERSION:3.0', 'N:王;小明;;;', 'FN:')
  ].join('\r\n'));
  assert.deepEqual(plain(list.map(c => c.fullName)), ['John Smith', '王小明']);
});

test('多个 TEL/EMAIL 与各版本 TYPE 写法', () => {
  const [c] = vcard.parseVCard(card(
    'VERSION:4.0',
    'FN:A',
    'TEL;TYPE="work,voice";VALUE=uri:tel:+86-10-1234',
    'TEL;TYPE=home:0755-1',
    'TEL;TYPE=cell:138',
    'TEL;CELL;VOICE:139',
    'TEL:140',
    'EMAIL;TYPE=INTERNET;TYPE=WORK:a@x.com',
    'EMAIL;HOME:b@x.com',
    'EMAIL:c@x.com'
  ));
  assert.deepEqual(plain(c.phones), [
    { number: '+86-10-1234', type: 'WORK' },
    { number: '0755-1', type: 'HOME' },
    { number: '138', type: 'CELL' },
    { number: '139', type: 'CELL' },
    { number: '140', type: 'CELL' }
  ]);
  assert.deepEqual(plain(c.emails.map(e => e.type)), ['WORK', 'HOME', 'OTHER']);
});

test('参数值带引号且含冒号时，值从正确的冒号开始', () => {
  const [c] = vcard.parseVCard(card(
    'VERSION:4.0', 'FN:A', 'ADR;LABEL="北京:海淀";TYPE=work:;;中关村;北京;;;'
  ));
  assert.equal(c.address.street, '中关村');
  assert.equal(c.address.city, '北京');
});

test('PHOTO：2.1 折行 base64、3.0 ENCODING=b、4.0 data URI', () => {
  const list = vcard.parseVCard([
    card('VERSION:2.1', 'FN:A', 'PHOTO;ENCODING=BASE64;JPEG:/9j/4AAQ', '  SkZJRg', '', 'TEL:1'),
    card('VERSION:3.0', 'FN:B', 'PHOTO;ENCODING=b;TYPE=PNG:iVBORw0K', ' GgoAAA'),
    card('VERSION:4.0', 'FN:C', 'PHOTO:data:image/png;base64,iVBORw0KGgo')
  ].join('\r\n'));
  assert.equal(list[0].photo, 'data:image/jpeg;base64,/9j/4AAQSkZJRg');
  assert.equal(list[0].phones.length, 1);
  assert.equal(list[1].photo, 'data:image/png;base64,iVBORw0KGgoAAA');
  assert.equal(list[2].photo, 'data:image/png;base64,iVBORw0KGgo');
});

test('大文件：2 万张名片 + 大头像解析正确且耗时可控', () => {
  const bigPhoto = 'A'.repeat(76);
  const parts = [];
  for (let i = 0; i < 20000; i++) {
    parts.push(card('VERSION:3.0', 'FN:联系人' + i, 'TEL;TYPE=CELL:138' + String(i).padStart(8, '0'),
      'PHOTO;ENCODING=b;TYPE=JPEG:' + bigPhoto, ...Array(20).fill(' ' + bigPhoto)));
  }
  const t = Date.now();
  const list = vcard.parseVCard(parts.join('\r\n'));
  const ms = Date.now() - t;
  assert.equal(list.length, 20000);
  assert.equal(list[19999].fullName, '联系人19999');
  assert.equal(list[19999].photo.length, 'data:image/jpeg;base64,'.length + 76 * 21);
  assert.ok(ms < 5000, 'parse took ' + ms + 'ms');
});

test('GB18030 四字节：emoji 与 BMP 扩展区', () => {
  // 张 = D5C5；😀 U+1F600 = 9439FC36；€ 单字节 80；U+00A5(¥) = 81308436；U+E5E5 = 8135F437
  assert.equal(encoding.gbkDecode(new Uint8Array([0xd5, 0xc5, 0x94, 0x39, 0xfc, 0x36, 0x41])), '张😀A');
  assert.equal(encoding.gbkDecode(new Uint8Array([0x81, 0x30, 0x84, 0x36])), '\u00a5');
  assert.equal(encoding.gbkDecode(new Uint8Array([0x81, 0x30, 0x81, 0x30])), '\u0080');
  assert.equal(encoding.gbkDecode(new Uint8Array([0x84, 0x31, 0xa4, 0x39])), '\uffff');
  // 不在合法范围内的四字节 -> 单个替换符，不吐出 "0" "9" 等数字
  assert.equal(encoding.gbkDecode(new Uint8Array([0x84, 0x32, 0x81, 0x30])), '\ufffd');
  // 文件级：GB18030 编码的 VCF（含 emoji）自动识别
  const bytes = new Uint8Array([
    ...Array.from('BEGIN:VCARD\r\nFN:', ch => ch.charCodeAt(0)), 0xd5, 0xc5, 0x94, 0x39, 0xfc, 0x36,
    ...Array.from('\r\nEND:VCARD\r\n', ch => ch.charCodeAt(0))
  ]);
  const dec = encoding.decodeAuto(bytes.buffer);
  assert.equal(dec.encoding, 'GBK');
  assert.equal(vcard.parseVCard(dec.text)[0].fullName, '张😀');
});

test('QP + CHARSET=GB18030 四字节', () => {
  const [c] = vcard.parseVCard(card('VERSION:2.1', 'FN;CHARSET=GB18030;ENCODING=QUOTED-PRINTABLE:=D5=C5=94=39=FC=36'));
  assert.equal(c.fullName, '张😀');
});

test('UTF-8 BOM / UTF-16LE / UTF-16BE 文件解码后可解析', () => {
  const text = 'BEGIN:VCARD\r\nFN:张三\r\nEND:VCARD\r\n';
  const u8 = encoding.utf8Encode(text);
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...u8]);
  const le = [0xff, 0xfe], be = [0xfe, 0xff];
  for (let i = 0; i < text.length; i++) {
    const cc = text.charCodeAt(i);
    le.push(cc & 0xff, cc >> 8); be.push(cc >> 8, cc & 0xff);
  }
  for (const b of [withBom, new Uint8Array(le), new Uint8Array(be)]) {
    const d = encoding.decodeAuto(b.buffer);
    assert.equal(vcard.parseVCard(d.text)[0].fullName, '张三', d.encoding);
  }
});
