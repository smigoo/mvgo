#!/usr/bin/env node
/**
 * Lite 子组件拆分「dist 运行时」只读验收（Phase 2 护栏）
 *
 * 目的：不重启、不部署、不写盘，一条命令确认「当前 dist 里装载的仍是 v2 拆分器，
 * 且语义命名 / scoped 样式随块迁移 / 逐字节可还原 / 幂等 / 阴性对照」均未退化。
 *
 * 🔴 只读约束：本文件只用 readFileSync / existsSync，**不 import 任何写函数**，
 *    也绝不调用唯一带 I/O 的 apply 函数（落盘写入点留在运行时代码里）。
 *    所有拆分/重组/幂等验证都在内存里完成，真机产物零改写。
 *
 * 用法：
 *   node scripts/verify-lite-split-runtime.mjs                    # 内置阳性+阴性对照（默认）
 *   node scripts/verify-lite-split-runtime.mjs --artifact <dir>  # 追加只读体检真机产物
 *   node scripts/verify-lite-split-runtime.mjs --artifact <dir> --expect-split  # 要求该产物必须可拆
 *   node scripts/verify-lite-split-runtime.mjs --dist <dir>      # 指定另一个 dist（CI / 坏产物对照）
 *
 * 退出码：0 = 全部硬判据通过（SKIP/WARN 不影响）；1 = 任一硬判据失败。
 *
 * 判据来源：全部复用 dist splitter 及其 __testing 内部函数，不另写一份正则，
 *    避免「验收脚本与运行时判据漂移」造成假绿。
 */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const BE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(join(BE, 'package.json'));
const { parse: parseSfc, compileTemplate, compileStyle } = req('@vue/compiler-sfc');

let distDir = join(BE, 'dist');
let DIST_SPLITTER = join(distDir, 'ai-engine/utils/lite-subcomponent-splitter.js');
const SRC_SPLITTER = join(BE, 'src/ai-engine/utils/lite-subcomponent-splitter.js');
let STAMP = join(distDir, '.build-stamp');

const checks = [];
const add = (name, ok, detail = '', hard = true) => {
  checks.push({ name, ok: !!ok, detail, hard });
  console.log(`${ok ? '✅' : hard ? '❌' : '⚠️ '} ${name}${detail ? ' — ' + detail : ''}`);
};

/* ─────────────── 内置对照样本（不依赖任何真机产物） ─────────────── */

// 阳性：2 个业务模块级静态块（各 5 元素 / >200B），带 <style scoped> 规则
const POSITIVE = `<template>
<div class="demo-monitor-root">
  <div class="demo-monitor-header">
    <span class="demo-monitor-header-title">设备监测</span>
    <span class="demo-monitor-header-item">设备类型 28</span>
    <span class="demo-monitor-header-item">设备总数 68562</span>
    <span class="demo-monitor-header-item">完好率 98%</span>
  </div>
  <div class="demo-monitor-footer">
    <span class="demo-monitor-footer-left">共 6 个节点</span>
    <span class="demo-monitor-footer-right">接入设备</span>
    <span class="demo-monitor-footer-num">10810</span>
    <span class="demo-monitor-footer-num">3792</span>
  </div>
</div>
</template>
<script setup>
const unused = 1;
</script>
<style scoped>
.demo-monitor-root { display: flex; flex-direction: column; padding: 12px; }
.demo-monitor-header { display: flex; align-items: center; justify-content: space-between; height: 24px; }
.demo-monitor-header-title { font-size: 16px; font-weight: 700; color: #2F80ED; }
.demo-monitor-header-item { margin-left: 12px; font-size: 12px; color: #666; }
.demo-monitor-footer { display: flex; align-items: center; justify-content: space-between; height: 20px; }
.demo-monitor-footer-left { font-size: 12px; color: #999; }
.demo-monitor-footer-right { font-size: 12px; color: #666; }
.demo-monitor-footer-num { font-size: 14px; font-weight: 700; color: #2F80ED; }
</style>`;

// 阴性：只有一个达标块 ⇒ 必须原样不动（「≥2 达标块」硬边界）
const NEGATIVE = `<template>
<div class="solo-root"><div class="solo-header"><span class="solo-a">A</span><span class="solo-b">B</span><span class="solo-c">C</span><span class="solo-d">D</span></div></div>
</template>
<script setup>
const x = 1;
</script>
<style scoped>
.solo-root { display: flex; padding: 12px; }
.solo-header { color: red; }
.solo-a { font-size: 12px; }
</style>`;

/* ─────────────── 工具函数（全部只读） ─────────────── */

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

function styleContentOf(src) {
  const parsed = parseSfc(src);
  const block = (parsed.descriptor.styles || []).find((s) => s.scoped) || (parsed.descriptor.styles || [])[0];
  return { block, css: block ? String(block.content || '') : '' };
}

