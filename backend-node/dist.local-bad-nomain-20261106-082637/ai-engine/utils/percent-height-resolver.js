/**
 * 🛡️ percent-height-resolver.js —— H1 管线自愈器（百分比高度拉伸检测）。
 *
 * ## 病灶（2026-10-04 · mc-max-1791097955900-fb505213 / a803f7 实锤）
 *
 * 真值定值的「内容区块」（如 `antd-table-con` Figma 高 173px，父 `con` 高 270px）在产物里
 * 被写成 `height:100%` 或比例 `flex`（如 `flex:0.764`）⇒ 该区块**撑满父容器**（而非按真值
 * 173px 定值），把同容器内后续区块（保存按钮）推出可视区、甚至被裁切。
 *
 * 这类「撑满」是**比例语义被滥用为填充语义**：Figma 真值明明给出 173/270 的定值关系，
 * 产物却按「剩余空间全给表」处理。同一族在历史任务反复复发（修复只落产物、未沉进管线）。
 *
 * ## 判据 v2（离线原型 552 产物实测收敛：v1 215 组件 / 49% 假阳性 → v2 24 组件 / -95% 误伤）
 *
 *   ① 判定域 = 「内容区块」类名，**排除填充容器**：
 *      - 命中 `H1_BLOCK_CLS_RE`（`<x>-{table|button|header|content|chart|…}-{wrap|con|body|…}`）；
 *      - 且**不含** `H1_FILLER_RE`（`*-slot-con` / `*-con-con` / `*-container` / `*-root`）——
 *        这类是「填满壳 body」的合法填充容器，`height:100%` 天经地义，判它全是误伤。
 *   ② 信号 = `height:100%`（**须** `|T子 − T父| > 1`，即内容区块真值 ≠ 父）或
 *      比例 flex `flex:<小数>`（**须** `|flex − T子/T父| > ε(0.06)`，即比例未能复现真值比）。
 *      ——「比例恰好复现真值比」= SAFE：flex 本就是这个用途，复现了就没错。
 *   ③ **无真值 fail-open**：`T子` 取不到（元素自身无 `data-section-id` / 该 id 无真值高度）
 *      ⇒ 不判（NO_TRUTH），绝不臆造。
 *
 * ## 与「硬编码」的界线
 *
 * 判据**全部是结构性的**：类名模式 + `data-section-id` 存在性 + 真值高度比。
 * 没有写死任何组件名、像素值、section id ⇒ 换任意组件、任意设计稿口径一致。
 *
 * ## 首版定位：只报不改（对齐 ⑩ STYLE-CONFLICT 范式）
 *
 * 确定性事实只够判定「这里不对」，不够判定「该改成多少」（可能该删 height、可能该改 flex、
 * 可能该给具体 px——取决于该区块是定值还是流式）。故本函数**只产 issues**，由调用方并入
 * summary + logger 留痕，修复主线仍是生成铁律 + 重试。零产物改写 ⇒ 天然幂等、零回归风险。
 *
 * ## 已知缺口（首版不掩）
 *
 *   - **跨文件父链**：DOM `parentSid`（最近祖先 `data-section-id`）取的是**同文件**模板里的
 *     祖先。若区块在子 SFC、父槽位在 index.vue，则 `parentSid` 为 null ⇒ 退化为 NO_TRUTH。
 *     真值索引已带 `parentId`，故 T父 可由 `truthIndex.get(sid).parentId` 回退补齐（见 judge）。
 *   - **真值覆盖率**：依赖 planner 输出的 section 树（`effectiveSections` / `percentHeightTruth`）。
 *     两条链路均已接入：microcode 走 `effectiveSections`（与 D1 同源），vue3 走专用
 *     `percentHeightTruth`（避免连带激活 D1）。section 树无真值高度的区块仍 fail-open。
 *
 * 纯函数、零 import（不依赖 section-tree，避免把 import.meta/backend-root 带进来），可独立单测。
 */

/** 比例 flex 校验容差：|flex − T子/T父| 超过此值判为「比例未复现真值」。 */
export const H1_EPS_RATIO = 0.06;

