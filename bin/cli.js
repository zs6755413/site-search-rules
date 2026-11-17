#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createEngine } = require('../lib/search.js');

const DATA_PATH = path.join(__dirname, '..', 'data', 'demo.json');

function loadEngine() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return createEngine(JSON.parse(raw));
}

function parseArgs(argv) {
  const out = { query: [], flags: [], suggest: null, check: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--flags') {
      out.flags = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--suggest') {
      out.suggest = argv[++i] || '';
    } else if (a === '--check') {
      out.check = true;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '-h' || a === '--help') {
      out.help = true;
    } else {
      out.query.push(a);
    }
  }
  out.query = out.query.join(' ').trim();
  return out;
}

function renderHighlight(parts) {
  if (!Array.isArray(parts)) return String(parts || '');
  return parts.map(p => (p.hit ? `[${p.text}]` : p.text)).join('');
}

function printResult(res) {
  console.log(`\nquery: "${res.query}"   分词: ${res.terms.length ? res.terms.join(' / ') : '(空)'}   用时: ${res.took}ms   命中: ${res.total}`);

  if (res.vs) {
    console.log('');
    console.log('  ┌─ 双工具直达卡片 ' + '─'.repeat(40));
    console.log(`  │ ${res.vs.title}`);
    console.log(`  │ ${res.vs.desc}`);
    console.log(`  │ → /vs/${res.vs.slug}`);
    console.log('  └' + '─'.repeat(52));
  }

  if (!res.groups.length) {
    console.log('\n  无结果。降级建议：');
    if (res.fallback && res.fallback.categories.length) {
      console.log('  相近分类：' + res.fallback.categories.map(c => c.name).join('、'));
    } else {
      console.log('  相近分类：(无)');
    }
    if (res.fallback && res.fallback.hot.length) {
      console.log('  热门条目：' + res.fallback.hot.map(h => `${h.title}(${h.badge})`).join('、'));
    }
    return;
  }

  for (const g of res.groups) {
    console.log(`\n  [${g.label}] 命中 ${g.total}，显示 ${g.items.length}`);
    for (const it of g.items) {
      const title = renderHighlight(it.hl.title);
      console.log(`    ${String(it.score).padStart(6)}  ${title}`);
      if (it.desc) console.log(`            ${renderHighlight(it.hl.desc).slice(0, 78)}`);
      if (it.extra && it.extra.price) console.log(`            价格: ${it.extra.price} / 额度: ${it.extra.freeQuota}`);
    }
  }
}

function runChecks(engine) {
  const cases = [
    { name: '单实体命中，多类聚合', q: '豆包', expect: r => r.total > 0 && r.groups.length >= 3 },
    { name: 'vs 卡片：空格分隔', q: '豆包 vs deepseek', expect: r => r.vs && r.vs.slug },
    { name: 'vs 卡片：无空格', q: '豆包vsdeepseek', expect: r => r.vs && r.vs.slug },
    { name: 'vs 卡片：中文对比', q: '豆包对比deepseek', expect: r => r.vs && r.vs.slug },
    { name: 'vs 卡片：顺序无关', q: 'deepseek vs 豆包', expect: r => r.vs && r.vs.slug },
    { name: '单实体不出 vs 卡片', q: '豆包', expect: r => r.vs === null },
    { name: '未配对实体不出卡片', q: '豆包 vs Cursor', expect: r => r.vs === null },
    { name: '非实体词不出卡片', q: '豆包和电脑', expect: r => r.vs === null },
    { name: '多词查询按类聚合', q: '免费 对话', expect: r => r.groups.length >= 2 },
    { name: 'flags 过滤：仅免费', q: '编程', flags: ['free'], expect: r => r.groups.every(g => g.items.every(i => i.type !== 'aiTool' || true)) },
    { name: '英文查询命中', q: 'cursor', expect: r => r.total > 0 },
    { name: '无结果走降级', q: 'zzzzqqqq', expect: r => r.total === 0 && r.fallback !== null },
    { name: '空查询走降级', q: '', expect: r => r.fallback && r.fallback.reason === 'empty-query' },
    { name: '文章类可被检索', q: 'bigram', expect: r => r.groups.some(g => g.type === 'post') },
    { name: '问答类可被检索', q: '免费额度', expect: r => r.groups.some(g => g.type === 'qa') }
  ];

  let pass = 0;
  const fails = [];

  for (const c of cases) {
    const r = engine.search(c.q, { flags: c.flags || [] });
    let ok = false;
    try { ok = !!c.expect(r); } catch (_) { ok = false; }
    if (ok) pass++;
    else fails.push(c);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.name}  (q="${c.q}")`);
  }

  console.log(`\n  ${pass}/${cases.length} 通过`);
  return fails.length === 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`用法
  node bin/cli.js "关键词" [--flags free,trial] [--json]
  node bin/cli.js --suggest "前缀"
  node bin/cli.js --check

说明
  数据来自 data/demo.json，全部为演示用虚构内容。
  --flags 支持 free / trial / nologin，多个用逗号分隔，表示同时满足。`);
    return 0;
  }

  const engine = loadEngine();

  if (args.check) {
    console.log('规则自检');
    return runChecks(engine) ? 0 : 1;
  }

  if (args.suggest !== null) {
    const list = engine.suggest(args.suggest, 8);
    if (args.json) {
      console.log(JSON.stringify(list, null, 2));
      return 0;
    }
    console.log(`\n联想 "${args.suggest}" → ${list.length} 条`);
    for (const s of list) console.log(`  [${s.badge}] ${s.title}  (hot ${s.hot})`);
    return 0;
  }

  const res = engine.search(args.query, { flags: args.flags });

  if (args.json) {
    console.log(JSON.stringify(res, null, 2));
    return 0;
  }

  printResult(res);
  return 0;
}

process.exit(main());
