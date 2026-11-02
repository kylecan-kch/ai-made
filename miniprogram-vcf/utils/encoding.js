/**
 * 纯 JS 编码工具（小程序环境没有可靠的 TextEncoder / TextDecoder / Buffer）
 * - UTF-8 编解码
 * - GBK(CP936) 解码（码表按需加载）
 * - 自动识别文件编码：UTF-8 BOM / UTF-16 BOM / UTF-8 / GBK
 */

function utf8Encode(str) {
  var out = [];
  str = String(str == null ? '' : str);
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    // 代理对
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      var low = str.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

/**
 * UTF-8 解码。fatal=true 时遇到非法序列返回 null（用于编码探测）
 */
function utf8Decode(bytes, fatal) {
  var parts = [];
  var chunk = [];
  var i = 0;
  var len = bytes.length;
  function flush() {
    if (chunk.length) {
      parts.push(String.fromCharCode.apply(null, chunk));
      chunk = [];
    }
  }
  while (i < len) {
    var b = bytes[i];
    var code = -1;
    var need = 0;
    if (b < 0x80) {
      code = b;
    } else if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      code = b & 0x1f;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      code = b & 0x0f;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      code = b & 0x07;
    } else {
      if (fatal) return null;
      chunk.push(0xfffd);
      i++;
      continue;
    }
    if (need) {
      if (i + need >= len) {
        // 截断
        if (fatal) return null;
        chunk.push(0xfffd);
        break;
      }
      var ok = true;
      for (var k = 1; k <= need; k++) {
        var nb = bytes[i + k];
        if (nb === undefined || (nb & 0xc0) !== 0x80) {
          ok = false;
          break;
        }
        code = (code << 6) | (nb & 0x3f);
      }
      if (!ok || (need === 2 && code < 0x800) || (need === 3 && (code < 0x10000 || code > 0x10ffff))) {
        if (fatal) return null;
        chunk.push(0xfffd);
        i++;
        continue;
      }
      i += need + 1;
    } else {
      i++;
    }
    if (code >= 0x10000) {
      code -= 0x10000;
      chunk.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      chunk.push(code);
    }
    if (chunk.length >= 8192) flush();
  }
  flush();
  return parts.join('');
}

var _gbkTable = null;
function getGbkTable() {
  if (!_gbkTable) {
    _gbkTable = require('./cp936.js');
  }
  return _gbkTable;
}

function gbkDecode(bytes) {
  var dec = getGbkTable().dec;
  var parts = [];
  var chunk = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0x80) {
      chunk += String.fromCharCode(b);
    } else if (b >= 0x81 && b <= 0xfe && i + 1 < bytes.length) {
      var ch = dec[(b << 8) | bytes[i + 1]];
      if (ch) {
        chunk += ch;
        i++;
      } else {
        chunk += '\ufffd';
      }
    } else if (b === 0x80) {
      chunk += '\u20ac';
    } else {
      chunk += '\ufffd';
    }
    if (chunk.length > 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

function utf16Decode(bytes, littleEndian, start) {
  var out = [];
  for (var i = start || 0; i + 1 < bytes.length; i += 2) {
    out.push(littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
  }
  var s = '';
  for (var j = 0; j < out.length; j += 8192) {
    s += String.fromCharCode.apply(null, out.slice(j, j + 8192));
  }
  return s;
}

function isGbkCharset(charset) {
  var c = String(charset || '').toLowerCase();
  return c.indexOf('gb') !== -1 || c === 'cp936';
}

/**
 * 按指定 charset 解码字节（与原项目 decodeQuotedPrintable 中的逻辑一致：含 gb 的用 GBK，否则 UTF-8）
 */
function decodeBytes(bytes, charset) {
  if (isGbkCharset(charset)) return gbkDecode(bytes);
  return utf8Decode(bytes, false);
}

/**
 * 自动识别编码并解码整个文件
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{text: string, encoding: string}}
 */
function decodeAuto(buffer) {
  var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: utf8Decode(bytes.subarray(3), false), encoding: 'UTF-8 (BOM)' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: utf16Decode(bytes, true, 2), encoding: 'UTF-16LE' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: utf16Decode(bytes, false, 2), encoding: 'UTF-16BE' };
  }
  var strict = utf8Decode(bytes, true);
  if (strict !== null) return { text: strict, encoding: 'UTF-8' };
  return { text: gbkDecode(bytes), encoding: 'GBK' };
}

module.exports = {
  utf8Encode: utf8Encode,
  utf8Decode: utf8Decode,
  gbkDecode: gbkDecode,
  decodeBytes: decodeBytes,
  decodeAuto: decodeAuto
};
