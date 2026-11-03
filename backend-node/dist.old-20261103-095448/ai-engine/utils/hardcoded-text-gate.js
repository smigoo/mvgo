/**
 * @file hardcoded-text-gate.js — 刀 54（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）
 *   「产物可见文本必须是 Figma 真值文本」——管线层根因门禁，双链路（microcode / vue3）共用。
 *
 * ## 事故形态（真机产物）
 * 具身机器人设备列表（`f98f7463`）里 LLM 自行写死了内容：
 *   · `CardGrid.vue:44`  `status: 'disabled'`（其余 7 行是真值中文「启用」），`:27` 还用它判色
 *     ⇒ 表格里直出英文 `disabled`，真值是 `43:4862`「禁用」fs14 fw500 rgb(255,115,0)；
 *   · `ContentSection3.vue:15-16` `ref('运行中')` / `ref('2')` —— 该组件**没有** data-section-id，
 *     是 LLM 凭空复制 `43:4898` 的第 2 份（真值统计行是 3 卡，产物 2 卡且重复）。
 * 既有防线的缺口（查证结论，勿重复造刀）：
 *   · `do-not-invent-validator` 只校验 vision 下发的 doNotInvent 禁止对 + 图表形态，**不校验文本来源**；
 *   · `section-content-guard` 只判「借用/重复/归属」，**不判「字面量是否等于真值文本」**；
 *   · `business-text-rules#isTextAllowedByRules` 判据写好了（产物文本 ∉ 真值 ⇒ 不允许），
 *     但**零消费者**（死代码），故本刀复用其语义并在落盘前真正接线。
 *
 * ## 判据（命名无关、不猜语义、可证伪）
 *   truth = Figma **全树** TEXT 节点的 `characters` 全集（不依赖 plan / 不依赖 section 归属，
 *          故无 section-id 的编造组件（如 ContentSection3）同样在网内）；
 *   扫描产物 SFC 里**会渲染成可见文本**的字面量：
 *     ① template 静态文本节点（`>文本<`，排除 `{{ }}` 插值）；
 *     ② template 展示属性字符串（`title` / `alt` / `placeholder` / `aria-label` / `label`）；
 *     ③ script `ref('…')` 与 `const X = '…'`；
 *     ④ script 中**被 v-for 引用的数据源数组**里的 `key: 'value'` 字段值
 *        （限定「v-for 变量」是刻意的：否则 echarts `option.series[{type:'bar'}]` 会被误判）。
 *   凡 `字面量 ∉ truth ∪ 白名单` ⇒ `hardcodedText`。
 *
 * ## 处置（保守、不猜、幂等）
 *   ① **确定性 heal**：truth 中存在**唯一**候选且编辑距离 ≤ max(1, 20% 长度) ⇒ 替换为真值文本
 *      （纯形式相似度，**不做语义推断**——记忆铁律：语义推断 = 非真值）；
 *   ② **剥离**（heal 不了）：静态文本节点整段删除（保留标签）；引号字面量置 `''`
 *      ⇒ 产物里不复存在非真值内容文本（「不允许硬编码」的兜底）；
 *   ③ 仍不可安全处置 ⇒ 留痕 residual（不阻断发布），由上层 WARN 可见。
 *   删除前若传入 `validateSfc` 则按既有铁律「引入新错误即回退」。
 *
 * ## 边界（阴性对照，务必不误伤）
 *   · 无 `figmaRoot` / truth 为空 ⇒ 整链 fail-open（无真值源不能判，绝不猜）；
 *   · 纯符号 / 空态文案（暂无数据、加载中）/ **单个数字字符** ⇒ 白名单放行；
 *     ⚠️ **多位数字不放行**——可见文本域里的数字就是内容，必须 ∈ 真值（见 DEFAULT_TEXT_ALLOWLIST 说明）；
 *   · `<style>` 块、注释、`import` 路径、class/style 属性、`console.*` / `publishEvent` / `emit`
 *     调用实参 ⇒ 全部不属「可见文本」域，扫描前按等长空格屏蔽；
 *   · echarts / 配置对象里的 `type:'bar'` 等 ⇒ 不在 v-for 数据源内 ⇒ 不扫。
 *
 * 纯函数、零 import.meta、幂等（heal/剥离后字面量已属 truth 或不存在 ⇒ 复跑零变更）。
 */

