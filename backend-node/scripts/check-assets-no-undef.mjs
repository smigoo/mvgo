#!/usr/bin/env node
/**
 * G03 卫生门禁：拦截 .js 资产文件里「新增的」未声明标识符。
 *
 * 背景：nest-cli.json 的 assets 把 src/**\/*.js 直接复制进 dist，这些文件不进 tsc，
 * 也不被 `npm run lint`（只扫 *.ts）覆盖。2026-11-13 的 `cs is not defined`
 * 就是这样溜进生产并让 5 个生成任务 100% 崩溃的。
 *
 * 为什么是「增量基线」而不是「全量严格」：
 *   首次扫描存在 10 处历史违规（base-agent.js 的 logger、microcode-engineer.js 的
 *   workingManifest、custom-components 模板 DSL 的 $createMcDeclare/$mcCssBuilder 等）。
 *   全量严格会直接阻断构建，且模板 DSL 属运行时注入的合法误报。
 *   基线按「文件 + 变量名 + 出现次数」记账：新增变量名或次数增加即 FAIL；
 *   修复导致的减少会被记为 resolved（放行并打印），真错仍 FAIL。
 *
 * 用法：
 *   node scripts/check-assets-no-undef.mjs                 # 构建门禁默认模式
 *   node scripts/check-assets-no-undef.mjs --write-baseline
 *   cat old.js | node scripts/check-assets-no-undef.mjs --stdin --as=src/ai-engine/roles/microcode-engineer.js
 */
import { ESLint } from 'eslint';
import globals from 'globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(ROOT, 'scripts', 'no-undef-baseline.json');
const args = process.argv.slice(2);
const writeBaseline = args.includes('--write-baseline');
const stdinMode = args.includes('--stdin');
const asPath = (args.find((a) => a.startsWith('--as=')) || '').slice(5);

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.js'],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: { ...globals.node, ...globals.browser, ...globals.es2021 },
      },
      rules: { 'no-undef': 'error' },
    },
  ],
});

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(p, out);
    else if (entry.name.endsWith('.js') && !entry.name.includes('.spec.') && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

async function fingerprint(relPath, code) {
  const results = await eslint.lintText(code, { filePath: relPath });
  const counts = {};
  for (const m of results[0].messages) {
    if (m.ruleId !== 'no-undef') continue;
    const name = (/'([^']+)' is not defined/.exec(m.message) || [])[1] || m.message;
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

async function scan() {
  if (stdinMode) {
    if (!asPath) throw new Error('--stdin 需要 --as=<相对路径>');
    const code = fs.readFileSync(0, 'utf8');
    return { [asPath]: await fingerprint(asPath, code) };
  }
  const out = {};
  for (const abs of collectFiles(SRC)) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const counts = await fingerprint(rel, fs.readFileSync(abs, 'utf8'));
    if (Object.keys(counts).length) out[rel] = counts;
  }
  return out;
}

const current = await scan();
const baseline = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  : {};

if (writeBaseline) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  const total = Object.values(current).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0);
  console.log(`[assets-no-undef] 基线已写入 ${path.relative(ROOT, BASELINE)}：${Object.keys(current).length} 文件 / ${total} 处历史违规`);
  for (const [f, c] of Object.entries(current)) console.log(`  ${f}: ${JSON.stringify(c)}`);
  process.exit(0);
}

const regressions = [];
const resolved = [];
for (const [file, counts] of Object.entries(current)) {
  const base = baseline[file] || {};
  for (const [name, n] of Object.entries(counts)) {
    if (!base[name]) regressions.push(`${file}: 新增未声明标识符 '${name}' ×${n}`);
    else if (n > base[name]) regressions.push(`${file}: '${name}' ${base[name]} → ${n}`);
  }
  for (const [name, n] of Object.entries(base)) {
    if (!counts[name]) resolved.push(`${file}: '${name}' ×${n} 已修复`);
    else if (counts[name] < n) resolved.push(`${file}: '${name}' ${n} → ${counts[name]}`);
  }
}
// stdin 单文件模式只对比目标文件，避免把「未扫描的其它基线文件」误记为已修复。
const resolveScope = stdinMode ? [asPath] : Object.keys(baseline);
for (const file of resolveScope) {
  if (!current[file]) for (const [name, n] of Object.entries(baseline[file] || {})) resolved.push(`${file}: '${name}' ×${n} 已修复`);
}

const summary = {
  checked: stdinMode ? 1 : collectFiles(SRC).length,
  knownViolations: Object.values(current).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0),
  regressions,
  resolved,
};
console.log(`[assets-no-undef] 扫描 ${summary.checked} 文件 / 已知违规 ${summary.knownViolations} 处 / 新增 ${regressions.length} 条 / 修复 ${resolved.length} 条`);
for (const r of resolved) console.log(`  ✅ ${r}`);
for (const r of regressions) console.error(`  🔴 ${r}`);
if (!fs.existsSync(BASELINE)) {
  console.error('[assets-no-undef] 基线文件缺失，请先执行 --write-baseline');
  process.exit(2);
}
process.exit(regressions.length ? 1 : 0);
