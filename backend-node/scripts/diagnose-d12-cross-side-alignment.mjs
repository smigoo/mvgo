#!/usr/bin/env node
/**
 * 🛡️ 刀 12 诊断：模板基名 ↔ 样式基名「跨侧对齐」（R4）离线复算。
 *
 * 用途：产物出现下列任一现象时，判定是不是「模板与样式基名不一致」这一类：
 *   - 门禁 CODE-024 C3：模板修饰符类（`X--active`）无对应样式规则；
 *   - 门禁 CODE-024 C4：样式里**真实的设计规则**（`.X-item--active` 带背景色/圆角）无模板使用；
 *   - 视觉：激活态不生效、tab/卡片只有布局没有设计（autoFix 只补了 layout stub）。
 *
 * 同时给出「归一前 / 归一后」的 C1~C4 明细，用于确认修复方向（不得新增 error）。
 *
 * 用法：
 *   node scripts/diagnose-d12-cross-side-alignment.mjs <产物目录>
 *   node scripts/diagnose-d12-cross-side-alignment.mjs --scan          # 扫全部存量产物
 *
 * 退出码：0 = 无 error 级 C1~C4；1 = 存在 error（需处理）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UTILS = path.join(ROOT, 'src/ai-engine/utils');

const {
  normalizeClassNameDialect,
  buildStyleClassIndex,
  stripAutoFixSection,
} = await import(path.join(UTILS, 'class-dialect-normalizer.js'));
const { collectClassFacts } = await import(path.join(UTILS, 'class-facts.js'));
const { checkClassNameContract } = await import(path.join(UTILS, 'classname-contract.js'));

const TEXT_EXT = new Set(['.vue', '.less', '.css', '.js', '.json']);
const SKIP_DIR = new Set(['.checkpoint', '.mc-gen', 'images', 'node_modules']);

function loadFiles(dir, base = '') {
  const out = {};
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      Object.assign(out, loadFiles(path.join(dir, e.name), rel));
    } else if (TEXT_EXT.has(path.extname(e.name))) {
      try {
        out[rel] = fs.readFileSync(path.join(dir, e.name), 'utf-8');
      } catch {
        /* 忽略不可读文件 */
      }
    }
  }
  return out;
}

function report(dir) {
  const files = loadFiles(dir);
  const vueCount = Object.keys(files).filter((p) => p.endsWith('.vue')).length;
  const styleCount = Object.keys(files).filter((p) => /\.(less|css)$/.test(p)).length;
  console.log(`\n===== ${path.relative(path.join(ROOT, '..'), dir)} =====`);
  console.log(`文件 ${Object.keys(files).length}（.vue ${vueCount} / 样式 ${styleCount}）`);
  if (vueCount === 0 || styleCount === 0) {
    console.log('跳过：产物不完整（缺 .vue 或样式源）');
    return 0;
  }

  // ① 样式侧基名索引（R4 判据的唯一事实源）
  const idx = buildStyleClassIndex(files);
  console.log(`样式源基名 ${idx.bases.size} 个 / 类名 ${idx.exact.size} 个`);

  // ② 归一（含 R1/R2 + R4），并区分改写来源
  const { files: aligned, changes } = normalizeClassNameDialect(files);
  const r4 = changes.filter((c) => c.rule === 'R4');
  const r12 = changes.filter((c) => c.rule !== 'R4');
  console.log(`改写：R4 跨侧对齐 ${r4.length} 条 / R1·R2 方言归一 ${r12.length} 条`);
  for (const c of r4) console.log(`  [R4] ${c.path}  ${c.from} → ${c.to}`);
  for (const c of r12.slice(0, 12)) console.log(`  [R1/R2] ${c.path}  ${c.from} → ${c.to}`);

  // ③ 契约前后对比
  const before = checkClassNameContract(files, collectClassFacts(files));
  const after = checkClassNameContract(aligned, collectClassFacts(aligned));
  const count = (v, sev) => v.filter((x) => x.severity === sev).length;
  console.log(`C1~C4 error：${count(before, 'error')} → ${count(after, 'error')}；warn：${count(before, 'warn')} → ${count(after, 'warn')}`);
  const key = (v) => new Set(v.map((x) => `${x.code}|${x.message}`));
  const kb = key(before);
  const ka = key(after);
  const removed = [...kb].filter((k) => !ka.has(k));
  const added = [...ka].filter((k) => !kb.has(k));
  if (removed.length) {
    console.log(`  — 归一后消失 ${removed.length} 条：`);
    removed.slice(0, 8).forEach((k) => console.log(`      - ${k.slice(0, 130)}`));
  }
  if (added.length) {
    console.log(`  — 归一后新增 ${added.length} 条（须确认不是新缺陷）：`);
    added.slice(0, 8).forEach((k) => console.log(`      + ${k.slice(0, 130)}`));
  }
  return count(after, 'error');
}

