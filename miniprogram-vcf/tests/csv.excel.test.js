const test = require('node:test');
const assert = require('node:assert/strict');
const { createMiniProgramLikeRequire } = require('./sandbox');

const sb = createMiniProgramLikeRequire();
const table = sb.require('table.js');
const plain = (v) => JSON.parse(JSON.stringify(v));

const EMPTY_ADDR = { street: '', city: '', region: '', postalCode: '', country: '', fullAddress: '' };
function contact(o) {
  return Object.assign({
    id: 'x', fullName: '张三', familyName: '张', givenName: '三', phones: [], emails: [],
    organization: '', department: '', jobTitle: '', address: Object.assign({}, EMPTY_ADDR),
    notes: '', birthday: '', website: '', categories: []
  }, o);
}

test('csvEscape：每类值导出的原始文本', () => {
  const cases = [
    // 号码类：="..." 文本公式（再按 RFC 4180 加引号）
    ['13800138000', '"=""13800138000"""'],
    ['+8613800138000', '"=""+8613800138000"""'],
    ['+86 138-0013-8000', '"=""+86 138-0013-8000"""'],
    ['010-88886661', '"=""010-88886661"""'],
    ['02088886661', '"=""02088886661"""'],
    ['010080', '"=""010080"""'],
    ['8613800138001', '"=""8613800138001"""'],
    // 不需要处理的普通值
    ['12345', '12345'],
    ['1988-06-15', '1988-06-15'],
    ['张三', '张三'],
    ['', ''],
    // 公式注入：前置 ' 并加引号
    ['=1+2', '"\'=1+2"'],
    ['=HYPERLINK("http://evil","x")', '"\'=HYPERLINK(""http://evil"",""x"")"'],
    ['+SUM(A1)', '"\'+SUM(A1)"'],
    ['-2+3', '"\'-2+3"'],
    ['@cmd', '"\'@cmd"'],
    ['\tx', '"\'\tx"'],
    ['\rx', '"\'\rx"'],
    ["'=x", '"\'\'=x"'],
    ["'普通", "'普通"],
    // RFC 4180
    ['a,b', '"a,b"'],
    ['他说"好"', '"他说""好"""'],
    ['第一行\n第二行', '"第一行\n第二行"'],
    ['a\r\nb', '"a\r\nb"']
  ];
  for (const [input, expected] of cases) {
    assert.equal(table.csvEscape(input), expected, JSON.stringify(input));
    // 单元格级往返：RFC 4180 解析 + 去掉包装 = 原值
    const parsed = table.parseCsvToArray('h\n' + expected + '\n')[1];
    assert.equal(table.csvUnescapeCell(parsed ? parsed[0] : ''), input, JSON.stringify(input));
  }
});

test('导出 CSV 再用本项目的导入器读回：每个值都与原值一致；BOM 保留', () => {
  const list = [
    contact({ fullName: '张三', familyName: '张', givenName: '三',
      phones: [{ number: '+8613800138000', type: 'CELL' }, { number: '02088886661', type: 'WORK' }],
      emails: [{ address: 'a@b.cn', type: 'WORK' }], organization: '=HYPERLINK("http://evil")', department: '-研发部',
      jobTitle: '@负责人', address: { street: '路1号, 2栋 "A"座', city: '广州', region: '广东', postalCode: '010080', country: '中国', fullAddress: '路1号, 2栋 "A"座' },
      notes: "第一行\n第二行，含逗号, 和引号\"\n'=不是公式", birthday: '1990-01-01', website: 'https://x.cn/?a=1,b=2', categories: ['VIP', '同事'] }),
    contact({ fullName: '李四', familyName: '李', givenName: '四', phones: [{ number: '13900139000', type: 'CELL' }], notes: '+备注', jobTitle: '-' }),
    contact({ fullName: 'Tom Lee', familyName: 'Lee', givenName: 'Tom', phones: [{ number: '+1-415-555-0199', type: 'CELL' }, { number: '010-88886661', type: 'HOME' }, { number: '8613800138001', type: 'WORK' }] })
  ];
  const csv = table.contactsToCsv(list);
  assert.equal(csv.charCodeAt(0), 0xfeff, '应带 UTF-8 BOM');
  // 原始文本断言
  assert.ok(csv.includes(',"=""+8613800138000""",'));
  assert.ok(csv.includes('"=""02088886661""";"=""') === false, '多号码合并的单元格不是号码格式，不应套 ="..."');
  assert.ok(csv.includes(',"\'=HYPERLINK(""http://evil"")",'));
  assert.ok(csv.includes(',"\'-研发部",'));
  assert.ok(csv.includes(',"\'@负责人",'));
  assert.ok(csv.includes(',"=""010080""",'));
  assert.ok(csv.includes(',"\'+备注",'));
  assert.ok(csv.includes(',"\'-",'));
  assert.ok(!/(^|,)[=+\-@]/m.test(csv.replace(/"(?:[^"]|"")*"/g, 'Q')), '未加引号的单元格不能以公式字符开头');

  const back = plain(table.parseCsvText(csv));
  assert.equal(back.length, list.length);
  const rowsOut = plain(table.contactsToFormat1Rows(list));
  const rowsBack = plain(table.contactsToFormat1Rows(back));
  // 逐个单元格比较（格式1 的 20 列）
  // 导入器本身会去掉号码中的空格和 -（原有行为），号码列按同样规则比较；其余列逐字相同
  const PHONE_COLS = ['主要电话', '备用电话'];
  const norm = (v) => String(v).replace(/[\s-]/g, '');
  for (let i = 0; i < list.length; i++) {
    for (const col of table.FORMAT1_COLUMNS) {
      const want = PHONE_COLS.includes(col) ? norm(rowsOut[i][col]) : rowsOut[i][col];
      assert.equal(rowsBack[i][col], want, `第 ${i + 1} 行 ${col}`);
    }
  }
  assert.equal(back[0].phones[0].number, '+8613800138000');
  assert.equal(back[0].phones[1].number, '02088886661');
  assert.equal(back[0].organization, '=HYPERLINK("http://evil")');
  assert.equal(back[0].notes, "第一行\n第二行，含逗号, 和引号\"\n'=不是公式");
  assert.equal(back[0].address.postalCode, '010080');
  assert.equal(back[1].jobTitle, '-');
  assert.equal(back[1].notes, '+备注');
  assert.deepEqual(back[2].phones.map(p => p.number), ['+1-415-555-0199'.replace(/-/g, ''), '01088886661', '8613800138001']);
});

test('导入 Excel 另存的 CSV（已无 ="..." 包装）以及未加引号的 ="..." 也能识别', () => {
  const c = table.parseCsvText('姓名,手机,邮编\n张三,="13800138000",="010080"\n李四,13900139000,100080\n')
  assert.equal(c[0].phones[0].number, '13800138000');
  assert.equal(c[0].address.postalCode, '010080');
  assert.equal(c[1].phones[0].number, '13900139000');
});
