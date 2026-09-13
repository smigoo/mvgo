#!/usr/bin/env node
/**
 * diagnose-c024-false-positive.mjs — CODE-024「类名契约」假阳性诊断探针
 *
 * 症状：L0-B 门禁报 `[CODE-024] 类名契约违规`（C1 非标准修饰符方言 / C2 修饰符规则基类不在 DOM /
 *       C3 模板修饰符类无对应样式规则 / C4 样式规则无模板使用），且同一 blockId 连续多轮复现
 *       → 重试耗尽 → 软失败降级。而产物里模板与样式**看着是匹配的**。
 *
 * 第一判据（5 秒定性）：把门禁报的 token 拿去产物里搜 ——
 *   · 若它只出现在 `:class` **JS 表达式**里（比较值 / 函数实参），它根本不是类名
 *     ⇒ 采集器 over-collection 型假阳性（2026-09-13 刀 11 治本）。
 *   · 若它是模板里真实书写的类名，而样式侧用了**不同基名**（如模板 `c-x-tab` vs 样式
 *     `c-x-tab-item`）⇒ 真阳性（属另一轮待治，不可靠放松 C3 掩盖）。
 *
 * 用法：
 *   node scripts/diagnose-c024-false-positive.mjs <产物目录>
 * 退出码：0 = 无 error 级违规（或全部为采集污染型）；1 = 存在真阳性 error。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_FACTS = path.resolve(__dirname, '../dist/ai-engine/utils/class-facts.js');
const DIST_CONTRACT = path.resolve(__dirname, '../dist/ai-engine/utils/classname-contract.js');
const DIST_DIALECT = path.resolve(__dirname, '../dist/ai-engine/utils/class-dialect-normalizer.js');

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('用法：node scripts/diagnose-c024-false-positive.mjs <产物目录>');
  process.exit(2);
}
for (const p of [DIST_FACTS, DIST_CONTRACT, DIST_DIALECT]) {
  if (!fs.existsSync(p)) {
    console.error(`❌ 未找到 dist 模块：${p}\n   请先构建：rm -f tsconfig.build.tsbuildinfo && npm run build`);
    process.exit(2);
  }
}

const { collectClassFacts, collectDomTokensFromTemplate } = await import(DIST_FACTS);
const { checkClassNameContract } = await import(DIST_CONTRACT);
const { normalizeClassNameDialect } = await import(DIST_DIALECT);

function collectAll(root) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (fs.statSync(abs).isDirectory()) {
      for (const e of fs.readdirSync(abs)) {
        if (e === 'node_modules' || e.startsWith('.')) continue;
        walk(path.join(rel, e));
      }
    } else if (/\.(vue|less|css|js|json)$/i.test(rel)) {
      out.push({ path: rel, content: fs.readFileSync(abs, 'utf-8') });
    }
  };
  for (const e of fs.readdirSync(root)) if (!e.startsWith('.')) walk(e);
  return out;
}

/** 模板区（首 <template> → <script|<style） */
function templateOf(vue) {
  const i = vue.search(/<template\b[^>]*>/i);
  if (i < 0) return '';
  const rest = vue.slice(i);
  const j = rest.search(/<script[\s>]|<style[\s>]/i);
  return j > 0 ? rest.slice(0, j) : rest;
}

/**
 * 判定 token 在模板里的出现位置性质：'expr'（只在 JS 表达式里）/ 'class'（类名位置）/ 'both' / 'none'
 */
function locateToken(tpl, tok) {
  const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\w-])${esc}(?![\\w-])`, 'g');
  let m;
  let sawClass = false;
  let sawExpr = false;
  while ((m = re.exec(tpl))) {
    const before = tpl.slice(Math.max(0, m.index - 16), m.index);
    // 比较运算右操作数：`… === 'tok'` / `… > "tok"`
    const cmp = /(===|!==|==|!=|<=|>=|[<>])\s*["'`]\s*$/.test(before);
    // 函数调用实参：`ident('tok'` / `.includes("tok"`
    const call = /[\w$)\]]\s*\(\s*["'`]\s*$/.test(before);
    if (cmp || call) sawExpr = true;
    else sawClass = true;
  }
  if (sawClass && sawExpr) return 'both';
  if (sawClass) return 'class';
  if (sawExpr) return 'expr';
  return 'none';
}

const files = collectAll(dir);
const fileMap = Object.fromEntries(files.map((f) => [f.path, f.content]));
const tpls = files.filter((f) => /\.vue$/i.test(f.path)).map((f) => templateOf(f.content));

const violations = checkClassNameContract(fileMap, collectClassFacts(files));
const errs = violations.filter((v) => v.severity === 'error');
const warns = violations.filter((v) => v.severity !== 'error');

console.log('══════════════════════════════════════════════════════════');
console.log(`产物目录：${dir}`);
console.log(`文件数=${files.length}  error=${errs.length}  warn=${warns.length}`);
console.log('──────────────────────────────────────────────────────────');

// 归一器预览：写盘前归一若能消除的 C1，说明是「该归一但没归一到」的漏治
const norm = normalizeClassNameDialect(fileMap);
console.log(`类名方言归一器（写盘前）可改写项：${norm.changes.length}`);
if (norm.changes.length) console.log(`  样本：${JSON.stringify(norm.changes.slice(0, 3))}`);
console.log('──────────────────────────────────────────────────────────');

const tokenOf = (msg) => (String(msg).match(/`([^`]+)`/) || [])[1] || '';
let realErrors = 0;

for (const v of [...errs, ...warns]) {
  const tok = tokenOf(v.message);
  const where = tok ? locateToken(tpls.join('\n'), tok) : 'none';
  let verdict;
  if (!tok || v.code === 'C4') {
    verdict = '（样式侧孤儿规则，warn）';
  } else if (where === 'expr' || where === 'none') {
    verdict = '❌ 采集污染型假阳性（token 不是类名）';
  } else {
    verdict = '⚠️ 真阳性（token 是模板类名 → 样式侧确有缺口）';
    if (v.severity === 'error') realErrors += 1;
  }
  console.log(`[${v.code}/${v.severity}] token=\`${tok}\` 模板位置=${where}`);
  console.log(`   ${verdict}`);
  console.log(`   ${String(v.message).slice(0, 150)}`);
}

console.log('══════════════════════════════════════════════════════════');
if (realErrors === 0) {
  console.log('结论：error 级违规中无「真阳性」⇒ CODE-024 报的是采集污染型假阳性。');
  process.exit(0);
}
console.log(`结论：存在 ${realErrors} 条真阳性 error ⇒ 模板/样式确有缺口（如模板基名与样式基名不一致）。`);
console.log('      ⚠️ 不可靠放松 C3/C2 掩盖 —— 应治「模板基名 ↔ 样式基名对齐」。');
process.exit(1);
