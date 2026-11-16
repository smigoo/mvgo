#!/usr/bin/env node
/**
 * 卫生门禁：拦截 .js 资产里「Node 无法解析」的语法（典型：TypeScript 语法漏进 .js）。
 *
 * 背景（为什么必须单独一条）：
 *   - `nest-cli.json` 的 assets 把 `src/**\/*.js` 逐字复制进 dist，这些文件不进 tsc；
 *   - `npm run lint` 只扫 `*.ts`，G03 `check-assets-no-undef.mjs` 只认 `no-undef` 规则
 *     （其内部 `if (m.ruleId !== 'no-undef') continue;` 会把 espree 的
 *      `Parsing error: ...`（ruleId=null, fatal=true）一并滤掉）；
 *   - jest 的 transform `^.+\\.(t|j)s$ → ts-jest` 连 `.js` 一起转译、顺手剥掉 TS 语法
 *     ⇒ 单测全绿，只有真 Node 解析/加载才炸。
 *   结果是 2026-11-14 提交 `8ee23230` 在
 *   `src/ai-engine/roles/vue3-engineer.js:1889` 写下 `stripped: [] as any[]`，
 *   直到 2026-11-16 首个 target=vue3 任务（`mv-max-1794794258530-a9054482`）
 *   才以 46ms 崩 `SyntaxError: Unexpected identifier 'as'` 的形式暴露。
 *
 * 判据（与运行时同一解析器，单一来源）：
 *   对每个 `src/**\/*.js`（排除 `*.spec.js` 与 `__tests__/`）依次执行
 *     `node --input-type=module  --check`
 *     `node --input-type=commonjs --check`   ← 仅当 ESM 失败时才跑
 *   **两者都不可解析才 FAIL**（双向判据，方案 A）。
 *   —— 无基线、无豁免：语法错误不可能「历史遗留」，一律硬失败。
 *
 *   为什么必须双向（与运行时语义同源，2026-11-16 误伤评审）：
 *     - `package.json` 无 `type` 字段 ⇒ 运行时 `.js` **默认按 CJS 解析**；
 *       Node v22 起启用 module syntax detection，CJS 解析失败才回退 ESM
 *       ⇒ 运行时真语义 =「CJS 优先 / ESM 回退」，是**双向**的。
 *     - 只跑 ESM 会**过严**：`with(...){}`、八进制字面量 `010`、重复形参
 *       `function f(a,a){}` 在 ESM（含严格模式）下解析失败，但作为 CJS 完全合法、
 *       运行时 `require()` 正常工作 ⇒ 会被误杀。
 *     - 双向后：上述形态 PASS（不误伤），`as any` 这类 TS 语法在两种模式下**都**失败
 *       ⇒ 仍被拦住，且与 `SyntaxError: Unexpected identifier 'as'` 真机症状一致。
 *   成本：仅当 ESM 解析失败时才多一次 spawn；当前 0 失败路径 ⇒ 零额外耗时。
 *
 *   （必须走 stdin：`--input-type` 仅对 stdin/`--eval` 生效；直接传文件路径时
 *     Node 按扩展名/package.json 推断为 CJS，会把合法 ESM 全判成假阳性。）
 *
 * 扫描根（--root，2026-11-16 连带①：判据锚在「运行面」而非仅「源面」）：
 *   `nest-cli.json` 的 assets `include:"**\/*.js"` 与本源面 `collectFiles()` 是**两套独立口径**，
 *   tsc 产物（`.ts → .js`，327 个）更是完全不进源面扫描；只扫 src 会出现
 *       「源 PASS ≠ 运行面（dist）PASS」
 *   —— 与 2026-11-16 的 46ms 崩溃同款盲区（源文件通过、真正被 require 的那份崩）。
 *   故 build 脚本在 `nest build` 之后追加一次 `--root=dist` 二次把关：
 *     源面：node scripts/check-assets-parsable.mjs                 # 默认 --root=src
 *     运行面：node scripts/check-assets-parsable.mjs --root=dist
 *   ⚠️ 扫描根不存在时**必须 FAIL**（不能以「0 文件通过」假绿）。
 *   ⚠️ 传了 `--root` 但**值为空**（`--root=` / 裸 `--root`）时**必须 FAIL** ——
 *      典型来源是 `--root=$DIR` 而变量为空，静默退化为 src 会造成
 *      「以为验了 dist、实际扫 src」的**假绿**（2026-11-16 自审缺口 b 修复）。
 *      只有**完全不传** `--root` 才使用缺省 src（与旧版逐字等价）。
 *
 * 用法：
 *   node scripts/check-assets-parsable.mjs [--root=src|dist|<dir>]
 *
 * 🔒 2026-11-16 自审缺口 (c) 收口 —— 不可读目录/文件**不得落裸栈、也不得静默跳过**：
 *   原实现 `collectFiles` 直接 `fs.readdirSync` 且无 try/catch ⇒ 扫到无权限目录（实测
 *   `--root=/etc` 撞上 `/etc/cups/certs`）就抛未捕获 `EACCES`，输出 8 行裸栈 + `Node.js v22.22.2`
 *   尾巴 —— 门禁变成「看不懂的崩溃」，既拿不到判据也看不出扫到哪。
 *   但**只加 try/catch 吞掉会更糟**：读不到的目录＝内容未知，跳过它再报「0 个不可解析」就是
 *   **假绿**（正是本仓反复栽的那类坑）。故现取「可读诊断 + fail-closed」：
 *     · `readdirSync` / `readFileSync` / `statSync` 失败一律记入 `unreadable[]`（含 code + 路径）；
 *     · 收尾把清单打印成人读形态（不落裸栈），并 **EXIT 1** —— 扫描不完整就等于没验。
 *   正常路径（`--root=src` / `--root=dist`，均在仓内）永不触发该分支，默认输出串逐字未变。
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = 8;
const INPUT_TYPES = ['module', 'commonjs']; // 双向判据：CJS 优先 / ESM 回退，双失败才 FAIL

// 扫描根可参数化：src（源面，默认）/ dist（运行面，build 后二次把关）/ 任意目录
const args = process.argv.slice(2);
// ⚠️ 「不传 --root」与「传了 --root 但值为空」必须区分（2026-11-16 自审缺口 b，fail-closed）：
//   前者 = 缺省 src（保持旧行为）；后者 = 调用方错误（典型 `--root=$DIR` 而变量为空），
//   若静默退化为 src，就会出现「以为验了 dist、实际扫 src」的**假绿** —— 直接判失败。
const rootFlags = args.filter((a) => a === '--root' || a.startsWith('--root='));
let rootArg = 'src';
// (b-1) 2026-11-16：重复 `--root` 一律 EXIT 1 —— 原取 `find` 首个 ⇒ `--root=src --root=` 时空值被
//   静默忽略、`--root=$DIR --root=dist`（$DIR 为空时拼接产物）会扫 dist 而调用方以为验了 $DIR。
//   多个值 = 调用方意图不明，fail-closed 而非猜一个。
if (rootFlags.length > 1) {
  console.error(`[assets-parsable] --root 重复出现 ${rootFlags.length} 次（${rootFlags.map((f) => JSON.stringify(f)).join(' ')}）—— 拒绝静默取首个。`);
  console.error('                 多个扫描根 = 调用方意图不明（典型：`--root=$DIR` 变量为空又拼了第二个）。请只传一个 --root。');
  process.exit(1);
}
const rootFlag = rootFlags[0];
if (rootFlag) {
  rootArg = rootFlag.startsWith('--root=') ? rootFlag.slice('--root='.length) : '';
  if (!rootArg.trim()) {
    console.error(`[assets-parsable] --root 传了空值（${JSON.stringify(rootFlag)}）—— 拒绝静默退化为默认 src。`);
    console.error('                 空值多由 `--root=$VAR` 变量为空导致，会变成「以为验了 dist、实际扫 src」的假绿。');
    console.error('                 请显式给值：--root=dist（运行面）或 --root=src（源面）。');
    process.exit(1);
  }
}
// 归一化：去掉尾部斜杠与 `./` 前缀，避免 --root=dist/ / --root=./dist / --root=dist 产生多种输出串
rootArg = rootArg.replace(/^\.\/+/, '').replace(/\/+$/, '') || rootArg;
const SCAN_ROOT = path.resolve(ROOT, rootArg);

// (c) 读不到的目录/文件＝内容未知 ⇒ 记录并最终 fail-closed（既不落裸栈，也不静默跳过）
const unreadable = []; // { p, code, message }
function noteUnreadable(p, e) {
  unreadable.push({ p, code: (e && e.code) || 'ERR', message: (e && e.message) || String(e) });
}

function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    noteUnreadable(dir, e);
    return out;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectFiles(p, out);
    } else if (entry.name.endsWith('.js') && !entry.name.includes('.spec.')) {
      out.push(p);
    }
  }
  return out;
}

/** 单种 input-type 的 --check；resolve { ok, detail } */
function checkWith(source, inputType) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`--input-type=${inputType}`, '--check'], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (e) => done({ ok: false, detail: String(e.message) }));
    child.on('close', (code) => {
      if (code === 0) return done({ ok: true });
      const first = stderr.split('\n').find((l) => /SyntaxError|Error:/.test(l)) || stderr.trim().split('\n')[0] || `exit ${code}`;
      done({ ok: false, detail: first.trim() });
    });
    child.stdin.on('error', () => {});
    child.stdin.write(source);
    child.stdin.end();
  });
}

