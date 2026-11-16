#!/usr/bin/env node
/**
 * G03 卫生门禁：拦截 .js 资产文件里「新增的」未声明标识符。
 *
 * 背景：nest-cli.json 的 assets 把 src/**\/*.js 直接复制进 dist，这些文件不进 tsc，
 * 也不被 `npm run lint`（只扫 *.ts）覆盖。2026-11-13 的 `cs is not defined`
 * 就是这样溜进生产并让 5 个生成任务 100% 崩溃的。
 *
 * 为什么不再用「一删到底的严格模式」，也不是旧「全量基线」（2026-11-16 连带② 重构）：
 *   原 `no-undef-baseline.json` 把两类性质完全不同的东西混在同一本账里一起放行：
 *     ① 运行时注入的**合法全局**（custom-components 产物里的 $createMcDeclare / $mcCssBuilder）；
 *     ② **真 ReferenceError**（base-agent.js 裸 logger ×3、microcode-engineer.js
 *        跨方法引用的 workingManifest ×2）—— 逐条定位（文件:行 + blame）后确认是真错，不是误报。
 *   现拆开成三条：
 *     · 合法全局 → MC_HOST_INJECTED_GLOBALS，按 files 作用域**限定**登记（不占账本）；
 *     · 真错     → known-undef-real-bugs.json 单独登记（只许减少、不许新增）；
 *     · 其余任何 no-undef → 一律 FAIL（含「已登记真错数量增加」）。
 *   真错全部修完后，known-undef-real-bugs.json 清空即成「无基线严格模式」。
 *
 * 清单当前内容：**空**（0 文件 / 0 处）—— 2026-11-16 11:5x 已把原 5 处真错全部修掉（属独立一轮，动引擎业务逻辑）：
 *   src/ai-engine/agents/base-agent.js          logger ×3（L298/308/315）→ 改为 `this.logger`
 *                                               （「裸 logger?.info?.()」可选链防不住「变量未声明」，走任务暂停路径必抛；
 *                                                类内 L54 早已有 this.logger = createLogger(...)）
 *   src/ai-engine/roles/microcode-engineer.js   workingManifest ×2（L10714/10717）→ 删除越界 fallback
 *                                               （原引用只在 generateCode 作用域内声明的 const，_executeCore 里跨方法未声明；
 *                                                唯一合法源 = codeResult?.workingManifest，generateCode L5119 已返回）
 *   故本账本现为空 ⇒ 已进入「**无基线严格模式**」：任何 no-undef 都直接 FAIL（含新增/增加）。
 *
 * 用法：
 *   node scripts/check-assets-no-undef.mjs                     # 构建门禁默认模式
 *   node scripts/check-assets-no-undef.mjs --write-known-bugs  # 只许「减少」（把已修复项移出清单）
 *   node scripts/check-assets-no-undef.mjs --write-known-bugs --add=<相对路径>:<标识符>
 *                                                              # 显式登记「一条」本次扫描确认真存在的真错
 *   cat old.js | node scripts/check-assets-no-undef.mjs --stdin --as=src/ai-engine/roles/microcode-engineer.js
 *
 * ⚠️ `--write-known-bugs` 是 **merge-only（只许减少）**（2026-11-16 自审缺口 a 修复）：
 *   它只能「把已修复项移出清单」，**不可能**写入新条目 —— 相对旧账本出现【新增/增加】即
 *   拒绝写入并 EXIT 1（防「洗白后门」：旧实现是 `current` 整表覆写，实测既能抹掉已登记
 *   真错、也能把全新违规吸收进账）。
 *
 * 🔒 2026-11-16 自审缺口 (g)(a′) 收口 —— **写入通道收窄为「只减 + 单条显式增」**：
 *   · (g) `--force` **整表重建已拆除**。它就是原后门本体（无条件 `next = current`，
 *     无二次确认 / 双因子 / 审计 ⇒ 一键抹掉已登记真错、一键吸收全新违规，实测四步洗白闭环）。
 *     现传 `--force` 一律 **EXIT 1** 并提示改用 `--add`，不留「看起来还支持」的假象。
 *   · 替代品 `--add=<相对路径>:<标识符>`：**必须**与 `--write-known-bugs` 同用；每条都要
 *     **在本次扫描结果中真实存在**（否则 EXIT 1，防登记不存在的东西）；只放行你显式列出的那几条，
 *     其余未登记新增照旧拒绝。计数取**扫描现值**，不采信命令行里写的数字。
 *   · (a′) `--stdin` 与 `--write-known-bugs` **互斥 EXIT 1**：stdin 的扫描结果完全由管道内容
 *     决定，可伪造真值剪掉已登记项（实测能把 `logger ×3` 剪成「✅ 已修复并移出清单」）。
 *     写入许可必须基于可复现的磁盘真值 ⇒ 要写入就别用 `--stdin`。
 *
 * 🔒 2026-11-16 12:x 自审缺口 (h)(i) 收口 —— 写入「可见性」与「持久化」各一处：
 *   · (h) **减少项不再被连带静默丢弃**。原实现 `dropped` 的计算/打印排在
 *     `if (unauthorized.length) { … exit(1) }` **之后** ⇒ 「减少与新增共存」时，本次已消失的项
 *     **只字不提**（想记录减少只剩 `--force`＝已拆除的洗白后门，属负激励）。现 `merged`/`next`/
 *     `dropped` 计算**提前到拒写判断之前**（纯函数重排，无副作用），拒写时仍打印
 *     `🟡 已消失但未落账` 明细 + 处理顺序。⚠️ 「新增存在即整体拒写」的 fail-closed 语义**未放宽**。
 *   · (i) **账本写盘改原子 + 读盘 fail-closed**。原 `fs.writeFileSync(KNOWN_BUGS, …)` 直写，
 *     中途失败/进程被杀会留半截 JSON，而读侧 `JSON.parse` 裸调 ⇒ 未捕获 `SyntaxError` 栈、
 *     门禁永久不可用需人工恢复；更糟的是若把它当「无账本」退化为 `{}`，在「当前无违例」时会**假绿**。
 *     现写入 = `tmp<pid>` 写入 + `fsync` + `rename`（失败则回滚删 tmp、原账本零改动、EXIT 1）；
 *     读取 = `try/catch` + 顶层类型校验，损坏即 **EXIT 1 并给恢复指引**（不静默重置）。
 *
 * 🔒 2026-11-16 自审缺口 (j)(e) 收口 —— 扫描面与汇总口径各一处：
 *   · (j-1) `collectFiles` 递归**不排 `node_modules`**。原先只有「文件名后缀 + `.spec.` + `__tests__`」
 *     三条过滤，`src/**\/node_modules` 一旦出现（子包/误装）就会把第三方 .js 全部拉进 no-undef 扫描
 *     ⇒ 既可能整屏假阳性，也可能因第三方代码里合法的宿主全局把门禁拖到不可用。现递归层直接跳过
 *     `node_modules` / `dist` / `.git` / `__tests__`（与 check-assets-parsable.mjs 同源口径）。
 *   · (j-2) `collectFiles(SRC)` 被**调用两次**（`scan()` 内一次、`summary.checked` 一次）⇒ 同一棵树
 *     走两遍。现清单只算一次并复用（`listSrcFiles()`），`checked` 取值不变。
 *   · (j-3) `--write-baseline` **旧别名拆除**。它名字对应的是「整表覆写基线」的旧语义，而 (g) 之后
 *     实际指向的是 merge-only 账本写入 ⇒ 同一参数名在不同版本有两种语义，本身就是审计陷阱。
 *     与 `--force` 同规格处理：出现即 **EXIT 1** 并指向 `--write-known-bugs`，不留「看起来还支持」的假象。
 *   · (e) `summary.newViolations` **删除**。它统计的是「当前全部 no-undef 处数」，名字却叫 new，
 *     且从未被打印/消费 ⇒ 死字段 + 误导（后来者会以为门禁已有「新增总数」指标）。真要看总数，
 *     须显式新增并同轮重定输出串锚，不在本次顺手夹带。
 */
