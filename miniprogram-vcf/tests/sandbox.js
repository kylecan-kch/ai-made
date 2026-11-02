/**
 * 模拟小程序 JS 运行环境：在一个“干净”的 vm 上下文里加载 utils/ 下的模块，
 * 上下文中没有 Buffer / TextEncoder / TextDecoder / window / document / Blob / FileReader，
 * 只提供小程序同样具备的 CommonJS require / module / exports。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UTILS = path.join(__dirname, '..', 'utils');

function createMiniProgramLikeRequire() {
  const context = vm.createContext({ console });
  const cache = {};
  function load(file) {
    const full = path.resolve(UTILS, file);
    if (cache[full]) return cache[full].exports;
    const module = { exports: {} };
    cache[full] = module;
    const code = fs.readFileSync(full, 'utf8');
    const wrapper = vm.runInContext('(function (require, module, exports) {\n' + code + '\n})', context, { filename: full });
    wrapper(function (dep) { return load(path.join(path.dirname(path.relative(UTILS, full)), dep)); }, module, module.exports);
    return module.exports;
  }
  return { require: load, context };
}

module.exports = { createMiniProgramLikeRequire };
