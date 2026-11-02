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

/**
 * GB18030 四字节区（BMP 部分）的区间表：[pointer, codePoint, pointer, codePoint, ...]
 * 与 WHATWG Encoding 标准 index-gb18030-ranges 等价（由 ICU 的 gb18030 解码器生成）。
 */
var GB18030_RANGES = [0,128,36,165,38,169,45,178,50,184,81,216,89,226,95,235,96,238,100,244,103,248,104,251,105,253,109,258,126,276,133,284,148,300,172,325,175,329,179,334,208,364,306,463,307,465,308,467,309,469,310,471,311,473,312,475,313,477,341,506,428,594,443,610,544,712,545,716,558,730,741,930,742,938,749,962,750,970,805,1026,819,1104,820,1106,7457,59335,7458,7744,7922,8209,7924,8215,7925,8218,7927,8222,7934,8231,7943,8241,7944,8244,7945,8246,7950,8252,8062,8365,8148,8452,8149,8454,8152,8458,8164,8471,8174,8482,8236,8556,8240,8570,8262,8596,8264,8602,8374,8713,8380,8720,8381,8722,8384,8726,8388,8731,8390,8737,8392,8740,8393,8742,8394,8748,8396,8751,8401,8760,8406,8766,8416,8777,8419,8781,8424,8787,8437,8802,8439,8808,8445,8816,8482,8854,8485,8858,8496,8870,8521,8896,8603,8979,8936,9322,8946,9372,9046,9548,9050,9588,9063,9616,9066,9622,9076,9634,9092,9652,9100,9662,9108,9672,9111,9676,9113,9680,9131,9702,9162,9735,9164,9738,9218,9793,9219,9795,11329,11906,11331,11909,11334,11913,11336,11917,11346,11928,11361,11944,11363,11947,11366,11951,11370,11956,11372,11960,11375,11964,11389,11979,11682,12284,11686,12292,11687,12312,11692,12319,11694,12330,11714,12351,11716,12436,11723,12447,11725,12535,11730,12543,11736,12586,11982,12842,11989,12850,12102,12964,12336,13200,12348,13215,12350,13218,12384,13253,12393,13263,12395,13267,12397,13270,12510,13384,12553,13428,12851,13727,12962,13839,12973,13851,13738,14617,13823,14703,13919,14801,13933,14816,14080,14964,14298,15183,14585,15471,14698,15585,15583,16471,15847,16736,16318,17208,16434,17325,16438,17330,16481,17374,16729,17623,17102,17997,17122,18018,17315,18212,17320,18218,17402,18301,17418,18318,17859,18760,17909,18811,17911,18814,17915,18820,17916,18823,17936,18844,17939,18848,17961,18872,18664,19576,18703,19620,18814,19738,18962,19887,19043,40870,33469,59244,33470,59336,33471,59367,33484,59413,33485,59417,33490,59423,33497,59431,33501,59437,33505,59443,33513,59452,33520,59460,33536,59478,33550,59493,37845,63789,37921,63866,37948,63894,38029,63976,38038,63986,38064,64016,38065,64018,38066,64021,38069,64025,38075,64034,38076,64037,38078,64042,39108,65074,39109,65093,39113,65107,39114,65112,39115,65127,39116,65132,39265,65375,39394,65510];

function gb18030FourByte(b1, b2, b3, b4) {
  var pointer = (((b1 - 0x81) * 10 + (b2 - 0x30)) * 126 + (b3 - 0x81)) * 10 + (b4 - 0x30);
  var cp;
  if (pointer >= 189000 && pointer <= 1237575) {
    cp = 0x10000 + pointer - 189000;
  } else if (pointer > 39419) {
    return '\ufffd';
  } else {
    var lo = 0;
    var hi = GB18030_RANGES.length / 2 - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (GB18030_RANGES[mid * 2] <= pointer) lo = mid; else hi = mid - 1;
    }
    cp = GB18030_RANGES[lo * 2 + 1] + pointer - GB18030_RANGES[lo * 2];
  }
  if (cp >= 0x10000) {
    cp -= 0x10000;
    return String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
  }
  return String.fromCharCode(cp);
}

/** GBK / GB18030 解码（双字节用 CP936 码表，四字节按 GB18030 算法，可解出 emoji 与生僻字） */
function gbkDecode(bytes) {
  var dec = getGbkTable().dec;
  var parts = [];
  var chunk = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0x80) {
      chunk += String.fromCharCode(b);
    } else if (b >= 0x81 && b <= 0xfe && i + 3 < bytes.length &&
      bytes[i + 1] >= 0x30 && bytes[i + 1] <= 0x39 &&
      bytes[i + 2] >= 0x81 && bytes[i + 2] <= 0xfe &&
      bytes[i + 3] >= 0x30 && bytes[i + 3] <= 0x39) {
      chunk += gb18030FourByte(b, bytes[i + 1], bytes[i + 2], bytes[i + 3]);
      i += 3;
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
