(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./tokenize.js'));
  } else {
    root.SiteSearch = root.SiteSearch || {};
    root.SiteSearch.createEngine = factory(root.SiteSearch.tokenize);
  }
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  var TYPE_META = {
    aiTool: { label: 'AI 工具', limit: 6, baseWeight: 1.0 },
    site: { label: '站点', limit: 6, baseWeight: 0.92 },
    util: { label: '实用工具', limit: 4, baseWeight: 0.86 },
    qa: { label: '问答', limit: 4, baseWeight: 0.8 },
    post: { label: '文章', limit: 4, baseWeight: 0.72 }
  };

  var FIELD_WEIGHT = {
    titleExact: 100,
    titleContains: 55,
    titleTerm: 18,
    tagTerm: 12,
    descTerm: 7
  };

  var VS_SEPARATORS = [' vs ', ' versus ', 'vs', '对比', '和', '与', '跟'];

  function lower(s) {
    return String(s == null ? '' : s).toLowerCase();
  }

  function flatten(data) {
    var docs = [];

    (data.sites || []).forEach(function (x) {
      docs.push({
        type: 'site', id: x.id, title: x.name, desc: x.desc,
        tags: x.tags || [], hot: x.hot || 0, flags: x.flags || {},
        extra: {}
      });
    });

    (data.aiTools || []).forEach(function (x) {
      docs.push({
        type: 'aiTool', id: x.id, title: x.name, desc: x.desc,
        tags: x.tags || [], hot: x.hot || 0, flags: x.flags || {},
        extra: { freeQuota: x.freeQuota || '', price: x.price || '' }
      });
    });

    (data.utils || []).forEach(function (x) {
      docs.push({
        type: 'util', id: x.id, title: x.name, desc: x.desc,
        tags: x.tags || [], hot: x.hot || 0, flags: x.flags || {},
        extra: {}
      });
    });

    (data.qa || []).forEach(function (x) {
      docs.push({
        type: 'qa', id: x.id, title: x.q, desc: x.a,
        tags: x.tags || [], hot: x.hot || 0, flags: x.flags || {},
        extra: {}
      });
    });

    (data.posts || []).forEach(function (x) {
      docs.push({
        type: 'post', id: x.id, title: x.title, desc: x.body,
        tags: x.tags || [], hot: x.hot || 0, flags: x.flags || {},
        extra: {}
      });
    });

    docs.forEach(function (d) {
      d.titleN = lower(d.title);
      d.descN = lower(d.desc);
      d.tagsN = (d.tags || []).map(lower);
    });

    return docs;
  }

  function scoreDoc(doc, qn, terms) {
    var s = 0;

    if (doc.titleN === qn) {
      s += FIELD_WEIGHT.titleExact;
    } else if (doc.titleN.indexOf(qn) !== -1) {
      s += FIELD_WEIGHT.titleContains;
    }

    var hit = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      var touched = false;
      if (doc.titleN.indexOf(t) !== -1) {
        s += FIELD_WEIGHT.titleTerm;
        touched = true;
      }
      for (var j = 0; j < doc.tagsN.length; j++) {
        if (doc.tagsN[j].indexOf(t) !== -1) {
          s += FIELD_WEIGHT.tagTerm;
          touched = true;
          break;
        }
      }
      if (doc.descN.indexOf(t) !== -1) {
        s += FIELD_WEIGHT.descTerm;
        touched = true;
      }
      if (touched) hit++;
    }

    if (hit === 0) return 0;

    var coverage = hit / terms.length;
    s *= 0.55 + 0.45 * coverage;
    s += Math.log10((doc.hot || 0) + 1) * 2;
    return s;
  }

  function passFlags(doc, flags) {
    if (!flags || !flags.length) return true;
    for (var i = 0; i < flags.length; i++) {
      if (!doc.flags[flags[i]]) return false;
    }
    return true;
  }

  function createEngine(data) {
    var docs = flatten(data);
    var categories = data.categories || [];
    var vsPairs = data.vsPairs || [];

    var entityIndex = Object.create(null);
    var siteToAiTool = Object.create(null);

    (data.aiTools || []).forEach(function (x) {
      if (x.siteId) siteToAiTool[x.siteId] = x.id;
    });

    (data.sites || []).forEach(function (x) {
      var key = T.normalize(x.name);
      if (!entityIndex[key]) entityIndex[key] = { name: x.name, siteId: x.id };
      else entityIndex[key].siteId = x.id;
    });

    (data.aiTools || []).forEach(function (x) {
      var key = T.normalize(x.name);
      if (!entityIndex[key]) entityIndex[key] = { name: x.name, aiToolId: x.id };
      else entityIndex[key].aiToolId = x.id;
    });

    var entityKeys = Object.keys(entityIndex);

    function resolveEntity(segment) {
      var seg = T.normalize(segment);
      if (!seg) return null;

      if (entityIndex[seg]) return entityIndex[seg];

      var partial = [];
      for (var i = 0; i < entityKeys.length; i++) {
        if (entityKeys[i].indexOf(seg) !== -1) partial.push(entityKeys[i]);
      }
      if (partial.length === 1) return entityIndex[partial[0]];
      return null;
    }

    function pairById(id) {
      for (var i = 0; i < vsPairs.length; i++) {
        var p = vsPairs[i];
        if (p.left === id || p.right === id) return p;
      }
      return null;
    }

    function findPair(leftId, rightId) {
      for (var i = 0; i < vsPairs.length; i++) {
        var p = vsPairs[i];
        if ((p.left === leftId && p.right === rightId) || (p.left === rightId && p.right === leftId)) {
          return p;
        }
      }
      return null;
    }

    function detectVs(query) {
      var q = T.normalize(query);
      if (!q) return null;

      for (var i = 0; i < VS_SEPARATORS.length; i++) {
        var sep = VS_SEPARATORS[i];
        var idx = q.indexOf(sep);
        if (idx <= 0) continue;

        if (sep === 'vs') {
          var prev = q.charAt(idx - 1);
          if (/[a-z0-9]/.test(prev)) continue;
        }

        var leftRaw = q.slice(0, idx).trim();
        var rightRaw = q.slice(idx + sep.length).trim();
        if (leftRaw.length < 2 || rightRaw.length < 2) continue;
        if (leftRaw.length > 24 || rightRaw.length > 24) continue;

        var left = resolveEntity(leftRaw);
        var right = resolveEntity(rightRaw);
        if (!left || !right) continue;

        var leftAi = left.aiToolId || siteToAiTool[left.siteId];
        var rightAi = right.aiToolId || siteToAiTool[right.siteId];
        if (!leftAi || !rightAi || leftAi === rightAi) continue;

        var pair = findPair(leftAi, rightAi);
        if (!pair) continue;

        return {
          left: { name: left.name, aiToolId: leftAi },
          right: { name: right.name, aiToolId: rightAi },
          title: pair.title,
          desc: pair.desc,
          slug: left.name + '-vs-' + right.name
        };
      }
      return null;
    }

    function suggest(prefix, limit) {
      var q = T.normalize(prefix);
      var max = limit || 8;

      if (!q) {
        return docs
          .slice()
          .sort(function (a, b) { return (b.hot || 0) - (a.hot || 0); })
          .slice(0, max)
          .map(function (d) {
            return { type: d.type, id: d.id, title: d.title, badge: TYPE_META[d.type].label, hot: d.hot };
          });
      }

      var scored = [];
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        var s = 0;
        if (d.titleN.indexOf(q) === 0) s = 100;
        else if (d.titleN.indexOf(q) !== -1) s = 60;
        else {
          for (var j = 0; j < d.tagsN.length; j++) {
            if (d.tagsN[j].indexOf(q) !== -1) { s = 30; break; }
          }
        }
        if (!s) continue;
        scored.push({ d: d, s: s + Math.log10((d.hot || 0) + 1) });
      }

      scored.sort(function (a, b) { return b.s - a.s; });

      return scored.slice(0, max).map(function (x) {
        return {
          type: x.d.type, id: x.d.id, title: x.d.title,
          badge: TYPE_META[x.d.type].label, hot: x.d.hot
        };
      });
    }

    function fallbackFor(terms, query) {
      var catHits = [];

      for (var i = 0; i < categories.length; i++) {
        var c = categories[i];
        var score = 0;
        for (var j = 0; j < terms.length; j++) {
          for (var k = 0; k < c.words.length; k++) {
            if (c.words[k].indexOf(terms[j]) !== -1 || terms[j].indexOf(c.words[k]) !== -1) {
              score++;
            }
          }
        }
        if (score > 0) catHits.push({ id: c.id, name: c.name, score: score });
      }

      catHits.sort(function (a, b) { return b.score - a.score; });

      var hot = docs
        .slice()
        .sort(function (a, b) { return (b.hot || 0) - (a.hot || 0); })
        .slice(0, 5)
        .map(function (d) {
          return { type: d.type, id: d.id, title: d.title, badge: TYPE_META[d.type].label };
        });

      return {
        categories: catHits.slice(0, 3),
        hot: hot,
        reason: query ? 'no-match' : 'empty-query'
      };
    }

    function search(query, opts) {
      var started = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();

      opts = opts || {};
      var flags = opts.flags || [];
      var tok = T.tokenize(query);
      var qn = tok.text;
      var terms = tok.terms;

      var vs = detectVs(query);

      if (!terms.length) {
        return {
          query: query, terms: [], took: 0, total: 0,
          groups: [], vs: vs, fallback: fallbackFor([], query)
        };
      }

      var buckets = {};
      var total = 0;

      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        if (!passFlags(d, flags)) continue;
        var s = scoreDoc(d, qn, terms);
        if (s <= 0) continue;
        s *= (TYPE_META[d.type].baseWeight || 1);

        if (vs && d.type === 'aiTool' && (d.id === vs.left.aiToolId || d.id === vs.right.aiToolId)) {
          s += 40;
        }
        if (!buckets[d.type]) buckets[d.type] = [];
        buckets[d.type].push({ doc: d, score: s });
        total++;
      }

      var groups = [];
      var order = ['aiTool', 'site', 'util', 'qa', 'post'];

      for (var g = 0; g < order.length; g++) {
        var type = order[g];
        var list = buckets[type];
        if (!list || !list.length) continue;

        list.sort(function (a, b) { return b.score - a.score; });

        groups.push({
          type: type,
          label: TYPE_META[type].label,
          total: list.length,
          items: list.slice(0, TYPE_META[type].limit).map(function (x) {
            return {
              type: x.doc.type,
              id: x.doc.id,
              title: x.doc.title,
              desc: x.doc.desc,
              tags: x.doc.tags,
              score: Math.round(x.score * 10) / 10,
              extra: x.doc.extra,
              hl: {
                title: T.highlight(x.doc.title, terms),
                desc: T.highlight(x.doc.desc, terms)
              }
            };
          })
        });
      }

      var ended = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();

      return {
        query: query,
        terms: terms,
        took: Math.max(1, Math.round(ended - started)),
        total: total,
        groups: groups,
        vs: vs,
        fallback: groups.length ? null : fallbackFor(terms, query)
      };
    }

    return {
      search: search,
      suggest: suggest,
      detectVs: detectVs,
      stats: function () {
        var out = { total: docs.length };
        docs.forEach(function (d) { out[d.type] = (out[d.type] || 0) + 1; });
        out.categories = categories.length;
        out.vsPairs = vsPairs.length;
        return out;
      }
    };
  }

  return { createEngine: createEngine, TYPE_META: TYPE_META, FIELD_WEIGHT: FIELD_WEIGHT };
});