/** 含 CJK（用于「是否值得判」的快速筛；不是判据本身）。 */
const CJK_RX = /[一-龥]/;

/** 纯数字 / 百分比 / 小数（含正负号、千分位、%）：归 numeric-literal-guard，不在本刀域内。 */
const PURE_NUMBER_RX = /^[-+]?[\d.,:%\s]*\d[\d.,:%\s]*$/;

/** 纯符号（占位线/分隔符等，无内容语义）。 */
const PURE_SYMBOL_RX = /^[\s\-—–_/|·:：、.,。*"'()+]+$/;

/**
 * 默认白名单：这些字面量**允许**出现在产物里（不是内容硬编码）。
 * 顺序敏感：命中任一即放行。
 *
 * 🔴 刻意**不放行多位数字**（2026-10-23 自查修正）：可见文本域里的数字就是内容数字
 *    （"92" / "1.20" / "8"），必须 ∈ 真值。`numeric-literal-guard`（N1）是**诊断型**
 *    （有结构/视觉证据时 `rewrite:false`、只记诊断）⇒ 臆造数字若在此放行将**无人拦**。
 *    只放行**单个数字字符**（序号/角标噪声），多位一律按真值判。
 */
export const DEFAULT_TEXT_ALLOWLIST = [
  /^\s*$/,
  /^[-+]?\d$/, // 单个数字字符（非内容性噪声）
  PURE_SYMBOL_RX,
  // 空态 / 加载态辅助文案（Figma 通常没有，属工程必要，非内容臆造）
  /^(暂无|暂无数据|无数据|没有数据|数据加载中|加载中|加载中\.\.\.|Loading|loading|No Data|no data|—|-|\/|N\/A)$/,
];

/** 归一化：比较用（去首尾空白、压缩内部空白）。 */
export function normalizeTruthText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 收集 Figma **全树** TEXT 节点文本作为真值全集。
 *
 * 为什么取全树而不是 per-section：本单 `ContentSection3.vue` **没有** data-section-id，
 * 按 section 归属判定会直接漏掉它（正是它承载了硬编码）。全树口径 = 网最大、零归属依赖。
 *
 * @param {object} figmaRoot figmaNodeData（兼容 {document:…} 与裸根两种形态）
 * @returns {Set<string>} 归一化后的真值文本集合
 */
export function collectFigmaTruthTexts(figmaRoot) {
  const out = new Set();
  if (!figmaRoot || typeof figmaRoot !== 'object') return out;
  const root = figmaRoot.document || figmaRoot.node || figmaRoot.nodes || figmaRoot;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'TEXT' && typeof n.characters === 'string') {
      const t = normalizeTruthText(n.characters);
      if (t) out.add(t);
    }
    const kids = n.children;
    if (Array.isArray(kids)) for (const k of kids) walk(k);
  };
  walk(root);
  return out;
}

/** 取 `<template …>…</template>` 块（含标签），返回 {start, end, body}；无则 null。 */
function sliceTemplateBlock(sfc) {
  const open = /<template\b[^>]*>/i.exec(sfc);
  if (!open) return null;
  const close = sfc.indexOf('</template>', open.index + open[0].length);
  const bodyEnd = close < 0 ? sfc.length : close;
  return {
    start: open.index + open[0].length,
    end: bodyEnd,
    body: sfc.slice(open.index + open[0].length, bodyEnd),
  };
}

/** 取 `<script …>…</script>` 块（含标签），返回 {start, end, body}；无则 null。 */
function sliceScriptBlock(sfc) {
  const open = /<script\b[^>]*>/i.exec(sfc);
  if (!open) return null;
  const close = sfc.indexOf('</script>', open.index + open[0].length);
  const bodyEnd = close < 0 ? sfc.length : close;
  return {
    start: open.index + open[0].length,
    end: bodyEnd,
    body: sfc.slice(open.index + open[0].length, bodyEnd),
  };
}