/** 扫全部存量产物（temp-components + 两侧 custom-components），排除缓存目录 */
function scanAll() {
  const roots = [
    path.join(ROOT, '..', 'temp-components'),
    path.join(ROOT, 'workspace', 'custom-components'),
    path.join(ROOT, '..', 'frontend', 'workspace', 'custom-components'),
  ];
  const isNonProduct = (n) => n.startsWith('.') || n.startsWith('_') || n === 'node_modules';
  const dirs = [];
  for (const p of roots) {
    if (!fs.existsSync(p)) continue;
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (!e.isDirectory() || isNonProduct(e.name)) continue;
      const sub = path.join(p, e.name);
      const inner = fs.readdirSync(sub, { withFileTypes: true }).filter((x) => x.isDirectory());
      if (inner.length === 0) dirs.push(sub);
      else for (const i of inner) if (!isNonProduct(i.name)) dirs.push(path.join(sub, i.name));
    }
  }
  let scanned = 0;
  let errBefore = 0;
  let errAfter = 0;
  let errUp = 0;
  let errDown = 0;
  let r4Prods = 0;
  let r4Count = 0;
  for (const d of dirs) {
    const files = loadFiles(d);
    const nvue = Object.keys(files).filter((p) => p.endsWith('.vue')).length;
    const hasStyle = Object.keys(files).some((p) => /\.(less|css)$/.test(p));
    if (nvue === 0 || !hasStyle) continue;
    scanned++;
    const { files: aligned, changes } = normalizeClassNameDialect(files);
    const b = checkClassNameContract(files, collectClassFacts(files)).filter((x) => x.severity === 'error').length;
    const a = checkClassNameContract(aligned, collectClassFacts(aligned)).filter((x) => x.severity === 'error').length;
    errBefore += b;
    errAfter += a;
    if (a > b) {
      errUp++;
      console.log(`  ⚠️ error 上升 ${path.relative(path.join(ROOT, '..'), d)} ${b} → ${a}`);
    }
    if (a < b) errDown++;
    const r4 = changes.filter((c) => c.rule === 'R4');
    if (r4.length) {
      r4Prods++;
      r4Count += r4.length;
      console.log(`  ✅ R4 对齐 ${path.relative(path.join(ROOT, '..'), d)}（${r4.length} 条）`);
    }
  }
  console.log(`\n扫描 ${scanned} 个有效产物：C1~C4 error ${errBefore} → ${errAfter}（下降 ${errDown} 个 / 上升 ${errUp} 个）`);
  console.log(`R4 命中 ${r4Prods} 个产物 / ${r4Count} 条改写`);
  return errUp;
}

const arg = process.argv[2];
if (!arg) {
  console.error('用法：node scripts/diagnose-d12-cross-side-alignment.mjs <产物目录> | --scan');
  process.exit(2);
}
if (arg === '--scan') {
  process.exit(scanAll() > 0 ? 1 : 0);
}
if (!fs.existsSync(arg) || !fs.statSync(arg).isDirectory()) {
  console.error(`目录不存在：${arg}`);
  process.exit(2);
}
process.exit(report(path.resolve(arg)) > 0 ? 1 : 0);
