const test = require('node:test');
const assert = require('node:assert/strict');
const { createMiniProgramLikeRequire } = require('./sandbox');

const sb = createMiniProgramLikeRequire();
const storage = sb.require('storage.js');
const plain = (v) => JSON.parse(JSON.stringify(v));

const KEY_LIMIT = 1024 * 1024; // 单个 key 1MB
const TOTAL_LIMIT = 10 * 1024 * 1024; // 总量 10MB
const bytes = (s) => Buffer.byteLength(s, 'utf8');

/** 严格的 wx 存储模拟：按 JSON 序列化后的 UTF-8 字节数执行 1MB/key 与 10MB 总量限制 */
function createMockWx(opts = {}) {
  const data = new Map();
  const sizes = new Map();
  let total = 0;
  const log = [];
  const api = {
    data, log,
    failOnSet: null, // (key) => true 时模拟写入中途失败/崩溃
    getStorageSync(k) { return data.has(k) ? JSON.parse(data.get(k)) : ''; },
    setStorageSync(k, v) {
      if (api.failOnSet && api.failOnSet(k)) throw { errMsg: 'setStorageSync:fail simulated crash' };
      const s = JSON.stringify(v);
      const size = bytes(s) + bytes(k);
      if (size > KEY_LIMIT) throw { errMsg: 'setStorageSync:fail exceed max size 1MB for one key' };
      const next = total - (sizes.get(k) || 0) + size;
      if (next > TOTAL_LIMIT) throw { errMsg: 'setStorageSync:fail exceed storage max size 10MB' };
      data.set(k, s); sizes.set(k, size); total = next;
      log.push(['set', k]);
    },
    removeStorageSync(k) {
      if (data.has(k)) { total -= sizes.get(k); data.delete(k); sizes.delete(k); }
      log.push(['remove', k]);
    },
    get totalBytes() { return total; }
  };
  if (!opts.noInfo) {
    api.getStorageInfoSync = () => ({ keys: [...data.keys()], currentSize: Math.ceil(total / 1024), limitSize: TOTAL_LIMIT / 1024 });
  }
  return api;
}

const EMPTY_ADDR = { street: '', city: '', region: '', postalCode: '', country: '', fullAddress: '' };
/** 典型通讯录：姓名 + 1~2 个号码，部分有邮箱/公司/备注（与 parseVCard 输出结构一致） */
function typicalContacts(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const phones = [{ number: '138' + String(i).padStart(8, '0'), type: 'CELL' }];
    if (i % 3 === 0) phones.push({ number: '010-' + String(80000000 + i), type: 'WORK' });
    out.push({
      id: 'c_' + i.toString(36) + 'abcdefgh', fullName: '联系人' + i, familyName: '联', givenName: '系人' + i,
      phones, emails: i % 2 ? [{ address: 'user' + i + '@example.com', type: 'WORK' }] : [],
      organization: i % 4 === 0 ? '某某科技有限公司' : '', department: '', jobTitle: i % 4 === 0 ? '经理' : '',
      address: Object.assign({}, EMPTY_ADDR), notes: i % 10 === 0 ? '备注：老客户' : '', birthday: '', website: '', categories: i % 5 === 0 ? ['同事'] : []
    });
  }
  return out;
}
/** 信息很全的联系人（类似演示数据，约 0.6KB/人） */
function richContacts(n) {
  return typicalContacts(n).map((c, i) => Object.assign(c, {
    emails: [{ address: 'user' + i + '@example.com', type: 'WORK' }, { address: 'p' + i + '@gmail.com', type: 'HOME' }],
    organization: '未来云创科技有限公司', department: '技术研发部', jobTitle: '高级工程师',
    address: { street: '中关村南大街' + i + '号鼎好大厦A座', city: '北京市', region: '北京', postalCode: '100080', country: '中国', fullAddress: '北京市 海淀区 中关村南大街' + i + '号' },
    notes: '核心合作伙伴，微信同手机号，定期跟进', birthday: '1988-06-15', website: 'https://example.com', categories: ['VIP客户', '技术专家']
  }));
}