/** 把指定正则命中的区域替换为**等长空格**（保持下标对齐，便于后续定位与替换）。 */
function blankRegions(text, rx) {
  return text.replace(rx, (m) => ' '.repeat(m.length));
}

/** 屏蔽 script 里「不是可见文本」的区域：import 行、console 调用、事件发布/派发调用。 */
function maskScriptNoise(scriptBody) {
  let out = scriptBody;
  out = blankRegions(out, /^\s*import\s[^;\n]*[;\n]?/gm);
  out = blankRegions(out, /console\.(log|warn|error|info|debug)\s*\([^)]*\)/g);
  out = blankRegions(out, /\$emit\s*\([^)]*\)/g);
  out = blankRegions(out, /\.emit\s*\([^)]*\)/g);
  out = blankRegions(out, /publishEvent\s*\([^)]*\)/g);
  out = blankRegions(out, /dispatch\w*\s*\([^)]*\)/g);
  return out;
}

/**
 * 抽取产物 SFC 里**会渲染成可见文本**的字面量。
 *
 * @param {string} sfc
 * @returns {Array<{text:string, kind:string, start:number, end:number,
 *   valueStart:number, valueEnd:number, quote?:string}>}
 *   · kind: 'static-text' | 'attr' | 'ref' | 'const' | 'array-value'
 *   · start/end: 整体可替换区间（static-text 为 `>文本<` 整段；引号字面量为含引号整段）
 *   · valueStart/valueEnd: 纯值区间（heal 替换用）
 */