function templateContentOf(src) {
  const parsed = parseSfc(src);
  return parsed.descriptor.template ? String(parsed.descriptor.template.content || '') : '';
}

function inspectChild(S, name, src) {
  const parsed = parseSfc(src);
  const errors = (parsed.errors || []).map((e) => String(e.message || e));
  const tpl = parsed.descriptor.template;
  let tplErrors = [];
  if (tpl) {
    const r = compileTemplate({ source: String(tpl.content || ''), filename: name, id: 'verify' });
    tplErrors = (r.errors || []).map((e) => String(e.message || e));
  }
  const { block, css } = styleContentOf(src);
  let styleErrors = [];
  if (block) {
    const r = compileStyle({ source: css, id: 'data-v-verify', scoped: !!block.scoped, filename: name });
    styleErrors = (r.errors || []).map((e) => String(e.message || e));
  }
  return {
    name,
    bytes: Buffer.byteLength(src),
    hasTemplate: !!tpl,
    hasScopedStyle: !!(block && block.scoped),
    css,
    errors: [...errors, ...tplErrors, ...styleErrors],
    interpolation: (src.match(/\{\{/g) || []).length,
    directive: (src.match(/\s(?:v-|@|:)[\w.:-]+\s*=/g) || []).length,
    refOrId: (src.match(/\s(?:ref|id)\s*=\s*["']/g) || []).length,
  };
}

/** 验证一次拆分结果的完整契约；返回 { ok, lines } */
function verifySplit(S, source, label, requireSplit) {
  const result = S.splitLiteSfcIntoSubcomponents(source);
  const lines = [];
  if (!result.changed) {
    if (requireSplit) return { ok: false, lines: [`${label}: 期望可拆，实际 ${result.reason}`], skipped: false };
    return { ok: true, lines: [`${label}: SKIP ${result.reason} candidates=${result.stats?.candidates ?? '-'} staticBlocks=${result.stats?.staticBlocks ?? '-'}`], skipped: true };
  }

  lines.push(`${label}: split=${result.stats?.split ?? '-'} candidates=${result.stats?.candidates ?? '-'} skipped=${result.stats?.skipped ?? '-'}`);
  if (S.reassembleLiteSfc(result) !== source) lines.push(`${label}: ❌ reassemble 非逐字节一致`);
  else lines.push(`${label}: reassemble 逐字节一致`);

  const files = Object.entries(result.files || {});
  const children = files.filter(([p]) => p.startsWith('package/components/'));
  const parent = result.files['package/index.vue'] || '';
  const parentParsed = S.__testing.parseTopLevelStyleRules(styleContentOf(source).css);
  let allOk = true;

  for (const [p, src] of children) {
    const name = p.split('/').pop();
    const info = inspectChild(S, name, src);
    const semantic = /^[A-Z][A-Za-z0-9]*Section\d*\.vue$/.test(name) && !/^LiteSection/.test(name);
    const classes = S.__testing.collectClassTokens(templateContentOf(src));
    const childRules = S.__testing.parseTopLevelStyleRules(info.css);
    const parentHits = parentParsed.rules.filter((r) => classes.some((c) => String(r.selector || r.raw || '').includes('.' + c))).length;
    const childHits = childRules.rules.filter((r) => classes.some((c) => String(r.selector || r.raw || '').includes('.' + c))).length;
    const covered = childHits >= parentHits;
    const clean = info.errors.length === 0 && info.interpolation === 0 && info.directive === 0 && info.refOrId === 0;
    const ok = semantic && covered && clean && info.hasTemplate;
    if (!ok) allOk = false;
    lines.push(`  ${ok ? '✅' : '❌'} ${name}: ${info.bytes}B semantic=${semantic} scoped=${info.hasScopedStyle} styleRule=${childRules.rules.length} cover=${childHits}/${parentHits} leak=${info.interpolation}/${info.directive}/${info.refOrId} sfcErrors=${info.errors.length}`);
  }

  // 幂等：已注入 import 的父 SFC 再喂一次拆分器，必须 changed=false（纯内存）
  const second = S.splitLiteSfcIntoSubcomponents(parent);
  if (second.changed) { allOk = false; lines.push(`${label}: ❌ 幂等失败，父已拆仍二次拆分`); }
  else lines.push(`${label}: 幂等 ok（${second.reason}）`);

  const imports = (parent.match(/from\s+['"]\.\/components\//g) || []).length;
  if (imports !== children.length) { allOk = false; lines.push(`${label}: ❌ 父 import ${imports} ≠ 子组件 ${children.length}`); }
  else lines.push(`${label}: 父 import ${imports} = 子组件 ${children.length}`);

  if (lines.some((l) => l.includes('❌'))) allOk = false;
  return { ok: allOk, lines, skipped: false };
}

/* ─────────────── 参数 ─────────────── */

const args = process.argv.slice(2);
const artifacts = [];
let expectSplit = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--artifact' && args[i + 1]) artifacts.push(args[++i]);
  else if (args[i] === '--dist' && args[i + 1]) {
    distDir = resolve(args[++i]);
    DIST_SPLITTER = join(distDir, 'ai-engine/utils/lite-subcomponent-splitter.js');
    STAMP = join(distDir, '.build-stamp');
  } else if (args[i] === '--expect-split') expectSplit = true;
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('用法: verify-lite-split-runtime.mjs [--artifact <dir>]... [--expect-split] [--dist <dir>]');
    process.exit(0);
  }
}

/* ─────────────── 主流程 ─────────────── */

console.log('=== Lite 拆分 dist 运行时只读验收 ===');
console.log(`dist: ${DIST_SPLITTER}`);

if (!existsSync(DIST_SPLITTER)) {
  add('dist 拆分器存在', false, '文件缺失，请先 npm run build');
  console.log('SUMMARY pass=0 fail=1 skip=0');
  process.exit(1);
}

let S;
try {
  S = req(DIST_SPLITTER);
  add('dist 拆分器可加载', true, `LOAD_OK version=${S.LITE_SPLIT_VERSION}`);
} catch (e) {
  add('dist 拆分器可加载', false, String(e.message || e).slice(0, 200));
  console.log('SUMMARY pass=0 fail=1 skip=0');
  process.exit(1);
}

add('版本 = lite-split.v2', S.LITE_SPLIT_VERSION === 'lite-split.v2', `实际 ${S.LITE_SPLIT_VERSION}`);
add('粒度门槛 4/200', S.LITE_SPLIT_MIN_ELEMENTS === 4 && S.LITE_SPLIT_MIN_BYTES === 200, `${S.LITE_SPLIT_MIN_ELEMENTS}/${S.LITE_SPLIT_MIN_BYTES}`);

// INFO 层：源/产物 md5 与 build-stamp 只提示，不进退出码（并行会话构建不同步是常态，
// 且 dist 落后由 start-node 的 R3-B 护栏负责；版本 + 阳性对照才是本脚本的硬判据）
if (existsSync(SRC_SPLITTER)) {
  const same = md5(readFileSync(SRC_SPLITTER)) === md5(readFileSync(DIST_SPLITTER));
  add('源/产物 md5 一致', same, same ? '一致' : '不一致（dist 可能落后于 src，请复核构建）', false);
}
if (existsSync(STAMP)) {
  let git = '?';
  try { git = JSON.parse(readFileSync(STAMP, 'utf8')).git || '?'; } catch { /* ignore */ }
  console.log(`ℹ️  build-stamp git=${git}`);
}

const pos = verifySplit(S, POSITIVE, '阳性对照', true);
for (const l of pos.lines) console.log('  ' + l);
add('阳性对照：2 块语义命名 + scoped 覆盖 + 可还原 + 幂等', pos.ok, pos.lines[0] || '');

const negResult = S.splitLiteSfcIntoSubcomponents(NEGATIVE);
const negOk = negResult.changed === false
  && negResult.reason === 'insufficient-static-blocks'
  && S.reassembleLiteSfc(negResult) === NEGATIVE;
add('阴性对照：单达标块不拆且逐字节不变', negOk, `changed=${negResult.changed} reason=${negResult.reason}`);

for (const dir of artifacts) {
  const abs = resolve(dir);
  const entry = existsSync(join(abs, 'package/index.vue'))
    ? join(abs, 'package/index.vue')
    : existsSync(join(abs, 'index.vue')) ? join(abs, 'index.vue') : null;
  if (!entry) { add(`产物 ${abs}`, false, '未找到 package/index.vue'); continue; }
  const src = readFileSync(entry, 'utf8');
  const r = verifySplit(S, src, `产物 ${abs.split('/').slice(-2).join('/')}`, expectSplit);
  for (const l of r.lines) console.log('  ' + l);
  const why = r.lines.find((l) => l.includes('SKIP ')) || '';
  add(`产物体检 ${abs.split('/').pop()}`, r.ok, r.ok ? (why ? why.trim() : 'PASS') : 'FAIL（见上方明细）');
}

const fail = checks.filter((c) => c.hard && !c.ok).length;
const pass = checks.filter((c) => c.hard && c.ok).length;
const skip = checks.filter((c) => !c.hard).length;
console.log(`SUMMARY pass=${pass} fail=${fail} info=${skip}`);
process.exit(fail > 0 ? 1 : 0);
