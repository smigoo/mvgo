#!/usr/bin/env node
/**
 * 🛡️ 刀 14 诊断：CODE-024 C3 的「可修 / 不可修」离线复算。
 *
 * 用途：门禁报 `[C3] 模板修饰符类 \`X--mod\` 无对应样式规则（激活态必然失效）` 时，
 * 判定它是**可修**（基类在设计样式里存在 → 补一条规则即可 → error/BLOCK）
 * 还是**不可修**（基类在样式侧无设计规则、只有 `[自动修复]` 兜底 stub 或完全缺失
 * → 补样式只会臆造设计、重试空转 → warn）。
 *
 * 同时给出与「旧实现（HEAD 版本）」的 A/B：把
 *   git show HEAD:src/ai-engine/utils/classname-contract.js > src/ai-engine/utils/__legacy-contract.js
 * 放在 utils 下即可自动对比（相对 import 才解析得到）。跑完请删除该文件。
 *
 * 用法：
 *   node scripts/diagnose-c3-reachability.mjs <产物目录>
 *   node scripts/diagnose-c3-reachability.mjs --scan
 *
 * 退出码：0 = 无「可修型」C3 error；1 = 存在（需处理）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UTILS = path.join(ROOT, 'src/ai-engine/utils');

const { checkClassNameContract } = await import(path.join(UTILS, 'classname-contract.js'));
const { collectClassFacts } = await import(path.join(UTILS, 'class-facts.js'));

const LEGACY_PATH = path.join(UTILS, '__legacy-contract.js');
const legacy = fs.existsSync(LEGACY_PATH) ? await import(LEGACY_PATH) : null;

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

const c3Of = (fn, files) => {
  const v = fn(files, collectClassFacts(files));
  return {
    err: v.filter((x) => x.code === 'C3' && x.severity === 'error'),
    warn: v.filter((x) => x.code === 'C3' && x.severity === 'warn'),
  };
};

function report(dir, quiet = false) {
  const files = loadFiles(dir);
  const nvue = Object.keys(files).filter((p) => p.endsWith('.vue')).length;
  const hasStyle = Object.keys(files).some((p) => /\.(less|css)$/.test(p));
  if (nvue === 0 || !hasStyle) return null;

  const now = c3Of(checkClassNameContract, files);
  const old = legacy ? c3Of(legacy.checkClassNameContract, files) : null;

  if (!quiet) {
    const rel = path.relative(path.join(ROOT, '..'), dir);
    console.log(`\n===== ${rel} =====`);
    if (old) {
      console.log(
        `C3：旧实现 error ${old.err.length} / 新实现 error ${now.err.length}（可修）+ warn ${now.warn.length}（不可修）`,
      );
    } else {
      console.log(`C3：error ${now.err.length}（可修）+ warn ${now.warn.length}（不可修）`);
    }
    for (const x of now.err) console.log(`  [error·可修] ${x.message.slice(0, 120)}`);
    for (const x of now.warn) console.log(`  [warn·不可修] ${x.message.slice(0, 160)}`);
  }
  return { err: now.err.length, warn: now.warn.length, oldErr: old ? old.err.length : null };
}

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
  let errSum = 0;
  let warnSum = 0;
  let oldErrSum = 0;
  let errProds = 0;
  const errDetail = [];
  for (const d of dirs) {
    const r = report(d, true);
    if (!r) continue;
    scanned++;
    errSum += r.err;
    warnSum += r.warn;
    if (r.oldErr !== null) oldErrSum += r.oldErr;
    if (r.err > 0) {
      errProds++;
      errDetail.push({ d: path.relative(path.join(ROOT, '..'), d), n: r.err });
    }
  }
  console.log(`\n扫描 ${scanned} 个有效产物`);
  if (legacy) {
    console.log(`C3 error（可修）：旧实现 ${oldErrSum} → 新实现 ${errSum}`);
  } else {
    console.log(`C3 error（可修）：${errSum}`);
  }
  console.log(`C3 warn（不可修·基名体系脱节）：${warnSum}`);
  console.log(`出现「可修型」C3 的产物：${errProds} 个`);
  for (const e of errDetail.slice(0, 15)) console.log(`  - ${e.d}（${e.n}）`);
  return errSum;
}

const arg = process.argv[2];
if (!arg) {
  console.error('用法：node scripts/diagnose-c3-reachability.mjs <产物目录> | --scan');
  process.exit(2);
}
if (arg === '--scan') {
  process.exit(scanAll() > 0 ? 1 : 0);
}
if (!fs.existsSync(arg) || !fs.statSync(arg).isDirectory()) {
  console.error(`目录不存在：${arg}`);
  process.exit(2);
}
const r = report(path.resolve(arg));
process.exit(r && r.err > 0 ? 1 : 0);
