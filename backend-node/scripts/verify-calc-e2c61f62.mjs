/**
 * 🛡️ mc-max-1792739994368-e2c61f62（设备列表 · 最终 LESS 编译门禁阻断）根治验收探针
 *    （2026-10-23）
 *
 * ## 病灶
 * 生成失败信息：`最终 LESS 编译门禁阻断: resources/styles/common.less:201:3
 * Operation on an invalid type`。
 *
 * chunk 13（LLM 原文）里 `.c-device-card-grid-value` 是**正确形态**
 *   `font-size: calc(@fontSize * 1.7143);`
 * 落盘后 common.less:201 却变成畸形
 *   `font-size: calc(@fontSize) * 1.7143;`
 * ⇒ LESS 门禁拒绝 ⇒ 整任务失败（半成品保留）。
 *
 * ## 根因（两层叠加，本单真机 server.log + 离线重放双实证）
 * ① 源头 `code-healer#healThemeMixinVarRefs`：M5-6 归一后 mixin 内 `@fontSize` 的 def 是
 *    `var(--fontSize)` 透传形态，旧实现把它**原样塞进 fallback**
 *    ⇒ 产出 `var(--fontSize, var(--fontSize))` **自引用双写**；
 * ② 防线 `theme-color-guard#healBusinessStyleVarsInCss`：VAR_RE 的懒匹配 `[^)]+?` 不排 `(`，
 *    遇嵌套 var 时吞掉内层 var 左半、闭括号配到**内层** `)`
 *    ⇒ 替换后**丢一个括号** ⇒ 残骸 `calc(@fontSize) * 1.7143);`。
 *
 * ## 治本（两刀，同批落地）
 * - 刀 A（源头，`code-healer.js#safeMixinVarFallback`）：fallback 三级取值
 *   —— 内层字面量 → 设计基准表（MIXIN_VAR_CSS_FALLBACKS，fontSize=14px）→ fail-open 跳过；
 *   **绝不**产出 `var(--x, var(--x))`。
 * - 刀 B（防线，`theme-color-guard.js#isNestedVarFallback`）：fallback 含 `var(` 时整段原样保留
 *   （fail-open），不再猜着拆括号。
 *
 * ## 断言（每条配阳性/阴性对照，可证伪；全绿才 exit 0）
 * | # | 极性 | 内容 |
 * |---|---|---|
 * | S0 | 语料自检 | chunk 13 原文必须是**正确形态**（否则本单不成立） |
 * | A1 | 阴性 | 刀 A 后 `healThemeMixinVarRefs` 产物自引用双写计数 === 0 |
 * | A2 | 阳性 | fallback 落设计基准字面量（`var(--fontSize, 14px)`） |
 * | B1 | 阴性 | 刀 B 喂 `var(--x, var(--x))` ⇒ 整段原样（零改动、不产 `calc(@x) *`） |
 * | B2 | 阳性对照 | 同函数喂**字面量** fallback `var(--fontSize, 14px)` ⇒ 照常转 `@fontSize`（保证 B1 不是恒真） |
 * | E1 | 阴性 | 全链（`.less` 写盘 heal 顺序）产物无 `calc(@x) *` 畸形 |
 * | E2 | 阳性 | 全链产物含正确形态 `calc(@fontSize * 1.7143)` 或 `calc(var(--fontSize ...` |
 * | F1 | 真机同形 | `injectThemeVarDeclsForLess` **不**给 chunk 注入 `@fontSize`（主题作用域豁免）⇒ 刀 A 必经 |
 * | F2 | 阳性 | 刀 A 在该入参下确实改写 ⇒ E 链不是在绕过刀 A 的路径上取绿 |
 * | R1 | 阳性对照 | 修前两刀（fixture）在**真机那一行**上还原出逐字一致的畸形 `calc(@fontSize) * 1.7143);` |
 * | R2 | 举证 | 修前链路非幂等（每轮多一个孤儿 `)`）⇒ 必然炸门禁 |
 * | R3 | 对照 | 修后链路同输入 ⇒ 无畸形且回到 `calc(@fontSize * 1.7143)`（差异可归因） |
 * | E3 | 真编译 | `less.render` 通过，且产物 CSS 含 `calc(var(--fontSize) * 1.7143)` |
 * | E4 | 阳性对照 | 把「修前畸形」喂 `less.render` ⇒ **必须抛错**（证明 E3 非恒真） |
 *
 * ## 语料（优先权威副本，回退交付副本）
 *   temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1792739994368-e2c61f62/.mc-gen/cache/code-chunks
 *   🔴 权威副本在 temp-components；`frontend/workspace/custom-components/` 是交付副本
 *     （package 可能被修过）⇒ 不可当验收对象。
 *
 * 用法： node scripts/verify-calc-e2c61f62.mjs
 * 只读：不改产物、不写 dist、不部署。
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const SESSION = '6a51f7caed28c5d5b13c61a5';
const TASK = 'mc-max-1792739994368-e2c61f62';
const AUTH_DIR = `/Users/smigoo/工作/mvgo/temp-components/${SESSION}/${TASK}`;
const DELIV_DIR = '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components/c-device-e2c61f62';
const BASE = '/Users/smigoo/工作/mvgo/backend-node/src/ai-engine';

const chunkPath = (dir) => `${dir}/.mc-gen/cache/code-chunks`;
const CHUNKS = existsSync(chunkPath(AUTH_DIR)) ? chunkPath(AUTH_DIR) : chunkPath(DELIV_DIR);
const IS_AUTH = CHUNKS.startsWith(AUTH_DIR);
console.log(
  `语料自检：${IS_AUTH ? '✅ 权威副本' : '⚠️ 交付副本（权威副本缺失）'} → ${CHUNKS}`,
);

const chunkCommon = readFileSync(`${CHUNKS}/13-resources_styles_common.less`, 'utf-8');
const chunkThemeRaw = readFileSync(`${CHUNKS}/12-resources_styles_themes_theme-vars.less`, 'utf-8');

// 复刻 file-writer 的 M5-6 归一（喂 heal 前 theme-vars 的 @fontSize 会被归一为 var 透传）
const themeVars = chunkThemeRaw
  .replace(/@fontSize\s*:\s*\d+(?:\.\d+)?px\s*;/g, '@fontSize: var(--fontSize);')
  .replace(/@fontSize\s*:\s*var\(--fontSize\s*,\s*[^)]+\)\s*;/g, '@fontSize: var(--fontSize);');

const noopLogger = { warn() {}, info() {}, error() {}, debug() {} };
const mod = (p) => import(`${BASE}/${p}`);

const BAD = /calc\(\s*@[\w-]+\s*\)\s*\*/; // 畸形：calc 只包变量、乘法落在括号外
const SELF_REF = /var\(\s*--[\w-]+\s*,\s*var\(/; // 自引用双写

let failed = 0;
let total = 0;
const ok = (tag, cond, detail = '') => {
  total += 1;
  console.log(`${cond ? '  ✅' : '  ❌'} ${tag}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed += 1;
};

const main = async () => {
  // ---------- 语料自检：chunk 原文必须是正确形态（否则本单不成立） ----------
  const chunkHasGood = /calc\(@fontSize \* 1\.7143\)/.test(chunkCommon);
  console.log(`\n[S0] chunk 13 原文形态`);
  ok('chunk 原文含正确形态 `calc(@fontSize * 1.7143)`', chunkHasGood);
  ok('chunk 原文无畸形 `calc(@x) *`', !BAD.test(chunkCommon));

  // ---------- 刀 A：源头不产自引用双写 ----------
  console.log(`\n[刀 A] 源头 healThemeMixinVarRefs —— fallback 三级取值`);
  const healer = await mod('roles/microcode/code-healer.js');
  const A_SRC = `.device-root {\n  font-size: calc(@fontSize * 1.7143);\n}\n`;
  const aOut = healer.healThemeMixinVarRefs(A_SRC, themeVars);
  ok('A1 阴性：自引用双写计数 === 0', !SELF_REF.test(aOut), JSON.stringify(aOut.trim()));
  ok(
    'A2 阳性：fallback 落设计基准 14px',
    aOut.includes('calc(var(--fontSize, 14px) * 1.7143)'),
    JSON.stringify(aOut.trim()),
  );

  // ---------- 刀 B：防线遇嵌套 var 整段保留 ----------
  console.log(`\n[刀 B] 防线 healBusinessStyleVarsInCss —— 嵌套 var 保守保留`);
  const guard = await mod('utils/theme-color-guard.js');
  const slotNames = guard.collectThemeSlotNames(themeVars);
  ok('前置：slotNames 含 fontSize', slotNames.has('fontSize'), `size=${slotNames.size}`);

  const bNested = '.a { font-size: calc(var(--fontSize, var(--fontSize)) * 1.7143); }';
  const bOut = guard.healBusinessStyleVarsInCss(bNested, slotNames);
  ok('B1 阴性：嵌套 var ⇒ 不产 `calc(@x) *`', !BAD.test(bOut));
  ok('B1 阴性：嵌套 var ⇒ 双写整段保留（零改动）', bOut === bNested, JSON.stringify(bOut));

  const bLiteral = '.a { font-size: calc(var(--fontSize, 14px) * 1.7143); }';
  const bOut2 = guard.healBusinessStyleVarsInCss(bLiteral, slotNames);
  ok(
    'B2 阳性对照：字面量 fallback ⇒ 照常转 @fontSize（B1 非恒真）',
    bOut2.includes('calc(@fontSize * 1.7143)'),
    JSON.stringify(bOut2),
  );

  // ---------- 端到端：.less 写盘链全顺序重放 ----------
  console.log(`\n[E] 端到端全链（.less 写盘 heal 顺序）`);
  const { sanitizeFileContent } = await mod('roles/microcode/file-writer.js');
  const { normalizeFontSizeLiterals } = await mod('utils/font-size-normalizer.js');
  const css = await mod('utils/css-sanitizer.js');
  const gate = await mod('validators/less-compile-gate.js');
  const fg = await mod('utils/folded-grid-section-takeover.js');

  let cur = sanitizeFileContent(chunkCommon, 'resources/styles/common.less', { logger: noopLogger });
  cur = normalizeFontSizeLiterals(cur).text;
  cur = css.ensureFlexDirection(cur, noopLogger, { flexDirectionDefault: 'none' });
  cur = css.ensureGridDisplay(cur, noopLogger);
  cur = css.fixInvalidCssProperties(cur, noopLogger);
  cur = gate.gateStandaloneLessWrite(cur, 'resources/styles/common.less').content;
  cur = healer.injectThemeVarDeclsForLess(cur, themeVars);
  cur = healer.healThemeMixinVarRefs(cur, themeVars);
  cur = guard.healBusinessStyleVarsInCss(cur, slotNames);
  cur = healer.healSlotHexToVarRefs(cur, themeVars);
  cur = healer.healPresetLiteralDecls(cur, 'resources/styles/common.less');
  cur = healer.healVarNameCase(cur);
  cur = healer.healLessResourceVarInterpolation(cur, 'resources/styles/common.less', {
    'resources/styles/themes/theme-vars.less': themeVars,
  });
  cur = healer.healLessColorFnVarArgs(cur).content ?? cur;
  cur = (() => {
    const r = fg.stripFgTakeoverRules(cur, 'resources/styles/common.less');
    return typeof r === 'string' ? r : (r.content ?? cur);
  })();

  const badLines = cur.split('\n').filter((l) => BAD.test(l));
  ok('E1 阴性：全链产物无 `calc(@x) *` 畸形', badLines.length === 0, `命中 ${badLines.length} 行`);
  // 🔴 形态说明：`injectThemeVarDeclsForLess` 已注入顶层 `@fontSize: var(--fontSize);`
  //   ⇒ `localDeclared` 命中 ⇒ healThemeMixinVarRefs 不再改写 ⇒ 全链产物里的正确形态是
  //   **Less 变量直引** `calc(@fontSize * 1.7143)`（编译期由主题作用域给真值，产物 CSS
  //   才是 `calc(var(--fontSize) * 1.7143)`，见 E3）。留着 var 分支做兼容断言。
  const goodLines = cur
    .split('\n')
    .filter((l) => /calc\(@fontSize \* 1\.7143\)/.test(l) || /calc\(var\(--fontSize/.test(l));
  ok(
    'E2 阳性：全链产物含正确字号形态（`calc(@fontSize * 1.7143)` 或 `calc(var(--fontSize ...)`）',
    goodLines.length > 0,
    goodLines.join(' | ').trim(),
  );

  // ---------- F：真机同形证明（防「注入把刀 A 绕过去」的假绿） ----------
  //
  // 🔴 为什么必须有这一节：`injectThemeVarDeclsForLess` 会给业务 .less 顶层注入
  //    `@fontSize: var(--fontSize);`，一注入 ⇒ `localDeclared` 命中 ⇒ **刀 A 根本不触发**。
  //    若真机链是这样，那上面 E 节全绿就与刀 A 无关（只用刀 B 也能绿）= 假绿闭环。
  //    实测真机链 **不注入** —— `fontSize` 额外声明在 `.theme-dark()/.theme-light()` 内，
  //    命中 A-① 主题作用域豁免（值随主题变化者不重声明）⇒ 刀 A 必然触发。
  console.log(`\n[F] 真机同形证明 —— 刀 A 在真机链上确实被触发`);
  const injected = healer.injectThemeVarDeclsForLess(chunkCommon, themeVars);
  ok(
    'F1 真机链不注入 @fontSize（主题作用域豁免）⇒ 刀 A 必经',
    !/^@fontSize\s*:/m.test(injected),
    `注入增量 ${injected.length - chunkCommon.length} 字节`,
  );
  const aFired = healer.healThemeMixinVarRefs(
    '  font-size: calc(@fontSize * 1.7143);',
    themeVars,
  );
  ok(
    'F2 刀 A 确实改写（证明 E 链不是在绕过刀 A 的路径上取绿）',
    aFired.includes('var(--fontSize'),
    JSON.stringify(aFired),
  );

  // ---------- R：修前链路复现对照（fixture，仅供对照，非生产实现） ----------
  //
  // 🔴 本节的实现是**修前两刀的行为快照**（fixture），刻意保留 OLD 语义：
  //    · 旧刀 A：def 原样塞 fallback（不查设计基准表、不 fail-open）
  //    · 旧刀 B：VAR_RE 去掉 `isNestedVarFallback` 守卫（懒 `[^)]+?` 直接吞括号）
  //    目的 = 在**真实语料那一行**上把真机产物逐字复现出来，作为「本单确实由这两刀造成」
  //    的因果证据；同时也作为 R3 阳性对照，证明修后实现不是「碰巧一样」。
  console.log(`\n[R] 修前链路复现对照（fixture）`);
  const OLD_VAR_RE =
    /var\(\s*--([a-zA-Z][\w-]*)\s*(?:,\s*((?:rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}|[^)]+?))\s*)?\)/g;
  const camelToKebabFixture = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  const oldHealB = (text) =>
    text
      .split('\n')
      .map((line) =>
        line.replace(OLD_VAR_RE, (m, varName, fallback) => {
          const kebab = camelToKebabFixture(varName);
          if (slotNames.has(kebab)) return '@' + kebab;
          if (slotNames.has(varName)) return '@' + varName;
          if (fallback !== undefined && String(fallback).trim()) return String(fallback).trim();
          return m;
        }),
      )
      .join('\n');
  const oldHealA = (text, def) =>
    text.replace(/@fontSize(?![\w-])(?!\s*:)(?!\{)/g, `var(--fontSize, ${def})`);

  const REAL_LINE = '  font-size: calc(@fontSize * 1.7143);';
  let oldChain = oldHealB(oldHealA(REAL_LINE, 'var(--fontSize)'));
  ok(
    'R1 阳性对照：修前链路把真机那一行还原成**逐字一致**的畸形串',
    oldChain === '  font-size: calc(@fontSize) * 1.7143);',
    JSON.stringify(oldChain),
  );
  ok('R1 畸形特征命中 BAD', BAD.test(oldChain));

  // 非幂等：多跑一轮多一个 `)`（这解释了为什么它必然炸门禁而非偶发）
  const oldChain2 = oldHealB(oldHealA(oldChain, 'var(--fontSize)'));
  ok(
    'R2 修前链路非幂等（每轮多一个孤儿 `)`）',
    (oldChain2.match(/\)/g) || []).length > (oldChain.match(/\)/g) || []).length,
    JSON.stringify(oldChain2),
  );

  // R3 对照：修后链路在同一行上必须干净（与 R1 同输入、不同实现 ⇒ 差异可归因）
  let newChain = healer.healThemeMixinVarRefs(REAL_LINE, themeVars);
  newChain = guard.healBusinessStyleVarsInCss(newChain, slotNames);
  ok(
    'R3 修后链路同输入 ⇒ 无畸形、且回到正确形态',
    !BAD.test(newChain) && newChain.includes('calc(@fontSize * 1.7143)'),
    JSON.stringify(newChain.trim()),
  );

  // ---------- 真编译（less.render + globalVars 模拟 theme-vars mixin 作用域） ----------
  console.log(`\n[E3/E4] less.render 真编译`);
  const require = createRequire('/Users/smigoo/工作/mvgo/backend-node/');
  const less = require('less');
  const gv = {};
  for (const n of slotNames) gv[n] = n === 'fontSize' ? 'var(--fontSize)' : '#333333';

  try {
    const r = await less.render(cur, { filename: 'common.less', globalVars: gv });
    ok('E3 真编译通过', true, `css ${r.css.length} 字节`);
    const m = r.css.match(/calc\(var\(--fontSize\) \* 1\.7143\)/);
    ok('E3 产物 CSS 字号链路保真 `calc(var(--fontSize) * 1.7143)`', !!m, m ? m[0] : '未命中');
  } catch (e) {
    ok('E3 真编译通过', false, e.message);
  }

  // E4 阳性对照：修前畸形必须编译失败（否则 E3 是恒真判据）
  const BAD_SRC = '@fontSize: var(--fontSize);\n.a { font-size: calc(@fontSize) * 1.7143; }\n';
  let badThrew = false;
  let badMsg = '';
  try {
    await less.render(BAD_SRC, { filename: 'bad.less', globalVars: gv });
  } catch (e) {
    badThrew = true;
    badMsg = e.message;
  }
  ok('E4 阳性对照：修前畸形形态必须编译失败', badThrew, badMsg.split('\n')[0]);

  console.log(`\n${failed === 0 ? '🎉 全绿' : `🔴 ${failed} 条断言失败`}（共 ${total} 条）`);
  process.exit(failed === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error('verify failed:', e);
  process.exit(1);
});