import { ESLint } from 'eslint';
import globals from 'globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
// 2026-11-16 连带②：`no-undef-baseline.json`（原「历史违规登记簿」）已退役 ——
// 它把「运行时注入的合法全局」与「真 ReferenceError」混在同一本账里一起放行。
// 现拆成两半：
//   ① 合法全局 → MC_HOST_INJECTED_GLOBALS，按 files 作用域限定登记（不占任何账本）；
//   ② 真错     → known-undef-real-bugs.json 单独登记（只许减少、不许新增）。
const KNOWN_BUGS = path.join(ROOT, 'scripts', 'known-undef-real-bugs.json');
// 微码宿主注入全局：loadVue3Runtime 从 common.js 注入 globalThis 的 $ 前缀函数。
// 名单与 src/ai-engine/utils/sfc-semantics.js:78-79 同源，勿各自维护。
const MC_HOST_INJECTED_GLOBALS = [
  '$mcComponentBuilder', 'mcComponentBuilder', '$createMcDeclare', '$runtimeBuilder',
  '$mcCssBuilder', '$getMcDefaultConfig', '$mcDeclare',
];
const args = process.argv.slice(2);
const writeBaseline = args.includes('--write-known-bugs'); // 写入只有这一个开关（(j-3)：旧别名 --write-baseline 已拆除）
const stdinMode = args.includes('--stdin');
const asPath = (args.find((a) => a.startsWith('--as=')) || '').slice(5);

