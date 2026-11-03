/**
 * @file orphan-style-rule-guard.js — 🛡️ 刀 53h（2026-10-23）
 *
 * 「接管后样式失配」**第三态**治理：确定性接管（刀 53 家族）重写模板 class 却**不维护
 * stylesheet** ⇒ 上一轮 LLM 写的旧规则沦为**零引用孤儿**——既有害又无用：
 *   - 无用：零 DOM 引用 ⇒ 零视觉效果；
 *   - 有害：照常编译进 index.css（4 份：根 + 3 主题），注释语义还可能是**错的**
 *     （cd8938f8 实测：`.c-device-content-section4-col` 值 `#e2ecfe` / `1px solid #ffffff`
 *      与表格真值**逐位一致**，注释却写「电量数据列」——它其实是表格单元格），
 *     会误导后续自愈、覆盖率判定与人工诊断。
 *
 * 为什么只能走「孤儿判定」而不能走「重命名保其值」：接管渲染器
 * （`folded-grid-section-takeover#collectFoldedGridTakeover`）**不读旧模板内容**，它从 section
 * tree 确定性渲染 ⇒ 旧类名 → 新 `-fg-` 类名**无映射可依**。实测 cd8938f8：承接表格的
 * `ContentSection4.vue` 用的是 LLM 自由命名的 `c-device-group-2136638436`。
 *
 * 本模块只做**确定性孤儿判定 + 删除**，不猜语义、不做重命名。
 *   ① 块枚举：`splitTopLevelClassBlocks`（style-class-consolidator，单一实现，禁止另写副本）
 *   ② 块删除：`removeClassBlocks`（同上，单一实现）
 *   ③ DOM 事实：`collectClassFacts` / `resolveDomClass` / `splitModifier`（class-facts，单一实现）
 *   ④ 引用判定（任一命中即**保留**）：
 *      a. `dom-referenced`    —— DOM 可寻址（精确 / 基名分组 / 修饰符归一）；
 *      b. `literal-elsewhere` —— 类名以 `[^A-Za-z0-9_-]` 边界出现在**定义文件之外**的任何
 *          `.vue/.js/.ts/.less/.html` 文件（跨文件引用、注释、字符串拼接全覆盖）；
 *      c. `dynamic-prefix`    —— 产物内存在**插值 class 绑定**（`…-${…}`）时，取插值前的
 *         **静态前缀干**（如 `` `c-x-card--${key}` `` 的 `c-x-card--`），类名以其开头即保留：
 *         这种变体在模板里**不可见**（`collectDomTokensFromTemplate` 丢弃含 `${` 的 token）
 *         ⇒ 静态分析必然判它「零引用」，删除会误伤运行期样式
 *         （实测 `c-daily-overview-c310c7e3/package/index.vue`：`` `…-card--${card.key}` ``）。
 *   ⑤ 护栏：
 *      - 只扫 `resources/styles/**.less`；🔴 **不碰 `index.css`**——它是 less 编译产物，
 *        下游 refiner 的 `recompileIndexCss` 会自动重生成，手改必被覆盖（= 假绿）；
 *      - 选择器头形如 `.name(` ⇒ Less **mixin 定义**（`.common()` / `.theme-light()` /
 *        `.theme-dark()`，见 `themes/theme-vars.less`），不是 DOM 类 → 跳过；
 *      - 选择器头里的类名**全部**判为孤儿才删（`.a, .b { }` 分组只要有一个被引用 → 整块保留）；
 *      - `-fg-` 族跳过（刀 53 接管命名空间，职责在 `stripFgTakeoverRules`，不越界）；
 *      - 引用池**排除 `.css` / `.json`**：前者是编译产物、后者是元数据回显（实测
 *        `component-meta.json` 会列出类名）⇒ 纳入即「永不判孤儿」的假绿。
 *      - fail-open：任何异常返回空 map，绝不阻断落盘；缺 `resources/styles` ⇒ 留痕跳过。
 *
 * 落点：`file-writer.js#writeFiles` 循环外整体跑一次（与刀 41 同形态：产出 map 后回灌
 * `filesForWrite`），先算再进逐文件循环 ⇒ 后续每一层自愈/终裁看到的都是「已去孤儿」的样式源。
 *
 * jest 安全：无 import.meta；纯函数、无 IO。
 */