/** 双向：任一 input-type 可解析即 PASS；全失败才 FAIL */
async function checkOne(abs) {
  let source;
  try {
    source = fs.readFileSync(abs);
  } catch (e) {
    noteUnreadable(abs, e); // (c) 读不到 ⇒ 记入清单，收尾 fail-closed（不是 PASS）
    return null;
  }
  const results = [];
  for (const t of INPUT_TYPES) {
    const r = await checkWith(source, t);
    if (r.ok) return null;
    results.push({ t, detail: r.detail });
  }
  const head = results[0]; // ESM 首诊报错更贴「TS 语法漏进」语境
  return {
    file: abs,
    detail: `${head.detail}（--input-type=${head.t} 失败；--input-type=commonjs 亦失败）`,
  };
}

let _rootIsDir = false;
let _rootErr = null;
try {
  _rootIsDir = fs.statSync(SCAN_ROOT).isDirectory();
} catch (e) {
  _rootErr = e; // (c) 不存在 / 无权限都不许落裸栈
}
if (!_rootIsDir) {
  console.error(`[assets-parsable] 扫描根不存在或不是目录：${SCAN_ROOT}（--root=${rootArg}）${_rootErr ? `—— ${_rootErr.code || 'ERR'} ${_rootErr.message}` : ''}`);
  console.error('                 拒绝以「0 文件通过」的形式假绿 —— 直接判失败。');
  process.exit(1);
}