const metaOf = (wx) => wx.getStorageSync('vcf_contacts_v2_meta');
const newStore = (wx, o) => storage.createContactStore(wx, Object.assign({ prefix: 'vcf_contacts_v2', legacyKey: 'vcf_contacts_v1' }, o));

for (const n of [3000, 20000, 50000]) {
  test(`分片缓存往返：${n} 位典型联系人`, () => {
    const wx = createMockWx();
    const list = typicalContacts(n);
    const res = newStore(wx).save(list);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.photosDropped, 0);
    for (const [k, v] of wx.data) assert.ok(bytes(v) <= 700 * 1024 + 64, k + ' 超过 700KB');
    assert.ok(wx.totalBytes < TOTAL_LIMIT);
    const loaded = newStore(wx).load();
    assert.equal(loaded.source, 'chunks');
    assert.deepEqual(plain(loaded.contacts), list);
    // 输出实测容量，便于更新 README
    console.log(`  ${n} 位典型联系人：${(wx.totalBytes / 1048576).toFixed(2)}MB，${metaOf(wx).chunkKeys.length} 个分片，约 ${Math.round(wx.totalBytes / n)} 字节/人`);
  });
}

test('超过 10MB：信息很全的 50000 位联系人存不下时返回 QUOTA（不抛异常、不留半份数据），旧缓存不受影响', () => {
  const wx = createMockWx();
  const store = newStore(wx);
  assert.equal(store.save(typicalContacts(10)).ok, true);
  const res = store.save(richContacts(50000));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'QUOTA');
  console.log(`  50000 位信息很全的联系人需要 ${(res.bytes / 1048576).toFixed(1)}MB > 10MB`);
  const loaded = store.load();
  assert.equal(loaded.contacts.length, 10, '保存失败时保留上一次的缓存');
  // 信息很全的联系人实测上限
  let lo = 1000, hi = 50000;
  while (hi - lo > 500) { const mid = (lo + hi) >> 1; if (newStore(createMockWx()).save(richContacts(mid)).ok) lo = mid; else hi = mid; }
  console.log(`  信息很全的联系人约可缓存 ${lo} 位`);
  assert.ok(lo >= 15000);
});

test('PHOTO：小量照片正常保存；总量超 10MB 时去掉照片保存并报告数量', () => {
  const wx = createMockWx();
  const store = newStore(wx);
  const few = typicalContacts(50).map((c, i) => Object.assign(c, { photo: 'data:image/jpeg;base64,' + 'A'.repeat(20000 + i) }));
  let res = store.save(few);
  assert.equal(res.ok, true);
  assert.equal(res.photosDropped, 0);
  assert.deepEqual(plain(store.load().contacts), plain(few));

  // 单张照片很大（600KB）也能单独成片
  const big = typicalContacts(3).map(c => Object.assign(c, { photo: 'data:image/jpeg;base64,' + 'B'.repeat(600 * 1024) }));
  res = store.save(big);
  assert.equal(res.ok, true);
  assert.equal(metaOf(wx).chunkKeys.length, 3);
  assert.deepEqual(plain(store.load().contacts), plain(big));

  // 2000 位 × 8KB 照片 ≈ 16MB > 10MB：去掉照片后保存
  const many = typicalContacts(2000).map(c => Object.assign(c, { photo: 'data:image/png;base64,' + 'C'.repeat(8000) }));
  res = store.save(many);
  assert.equal(res.ok, true);
  assert.equal(res.photosDropped, 2000);
  const back = store.load().contacts;
  assert.equal(back.length, 2000);
  assert.ok(back.every(c => !c.photo));
  assert.deepEqual(plain(back), plain(many.map(c => { const x = Object.assign({}, c); delete x.photo; return x; })));
  assert.equal(many[0].photo.length > 0, true, '不应修改调用方传入的联系人');
});

test('没有 getStorageInfoSync 时，写入阶段才发现超限也会去掉照片重试', () => {
  const wx = createMockWx({ noInfo: true });
  const many = typicalContacts(2000).map(c => Object.assign(c, { photo: 'data:image/png;base64,' + 'C'.repeat(8000) }));
  const res = newStore(wx).save(many);
  assert.equal(res.ok, true);
  assert.equal(res.photosDropped, 2000);
  assert.equal(newStore(wx).load().contacts.length, 2000);
});

