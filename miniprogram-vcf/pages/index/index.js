var vcard = require('../../utils/vcard.js');
var table = require('../../utils/table.js');
var dedupe = require('../../utils/dedupe.js');
var encoding = require('../../utils/encoding.js');
var storage = require('../../utils/storage.js');

var app = getApp();
var PAGE_SIZE = 100;
var MAX_FILE_SIZE = 20 * 1024 * 1024;

var PHONE_TYPE_TEXT = { CELL: '手机', WORK: '工作', HOME: '住宅', MAIN: '总机', OTHER: '其他' };
var EMAIL_TYPE_TEXT = { WORK: '工作', HOME: '个人', OTHER: '其他' };

function toast(title, icon) {
  title = String(title);
  // success 图标下最多显示 7 个汉字，长文案改用无图标样式
  if (icon === 'success' && title.length > 7) icon = 'none';
  wx.showToast({ title: title.slice(0, 40), icon: icon || 'none', duration: 2200 });
}

function errMsg(err) {
  if (!err) return '未知错误';
  return err.errMsg || err.message || String(err);
}

function getExt(name) {
  var m = /\.([a-zA-Z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

var XLS_TIP = '暂不支持旧版 Excel（.xls）文件。请用 Excel / WPS 打开后“另存为” .xlsx 格式（或 CSV），再导入另存后的文件。';

/** 旧版 .xls 是 OLE 复合文档，文件头为 D0 CF 11 E0 A1 B1 1A E1（用于识别改了后缀的 .xls） */
function isLegacyXls(buffer) {
  try {
    var b = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength || 0));
    return b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  } catch (e) {
    return false;
  }
}

function dateStamp() {
  var d = new Date();
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

Page({
  data: {
    total: 0,
    filteredTotal: 0,
    list: [],
    tableRows: [],
    columns: table.FORMAT1_COLUMNS,
    hasMore: false,
    keyword: '',
    viewMode: 'list',
    expandedId: '',
    selectedCount: 0,
    allSelected: false,

    importModes: ['替换现有联系人', '追加到现有联系人'],
    importModeIndex: 0,
    showPaste: false,
    pasteText: '',
    lastImport: '',

    formats: ['VCF 通讯录 (.vcf)', 'CSV 表格 (.csv)', 'Excel 表格 (.xlsx)'],
    formatIndex: 0,
    versions: ['vCard 3.0（推荐，通用）', 'vCard 2.1（老安卓/Outlook）', 'vCard 4.0'],
    versionValues: ['3.0', '2.1', '4.0'],
    versionIndex: 0,
    encodings: ['UTF-8', 'Quoted-Printable（仅 2.1）'],
    encodingIndex: 0,
    scopes: ['全部联系人', '仅已勾选'],
    scopeIndex: 0,

    exported: null
  },

  /* ---------------- 生命周期 ---------------- */

  onLoad: function () {
    this.contacts = [];
    this.selected = {};
    this.shown = PAGE_SIZE;
    // 分片缓存（单 key ≤1MB、总量 ≤10MB），首次会把旧版单 key 缓存迁移过来
    this.store = storage.createContactStore(wx, { prefix: 'vcf_contacts_v2', legacyKey: app.globalData.storageKey });
    try {
      var loaded = this.store.load();
      this.contacts = loaded.contacts || [];
      if (loaded.source === 'corrupt') toast('本地缓存已损坏，已清理，请重新导入');
    } catch (e) { /* ignore */ }
    this.refresh();
  },

  onShareAppMessage: function () {
    return { title: 'VCF 通讯录 ↔ Excel/CSV 表格互转', path: '/pages/index/index' };
  },

  /* ---------------- 数据与视图 ---------------- */

  persist: function () {
    var res;
    try {
      res = this.store.save(this.contacts);
    } catch (e) {
      res = { ok: false };
    }
    if (!res.ok) {
      toast('联系人过多，超出小程序本地缓存上限（10MB），本次可正常使用，但下次打开需重新导入');
    } else if (res.photosDropped) {
      toast('本地缓存空间不足，已省略 ' + res.photosDropped + ' 张头像照片（其余信息已保存）');
    }
    return res;
  },

  getFiltered: function () {
    var kw = (this.data.keyword || '').trim().toLowerCase();
    if (!kw) return this.contacts;
    var kwDigits = kw.replace(/[\s-]/g, '');
    return this.contacts.filter(function (c) {
      var hay = [c.fullName, c.organization, c.department, c.jobTitle, c.notes, (c.categories || []).join(' ')]
        .concat((c.emails || []).map(function (e) { return e.address; }))
        .join(' ').toLowerCase();
      if (hay.indexOf(kw) !== -1) return true;
      return /^\+?\d+$/.test(kwDigits) && (c.phones || []).some(function (p) {
        return String(p.number).replace(/[\s-]/g, '').indexOf(kwDigits) !== -1;
      });
    });
  },

  toViewItem: function (c) {
    var phones = (c.phones || []).map(function (p) {
      return { number: p.number, type: PHONE_TYPE_TEXT[p.type] || '其他' };
    });
    var emails = (c.emails || []).map(function (e) {
      return { address: e.address, type: EMAIL_TYPE_TEXT[e.type] || '其他' };
    });
    var addr = c.address || {};
    return {
      id: c.id,
      name: c.fullName || '未命名联系人',
      avatar: (c.fullName || '?').charAt(0).toUpperCase(),
      subtitle: [c.organization, c.department, c.jobTitle].filter(Boolean).join(' · '),
      firstPhone: phones.length ? phones[0].number : '',
      phoneCount: phones.length,
      phones: phones,
      emails: emails,
      address: [addr.country, addr.region, addr.city, addr.street].filter(Boolean).join(' ') + (addr.postalCode ? '（' + addr.postalCode + '）' : ''),
      birthday: c.birthday || '',
      website: c.website || '',
      notes: c.notes || '',
      categories: c.categories || [],
      checked: !!this.selected[c.id]
    };
  },

  refresh: function (extra) {
    var self = this;
    var filtered = this.getFiltered();
    var visible = filtered.slice(0, this.shown);
    var selectedCount = Object.keys(this.selected).length;
    var data = {
      total: this.contacts.length,
      filteredTotal: filtered.length,
      hasMore: filtered.length > visible.length,
      selectedCount: selectedCount,
      allSelected: filtered.length > 0 && filtered.every(function (c) { return self.selected[c.id]; })
    };
    if (this.data.viewMode === 'table') {
      var cols = table.FORMAT1_COLUMNS;
      data.tableRows = table.contactsToFormat1Rows(visible).map(function (r, i) {
        return {
          id: visible[i].id,
          checked: !!self.selected[visible[i].id],
          cells: cols.map(function (col) { return r[col] || ''; })
        };
      });
      data.list = [];
    } else {
      data.list = visible.map(function (c) { return self.toViewItem(c); });
      data.tableRows = [];
    }
    if (extra) Object.keys(extra).forEach(function (k) { data[k] = extra[k]; });
    this.setData(data);
  },

  findContact: function (id) {
    for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) return this.contacts[i];
    return null;
  },

  /* ---------------- 导入 ---------------- */

  onImportModeChange: function (e) {
    this.setData({ importModeIndex: Number(e.detail.value) });
  },

  chooseFile: function () {
    var self = this;
    if (!wx.chooseMessageFile) {
      toast('当前微信版本不支持从聊天选择文件');
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['vcf', 'vcard', 'csv', 'xlsx', 'txt'],
      success: function (res) {
        var f = res.tempFiles && res.tempFiles[0];
        if (!f) return;
        if (f.size > MAX_FILE_SIZE) {
          toast('文件过大（超过 20MB）');
          return;
        }
        self.readAndImport(f.path, f.name || f.path);
      },
      fail: function (err) {
        if (/cancel/i.test(errMsg(err))) return;
        toast('选择文件失败：' + errMsg(err));
      }
    });
  },

  readAndImport: function (filePath, fileName) {
    var self = this;
    var ext = getExt(fileName) || getExt(filePath);
    wx.showLoading({ title: '正在解析…', mask: true });
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      success: function (res) {
        try {
          var buffer = res.data; // 不传 encoding 时为 ArrayBuffer
          var parsed;
          var encName = '';
          if (ext === 'xls' || isLegacyXls(buffer)) {
            // 旧版 Excel 97-2003 (.xls) 不支持（内置 SheetJS 精简版不含该解析器）
            wx.hideLoading();
            wx.showModal({ title: '暂不支持 .xls', content: XLS_TIP, showCancel: false });
            return;
          }
          if (ext === 'xlsx') {
            parsed = table.parseSpreadsheetBuffer(buffer);
          } else {
            var decoded = encoding.decodeAuto(buffer);
            encName = decoded.encoding;
            var text = decoded.text;
            if (ext === 'csv') {
              parsed = table.parseCsvText(text);
            } else if (/BEGIN:VCARD/i.test(text)) {
              parsed = vcard.parseVCard(text);
            } else {
              // .txt 等未知后缀：不是 vCard 时按 CSV 尝试
              parsed = table.parseCsvText(text);
            }
          }
          wx.hideLoading();
          if (!parsed || parsed.length === 0) {
            wx.showModal({
              title: '未识别到联系人',
              content: ext === 'vcf' || ext === 'vcard'
                ? '未能从该文件中解析出有效的 vCard 联系人，请确认是标准 .vcf 文件。'
                : '表格中没有识别到联系人。请确保第一行是表头（如：姓名、手机、邮箱、公司），可点击“下载标准模板”参考。',
              showCancel: false
            });
            return;
          }
          self.applyImported(parsed, fileName + (encName && encName !== 'UTF-8' ? '，编码 ' + encName : ''));
        } catch (e) {
          wx.hideLoading();
          wx.showModal({ title: '解析失败', content: errMsg(e), showCancel: false });
        }
      },
      fail: function (err) {
        wx.hideLoading();
        toast('读取文件失败：' + errMsg(err));
      }
    });
  },

  applyImported: function (list, source) {
    // PHOTO（base64 头像）在小程序中既不展示也不导出，保留只会撑爆本地缓存（单 key 1MB / 总 10MB）和内存
    list.forEach(function (c) { if (c && c.photo) delete c.photo; });
    var append = this.data.importModeIndex === 1;
    if (append) {
      this.contacts = this.contacts.concat(list);
    } else {
      this.contacts = list;
      this.selected = {};
    }
    this.shown = PAGE_SIZE;
    this.persist();
    var msg = (append ? '已追加 ' : '已导入 ') + list.length + ' 位联系人';
    this.refresh({ lastImport: msg + '（' + source + '）', exported: null, expandedId: '' });
    toast(msg, 'success');
  },

  togglePaste: function () {
    this.setData({ showPaste: !this.data.showPaste });
  },

  onPasteInput: function (e) {
    this.setData({ pasteText: e.detail.value });
  },

  pasteFromClipboard: function () {
    var self = this;
    wx.getClipboardData({
      success: function (res) { self.setData({ pasteText: res.data || '' }); },
      fail: function (err) { toast('读取剪贴板失败：' + errMsg(err)); }
    });
  },

  parsePasted: function () {
    var text = this.data.pasteText || '';
    if (!text.trim()) { toast('请先粘贴 VCF 或 CSV 文本'); return; }
    var parsed = /BEGIN:VCARD/i.test(text) ? vcard.parseVCard(text) : table.parseCsvText(text);
    if (!parsed.length) { toast('未识别到联系人'); return; }
    this.applyImported(parsed, '粘贴文本');
    this.setData({ showPaste: false, pasteText: '' });
  },

  loadDemo: function () {
    this.contacts = table.getDemoContacts().map(function (c) {
      var copy = JSON.parse(JSON.stringify(c));
      copy.id = vcard.generateId();
      return copy;
    });
    this.selected = {};
    this.shown = PAGE_SIZE;
    this.persist();
    this.refresh({ lastImport: '已载入 5 位演示联系人', exported: null });
  },

  clearAll: function () {
    var self = this;
    if (!this.contacts.length) return;
    wx.showModal({
      title: '清空联系人',
      content: '确定清空全部 ' + this.contacts.length + ' 位联系人吗？此操作不可撤销。',
      confirmColor: '#dc2626',
      success: function (res) {
        if (!res.confirm) return;
        self.contacts = [];
        self.selected = {};
        self.persist();
        self.refresh({ lastImport: '', exported: null, expandedId: '' });
      }
    });
  },

  /* ---------------- 列表交互 ---------------- */

  onSearchInput: function (e) {
    var self = this;
    this.setData({ keyword: e.detail.value });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(function () {
      self.shown = PAGE_SIZE;
      self.refresh();
    }, 250);
  },

  clearSearch: function () {
    this.shown = PAGE_SIZE;
    this.setData({ keyword: '' });
    this.refresh();
  },

  switchView: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === this.data.viewMode) return;
    this.setData({ viewMode: mode });
    this.refresh();
  },

  loadMore: function () {
    this.shown += PAGE_SIZE;
    this.refresh();
  },

  onReachBottom: function () {
    if (this.data.hasMore) this.loadMore();
  },

  toggleExpand: function (e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },

  toggleSelect: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (this.selected[id]) delete this.selected[id];
    else this.selected[id] = true;
    // 只更新被点击那一项的 checked，避免每次勾选都把整页列表重新 setData（加载多页后可能超过 1MB 限制）
    var key = this.data.viewMode === 'table' ? 'tableRows' : 'list';
    var arr = this.data[key] || [];
    var idx = -1;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { idx = i; break; }
    if (idx === -1) { this.refresh(); return; }
    var filtered = this.getFiltered();
    var data = {
      selectedCount: Object.keys(this.selected).length,
      allSelected: filtered.length > 0 && filtered.every(function (c) { return self.selected[c.id]; })
    };
    data[key + '[' + idx + '].checked'] = !!this.selected[id];
    this.setData(data);
  },

  toggleSelectAll: function () {
    var self = this;
    var filtered = this.getFiltered();
    if (this.data.allSelected) {
      filtered.forEach(function (c) { delete self.selected[c.id]; });
    } else {
      filtered.forEach(function (c) { self.selected[c.id] = true; });
    }
    this.refresh();
  },

  deleteContact: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var c = this.findContact(id);
    if (!c) return;
    wx.showModal({
      title: '删除联系人',
      content: '确定删除「' + c.fullName + '」吗？',
      confirmColor: '#dc2626',
      success: function (res) {
        if (!res.confirm) return;
        self.contacts = self.contacts.filter(function (x) { return x.id !== id; });
        delete self.selected[id];
        self.persist();
        self.refresh({ expandedId: '' });
      }
    });
  },

  copyContact: function (e) {
    var c = this.findContact(e.currentTarget.dataset.id);
    if (!c) return;
    wx.setClipboardData({
      data: vcard.generateVCard([c], { version: '3.0', encoding: 'utf-8' }),
      success: function () { toast('已复制该联系人的 vCard', 'success'); }
    });
  },

  callPhone: function (e) {
    var num = e.currentTarget.dataset.number;
    if (!num) return;
    wx.makePhoneCall({ phoneNumber: String(num), fail: function () {} });
  },

  addToPhone: function (e) {
    var c = this.findContact(e.currentTarget.dataset.id);
    if (!c) return;
    if (!wx.addPhoneContact) { toast('当前环境不支持添加到通讯录'); return; }
    var byType = function (t) {
      for (var i = 0; i < c.phones.length; i++) if (c.phones[i].type === t) return c.phones[i].number;
      return '';
    };
    var phones = c.phones || [];
    var mobile = byType('CELL') || (phones[0] ? phones[0].number : '');
    var addr = c.address || {};
    var opts = {
      firstName: c.givenName || c.fullName || '联系人',
      lastName: c.givenName ? (c.familyName || '') : '',
      mobilePhoneNumber: mobile,
      workPhoneNumber: byType('WORK') || (phones[1] && phones[1].number !== mobile ? phones[1].number : ''),
      homePhoneNumber: byType('HOME'),
      hostNumber: byType('MAIN'),
      email: c.emails && c.emails[0] ? c.emails[0].address : '',
      organization: c.organization || '',
      title: [c.department, c.jobTitle].filter(Boolean).join(' '),
      url: c.website || '',
      remark: c.notes || '',
      workAddressCountry: addr.country || '',
      workAddressState: addr.region || '',
      workAddressCity: addr.city || '',
      workAddressStreet: addr.street || addr.fullAddress || '',
      workAddressPostalCode: addr.postalCode || ''
    };
    Object.keys(opts).forEach(function (k) { if (!opts[k]) delete opts[k]; });
    if (!opts.firstName) opts.firstName = '联系人';
    opts.fail = function (err) {
      if (/cancel/i.test(errMsg(err))) return;
      toast('添加失败：' + errMsg(err));
    };
    wx.addPhoneContact(opts);
  },

  runDedupe: function () {
    var self = this;
    if (this.contacts.length < 2) { toast('联系人不足两位，无需查重'); return; }
    var groups = dedupe.findDuplicateGroups(this.contacts);
    if (!groups.length) { toast('没有发现重复的联系人', 'success'); return; }
    var preview = groups.slice(0, 5).map(function (g) {
      return '· ' + g.identifier + '：' + g.items.map(function (c) { return c.fullName; }).join('、');
    }).join('\n');
    wx.showModal({
      title: '发现 ' + groups.length + ' 组重复',
      content: preview + (groups.length > 5 ? '\n……' : '') + '\n\n合并后会保留全部号码、邮箱、标签和备注。是否合并？',
      confirmText: '全部合并',
      success: function (res) {
        if (!res.confirm) return;
        var result = dedupe.mergeDuplicates(self.contacts);
        self.contacts = result.contacts;
        self.selected = {};
        self.persist();
        self.refresh({ exported: null, expandedId: '' });
        toast('合并完成，减少 ' + result.removed + ' 条，现有 ' + result.contacts.length + ' 位');
      }
    });
  },

  /* ---------------- 导出 ---------------- */

  onFormatChange: function (e) { this.setData({ formatIndex: Number(e.detail.value), exported: null }); },
  onVersionChange: function (e) {
    var idx = Number(e.detail.value);
    var data = { versionIndex: idx, exported: null };
    if (this.data.versionValues[idx] !== '2.1') data.encodingIndex = 0;
    this.setData(data);
  },
  onEncodingChange: function (e) {
    var idx = Number(e.detail.value);
    if (idx === 1 && this.data.versionValues[this.data.versionIndex] !== '2.1') {
      toast('Quoted-Printable 仅适用于 vCard 2.1，已自动切换为 2.1');
      this.setData({ encodingIndex: 1, versionIndex: 1, exported: null });
      return;
    }
    this.setData({ encodingIndex: idx, exported: null });
  },
  onScopeChange: function (e) { this.setData({ scopeIndex: Number(e.detail.value), exported: null }); },

  getExportTargets: function () {
    var self = this;
    if (this.data.scopeIndex === 1) {
      return this.contacts.filter(function (c) { return self.selected[c.id]; });
    }
    return this.contacts;
  },

  writeExportFile: function (contacts, formatIndex, baseName) {
    var fs = wx.getFileSystemManager();
    var ext;
    var content;
    var enc;
    if (formatIndex === 0) {
      ext = 'vcf';
      content = vcard.generateVCard(contacts, {
        version: this.data.versionValues[this.data.versionIndex],
        encoding: this.data.encodingIndex === 1 ? 'quoted-printable' : 'utf-8'
      });
      enc = 'utf8';
    } else if (formatIndex === 1) {
      ext = 'csv';
      content = table.contactsToCsv(contacts, true); // 带 BOM，Excel 打开中文不乱码
      enc = 'utf8';
    } else {
      ext = 'xlsx';
      content = table.contactsToXlsxBuffer(contacts);
    }
    var fileName = baseName + '.' + ext;
    var filePath = wx.env.USER_DATA_PATH + '/' + fileName;
    if (enc) fs.writeFileSync(filePath, content, enc);
    else fs.writeFileSync(filePath, content);
    return {
      filePath: filePath,
      fileName: fileName,
      ext: ext,
      count: contacts.length,
      text: typeof content === 'string' ? content : ''
    };
  },

  cleanOldExports: function () {
    try {
      var fs = wx.getFileSystemManager();
      var files = fs.readdirSync(wx.env.USER_DATA_PATH);
      files.forEach(function (f) {
        if (/^联系人_.*\.(vcf|csv|xlsx)$/.test(f)) {
          try { fs.unlinkSync(wx.env.USER_DATA_PATH + '/' + f); } catch (e) { /* ignore */ }
        }
      });
    } catch (e) { /* ignore */ }
  },

  doExport: function () {
    var targets = this.getExportTargets();
    if (!targets.length) {
      toast(this.data.scopeIndex === 1 ? '请先勾选要导出的联系人' : '没有可导出的联系人');
      return;
    }
    wx.showLoading({ title: '正在生成…', mask: true });
    try {
      this.cleanOldExports();
      var info = this.writeExportFile(targets, this.data.formatIndex, '联系人_' + targets.length + '人_' + dateStamp());
      this.exportedText = info.text;
      wx.hideLoading();
      this.setData({
        exported: {
          filePath: info.filePath,
          fileName: info.fileName,
          ext: info.ext,
          count: info.count,
          canOpen: info.ext === 'xlsx',
          canCopy: !!info.text
        }
      });
      toast('已生成 ' + info.fileName, 'success');
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '生成失败', content: errMsg(e), showCancel: false });
    }
  },

  downloadTemplate: function () {
    try {
      var info = this.writeExportFile(table.getDemoContacts(), 2, '联系人信息标准表格_格式1');
      this.exportedText = '';
      this.setData({
        exported: { filePath: info.filePath, fileName: info.fileName, ext: 'xlsx', count: info.count, canOpen: true, canCopy: false }
      });
      toast('模板已生成，可发送或打开', 'success');
    } catch (e) {
      toast('生成模板失败：' + errMsg(e));
    }
  },

  shareExported: function () {
    var ex = this.data.exported;
    if (!ex) return;
    if (!wx.shareFileMessage) {
      toast('当前微信版本不支持发送文件，请升级微信');
      return;
    }
    wx.shareFileMessage({
      filePath: ex.filePath,
      fileName: ex.fileName,
      fail: function (err) {
        if (/cancel/i.test(errMsg(err))) return;
        toast('发送失败：' + errMsg(err) + '（开发者工具中请用真机调试）');
      }
    });
  },

  openExported: function () {
    var ex = this.data.exported;
    if (!ex) return;
    wx.openDocument({
      filePath: ex.filePath,
      fileType: ex.ext,
      showMenu: true,
      fail: function (err) { toast('无法打开：' + errMsg(err)); }
    });
  },

  copyExported: function () {
    var text = this.exportedText || '';
    if (!text) { toast('该格式不支持复制，请使用“发送给好友”'); return; }
    if (text.length > 500000) { toast('内容过大，请使用“发送给好友”'); return; }
    wx.setClipboardData({
      data: text.replace(/^\uFEFF/, ''),
      success: function () { toast('已复制到剪贴板', 'success'); }
    });
  }
});
