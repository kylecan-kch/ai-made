/**
 * 静态校验：JSON 合法、页面四件套齐全、WXML 标签闭合、事件处理函数存在、未使用浏览器专有 API
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'tests' || f === 'node_modules' || f.startsWith('.')) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(ROOT);

test('所有 JSON 合法', () => {
  for (const f of files.filter(f => f.endsWith('.json'))) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(f, 'utf8')), f);
  }
});

test('app.json 中每个页面都有 js/json/wxml/wxss', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  assert.ok(app.pages.length > 0);
  for (const page of app.pages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(fs.existsSync(path.join(ROOT, page + '.' + ext)), page + '.' + ext);
    }
  }
  assert.ok(fs.existsSync(path.join(ROOT, app.sitemapLocation)));
  const proj = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
  assert.equal(proj.appid, 'touristappid');
  assert.equal(proj.compileType, 'miniprogram');
});

function checkWxml(src, file) {
  // 去掉注释
  src = src.replace(/<!--[\s\S]*?-->/g, '');
  const VOID = new Set(['input', 'image', 'icon', 'progress', 'slider', 'switch', 'checkbox', 'radio', 'import', 'include', 'wxs']);
  const stack = [];
  const re = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = m[1];
    const full = m[0];
    const attrs = m[2];
    // {{ }} 括号平衡
    const opens = (attrs.match(/\{\{/g) || []).length;
    const closes = (attrs.match(/\}\}/g) || []).length;
    assert.equal(opens, closes, `${file}: 属性中 {{ }} 不平衡: ${full.slice(0, 80)}`);
    if (full.startsWith('</')) {
      const top = stack.pop();
      assert.equal(top, tag, `${file}: 期望关闭 <${top}>，实际 </${tag}>`);
    } else if (full.endsWith('/>') || VOID.has(tag)) {
      // 自闭合
    } else {
      stack.push(tag);
    }
  }
  assert.deepEqual(stack, [], `${file}: 存在未闭合标签`);
  const textOpens = (src.match(/\{\{/g) || []).length;
  const textCloses = (src.match(/\}\}/g) || []).length;
  assert.equal(textOpens, textCloses, `${file}: {{ }} 不平衡`);
}

test('WXML 标签闭合且 {{}} 平衡，绑定的事件处理函数都存在', () => {
  for (const f of files.filter(f => f.endsWith('.wxml'))) {
    const src = fs.readFileSync(f, 'utf8');
    checkWxml(src, f);
    const js = fs.readFileSync(f.replace(/\.wxml$/, '.js'), 'utf8');
    const handlers = [...src.matchAll(/(?:bind|catch)(?::)?\w+="([^"{]+)"/g)].map(x => x[1]);
    assert.ok(handlers.length > 0);
    for (const h of new Set(handlers)) {
      assert.ok(new RegExp('\\b' + h + '\\s*:\\s*function').test(js), `${f}: 缺少处理函数 ${h}`);
    }
  }
});

test('业务代码未使用浏览器/Node 专有 API', () => {
  const banned = /\b(document\.|window\.|localStorage|sessionStorage|FileReader|new Blob|URL\.createObjectURL|TextDecoder|TextEncoder|navigator\.|Buffer\.|process\.)/;
  const vendor = ['xlsx.mini.min.js', 'cp936.js'];
  for (const f of files.filter(f => f.endsWith('.js') && !vendor.includes(path.basename(f)))) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!banned.test(code), `${f}: ${code.match(banned)}`);
  }
});

test('主包体积 < 2MB', () => {
  const proj = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
  const ignored = proj.packOptions.ignore.map(i => i.value);
  const total = files
    .filter(f => !ignored.some(v => path.relative(ROOT, f).startsWith(v)))
    .reduce((s, f) => s + fs.statSync(f).size, 0);
  assert.ok(total < 2 * 1024 * 1024, 'size=' + total);
  console.log('  主包源码体积约 ' + (total / 1024).toFixed(0) + ' KB');
});