import { collectClassFacts, resolveDomClass, splitModifier } from './class-facts.js';
import { splitTopLevelClassBlocks, removeClassBlocks } from './style-class-consolidator.js';
import { FG_TAKEOVER_CLASS_RX } from './folded-grid-section-takeover.js';

/** 只扫业务样式目录下的 .less（`resources/styles/**.less`）。 */
const STYLE_LESS_RE = /(^|\/)resources\/styles\/.*\.less$/i;
/** 引用池文件形态：可合法书写类名的源码/样式文本。**刻意排除 .css（编译产物）与 .json（元数据回显）**。 */
const REF_POOL_RE = /\.(vue|js|mjs|cjs|ts|mts|cts|jsx|tsx|less|scss|sass|styl|html|htm)$/i;
/** Less mixin 定义头：`.name(` / `.theme-dark(`（后面紧跟左括号，非伪类 `:nth-child(`）。 */
const LESS_MIXIN_HEAD_RX = /(^|,|\s)\.[A-Za-z][\w-]*\s*\(/;
/** 选择器头里的类名（不含 `.`）。 */
const HEAD_CLASS_RX_SRC = '\\.([a-zA-Z][\\w-]*)';
/** 动态 class 绑定：`:class="…${…}"` / `v-bind:class="…${…}"`（插值形态，模板里看不到变体）。 */
const DYNAMIC_CLASS_BINDING_RX = /(?::class|v-bind:class)\s*=\s*["'][^"']*\$\{/i;
/**
 * 插值绑定里的**静态前缀干**：
 *   ① 模板字面量：`` `c-x-card--${k}` `` → `c-x-card--`
 *   ② 字符串拼接：`'c-x-card--' + k`     → `c-x-card--`
 * 只收「以 `-` 结尾且长度 ≥ 4」的干：插值变体恒与分隔符相连，短干（如 `c-`）过宽会造成
 * 大范围误保留（宁可少删也不误删，但也要防止判据退化成「永不判定」）。
 */
const DYN_PREFIX_TEMPLATE_RX = /[`'"]([A-Za-z0-9_-]*)\$\{/g;
const DYN_PREFIX_CONCAT_RX = /([A-Za-z0-9_-]+)['"`]\s*\+/g;
const DYN_PREFIX_MIN_LEN = 4;

/** 正则转义（类名只含 `[\w-]`，但仍走统一实现，杜绝「看着安全就不转义」的漏网）。 */
function escapeRx(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 取块头（首个 `{` 之前）的原文。 */
function headHead(blockText = '') {
  const text = String(blockText || '');
  const braceIdx = text.indexOf('{');
  return braceIdx < 0 ? text : text.slice(0, braceIdx);
}

/** 取块头（首个 `{` 之前）里的全部类名（不含 `.`）。 */
function headClassTokens(blockText = '') {
  const head = headHead(blockText);
  const out = [];
  const rx = new RegExp(HEAD_CLASS_RX_SRC, 'g');
  let m;
  while ((m = rx.exec(head))) out.push(m[1]);
  return out;
}

/** 是否为 Less mixin 定义块（`.common() { … }`）——不是 DOM 类规则。 */
function isMixinHead(blockText = '') {
  return LESS_MIXIN_HEAD_RX.test(headHead(blockText));
}

/** 是否含动态片段（`${…}` / `{…}`）——无法静态判定的选择器一律不碰。 */
function hasDynamicFragment(cls = '') {
  return /[$`{}]/.test(String(cls));
}

/**
 * 探测产物内「插值 class 绑定」（`:class="…${…}"`）所在文件。
 * 只做**存在性**判定（不是类名解析）：解析类名仍归 class-facts 单一实现。
 * @param {Object<string,string>} files
 * @returns {string[]} 命中文件路径
 */
export function detectDynamicClassBindings(files = {}) {
  const hits = [];
  for (const [p, c] of Object.entries(files || {})) {
    if (typeof c !== 'string' || !c) continue;
    if (!/\.vue$/i.test(p)) continue;
    const tplStart = c.search(/<template\b[^>]*>/i);
    if (tplStart < 0) continue;
    const rest = c.slice(tplStart);
    const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
    const tpl = endIdx > 0 ? rest.slice(0, endIdx) : rest;
    if (DYNAMIC_CLASS_BINDING_RX.test(tpl)) hits.push(p);
  }
  return hits;
}

/**
 * 采集产物内「插值 class 绑定的静态前缀干」。
 *
 * 为什么必须单独做：`collectDomTokensFromTemplate` 的 token 白名单
 * （`/^-?[a-zA-Z][\w-]*$/`）会**丢弃**含 `${` 的整段（`` `c-x-card--${k}` `` 既非合法类名、
 * 又无法枚举变体）⇒ 静态 DOM 事实里**没有** `c-x-card--active` 这一类。
 * 若不额外保护，运行期由插值生成的变体规则会被判成「零引用孤儿」而误删。
 *
 * 判定只见「干」不见变体（确定性、不猜取值）；`startsWith` 命中即保留 —— 宁可多留。
 *
 * @param {Object<string,string>|Array<{path:string,content:string}>} files
 * @returns {string[]} 去重后的前缀干（如 `c-x-card--`）
 */
export function collectDynamicClassPrefixes(files) {
  const list = Array.isArray(files)
    ? files
    : Object.entries(files || {}).map(([path, content]) => ({ path, content }));
  const stems = [];
  const seen = new Set();
  for (const f of list) {
    const p = String(f?.path || '');
    const c = f?.content;
    if (!/\.vue$/i.test(p) || typeof c !== 'string' || !c) continue;
    const tplStart = c.search(/<template\b[^>]*>/i);
    if (tplStart < 0) continue;
    const rest = c.slice(tplStart);
    const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
    const tpl = endIdx > 0 ? rest.slice(0, endIdx) : rest;
    for (const rx of [DYN_PREFIX_TEMPLATE_RX, DYN_PREFIX_CONCAT_RX]) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(tpl))) {
        const stem = m[1] || '';
        if (stem.length < DYN_PREFIX_MIN_LEN) continue;
        if (!stem.endsWith('-')) continue;
        const key = stem.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        stems.push(stem);
      }
    }
  }
  return stems;
}

/**
 * 只读分析：找出 `files` 中的**孤儿样式规则**（不修改任何输入）。
 * @param {Object<string,string>|Array<{path:string,content:string}>} files
 * @returns {{stats: Object, orphansByFile: Map<string,Set<string>>}}
 */
export function findOrphanStyleRules(files) {
  const list = (Array.isArray(files) ? files : Object.entries(files || {}).map(([path, content]) => ({ path, content })))
    .filter((f) => typeof f?.content === 'string' && f.content);

  const stats = {
    scannedFiles: 0,
    blocks: 0,
    candidates: 0,
    removed: [],
    kept: [],
    skipped: [],
    residual: 0,
    domFiles: 0,
    dynamicFiles: [],
    dynamicPrefixes: [],
  };
  const orphansByFile = new Map();

  const targets = list.filter((f) => STYLE_LESS_RE.test(f.path));
  stats.scannedFiles = targets.length;
  if (targets.length === 0) return { stats, orphansByFile };

  // 🔴 单一来源：DOM 类事实（禁止在本模块另解析模板 class）
  const facts = collectClassFacts(list);
  stats.domFiles = Object.keys(facts.byFile || {}).length;
  const factList = Object.values(facts.byFile || {});

  // 动态插值守护信号（存在插值 ⇒ 变体在模板里不可见 ⇒ 前缀同干者一律保留）
  const dynamicFiles = detectDynamicClassBindings(
    Object.fromEntries(list.map((f) => [f.path, f.content])),
  );
  stats.dynamicFiles = dynamicFiles;
  const dynPrefixes = collectDynamicClassPrefixes(list);
  stats.dynamicPrefixes = dynPrefixes;

  // 引用池：排除 .css / .json（编译产物与元数据回显会污染判定）
  const pool = list.filter((f) => REF_POOL_RE.test(f.path));

  const referencedByDom = (cls) => {
    const base = splitModifier(cls).base.toLowerCase();
    for (const fact of factList) {
      if (resolveDomClass(fact, cls)) return true;
      // 基名分组存在即视为相关（DOM 只出现 `X--mod` 而规则写 `X` 时 resolveDomClass 会漏）
      if (fact.bases && fact.bases[base]) return true;
    }
    return false;
  };

  const referencedByLiteral = (cls, defFile) => {
    const rx = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRx(cls)}([^A-Za-z0-9_-]|$)`);
    for (const f of pool) {
      if (f.path === defFile) continue;
      if (rx.test(f.content)) return true;
    }
    return false;
  };

  const referencedByDynamicPrefix = (cls) => {
    if (dynPrefixes.length === 0) return false;
    const lower = String(cls).toLowerCase();
    return dynPrefixes.some((stem) => lower.startsWith(stem.toLowerCase()));
  };

  for (const { path: file, content } of targets) {
    const blocks = splitTopLevelClassBlocks(content);
    stats.blocks += blocks.length;
    const orphans = new Set();

    for (const b of blocks) {
      const selector = String(b?.selector || '');
      if (!selector.startsWith('.')) {
        stats.skipped.push({ file, selector, reason: 'not-class-selector' });
        continue;
      }
      if (isMixinHead(b.text)) {
        stats.skipped.push({ file, selector, reason: 'less-mixin' });
        continue;
      }
      if (FG_TAKEOVER_CLASS_RX.test(selector)) {
        stats.skipped.push({ file, selector, reason: 'fg-takeover-namespace' });
        continue;
      }
      const classes = headClassTokens(b.text);
      if (classes.length === 0) {
        stats.skipped.push({ file, selector, reason: 'no-class-token' });
        continue;
      }
      // 🔴 必须判**选择器头原文**：`headClassTokens` 的 token 正则（`\.[a-zA-Z][\w-]*`）
      //   永不捕获 `$`/`` ` `` ⇒ 若把本判据挂在 `classes` 上就是**恒假死代码**
      //   （`.c-x-${dyn}` 会被 `RULE_START_RE` 截成 `.c-x-`，看着像合法类名而被当成候选）。
      if (hasDynamicFragment(headHead(b.text))) {
        stats.skipped.push({ file, selector, reason: 'dynamic-selector' });
        continue;
      }

      stats.candidates += 1;
      let keepReason = null;
      for (const c of classes) {
        if (referencedByDom(c)) { keepReason = 'dom-referenced'; break; }
        if (referencedByLiteral(c, file)) { keepReason = 'literal-elsewhere'; break; }
        if (referencedByDynamicPrefix(c)) { keepReason = 'dynamic-prefix'; break; }
      }
      if (keepReason) {
        stats.kept.push({ file, selector, reason: keepReason });
        continue;
      }

      // 选择器头里**全部**类名都是孤儿 ⇒ 整块删除
      for (const c of classes) orphans.add(`.${c}`);
      stats.removed.push({ file, selector, classes });
    }

    if (orphans.size > 0) orphansByFile.set(file, orphans);
  }

  return { stats, orphansByFile };
}

/**
 * 找出并**删除**孤儿样式规则。
 *
 * @param {Object<string,string>|Array<{path:string,content:string}>} files
 * @returns {{map: Map<string,string>, stats: Object}}
 *   - `map`：仅含**内容发生变化**的文件（`path → 新内容`），调用方按「回灌 filesForWrite」形态消费；
 *   - `stats.removed`：被删选择器清单（留痕用，可辩驳）；
 *   - `stats.residual`：删除后复检仍残留的孤儿块数（>0 ⇒ 块删除口径与枚举口径不一致，必须留痕）。
 */
export function dropOrphanStyleRules(files) {
  const map = new Map();
  let stats;
  try {
    const analysis = findOrphanStyleRules(files);
    stats = analysis.stats;
    const { orphansByFile } = analysis;
    const source = Array.isArray(files)
      ? Object.fromEntries(files.map((f) => [f.path, f.content]))
      : (files || {});

    for (const [file, orphans] of orphansByFile) {
      const before = source[file];
      if (typeof before !== 'string') continue;
      // 🔴 单一来源：块删除复用 style-class-consolidator#removeClassBlocks
      const after = removeClassBlocks(before, [...orphans]);
      if (after === before) {
        stats.skipped.push({ file, selector: [...orphans].join(','), reason: 'remove-noop' });
        continue;
      }
      map.set(file, after);
      // 复检（可辩驳判据）：删除后重新枚举，确认孤儿选择器真的消失
      const still = splitTopLevelClassBlocks(after).filter((b) => orphans.has(String(b?.selector)));
      if (still.length > 0) stats.residual += still.length;
    }
  } catch (err) {
    // fail-open：绝不因卫生治理阻断落盘
    stats = stats || {
      scannedFiles: 0, blocks: 0, candidates: 0, removed: [], kept: [], skipped: [], residual: 0,
      domFiles: 0, dynamicFiles: [], dynamicPrefixes: [],
    };
    stats.error = err?.message || String(err);
    return { map: new Map(), stats };
  }
  return { map, stats };
}
