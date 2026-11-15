/**
 * @file chart-mount-truth.js — 🛡️ 治本（2026-11-15 · mc-max-1794742815773-bca81048 实锤）：
 * 「echarts.init(X) 是否有 DOM 挂载点」的**单一事实源判据**。
 *
 * ## 病灶（假阳性实锤）
 * 旧判据（do-not-invent-validator#detectEchartsMountPointMissing 原版）：
 *   `echarts.init(X)` 的 X 一律当模板 ref 名 ⇒ 模板必须有 `ref="X"`。
 * 但 X 有三种合法来源，只有第一种需要模板 ref：
 *   ① `const X = ref(null)` + `ref="X"` / `:ref="X"` —— 模板 ref（必须挂载）
 *   ② `const X = ref([])` + `:ref="(el) => { X[idx] = el }"` —— 函数式 ref 收集数组
 *   ③ `const X = document.querySelector(...)` / `for (const X of ...)` /
 *      `X.value.forEach((el) => echarts.init(el))` 的 **循环变量** —— 局部 DOM 变量，
 *      根本不需要模板 ref
 *
 * bca81048 实锤：`ringRefs.value.forEach((el, idx) => echarts.init(el))`，
 * 旧判据抽出 `el`、去模板找 `ref="el"` ⇒ 必然找不到 ⇒ BLOCK ⇒ 重试耗尽 ⇒ 整单 failed。
 * 而实际挂载点是 `:ref="(el) => { if (el) ringRefs[idx] = el }"`（形态 ②）。
 *
 * ## 本法（声明溯源 + ref 绑定分类，无量纲、不枚举类名）
 * 对每个 init 目标标识符做「script 声明溯源」：
 *   - 有声明且初始化表达式是 ref 族 ⇒ 看是否容器形态（`ref([])`/`ref(new Map())`）
 *   - 有声明但初始化不是 ref 族（querySelector / 元素赋值）⇒ 局部 DOM，天然有挂载
 *   - 无声明但在 for-of / 箭头回调 / function 参数位 ⇒ 局部 DOM
 *   - 其余 ⇒ `unknown`（**fail-open**：不 BLOCK，由调用方降 WARN 观测）
 *
 * 判据单一来源：`do-not-invent-validator`（门禁）、`chart-mount-healer`（写前自愈）、
 * `code-healer#stripDeadChartImpl`（死代码剥离）三处共用本模块，禁止各自复制正则。
 *
 * jest 安全：不得使用 import.meta。
 */

import { extractSfcTemplate } from './sfc-template-extractor.js';

/** init 目标提取（与历史口径逐字一致：`echarts.init(X)` / `echarts.init(X.value)`） */
export const CHART_INIT_RE = /echarts\.init\(\s*([A-Za-z_$][\w$]*)(?:\.value)?\s*\)/g;

