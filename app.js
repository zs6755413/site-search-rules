(function () {
  'use strict';

  var input = document.getElementById('q');
  var out = document.getElementById('out');
  var meta = document.getElementById('meta');
  var statLine = document.getElementById('stat-line');
  var chipsEl = document.getElementById('chips');

  var engine = null;
  var activeFlags = [];
  var timer = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderHl(parts) {
    if (!Array.isArray(parts)) return esc(parts);
    return parts.map(function (p) {
      return p.hit ? '<mark>' + esc(p.text) + '</mark>' : esc(p.text);
    }).join('');
  }

  function renderVs(vs) {
    if (!vs) return '';
    return '' +
      '<div class="vs-card">' +
        '<div class="vs-label">双工具直达</div>' +
        '<div class="vs-title">' + esc(vs.title) + '</div>' +
        '<div class="vs-desc">' + esc(vs.desc) + ' <span style="color:#2f5fd0">查看对比</span></div>' +
      '</div>';
  }

  function renderEmpty(res) {
    var cats = (res.fallback && res.fallback.categories) || [];
    var hot = (res.fallback && res.fallback.hot) || [];
    var isBlank = res.fallback && res.fallback.reason === 'empty-query';

    var html = '<div class="empty">';
    html += '<div class="empty-title">' + (isBlank ? '输入关键词开始搜索' : '没有找到匹配的内容') + '</div>';

    if (!isBlank && cats.length) {
      html += '<div class="empty-note">换个说法，或者从这些方向找：</div>';
      html += '<div class="empty-cats">' + cats.map(function (c) {
        return '<span class="empty-cat">' + esc(c.name) + '</span>';
      }).join('') + '</div>';
    } else if (!isBlank) {
      html += '<div class="empty-note">试试工具名、用途词，或者「豆包 vs deepseek」这样的对比写法。</div>';
    }

    if (hot.length) {
      html += '<div class="empty-note" style="margin-top:18px">热度较高的条目：</div>';
      html += '<div class="empty-cats">' + hot.map(function (h) {
        return '<span class="empty-cat">' + esc(h.title) + ' · ' + esc(h.badge) + '</span>';
      }).join('') + '</div>';
    }

    html += '</div>';
    return html;
  }

  function render(res) {
    if (!res.groups.length) {
      out.innerHTML = renderVs(res.vs) + renderEmpty(res);
      return;
    }

    var html = renderVs(res.vs);

    res.groups.forEach(function (g) {
      html += '<div class="group">';
      html += '<div class="group-head"><span>' + esc(g.label) + '</span>' +
              '<span class="count">命中 ' + g.total + (g.total > g.items.length ? '，显示 ' + g.items.length : '') + '</span></div>';

      g.items.forEach(function (it) {
        html += '<div class="item">';
        html += '<span class="item-score">' + it.score + '</span>';
        html += '<div class="item-title">' + renderHl(it.hl.title) + '</div>';
        if (it.desc) html += '<div class="item-desc">' + renderHl(it.hl.desc) + '</div>';
        if (it.extra && (it.extra.price || it.extra.freeQuota)) {
          var bits = [];
          if (it.extra.price) bits.push('价格：' + it.extra.price);
          if (it.extra.freeQuota) bits.push('额度：' + it.extra.freeQuota);
          html += '<div class="item-extra">' + esc(bits.join('　·　')) + '</div>';
        }
        html += '</div>';
      });

      html += '</div>';
    });

    out.innerHTML = html;
  }

  function doSearch() {
    if (!engine) return;
    var q = input.value;
    var res = engine.search(q, { flags: activeFlags });

    try {
      var u = new URL(location.href);
      if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
      if (activeFlags.length) u.searchParams.set('flags', activeFlags.join(',')); else u.searchParams.delete('flags');
      history.replaceState(null, '', u.toString());
    } catch (_) {}

    render(res);

    if (res.total) {
      statLine.textContent = '这次查询用了 ' + res.took + 'ms，命中 ' + res.total + ' 条，切出 ' + res.groups.length + ' 个分组。';
    } else {
      statLine.textContent = '这次查询没有命中，走的是降级分支。';
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(doSearch, 80);
  }

  chipsEl.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var flag = chip.dataset.flag;
    var idx = activeFlags.indexOf(flag);
    if (idx === -1) {
      activeFlags.push(flag);
      chip.classList.add('on');
    } else {
      activeFlags.splice(idx, 1);
      chip.classList.remove('on');
    }
    doSearch();
  });

  input.addEventListener('input', schedule);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      doSearch();
    }
  });

  fetch('data/demo.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      engine = window.SiteSearch.createEngine(data);
      var s = engine.stats();
      meta.textContent = '索引 ' + s.total + ' 条：AI 工具 ' + s.aiTool + ' · 站点 ' + s.site +
        ' · 实用工具 ' + s.util + ' · 问答 ' + s.qa + ' · 文章 ' + s.post +
        '；对比对 ' + s.vsPairs + ' 组。';

      var p = new URLSearchParams(location.search);
      var q0 = p.get('q') || '';
      var f0 = p.get('flags') || '';
      if (f0) {
        activeFlags = f0.split(',').filter(Boolean);
        activeFlags.forEach(function (f) {
          var el = chipsEl.querySelector('.chip[data-flag="' + f + '"]');
          if (el) el.classList.add('on');
        });
      }
      if (q0) input.value = q0;
      doSearch();
    })
    .catch(function (e) {
      meta.textContent = '索引加载失败：' + e.message;
      out.innerHTML = '<div class="empty"><div class="empty-title">索引没有加载成功</div>' +
        '<div class="empty-note">如果你是在本地直接双击打开这个 HTML，浏览器会因为 file:// 的跨域限制拒绝读取 JSON。请用 <code>node server.js</code> 起本地服务，或者走 GitHub Pages 访问。</div></div>';
    });
})();