// (j-3) `--write-baseline` 旧别名拆除：名字对应「整表覆写基线」的旧语义，实际已指向 merge-only 账本写入。
//   与 `--force` 同规格 —— 直接 EXIT 1，而非静默按新语义执行（同一参数两种语义＝审计陷阱）。
if (args.includes('--write-baseline')) {
  console.error('[assets-no-undef] `--write-baseline` 旧别名已拆除 —— 它对应「整表覆写基线」的旧语义，而当前写入是 merge-only（只许减少）。');
  console.error('                 请改用 `--write-known-bugs`（把已修复项移出清单）；要登记单条真错再加 `--add=<相对路径>:<标识符>`。');
  process.exit(1);
}

// ── 写入许可的三道前置守卫（2026-11-16 自审缺口 (g)(a′)，全部在扫描前短路）──
// (g) `--force` 整表重建 = 原洗白后门本体，已拆除。一律拒绝（而非静默退化为 merge-only），
//     避免同一参数在不同版本上有两种语义 —— 那本身就是审计陷阱。
if (args.includes('--force')) {
  console.error('[assets-no-undef] `--force` 已拆除 —— 它＝原洗白后门本体（无条件整表重建，可一键抹掉已登记真错、亦可一键吸收全新违规）。');
  console.error('                 要登记「确属真错但本轮不修」的项 → 用 `--write-known-bugs --add=<相对路径>:<标识符>` 单条显式登记。');
  process.exit(1);
}
// (a′) stdin 的扫描结果完全由管道内容决定，不是磁盘真值 ⇒ 不得作为写入依据
//      （否则可用伪造内容剪掉已登记项，实测能把 `logger ×3` 剪成「✅ 已修复并移出清单」）。
if (stdinMode && writeBaseline) {
  console.error('[assets-no-undef] `--stdin` 与 `--write-known-bugs` 互斥：stdin 的内容不是磁盘真值，不能作为写入依据。');
  console.error('                 只读检查 → 去掉 `--write-known-bugs`；需要写入 → 去掉 `--stdin`（改走磁盘扫描）。');
  process.exit(1);
}
// `--add=<相对路径>:<标识符>`：单条显式登记。写入开关仍只有 `--write-known-bugs` 一个，不设第二条写入路径。
const addSpecs = args.filter((a) => a.startsWith('--add=')).map((a) => a.slice(6));
if (addSpecs.length && !writeBaseline) {
  console.error('[assets-no-undef] `--add` 必须与 `--write-known-bugs` 同用（写入只有这一个开关，不设第二条写入路径）。');
  process.exit(1);
}
const addTargets = [];
for (const spec of addSpecs) {
  const i = spec.lastIndexOf(':');
  const file = i > 0 ? spec.slice(0, i).trim() : '';
  const name = i > 0 ? spec.slice(i + 1).trim() : '';
  if (!file || !name) {
    console.error(`[assets-no-undef] \`--add=${spec}\` 格式错误，应为 \`--add=<相对路径>:<标识符>\`（例：--add=src/ai-engine/agents/base-agent.js:logger）。`);
    process.exit(1);
  }
  addTargets.push({ file, name });
}

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
    {
      // 作用域**限定**白名单：仅微码组件产物内的 $ 前缀 DSL 全局视为合法。
      // 限定 files（而非全局登记）可避免把别处拼错的同名标识符一并放行。
      files: ['src/workspace/custom-components/**/*.js'],
      languageOptions: {
        globals: Object.fromEntries(MC_HOST_INJECTED_GLOBALS.map((n) => [n, 'readonly'])),
      },
    },
  ],
});