/** ref 族构造函数（需要模板 ref 才能拿到 DOM） */
const REF_FACTORY_RE = /^\s*(?:ref|shallowRef|reactive|toRef|toRefs|computed)\s*(?:<[^>]*>)?\s*\(/;

/** 容器形态初始化（收集多个 DOM 元素） */
const CONTAINER_INIT_RE =
  /^\s*(?:ref|shallowRef|reactive)\s*(?:<[^>]*>)?\s*\(\s*(?:\[\s*\]|new\s+(?:Map|Set|WeakMap|WeakSet)\b|Array\s*[.(]|Object\.create\s*\()/;

/** 显式 DOM 获取（天然有挂载点，不需要模板 ref） */
const EXPLICIT_DOM_RE = /document\.(?:querySelector|querySelectorAll|getElementById)|createElement\s*\(|\$refs\b/;

/** JS 关键字（函数式 ref 表达式里排除） */
const JS_KEYWORDS = new Set([
  'if', 'else', 'return', 'const', 'let', 'var', 'function', 'true', 'false', 'null',
  'undefined', 'this', 'new', 'typeof', 'in', 'of', 'for', 'while', 'do', 'switch',
  'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'void', 'delete',
  'instanceof', 'await', 'async', 'class', 'extends', 'super', 'yield',
]);

/** 提取 `<script>` 内层（无则空串） */
export function extractSfcScript(vueContent) {
  const m = String(vueContent || '').match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i);
  return m ? m[1] : '';
}

/**
 * 收集文件内所有 `echarts.init` 目标标识符（保序去重）。
 * @param {string} vueContent
 * @returns {string[]}
 */
export function collectChartInitTargets(vueContent) {
  if (typeof vueContent !== 'string' || !vueContent.includes('echarts.init(')) return [];
  const out = [];
  CHART_INIT_RE.lastIndex = 0;
  let m;
  while ((m = CHART_INIT_RE.exec(vueContent)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * 收集模板里的 ref 绑定形态。
 * @param {string} template
 * @returns {{ staticRefs: Set<string>, dynamicRefs: Set<string>, fnRefRoots: Set<string>, hasDynamicRef: boolean }}
 */
export function collectTemplateRefBindings(template) {
  const staticRefs = new Set();
  const dynamicRefs = new Set();
  const fnRefRoots = new Set();
  let hasDynamicRef = false;
  if (!template || typeof template !== 'string') {
    return { staticRefs, dynamicRefs, fnRefRoots, hasDynamicRef };
  }

  // ① 静态 ref="X"（排除 :ref / v-bind:ref / @ref）
  for (const m of template.matchAll(/(?<![:@\w-])ref\s*=\s*["']([A-Za-z_$][\w$]*)["']/g)) {
    staticRefs.add(m[1]);
  }

  // ② 动态 :ref="expr" / v-bind:ref="expr"
  for (const m of template.matchAll(/(?:\bv-bind:|\B:)ref\s*=\s*"([^"]*)"/g)) {
    hasDynamicRef = true;
    const expr = m[1];
    const bare = expr.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(bare)) {
      dynamicRefs.add(bare);
      continue;
    }
    // 函数式 ref：`:ref="(el) => { if (el) ringRefs[idx] = el }"`
    // 收集表达式里的根标识符（排除箭头参数与关键字），作为「容器被写入」的证据。
    const params = new Set();
    for (const pm of bare.matchAll(/\(?\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\)?\s*=>/g)) {
      if (pm[1]) params.add(pm[1]);
      if (pm[2]) params.add(pm[2]);
    }
    // 单参无括号：`el => ...`
    for (const pm of bare.matchAll(/(?:^|[\s(,])([A-Za-z_$][\w$]*)\s*=>/g)) params.add(pm[1]);
    for (const im of bare.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = im[0];
      if (params.has(name) || JS_KEYWORDS.has(name)) continue;
      fnRefRoots.add(name);
    }
  }

  return { staticRefs, dynamicRefs, fnRefRoots, hasDynamicRef };
}

/**
 * 在 script 里找标识符的声明与初始化表达式（取首次声明）。
 * @param {string} script
 * @param {string} name
 * @returns {{ init: string } | null}
 */
function findDeclaration(script, name) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*([^\\n;]*)`);
  const m = script.match(re);
  if (!m) return null;
  return { init: m[1] || '' };
}

/**
 * 判定标识符是否为局部绑定（for-of / 箭头回调参数 / function 参数）。
 * @param {string} script
 * @param {string} name
 */
function isLocalBinding(script, name) {
  const escaped = name;
  const patterns = [
    new RegExp(`\\bfor\\s*\\(\\s*(?:const|let|var)\\s+${escaped}\\s+of\\b`), // for (const el of list)
    new RegExp(`\\(\\s*(?:[^()]*?,\\s*)?${escaped}\\s*(?:,[^()]*?)?\\)\\s*=>`), // (el, idx) => / (el) =>
    new RegExp(`\\bfunction\\s*[\\w$]*\\s*\\([^)]*\\b${escaped}\\b[^)]*\\)`), // function f(el)
    new RegExp(`\\.(?:forEach|map|filter|flatMap|some|every|find)\\(\\s*(?:function\\s*)?\\(?\\s*${escaped}\\b`),
  ];
  return patterns.some((p) => p.test(script));
}

/**
 * 声明溯源分类。
 * @param {string} vueContent
 * @param {string} name
 * @returns {'ref-single'|'ref-collection'|'plain-var'|'local-binding'|'unknown'}
 */
export function classifyChartMountTarget(vueContent, name) {
  const script = extractSfcScript(vueContent);
  const decl = findDeclaration(script, name);
  if (decl) {
    if (REF_FACTORY_RE.test(decl.init)) {
      return CONTAINER_INIT_RE.test(decl.init) ? 'ref-collection' : 'ref-single';
    }
    if (EXPLICIT_DOM_RE.test(decl.init)) return 'plain-var';
    // 声明存在但不是 ref 族：`const el = ringRefs.value[i]` 之类 ⇒ 局部 DOM
    return 'plain-var';
  }
  if (isLocalBinding(script, name)) return 'local-binding';
  return 'unknown';
}

/**
 * 判定单个 init 目标是否有 DOM 挂载点。
 *
 * @param {string} vueContent .vue 全文
 * @param {string} name init 目标标识符
 * @returns {{ mounted: boolean, kind: string, reason: string }}
 *   kind ∈ ref-single | ref-collection | plain-var | local-binding | unknown
 *   reason 用于日志/门禁文案溯源
 */
export function resolveChartMount(vueContent, name) {
  const template = extractSfcTemplate(vueContent);
  if (!template) {
    // 无模板（畸形 SFC）⇒ fail-open，不拦单
    return { mounted: true, kind: 'unknown', reason: 'no-template' };
  }
  const bindings = collectTemplateRefBindings(template);
  const kind = classifyChartMountTarget(vueContent, name);

  if (kind === 'ref-single') {
    if (bindings.staticRefs.has(name)) return { mounted: true, kind, reason: 'static-ref' };
    if (bindings.dynamicRefs.has(name)) return { mounted: true, kind, reason: 'dynamic-ref' };
    return { mounted: false, kind, reason: 'ref-declared-no-template-ref' };
  }

  if (kind === 'ref-collection') {
    if (bindings.dynamicRefs.has(name) || bindings.fnRefRoots.has(name)) {
      return { mounted: true, kind, reason: 'fn-ref-collector' };
    }
    // 容器 + 任意函数式 ref 绑定存在 ⇒ 视为收集入口（元素来源不可静态唯一化）
    if (bindings.hasDynamicRef) return { mounted: true, kind, reason: 'fn-ref-present' };
    return { mounted: false, kind, reason: 'collection-declared-no-fn-ref' };
  }

  if (kind === 'plain-var') return { mounted: true, kind, reason: 'self-resolved-dom' };
  if (kind === 'local-binding') return { mounted: true, kind, reason: 'local-dom-binding' };
  return { mounted: true, kind: 'unknown', reason: 'unresolved-declaration' };
}

/**
 * 批量判定一个文件内全部 init 目标。
 * @param {string} vueContent
 * @returns {Array<{ name: string, mounted: boolean, kind: string, reason: string }>}
 */
export function resolveAllChartMounts(vueContent) {
  return collectChartInitTargets(vueContent).map((name) => ({
    name,
    ...resolveChartMount(vueContent, name),
  }));
}

/**
 * 仅返回「声明为模板 ref 但模板确实没有挂载点」的目标（真缺口）。
 * fail-open：unknown 不计入。
 * @param {string} vueContent
 * @returns {Array<{ name: string, kind: string, reason: string }>}
 */
export function findMissingChartMounts(vueContent) {
  return resolveAllChartMounts(vueContent)
    .filter((r) => !r.mounted)
    .map(({ name, kind, reason }) => ({ name, kind, reason }));
}

/**
 * 日志行（恒打计数，便于真机对账）。
 * @param {{ checked: number, missing: number, unknown: number, healed?: number, details?: any }} stats
 */
export function formatChartMountLog(stats) {
  const s = stats || {};
  return `🔌 chartMount: checked=${s.checked || 0} missing=${s.missing || 0} unknown=${s.unknown || 0}${
    s.healed != null ? ` healed=${s.healed}` : ''
  }`;
}