test('迁移：旧版单 key 读入后写成分片并删除旧 key', () => {
  const wx = createMockWx();
  const legacy = typicalContacts(2500);
  wx.data.set('vcf_contacts_v1', JSON.stringify(legacy)); // 旧版（可能超过 1MB 前就存进去的）
  const r = newStore(wx).load();
  assert.equal(r.source, 'legacy');
  assert.equal(r.migrated.ok, true);
  assert.deepEqual(plain(r.contacts), legacy);
  assert.equal(wx.data.has('vcf_contacts_v1'), false);
  const again = newStore(wx).load();
  assert.equal(again.source, 'chunks');
  assert.deepEqual(plain(again.contacts), legacy);
});

test('迁移失败（写入出错）时保留旧 key，下次再试', () => {
  const wx = createMockWx();
  const legacy = typicalContacts(100);
  wx.data.set('vcf_contacts_v1', JSON.stringify(legacy));
  wx.failOnSet = () => true;
  const r = newStore(wx).load();
  assert.equal(r.contacts.length, 100);
  assert.equal(r.migrated.ok, false);
  assert.ok(wx.data.has('vcf_contacts_v1'));
  wx.failOnSet = null;
  assert.equal(newStore(wx).load().migrated.ok, true);
  assert.equal(wx.data.has('vcf_contacts_v1'), false);
});

test('损坏/缺失分片：读取返回空并清理全部残留（meta 与分片）', () => {
  for (const damage of ['missing', 'corrupt', 'count', 'badmeta']) {
    const wx = createMockWx();
    const store = newStore(wx);
    store.save(typicalContacts(8000));
    const meta = metaOf(wx);
    assert.ok(meta.chunkKeys.length >= 2);
    if (damage === 'missing') wx.removeStorageSync(meta.chunkKeys[1]);
    if (damage === 'corrupt') wx.data.set(meta.chunkKeys[1], JSON.stringify({ not: 'an array' }));
    if (damage === 'count') wx.data.set('vcf_contacts_v2_meta', JSON.stringify(Object.assign({}, meta, { count: meta.count + 1 })));
    if (damage === 'badmeta') wx.data.set('vcf_contacts_v2_meta', JSON.stringify({ version: 99 }));
    const r = store.load();
    assert.deepEqual(plain(r.contacts), [], damage);
    assert.equal(r.source, 'corrupt', damage);
    assert.deepEqual([...wx.data.keys()].filter(k => k.startsWith('vcf_contacts_v2')), [], damage + ' 应清理干净');
    // 清理后可以正常再保存
    assert.equal(store.save(typicalContacts(5)).ok, true);
    assert.equal(store.load().contacts.length, 5);
  }
});

test('写入顺序：先写新分片、再写 meta、最后删旧分片；中途崩溃仍能读到上一次的完整数据', () => {
  const wx = createMockWx();
  const store = newStore(wx);
  const v1 = typicalContacts(6000);
  store.save(v1);
  const oldKeys = metaOf(wx).chunkKeys;
  wx.log.length = 0;
  const v2 = typicalContacts(7000);
  assert.equal(store.save(v2).ok, true);
  const metaIdx = wx.log.findIndex(([op, k]) => op === 'set' && k === 'vcf_contacts_v2_meta');
  const newKeys = metaOf(wx).chunkKeys;
  for (const k of newKeys) assert.ok(wx.log.findIndex(([op, x]) => op === 'set' && x === k) < metaIdx);
  for (const k of oldKeys) assert.ok(wx.log.findIndex(([op, x]) => op === 'remove' && x === k) > metaIdx);
  assert.equal(newKeys.some(k => oldKeys.includes(k)), false, '新旧分片使用不同的代号');

  // 模拟在写第 2 个新分片时崩溃
  let n = 0;
  wx.failOnSet = (k) => k.includes('_chunk_') && ++n === 2;
  const res = store.save(typicalContacts(9000));
  assert.equal(res.ok, false);
  wx.failOnSet = null;
  assert.deepEqual(plain(store.load().contacts), v2, '崩溃后仍读到上一次完整保存的数据');
  // 模拟在写 meta 时崩溃
  wx.failOnSet = (k) => k.endsWith('_meta');
  assert.equal(store.save(typicalContacts(100)).ok, false);
  wx.failOnSet = null;
  assert.deepEqual(plain(store.load().contacts), v2);
  // 失败的写入不留下孤儿分片
  assert.equal([...wx.data.keys()].filter(k => k.includes('_chunk_')).length, metaOf(wx).chunkKeys.length);
});

