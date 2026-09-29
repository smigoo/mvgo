/**
 * 全语料 A/B 差分：OLD = dist（改前 build），NEW = src（varName 分组修复）。
 * 预期：变化只集中在「同 varName 多条目」的多卡共享背景家族，其余组件逐字不变。
 */
const fs = require('fs');
const path = require('path');
const OLD = require('./dist/ai-engine/roles/microcode/resource-mounter.js');
const NEW = require('./src/ai-engine/roles/microcode/resource-mounter.js');

const BASE = path.join(__dirname, '../frontend/workspace/custom-components');
const SKIP = new Set(['.mc-gen', '.snapshots', '.checkpoint', 'node_modules', '.git']);

function walk(dir, filter, out = []) {
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(e.name)) out.push(p);
  }
  return out;
}

let comps = 0;
let mapped = 0;
let identical = 0;
let changed = 0;
const samples = [];

for (const d of fs.readdirSync(BASE, { withFileTypes: true })) {
  if (!d.isDirectory() || SKIP.has(d.name)) continue;
  comps++;
  const compDir = path.join(BASE, d.name);
  const mp = path.join(compDir, '.mc-gen', 'resource-dom-mapping.json');
  if (!fs.existsSync(mp)) continue;
  let mapping;
  try {
    mapping = JSON.parse(fs.readFileSync(mp, 'utf-8'));
  } catch {
    continue;
  }
  if (!Array.isArray(mapping) || mapping.length === 0) continue;

  const files = {};
  for (const f of walk(path.join(compDir, 'package'), (n) => /\.vue$/i.test(n))) {
    try {
      files[path.relative(compDir, f).split(path.sep).join('/')] = fs.readFileSync(f, 'utf-8');
    } catch {}
  }
  if (!Object.keys(files).length) continue;
  mapped++;

  const o = OLD.dedupeBgMultiRefs({ ...files }, mapping);
  const n = NEW.dedupeBgMultiRefs({ ...files }, mapping);

  const keys = new Set([...Object.keys(o || {}), ...Object.keys(n || {})]);
  let diff = false;
  let diffFile = '';
  for (const k of keys) {
    if ((o || {})[k] !== (n || {})[k]) {
      diff = true;
      diffFile = k;
      break;
    }
  }
  if (diff) {
    changed++;
    if (samples.length < 15) samples.push(`${d.name}  file=${diffFile}`);
  } else {
    identical++;
  }
}

console.log('=== 全语料 A/B：dedupeBgMultiRefs 旧（dist 逐条循环） vs 新（src varName 分组） ===');
console.log(`组件            : ${comps}`);
console.log(`有 mapping 参与 : ${mapped}`);
console.log(`输出逐字一致    : ${identical}`);
console.log(`输出有差异      : ${changed}   ← 应全部是「同 varName 多条目」的多卡共享背景家族`);
console.log('');
console.log('--- 差异样本 ---');
if (!samples.length) console.log('  （无）');
for (const s of samples) console.log('  ' + s);
