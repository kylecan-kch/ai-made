/**
 * 页面逻辑冒烟测试：用模拟的 wx / Page / getApp 执行 pages/index/index.js，
 * 走通 导入(vcf/csv/xlsx) -> 预览 -> 查重 -> 导出(vcf/csv/xlsx) -> 再导入 的完整流程。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-vcf-'));

function createEnv() {
  const calls = { toast: [], modal: [], share: [], open: [], clipboard: [], addContact: [] };
  const storage = {};
  let modalAnswer = true;
  const fsm = {
    readFile({ filePath, success, fail }) {
      try {
        const b = fs.readFileSync(filePath);
        success({ data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
      } catch (e) { fail({ errMsg: e.message }); }
    },
    writeFileSync(p, data, enc) {
      if (typeof data === 'string') fs.writeFileSync(p, data, enc === 'utf8' ? 'utf8' : enc);
      else fs.writeFileSync(p, new Uint8Array(data));
    },
    readdirSync(p) { return fs.readdirSync(p); },
    unlinkSync(p) { fs.unlinkSync(p); }
  };
  const wx = {
    env: { USER_DATA_PATH: TMP },
    getFileSystemManager: () => fsm,
    getStorageSync: k => storage[k],
    setStorageSync: (k, v) => { storage[k] = JSON.parse(JSON.stringify(v)); },
    showToast: o => calls.toast.push(o.title),
    showLoading() {}, hideLoading() {},
    showModal: o => { calls.modal.push(o); o.success && o.success({ confirm: modalAnswer }); },
    chooseMessageFile: o => o.success({ tempFiles: [env.nextFile] }),
    shareFileMessage: o => calls.share.push(o),
    openDocument: o => calls.open.push(o),
    setClipboardData: o => { calls.clipboard.push(o.data); o.success && o.success(); },
    getClipboardData: o => o.success({ data: '' }),
    addPhoneContact: o => calls.addContact.push(o),
    makePhoneCall() {}
  };
  let pageDef;
  const sandbox = {
    wx, console, setTimeout, clearTimeout,
    getApp: () => ({ globalData: { storageKey: 'k' } }),
    Page: def => { pageDef = def; }
  };
  const context = vm.createContext(sandbox);
  const cache = {};
  function load(rel) {
    const full = path.resolve(ROOT, rel);
    if (cache[full]) return cache[full].exports;
    const module = { exports: {} };
    cache[full] = module;
    const fn = vm.runInContext('(function(require,module,exports){' + fs.readFileSync(full, 'utf8') + '\n})', context, { filename: full });
    fn(dep => load(path.relative(ROOT, path.resolve(path.dirname(full), dep))), module, module.exports);
    return module.exports;
  }
  load('pages/index/index.js');
  // 构造页面实例（模拟 setData）
  const page = Object.assign({}, pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  // 模拟 setData，支持 'list[3].checked' 这类数据路径
  page.setData = function (d) {
    const copy = JSON.parse(JSON.stringify(d));
    for (const k of Object.keys(copy)) {
      const segs = k.replace(/\[(\d+)\]/g, '.$1').split('.');
      let o = this.data;
      for (let i = 0; i < segs.length - 1; i++) o = o[segs[i]];
      o[segs[segs.length - 1]] = copy[k];
    }
  };
  const env = { page, calls, storage, nextFile: null, setModal: v => { modalAnswer = v; } };
  page.onLoad();
  return env;
}

const ev = (dataset, value) => ({ currentTarget: { dataset: dataset || {} }, detail: { value } });

test('页面完整流程', () => {
  const env = createEnv();
  const { page, calls } = env;
  assert.equal(page.data.total, 0);

  // 1. 导入 vcf（GBK 编码的 vCard 2.1 文件）
  const gbkName = Buffer.from([0xd5, 0xc5, 0xc8, 0xfd]); // 张三
  const f1 = path.join(TMP, 'in1.vcf');
  fs.writeFileSync(f1, Buffer.concat([Buffer.from('BEGIN:VCARD\r\nVERSION:2.1\r\nFN:'), gbkName, Buffer.from('\r\nTEL;CELL:13800000000\r\nEND:VCARD\r\n')]));
  env.nextFile = { path: f1, name: '旧手机导出.vcf', size: 100 };
  page.chooseFile();
  assert.equal(page.data.total, 1);
  assert.equal(page.data.list[0].name, '张三');
  assert.match(page.data.lastImport, /GBK/);

  // 2. 追加导入 csv
  page.onImportModeChange(ev({}, '1'));
  const f2 = path.join(TMP, 'in2.csv');
  fs.writeFileSync(f2, '\uFEFF姓名,手机,邮箱,公司\r\n张三,13800000000,zs@x.com,甲公司\r\n王五,13900000000,,乙公司\r\n');
  env.nextFile = { path: f2, name: 'in2.csv', size: 100 };
  page.chooseFile();
  assert.equal(page.data.total, 3);

  // 3. 查重合并（张三重复）
  page.runDedupe();
  assert.equal(page.data.total, 2);
  assert.equal(page.data.list[0].emails[0].address, 'zs@x.com');

  // 4. 搜索、表格视图、勾选
  page.onSearchInput(ev({}, '王五'));
  page.clearSearch();
  page.switchView(ev({ mode: 'table' }));
  assert.equal(page.data.tableRows.length, 2);
  assert.equal(page.data.tableRows[0].cells[0], '张三');
  page.toggleSelect(ev({ id: page.data.tableRows[1].id }));
  assert.equal(page.data.selectedCount, 1);
  page.switchView(ev({ mode: 'list' }));
  page.toggleExpand(ev({ id: page.data.list[0].id }));
  assert.equal(page.data.expandedId, page.data.list[0].id);

  // 5. 单个联系人操作
  page.addToPhone(ev({ id: page.data.list[0].id }));
  assert.equal(calls.addContact[0].firstName, '三');
  assert.equal(calls.addContact[0].lastName, '张');
  assert.equal(calls.addContact[0].mobilePhoneNumber, '13800000000');
  page.copyContact(ev({ id: page.data.list[0].id }));
  assert.match(calls.clipboard[0], /FN:张三/);

  // 6. 导出三种格式
  const outputs = [];
  for (const fi of [0, 1, 2]) {
    page.onFormatChange(ev({}, String(fi)));
    page.doExport();
    const ex = page.data.exported;
    assert.ok(ex, 'exported ' + fi);
    assert.ok(fs.existsSync(ex.filePath));
    outputs.push(ex);
    page.shareExported();
    if (ex.canOpen) page.openExported();
    if (ex.canCopy) page.copyExported();
  }
  assert.equal(outputs[0].ext, 'vcf');
  assert.equal(outputs[1].ext, 'csv');
  assert.equal(outputs[2].ext, 'xlsx');
  assert.equal(calls.share.length, 3);
  assert.equal(calls.open.length, 1);
  // 每次导出会清理上一次的导出文件，避免占满本地空间；只有最新一个仍然存在
  assert.ok(!fs.existsSync(outputs[1].filePath));
  assert.ok(fs.existsSync(outputs[2].filePath));

  // 7. vCard 2.1 + QP 导出 仅已勾选
  page.onFormatChange(ev({}, '0'));
  page.onEncodingChange(ev({}, '1')); // 自动切换为 2.1
  assert.equal(page.data.versionIndex, 1);
  page.onScopeChange(ev({}, '1'));
  page.doExport();
  const qp = fs.readFileSync(page.data.exported.filePath, 'utf8');
  assert.match(qp, /VERSION:2\.1/);
  assert.match(qp, /ENCODING=QUOTED-PRINTABLE/);
  assert.equal((qp.match(/BEGIN:VCARD/g) || []).length, 1);

  // 8. 导出的 xlsx / csv 再导入（替换模式）
  page.onScopeChange(ev({}, '0'));
  page.onFormatChange(ev({}, '2'));
  page.doExport();
  page.onImportModeChange(ev({}, '0'));
  env.nextFile = { path: page.data.exported.filePath, name: page.data.exported.fileName, size: 1000 };
  page.chooseFile();
  assert.equal(page.data.total, 2);
  assert.equal(page.data.list[0].name, '张三');

  page.onFormatChange(ev({}, '1'));
  page.doExport();
  const csvOut = fs.readFileSync(page.data.exported.filePath);
  assert.deepEqual([...csvOut.slice(0, 3)], [0xef, 0xbb, 0xbf], 'CSV 带 UTF-8 BOM');
  env.nextFile = { path: page.data.exported.filePath, name: page.data.exported.fileName, size: 1000 };
  page.chooseFile();
  assert.equal(page.data.total, 2);

  // 9. 模板、示例、粘贴、删除、清空
  page.downloadTemplate();
  assert.equal(page.data.exported.ext, 'xlsx');
  page.loadDemo();
  assert.equal(page.data.total, 5);
  page.togglePaste();
  page.onPasteInput(ev({}, 'BEGIN:VCARD\nFN:粘贴人\nTEL:1\nEND:VCARD'));
  page.onImportModeChange(ev({}, '1'));
  page.parsePasted();
  assert.equal(page.data.total, 6);
  page.deleteContact(ev({ id: page.data.list[5].id }));
  assert.equal(page.data.total, 5);
  page.clearAll();
  assert.equal(page.data.total, 0);

  // 10. 无法识别的文件给出提示而非崩溃
  const bad = path.join(TMP, 'bad.vcf');
  fs.writeFileSync(bad, 'hello world');
  env.nextFile = { path: bad, name: 'bad.vcf', size: 11 };
  const before = calls.modal.length;
  page.chooseFile();
  assert.equal(calls.modal.length, before + 1);
  assert.match(calls.modal[calls.modal.length - 1].title, /未识别/);
  const badX = path.join(TMP, 'bad.xlsx');
  fs.writeFileSync(badX, 'not a zip');
  env.nextFile = { path: badX, name: 'bad.xlsx', size: 9 };
  page.chooseFile();
  assert.ok(/解析失败|未识别/.test(calls.modal[calls.modal.length - 1].title));
});

test('勾选只增量 setData 被点的那一项；导入时丢弃 PHOTO 以免撑爆本地缓存', () => {
  const env = createEnv();
  const { page, storage } = env;
  const parts = [];
  for (let i = 0; i < 250; i++) {
    parts.push('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:人' + i + '\r\nTEL:1390000' + String(i).padStart(4, '0') +
      '\r\nPHOTO;ENCODING=b;TYPE=JPEG:' + 'A'.repeat(4000) + '\r\nEND:VCARD');
  }
  const f = path.join(TMP, 'photos.vcf');
  fs.writeFileSync(f, parts.join('\r\n'));
  env.nextFile = { path: f, name: 'photos.vcf', size: 100 };
  page.chooseFile();
  assert.equal(page.data.total, 250);
  assert.ok(storage.k.every(c => !c.photo), '缓存中不应包含 photo');
  assert.ok(JSON.stringify(storage.k).length < 100 * 1024);

  page.loadMore();
  assert.equal(page.data.list.length, 200);
  const payloads = [];
  const orig = page.setData;
  page.setData = function (d) { payloads.push(d); return orig.call(this, d); };
  page.toggleSelect(ev({ id: page.data.list[150].id }));
  assert.equal(page.data.list[150].checked, true);
  assert.equal(page.data.selectedCount, 1);
  assert.equal(page.data.allSelected, false);
  assert.ok(!('list' in payloads[0]), '不应重发整页列表');
  page.toggleSelect(ev({ id: page.data.list[150].id }));
  assert.equal(page.data.list[150].checked, false);
  assert.equal(page.data.selectedCount, 0);
  page.setData = orig;

  // 表格视图同样适用
  page.switchView(ev({ mode: 'table' }));
  page.toggleSelect(ev({ id: page.data.tableRows[3].id }));
  assert.equal(page.data.tableRows[3].checked, true);
  page.toggleSelectAll();
  assert.equal(page.data.allSelected, true);
  assert.equal(page.data.selectedCount, 250);
});