// (j-1) 递归层排除目录：与 check-assets-parsable.mjs 同源口径。
//   原先只靠「文件名后缀 + .spec. + 路径含 __tests__」三条过滤，`src/**/node_modules` 一旦出现
//   （子包/误装）就会把第三方 .js 全拉进扫描 —— 整屏假阳性，或因第三方合法的宿主全局把门禁拖到不可用。
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__tests__']);
function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(p, out);
    } else if (entry.name.endsWith('.js') && !entry.name.includes('.spec.') && !p.includes('__tests__')) {
      out.push(p);
    }
  }
  return out;
}

// (j-2) 清单只算一次：原实现 `scan()` 与 `summary.checked` 各调一次 collectFiles(SRC) ⇒ 同一棵树走两遍。
let _srcFiles = null;
function listSrcFiles() {
  if (_srcFiles === null) _srcFiles = collectFiles(SRC);
  return _srcFiles;
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
  for (const abs of listSrcFiles()) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const counts = await fingerprint(rel, fs.readFileSync(abs, 'utf8'));
    if (Object.keys(counts).length) out[rel] = counts;
  }
  return out;
}

// ── 账本持久化（2026-11-16 自审缺口 (i) 收口）──────────────────────────────────
// 读：损坏 ⇒ fail-closed EXIT 1（**绝不**静默退化为 `{}` —— 当前无违例时那会变成假绿）。
function readKnownBugs() {
  if (!fs.existsSync(KNOWN_BUGS)) return {}; // 首次运行 / 从未登记：空账本等价于严格模式
  const raw = fs.readFileSync(KNOWN_BUGS, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`[assets-no-undef] 账本 ${path.relative(ROOT, KNOWN_BUGS)} 解析失败（${e.message}）—— 拒绝据此判定，fail-closed。`);
    console.error(`                 文件 ${raw.length} 字节；典型成因是被截断/半截写入。`);
    console.error('                 处置：人工修成合法 JSON（无登记项时内容写 `{}`），或用 git 回滚该文件后再跑。');
    process.exit(1);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`[assets-no-undef] 账本 ${path.relative(ROOT, KNOWN_BUGS)} 顶层不是对象（实为 ${Array.isArray(parsed) ? 'array' : typeof parsed}）—— fail-closed。`);
    console.error('                 期望形态：{"src/路径.js":{"标识符":次数}}。');
    process.exit(1);
  }
  return parsed;
}

// 写：tmp + fsync + rename 原子替换。失败即回滚（删 tmp）、原账本零改动、EXIT 1。
// 不保留「降级为直写」的兜底 —— 那等于把半截文件这个缺口重新装回去。
function writeKnownBugsAtomic(obj) {
  const data = JSON.stringify(obj, null, 2) + '\n';
  const tmp = `${KNOWN_BUGS}.tmp-${process.pid}`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd); // 先确保落盘，再 rename —— 否则崩溃可能留下「名字已换、内容半截」的账本
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, KNOWN_BUGS);
  } catch (e) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* 关不上也不该掩盖原始错误 */ }
    }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* tmp 清理失败不改变结论 */ }
    console.error(`[assets-no-undef] 账本写入失败（${e.message}）—— 已放弃本次写入，原账本未被改动。`);
    console.error(`                 临时文件 ${path.basename(tmp)} 已清理；请检查 scripts/ 目录可写与磁盘空间。`);
    process.exit(1);
  }
}

const current = await scan();
const known = readKnownBugs();

// 相对旧账本的「新增 / 增加」项 —— 清单语义是「已登记真错」，只许减少不许新增。
// 2026-11-16 自审缺口 a：原实现用 `current` **整体覆写**清单，无 merge、无二次确认 ⇒
// 既是「抹掉已登记真错」的后门，也是「把全新违规洗白进账」的后门（已实证）。
const countOf = (counts) => Object.values(counts || {}).reduce((a, b) => a + b, 0);
const additions = []; // { file, name, desc }
for (const [file, counts] of Object.entries(current)) {
  const base = known[file] || {};
  for (const [name, n] of Object.entries(counts)) {
    if (!base[name]) additions.push({ file, name, desc: `${file}: '${name}' ×${n}（未登记的新文件/新标识符）` });
    else if (n > base[name]) additions.push({ file, name, desc: `${file}: '${name}' ${base[name]} → ${n}（已登记真错数增加）` });
  }
}

