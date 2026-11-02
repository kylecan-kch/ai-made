/**
 * 联系人本地缓存：分片存储（小程序单个 key ≤ 1MB，总量 ≤ 10MB）
 *
 * 存储布局（prefix 默认 'vcf_contacts_v2'）：
 *   <prefix>_meta                 { version, count, gen, chunkKeys, bytes, savedAt, photosDropped }
 *   <prefix>_chunk_<gen>_<i>      联系人数组（精简后：去掉空字符串/空数组/空地址字段）
 *
 * 写入顺序保证“中途崩溃也不会读到半份数据”：
 *   空间充足时：先写新一代(gen+1)的全部分片 -> 再写 meta（提交点）-> 最后删除旧分片；
 *   空间不够同时容纳新旧两份时：先删 meta（缓存变为“无”）-> 删旧分片 -> 写新分片 -> 写 meta。
 * 读取时校验 meta 与每个分片（必须是数组且总条数等于 meta.count），否则清理残留并返回空。
 * 旧版单 key（legacyKey）在首次读取时迁移为分片，成功后删除。
 *
 * 只依赖一个“类 wx”的存储适配器：
 *   getStorageSync(key) / setStorageSync(key, value) / removeStorageSync(key) / [getStorageInfoSync()]
 */

var VERSION = 1;
var DEFAULT_CHUNK_BYTES = 700 * 1024; // 远低于单 key 1MB 上限，给框架自身的序列化开销留余量
var DEFAULT_LIMIT_BYTES = 10 * 1024 * 1024;
var SAFETY_BYTES = 64 * 1024;

var STRING_FIELDS = ['fullName', 'familyName', 'givenName', 'organization', 'department', 'jobTitle', 'notes', 'birthday', 'website'];
var ARRAY_FIELDS = ['phones', 'emails', 'categories'];
var ADDRESS_FIELDS = ['street', 'city', 'region', 'postalCode', 'country', 'fullAddress'];

/** 字符串按 UTF-8 编码后的字节数（不实际编码，避免分配内存） */
function utf8ByteLength(str) {
  var n = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/*
 * 精简存储格式（实测把典型联系人从 ~210 字节压到 ~120 字节）：
 *  - 字段名缩写（fullName -> n ...），空字符串/空数组/空地址不存
 *  - 号码、邮箱存为 [值, 类型]，类型为默认值（CELL / WORK）时省略
 *  - 不认识的字段原样放进 x，保证任何字段都能往返
 */
var SHORT = {
  id: 'i', fullName: 'n', familyName: 'f', givenName: 'g', organization: 'o', department: 'd',
  jobTitle: 't', notes: 'r', birthday: 'b', website: 'w', categories: 'c', photo: 'ph'
};
var ADDR_SHORT = { street: 's', city: 'c', region: 'r', postalCode: 'z', country: 'n', fullAddress: 'f' };
var LONG = {};
Object.keys(SHORT).forEach(function (k) { LONG[SHORT[k]] = k; });
var ADDR_LONG = {};
Object.keys(ADDR_SHORT).forEach(function (k) { ADDR_LONG[ADDR_SHORT[k]] = k; });

function packPair(obj, valueKey, defType) {
  if (!obj || typeof obj !== 'object') return obj;
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) if (keys[i] !== valueKey && keys[i] !== 'type') return obj; // 有额外字段：原样保存
  if (typeof obj[valueKey] !== 'string' || (obj.type !== undefined && typeof obj.type !== 'string')) return obj;
  return obj.type === defType ? [obj[valueKey]] : (obj.type === undefined ? [obj[valueKey], null] : [obj[valueKey], obj.type]);
}

function unpackPair(v, valueKey, defType) {
  if (!Array.isArray(v)) return v;
  var o = {};
  o[valueKey] = v[0];
  if (v.length < 2) o.type = defType;
  else if (v[1] !== null) o.type = v[1];
  return o;
}