/**
 * 判定域：内容区块类名（`前缀-语义-形状` 三明治，命名无关）。
 *
 * ⚠️ 形状段必须**是完整 dash 段**（前置 `-` + 结尾 `$`）。否则 `-tabs-icon` 会因 `icon`
 * 内含 `con` 而被 `[\w-]*?(con)` 误命中断成「容器」——实测产物 `c-*-monitor-tabs-icon`
 * （TabsIcon.vue 的图标元素）因此被误报为高度拉伸区块。收紧后 `-tabs-con` ✓、`-tabs-icon` ✗。
 * 形状后可再跟段（如 `-con-wrap`）：由 `[\w-]*?-` 吸收中间段、形状锚定末尾段满足。
 */
export const H1_BLOCK_CLS_RE =
  /[\w-]+-(?:table|button|header|content|footer|toolbar|form|chart|echarts|tabs|card|list|panel)[\w-]*?-(?:wrap|block|section|con|body|box)$/i;

/** 填充容器排除：填满壳 body 属合法，判它全是误伤。 */
export const H1_FILLER_RE = /(?:^|-)slot-con$|(?:^|-)con-con$|(?:^|-)container$|(?:^|-)root$/;

/** 开始标签匹配（与离线原型同源；`[^<>]` 天然跨行）。 */
const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
/** 静态 class 属性（排除 `:class` / `v-bind:class` 动态绑定）。 */
const CLS_RE = /(?<![:\w-])class\s*=\s*(["'])([\s\S]*?)\1/;
/** 静态 style 属性（排除 `:style` 动态绑定）。 */
const STYLE_RE = /(?<![:\w-])style\s*=\s*(["'])([\s\S]*?)\1/;
/** data-section-id（真值 join 键）。 */
const SID_RE = /(?<![:\w-])data-section-id\s*=\s*(["'])([^"']+)\1/;
/** `.class { body }`（从 common.less / SFC style 段抽取样式体，供 class→signal 反查）。 */
const LESS_RULE_RE = /\.([\w-]+)\s*\{([^{}]*)\}/g;
/**
 * 小数 flex（`flex: 0.764` / `flex: 1.5` / `flex: .5`）——整数 `flex: 1` 不视为比例信号
 * （整数是「等分」语义，与「按真值比例」不同源，不参与比值校验以免噪声）。
 */
const FRACT_FLEX_RE = /flex\s*:\s*(\d*\.\d+)/;
/** `height:100%`（容忍空格）。 */
const H100_RE = /height\s*:\s*100%/;
/** 自闭合语义标签（不入栈，避免破坏父子链）。注意：`<i>` 有闭合标签，**不**列入。 */
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'path']);

function toPosNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 收集「被平台壳槽位接管的子组件名」。
 *
 * 判据来源（2026-10-04 · traffic-monitor 族 30 条误报实锤）：
 *   产物 index.vue 形如 `<base-panel><template #header-right><HeaderSection /></template>…`，
 *   被 `#slot` 引用的子组件渲染进**壳槽位**（如标题栏），其 CSS 父链 = 槽位，而 figma 父链
 *    = 设计稿 frame ⇒ 两者不一致。此时子组件根元素的 `height:100%` 是「填满槽位」的合法写法，
 *   用 figma 真值判它撑满必然误报。剔除后：`HeaderSection`（#header-right）不再误报，
 *   而 `ContentSection`（内容区 flex 引用）仍照判 —— 正是 fb505213 真病灶要抓的。
 *
 * 命名无关：只认「大写开头的组件标签出现在 `<template #…>` 槽位内」这一平台结构。
 *
 * @param {string} indexContent 产物 index.vue 全文
 * @returns {Set<string>} 被槽位接管的组件名集合
 */
export function collectSlotBoundComponents(indexContent) {
  const names = new Set();
  if (typeof indexContent !== 'string' || !indexContent) return names;
  // 直接扫原文的 `<template #slotName>…</template>`（不去剥外层 template：外层贪婪匹配会
  // 把首个槽位起始标签一并吞掉，导致片段输入下收集为空）。
  for (const m of indexContent.matchAll(/<template\s+#[\w-]+[^>]*>([\s\S]*?)<\/template>/g)) {
    for (const t of m[1].matchAll(/<([A-Z][\w]*)/g)) names.add(t[1]);
  }
  return names;
}

/**
 * 建真值高度索引：`id → { height, parentId }`。
 *
 * 来源优先级：`figmaRoot`（任意节点，最权威）→ `effectiveSections`（section 树，含
 * `layoutMetadata.height`）补齐缺项。两者皆无 ⇒ 空索引（调用方 fail-open）。
 *
 * @param {{figmaRoot?: object, effectiveSections?: Array}} sources
 * @returns {Map<string, {height: (number|null), parentId: (string|null)}>}
 */
export function buildTruthHeightIndex(sources = {}) {
  const index = new Map();
  const setRec = (id, height, parentId) => {
    if (id == null) return;
    const key = String(id);
    const h = toPosNum(height);
    const prev = index.get(key);
    // figmaRoot 先写入（高优先）：已有 height 则不覆盖，仅补 parentId 缺失。
    if (prev) {
      if (prev.height == null && h != null) prev.height = h;
      if (prev.parentId == null && parentId != null) prev.parentId = parentId;
      return;
    }
    index.set(key, { height: h, parentId: parentId == null ? null : String(parentId) });
  };

  const root = sources.figmaRoot;
  if (root && typeof root === 'object') {
    const doc = root.document || root.node || root;
    const walk = (node, parentId) => {
      if (!node || typeof node !== 'object') return;
      const id = node.id != null ? String(node.id) : null;
      if (id) {
        const h = node.absoluteBoundingBox?.height ?? node.height;
        setRec(id, h, parentId);
      }
      const kids = Array.isArray(node.children) ? node.children : [];
      for (const c of kids) walk(c, id);
    };
    walk(doc, null);
  }

  const sections = sources.effectiveSections;
  if (Array.isArray(sections)) {
    const walk = (list, parentId) => {
      if (!Array.isArray(list)) return;
      for (const s of list) {
        if (!s || typeof s !== 'object') continue;
        const id = s.id != null ? String(s.id) : null;
        const h = s.layoutMetadata?.height ?? s.absoluteBoundingBox?.height ?? s.height;
        if (id) setRec(id, h, parentId);
        if (Array.isArray(s.children)) walk(s.children, id != null ? id : parentId);
      }
    };
    walk(sections, null);
  }

  // 清理：height 全空的记录无判定价值（保留 parentId 供上层回退）。仍留在索引里，
  // 由 judge 侧对 height==null 视作 NO_TRUTH。
  return index;
}

/**
 * 从产物文件集扫描「拉伸候选」。
 *
 * @param {Record<string,string>} files path → content
 * @returns {Array<{file, tag, classes, blockClass, sid, parentSid, signals}>}
 */
export function scanStretchCandidates(files) {
  const out = [];
  if (!files || typeof files !== 'object') return out;

  // ⓪ 平台壳槽位接管的组件名（这些子组件的根元素填满槽位属合法，见 collectSlotBoundComponents）。
  const indexPath = Object.keys(files).find((p) => /(^|\/)index\.vue$/.test(p));
  const slotBound = collectSlotBoundComponents(indexPath ? files[indexPath] : '');

  // ① 先收集所有 `.class { body }` 规则体（common.less 全文 + 各 SFC 的 <style> 段）。
  const lessBodies = new Map();
  const pushLess = (text) => {
    if (typeof text !== 'string' || text.indexOf('{') < 0) return;
    for (const m of text.matchAll(LESS_RULE_RE)) {
      const cls = m[1];
      if (!lessBodies.has(cls)) lessBodies.set(cls, []);
      lessBodies.get(cls).push(m[2]);
    }
  };
  for (const [fp, fc] of Object.entries(files)) {
    if (typeof fc !== 'string') continue;
    if (fp.endsWith('.less') || fp.endsWith('.css')) {
      pushLess(fc);
      continue;
    }
    if (!fp.endsWith('.vue')) continue;
    for (const sm of fc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) pushLess(sm[1]);
  }

  // ② 逐 SFC 扫 <template> 段（跳过 <script>，避免比较符 `<` 干扰标签栈）。
  for (const [fp, fc] of Object.entries(files)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const tplM = fc.match(/<template[^>]*>([\s\S]*)<\/template>/i);
    if (!tplM) continue;
    const tpl = tplM[1];

    const stack = []; // [{tag, classes, sid}]
    TAG_RE.lastIndex = 0;
    let m;
    while ((m = TAG_RE.exec(tpl)) !== null) {
      const closing = m[1];
      const tag = m[2].toLowerCase();
      const attrs = m[3] || '';
      const selfClose = m[4];
      if (closing) {
        if (stack.length) stack.pop();
        continue;
      }

      const clsM = attrs.match(CLS_RE);
      const styleM = attrs.match(STYLE_RE);
      const sidM = attrs.match(SID_RE);
      const classes = clsM ? clsM[2].split(/\s+/).filter(Boolean) : [];
      const style = styleM ? styleM[2] : '';
      const sid = sidM ? sidM[2] : null;

      const blockClass = classes.find((c) => H1_BLOCK_CLS_RE.test(c)) || null;
      const isFiller = classes.some((c) => H1_FILLER_RE.test(c));

      if (blockClass && !isFiller) {
        const sigs = new Set();
        if (H100_RE.test(style)) sigs.add('h100');
        const fm = style.match(FRACT_FLEX_RE);
        if (fm) sigs.add('ff:' + fm[1]);
        for (const c of classes) {
          for (const body of lessBodies.get(c) || []) {
            if (H100_RE.test(body)) sigs.add('h100');
            const b2 = body.match(FRACT_FLEX_RE);
            if (b2) sigs.add('ff:' + b2[1]);
          }
        }
        if (sigs.size > 0) {
          let parentSid = null;
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].sid) {
              parentSid = stack[i].sid;
              break;
            }
          }
          const componentName = String(fp).split('/').pop().replace(/\.vue$/i, '');
          out.push({
            file: fp,
            tag,
            classes: classes.slice(0, 3),
            blockClass,
            sid,
            parentSid,
            // 根元素（同文件无 DOM 祖先 sid）且被壳槽位接管 ⇒ 填满槽位合法，判定侧剔除。
            slotBound: !parentSid && slotBound.has(componentName),
            signals: [...sigs].sort(),
          });
        }
      }

      if (!selfClose && !VOID_TAGS.has(tag)) stack.push({ tag, classes, sid });
    }
  }

  return out;
}

/**
 * 判据 v2 判定。
 *
 * @param {Array} candidates scanStretchCandidates 产物
 * @param {Map} truthIndex buildTruthHeightIndex 产物
 * @returns {{issues: Array, stats: object}}
 */
export function judgeCandidates(candidates, truthIndex) {
  const issues = [];
  const stats = { candidates: candidates.length, hits: 0, safe: 0, noTruth: 0, slotBound: 0 };
  if (!Array.isArray(candidates) || !(truthIndex instanceof Map)) return { issues, stats };

  for (const c of candidates) {
    // 被壳槽位接管的子组件根元素：填满槽位合法（figma 父 ≠ CSS 父），剔除。
    if (c.slotBound) {
      stats.slotBound++;
      continue;
    }
    const selfRec = c.sid ? truthIndex.get(String(c.sid)) : null;
    const T_e = selfRec ? toPosNum(selfRec.height) : null;
    // T父：优先 DOM 最近祖先 sid（同文件）；缺失时回退真值索引里的 parentId（跨文件父链兜底）。
    let parentSid = c.parentSid || (selfRec ? selfRec.parentId : null);
    let T_p = parentSid ? toPosNum(truthIndex.get(String(parentSid))?.height) : null;

    if (T_e == null) {
      stats.noTruth++;
      continue;
    }

    let verdict = 'NO_TRUTH';
    let detail = '';
    for (const sig of c.signals) {
      if (sig === 'h100') {
        if (T_p != null) {
          if (Math.abs(T_e - T_p) > 1) {
            verdict = 'HIT';
            detail = `height:100% 撑满父容器（真值 T子${Math.round(T_e)} ≠ T父${Math.round(T_p)}，内容区块应为定值）`;
          } else {
            verdict = 'SAFE';
            detail = `height:100% 但 T子=T父=${Math.round(T_e)}（无偏差）`;
          }
        }
      } else if (sig.startsWith('ff:') && T_p != null && T_p > 0) {
        const f = Number(sig.slice(3));
        const exp = T_e / T_p;
        if (Math.abs(f - exp) > H1_EPS_RATIO) {
          verdict = 'HIT';
          detail = `比例 flex:${f} 未复现真值比 ${exp.toFixed(3)}（T子${Math.round(T_e)}/T父${Math.round(T_p)}）`;
        } else {
          verdict = 'SAFE';
          detail = `比例 flex:${f} ≈ 真值比 ${exp.toFixed(3)}（复现正确）`;
        }
      }
      if (verdict === 'HIT') break;
    }

    if (verdict === 'HIT') {
      stats.hits++;
      issues.push({
        file: c.file,
        tag: c.tag,
        blockClass: c.blockClass,
        classes: c.classes,
        sid: c.sid,
        parentSid,
        signal: c.signals.find((s) => s === 'h100' || s.startsWith('ff:')) || c.signals[0],
        truthChild: Math.round(T_e),
        truthParent: T_p == null ? null : Math.round(T_p),
        detail,
        hint:
          '该内容区块在 Figma 真值中是定值高度（T子 ≠ T父），产物用 height:100%/比例 flex 撑满父容器' +
          '会把同容器后续区块推出可视区。修复方向：按真值改定值高度 / 移除 height:100% / 修正 flex 比例。',
      });
    } else if (verdict === 'SAFE') {
      stats.safe++;
    } else {
      stats.noTruth++;
    }
  }

  return { issues, stats };
}

const EMPTY_STATS = () => ({
  candidates: 0,
  hits: 0,
  safe: 0,
  noTruth: 0,
  slotBound: 0,
  skipped: null,
});

/**
 * 主入口：检测产物中的「百分比高度拉伸」（只报不改）。
 *
 * @param {Record<string,string>} files path → content
 * @param {object} [ctx]
 * @param {Array} [ctx.effectiveSections] planner section 树（真值源，含 layoutMetadata.height）
 * @param {object} [ctx.figmaRoot] figma.json 根节点（可选，比 effectiveSections 更权威）
 * @param {number} [ctx.maxIssues=50] issues 上限（防止极端产物刷屏）
 * @returns {{issues: Array, stats: object}}
 */
export function resolvePercentHeightStretch(files, ctx = {}) {
  const stats = EMPTY_STATS();
  try {
    if (!files || typeof files !== 'object') {
      stats.skipped = 'no-files';
      return { issues: [], stats };
    }
    const truthIndex = buildTruthHeightIndex({
      figmaRoot: ctx.figmaRoot,
      effectiveSections: ctx.effectiveSections,
    });
    if (truthIndex.size === 0) {
      stats.skipped = 'no-truth-index';
      return { issues: [], stats };
    }
    const candidates = scanStretchCandidates(files);
    stats.candidates = candidates.length;
    if (candidates.length === 0) return { issues: [], stats };

    const judged = judgeCandidates(candidates, truthIndex);
    const maxIssues = Number.isFinite(ctx.maxIssues) ? ctx.maxIssues : 50;
    const hitFiles = [...new Set(judged.issues.map((i) => i.file))];
    return {
      issues: judged.issues.slice(0, maxIssues),
      stats: { ...judged.stats, hitFiles },
    };
  } catch (err) {
    stats.skipped = `error:${err?.message || String(err)}`;
    return { issues: [], stats };
  }
}

export default resolvePercentHeightStretch;