// `--add` 的存在性校验：必须**本次扫描真实存在**，否则拒绝 —— 防「登记不存在的东西」占位洗白。
const authorizedAdds = [];
for (const t of addTargets) {
  const cur = current[t.file];
  if (!cur || !cur[t.name]) {
    console.error(`[assets-no-undef] \`--add=${t.file}:${t.name}\` 被拒：本次扫描未在该文件发现该未声明标识符（只能登记扫描确认真存在的项）。`);
    console.error(cur ? `                 该文件本次扫描到：${Object.keys(cur).join(', ') || '（无）'}` : '                 该文件本次扫描无任何 no-undef 命中（或路径不存在）。');
    process.exit(1);
  }
  // `--add` 的语义严格限定为「授权一条【新增/增加】」；已在册且计数未变的项无需登记，
  // 报错而非静默通过 —— 否则输出会打印「➕ 显式登记」而实际什么都没变，属误导。
  if (!additions.some((a) => a.file === t.file && a.name === t.name)) {
    console.error(`[assets-no-undef] \`--add=${t.file}:${t.name}\` 被拒：该项相对现有清单**没有**新增/增加（已在册且计数未变），无需显式登记。`);
    process.exit(1);
  }
  if (!authorizedAdds.some((a) => a.file === t.file && a.name === t.name)) authorizedAdds.push({ file: t.file, name: t.name });
}
const isAuthorized = (a) => authorizedAdds.some((t) => t.file === a.file && t.name === a.name);
// 未被 `--add` 显式授权的【新增/增加】项 —— 仍然一律拒绝写入。
const unauthorized = additions.filter((a) => !isAuthorized(a));

if (writeBaseline) {
  // merge-only：以旧账本为基准取交集（值取现值）⇒ 只能「删项/减数」，不可能凭空多出条目。
  const merged = {};
  for (const [file, counts] of Object.entries(known)) {
    // stdin 只扫描了 --as= 这一个文件，其余登记项**原样保留**（否则会被误判为「已修复」而剪掉）。
    // 注：(a′) 守卫后 `--stdin` 已不可能走到写入分支；此分支保留作防御性兜底，不删（避免扩大改动面）。
    if (stdinMode && file !== asPath) {
      merged[file] = counts;
      continue;
    }
    const cur = current[file] || {};
    for (const [name] of Object.entries(counts)) {
      if (cur[name]) merged[file] = { ...(merged[file] || {}), [name]: cur[name] };
    }
  }
  // `--add` 显式授权的项再逐条并入；计数取**扫描现值**，不采信命令行里写的数字。
  const next = merged;
  for (const t of authorizedAdds) {
    next[t.file] = { ...(next[t.file] || {}), [t.name]: current[t.file][t.name] };
  }
  // (h) 2026-11-16 收口：`dropped` 必须**早于**拒写判断计算 —— 原实现排在 `exit(1)` 之后，
  // 使「减少与新增共存」时已消失项被静默丢弃（负激励：想记录减少只剩已拆除的 `--force`）。
  // 此处只是纯函数重排（`merged`/`next`/`dropped` 均无副作用），不改变任何写入许可语义。
  const dropped = [];
  for (const [file, counts] of Object.entries(known)) {
    for (const [name, n] of Object.entries(counts)) {
      if (!next[file] || !next[file][name]) dropped.push(`${file}: '${name}' ×${n}`);
    }
  }

  // (g) `--force` 已在参数层拆除（直接 EXIT 1）⇒ 写入结果**恒**为 merge-only（只减 + `--add` 显式增）。
  // 未被 `--add` 逐条授权的【新增/增加】仍一律拒绝 —— 这是「不可为」而非「多打一个词」。
  if (unauthorized.length) {
    console.error(`[assets-no-undef] 拒绝写入清单：本次扫描相对现有清单出现 ${unauthorized.length} 项【新增/增加】（未用 --add 显式登记）。`);
    console.error('                 清单语义＝「已登记真错」，只许减少、不许新增 —— 防洗白后门，故直接判失败。');
    for (const a of unauthorized) console.error(`  🔴 ${a.desc}`);
    console.error('                 合法注入全局 → 进本脚本 MC_HOST_INJECTED_GLOBALS 白名单（按 files 作用域限定）；');
    console.error('                 真错       → 直接修掉，不要登记。');
    console.error('                 确属真错但本轮不修 → `--write-known-bugs --add=<相对路径>:<标识符>` 单条显式登记（提交信息里说明理由）。');
    // (h) 减少项必须可见：整体拒写不等于「什么都没发生」，否则修好的人拿不到任何正反馈。
    if (dropped.length) {
      console.error(`                 另：本次扫描发现 ${dropped.length} 项已消失（＝已修复），但**因上述【新增/增加】被整体拒写，本次未落账**：`);
      for (const d of dropped) console.error(`  🟡 已消失但未落账: ${d}`);
      console.error('                 处理顺序：先修掉（或 `--add` 显式授权）上方新增/增加项 → 再重跑一次 `--write-known-bugs`，减少项即一并收账。');
    }
    process.exit(1);
  }
  writeKnownBugsAtomic(next);
  const total = Object.values(next).reduce((n, c) => n + countOf(c), 0);
  const addNote = authorizedAdds.length ? `；--add 显式登记 ${authorizedAdds.length} 条` : '';
  console.log(`[assets-no-undef] 已知真错清单已更新 ${path.relative(ROOT, KNOWN_BUGS)}：${Object.keys(next).length} 文件 / ${total} 处（merge-only：只许减少${addNote}）`);
  console.log('                 ⚠️ 只登记「确属运行时 ReferenceError 但本轮未修」的项；合法注入全局请进脚本白名单。');
  for (const [f, c] of Object.entries(next)) console.log(`  ${f}: ${JSON.stringify(c)}`);
  for (const t of authorizedAdds) console.log(`  ➕ 显式登记: ${t.file}: '${t.name}' ×${current[t.file][t.name]}`);
  if (dropped.length) for (const d of dropped) console.log(`  ✅ 已修复并移出清单: ${d}`);
  if (!dropped.length && !authorizedAdds.length) console.log('  （清单无变化）');
  process.exit(0);
}

