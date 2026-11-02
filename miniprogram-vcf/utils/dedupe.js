/**
 * 查重与合并
 * 移植自 kylecan-kch/ai-made 的 src/components/DeduplicateModal.tsx 中的逻辑：
 *  - 号码（去掉非数字后 ≥7 位）一致，或姓名（忽略大小写）一致，视为重复
 *  - 合并：电话/邮箱去重合并、分组标签合并、备注用“；”拼接，其余字段取第一个非空值
 * 改进：原版若一个联系人同时落在“号码组”和“姓名组”里会被合并两次产生重复；
 *       这里按连通分量（并查集）合并，保证每个联系人只出现一次，且保持原有顺序。
 *       号码比较前先归一化（与网页版 src/utils/dedupe.ts 的 phoneKey 一致）：只保留数字，
 *       11 位大陆手机号前的 +86 / 0086 / 86 去掉，所以 "+86 138-0013-8000" 与 "13800138000" 视为同一号码；
 *       合并时也按归一化号码去重，保留第一次出现的原始写法。
 */

/** 号码比较键：只保留数字；去掉 11 位大陆手机号前的 +86 / 0086 / 86 */
function phoneKey(raw) {
  var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  var m = /^(?:0086|86)(1\d{10})$/.exec(digits);
  return m ? m[1] : digits;
}

function findDuplicateGroups(contacts) {
  var phoneMap = {};
  var nameMap = {};
  var order = [];
  contacts.forEach(function (c) {
    (c.phones || []).forEach(function (p) {
      var clean = phoneKey(p.number);
      if (clean.length >= 7) {
        var key = 'p:' + clean;
        if (!phoneMap[key]) { phoneMap[key] = []; order.push(key); }
        if (phoneMap[key].indexOf(c) === -1) phoneMap[key].push(c);
      }
    });
    var cleanName = String(c.fullName || '').trim().toLowerCase();
    if (cleanName && cleanName !== '未命名' && cleanName !== '未命名联系人') {
      var nk = 'n:' + cleanName;
      if (!nameMap[nk]) { nameMap[nk] = []; order.push(nk); }
      if (nameMap[nk].indexOf(c) === -1) nameMap[nk].push(c);
    }
  });

  var groups = [];
  var seen = {};
  function add(map, reason) {
    order.forEach(function (key) {
      var items = map[key];
      if (!items || items.length < 2) return;
      var sig = items.map(function (u) { return u.id; }).sort().join(',');
      if (seen[sig]) return;
      seen[sig] = true;
      groups.push({
        reason: reason,
        identifier: reason === 'phone' ? '电话一致 (' + key.slice(2) + ')' : '姓名一致 (' + items[0].fullName + ')',
        items: items
      });
    });
  }
  add(phoneMap, 'phone');
  add(nameMap, 'name');
  return groups;
}

function mergeContactList(list) {
  var base = JSON.parse(JSON.stringify(list[0]));
  var allPhones = [];
  var seenPhones = {};
  var allEmails = [];
  var cats = [];
  var notes = [];
  list.forEach(function (c) {
    (c.phones || []).forEach(function (p) {
      var key = phoneKey(p.number) || String(p.number || '');
      if (seenPhones[key]) return;
      seenPhones[key] = true;
      allPhones.push(p);
    });
    (c.emails || []).forEach(function (e) {
      if (!allEmails.some(function (x) { return x.address.toLowerCase() === e.address.toLowerCase(); })) allEmails.push(e);
    });
    (c.categories || []).forEach(function (cat) { if (cats.indexOf(cat) === -1) cats.push(cat); });
    if (c.notes && notes.indexOf(c.notes) === -1) notes.push(c.notes);
    if (!base.organization && c.organization) base.organization = c.organization;
    if (!base.department && c.department) base.department = c.department;
    if (!base.jobTitle && c.jobTitle) base.jobTitle = c.jobTitle;
    if ((!base.address || !base.address.street) && c.address && c.address.street) base.address = c.address;
    if (!base.birthday && c.birthday) base.birthday = c.birthday;
    if (!base.website && c.website) base.website = c.website;
  });
  base.phones = allPhones;
  base.emails = allEmails;
  base.categories = cats;
  base.notes = notes.join('；');
  return base;
}

/**
 * 合并全部重复项
 * @returns {{contacts: Array, groupCount: number, removed: number}}
 */
function mergeDuplicates(contacts) {
  var groups = findDuplicateGroups(contacts);
  var idx = {};
  contacts.forEach(function (c, i) { idx[c.id] = i; });
  var parent = contacts.map(function (_, i) { return i; });
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); }
  groups.forEach(function (g) {
    for (var i = 1; i < g.items.length; i++) union(idx[g.items[0].id], idx[g.items[i].id]);
  });
  var buckets = {};
  var rootsInOrder = [];
  contacts.forEach(function (c, i) {
    var r = find(i);
    if (!buckets[r]) { buckets[r] = []; rootsInOrder.push(r); }
    buckets[r].push(c);
  });
  var result = rootsInOrder.map(function (r) {
    return buckets[r].length > 1 ? mergeContactList(buckets[r]) : buckets[r][0];
  });
  return { contacts: result, groupCount: groups.length, removed: contacts.length - result.length };
}

module.exports = {
  phoneKey: phoneKey,
  findDuplicateGroups: findDuplicateGroups,
  mergeContactList: mergeContactList,
  mergeDuplicates: mergeDuplicates
};