function isEmpty(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** 联系人 -> 精简对象 */
function compact(c, dropPhoto) {
  var out = {};
  var extra = null;
  Object.keys(c).forEach(function (k) {
    var v = c[k];
    if (dropPhoto && k === 'photo') return;
    if (k === 'phones' || k === 'emails') {
      if (Array.isArray(v)) {
        if (v.length) out[k === 'phones' ? 'p' : 'e'] = v.map(function (x) {
          return k === 'phones' ? packPair(x, 'number', 'CELL') : packPair(x, 'address', 'WORK');
        });
        return;
      }
    } else if (k === 'address' && v && typeof v === 'object' && !Array.isArray(v)) {
      var a = {};
      var any = false;
      var aextra = null;
      Object.keys(v).forEach(function (ak) {
        if (isEmpty(v[ak]) && ADDR_SHORT[ak]) return;
        if (ADDR_SHORT[ak]) a[ADDR_SHORT[ak]] = v[ak];
        else { aextra = aextra || {}; aextra[ak] = v[ak]; }
        any = true;
      });
      if (aextra) a.x = aextra;
      if (any) out.a = a;
      return;
    } else if (SHORT[k] && (k === 'categories' ? Array.isArray(v) || isEmpty(v) : typeof v === 'string' || isEmpty(v))) {
      if (!isEmpty(v)) out[SHORT[k]] = v;
      return;
    }
    if (v === undefined) return;
    extra = extra || {};
    extra[k] = v;
  });
  if (extra) out.x = extra;
  return out;
}

/** 精简对象 -> 联系人（补齐完整字段结构，与解析器输出一致） */
function expand(s) {
  var out = {};
  if (s.x && typeof s.x === 'object') Object.keys(s.x).forEach(function (k) { out[k] = s.x[k]; });
  Object.keys(LONG).forEach(function (sk) { if (s[sk] !== undefined) out[LONG[sk]] = s[sk]; });
  if (Array.isArray(s.p)) out.phones = s.p.map(function (x) { return unpackPair(x, 'number', 'CELL'); });
  if (Array.isArray(s.e)) out.emails = s.e.map(function (x) { return unpackPair(x, 'address', 'WORK'); });
  STRING_FIELDS.forEach(function (k) { if (out[k] == null) out[k] = ''; });
  ARRAY_FIELDS.forEach(function (k) { if (!Array.isArray(out[k])) out[k] = []; });
  var addr = {};
  ADDRESS_FIELDS.forEach(function (k) { addr[k] = ''; });
  if (s.a && typeof s.a === 'object') {
    Object.keys(ADDR_LONG).forEach(function (sk) { if (s.a[sk] !== undefined) addr[ADDR_LONG[sk]] = s.a[sk]; });
    if (s.a.x && typeof s.a.x === 'object') Object.keys(s.a.x).forEach(function (k) { addr[k] = s.a.x[k]; });
  }
  if (!('address' in out) || (out.address && typeof out.address === 'object')) out.address = addr;
  return out;
}

/** 旧版单 key 中的完整联系人 -> 补齐结构 */
function normalizeLegacy(c) {
  return expand(compact(c, false));
}

/** 按序列化后的 UTF-8 字节数切分，返回 [{items, bytes}] */
function buildChunks(contacts, maxBytes, dropPhoto) {
  var chunks = [];
  var cur = [];
  var curBytes = 2; // "[]"
  var total = 0;
  var photosDropped = 0;
  for (var i = 0; i < contacts.length; i++) {
    var src = contacts[i];
    if (dropPhoto && src && src.photo) photosDropped++;
    var item = compact(src || {}, dropPhoto);
    var b = utf8ByteLength(JSON.stringify(item)) + 1; // 逗号
    if (b + 2 > maxBytes) {
      var err = new Error('单个联系人过大（' + b + ' 字节）');
      err.code = 'ITEM_TOO_LARGE';
      throw err;
    }
    if (cur.length && curBytes + b > maxBytes) {
      chunks.push({ items: cur, bytes: curBytes });
      total += curBytes;
      cur = [];
      curBytes = 2;
    }
    cur.push(item);
    curBytes += b;
  }
  if (cur.length) { chunks.push({ items: cur, bytes: curBytes }); total += curBytes; }
  return { chunks: chunks, bytes: total, photosDropped: photosDropped };
}

function createContactStore(adapter, options) {
  options = options || {};
  var prefix = options.prefix || 'vcf_contacts_v2';
  var legacyKey = options.legacyKey || '';
  var maxChunkBytes = options.maxChunkBytes || DEFAULT_CHUNK_BYTES;
  var metaKey = prefix + '_meta';
  var chunkPrefix = prefix + '_chunk_';

  function get(key) {
    try { return adapter.getStorageSync(key); } catch (e) { return undefined; }
  }
  function remove(key) {
    try {
      if (adapter.removeStorageSync) adapter.removeStorageSync(key);
      else adapter.setStorageSync(key, '');
    } catch (e) { /* ignore */ }
  }
  function info() {
    try { return adapter.getStorageInfoSync ? adapter.getStorageInfoSync() : null; } catch (e) { return null; }
  }

  function readMeta() {
    var m = get(metaKey);
    if (!m || typeof m !== 'object' || m.version !== VERSION || typeof m.count !== 'number' ||
      !Array.isArray(m.chunkKeys)) return null;
    for (var i = 0; i < m.chunkKeys.length; i++) {
      if (typeof m.chunkKeys[i] !== 'string' || m.chunkKeys[i].indexOf(chunkPrefix) !== 0) return null;
    }
    return m;
  }

  /** 删除不被 keep 列表引用的分片（崩溃残留） */
  function removeOrphans(keep) {
    var inf = info();
    if (!inf || !Array.isArray(inf.keys)) return;
    inf.keys.forEach(function (k) {
      if (typeof k === 'string' && k.indexOf(chunkPrefix) === 0 && keep.indexOf(k) === -1) remove(k);
    });
  }

  function clear() {
    var m = get(metaKey);
    remove(metaKey);
    if (m && Array.isArray(m.chunkKeys)) m.chunkKeys.forEach(function (k) { if (typeof k === 'string') remove(k); });
    removeOrphans([]);
  }

  /** 可用于本缓存的字节数（总上限 - 其他 key 已占用） */
  function availableBytes(ownBytes) {
    var inf = info();
    var limit = DEFAULT_LIMIT_BYTES;
    var others = 0;
    if (inf && typeof inf.limitSize === 'number' && inf.limitSize > 0) limit = inf.limitSize * 1024;
    if (inf && typeof inf.currentSize === 'number') others = Math.max(0, inf.currentSize * 1024 - ownBytes);
    return limit - others - SAFETY_BYTES;
  }

  function writeChunks(gen, built) {
    var keys = [];
    for (var i = 0; i < built.chunks.length; i++) {
      var key = chunkPrefix + gen + '_' + i;
      try {
        adapter.setStorageSync(key, built.chunks[i].items);
      } catch (e) {
        keys.forEach(remove);
        remove(key);
        throw e;
      }
      keys.push(key);
    }
    return keys;
  }

  /**
   * 保存全部联系人
   * @returns {{ok:boolean, count:number, chunks:number, bytes:number, photosDropped:number, reason?:string, error?:string}}
   */
  function save(contacts) {
    contacts = contacts || [];
    var old = readMeta();
    var ownBytes = old && typeof old.bytes === 'number' ? old.bytes : 0;
    var avail = availableBytes(ownBytes);
    var built;
    try {
      built = buildChunks(contacts, maxChunkBytes, false);
      // 超出总上限：去掉 PHOTO 再试一次
      if (built.bytes > avail) built = buildChunks(contacts, maxChunkBytes, true);
    } catch (e) {
      return { ok: false, count: contacts.length, chunks: 0, bytes: 0, photosDropped: 0, reason: e.code || 'ERROR', error: e.message };
    }
    if (built.bytes > avail) {
      return { ok: false, count: contacts.length, chunks: built.chunks.length, bytes: built.bytes, photosDropped: built.photosDropped, reason: 'QUOTA' };
    }

    var gen = (old && typeof old.gen === 'number' ? old.gen : 0) + 1;
    var safeSwap = built.bytes + ownBytes <= avail;
    var oldKeys = old ? old.chunkKeys.slice() : [];

    function attempt(b) {
      if (!safeSwap) {
        // 新旧两份放不下：先让缓存“干净地变空”，再写新数据
        remove(metaKey);
        oldKeys.forEach(remove);
        oldKeys = [];
      }
      var keys = writeChunks(gen, b);
      var meta = {
        version: VERSION,
        count: contacts.length,
        gen: gen,
        chunkKeys: keys,
        bytes: b.bytes,
        savedAt: Date.now(),
        photosDropped: b.photosDropped
      };
      try {
        adapter.setStorageSync(metaKey, meta);
      } catch (e) {
        keys.forEach(remove);
        throw e;
      }
      oldKeys.forEach(function (k) { if (keys.indexOf(k) === -1) remove(k); });
      removeOrphans(keys);
      if (legacyKey) remove(legacyKey);
      return { ok: true, count: contacts.length, chunks: keys.length, bytes: b.bytes, photosDropped: b.photosDropped };
    }

    try {
      return attempt(built);
    } catch (e) {
      // 例如 getStorageInfoSync 不可用、实际写入时才发现超限：去掉 PHOTO 重试一次
      if (!built.photosDropped && contacts.some(function (c) { return c && c.photo; })) {
        try {
          safeSwap = false;
          return attempt(buildChunks(contacts, maxChunkBytes, true));
        } catch (e2) { e = e2; }
      }
      return { ok: false, count: contacts.length, chunks: 0, bytes: built.bytes, photosDropped: 0, reason: 'WRITE_FAILED', error: (e && (e.errMsg || e.message)) || String(e) };
    }
  }

  /**
   * 读取联系人
   * @returns {{contacts:Array, source:'chunks'|'legacy'|'empty'|'corrupt', photosDropped?:number, migrated?:object}}
   */
  function load() {
    var m = readMeta();
    if (m) {
      var out = [];
      var ok = true;
      for (var i = 0; i < m.chunkKeys.length && ok; i++) {
        var arr = get(m.chunkKeys[i]);
        if (!Array.isArray(arr)) { ok = false; break; }
        for (var j = 0; j < arr.length; j++) {
          if (!arr[j] || typeof arr[j] !== 'object') { ok = false; break; }
          out.push(expand(arr[j]));
        }
      }
      if (ok && out.length === m.count) {
        if (legacyKey && get(legacyKey)) remove(legacyKey); // 迁移后崩溃留下的旧 key
        return { contacts: out, source: 'chunks', photosDropped: m.photosDropped || 0 };
      }
      clear();
      return { contacts: [], source: 'corrupt' };
    }
    if (get(metaKey)) { clear(); return { contacts: [], source: 'corrupt' }; } // meta 存在但格式不对
    if (legacyKey) {
      var legacy = get(legacyKey);
      if (Array.isArray(legacy) && legacy.length) {
        var contacts = legacy.filter(function (c) { return c && typeof c === 'object'; }).map(normalizeLegacy);
        var res = save(contacts); // 成功时会删除 legacyKey；失败则保留旧 key，下次再试
        return { contacts: contacts, source: 'legacy', migrated: res };
      }
      if (legacy !== undefined && legacy !== '' && legacy !== null && !Array.isArray(legacy)) remove(legacyKey);
    }
    return { contacts: [], source: 'empty' };
  }

  return { save: save, load: load, clear: clear, metaKey: metaKey, chunkPrefix: chunkPrefix };
}

module.exports = {
  createContactStore: createContactStore,
  utf8ByteLength: utf8ByteLength,
  compact: compact,
  expand: expand,
  buildChunks: buildChunks,
  DEFAULT_CHUNK_BYTES: DEFAULT_CHUNK_BYTES
};