export function extractArtifactTextLiterals(sfc) {
  const out = [];
  if (typeof sfc !== 'string' || !sfc) return out;

  const tpl = sliceTemplateBlock(sfc);
  if (tpl) {
    // ① 静态文本节点：`>文本<`（排除含插值/标签的内容）
    const rx = />([^<>]*)</g;
    let m;
    while ((m = rx.exec(tpl.body)) !== null) {
      const rawInner = m[1];
      if (rawInner.includes('{{') || rawInner.includes('}}')) continue;
      const text = normalizeTruthText(rawInner);
      if (!text) continue;
      const start = tpl.start + m.index;
      out.push({
        text,
        kind: 'static-text',
        start,
        end: start + m[0].length,
        valueStart: start + 1,
        valueEnd: start + 1 + rawInner.length,
      });
    }

    // ② 展示属性字符串（class / style / v-bind 一律不算）
    const attrRx = /\b(?:title|alt|placeholder|aria-label|label)\s*=\s*(["'])([\s\S]*?)\1/g;
    while ((m = attrRx.exec(tpl.body)) !== null) {
      const val = m[2];
      if (!val || val.includes('{{')) continue;
      const text = normalizeTruthText(val);
      if (!text) continue;
      const vStart = tpl.start + m.index + m[0].indexOf(val);
      out.push({
        text,
        kind: 'attr',
        start: tpl.start + m.index,
        end: tpl.start + m.index + m[0].length,
        valueStart: vStart,
        valueEnd: vStart + val.length,
        quote: m[1],
      });
    }
  }

  const scr = sliceScriptBlock(sfc);
  if (scr) {
    const masked = maskScriptNoise(scr.body);
    // v-for 数据源变量名（只有它们的对象数组才是「内容数据」）
    const vforVars = new Set();
    if (tpl) {
      const vforRx = /v-for\s*=\s*"[^"]*\bin\s+([A-Za-z_$][\w$]*)[^"]*"/g;
      let vm;
      while ((vm = vforRx.exec(tpl.body)) !== null) vforVars.add(vm[1]);
    }

    // ③ ref('…')
    let m;
    const refRx = /\bref\s*\(\s*(["'])([\s\S]*?)\1\s*\)/g;
    while ((m = refRx.exec(masked)) !== null) {
      const val = m[2];
      if (!val) continue;
      const vStart = scr.start + m.index + m[0].indexOf(val);
      out.push({
        text: normalizeTruthText(val),
        kind: 'ref',
        start: scr.start + m.index,
        end: scr.start + m.index + m[0].length,
        valueStart: vStart,
        valueEnd: vStart + val.length,
        quote: m[1],
      });
    }

    // ③-b const X = '…'（排除 `const X = ref(...)` / `const X = [` —— 值不是引号）
    const constRx = /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(["'])([\s\S]*?)\1/g;
    while ((m = constRx.exec(masked)) !== null) {
      const val = m[2];
      if (!val) continue;
      const vStart = scr.start + m.index + m[0].indexOf(val);
      out.push({
        text: normalizeTruthText(val),
        kind: 'const',
        start: scr.start + m.index,
        end: scr.start + m.index + m[0].length,
        valueStart: vStart,
        valueEnd: vStart + val.length,
        quote: m[1],
      });
    }

    // ④ v-for 数据源数组里的字段值
    for (const vname of vforVars) {
      const arrRx = new RegExp(
        `\\b(?:const|let|var)\\s+${vname}\\s*=\\s*\\[`,
        'g',
      );
      let am;
      while ((am = arrRx.exec(masked)) !== null) {
        const arrStart = am.index + am[0].length - 1; // 指向 `[`
        const arrEnd = findMatchingBracket(masked, arrStart);
        if (arrEnd < 0) continue;
        const seg = masked.slice(arrStart + 1, arrEnd);
        const fieldRx = /([A-Za-z_$][\w$]*)\s*:\s*(["'])([\s\S]*?)\2/g;
        let fm;
        while ((fm = fieldRx.exec(seg)) !== null) {
          const val = fm[3];
          if (!val) continue;
          const absSegPos = arrStart + 1 + fm.index;
          const vStart = scr.start + absSegPos + fm[0].indexOf(val);
          out.push({
            text: normalizeTruthText(val),
            kind: 'array-value',
            field: fm[1],
            start: scr.start + absSegPos,
            end: scr.start + absSegPos + fm[0].length,
            valueStart: vStart,
            valueEnd: vStart + val.length,
            quote: fm[2],
          });
        }
      }
    }
  }

  // 去重（同一位置可能被多条规则命中，如 `const x = ref('y')` 不会，但保险起见）
  const seen = new Set();
  return out.filter((it) => {
    const key = `${it.kind}@${it.valueStart}:${it.valueEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 从 `openIdx`（必须是 `[`）找匹配的 `]`；括号/引号内容跳过。找不到返回 -1。 */
function findMatchingBracket(text, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 字面量是否命中白名单（放行）。 */
export function isAllowedLiteral(text, allowlist = DEFAULT_TEXT_ALLOWLIST) {
  const t = String(text ?? '');
  if (!t) return true;
  for (const rx of allowlist) {
    if (rx instanceof RegExp) {
      if (rx.test(t)) return true;
    } else if (typeof rx === 'string') {
      if (t === rx) return true;
    }
  }
  return false;
}

/** 字符级编辑距离（CJK 安全，按 Array.from 拆）。 */
export function editDistance(a, b) {
  if (a === b) return 0;
  const A = Array.from(String(a));
  const B = Array.from(String(b));
  const m = A.length;
  const n = B.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * 在真值集里找**唯一**的形式近似候选（纯编辑距离，不做语义推断）。
 *
 * @returns {string|null} 唯一候选；无或歧义 ⇒ null
 */
export function pickUniqueTruthCandidate(text, truth) {
  if (!truth || truth.size === 0) return null;
  if (truth.has(text)) return text;
  const len = Array.from(String(text)).length;
  const threshold = Math.max(1, Math.floor(len * 0.2));
  const cands = [];
  for (const t of truth) {
    if (editDistance(t, String(text)) <= threshold) cands.push(t);
  }
  return cands.length === 1 ? cands[0] : null;
}

/**
 * 🛡️ 刀 56 / 方案 D（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）：同字段**兄弟值配对**。
 *
 * 病灶：LLM 把真值枚举「禁用」写成英文 `disabled`（`status: 'disabled'` 数组值 +
 * `row.status === 'disabled'` 判色键）。刀 54 的 detect **能抓到**（kind=array-value），
 * 但 heal 的 `pickUniqueTruthCandidate` 是「字面量 ↔ 真值」编辑距离 —— `disabled ↔ 禁用`
 * 距离 8+，恒无候选 ⇒ 走 strip ⇒ `status: ''` + 比较键 `'disabled'` 原样留着
 * ⇒ 文字消失 + 橙色判分支永假，**比不处置更糟**（离线探针实锤）。
 *
 * 配对判据（全部确定性，禁语义推断）：
 *   ① 同文件**同字段**的 array-value 字面量里存在 CJK 真值兄弟（S ⊆ truth）；
 *   ② 在 truth 里找 t：t ∉ S、t ∉ 本文件已有值、且与 S 中某 s 的编辑距离
 *      ≤ threshold(s)（复用 pickUniqueTruthCandidate 的 20% 阈值公式）；
 *   ③ 候选**唯一**才配对（本单：S={启用}，threshold=1 ⇒ {禁用(距1)} 唯一；
 *      「启用状态」距 2 被阈值挡下）。
 *
 * @param {string} content 本文件源码
 * @param {object} lit 抽取的字面量（须含 field）
 * @param {Set<string>} truth Figma 全树真值文本集
 * @param {Array} allLits 本文件全部字面量（extractArtifactTextLiterals 产物）
 * @param {Array} allow 白名单
 * @returns {string|null} 唯一配对真值；无/歧义 ⇒ null
 */
export function pickSiblingTruthCandidate(content, lit, truth, allLits, allow) {
  if (!truth || truth.size === 0) return null;
  const field = lit?.field;
  if (!field) return null;
  // 🔴 前置：字面量本身 ∈ truth ⇒ 它不是漂移，绝不参与配对（单测实锤：
  //    「停用」∈ truth 时若不挡，会把真值字面量错当漂移并配出「禁用」）。
  if (truth.has(String(lit.text ?? ''))) return null;
  const isAllowed = (t) => isAllowedLiteral(t, allow);
  // ① 同字段 CJK 真值兄弟
  const siblings = new Set();
  for (const l of allLits) {
    if (l?.kind !== 'array-value' || l.field !== field) continue;
    if (isAllowed(l.text) || !truth.has(l.text)) continue;
    if (/[\u4e00-\u9fa5]/.test(String(l.text))) siblings.add(String(l.text));
  }
  if (siblings.size === 0) return null;
  // 本文件已有值全集（配对候选不得与它们撞车）
  const present = new Set(allLits.map((l) => String(l?.text)).filter(Boolean));
  // ② 唯一最小编辑距离候选（与 pickUniqueTruthCandidate 同一阈值公式）
  const cands = new Set();
  for (const t of truth) {
    const ts = String(t);
    if (siblings.has(ts) || present.has(ts)) continue;
    for (const s of siblings) {
      const th = Math.max(1, Math.floor(Array.from(s).length * 0.2));
      if (editDistance(ts, s) <= th) { cands.add(ts); break; }
    }
  }
  if (cands.size !== 1) return null;
  const cand = [...cands][0];
  if (!cand || cand === lit.text) return null;
  return cand;
}

/** 归一化 files 入参：支持 {path:content} 与 [{path,content}]。 */
function normalizeFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) {
    return files
      .filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string')
      .map((f) => ({ path: f.path, content: f.content }));
  }
  return Object.entries(files)
    .filter(([, c]) => typeof c === 'string')
    .map(([path, content]) => ({ path, content }));
}

/**
 * 检测硬编码文本。
 *
 * @param {object} params
 * @param {object|Array} params.files 产物文件（{path:content} 或 [{path,content}]）
 * @param {object} params.figmaRoot figmaNodeData（无 ⇒ 整链 fail-open）
 * @param {Array} [params.allowlist]
 * @returns {{issues:Array, evaluated:number, hits:number, skipped:number,
 *   truthCount:number, skippedReason?:string}}
 */
export function detectHardcodedText({ files, figmaRoot, allowlist } = {}) {
  const list = normalizeFiles(files).filter((f) => f.path.endsWith('.vue'));
  const truth = collectFigmaTruthTexts(figmaRoot);
  if (truth.size === 0) {
    return {
      issues: [],
      evaluated: 0,
      hits: 0,
      skipped: list.length,
      truthCount: 0,
      skippedReason: 'no-figma-truth',
    };
  }
  const allow = Array.isArray(allowlist) && allowlist.length > 0 ? allowlist : DEFAULT_TEXT_ALLOWLIST;
  const issues = [];
  let evaluated = 0;
  let skipped = 0;
  for (const f of list) {
    for (const lit of extractArtifactTextLiterals(f.content)) {
      if (isAllowedLiteral(lit.text, allow)) {
        skipped++;
        continue;
      }
      evaluated++;
      if (truth.has(lit.text)) {
        skipped++;
        continue;
      }
      issues.push({
        path: f.path,
        text: lit.text,
        kind: lit.kind,
        field: lit.field || null,
        valueStart: lit.valueStart,
        valueEnd: lit.valueEnd,
        start: lit.start,
        end: lit.end,
      });
    }
  }
  return { issues, evaluated, hits: issues.length, skipped, truthCount: truth.size };
}

/**
 * 确定性处置：能 heal 就替换成真值文本，heal 不了就剥离（保证产物里不留非真值内容文本）。
 *
 * @param {object} params 同 detectHardcodedText，另加：
 * @param {Function} [params.validateSfc] (content, path) => {valid:boolean, errors:Array}
 * @returns {{files:object, healed:Array, stripped:Array, residual:Array,
 *   evaluated:number, hits:number}}
 */
export function healHardcodedText({ files, figmaRoot, allowlist, validateSfc } = {}) {
  const isMap = files && !Array.isArray(files);
  const list = normalizeFiles(files);
  const allow = Array.isArray(allowlist) && allowlist.length > 0 ? allowlist : DEFAULT_TEXT_ALLOWLIST;
  const base = detectHardcodedText({ files: list, figmaRoot, allowlist: allow });
  const truth = collectFigmaTruthTexts(figmaRoot);
  const byPath = new Map(list.map((f) => [f.path, f.content]));

  const healed = [];
  const stripped = [];
  const residual = [];

  const byFile = new Map();
  for (const it of base.issues) {
    if (!byFile.has(it.path)) byFile.set(it.path, []);
    byFile.get(it.path).push(it);
  }

  for (const [path, items] of byFile) {
    let content = byPath.get(path);
    if (typeof content !== 'string') continue;

    // 🛡️ 文件级「宁漏不误删」安全阀（2026-10-23 自查补充）：若某文件被判硬编码的字面量
    //   占其**应判字面量总数**的多数（> 50%），说明「真值源与该产物不匹配」或「该组件本就
    //   以非 Figma 文案为主」（vue3 链路常见：占位文案 / props 默认值）——此时整文件处置
    //   会让内容成片消失，比留着更糟 ⇒ 整文件转 residual 只留痕，不做任何改写。
    let fileTotal = 0;
    for (const lit of extractArtifactTextLiterals(content)) {
      if (isAllowedLiteral(lit.text, allow)) continue;
      fileTotal += 1;
    }
    const skipWholeFile = fileTotal > 0 && items.length / fileTotal > 0.5;
    if (skipWholeFile) {
      for (const it of items) {
        residual.push({ path, text: it.text, kind: it.kind, reason: 'file-majority-untruth' });
      }
      continue;
    }

    // 🛡️ 「宁漏不误删」保险（2026-10-23）：array-value 形态只有当**同字段多数值确属真值**
    //   时才允许剥离单个孤立非真值项。若整列都是编造内容（真值占比 < 50%），说明病灶在更上游
    //   （列归属/契约缺失），本刀静默清空会让「内容凭空消失」更糟 ⇒ 转 residual 只留痕。
    const groupStats = new Map();
    if (items.some((it) => it.kind === 'array-value')) {
      for (const lit of extractArtifactTextLiterals(content)) {
        if (lit.kind !== 'array-value' || isAllowedLiteral(lit.text, allow)) continue;
        const key = `${lit.field || ''}`;
        const st = groupStats.get(key) || { total: 0, hit: 0 };
        st.total += 1;
        if (truth.has(lit.text)) st.hit += 1;
        groupStats.set(key, st);
      }
    }

    // 从后往前替换，避免下标漂移
    const sorted = [...items].sort((a, b) => b.valueStart - a.valueStart);
    const siblingHealed = new Set(); // 已按「字面量全文替换」处置过的文本，跳过其重复 issue
    for (const it of sorted) {
      if (siblingHealed.has(it.text)) continue;
      const cand = pickUniqueTruthCandidate(it.text, truth);
      // 🔴 next 必须初始化为 null（不是 content）：初值 content 会让下面的
      //    `next == null` 判定永假 ⇒ strip/residual 原路径全部死代码（单测实锤）。
      let next = null;
      let action = null;
      let healTo = null;
      if (cand) {
        next = content.slice(0, it.valueStart) + cand + content.slice(it.valueEnd);
        action = 'heal';
        healTo = cand;
      } else {
        // 🛡️ 刀 56 / 方案 D：同字段兄弟值配对（先于 strip —— strip 会把值清空、
        //    留下永假的比较键 ⇒ 文字与颜色双丢，比不处置更糟）。
        //    命中 ⇒ **全文**把 `'字面量'`/`"字面量"` 字符串字面量替换为 `'真值'`
        //    （数组值 + `=== '字面量'` 判色键一并改 ⇒ 颜色分支继续生效）。
        const allLits = extractArtifactTextLiterals(content);
        const sib = pickSiblingTruthCandidate(content, it, truth, allLits, allow);
        if (sib) {
          const esc = it.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          let count = 0;
          const replaced = content.replace(
            new RegExp(`(['"])${esc}\\1`, 'g'),
            (_m, q) => { count += 1; return `${q}${sib}${q}`; },
          );
          if (count > 0 && replaced !== content) {
            next = replaced;
            action = 'heal';
            healTo = sib;
            siblingHealed.add(it.text);
          }
        }
        if (next == null) {
          if (it.kind === 'static-text') {
            next = content.slice(0, it.start) + '><' + content.slice(it.end);
            action = 'strip';
          } else if (it.kind === 'ref' || it.kind === 'const' || it.kind === 'array-value' || it.kind === 'attr') {
            const st = it.kind === 'array-value' ? groupStats.get(`${it.field || ''}`) : null;
            if (st && st.total > 0 && st.hit / st.total < 0.5) {
              residual.push({ path, text: it.text, kind: it.kind, reason: 'group-majority-untruth' });
              continue;
            }
            next = content.slice(0, it.valueStart) + '' + content.slice(it.valueEnd);
            action = 'strip';
          }
        }
      }
      if (next == null || next === content) {
        residual.push({ path, text: it.text, kind: it.kind });
        continue;
      }
      if (typeof validateSfc === 'function') {
        let ok = true;
        try {
          const r = validateSfc(next, path);
          ok = !r || r.valid !== false;
        } catch {
          ok = false;
        }
        if (!ok) {
          residual.push({ path, text: it.text, kind: it.kind, reason: 'validateSfc-rejected' });
          continue;
        }
      }
      content = next;
      if (action === 'heal') healed.push({ path, from: it.text, to: healTo, kind: it.kind });
      else stripped.push({ path, text: it.text, kind: it.kind });
    }
    byPath.set(path, content);
  }

  const outFiles = isMap
    ? Object.fromEntries([...byPath.entries()])
    : [...byPath.entries()].map(([path, content]) => ({ path, content }));

  return {
    files: outFiles,
    healed,
    stripped,
    residual,
    evaluated: base.evaluated,
    hits: base.hits,
    truthCount: base.truthCount,
  };
}

export default detectHardcodedText;