test('收缩：数据变少时旧的多余分片被删除；清空后只剩空 meta', () => {
  const wx = createMockWx();
  const store = newStore(wx);
  store.save(typicalContacts(20000));
  const before = metaOf(wx).chunkKeys.length;
  assert.ok(before > 3);
  store.save(typicalContacts(100));
  const chunkKeys = [...wx.data.keys()].filter(k => k.includes('_chunk_'));
  assert.equal(chunkKeys.length, 1);
  assert.deepEqual(chunkKeys, metaOf(wx).chunkKeys);
  store.save([]);
  assert.equal([...wx.data.keys()].filter(k => k.includes('_chunk_')).length, 0);
  assert.equal(metaOf(wx).count, 0);
  assert.deepEqual(plain(store.load().contacts), []);
});

test('崩溃残留的孤儿分片在下次保存时被清理', () => {
  const wx = createMockWx();
  const store = newStore(wx);
  store.save(typicalContacts(10));
  wx.setStorageSync('vcf_contacts_v2_chunk_99_0', [{ id: 'x' }]);
  store.save(typicalContacts(20));
  assert.equal(wx.data.has('vcf_contacts_v2_chunk_99_0'), false);
  assert.equal(store.load().contacts.length, 20);
});

test('接近 10MB 时新旧两份放不下：先清空再写，仍然成功', () => {
  const wx = createMockWx();
  const store = newStore(wx);
  const big = richContacts(12000); // 约 6MB+
  assert.equal(store.save(big).ok, true);
  const big2 = richContacts(12500);
  const res = store.save(big2);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(store.load().contacts.length, 12500);
});

test('精简格式可往返任意字段：无类型号码、额外字段、缺省地址、解析器真实输出', () => {
  const vcard = sb.require('vcard.js');
  const parsed = plain(vcard.parseVCard('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:欧阳 Test\r\nTEL;TYPE=HOME:010-1\r\nTEL:+86 138\r\nEMAIL;TYPE=HOME:a@b.cn\r\nADR:;;路1号;城;省;100080;中国\r\nNOTE:x\\, y\r\nCATEGORIES:A,B\r\nEND:VCARD'));
  const odd = [
    { id: 'a', fullName: 'X', phones: [{ number: '1' }, { number: '2', type: 'CELL', label: '自定义' }], emails: [{ address: 'e@x', type: 'OTHER' }], extraField: { k: 1 }, address: { city: '深圳', geo: '1,2' } },
    { id: 'b' },
    { id: 'c', fullName: '', phones: [], address: null, categories: ['同事', 'VIP'] }
  ];
  const wx = createMockWx();
  const store = newStore(wx);
  assert.equal(store.save(parsed.concat(odd)).ok, true);
  const back = plain(store.load().contacts);
  assert.deepEqual(back.slice(0, parsed.length), parsed);
  const full = (c) => Object.assign({ fullName: '', familyName: '', givenName: '', organization: '', department: '', jobTitle: '', notes: '', birthday: '', website: '', phones: [], emails: [], categories: [] }, c);
  const addr = (a) => Object.assign({ street: '', city: '', region: '', postalCode: '', country: '', fullAddress: '' }, a);
  assert.deepEqual(back[parsed.length], full(Object.assign({}, odd[0], { address: addr(odd[0].address) })));
  assert.deepEqual(back[parsed.length + 1], full({ id: 'b', address: addr({}) }));
  assert.deepEqual(back[parsed.length + 2], full({ id: 'c', categories: ['同事', 'VIP'], address: null }));
});
