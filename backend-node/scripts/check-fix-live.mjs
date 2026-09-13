#!/usr/bin/env node
/**
 * check-fix-live.mjs — 「我的修复到底生效了吗？」一条命令给出判定链
 *
 * 三层判据（任一层不过 ⇒ 你看到的效果不是新代码产生的）：
 *   ① 运行态：git HEAD / dist 构建时间 / STALE（src 比 dist 新）/ 13030 监听
 *   ② 代码层：dist 里是否真含修复符号（--symbols=xxx,yyy）
 *   ③ 产物层：最近产物的 component-meta.json.codeVersion{gitHash,distBuildAt}
 *             —— 产物比 dist 旧 ⇒ 该产物是旧代码跑的，别拿它评判新修复
 *
 * 用法：
 *   node scripts/check-fix-live.mjs
 *   node scripts/check-fix-live.mjs --symbols=extractClassTokensFromBindingValue,productFiles
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');          // backend-node
const MVGO = path.resolve(ROOT, '..');               // 项目根

const argv = process.argv.slice(2);
const symbolsArg = (argv.find((a) => a.startsWith('--symbols=')) || '').split('=')[1] || '';
const symbols = symbolsArg.split(',').map((s) => s.trim()).filter(Boolean);

const line = (s) => console.log(s);
const bar = (t) => { line('════════════════════════════════════════════════════════════'); line(t); line('════════════════════════════════════════════════════════════'); };

// ───────── ① 运行态 ─────────
bar('① 运行态');
try {
  line('  git HEAD          : ' + execSync('git -C ' + JSON.stringify(ROOT) + ' log -1 --format="%h %s"', { encoding: 'utf8' }).trim().slice(0, 78));
} catch { line('  git HEAD          : （读取失败）'); }

const distMain = path.join(ROOT, 'dist/main.js');
let distMtime = null;
try { distMtime = fs.statSync(distMain).mtime; } catch { /* ignore */ }
line('  dist/main.js 构建 : ' + (distMtime ? distMtime.toLocaleString('sv-SE') : '缺失 ❌'));

const newer = [];
if (distMtime) {
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (fs.statSync(p).mtime > distMtime) newer.push(path.relative(ROOT, p));
    }
  };
  try { walk(path.join(ROOT, 'src')); } catch { /* ignore */ }
}
line(newer.length === 0
  ? '  STALE 检查        : ✅ 无（src 不比 dist 新）'
  : `  STALE 检查        : ❌ ${newer.length} 个 src 比 dist 新 ⇒ 改动未编进 dist，需重新构建：\n` +
    newer.slice(0, 5).map((s) => '                      ' + s).join('\n'));

try {
  const out = execSync('lsof -iTCP:13030 -sTCP:LISTEN -t 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
  line(out ? `  端口 13030        : ✅ 监听中 (pid=${out})` : '  端口 13030        : ❌ 无监听 —— 服务没起，谈不上生效');
} catch { line('  端口 13030        : ❌ 无监听'); }

// ───────── ② 代码层 ─────────
bar('② 代码层（修复符号是否进了 dist）');
if (symbols.length === 0) {
  line('  （未指定 --symbols，跳过）');
} else {
  const hits = Object.fromEntries(symbols.map((s) => [s, []]));
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|cjs|mjs|json)$/.test(e.name)) continue;
      let txt = '';
      try { txt = fs.readFileSync(p, 'utf8'); } catch { continue; }
      for (const s of symbols) if (txt.includes(s)) hits[s].push(path.relative(ROOT, p));
    }
  };
  try { walk(path.join(ROOT, 'dist')); } catch { /* ignore */ }
  for (const s of symbols) {
    const h = hits[s];
    line(h.length ? `  ✅ ${s}  → 命中 ${h.length} 个 dist 文件（如 ${h[0]}）` : `  ❌ ${s}  → dist 里没有（改动未编入 / 构建失败 / 改了别处）`);
  }
}

// ───────── ③ 产物层 ─────────
bar('③ 产物层（最近产物是用哪个 dist 跑的）');
const metas = [];
const scan = (d, depth) => {
  if (depth > 3) return;
  let ents = [];
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const p = path.join(d, e.name);
    const f = path.join(p, 'component-meta.json');
    if (fs.existsSync(f)) { try { metas.push({ f, m: fs.statSync(f).mtime }); } catch { /* ignore */ } }
    scan(p, depth + 1);
  }
};
scan(path.join(MVGO, 'temp-components'), 0);
metas.sort((a, b) => b.m - a.m);
if (metas.length === 0) {
  line('  未找到产物 component-meta.json');
} else {
  const top = metas[0];
  line('  产物: ' + path.relative(MVGO, path.dirname(top.f)) + '   (' + top.m.toLocaleString('sv-SE') + ')');
  try {
    const cv = JSON.parse(fs.readFileSync(top.f, 'utf8')).codeVersion || {};
    line('  codeVersion       : ' + JSON.stringify(cv));
    if (cv.distBuildAt) {
      const t = Date.parse(cv.distBuildAt);
      const stale = distMtime && t < distMtime.getTime() - 1000;
      line(`  → 该产物由 dist[${cv.distBuildAt}] 生成，git=${cv.gitHash || '?'}`);
      line(stale
        ? `     ⚠️ 它比当前 dist（${distMtime.toLocaleString('sv-SE')}）旧 ⇒ 这是旧代码跑的产物，不可用它评判本次修复`
        : '     ✅ 不早于当前 dist ⇒ 可以用它评判本次修复');
    }
  } catch { line('  （读取失败）'); }
}
line('════════════════════════════════════════════════════════════');