const regressions = []; // 未登记的新增 → FAIL
const pending = []; // 已登记真错仍存在 → 🟡 打印，不阻断（待修）
const resolved = []; // 减少 / 消失 → ✅ 打印
for (const [file, counts] of Object.entries(current)) {
  const base = known[file] || {};
  for (const [name, n] of Object.entries(counts)) {
    if (!base[name]) regressions.push(`${file}: 新增未声明标识符 '${name}' ×${n}`);
    else if (n > base[name]) regressions.push(`${file}: '${name}' ${base[name]} → ${n}（已登记真错数增加）`);
  }
}
for (const [file, counts] of Object.entries(known)) {
  if (stdinMode && file !== asPath) continue; // stdin 只对比单文件，勿把未扫描的登记项误判为已修复
  const cur = current[file] || {};
  for (const [name, n] of Object.entries(counts)) {
    if (!cur[name]) resolved.push(`${file}: '${name}' ×${n} 已修复 → 请从 known-undef-real-bugs.json 移除`);
    else if (cur[name] < n) resolved.push(`${file}: '${name}' ${n} → ${cur[name]}`);
    else pending.push(`${file}: '${name}' ×${n}`);
  }
}

const summary = {
  checked: stdinMode ? 1 : listSrcFiles().length,
  // (e) 原 `newViolations` 已删除：它统计的是「当前全部 no-undef 处数」，名字叫 new、且从未被打印/消费。
  regressions,
  pending,
  resolved,
};
console.log(
  `[assets-no-undef] 扫描 ${summary.checked} 文件 / 未登记新增 ${regressions.length} 条 / 已知真错待修 ${pending.length} 项 / 已修复 ${resolved.length} 条`,
);
for (const r of resolved) console.log(`  ✅ ${r}`);
for (const r of pending) console.log(`  🟡 已知真错待修（见 scripts/known-undef-real-bugs.json）: ${r}`);
for (const r of regressions) console.error(`  🔴 ${r}`);
if (regressions.length) {
  console.error('[assets-no-undef] 出现「未登记」的未声明标识符 —— 必须处置，不得静默放行：');
  console.error('                 · 合法注入全局 → 加进本脚本 globals 白名单（按 files 作用域限定）');
  console.error('                 · 真错       → 直接修掉（禁止写进 known-undef-real-bugs.json 洗白）');
}
process.exit(regressions.length ? 1 : 0);
