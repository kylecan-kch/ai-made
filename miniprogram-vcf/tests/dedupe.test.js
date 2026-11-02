const test = require('node:test');
const assert = require('node:assert/strict');
const { createMiniProgramLikeRequire } = require('./sandbox');

const dedupe = createMiniProgramLikeRequire().require('dedupe.js');
const plain = (v) => JSON.parse(JSON.stringify(v));

function c(id, fullName, numbers) {
  return {
    id, fullName, familyName: '', givenName: '', organization: '', department: '', jobTitle: '', notes: '', birthday: '', website: '',
    phones: numbers.map((n) => ({ number: n, type: 'CELL' })), emails: [], categories: [],
    address: { street: '', city: '', region: '', postalCode: '', country: '', fullAddress: '' }
  };
}

test('phoneKey：与网页版一致，去掉空格/横线/括号，11 位大陆手机号去掉 +86/0086/86', () => {
  const cases = [
    ['+86 138-0013-8000', '13800138000'], ['0086 13800138000', '13800138000'], ['8613800138000', '13800138000'],
    ['+86-138 0013 8000', '13800138000'], ['(+86) 138 0013 8000', '13800138000'], ['138 0013 8000', '13800138000'],
    ['13800138000', '13800138000'],
    // 不是 11 位大陆手机号：不去前缀
    ['+86 10 8888 6661', '861088886661'], ['861088886661', '861088886661'], ['+1 415-555-0199', '14155550199'],
    ['010-88886661', '01088886661'], ['8612345', '8612345'], ['', ''], [undefined, ''], [null, '']
  ];
  for (const [raw, want] of cases) assert.equal(dedupe.phoneKey(raw), want, String(raw));
});

test('查重：+86 / 0086 / 86 / 带空格横线的同一手机号视为重复', () => {
  const list = [c('a', '张三', ['+86 138-0013-8000']), c('b', '张老三', ['13800138000']), c('d', '王五', ['0086 138 0013 8000']),
    c('e', '赵六', ['8613800138000']), c('f', '无关', ['13900139000'])];
  const groups = dedupe.findDuplicateGroups(list);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reason, 'phone');
  assert.equal(groups[0].identifier, '电话一致 (13800138000)');
  assert.deepEqual(plain(groups[0].items.map((x) => x.id)), ['a', 'b', 'd', 'e']);
  const res = dedupe.mergeDuplicates(list);
  assert.equal(res.contacts.length, 2);
  assert.equal(res.removed, 3);
  // 合并后按归一化号码去重，保留第一次出现的原始写法
  assert.deepEqual(plain(res.contacts[0].phones), [{ number: '+86 138-0013-8000', type: 'CELL' }]);
  assert.equal(res.contacts[1].id, 'f');
});

test('合并：同一号码不同写法只保留一个（首个写法），不同号码都保留且顺序不变', () => {
  const list = [c('a', '李四', ['138 0013 8000', '010-88886661']), c('b', '李四', ['+8613800138000', '01088886661', '13900139000', '+86 139-0013-9000'])];
  const res = dedupe.mergeDuplicates(list);
  assert.equal(res.contacts.length, 1);
  assert.deepEqual(plain(res.contacts[0].phones.map((p) => p.number)), ['138 0013 8000', '010-88886661', '13900139000']);
  // 不修改输入
  assert.equal(list[1].phones.length, 4);
});

test('不误合并：座机 +86 前缀不去掉，短号（<7 位）不参与号码查重', () => {
  const list = [c('a', 'A', ['+86 10 8888 6661']), c('b', 'B', ['1088886661']), c('d', 'D', ['12345']), c('e', 'E', ['12345'])];
  assert.equal(dedupe.findDuplicateGroups(list).length, 0);
});
