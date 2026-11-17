(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SiteSearch = root.SiteSearch || {};
    root.SiteSearch.tokenize = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STOP = new Set([
    '的', '了', '吗', '呢', '吧', '啊', '哦', '和', '与', '跟', '在', '是', '有', '就', '也',
    '我', '你', '他', '她', '这', '那', '个', '些', '都', '要', '能', '会',
    '怎么', '如何', '什么', '哪些', '哪个', '多少', '为什', '么样',
    'a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'vs', 'or', 'and'
  ]);

  function normalize(input) {
    return String(input == null ? '' : input)
      .replace(/[\uFF01-\uFF5E]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .replace(/\u3000/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(input) {
    var text = normalize(input);
    var terms = [];
    var seen = Object.create(null);

    function add(t) {
      if (!t || seen[t]) return;
      seen[t] = true;
      terms.push(t);
    }

    var latin = text.match(/[a-z0-9][a-z0-9+.#_-]*/g) || [];
    for (var i = 0; i < latin.length; i++) {
      var w = latin[i];
      if (w.length >= 2 && !STOP.has(w)) add(w);
    }

    var runs = text.match(/[\u4e00-\u9fa5]+/g) || [];
    for (var j = 0; j < runs.length; j++) {
      var run = runs[j];
      if (run.length === 1) {
        if (!STOP.has(run)) add(run);
        continue;
      }
      for (var k = 0; k < run.length - 1; k++) {
        var bg = run.slice(k, k + 2);
        if (!STOP.has(bg)) add(bg);
      }
      if (run.length <= 6 && !STOP.has(run)) add(run);
    }

    return { text: text, terms: terms, latin: latin, cjk: runs };
  }

  function highlight(text, terms) {
    var src = String(text == null ? '' : text);
    if (!terms || !terms.length) return [{ text: src, hit: false }];
    var sorted = terms.slice().sort(function (a, b) { return b.length - a.length; });
    var out = [];
    var rest = src;
    while (rest.length) {
      var best = -1;
      var bestLen = 0;
      for (var i = 0; i < sorted.length; i++) {
        var t = sorted[i];
        if (!t) continue;
        var idx = rest.toLowerCase().indexOf(t);
        if (idx === -1) continue;
        if (best === -1 || idx < best || (idx === best && t.length > bestLen)) {
          best = idx;
          bestLen = t.length;
        }
      }
      if (best === -1) {
        out.push({ text: rest, hit: false });
        break;
      }
      if (best > 0) out.push({ text: rest.slice(0, best), hit: false });
      out.push({ text: rest.slice(best, best + bestLen), hit: true });
      rest = rest.slice(best + bestLen);
    }
    return out;
  }

  return { normalize: normalize, tokenize: tokenize, highlight: highlight, STOP: STOP };
});