const files = collectFiles(SCAN_ROOT).sort();
const failures = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
    while (cursor < files.length) {
      const abs = files[cursor++];
      const r = await checkOne(abs);
      if (r) failures.push(r);
    }
  }),
);

failures.sort((a, b) => a.file.localeCompare(b.file));
console.log(
  `[assets-parsable] 扫描 ${files.length} 个 ${rootArg}/**/*.js（node --check：module→commonjs 双向，双失败才算）/ 不可解析 ${failures.length} 个`,
);
for (const f of failures) {
  console.error(`  🔴 ${path.relative(ROOT, f.file).split(path.sep).join('/')}: ${f.detail}`);
}
if (failures.length) {
  console.error('[assets-parsable] .js 资产在 ESM/CJS 两种解析模式下均无法解析（常见：TS 语法漏进 .js）。');
  console.error('                 这些文件经 nest assets 逐字进 dist，加载即 SyntaxError，必须修掉。');
}
// (c) 不可读项：内容未知 ⇒ 扫描不完整，直接判失败（不静默跳过＝不假绿），且给可读诊断而非裸栈
// 路径显示：仓内用相对路径，仓外（--root 指到别处时）用绝对路径 —— 避免 `../../../../../etc/...` 这种不可读形态
function showPath(p) {
  const rel = path.relative(ROOT, p).split(path.sep).join('/');
  return rel.startsWith('..') ? p : rel;
}
if (unreadable.length) {
  console.error(`[assets-parsable] 有 ${unreadable.length} 处无法读取 —— 扫描不完整，等同于未验证，判失败：`);
  for (const u of unreadable.slice(0, 20)) {
    console.error(`  🔴 ${showPath(u.p)}  [${u.code}] ${u.message}`);
  }
  if (unreadable.length > 20) console.error(`  … 另有 ${unreadable.length - 20} 处同类问题未列出`);
  console.error('                 处置：确认 --root 指向仓内目录（src / dist），或补齐读权限后重跑。');
  console.error('                 跳过读不到的目录再报「通过」会变成假绿，故此处不提供跳过开关。');
}
process.exit(failures.length || unreadable.length ? 1 : 0);
