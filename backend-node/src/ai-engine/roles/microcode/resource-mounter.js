/**
 * resource-mounter.js — 资源自动挂载与后处理模块
 *
 * 方案 A 拆分自 microcode-engineer.js。职责：
 * 1. 资源自动挂载（bg/icon/img 未引用资源的确定性兜底挂载）
 * 2. bg 多引用去重（P2-3）
 * 3. CSS 替代资源修复（url(${var}) → backgroundColor）
 * 4. LESS 变量归一化（style 内错误变量引用修复）
 * 5. 孤儿资源迁移 + 孤儿子组件剔除
 * 6. Phase 2 后处理（T02-T09）
 * 7. 尺寸联动 clamp（min-height 超根容器）
 * 8. 语义分流修复（flex-grow 像素量级误填）
 * 9. 下载失败资源 CSS 兜底注入（B2：背景/图标下载失败时自动注入渐变/纯色替代）
 *
 * 所有函数均为纯函数，logger 通过 options 注入。
 */

import {
  injectChartMinHeight,
  deduplicateBackgroundImages,
  validateContainerSize,
  validateResourceUsage,
} from '../../utils/post-process.js';
import { inferBackgroundStyle } from '../../utils/background-size-inference.js';
import {
  scoreMountTarget,
  inferComponentPrefix,
  HOST_SHELL_TAG_RE,
} from '../../utils/mount-target-scoring.js';
import {
  collectDeclaredBindings,
} from '../../utils/resource-import-guard.js';
import { safeLogger } from '../../logger/safe-logger.js';
import { extractSfcTemplate } from '../../utils/sfc-template-extractor.js';
import { resolveSpecifierToPath } from '../../utils/section-coverage-guard.js';
import { collectResourceVarRefsFromSfc } from '../../utils/resource-facts.js';
import { normalizeFixedSizeFlex } from '../../utils/fixed-size-normalizer.js';
// 量纲阈值与 FLEX 校验单点同源（code-structure-validator.js），杜绝「修复器一套、校验器一套」
import { FLEX_GROW_SCALES } from '../../validators/code-structure-validator.js';
import {
  buildResourceUsageCorpus,
  isResourceUsedInCorpus,
  filterAvailableResources,
} from '../../utils/resource-import-guard.js';
import { normalizeFileSegments } from '../../utils/chunk-meta-files.js';
import {
  extractLessVarReferences,
  isLessVarDeclared,
  safeLessVarValue,
} from './file-writer.js';
import { join } from 'node:path';
import { removeOverlappingSlotDom } from '../../utils/slot-dom-deduper.js';

// 🗑️ 2026-09-30（删减法）：此处原有 `const HOST_SHELL_TAG_RE = /^(base-panel|mc-panel)(-[a-z0-9]+)*$/i`。
//   该常量与 `microcode-engineer.js` 的死代码副本、`utils/mount-target-scoring.js` 的私有副本
//   共三份并存 ⇒ 本轮收敛为**唯一事实源** `utils/mount-target-scoring.js#HOST_SHELL_TAG_RE`
//   （策略说明 + 事故实证见该处 docblock；禁止往宿主外壳挂业务背景，否则 100% 100% 拉满整面板）。
//   本文件消费点（`findTemplateRootTag` 的 allowHostShell、`collectMountCandidates` 的 isHostShell）
//   已改为 import 该常量。

// 🗑️ 2026-09-30（删减法）：此处原有 `export function findExistingResourceBinding(allFiles, varName)`
//   （2026-09-08 加入，防同一资源被多组件重复挂载）。**全仓零调用点 = 死代码**，且判据比
//   `utils/mount-target-scoring.js#isResourceRendered` 更宽（`import <var>` 或 `:style="` 含变量名
//   即算 ⇒ 会误判「仅 import 未渲染」与「非背景引用如 `:src`」）⇒ 职责收敛到 `isResourceRendered`
//   这一唯一事实源（两个 engineer 的 N3 兜底已改用它做**无条件**护栏，覆盖锚点缺失路径）。
//   如需「找已绑定位置」的能力，请直接调 `isResourceRendered(files, varName)`。

// ══════════════════════════════════════════════════════════════
//  Section 1: 挂载点发现工具
// ══════════════════════════════════════════════════════════════

/**
 * 提取挂载关键词：mountTarget / 资源名 / targetDomHint / figmaPath 倒数第二段，
 * 词长≥3，剔除通用词（bg/background/icon/img 等）。
 */
export function extractMountKeywords(mapping) {
  const raw = [
    mapping.mountTarget,
    mapping.name,
    mapping.targetDomHint,
    String(mapping.figmaPath || '')
      .split('/')
      .slice(-2, -1)[0] || '',
  ];
  const words = [];
  const seen = new Set();
  for (const s of raw) {
    if (!s) continue;
    for (const w of String(s).split(/[^a-zA-Z0-9一-鿿]+/)) {
      const lw = w.toLowerCase();
      if (lw.length < 3) continue;
      if (
        /^(bg|background|icon|img|image|area|region|container|slot|con|switch|card|active|default|state)$/i.test(
          lw,
        )
      )
        continue;
      if (!seen.has(lw)) {
        seen.add(lw);
        words.push(lw);
      }
    }
  }
  return words;
}

/** 在 vue 文件中找第一个 class 含关键词的开标签，返回完整开标签字符串 */
export function findTagByClassKeyword(content, kw) {
  if (!content || typeof content !== 'string') return null;
  const kwNorm = String(kw || '').toLowerCase();
  if (!kwNorm) return null;
  // 🛡️ 2026-09-28 词形归一（c-env-monitor-efe76c26 实锤）：mountTarget="tabs-list"（复数）与
  //   模板类 `.c-env-monitor-tab-list`（单数）只差单复数 → 旧 `includes` 精确子串匹配 miss →
  //   走 S7 候选池兜底 → **错挂父容器**（bg1 落到 `.c-env-monitor-sub-t-con`）。
  //   此处：先精确匹配；未命中再对「每段去尾 s」后比（仅当去尾后仍 ≥3 字符，防 bus→bu 类误配）。
  const dePlural = (s) =>
    String(s)
      .toLowerCase()
      .split('-')
      .map((seg) => (seg.length >= 4 && /s$/.test(seg) ? seg.slice(0, -1) : seg))
      .join('-');
  const kwDe = dePlural(kwNorm);
  // 🛡️ ①（2026-09-29 治本 · mc-max-1790688321049-447d01cc 实锤）：**class 片段（token）**匹配。
  //
  // ## 旧实现的两种误配（全语料差分审计：2095 条资源条目里 1156 条命中结果变化）
  // 1. **单字符 / 短 mountTarget 劫持无关元素**：Figma 卡片内标题行的图层名就叫 `t`，
  //    `mountTarget = 't'` ⇒ `"c-traffic-monitor-card".includes('t')` = true ⇒
  //    标题背景 `bg2`(2:3475) 被挂到**卡片根**，与卡片自身背景 `88:36`(bg4) 抢同一 `:style`
  //    （JS 对象字面量后键胜出 ⇒ 互相覆写）。实测 `findTagByClassKeyword(CardGrid.vue,'t')`
  //    返的就是 `class="c-traffic-monitor-card"` 那个标签。
  // 2. **去复数后再裸子串**：`mountTarget = 'cons'` ⇒ `dePlural('cons')` = `'con'` ⇒
  //    `…active-icon`.includes('con') = **true**（“i**con**”里含 con）⇒ 背景挂到图标上。
  //
  // ## 正确语义
  // 把 `class` / `:class` 属性值切成**片段**（`-` 与引号/空格/括号等非 `[a-z0-9-]` 都是分隔符），
  // 要求 kw 与某个片段「片段边界对齐」：`tok === kw` / `tok.startsWith(kw+'-')` /
  // `tok.endsWith('-'+kw)` / `tok.includes('-'+kw+'-')`。
  //   `t`         → 只匹配 `class="t"` 或 `c-x-t-y`；不再匹配 `c-traffic-monitor-card`
  //   `card`      → 匹配 `c-traffic-monitor-card` ✅
  //   `cons`      → 匹配 `c-device-monitor-cons-grid` ✅，不再匹配 `…active-icon` ✅
  //   `active`    → 匹配 `…switch-item--active` / `…tab-item--active`（动态 `:class` 里的形态）✅
  //   `tabs-list` → 经去复数匹配 `c-env-monitor-tab-list` ✅
  // 与既有铁律「按标签名/类名匹配必须带词边界」同源。
  //
  // ⚠️ 必须同时解析 `:class`（不只是静态 `class`）：激活态背景的宿主体现在
  // `:class="{ 'x--active': cond }"` / `:class="['x', cond ? 'x--active' : 'x-default']"` 里。
  const clsValRe = /(?:^|[\s]):?class\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const tokensOf = (attrs) => {
    const out = [];
    clsValRe.lastIndex = 0;
    let cm;
    while ((cm = clsValRe.exec(attrs)) !== null) {
      const val = cm[1] != null ? cm[1] : cm[2];
      // ⚠️ 片段化必须**保留中文**（`\u4e00-\u9fa5`）：图层次层名常有 `点背景`/`默认`/`激活`，
      //    产物 class 是 `c-377b6f-点背景`。若把中文当分隔符，整段会被丢掉 ⇒ mountTarget 永远 miss
      //    （全语料差分审计实测 9 例误伤）。与 `wordsOf` 的既有口径一致。
      for (const tok of String(val || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5-]+/)) {
        if (tok) out.push(tok);
      }
    }
    return out;
  };
  const segOk = (tok, kw) =>
    tok === kw ||
    tok.startsWith(`${kw}-`) ||
    tok.endsWith(`-${kw}`) ||
    tok.includes(`-${kw}-`);
  const tags = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/g;
  let m;
  while ((m = tagRe.exec(content)) !== null) {
    if (/^script$/i.test(m[1]) || /^style$/i.test(m[1])) continue;
    const attrs = m[2] || '';
    const tokens = tokensOf(attrs);
    if (tokens.length > 0) tags.push({ raw: m[0], tokens });
  }
  const exact = tags.find((t) => t.tokens.some((tok) => segOk(tok, kwNorm)));
  if (exact) return exact.raw;
  const fuzzy = tags.find((t) =>
    t.tokens.some((tok) => segOk(dePlural(tok), kwDe)),
  );
  return fuzzy ? fuzzy.raw : null;
}

/**
 * 🛡️ 阶段3（2026-09-17）：识别模板里 v-for 重复单元的开标签（含 class）。
 *
 * 背景：12 卡共享 bg3（sharedBy=12）应挂到「每个卡片」（v-for item）而非「卡片容器」。
 * 此前挂载用 mountTarget 关键词匹配到外层容器 class，bg 被 background-size:100% 拉伸
 * 铺满整个容器（而非逐卡铺 117×64 单元背景）。本函数找到 v-for 循环的 item 开标签，
 * 供共享背景精确挂到 item（每个循环渲染的卡片都获得背景）。
 *
 * 🛡️ 阶段4修复（2026-09-17）：vue3 单文件里常有**多个 v-for**（左侧导航 nav-tab +
 * 右侧设备网格 device-card），此前盲目返回第一个 → bg3 误挂到导航 tab（vue3 错位实锤）。
 * 本函数改为：收集所有 v-for item，优先匹配 preferKeywords（mountTarget 语义），
 * 否则返回**最后一个**（数据网格通常在导航之后，共享背景挂数据单元而非导航）。
 *
 * @param {string} content owner 组件内容（.vue 全文）
 * @param {string[]} [preferKeywords] 优先匹配的语义关键词（如 ['cons','device','grid','card']）
 * @returns {string|null} v-for item 的开标签（含 class），找不到返回 null
 */
export function findVForItemTag(content, preferKeywords = []) {
  if (!content || typeof content !== 'string') return null;
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)>/g;
  const items = [];
  let m;
  while ((m = tagRe.exec(content)) !== null) {
    const attrs = m[2] || '';
    if (!/\bv-for\b/.test(attrs)) continue;
    if (/^script$/i.test(m[1]) || /^style$/i.test(m[1])) continue;
    // 提取静态 class（仅 `class=`，排除 `:class=` 动态绑定——动态类名不是可挂载的确定性单元）
    const clsM = attrs.match(/(?:^|\s)class\s*=\s*["']([^"']*)["']/);
    if (clsM && clsM[1].trim()) {
      items.push({ tag: m[0], cls: clsM[1].toLowerCase() });
    }
  }
  if (items.length === 0) return null;
  // 优先匹配语义关键词（mountTarget 语义，如 cons→device/grid/card）
  const kws = (Array.isArray(preferKeywords) ? preferKeywords : [])
    .map((k) => String(k).toLowerCase())
    .filter((k) => k.length >= 2);
  if (kws.length > 0) {
    const hit = items.find((it) => kws.some((k) => it.cls.includes(k)));
    if (hit) return hit.tag;
  }
  // 默认返回最后一个（数据网格通常在导航之后；共享背景挂数据单元而非导航）
  return items[items.length - 1].tag;
}

/**
 * 找模板根元素（<template> 后第一个开标签）。
 *
 * P0-5：根元素是宿主外壳（base-panel / mc-panel）时返回 null。
 * 外壳不是组件自己的根容器，往它上面兜底挂背景会被 100% 100% 拉伸。
 * 内部用法如需「无论是不是外壳都要拿到根标签」，可传 { allowHostShell: true }。
 */
export function findTemplateRootTag(content, options = {}) {
  if (!content || typeof content !== 'string') return null;
  const tm = content.match(
    /<template[^>]*>\s*<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/,
  );
  if (!tm) return null;
  if (/^script$/i.test(tm[1]) || /^style$/i.test(tm[1])) return null;
  if (!options.allowHostShell && HOST_SHELL_TAG_RE.test(tm[1])) return null;
  return tm[0].replace(/^<template[^>]*>\s*/, '');
}

/**
 * 提取 index.vue 模板里「区域级容器」候选（按出现顺序）。
 *
 * 用途：当 styleEvidence 确认根容器无背景（background.allowed===false）时，区域背景
 * 不能挂根容器（会触发 CODE-014 根容器臆造 BLOCK），必须挂到对应 section 容器。
 * 本方法定位「内容根」（base-panel 外壳下的真实 <div class=root> 或模板根元素）的
 * 直接子容器（通常是各 <section> / 区域 div），供区域背景轮流挂载。
 *
 * @returns {string[]} 开标签字符串数组（直接子容器，已过滤插槽 <template>）
 */
export function findRegionContainerCandidates(content) {
  if (!content || typeof content !== 'string') return [];
  // ⚠️ 必须用贪婪匹配到【最外层】</template>
  const tplMatch = content.match(/<template[^>]*>([\s\S]*)<\/template>/i);
  const tpl = tplMatch ? tplMatch[1] : content;

  // 1. 模板根元素
  const rootMatch = tpl.match(
    /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/,
  );
  if (!rootMatch) return [];
  const rootTag = rootMatch[1];
  const rootOpenEnd = tpl.indexOf(rootMatch[0]) + rootMatch[0].length;

  const isContentTag = (t) =>
    /^(div|section|article|main|header|footer|aside)$/i.test(t);

  let contentRootTag;
  let contentRootOpenEnd;
  if (isContentTag(rootTag)) {
    // 根本身就是内容容器
    contentRootTag = rootTag;
    contentRootOpenEnd = rootOpenEnd;
  } else {
    // 组件外壳（base-panel 等）：找其下第一个「非 <template> 插槽」的真实内容子元素作为内容根
    const childRe =
      /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
    let depth = 0;
    let cm = null;
    const s = tpl.slice(rootOpenEnd);
    let mk;
    while ((mk = childRe.exec(s)) !== null) {
      const isClose = mk[1] === '/';
      const isSelf = mk[4] === '/';
      if (depth === 0 && !isClose && !isSelf && !/^template$/i.test(mk[2])) {
        cm = mk;
        break;
      }
      if (!isClose && !isSelf) depth++;
      else if (isClose) depth--;
    }
    if (!cm) return [];
    contentRootTag = cm[2];
    contentRootOpenEnd = rootOpenEnd + (cm.index + cm[0].length);
  }

  // 2. 从内容根内部按【相对深度】收集其直接子元素（depth===0），过滤插槽 <template>
  // P1-5：结果只保留内容容器标签（isContentTag）
  const rest = tpl.slice(contentRootOpenEnd);
  const tagRe =
    /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
  const result = [];
  let depth = 0;
  let m;
  while ((m = tagRe.exec(rest)) !== null) {
    const isClose = m[1] === '/';
    const isSelfClose = m[4] === '/';
    if (isSelfClose) continue;
    if (isClose) {
      depth--;
      if (depth < 0) break;
    } else {
      if (
        depth === 0 &&
        !/^template$/i.test(m[2]) &&
        isContentTag(m[2]) &&
        !HOST_SHELL_TAG_RE.test(m[2])
      ) {
        result.push(m[0]);
      }
      depth++;
    }
  }
  return result;
}

/** 从区域容器候选里挑第一个尚未被占用的 */
export function pickNextRegionContainer(content, usedSet) {
  const candidates = findRegionContainerCandidates(content);
  for (const tag of candidates) {
    if (!usedSet.has(tag)) {
      usedSet.add(tag);
      return tag;
    }
  }
  return null;
}

/**
 * 收集模板里全部可作为挂载点的元素（跨 .vue，index.vue 优先）。
 * @param {Object} files 文件映射
 * @param {{varName?:string}} [opts] 传 `varName` 时附带该资源的背景归属判据 `bgOwner`
 * @returns {Array<{file:string, tag:string, tagName:string, cls:string, depth:number, isHostShell:boolean, hasBgBinding:boolean, bgOwner:'none'|'self'|'other'|'literal'|null, dataSectionId:string|null}>}
 */
export function collectMountCandidates(files, opts = {}) {
  const out = [];
  const entries = Object.entries(files || {})
    .filter(
      ([p, c]) =>
        typeof p === 'string' && /\.vue$/i.test(p) && typeof c === 'string',
    )
    .sort(([a], [b]) =>
      a === 'package/index.vue' ? -1 : b === 'package/index.vue' ? 1 : 0,
    );
  const VOID_TAGS = /^(img|br|hr|input|meta|link|source|path|circle|rect)$/i;
  for (const [file, content] of entries) {
    // 🛡️ 2026-09-29 治本（本轮实锤：c-traffic-monitor-f0c05ecc 的「当日总流量」背景图整块丢失）
    //   旧实现 `content.match(/<template>([\s\S]*?)<\/template>/i)` 是 **lazy** 正则：
    //   根 `<template>` 内嵌具名插槽（`<template #header-right>…</template>`）时会**提前闭合**。
    //   实测 index.vue 76 行、只匹配到 5 行 ⇒ **index.vue 的全部锚点/容器都没进候选池**
    //   （含 `data-section-id="2:3660"` 这个正确挂载点）⇒ 后处理**丧失纠错能力**，
    //   只能任由 LLM 按被降级的 `mountTarget` 去挂 ⇒ 426×91 的卡片背景被挂到 420×807 的整槽容器。
    //   改用**单一事实源** `extractSfcTemplate`（见 sfc-template-extractor.js 头注：本 lazy 正则是
    //   「同族四例」家族缺陷，前 3 例已各自治本，本处是第 4 例）。
    //   ⚠️ 刻意不剥具名插槽：插槽内组件标签/容器同样是合法挂载候选。
    const body = extractSfcTemplate(content) ?? content;
    const tagRe =
      /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
    let depth = 0;
    let m;
    while ((m = tagRe.exec(body)) !== null) {
      const [, slash, tagName, attrs, selfClose] = m;
      if (slash === '/') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (/^(script|style|template)$/i.test(tagName)) continue;
      // 🛡️ P0-3（2026-10-01）：原为 `/\bclass\s*=\s*["']…/`——`\b` 在 `:class=` 处**成立**
      //   （`:` 非词字符、`c` 词字符 ⇒ 有词边界）⇒ 把 `:class="row.selected ? 'a' : 'b'"`
      //   当作静态 class 捕获，`cls` 变成 JS 表达式文本。该 cls 直接喂给
      //   `scoreMountTarget → mountClsTokens(cand.cls)` ⇒ 评分 token 全污染（背景挂载点选错）。
      //   改为 `(?:^|\s)` 前导断言，与同文件 `:212` 的静态 class 口径一致（仅 `class=`，排除 `:class=`）。
      const clsM = attrs.match(/(?:^|\s)class\s*=\s*["']([^"']*)["']/);
      const cls = clsM ? clsM[1].trim().split(/[\s,]+/)[0] : '';
      // 🛡️ 2026-09-29：带上确定性锚（确定性装配骨架把 section id 写在容器上）。
      //   供 scoreMountTarget 做「几何父容器」短路（防语义祖先回退把 bg 挂错层级）。
      const dsM = attrs.match(/\bdata-section-id\s*=\s*["']([^"']*)["']/);
      out.push({
        file,
        tag: m[0],
        tagName,
        cls,
        depth,
        isHostShell: HOST_SHELL_TAG_RE.test(tagName),
        hasBgBinding: /background/i.test(attrs || ''),
        // 🛡️ ②（2026-09-29）：带**资源归属**的背景判据（`none`/`self`/`other`/`literal`）。
        //   旧的 `hasBgBinding` 既宽（`/background/i` 连类名都会命中）又与 varName 无关 ⇒
        //   「优先选没有 bg 绑定的标签」会把**属于别的资源的**元素当成空闲点。
        //   仅在调用方传入 `opts.varName` 时计算，保持向后兼容。
        bgOwner: opts.varName ? bgBindingOwnership(attrs, opts.varName) : null,
        dataSectionId: dsM ? dsM[1] : null,
      });
      if (!selfClose && !VOID_TAGS.test(tagName)) depth++;
    }
  }
  return out;
}

/**
 * 从候选池里用统一评分挑最优挂载点。
 * @param {Object} mapping
 * @param {Array} pool
 * @param {{componentPrefix?:string, skipBound?:boolean, usedTags?:Set<string>}} [opts]
 * @returns {{file:string, tag:string, keyword:string, score:number, cls:string}|null}
 */
export function pickBestMountTarget(mapping, pool, opts = {}) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const usedTags = opts.usedTags || new Set();
  let usable = pool.filter(
    (c) => c && c.tag && !c.isHostShell && !usedTags.has(c.tag),
  );
  if (opts.skipBound) {
    // 🛡️ ②（2026-09-29）：有资源归属判据时优先按「**本资源未占用**」筛（`bgOwner === 'none'`），
    //   而不是旧的「这个标签有没有 background 字样」——后者会把**别的资源**的宿主当空闲点，
    //   导致 `injectBgStyleBinding` 追加第二套四件套互相覆写。
    const isFree = (c) =>
      c.bgOwner != null ? c.bgOwner === 'none' : !c.hasBgBinding;
    const noBg = usable.filter(isFree);
    if (noBg.length > 0) usable = noBg;
  }
  const ranked = usable
    .map((c) => ({
      cand: c,
      score: scoreMountTarget(mapping, c, {
        componentPrefix: opts.componentPrefix || '',
      }),
    }))
    .filter((r) => Number.isFinite(r.score) && r.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;
  const top = ranked[0];
  return {
    file: top.cand.file,
    tag: top.cand.tag,
    cls: top.cand.cls || '',
    score: top.score,
    keyword: `${top.cand.keyword || top.cand.cls || top.cand.tagName}(score:${top.score.toFixed(2)})`,
  };
}

/**
 * 按 figmaBox 推导 icon/img 渲染尺寸（单边封顶 AUTO_MOUNT_ICON_MAX_PX）。
 * 无有效尺寸返回 null（调用方走 max-* 兜底或跳过）。
 */
export function iconSizeFromFigmaBox(figmaBox) {
  if (!figmaBox || Number(figmaBox.width) <= 0 || Number(figmaBox.height) <= 0) return null;
  const scale = Math.min(
    1,
    AUTO_MOUNT_ICON_MAX_PX / Math.max(Number(figmaBox.width), Number(figmaBox.height)),
  );
  return {
    width: Math.round(Number(figmaBox.width) * scale),
    height: Math.round(Number(figmaBox.height) * scale),
  };
}

function imgTagHasPxSize(tag) {
  if (!tag) return false;
  const hasAttr =
    /(?:^|\s)width\s*=\s*["']?\d+(?:\.\d+)?(?:px)?["']?/i.test(tag) &&
    /(?:^|\s)height\s*=\s*["']?\d+(?:\.\d+)?(?:px)?["']?/i.test(tag);
  const hasStyle =
    /(?:^|[;\s"'])width\s*:\s*\d+(?:\.\d+)?px/i.test(tag) &&
    /(?:^|[;\s"'])height\s*:\s*\d+(?:\.\d+)?px/i.test(tag);
  return hasAttr || hasStyle;
}

function applyPxSizeToImgTag(tag, size) {
  const w = Math.round(Number(size.width));
  const h = Math.round(Number(size.height));
  const dim = `width:${w}px;height:${h}px;object-fit:contain`;
  if (/style\s*=\s*"/i.test(tag)) {
    return tag.replace(/style\s*=\s*"([^"]*)"/i, (_m, s) => {
      const next = String(s)
        .replace(/(?:^|;)\s*width\s*:\s*[^;]*/gi, '')
        .replace(/(?:^|;)\s*height\s*:\s*[^;]*/gi, '')
        .replace(/(?:^|;)\s*object-fit\s*:\s*[^;]*/gi, '')
        .replace(/^[;\s]+|[;\s]+$/g, '');
      return `style="${next ? `${next};${dim}` : dim}"`;
    });
  }
  return tag.replace(/\s*\/?>$/, (tail) => ` style="${dim}"${tail}`);
}

/**
 * 🛡️ 2026-09-16（c-traffic-monitor-89c245a1 实锤）：LLM 已写 `<img :src="icon1">`
 * 但未带 figmaBox 像素尺寸（常配 `width/height:100%` + 无界父容器）→ 图标被撑成整面板。
 * 不另插 auto-mounted-icon，只给已有 img 装配 width/height px。已有 px 尺寸则幂等跳过。
 *
 * @returns {{ content: string, patched: boolean }}
 */
export function ensureReferencedIconSize(content, varName, size) {
  if (!content || !varName || !size || Number(size.width) <= 0 || Number(size.height) <= 0) {
    return { content, patched: false };
  }
  const srcRe = new RegExp(`:src\\s*=\\s*["']${varName}["']`);
  const imgRe = /<img\b[^>]*>/gi;
  let patched = false;
  const next = content.replace(imgRe, (tag) => {
    if (!srcRe.test(tag)) return tag;
    if (imgTagHasPxSize(tag)) return tag;
    patched = true;
    return applyPxSizeToImgTag(tag, size);
  });
  return { content: next, patched };
}

/**
 * 向开标签注入/合并 :style 背景绑定。
 * @param {Object} [mapping] - resourceDomMapping 条目；有 figmaBox 时用实际尺寸
 */
/**
 * 🛡️ ②（2026-09-29 治本）：从 `backgroundImage` 的值表达式里抽出「被引用的标识符 / 字面量路径」。
 *
 * 覆盖产物里出现过的全部形态：
 *   `backgroundImage: url(bg3)`                     → var bg3
 *   `backgroundImage: 'url(' + bg3 + ')'`           → var bg3
 *   ``backgroundImage: `url(${bg3})` ``             → var bg3
 *   `backgroundImage: 'url(../resources/images/x.png)'` → literal ../resources/images/x.png
 *   `background-image: url(...)`（原生 style 属性）  → 同上
 *
 * @returns {{kind:'var'|'literal'|'none', name:string|null}}
 */
function extractBgImageRef(fragment) {
  const f = String(fragment || '');
  if (!f) return { kind: 'none', name: null };
  // ① 模板字面量内插值：`url(${bg3})`
  const tpl = /\$\{\s*([A-Za-z_$][\w$]*)\s*\}/.exec(f);
  if (tpl) return { kind: 'var', name: tpl[1] };
  // ② 字符串拼接：'url(' + bg3 + ')'
  const cat = /\+\s*([A-Za-z_$][\w$]*)\s*\+/.exec(f);
  if (cat) return { kind: 'var', name: cat[1] };
  // ③ 直接绑定：url(bg3) / url('./x.png')
  const urlM = /url\(\s*([^)]*?)\s*\)/.exec(f);
  if (urlM) {
    const inner = urlM[1].trim().replace(/^['"]|['"]$/g, '');
    if (/^[A-Za-z_$][\w$]*$/.test(inner)) return { kind: 'var', name: inner };
    return { kind: 'literal', name: inner };
  }
  return { kind: 'none', name: null };
}

/**
 * 取 `backgroundImage` 键的值片段（从值起始到「同层的 `,` 或 `}`」为止，跳过引号/模板字符串）。
 * @returns {string|null} 找不到该键时返回 null
 */
function extractBgImageFragment(text) {
  const s = String(text || '');
  const m = /background-?[Ii]mage\b\s*:\s*/.exec(s);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 0;
  let inStr = null;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']') { depth--; continue; }
    if (ch === '}') {
      if (depth === 0) return s.slice(start, i);
      depth--;
      continue;
    }
    if (ch === ',' && depth === 0) return s.slice(start, i);
  }
  return s.slice(start);
}

/**
 * 🛡️ ②（2026-09-29 治本）：判定某个标签（或 `:style` 表达式）上已存在的背景图**归属**。
 *
 * ## 为什么需要它（实证 `mc-max-1790688321049-447d01cc`）
 * 旧判据 `backgroundBoundToVar(inner, varName)` **只按本 varName 判**（且只需 `inner` 里出现该
 * 名字即可），而 `resource-mount-plan.js:433` 的「标签已有 `backgroundImage` ⇒ 幂等跳过」又
 * **与 varName 无关**。两者合起来导致**谁先谁后都错**：
 *   - 先挂 A 资源 → 挂 B 资源时旧判据不拦 ⇒ `injectBgStyleBinding` **追加第二套完整四件套**，
 *     JS 对象字面量**后键胜出** ⇒ B 的图与几何把 A 顶掉（实测卡片根同时含
 *     `88:36` 的 `backgroundPosition: '1px 31px'` 与 `2:3475` 的 `url(bg2)` + `'0px 16px'`）；
 *   - 先挂外来背景 → 正确资源被「已有 backgroundImage」**永久挡住**（`2:3475` 的宿主缺失后
 *     退化到卡片根，正是这条把我方资源挤掉）。
 *
 * ⇒ 唯一正确口径 = **判「这张背景图是不是本资源的」**，而不是「有没有背景图」/「有没有这个名字」。
 *
 * @param {string} text 开标签字符串 或 `:style` 表达式 / 原生 style 内容
 * @param {string} varName 本资源的变量名
 * @returns {'none'|'self'|'other'|'literal'}
 *   - `none`    该处没有背景图绑定 → 可以挂
 *   - `self`    已绑定**本资源** → 幂等，零改动
 *   - `other`   已绑定**别的资源变量** → 宿主被占，禁挂（fail-closed）
 *   - `literal` 已绑定**字面量路径**（非变量）→ 宿主被占，禁挂（fail-closed）
 */
export function bgBindingOwnership(text, varName) {
  if (!text || !varName) return 'none';
  const frag = extractBgImageFragment(text);
  if (frag === null) return 'none';
  const ref = extractBgImageRef(frag);
  if (ref.kind === 'none') return 'none';
  if (ref.kind === 'literal') return 'literal';
  return ref.name === String(varName) ? 'self' : 'other';
}

/**
 * 向开标签注入/合并 :style 背景绑定。
 * @param {Object} [mapping] - resourceDomMapping 条目；有 figmaBox 时用实际尺寸
 * @param {Array} [diagnostics] - 可选出参收集器；宿主被外来背景占用时推入诊断（不静默）
 *
 * 🛡️ 幂等（2026-09-29 · c-device-monitor-fd242661 实锤）：
 *   该资源在映射表里可能有多条 owner（每个重复单元一个），当它们的
 *   `[data-section-id="…"]` 在产物中都不存在时，会**逐个退化到同一条关键字回退路径**、
 *   命中**同一个** DOM 节点，于是本函数被连续调用 N 次，`:style` 被叠加成
 *   `{ ...{ ...{ ...{ backgroundImage: url(bg3) } } } }` —— 实测 N=12，
 *   同一 `backgroundImage` 在同一个 `:style` 里声明 **12 次**（前后矛盾 + 重复声明）。
 *   原因：叠加分支的 `{ ...${inner}, … }` **不检查 inner 是否已含同一绑定**。
 *   修复：进入叠加前先判「已绑定到同一 varName」⇒ 直接返回 null（零改动、幂等）。
 *   放在本函数内（而非各调用点）——5 个调用点共享同一事实，避免各修各的。
 *
 * 🛡️ ② 归属判据（2026-09-29 治本 · mc-max-1790688321049-447d01cc 实锤）：
 *   旧判据只按本 varName 判 ⇒ **换一个 varName 就再追加一整套四件套**（后键胜出 → 互相覆写）；
 *   且标签上若已有**外来**背景（别的 var / 字面量路径），同样会被当成「可挂」而叠加。
 *   现改为 `bgBindingOwnership`：
 *     - `self`    → 返回 null（幂等）
 *     - `other` / `literal` → **返回 null 且不追加**（fail-closed），并把诊断交给 `diagnostics`
 *       ⇒ 宿主被外来背景占用时**绝不静默覆写**，交由上游据诊断决定（通常是宿主锚点缺失问题）。
 */
export function injectBgStyleBinding(content, tag, varName, mapping = null, diagnostics = null) {
  if (!content || !tag) return null;
  const bg = inferBackgroundStyle(mapping);
  const styleExpr = `{ backgroundImage: 'url(' + ${varName} + ')', backgroundSize: '${bg.size}', backgroundPosition: '${bg.position}', backgroundRepeat: '${bg.repeat}' }`;
  const pushConflict = (own, where) => {
    if (Array.isArray(diagnostics)) {
      diagnostics.push({
        reason: 'bg-binding-conflict',
        var: varName,
        occupiedBy: own,
        where,
      });
    }
  };
  let newTag;
  const styleRe = /:style="([^"]*)"/;
  if (styleRe.test(tag)) {
    const inner = (tag.match(styleRe)[1] || '').trim();
    if (!/^\{[\s\S]*\}$/.test(inner)) return null;
    const own = bgBindingOwnership(inner, varName);
    if (own === 'self') return null; // 幂等：已绑定本资源
    if (own !== 'none') {
      pushConflict(own, ':style');
      return null; // fail-closed：宿主已被外来背景占用
    }
    newTag = tag.replace(
      styleRe,
      `:style="{ ...${inner}, backgroundImage: 'url(' + ${varName} + ')', backgroundSize: '${bg.size}', backgroundPosition: '${bg.position}', backgroundRepeat: '${bg.repeat}' }"`,
    );
  } else {
    // 无 `:style`：原生 `style="…"` 上也可能已有背景（含字面量路径）→ 同源判据先查一遍
    const rawRe = /\bstyle="([^"]*)"/;
    const rawM = tag.match(rawRe);
    if (rawM) {
      const own = bgBindingOwnership(rawM[1], varName);
      if (own === 'self') return null;
      if (own !== 'none') {
        pushConflict(own, 'style');
        return null;
      }
    }
    newTag = tag.replace(/\/?>$/, (tail) => ` :style="${styleExpr}"${tail}`);
  }
  if (!newTag || newTag === tag) return null;
  const pos = content.indexOf(tag);
  if (pos < 0) return null;
  return content.slice(0, pos) + newTag + content.slice(pos + tag.length);
}

/**
 * 🛡️ 确定性修复（2026-09-21）：**移除从空 defineProps 解构资源变量的无效声明**。
 *
 * 事故 c-env-monitor-45e45542：LLM 在 TabsIcon.vue 生成：
 * ```js
 * const props = defineProps({})
 * const { icon2, icon3 } = props
 * ```
 * 后果链：
 * 1. `collectDeclaredBindings` 把 `{ icon2, icon3 }` 识别为"已声明"（解构）
 * 2. `ensureResourceImportInVue` 撞名复核命中 → 跳过 import 注入
 * 3. 运行时 `props.icon2` = undefined（defineProps 是空的）→ 图标不显示
 *
 * 本函数检测并移除这种无效模式：
 * - `const { ...资源变量... } = props`（或 `= defineProps(...)`）
 * - 且 defineProps 的参数对象不包含这些变量
 *
 * 移除后，`collectDeclaredBindings` 不再识别这些变量为已声明，
 * 正常 import 注入流程（ensureResourceImportsForRefs）接管。
 *
 * @param {string} code Vue SFC 内容
 * @returns {string} 修复后的内容
 */
export function fixBrokenPropsDestructuring(code) {
  if (typeof code !== 'string' || code.length === 0) return code;

  // 提取 <script setup> 块
  const scriptMatch = code.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return code;

  const scriptContent = scriptMatch[1];
  let fixedScript = scriptContent;

  // 检测 defineProps 的参数（支持对象和泛型两种形式）
  const definePropsArgs = new Set();
  // 形式1: defineProps({ icon1: { type: String }, icon2: String })
  for (const m of scriptContent.matchAll(/defineProps\s*\(\s*\{([^}]*)\}\s*\)/g)) {
    const args = m[1];
    for (const part of args.split(',')) {
      const name = part.trim().split(':')[0]?.trim().replace(/\?$/, '');
      if (name) definePropsArgs.add(name);
    }
  }
  // 形式2: defineProps<{ icon1: string; icon2: string }>()
  for (const m of scriptContent.matchAll(/defineProps\s*<\s*\{([^}]*)\}\s*>\s*\(\s*\)/g)) {
    const args = m[1];
    for (const part of args.split(/[;,]/)) {
      const name = part.trim().split(':')[0]?.trim().replace(/\?$/, '');
      if (name) definePropsArgs.add(name);
    }
  }

  // 检测并移除无效的资源变量解构
  // 模式: const { icon2, icon3 } = props 或 const { icon2, icon3 } = defineProps(...)
  const destructureRe = /const\s+\{([^}]+)\}\s*=\s*(?:props|defineProps\s*\([^)]*\))/g;
  for (const m of fixedScript.matchAll(destructureRe)) {
    const destructuredVars = m[1].split(',').map(s => s.trim()).filter(Boolean);
    // 检查这些变量是否都是资源变量（bgN/iconN/imgN 模式）
    const resourceVars = destructuredVars.filter(v => /^(bg|icon|img)\d+$/i.test(v));
    if (resourceVars.length === 0) continue;

    // 检查这些变量是否真的在 defineProps 中声明
    const allDeclared = resourceVars.every(v => definePropsArgs.has(v));
    if (allDeclared) continue; // 合法声明，保留

    // 部分或全部未声明 → 移除整个解构语句
    // 保留非资源变量（如果有）
    const nonResourceVars = destructuredVars.filter(v => !/^(bg|icon|img)\d+$/i.test(v));
    if (nonResourceVars.length > 0) {
      // 替换为只包含非资源变量的解构
      fixedScript = fixedScript.replace(m[0], `const { ${nonResourceVars.join(', ')} } = props`);
    } else {
      // 全部是无效资源变量，移除整行
      fixedScript = fixedScript.replace(m[0], '');
    }
  }

  // 同时移除孤立的 `const props = defineProps({})`（如果 defineProps 为空且 props 未被使用）
  if (definePropsArgs.size === 0) {
    // 检查 props 是否在模板或 script 中被使用（排除解构语句本身）
    const propsUsage = fixedScript.replace(/const\s+\{[^}]*\}\s*=\s*props/g, '');
    const propsReferenced = /\bprops\b/.test(propsUsage);
    if (!propsReferenced) {
      fixedScript = fixedScript.replace(/const\s+props\s*=\s*defineProps\s*\(\s*\{\s*\}\s*\)\s*;?\s*/g, '');
    }
  }

  if (fixedScript === scriptContent) return code;

  // 清理多余空行
  fixedScript = fixedScript.replace(/\n\s*\n\s*\n/g, '\n\n');

  return code.replace(/<script\s+setup[^>]*>[\s\S]*?<\/script>/, `<script setup>${fixedScript}</script>`);
}

/**
 * 🛡️ P1.7（2026-09-11）：**引用驱动的资源 import 补齐**（治本 13890774 `icon4 is not defined`）。
 *
 * 旧注入只认「模板里可识别的使用形态」（`${var}` / `:src`），而模型常把资源变量用在
 * **script 内**（如 `const deviceIcons = [icon3, icon4, …]`）→ 看不见 → 不注入 import
 * → 运行时 ReferenceError（整个组件渲染失败）。
 *
 * 本函数以「引用采集（模板 + script，单一实现 utils/resource-facts）」为准，
 * 对每个「被引用但未 import 且事实源有该变量」的项，按 mapping 的文件补齐 import。
 *
 * 🛡️ 2026-09-21：先执行 fixBrokenPropsDestructuring 移除无效解构，避免撞名复核误判。
 *
 * @param {Object<string,string>} files 产物文件表
 * @param {Array} resourceDomMapping 资源映射（含 assignedVarName / resourceFile）
 * @param {{logger?:object}} [options]
 * @returns {{ files: Object<string,string>, injected: Array<{path:string,varName:string}>, unresolved: Array<{path:string,varName:string}> }}
 */
export function ensureResourceImportsForRefs(files = {}, resourceDomMapping = [], options = {}) {
  const logger = safeLogger(options.logger);
  const out = { ...files };
  const injected = [];
  const unresolved = [];
  if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0) {
    return { files: out, injected, unresolved };
  }

  const byVar = new Map();
  for (const m of resourceDomMapping) {
    const varName = m?.assignedVarName || m?.semanticVarName;
    if (varName && m?.resourceFile) byVar.set(varName, m);
  }
  if (byVar.size === 0) return { files: out, injected, unresolved };

  for (const [p, c] of Object.entries(out)) {
    if (!/\.vue$/i.test(p) || typeof c !== 'string') continue;
    // 🛡️ 2026-09-21：先移除无效的资源变量解构，避免撞名复核误判
    let updated = fixBrokenPropsDestructuring(c);
    const refs = collectResourceVarRefsFromSfc(updated);
    for (const varName of refs.all) {
      if (new RegExp(`import\\s+${varName}\\s+from`).test(updated)) continue;
      const m = byVar.get(varName);
      if (!m) {
        unresolved.push({ path: p, varName });
        continue;
      }
      updated = ensureResourceImportInVue(updated, varName, m, p);
      injected.push({ path: p, varName });
    }
    if (updated !== c) out[p] = updated;
  }

  if (injected.length > 0 && logger) {
    logger.info('🧩 资源 import 引用驱动补齐（含 script 内引用）', {
      count: injected.length,
      samples: injected.slice(0, 6),
      unresolved: unresolved.length,
    });
  }
  return { files: out, injected, unresolved };
}

/**
 * 确保目标 vue 文件 script 中存在该资源变量的 import。
 *
 * 🛡️ 刀 7b（2026-09-13）：**撞名复核**——注入前用唯一事实源 collectDeclaredBindings
 * 检查该名字在文件内是否已被 const/let/var 声明（含解构 / 多声明符 / 裸声明）。
 *
 * 事故 mc-max-1789279605053-c9e4a435：LLM 在 MainSection 写 `const bg6 = bg3`
 * （12 张设备卡共用同一张 bg-8439.png，视觉序编号成 bg3…bg14，模型用别名转发）。
 * 旧实现只查 `import bg6 from` → 判定「未 import」→ 注入 `import bg6`
 * → `const bg6` 与 `import bg6` 同作用域重复声明 → MainSection SFC 编译失败
 * → P1-4 隔离降级 → 主内容区（tab 导航 + 12 设备网格）整体丢失，
 * 最终只剩 Header/Switch/Tabs，设备图标被早期 LLM 错塞进 tab 项。
 *
 * 语义：LLM 自己已给出绑定（无论是 import 还是 const 别名），一律尊重、不再注入。
 * 这是「宁可不注入，也不炸 SyntaxError」的保守取舍——遗漏绑定由 T08 幽灵引用剥离
 * 与 RESOURCE-R2 门禁兜底，而重复声明会直接毁掉整个子组件。
 */
export function ensureResourceImportInVue(content, varName, mapping, filePath) {
  if (new RegExp(`import\\s+${varName}\\s+from`).test(content)) return content;
  // 🛡️ 刀 7b：撞名复核（单一事实源，覆盖 const/let/var + 解构 + 多声明符）
  if (collectDeclaredBindings(content).has(varName)) return content;
  const file = String(mapping.resourceFile || '')
    .split('/')
    .pop();
  if (!file) return content;
  const relBase = /^package\/components\//.test(filePath)
    ? '../../resources/images/'
    : '../resources/images/';
  const importLine = `import ${varName} from '${relBase}${file}'`;
  const scriptRe = /<script\s+setup[^>]*>/;
  if (scriptRe.test(content)) {
    return content.replace(scriptRe, (m) => `${m}\n${importLine}`);
  }
  if (/<\/template>/i.test(content)) {
    return content.replace(
      /<\/template>/i,
      `</template>\n<script setup>\n${importLine}\n</script>`,
    );
  }
  return content;
}

// ══════════════════════════════════════════════════════════════
//  Section 2: bg 多引用去重（P2-3）
// ══════════════════════════════════════════════════════════════

/**
 * bg 整块背景多引用自动去重。
 * 同一 bg 变量（bgRole==='container'）被挂到多个容器时，保留评分最高者。
 */
export function dedupeBgMultiRefs(files, resourceDomMapping, options = {}) {
  const logger = safeLogger(options.logger);
  if (
    !files ||
    !Array.isArray(resourceDomMapping) ||
    resourceDomMapping.length === 0
  )
    return files;
  const bgContainers = resourceDomMapping.filter(
    (m) =>
      m &&
      m.previewAnalysisRole === 'bg' &&
      m.assignedVarName &&
      m.resourceFile &&
      m.bgRole === 'container',
  );
  if (bgContainers.length === 0) return files;
  const out = { ...files };
  const componentPrefix = inferComponentPrefix(out);
  // 🛡️ 2026-09-29 治本（本轮实锤：c-traffic-monitor-f0c05ecc「当日总流量」背景图整块丢失）：
  //   此前 refs 是**内联构造**的窄对象 `{file, tag, cls, keyword, depth}`，只有 `depth` 取自
  //   `collectMountCandidates` ⇒ 候选的 `isHostShell` / `dataSectionId` **全部缺失**
  //   ⇒ `pickBestMountTarget` 的「宿主外壳禁用」与 `scoreMountTarget` 的「确定性锚短路」
  //   在这条**去重**路径上双双失效（判据永远读到 undefined，形同不存在）。
  //   实锤（server.log 同一任务内相隔 42ms）：
  //     🎯 [资源挂载] bg3 经事实链 data-section-id=2:8023 精确挂载      ← 先精确挂到正确父容器
  //     🛡️ P2-3 已去重：kept=c-vehicle-monitor-slot-con(2.5)            ← 再被名字相似度删掉
  //                     removed=c-vehicle-monitor-group-2136639043-con
  //   —— 「先猜对、再被评分推翻」比单纯猜错更坏：确定性事实被评分制否决。
  //   治本：refs **完全复用** `collectMountCandidates` 的口径（同一模板区提取 / 同一标签正则 /
  //   同一字段集）。此前它自己另扫一遍 `/<([a-zA-Z]...)((?:"..."|'...'|[^>/])*)>/g`，实测会
  //   产出**错边界**的 tag（`package/index.vue` 上把 2883 字符的片段当成一个标签，而同源候选
  //   只有 211 字符）⇒ (a) 与候选池的 tag 无法比对（查表必 MISS）；(b) tag 边界错 ⇒
  //   `indexOf(tag)` 定位/删除都可能落空。
  //   ⚠️ `cls` 刻意沿用原口径（整个 class 串小写）而非 collectMountCandidates 的「首个类」，
  //   以免扰动既有评分结果 —— 本次只补缺失字段，不改变已有评分语义。
  const allCands = collectMountCandidates(out);
  // 🛡️ 2026-09-29 治本②（b07a2ee4 12 卡背景全丢实锤）：循环粒度由「mapping 条目」改为
  //   「varName 分组」。背景：plan 阶段会把共享背景固化成 N 条同 varName 条目（12 个卡节点
  //   各记一条 bg3，仅第 1 条 sharedBy=12、其余 sharedBy=0）⇒ 逐条循环时：第 1 条正确保留
  //   v-for item，第 2..N 条各自 pickBestMountTarget 选出 cons-label(3.233) 之类，把「上一条
  //   刚保留的 v-for item」当重复移除 ⇒ 互相拆台，最终 CODE-022 顺势删掉 import ⇒ 12 卡背景
  //   全丢（产物里 bg3 出现 0 次）。同一份资源的固化条目，语义单位是 varName ⇒ 聚合后只做
  //   一次 keep 决策，拆台在结构上不可能再发生。
  const entriesByVar = new Map();
  for (const bg of bgContainers) {
    const v = bg.assignedVarName;
    if (!entriesByVar.has(v)) entriesByVar.set(v, []);
    entriesByVar.get(v).push(bg);
  }
  for (const [varName, entries] of entriesByVar) {
    const refs = allCands
      .filter((c) => c.tag.includes(varName) && /:style\s*=/.test(c.tag))
      .map((c) => {
        // 🛡️ P0-3（2026-10-01）：原为 `c.tag.match(/class="([^"]*)"/)`——该正则会在
        //   `:class="…"` / `v-bind:class="…"` 的 `class="` 处命中（子串匹配），把 JS 绑定
        //   表达式当作 class 串。`cls` 既进日志也进 `pickBestMountTarget` 的评分依据
        //   （`scoreMountTarget` 用 `cand.cls` 做 token 重叠）⇒ 污染挂载点选择。
        //   改为 `(?:^|\s)` 前导断言 + 单双引号统一，仅取静态 `class=`（与 `collectMountCandidates`
        //   同口径）；顺带修正原第二分支 `'([^']*')` 把收尾引号也吃进捕获组的笔误。
        const classMatch =
          c.tag.match(/(?:^|\s)class\s*=\s*["']([^"']*)["']/);
        const cls = classMatch ? classMatch[1].toLowerCase() : '';
        return {
          file: c.file,
          tag: c.tag,
          cls,
          keyword: cls,
          depth: c.depth,
          isHostShell: c.isHostShell,
          hasBgBinding: c.hasBgBinding,
          dataSectionId: c.dataSectionId,
        };
      });
    if (refs.length <= 1) continue;
    // 🛡️ 阶段3（2026-09-17）：共享背景（sharedBy>1，如 12 卡共享 bg3）的 v-for item 引用
    //   是正确挂载点（每个卡片各获得背景），而容器引用是「整块拉伸」的错误挂载。此前
    //   pickBestMountTarget 按 mountTarget 语义评分保留了容器（score 更高），把 v-for item
    //   当「重复引用」移除 → 背景回到整块拉伸。这里优先保留 v-for item 引用。
    // 🛡️ 2026-09-29：sharedCount 取**组内最大值** —— 同 varName 的 N 条固化条目里只要有一条
    //   声明共享（>1），整组就该按共享背景对待（否则其余条目 sharedBy=0 会绕过该分支）。
    const sharedCount = Math.max(
      0,
      ...entries.map((e) => (Array.isArray(e.sharedBy) ? e.sharedBy.length : 0)),
    );
    let keep = null;
    let best = null;
    let keepReason = 'score';
    if (sharedCount > 1) {
      const vForRef = refs.find((r) => /\bv-for\b/.test(r.tag));
      if (vForRef) {
        keep = vForRef;
        keepReason = 'v-for-item';
      }
    }
    if (!keep) {
      // 🛡️ 2026-09-29 治本③（配套·确定性锚优先）：评分之前先找「锚点命中的 ref」——
      //   r.dataSectionId === 条目的 ownerSectionId ⇒ 与 mount-target-scoring.js 的
      //   DETERMINISTIC_ANCHOR_SCORE 同语义：事实链挂对过的引用，评分永远无权推翻
      //   （否则会复现「先挂对、再被评分推翻」的 D 类形态，如 kept=cons-label(3.233)）。
      const ownerIds = new Set(
        entries
          .map((e) => (e.ownerSectionId != null ? String(e.ownerSectionId) : null))
          .filter(Boolean),
      );
      const anchorRef = ownerIds.size
        ? refs.find(
            (r) => r.dataSectionId && ownerIds.has(String(r.dataSectionId)),
          )
        : null;
      if (anchorRef) {
        keep = anchorRef;
        keepReason = 'anchor';
      } else {
        // 组内取「信息最全」的一条作为评分依据（优先带 ownerSectionId 的）
        const primary = entries.find((e) => e.ownerSectionId) || entries[0];
        best = pickBestMountTarget(primary, refs, { componentPrefix });
        if (!best) {
          logger.warn('🛡️ P2-3 去重跳过：无候选能给出正分挂载评分', {
            var: varName,
            refs: refs.map((r) => r.cls),
          });
          continue;
        }
        keep = refs.find((r) => r.tag === best.tag) || refs[0];
      }
    }
    const removeList = refs.filter((r) => r.tag !== keep.tag);
    for (const ref of removeList) {
      const styleMatch = ref.tag.match(/:style="([^"]*)"/);
      if (!styleMatch) continue;
      const inner = styleMatch[1].trim();
      const isObjectLiteral = /^\{[\s\S]*\}$/.test(inner);
      const hasSpread = /\.\.\./.test(inner);
      const nonBgPart = inner.replace(
        /\bbackground(?:Image|Size|Position|Repeat)?\s*:/g,
        '',
      );
      const hasOtherKey = /[a-zA-Z]+\s*:/.test(nonBgPart);
      if (!isObjectLiteral || hasSpread || hasOtherKey) continue;
      const newTag = ref.tag.replace(/\s*:style="[^"]*"/, '');
      const pos = out[ref.file].indexOf(ref.tag);
      if (pos < 0) continue;
      out[ref.file] =
        out[ref.file].slice(0, pos) +
        newTag +
        out[ref.file].slice(pos + ref.tag.length);
      logger.warn('🛡️ P2-3 已去重 bg 多引用（统一挂载点评分最高者保留）', {
        var: varName,
        kept: keep.cls,
        keptScore: best ? Number(best.score.toFixed(3)) : keepReason,
        removed: ref.cls,
        file: ref.file,
      });
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
//  Section 2b: C1 同图多别名去重（#568）
// ══════════════════════════════════════════════════════════════

/**
 * 🛡️ C2（2026-09-07，#568）：空壳解绑。
 *
 * 问题：T1 标题剥离后，原标题元素（如 <div class="title-group">标题文字</div>）
 * 被替换为注释，但其父容器可能残留 :style="{ backgroundImage: `url(${bg4})` }" 绑定，
 * 变成只有 style 绑定的空壳 div。该绑定指向的资源变量可能已被其他后处理剥离，
 * 导致运行时 ReferenceError 或静默渲染失败。
 *
 * 修复策略：扫描所有 .vue 文件的 template 段，找出「只有 :style 绑定、无 class、无子内容」
 * 的 div 标签，若 :style 内仅含 background 相关属性且引用的变量不在 availableVars 中，
 * 则删除整个 :style 属性。
 *
 * 安全守卫：
 *   - 只处理 template 段（不动 <script> / <style>）
 *   - 只删除 :style 属性，不删除标签本身（标签可能还有 class/其他属性）
 *   - 若 :style 内含有非 background 属性（如 width/height/color），保留整个 :style
 */
export function stripEmptyShellBindings(files, resourceDomMapping, options = {}) {
  const logger = safeLogger(options.logger);
  if (!files || typeof files !== 'object') return { files, fixes: [] };

  // 收集所有可用的资源变量名
  const availableVars = new Set();
  if (Array.isArray(resourceDomMapping)) {
    for (const m of resourceDomMapping) {
      if (!m) continue;
      if (m.assignedVarName) availableVars.add(m.assignedVarName);
      if (m.semanticVarName) availableVars.add(m.semanticVarName);
    }
  }

  const out = { ...files };
  const fixes = [];

  for (const [p, c] of Object.entries(out)) {
    if (typeof c !== 'string' || !p.endsWith('.vue')) continue;

    // 提取 template 段
    const tplMatch = c.match(/<template>([\s\S]*?)<\/template>/);
    if (!tplMatch) continue;
    const tplContent = tplMatch[1];
    let newTpl = tplContent;

    // 匹配只有 :style 绑定的 div 标签（无 class、无子内容的空壳）
    // 形如：<div :style="{ backgroundImage: `url(${bg4})` }">
    const shellRe =
      /<div(\s+[^>]*?:style="([^"]*)"[^>]*)>/g;
    let m;
    while ((m = shellRe.exec(newTpl)) !== null) {
      const fullTag = m[0];
      const attrs = m[1];
      const styleValue = m[2];

      // 检查是否有 class 属性（有 class 的不是空壳）
      if (/\bclass\s*=/.test(attrs)) continue;

      // 检查 :style 内是否仅含 background 相关属性
      const bgKeys = [
        'background',
        'backgroundImage',
        'backgroundSize',
        'backgroundPosition',
        'backgroundRepeat',
      ];
      const stripped = styleValue.replace(
        new RegExp(`\\b(${bgKeys.join('|')})\\s*:[^,}]+,?`, 'g'),
        '',
      );
      const hasNonBg = /[a-zA-Z]+\s*:/.test(stripped.replace(/\s/g, ''));
      if (hasNonBg) continue; // 含有非 background 属性，保留

      // 检查引用的变量是否在 availableVars 中
      const varRefs = [...styleValue.matchAll(/\$\{([^}]+)\}/g)].map(
        (mm) => mm[1],
      );
      const hasDeadVar =
        varRefs.length > 0 &&
        varRefs.some((v) => !availableVars.has(v));
      if (!hasDeadVar) continue; // 所有变量都可用，无需清理

      // 删除整个 :style 属性
      const newAttrs = attrs.replace(
        /\s*:style="[^"]*"/,
        '',
      );
      const newTag = newAttrs.trim()
        ? `<div${newAttrs}>`
        : '<div>';
      const pos = newTpl.indexOf(fullTag);
      if (pos < 0) continue;
      newTpl =
        newTpl.slice(0, pos) +
        newTag +
        newTpl.slice(pos + fullTag.length);
      fixes.push({ file: p, styleValue: styleValue.slice(0, 60), vars: varRefs });
      // 重置 lastIndex 避免跳过
      shellRe.lastIndex = pos + newTag.length;
    }

    if (newTpl !== tplContent) {
      out[p] = c.replace(tplMatch[0], `<template>${newTpl}</template>`);
    }
  }

  if (fixes.length > 0 && logger) {
    logger.warn('🛡️ C2 已清理空壳绑定（T1 剥离后残留的无效 :style）', {
      fixCount: fixes.length,
    });
  }

  return { files: out, fixes };
}

// ══════════════════════════════════════════════════════════════
//  Section 3: 自动挂载 — 背景
// ══════════════════════════════════════════════════════════════

/**
 * sub-state 状态背景专用挂载。
 * bgRole='sub-state' 的资源只能挂「状态元素」：模板中 :class 含 active 动态绑定的元素。
 * @returns {{var, file, keyword, bgRole, mountTarget}|null}
 */
export function mountSubStateBackground(allFiles, varName, m, options = {}) {
  if (!varName) return null;
  const entries = Object.entries(allFiles)
    .filter(
      ([p, c]) =>
        typeof p === 'string' && p.endsWith('.vue') && typeof c === 'string',
    )
    .sort(([a]) => (a === 'package/index.vue' ? -1 : 1));
  // 🛡️ 2026-09-15（c-env-monitor-14 实锤）：active 键正则收窄——LLM 实际产出的激活态键名
  //   是 `'c-env-monitor-tab-item--active'` / `'is-active'` / `active` 三种，旧正则只认字面量
  //   `active:`（不带引号、不带前缀），导致 `--active` 类名形态的激活图永远挂不上。
  //   新正则：键名 `[\w-]*active[\w-]*`（可带前缀/引号），负向后顾排除 `inactive` 反义键。
  const ACTIVE_BINDING_RE =
    /:class="[^"]*?\{\s*['"]?[\w-]*(?<![\w])active[\w-]*['"]?\s*:\s*([^}]+?)\s*\}[^"]*"/;
  // 🛡️ 2026-09-15（P0 修复）：default 键正则——匹配 `c-device-monitor-switch-card--active` 类名
  //   条件为 `item.isActive`，default 状态需要注入 `!item.isActive ? { backgroundImage: 'url(' + bg2 + ')' } : null`
  const DEFAULT_BINDING_RE =
    /:class="[^"]*?\{\s*['"]?[\w-]*(?<![\w])active[\w-]*['"]?\s*:\s*([^}]+?)\s*\}[^"]*"/;
  
  for (const [p, c] of entries) {
    const match = c.match(ACTIVE_BINDING_RE);
    if (!match) continue;
    const condition = (match[1] || '').trim();
    if (!condition) continue;
    const attrEnd = match.index + match[0].length;
    const tagClose = c.indexOf('>', attrEnd);
    if (tagClose < 0) continue;
    const between = c.slice(attrEnd, tagClose);
    if (/:style\s*=/.test(between)) continue;
    // 🛡️ 2026-09-15（228b63d5）：size/position/repeat 不再硬编码 `100% 100%`，改走
    //   inferBackgroundStyle（几何真值推断：铺满型→100% 100%，局部尺寸→写死 px + 偏移）。
    const bgStyle = inferBackgroundStyle(m || {});
    
    // 🛡️ 2026-09-15（P0 修复）：根据 mountTarget 判断是 active 还是 default 状态
    const isDefaultState = m.mountTarget === 'default';
    const styleCondition = isDefaultState ? `!${condition}` : condition;
    const styleKeyword = isDefaultState ? 'default-state' : 'active-state';
    
    const styleAttr =
      ` :style="${styleCondition} ? { backgroundImage: 'url(' + ${varName} + ')',` +
      ` backgroundSize: '${bgStyle.size}', backgroundPosition: '${bgStyle.position}',` +
      ` backgroundRepeat: '${bgStyle.repeat}' } : null"`;
    // 🛡️ 2026-09-29 治本（mc-max-1790678096786-f5cac254 实锤）：`tagClose` 取的是
    //   `indexOf('>')` —— 对**自闭合**元素（`<X … :class="…" />`）它落在 `/>` 的 `>` 上，
    //   于是 `between` = ` /`，旧实现把 `:style` 插到 ` /` 与 `>` **之间** ⇒ 产出
    //   `<X … / :style="…">`（斜杠与 `>` 之间夹属性）⇒ compiler-sfc 报
    //   `Illegal '/' in tags.` + `Element is missing end tag.` ⇒ 写盘门禁判死整文件、
    //   产物缺失 ⇒ 前端「组件资源加载失败 / 找不到文件」。
    //   修复：识别自闭合形态，把 `:style` 插在 `/` **之前**，保留 ` />` 收尾。
    //   兜底：file-writer 写盘门禁前置自愈（repairSelfClosingSlashInsideTag）。
    const selfClosing = /\/\s*$/.test(between);
    let updated;
    if (selfClosing) {
      // 去掉 `between` 收尾的 `/`，保留属性分隔空白，再把 :style 追加在最后
      const _attrsTail = between.replace(/\/\s*$/, '').replace(/\s+$/, ' ');
      updated =
        c.slice(0, attrEnd) + _attrsTail + styleAttr + ' /' + c.slice(tagClose);
    } else {
      updated = c.slice(0, tagClose) + styleAttr + c.slice(tagClose);
    }
    updated = ensureResourceImportInVue(updated, varName, m, p);
    if (!updated || updated === c) continue;
    allFiles[p] = updated;
    return {
      var: varName,
      file: p,
      keyword: styleKeyword,
      bgRole: m.bgRole || 'sub-state',
      mountTarget: m.mountTarget || null,
    };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
//  Section 4: 自动挂载 — 图标 / 图片
// ══════════════════════════════════════════════════════════════

/**
 * 🛡️ 自动挂载 icon 的尺寸上限（px，2026-09-02）。
 *
 * 事故实证 mc-max-1788306653919-a57e4409（设备监测）：两张大统计卡在规划阶段
 * 被丢（planner 只规划 3 个 section），其卡内 icon（icon-8798 隧道 / icon-8817
 * 控制面板，Figma 真值 35×28）变成孤儿资源，被 P0-1 图标兜底以裸
 * `<img class="auto-mounted-icon">`（无任何尺寸约束）塞进 main-content →
 * 按原图自然尺寸渲染、失去卡片容器约束，把设备网格挤到布局外。
 * 裸挂载必须兜底一个合理尺寸上限，避免「正确图片挂到容器后失控放大」。
 * 取 48px：与 device 图标 wrapper（48×48）一致，且大于多数卡内/导航小图标的设计尺寸。
 */
export const AUTO_MOUNT_ICON_MAX_PX = 48;

/** 向容器开标签【之后】插入 <img :src="varName" /> 子元素（带尺寸兜底约束） */
export function injectImgChild(content, openTag, varName, alt = '', size = null) {
  if (!content || !openTag || !varName) return null;
  if (/\/>\s*$/.test(openTag)) return null;
  const pos = content.indexOf(openTag);
  if (pos < 0) return null;
  const safeAlt = String(alt || '').replace(/"/g, '');
  // 🛡️ D-1（2026-09-02，mc-max-1788349399134-9c3aff7f）：尺寸真值化。
  // 旧版只写 max-width/max-height:48（AUTO_MOUNT_ICON_MAX_PX）→ 实际渲染尺寸 = PNG 原始像素
  // （Figma 常导出 2x/3x），48 仅拦上界 → 24×24 图标被放大 + 撑行。
  // 传入 size（来自 mapping 子资源自身 figmaBox，24×24）时输出精确 width/height；
  // 无尺寸才回落 max-* 兜底（孤儿裸挂仍防失控放大）。
  let dimStyle;
  if (size && Number(size.width) > 0 && Number(size.height) > 0) {
    const w = Math.round(Number(size.width));
    const h = Math.round(Number(size.height));
    dimStyle = `width:${w}px;height:${h}px;object-fit:contain`;
  } else {
    dimStyle = `max-width:${AUTO_MOUNT_ICON_MAX_PX}px;max-height:${AUTO_MOUNT_ICON_MAX_PX}px;object-fit:contain`;
  }
  const imgTag = `<img :src="${varName}" class="auto-mounted-icon" style="${dimStyle}" alt="${safeAlt}" />`;
  // 🛡️ D-2（2026-09-02）：同容器多图标顺序保真——多个 icon 挂同一 openTag 时旧逻辑都插在
  // openTag 之后（后插者反而在前），icon2(x=1844) 排在 icon1(x=1816) 前。改为插到该容器内
  // 已有的 auto-mounted-icon 之后（首次注入时即紧跟 openTag），保持候选按 figmaBox.x 升序
  // 处理即最终 DOM 顺序。
  const afterOpen = content.slice(pos + openTag.length);
  const existingImgRe = /^(\s*<img\b[^>]*class="auto-mounted-icon"[^>]*\/>\s*)/;
  const existing = afterOpen.match(existingImgRe);
  const insertAt =
    pos + openTag.length + (existing ? existing[1].length : 0);
  return content.slice(0, insertAt) + imgTag + content.slice(insertAt);
}

// ══════════════════════════════════════════════════════════════
//  Section 5: CSS 替代资源修复 + LESS 变量归一化
// ══════════════════════════════════════════════════════════════

/**
 * CSS 替代资源的语义名被模型写成 url(${var}) 时，替换为真实色值 backgroundColor。
 * @returns {Array<{file:string, vars:string[]}>} 修复清单
 */
export function resolveCssSubstituteRefs(allFiles, resourceDomMapping) {
  const cssSubs = (resourceDomMapping || []).filter(
    (m) =>
      m &&
      m.downloadStatus === 'css' &&
      m.cssValue &&
      (m.semanticVarName || m.assignedVarName),
  );
  if (cssSubs.length === 0) return [];
  const fixes = [];
  for (const [p, c] of Object.entries(allFiles)) {
    if (!p.endsWith('.vue') || typeof c !== 'string') continue;
    let out = c;
    const hitVars = [];
    for (const m of cssSubs) {
      const varName = m.semanticVarName || m.assignedVarName;
      const color = m.cssValue;
      const tplRe = new RegExp(
        `backgroundImage:\\s*\`url\\(\\$\\{${varName}\\}\\)\``,
        'g',
      );
      if (tplRe.test(out)) {
        out = out.replace(tplRe, `backgroundColor: '${color}'`);
        hitVars.push(varName);
      }
      const concatRe = new RegExp(
        `backgroundImage:\\s*['"]url\\(['"]\\s*\\+\\s*${varName}\\s*\\+\\s*['"]\\)['"]`,
        'g',
      );
      if (concatRe.test(out)) {
        out = out.replace(concatRe, `backgroundColor: '${color}'`);
        hitVars.push(varName);
      }
    }
    if (hitVars.length > 0) {
      allFiles[p] = out;
      fixes.push({ file: p, vars: [...new Set(hitVars)] });
    }
  }
  return fixes;
}

/**
 * 从失败资源映射提取背景 fallback CSS 值。
 * 优先级：visualMeta.fillsSummary > cssValue > 默认渐变（LAST-RESORT）。
 */
/** ⚠️ LAST-RESORT 兜底渐变（§七 B15 · 2026-09-28）：真值全缺时的唯一退化值，非设计臆造。 */
const LAST_RESORT_BG_GRADIENT = 'linear-gradient(180deg, #edf4fb, #d6e8f5)';
function extractBgFallbackValue(mapping) {
  const fills = mapping.visualMeta?.fillsSummary;
  if (fills && typeof fills === 'string' && fills.trim()) {
    // fillsSummary 可能是渐变色（含 gradient）或纯色 hex
    // 渐变形式：linear-gradient(#xxx 0%, #yyy 100%)
    // 纯色形式：#rrggbb 或 #rrggbb, #rrggbb2（多 SOLID 逗号分隔）
    if (/gradient/i.test(fills)) return fills;
    // 纯色：取第一个 hex 值
    const firstHex = fills.split(',')[0].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(firstHex)) return firstHex;
  }
  if (mapping.cssValue) return mapping.cssValue;
  // ⚠️ LAST-RESORT（§七 B15 · 2026-09-28）：真值**全缺**（无 fillsSummary、无 cssValue）时的
  //   唯一退化值 —— 「无事实可依」的兜底，非设计臆造；任何有真值的路径都不会走到这里。
  return LAST_RESORT_BG_GRADIENT;
}

/**
 * 兜底：通过关键词匹配找到目标容器，注入 fallback CSS 类。
 * 复用资源挂载计划（resource-mount-plan）同一套关键词/容器匹配工具。
 */
function injectBgFallbackClass(
  content,
  filePath,
  mapping,
  fallbackValue,
  fallbackCls,
) {
  const kws = extractMountKeywords(mapping);
  let out = content;

  // 尝试关键词匹配找到目标标签
  for (const kw of kws) {
    const tag = findTagByClassKeyword(out, kw);
    if (!tag) continue;
    if (/\sclass="/.test(tag)) {
      const newTag = tag.replace(/\sclass="/, ` class="${fallbackCls} `);
      out = out.replace(tag, newTag);
    } else if (/\sclass=/.test(tag)) {
      const newTag = tag.replace(/\sclass=/, ` class="${fallbackCls}" `);
      out = out.replace(tag, newTag);
    } else {
      const newTag = tag.replace(/>$/, ` class="${fallbackCls}">`);
      out = out.replace(tag, newTag);
    }
    break;
  }

  // 注入 CSS 规则到 <style> 块
  if (out !== content) {
    out = out.replace(/<\/style>/i, (match) => {
      return `\n.${fallbackCls} { background-image: ${fallbackValue}; background-size: cover; background-position: center; }\n${match}`;
    });
  }
  return out;
}

/**
 * 🛡️ B2（2026-09-07）：下载失败背景资源的 CSS 渐变/纯色兜底注入。
 *
 * 根因（docs/0907-组件生成问题分析.md）：traffic 组件根背景 bg-[m] downloadStatus='missing'，
 * skipMount 后无替代方案 → 容器无背景（Figma 设计为渐变背景）。现有 resolveCssSubstituteRefs
 * 只处理 downloadStatus='css'，healUnavailableResourceRefs 只剥离引用（→ none），
 * 未注入任何视觉替代。
 *
 * 策略（确定性后处理，在 healUnavailableResourceRefs 之前运行）：
 *  1) template 内 :style 绑定 url(${failedVar}) → 静态 fallback 色值
 *  2) <style> 内 url(@failedVar) / url(none)（normalizeStyleLessVars 已转换的）→ fallback 值
 *  3) 兜底：注入 CSS fallback 类到目标容器（当 template 引用已被 heal 剥离时生效）
 *
 * 颜色来源优先级：visualMeta.fillsSummary > cssValue > 默认渐变。
 * 仅处理 previewAnalysisRole='bg'（背景才有渐变/纯色替代语义；icon/img 不适合）。
 * env BG_AUTO_MOUNT=false 时一并关闭（与 autoMount/normalizeStyleLessVars 一致）。
 *
 * @param {Object<string,string>} allFiles - 产物文件表
 * @param {Array} resourceDomMapping - 资源映射
 * @param {Object} [options]
 * @returns {Array<{file:string, var:string, role:string, method:string}>} 修复清单
 */
export function injectFailedResourceFallbacks(
  allFiles,
  resourceDomMapping,
  options = {},
) {
  const logger = safeLogger(options.logger);
  if (process.env.BG_AUTO_MOUNT === 'false') return [];
  if (!allFiles || typeof allFiles !== 'object') return [];

  // 收集失败背景资源（排除 'success' 和 'css'——后者由 resolveCssSubstituteRefs 处理）
  const failedBgs = (resourceDomMapping || []).filter(
    (m) =>
      m &&
      m.previewAnalysisRole === 'bg' &&
      m.downloadStatus !== 'success' &&
      m.downloadStatus !== 'css' &&
      (m.semanticVarName || m.assignedVarName),
  );
  if (failedBgs.length === 0) return [];

  const fixes = [];

  for (const m of failedBgs) {
    const varName = m.semanticVarName || m.assignedVarName;
    const fallbackValue = extractBgFallbackValue(m);
    const escVar = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fallbackCls = `fb-bg-${varName}`;

    for (const [p, content] of Object.entries(allFiles)) {
      if (!p.endsWith('.vue') || typeof content !== 'string') continue;
      let out = content;
      const methods = [];

      // ① Template: :style 绑定 url(${var}) / url('+var+') → 静态 fallback 值
      //   覆盖模板字符串和字符串拼接两种形态
      const tplRe = new RegExp(
        `:style="(?:\`url\\(\\$\\{${escVar}\\}\\)\`|['"]url\\(['"]\\s*\\+\\s*${escVar}\\s*\\+\\s*['"]\\)['"])"`,
        'g',
      );
      if (tplRe.test(out)) {
        out = out.replace(
          tplRe,
          `:style="{ backgroundImage: '${fallbackValue}' }"`,
        );
        methods.push('tpl-style');
      }

      // ② Template: 残留 url(${var})（三元/对象内局部插值，无法整条删属性）→ fallback
      const residualRe = new RegExp(
        `url\\(\\s*\\$\\{\\s*${escVar}\\s*\\}\\s*\\)`,
        'g',
      );
      if (residualRe.test(out)) {
        out = out.replace(residualRe, fallbackValue);
        methods.push('tpl-residual');
      }

      // ③ <style> 内: url(@var) / url(${var}) / url($var) → fallback
      //   覆盖 normalizeStyleLessVars 尚未处理的原始引用
      let styleReplaced = false;
      out = out.replace(
        /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
        (styleBlock) =>
          styleBlock.replace(
            /url\(\s*['"]?\s*(?:@([A-Za-z][\w-]*)|\$\{\s*([A-Za-z][\w-]*)\s*\}|\$([A-Za-z][\w-]*))\s*['"]?\s*\)/g,
            (match, atVar, tmplVar, dollarVar) => {
              const refVar = atVar || tmplVar || dollarVar;
              if (refVar === varName) {
                styleReplaced = true;
                return `url('${fallbackValue}')`;
              }
              return match;
            },
          ),
      );
      if (styleReplaced) methods.push('style-url');

      // ④ <style> 内: url(none) → fallback（仅当该 style 块所在文件模板曾引用 varName）
      //   覆盖 normalizeStyleLessVars 已把 @var 转为 none 的情况
      const fileHadVar = new RegExp(escVar).test(content);
      if (fileHadVar) {
        let noneReplaced = false;
        out = out.replace(
          /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
          (styleBlock) => {
            const replaced = styleBlock.replace(
              /url\(\s*none\s*\)/g,
              () => {
                noneReplaced = true;
                return `url('${fallbackValue}')`;
              },
            );
            return replaced;
          },
        );
        if (noneReplaced) methods.push('style-none');
      }

      // ⑤ 兜底 CSS 类注入：当 template 曾引用该变量但 ①-② 未匹配（heal 已剥离引用），
      //   通过关键词匹配找到目标容器，注入 fallback 类 + CSS 规则
      if (
        fileHadVar &&
        !methods.some((m) => m.startsWith('tpl-')) &&
        !methods.includes('style-url')
      ) {
        const injected = injectBgFallbackClass(
          out,
          p,
          m,
          fallbackValue,
          fallbackCls,
        );
        if (injected !== out) {
          out = injected;
          methods.push('class-inject');
        }
      }

      if (methods.length > 0) {
        allFiles[p] = out;
        fixes.push({
          file: p,
          var: varName,
          role: 'bg',
          method: methods.join('+'),
        });
      }
    }
  }

  if (fixes.length > 0 && logger) {
    logger.warn('🛡️ B2 下载失败背景 CSS 兜底注入完成', {
      count: fixes.length,
      fixes,
    });
  }
  return fixes;
}

/**
 * 🛡️ P0-1 扩展：<style> 内错误 LESS 变量引用归一化（2026-08-27）
 * 根因（mc-1787833161983 复测实锤）：L0-B 资源 BLOCK 修复后，模型换了一种幻觉——
 * 把资源变量名 bg2/bg3 当 LESS 变量写成 url(@bg2)/url(@bg3)，并发明 theme-vars 里
 * 不存在的 @color-tab-default-text。validateVueSfc 的 less preprocess（strip 相对
 * @import 后）报 "variable @x is undefined" → 最终 SFC 校验 fail-closed。
 *
 * 策略（确定性后处理，env BG_AUTO_MOUNT=false 一并关闭）：
 *  1) 资源变量 url(@bgN) → url('<相对路径>/<真实文件名>')（bgN 匹配资源映射 assignedVarName）
 *  2) 其余「未声明且非资源、非 theme-vars 已定义」的 @变量 → 注入 @var: 安全默认值
 * 不误伤合法主题变量（theme-vars 里已定义的变量名跳过，避免用默认值覆盖主题色）。
 * @returns {Array<{file:string, resourceVars:string[], inventedVars:string[]}>}
 */
export function normalizeStyleLessVars(
  allFiles,
  resourceDomMapping,
  options = {},
) {
  const logger = safeLogger(options.logger);
  if (process.env.BG_AUTO_MOUNT === 'false') return [];
  if (!allFiles || typeof allFiles !== 'object') return [];

  // 资源变量名 → 真实文件名
  const resMap = {};
  for (const m of resourceDomMapping || []) {
    if (m && m.assignedVarName && m.resourceFile) {
      resMap[m.assignedVarName] = String(m.resourceFile).split('/').pop();
    }
  }
  // theme-vars 已定义变量（含 mixin 内），避免误伤合法主题变量
  const declaredTheme = new Set();
  const themeVarsSrc =
    allFiles['resources/styles/themes/theme-vars.less'] ||
    allFiles['resources/styles/theme-vars.less'];
  if (typeof themeVarsSrc === 'string') {
    for (const mm of themeVarsSrc.matchAll(/@([a-zA-Z][\w-]*)\s*:/g))
      declaredTheme.add(mm[1]);
  }

  const fixed = [];
  for (const [p, c] of Object.entries(allFiles)) {
    if (!p.endsWith('.vue') || typeof c !== 'string') continue;
    const relBase = /^package\/components\//.test(p)
      ? '../../resources/images/'
      : '../resources/images/';
    const resourceVars = [];

    // 1) url(@资源变量) / url(${资源变量}) / url($资源变量) → 真实路径；臆造资源变量 → none
    //    模型会把这三种都写进 <style>：@bg3(LESS 变量) / ${bg3}(Vue 模板插值，LESS 把它当 $bg3 变量)
    //    / $bg3(LESS $ 语法)。三者都会被 LESS 当变量 → 未声明则 "variable is undefined" fail-closed。
    //    这里统一归一化：真实映射 → 静态图片路径；臆造（资源前缀但无映射）→ none（合法 CSS，避免崩）。
    let updated = c.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (block) =>
      block.replace(
        // 🛡️ 同时覆盖带引号形式 url('${var}') / url("${var}") / url('@var') —— 模型常在 <style> 内
        // 把资源变量用引号包成 url('${bg3}')，旧正则未允许引号致漏判 → LESS 编译报 Property '$bg3' is undefined。
        /url\(\s*['"]?\s*(?:@([A-Za-z][\w-]*)|\$\{\s*([A-Za-z][\w-]*)\s*\}|\$([A-Za-z][\w-]*))\s*['"]?\s*\)/g,
        (m, atVar, tmplVar, dollarVar) => {
          const varName = atVar || tmplVar || dollarVar;
          const file = resMap[varName];
          if (file) {
            resourceVars.push(varName);
            return `url('${relBase}${file}')`;
          }
          if (/^(bg|icon|img|image|pic)/i.test(varName)) {
            resourceVars.push(`${varName}→none`);
            return 'none';
          }
          return m;
        },
      ),
    );

    // 2) 剩余未声明变量 → 默认值（排除资源变量 + theme 已定义 + 当前 style 已声明）
    const styleNow = (
      updated.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []
    ).join('\n');
    const referenced = extractLessVarReferences(styleNow);
    const inventedVars = referenced.filter(
      (v) =>
        !resMap[v] && !declaredTheme.has(v) && !isLessVarDeclared(styleNow, v),
    );
    if (inventedVars.length > 0) {
      const decl = inventedVars
        .map(
          (v) =>
            `@${v}: ${safeLessVarValue('@' + v, { styleText: styleNow })};`,
        )
        .join('\n');
      updated = updated.replace(/<style\b[^>]*>/g, (m) => `${m}\n${decl}\n`);
    }

    if (resourceVars.length > 0 || inventedVars.length > 0) {
      allFiles[p] = updated;
      fixed.push({ file: p, resourceVars, inventedVars });
    }
  }
  if (fixed.length > 0 && logger) {
    logger.warn('🛡️ P0-1 LESS 变量归一化已完成', { fixedCount: fixed.length });
  }
  return fixed;
}

/**
 * 🛡️ P0-3（2026-08-30）：孤儿剔除前，把待剔除文件里「确实被模板引用」的 bg 资源
 * 迁移到保留文件。
 *
 * 根因（mc-max-1788056145870-6e65dc88 实锤）：LLM 把 bg2 正确挂在 HeaderTabs.vue，
 * 但 HeaderTabs 被 P1-2 孤儿剔除删掉（index.vue 只用 EnvTabBar）→ 唯一正确挂载点消失
 * → 旧兜底挂载关键词匹配不到会降级 root-fallback（已随批次 2 删除，改计划驱动 fail-closed）。
 * 治本：剔除前先迁移，正确挂载点不丢失，兜底不再错位。
 *
 * 只迁移 bg（icon/img 由 mountPlannedResources 计划驱动挂载，迁移语义不同）。
 * @param {Object} allFiles - 产物文件表
 * @param {Array} resourceDomMapping - 资源映射
 * @param {string[]} orphanPaths - 待剔除的孤儿文件路径
 * @returns {Array<{var, from, to}>} 迁移结果
 */
export function migrateOrphanResourceRefs(
  allFiles,
  resourceDomMapping,
  orphanPaths,
  options = {},
) {
  const logger = safeLogger(options.logger);
  if (
    !Array.isArray(resourceDomMapping) ||
    !Array.isArray(orphanPaths) ||
    orphanPaths.length === 0
  )
    return [];
  const keepPaths = new Set(
    Object.keys(allFiles).filter((p) => !orphanPaths.includes(p)),
  );
  const migrated = [];
  for (const op of orphanPaths) {
    const orphanContent = allFiles[op];
    if (typeof orphanContent !== 'string') continue;
    const importRe =
      /import\s+(\w+)\s+from\s+['"]([^'"]*resources\/images\/[^'"]+)['"]/g;
    const templateContent = orphanContent.replace(
      /<script[\s\S]*?<\/script>/i,
      '',
    );
    let im;
    while ((im = importRe.exec(orphanContent)) !== null) {
      const varName = im[1];
      // 模板里确实引用了该变量才算「正确挂载」；仅 import 无挂载无需迁移
      if (!new RegExp(`\\b${varName}\\b`).test(templateContent)) continue;
      const mapping = resourceDomMapping.find(
        (mm) =>
          mm &&
          (mm.assignedVarName === varName || mm.semanticVarName === varName),
      );
      if (!mapping || mapping.previewAnalysisRole !== 'bg') continue;
      // 在保留文件里按 mountTarget 关键词找替代挂载点（复用挂载关键词提取）
      const kws = extractMountKeywords(mapping);
      const entries = Object.entries(allFiles)
        .filter(
          ([p, c]) =>
            keepPaths.has(p) && typeof c === 'string' && p.endsWith('.vue'),
        )
        .sort(([a]) => (a === 'package/index.vue' ? -1 : 1));
      let target = null;
      outer: for (const [p, c] of entries) {
        for (const kw of kws) {
          const tag = findTagByClassKeyword(c, kw);
          if (tag) {
            target = { file: p, tag };
            break outer;
          }
        }
      }
      if (!target) continue; // 找不到替代点，交 mountPlannedResources 计划挂载
      let updated = injectBgStyleBinding(
        allFiles[target.file],
        target.tag,
        varName,
        mapping,
      );
      if (!updated) continue;
      updated = ensureResourceImportInVue(
        updated,
        varName,
        mapping,
        target.file,
      );
      if (updated === allFiles[target.file]) continue;
      allFiles[target.file] = updated;
      migrated.push({ var: varName, from: op, to: target.file });
    }
  }
  if (migrated.length > 0 && logger) {
    logger.warn('🛡️ P0-3 孤儿资源已迁移到保留文件', { migrated });
  }
  return migrated;
}

/**
 * 🛡️ P1-2：孤儿子组件剔除 + chunk-meta 清退（2026-08-27）
 * 保留集 = index.vue import 链（复用 detectSubComponents）∪ 模板标签直接引用（PascalCase/kebab）。
 * 剔除 = allFiles 中不在保留集的 package/components/*.vue + 磁盘 chunk-meta 的 files/completed/分块文件。
 * 🛡️ P0-3（2026-08-30）：删除前先迁移孤儿文件里的资源引用（见 migrateOrphanResourceRefs），
 * 避免正确挂载点随孤儿文件消失后，兜底降级到 base-panel。
 * @param {Array} [resourceDomMapping] - 可选，资源映射；提供时执行剔除前资源迁移
 * @returns {string[]} 被剔除的孤儿路径清单
 */
/**
 * 🛡️ F5（2026-09-01）：L0-B 重试轮孤儿白名单——LESS 安全的续跑产物不剔除。
 *
 * 事故实证 mc-max-1788252098143-12469472「子组件震荡删除」：
 * R1 生成 5 个子组件 → R2 断点续跑恢复 9 文件但新 index.vue 结构漂移只引用 2 个
 * → P1-2 把 Bridge/Tunnel/VehicleType 当孤儿清退 → R3 又重新生成 5 个 → 3 轮烧
 * ~15 个子组件生成预算。三机制（续跑/孤儿清理/坏文件隔离）在重试轮间互相踩踏。
 *
 * 与 P1-2 的设计张力（mc-1787829888023，P1-2 的立项事故）：续跑恢复的旧子组件
 * 引用**上轮** theme-vars 的 less 变量 → 本轮编译 fail-closed，此时剔除是正确的。
 *
 * 区分信号 = LESS 安全性（确定性、纯静态）：
 *   - 候选孤儿引用的所有 less 变量在本轮样式产物（allFiles 的 .less + 自身 style 块）
 *     中均有定义 → 白名单保留（可复用，不浪费生成预算）；
 *   - 存在未定义变量引用（上轮遗留陈旧产物）→ 照旧剔除（P1-2 原语义回归保护）。
 * 仅在 isL0BRetry 上下文启用：首轮生成仍按 P1-2 全量剔除（清退混批旧命名）。
 *
 * @param {Record<string,string>} allFiles
 * @param {string[]} pruned 孤儿候选路径
 * @returns {string[]} LESS 安全、应白名单保留的路径
 */
function splitLessSafeOrphans(allFiles, pruned) {
  const lessCorpus = Object.entries(allFiles)
    .filter(([p]) => /\.less$/i.test(p))
    .map(([, c]) => String(c || ''))
    .join('\n');

  const kept = [];
  for (const p of pruned) {
    const content = String(allFiles[p] || '');
    const styles = [...content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((m) => m[1])
      .join('\n');
    // 无样式块 → 无 LESS 编译风险 → 保留（模板/脚本部分可复用）
    if (!styles.trim()) {
      kept.push(p);
      continue;
    }
    const refs = extractLessVarReferences(styles);
    const corpus = `${lessCorpus}\n${styles}`;
    const undeclared = refs.filter((n) => !isLessVarDeclared(corpus, n));
    if (undeclared.length === 0) {
      kept.push(p);
    }
  }
  return kept;
}

export function pruneOrphanSubComponents(
  allFiles,
  outputPath,
  resourceDomMapping = null,
  options = {},
) {
  const logger = safeLogger(options.logger);
  const indexVue = allFiles['package/index.vue'];
  if (typeof indexVue !== 'string' || !indexVue) return [];

  // 🛡️ 传递闭包保留集（2026-09-08 实锤 mc-max-1788832532312-2ee5ad89）：
  // 原实现只查 index.vue 一层 import（detectSubComponents）+ 模板标签，chunk 一次输出
  // 「子组件的子组件」（MainContent chunk 输出 MainContent + SidebarNav + DeviceGrid
  // 三个文件，SidebarNav/DeviceGrid 仅被 MainContent 引用）时，二层文件不在 index.vue
  // 引用链里 → 被误判孤儿剔除 → 悬空 import 剥离把 MainContent 掏成空壳 div
  // → 主体内容（竖排 tabs/两大卡/12 设备项）全部丢失，页面只剩头部统计条。
  // 治本：保留集改为从 index.vue 出发沿相对 import 递归（BFS）的传递闭包，
  // 任何层级被引用的子组件都不再是孤儿；模板标签直查保留（覆盖动态/别名引用场景）。
  const keep = new Set(['package/index.vue', ...detectSubComponents(indexVue)]);
  const compPaths = Object.keys(allFiles).filter((p) =>
    /^package\/components\/[^/]+\.vue$/.test(p),
  );
  const importVueRe =
    /^[ \t]*import\s+[A-Za-z_$][\w$]*\s+from\s+(['"])(\.[^'"]*\.vue)\1\s*;?[ \t]*$/gm;
  // 🛡️ 单一事实源：相对 .vue specifier 解析统一委托 section-coverage-guard#
  // resolveSpecifierToPath（与 detect/strip 悬空引用同套逻辑），杜绝「资源挂载链 / 悬空
  // 引用 / 孤儿剔除」各自写一套路径解析造成的行为漂移。
  const present = new Set(Object.keys(allFiles));
  const resolveRelativeVue = (fromFile, spec) =>
    resolveSpecifierToPath(fromFile, spec, present);
  const refQueue = ['package/index.vue'];
  while (refQueue.length > 0) {
    const cur = refQueue.shift();
    const curContent = allFiles[cur];
    if (typeof curContent !== 'string') continue;
    for (const m of curContent.matchAll(importVueRe)) {
      const target = resolveRelativeVue(cur, m[2]);
      if (target && allFiles[target] != null && !keep.has(target)) {
        keep.add(target);
        refQueue.push(target);
      }
    }
  }
  for (const p of compPaths) {
    const base = p.replace(/^package\/components\//, '').replace(/\.vue$/, '');
    const pascal = base.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
    const kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const re = new RegExp(`<${pascal}\\b|<${kebab}\\b`);
    if (re.test(indexVue)) keep.add(p);
  }

  let pruned = compPaths.filter((p) => !keep.has(p));
  if (pruned.length === 0) return [];

  // 🛡️ F5：L0-B 重试轮白名单——LESS 安全的续跑产物保留，斩断「清退→重生成」震荡。
  // 保留者不进 pruned → 不剔除、不清退 chunk-meta（后续重试轮仍可断点复用）。
  if (options.isL0BRetry && pruned.length > 0) {
    const whitelisted = splitLessSafeOrphans(allFiles, pruned);
    if (whitelisted.length > 0) {
      pruned = pruned.filter((p) => !whitelisted.includes(p));
      if (logger) {
        logger.info(
          '🛡️ F5 L0-B 重试轮孤儿白名单：LESS 安全的续跑子组件保留复用（不剔除、不清退 chunk-meta）',
          { whitelisted },
        );
      }
    }
  }
  if (pruned.length === 0) return [];

  // 🛡️ P0-3：删除前，把孤儿文件里正确挂载的 bg 资源迁移到保留文件，
  // 避免正确挂载点随孤儿文件消失后兜底降级到 base-panel（错误大背景）。
  if (resourceDomMapping && resourceDomMapping.length > 0) {
    const migrated = migrateOrphanResourceRefs(
      allFiles,
      resourceDomMapping,
      pruned,
      options,
    );
    if (migrated.length > 0 && logger) {
      logger.warn('🛡️ P0-3 孤儿资源已迁移到保留文件', { migrated });
    }
  }

  for (const p of pruned) delete allFiles[p];

  // 磁盘 chunk-meta 清退（失败不阻断：allFiles 已剔除，主目标达成）
  if (outputPath) {
    (async () => {
      try {
        const {
          readFileSync: rfs,
          writeFileSync: wfs,
          existsSync: es,
          unlinkSync: uls,
        } = await import('fs');
        const chunkDir = join(outputPath, '.mc-gen', 'cache', 'code-chunks');
        const metaPath = join(chunkDir, 'chunk-meta.json');
        if (!es(metaPath)) return;
        const meta = JSON.parse(rfs(metaPath, 'utf-8'));
        if (!meta || typeof meta !== 'object') return;
        const orphanDiskFiles = [];
        if (meta.files && typeof meta.files === 'object') {
          for (const p of pruned) {
            if (!meta.files[p]) continue;
            // 🛡️ P1-5：files[p] 可能是段数组（多段文件）或旧格式单值，统一归一化取全部落盘文件
            for (const seg of normalizeFileSegments(meta.files[p])) {
              orphanDiskFiles.push(join(chunkDir, seg.file));
            }
            delete meta.files[p];
          }
        }
        if (Array.isArray(meta.completed)) {
          meta.completed = meta.completed.filter(
            (k) => !pruned.some((p) => k.includes(p)),
          );
        }
        meta.updatedAt = Date.now();
        wfs(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        for (const f of orphanDiskFiles) {
          try {
            if (es(f)) uls(f);
          } catch {
            /* ignore */
          }
        }
        if (logger) {
          logger.info('🛡️ P1-2 chunk-meta 已清退孤儿条目', {
            pruned,
            clearedBlocks: pruned.length,
          });
        }
      } catch {
        /* meta 清退失败不阻断 */
      }
    })();
  }
  return pruned;
}

/**
 * 🛡️ Phase 2 后处理兜底（TDD: T02/T03/T04/T05/T06/T07）
 * 用代码强制约束布局/样式/资源，不依赖 prompt 遵守
 */
export function postProcessIndexVue(code, input, options = {}) {
  const logger = safeLogger(options.logger);
  if (!code || typeof code !== 'string') return code;
  let result = code;

  // T03: 图表容器 min-height 注入
  result = injectChartMinHeight(result);

  // T04: 背景图去重（如果子组件也引用了主组件的背景图）
  result = deduplicateBackgroundImages(result);

  // 🗑️ T05: bg-size 修正 —— 已删除（2026-09-29 删减法）。
  //   它无条件把 `backgroundSize: 'Xpx Ypx'` 改成 `'cover'`，与 `inferBackgroundStyle`
  //   给局部背景层输出的「px 尺寸 + 偏移」真值方向相反。详见 utils/post-process.js 顶部墓碑注释。

  // T06: 容器尺寸校验 + 确定性自动修正（治标 Pass 2）—— BBox fallback → auto，回写修正结果
  const rootBox = input?.figmaNodeData?.absoluteBoundingBox;
  if (rootBox) {
    const {
      code: fixedCode,
      warnings,
      fixed,
    } = validateContainerSize(result, rootBox.width, rootBox.height);
    result = fixedCode;
    if (fixed > 0 && logger) {
      logger.info(
        `🔧 Phase 2 T06: 已自动修正 ${fixed} 处 BBox fallback（子容器尺寸 → auto）`,
      );
    }
    if (warnings && warnings.length > 0 && logger) {
      logger.warn('🔧 Phase 2 T06: 容器尺寸校验发现异常', {
        warnings,
        fixed,
      });
    }
  }

  // T07: 资源引用校验（治标 Pass 3）—— 记录警告，不修改代码
  const { warnings: resWarnings } = validateResourceUsage(result);
  if (resWarnings && resWarnings.length > 0 && logger) {
    logger.warn('🔧 Phase 2 T07: 资源引用校验发现异常', {
      warnings: resWarnings,
    });
  }

  // T08: 剥离未定义的资源变量引用（治本，2026-08-26）
  //      模型在 resourceDomMapping 为空时常臆造 bg4/bg5/icon7 等变量并写进 :style，
  //      但 injectResourceImports 只会注入「真实存在的资源」，臆造变量最终无 import
  //      → 运行时 ReferenceError 或静默渲染失败（本次 tab 背景全丢就是这个原因）。
  result = stripUndefinedResourceRefs(result, options);

  // T09: headerSlots 补齐（治本）—— 设计稿头部有内容但模型只写注释时，确定性注入真实 DOM
  result = ensureHeaderSlots(result, input, options);

  return result;
}

/**
 * T08: 剥离未定义的资源变量引用（确定性修复）
 *
 * 判定：模板里 `url(${bgN})` / `:src="iconN"` 引用的资源变量，在 <script> 中既无 import
 * 也无本地声明 → 该引用必然是臆造，删除对应的内联 background-image / 整个 :style 绑定。
 * 保留 class 提供的视觉（common.less 通常已有对应背景规则）。
 *
 * ⚠️ P0-4（2026-10-01）：② 删除 `:src` 会留下**无源 `<img>`**（破图 + alt 文本）——「保留 class
 * 提供的视觉」这一假定在 class 只有尺寸、没有 background 时并不成立（07a812f7 灰块实锤）。
 * 故收尾追加 `foldSourcelessImgs`：有 class → 降级 `<span>`；无 class → 整元素删除；
 * 处于 v-if/v-else 链上时强制降级（删除会使 v-else 悬空）。
 */
export function stripUndefinedResourceRefs(code, options = {}) {
  const logger = safeLogger(options.logger);
  if (!code || typeof code !== 'string') return code;
  const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return code;
  const script = scriptMatch[1];
  const templateMatch = code.match(/<template>([\s\S]*)<\/template>/i);
  if (!templateMatch) return code;

  // 模板 + 🛡️ script 双覆盖（P1.7：script 内引用曾是盲区 —— 13890774 事故中
  // `const deviceIcons = [icon3, icon4, …]` 写在 script 里，只扫模板则完全看不见，
  // 幽灵引用直达运行时 → `icon4 is not defined`）。
  const referenced = new Set();
  const tplRefs = collectResourceVarRefsFromSfc(code);
  for (const name of tplRefs.all) referenced.add(name);
  if (referenced.size === 0) return code;

  const undefinedVars = [...referenced].filter((name) => {
    const declared = new RegExp(
      `(?:import\\s+${name}\\s+from|(?:const|let|var)\\s+${name}\\b|\\b${name}\\s*[,}]\\s*=|\\b${name}\\s*:)`,
    );
    return !declared.test(script);
  });
  if (undefinedVars.length === 0) return code;

  let result = code;
  for (const name of undefinedVars) {
    // ① 删除 `backgroundImage: \`url(${name})\`` 这类属性（含尾随逗号）
    result = result.replace(
      new RegExp(
        `\\s*background(?:-i|I)mage\\s*:\\s*\`?url\\(\\$\\{\\s*${name}\\s*\\}\\)\`?\\s*,?`,
        'g',
      ),
      '',
    );
    // ② 删除 `:src="name"`
    result = result.replace(new RegExp(`\\s*:src="\\s*${name}\\s*"`, 'g'), '');
    // ③ 🛡️ script 区收尾（P1.7）：把 script 内剩余的未定义资源引用替换为 `undefined`，
    //    避免 `[icon3, icon4]` / `getDeviceIcon()` 等形态直达运行时抛 ReferenceError。
    //    仅替换**非声明位置**的裸标识符（该变量已确认未 import/未声明 → 不可能是定义处）。
    result = result.replace(
      /(<script[^>]*>)([\s\S]*?)(<\/script>)/i,
      (whole, open, body, close) =>
        open +
        body.replace(new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g'), 'undefined') +
        close,
    );
  }
  // ③ 清理因上一步变空的 :style="{ }" 绑定
  result = result.replace(/\s*:style="\{\s*\}"/g, '');

  // 🛡️ P0-4（2026-10-01 · mc-max-1790830432735-07a812f7 实锤）：剥掉 `:src` 后**已无图片源**的
  //   `<img>` 不再留「破图 + alt 文本」。
  //   现象（真实产物 ContentSection.vue）：LLM 写 `<img v-if="row.selected" :src="icon1" …alt="已选中">`
  //   （cross-section 误用 icon1，本文件未 import）→ 上方 ② 只删 `:src` ⇒ 预览里是灰块 + 「已选中」。
  //   处置（与「删除法」同源的收敛动作，不臆造视觉）：
  //     · 有静态 class → 降级为同名 class 的 `<span></span>`（保留 CSS 尺寸/背景钩子，消除破图与 alt）
  //     · 无 class     → 整元素删除
  //   唯一例外：该 `<img>` 带 v-if/v-else-if 且后继元素带 v-else ⇒ **必须降级不能删除**
  //   （删除会让 v-else 悬空 → Vue 编译期直接报错，比破图更严重）。
  result = foldSourcelessImgs(result, logger);

  if (logger) {
    logger.warn('🔧 T08 已剥离未定义的资源变量引用（防臆造资源致渲染失败）', {
      undefinedVars,
    });
  }
  return result;
}

/**
 * 🛡️ P0-4 辅助：净化「已无任何图片源」的 `<img>`（`stripUndefinedResourceRefs` 收尾调用）。
 *
 * 判据：标签不含 `src=` / `:src=` / `v-bind:src` 中任一 ⇒ 浏览器必然渲染为破图（有 alt 时渲染 alt 文本）。
 * 处置见调用处注释；删除时连带吃掉同行缩进与尾随换行，避免留下纯空白行。
 *
 * @param {string} code SFC 内容
 * @param {Object} [logger]
 * @returns {string}
 */
function foldSourcelessImgs(code, logger) {
  // 属性值里可能含裸 `>`/引号，按「引号串优先」切片，与同文件既有标签正则口径一致
  const re = /<img\b(?:"[^"]*"|'[^']*'|[^>"'])*\/?>/gi;
  const actions = [];
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code)) !== null) {
    const tag = m[0];
    // 仍有图片源（静态或绑定）⇒ 不是幽灵，原样保留
    if (/:src\s*=|\ssrc\s*=|\bv-bind:src\b/i.test(tag)) continue;
    const clsM = tag.match(/(?:^|\s)class\s*=\s*["']([^"']*)["']/);
    const cls = clsM ? clsM[1].trim() : '';
    const nextEl = code.slice(re.lastIndex).match(/^\s*<[a-zA-Z][^>]*>/);
    const orphanRisk =
      /\bv-if\s*=|\bv-else-if\s*=/.test(tag) &&
      !!nextEl &&
      /\bv-else(?:-if)?\b/.test(nextEl[0]);

    let head = code.slice(last, m.index);
    let tailStart = re.lastIndex;
    let replacement;
    if (cls || orphanRisk) {
      // 降级为 <span>：保留 class / v-if / :class 等全部其余属性，仅去掉 img 语义与 alt
      const span = tag
        .replace(/^<img\b/i, '<span')
        .replace(/\s+alt\s*=\s*(?:"[^"]*"|'[^']*')/i, '')
        .replace(/\/?>\s*$/, '')
        .replace(/\s+$/, '');
      replacement = `${span}></span>`;
      actions.push({
        action: 'img→span',
        cls,
        reason: orphanRisk ? 'v-if/v-else 链上（删除会致 v-else 悬空）' : '有静态 class（保留 CSS 钩子）',
      });
    } else {
      // 整元素删除：吃掉同行前导缩进 + 尾随空白换行，不留空白行
      head = head.replace(/[ \t]*$/, '');
      const tw = code.slice(tailStart).match(/^[ \t]*\n?/);
      if (tw) tailStart += tw[0].length;
      replacement = '';
      actions.push({ action: 'deleted', cls });
    }
    out += head + replacement;
    last = tailStart;
  }
  out += code.slice(last);
  if (actions.length > 0 && logger) {
    logger.warn('🛡️ P0-4 已净化「无源 <img>」（幽灵引用剥离后不再留破图）', { actions });
  }
  return out;
}

/**
 * 🛡️ P1-3 辅助函数：收集子组件中已渲染的文本内容
 *
 * 遍历 files 中 package/components/*.vue 的 <template> 部分，提取所有可见文本节点。
 * 返回 Set<string>，包含所有在子组件中出现的文本片段（长度 ≥ 2 的非空白字符串）。
 *
 * @param {Object} files - 文件映射 { 'package/components/XXX.vue': content, ... }
 * @returns {Set<string>} 子组件中已渲染的文本片段集合
 */
function collectSubcomponentTexts(files) {
  const texts = new Set();
  if (!files || typeof files !== 'object') return texts;

  for (const [filePath, content] of Object.entries(files)) {
    // 只处理子组件文件（package/components/*.vue）
    if (!filePath.startsWith('package/components/') || !filePath.endsWith('.vue')) {
      continue;
    }
    if (typeof content !== 'string') continue;

    // 提取 <template> 部分
    const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/i);
    if (!templateMatch) continue;
    const templateContent = templateMatch[1];

    // 提取所有文本节点（标签之间的文本内容）
    // 匹配：>文本< 或 >文本</tag>
    const textNodeRe = />([^<>{}]+)</g;
    let match;
    while ((match = textNodeRe.exec(templateContent)) !== null) {
      const text = match[1].trim();
      // 过滤：长度 ≥ 2、非纯注释、非纯空白
      if (text.length >= 2 && !text.startsWith('<!--')) {
        texts.add(text);
      }
    }

    // 额外提取：插值表达式 {{ xxx }} 中的字面量字符串
    const interpRe = /\{\{\s*['"]([^'"]+)['"]\s*\}\}/g;
    while ((match = interpRe.exec(templateContent)) !== null) {
      const literal = match[1].trim();
      if (literal.length >= 2) {
        texts.add(literal);
      }
    }
  }

  return texts;
}

/**
 * 🛡️ P1-3 辅助函数：从 headerSlot content 提取关键文本片段
 *
 * 将 headerSlot.content（如 "设备类型 28" / "设备总数 68562"）拆分为多个片段，
 * 用于与子组件文本集合比对。提取规则：
 * 1. 整体作为一个片段
 * 2. 按空格/标点拆分的单词（长度 ≥ 2）
 * 3. 数字部分（长度 ≥ 2）
 *
 * @param {string} content - headerSlot.content
 * @returns {string[]} 文本片段数组
 */
function extractTextFragments(content) {
  if (!content || typeof content !== 'string') return [];
  const fragments = [];

  // 1. 整体作为一个片段
  const trimmed = content.trim();
  if (trimmed.length >= 2) {
    fragments.push(trimmed);
  }

  // 2. 按空格/标点拆分
  const words = content.split(/[\s,，。.;；:：!！?？]+/).filter(w => w.length >= 2);
  fragments.push(...words);

  // 3. 提取数字部分（长度 ≥ 2）
  const numbers = content.match(/\d{2,}/g);
  if (numbers) {
    fragments.push(...numbers);
  }

  // 去重
  return Array.from(new Set(fragments));
}

/**
 * T09: headerSlots 补齐（确定性兜底）
 *
 * 现象：设计稿标题栏右侧有统计指标（如「设备类型 28 / 设备总数 68562 / 完好率 98%」），
 * headerSlots 已确定性推导出来，但模型只在 `<template #title_right>` 里写了注释
 * 或干脆不生成插槽 → 预览里头部一片空白。
 * 处理：对每个未落地的 slotType，用 headerSlots[].content 注入最小可见 DOM。
 *
 * 🛡️ P1-3（2026-09-07，#565）：headerSlots/sections 重叠去重。
 * 根因：vision 把同一份统计数据同时放进 headerSlots 和 layout.sections（如 header-stats），
 * 下游两路消费：section → HeaderStats 子组件；headerSlots → T09 兜底注入插槽 → 重复渲染。
 * 治本：注入前检查子组件是否已渲染相同内容，重叠则跳过注入。
 */
export function ensureHeaderSlots(code, input, options = {}) {
  const { componentType, files } = options;
  const logger = safeLogger(options.logger);
  if (!code || typeof code !== 'string') return code;
  if (componentType === 'vue3') return code; // vue3 无 base-panel 宿主

  // 🛡️ 插槽名下划线→连字符归一化（2026-09-03，mc-max-1788369882821 实锤）：
  // LLM 可能直接生成 <template #header_right>/#title_left/#title_right（下划线），但
  // base-panel/default-panel 的真实插槽名是连字符（#header-right/#title-left/#title-right）。
  // 下划线插槽名不被宿主识别 → 插槽内容被 Vue 静默丢弃 → header 右侧 icon 消失。
  // 确定性归一化：无论 LLM 生成哪种写法，都落到连字符（与下方 slotNameMap 一致）。
  const beforeSlotNorm = code;
  code = code.replace(
    /<template\s+#(header_right|title_left|title_right)\b/gi,
    (m) => m.replace(/_/g, '-'),
  );
  if (code !== beforeSlotNorm) {
    logger?.warn('🔧 头部插槽名下划线→连字符归一化（header_right → header-right 等）');
  }

  let slots = Array.isArray(input?.headerSlots) ? input.headerSlots : [];
  if (slots.length === 0) return code;
  if (!/<base-panel/i.test(code)) return code;

  // 🛡️ P1-3（2026-09-07）：headerSlots/sections 重叠去重。
  // 收集子组件中已渲染的文本内容，与 headerSlots 比对，重叠则跳过注入。
  const subcomponentTexts = collectSubcomponentTexts(files);
  if (subcomponentTexts.size > 0) {
    const beforeDedup = slots.length;
    slots = slots.filter((slot) => {
      const content = String(slot?.content || '').trim();
      if (!content) return true;
      // 提取 slot content 中的关键数字/文本片段，检查子组件是否已渲染
      const fragments = extractTextFragments(content);
      for (const frag of fragments) {
        if (subcomponentTexts.has(frag)) {
          logger?.warn(
            `🛡️ T09 P1-3 重叠去重：headerSlots "${content.slice(0, 30)}" 与子组件内容重叠（片段 "${frag}"），跳过注入`,
          );
          return false;
        }
      }
      return true;
    });
    if (slots.length !== beforeDedup) {
      logger?.warn(
        `🛡️ T09 P1-3 已剔除 ${beforeDedup - slots.length} 个与子组件重叠的 headerSlots（防重复渲染）`,
      );
    }
  }

  // 🛡️ P5 DOM 级清理（2026-09-09）：被 P1-3 过滤掉的 slot 若已有 <template #XXX> DOM → 移除整个模板
  // P1-3 仅在 slots 契约层面跳过注入，但 LLM 直接生成的/缓存恢复的 <template> 节点仍留在代码中。
  // 子组件已渲染相同内容 + 主组件 template 里也挂了同一内容 → 双份渲染（T09 重复渲染）。
  // 🛡️ Loop 2.1.D（2026-09-10）：逻辑抽到 utils/slot-dom-deduper.js（纯函数、可单测），
  // 与 2.1.C 互斥裁决配套——契约删了 DOM 也要删。
  if (subcomponentTexts.size > 0) {
    const domResult = removeOverlappingSlotDom(code, { subcomponentTexts });
    if (domResult.removed > 0) {
      code = domResult.code;
      logger?.warn(
        `🛡️ T09 P5 已完成 DOM 级清理：移除 ${domResult.removed} 个与子组件内容重叠的 <template #header-right/title-left/title-right> 模板节点`,
      );
    }
  }
  if (slots.length === 0) return code;

  // 🛡️ C-2（2026-09-02，mc-max-1788349399134-9c3aff7f）：T09 兜底注入前越界几何过滤（双保险）。
  // C-1 已在 graph 层按 validator rejectedNodes 剔除误判；但 headerSlots 可能来自 checkpoint/
  // 缓存恢复（绕过 graph 校验路径），故注入前对每个候选做 bbox 相交判定：候选 figmaNodeId
  // 对应节点与「header 容器」bbox 完全不相交 → 内容区元素被误判为 header 插槽 → 跳过注入
  // （避免 T09 把图标当纯文字渲染 + 双份挂载）。找不到节点/容器 → 保守保留原行为。
  const figmaNodeData = input?.figmaNodeData?.document || input?.figmaNodeData;
  if (figmaNodeData && typeof figmaNodeData === 'object') {
    // 1) 定位 header 容器 bbox（与 figma-connector.findHeaderContainer 同款启发）
    let headerBox = null;
    const walkFindHeader = (node) => {
      if (headerBox || !node || typeof node !== 'object') return;
      const nm = String(node.name || '').toLowerCase();
      if (
        (nm.includes('header') || nm.includes('头部')) &&
        (node.type === 'FRAME' || node.type === 'GROUP') &&
        node.absoluteBoundingBox
      ) {
        headerBox = node.absoluteBoundingBox;
        return;
      }
      if (Array.isArray(node.children))
        node.children.forEach(walkFindHeader);
    };
    walkFindHeader(figmaNodeData);
    // 2) 候选定位（id 优先，其次 name——9c3aff7f 的误判候选 figmaNodeId 实为 name "tabs-icon"/"num"）
    const findNodeBox = (key) => {
      if (!key) return null;
      let box = null;
      const walkFind = (node) => {
        if (box || !node || typeof node !== 'object') return;
        if (
          String(node.id || '') === String(key) ||
          String(node.name || '') === String(key)
        ) {
          if (node.absoluteBoundingBox) box = node.absoluteBoundingBox;
          return;
        }
        if (Array.isArray(node.children)) node.children.forEach(walkFind);
      };
      walkFind(figmaNodeData);
      return box;
    };
    if (headerBox) {
      const before = slots.length;
      const hx = headerBox.x ?? 0;
      const hy = headerBox.y ?? 0;
      const hw = headerBox.width ?? 0;
      const hh = headerBox.height ?? 0;
      slots = slots.filter((slot) => {
        if (String(slot?.slotType || '').trim() !== 'header-right') return true;
        const sbox = findNodeBox(slot?.figmaNodeId || slot?.id || slot?.name);
        if (!sbox) return true; // 定位不到 → 保守保留
        const sx = sbox.x ?? 0;
        const sy = sbox.y ?? 0;
        const sw = sbox.width ?? 0;
        const sh = sbox.height ?? 0;
        // bbox 完全不相交（任一轴无重叠）→ 越界
        const xOverlap = sx < hx + hw && hx < sx + sw;
        const yOverlap = sy < hy + hh && hy < sy + sh;
        const intersect = xOverlap && yOverlap;
        if (!intersect) {
          logger.warn(
            `🛡️ T09 C-2 越界过滤：header-right 候选 ${slot?.figmaNodeId || slot?.name || slot?.content}（bbox ${Math.round(sx)},${Math.round(sy)} ${Math.round(sw)}x${Math.round(sh)}）与 header 容器（${Math.round(hx)},${Math.round(hy)} ${Math.round(hw)}x${Math.round(hh)}）不相交，跳过注入`,
          );
        }
        return intersect;
      });
      if (slots.length !== before) {
        logger.warn(
          `🛡️ T09 C-2 已剔除 ${before - slots.length} 个越界 header-right 候选（内容区元素误判，防文字兜底双份渲染）`,
        );
      }
    }
  }
  if (slots.length === 0) return code;

  // slotType → base-panel 插槽名
  // 🛡️ 修复（2026-09-03）：base-panel / default-panel 的真实插槽名是**连字符**（#header-right /
  // #title-left / #title-right，见 frontend base-panel/index.vue 与 default-panel/index.vue）。
  // 旧映射把 slotType 归一化到下划线（header_right 等）→ 注入/生成的 <template #header_right>
  // 与面板插槽名不匹配，插槽内容被 Vue 丢弃 → header 右侧 icon 静默消失（mc-max-1788369882821 实锤）。
  const slotNameMap = {
    'title-left': 'title-left',
    title_left: 'title-left',
    'title-right': 'title-right',
    title_right: 'title-right',
    'header-right': 'header-right',
    header_right: 'header-right',
  };

  // 按插槽名聚合待补内容
  const pending = new Map();
  for (const slot of slots) {
    const slotName = slotNameMap[String(slot?.slotType || '').trim()];
    if (!slotName) continue;
    const content = String(slot?.content || '').trim();
    if (!content) continue;

    // 已有该插槽且内部有非注释实体内容 → 跳过
    const existing = new RegExp(
      `<template\\s+#${slotName}\\s*>([\\s\\S]*?)</template>`,
      'i',
    ).exec(code);
    if (existing) {
      const inner = existing[1].replace(/<!--[\s\S]*?-->/g, '').trim();
      if (inner) continue;
    }
    if (!pending.has(slotName)) pending.set(slotName, []);
    pending.get(slotName).push(content);
  }
  if (pending.size === 0) return code;

  let result = code;
  const injected = [];
  // ⚠️ 内联样式而非 class：兜底注入时 common.less 里没有对应规则，
  //    用 class 会再次出现「有 DOM 没样式」；内联最小样式保证一定可见。
  const itemStyle =
    'display:inline-flex;align-items:center;gap:4px;margin-left:16px;' +
    'font-size:13px;line-height:1;white-space:nowrap;';
  for (const [slotName, contents] of pending) {
    const items = contents
      .map((text) => `        <span style="${itemStyle}">${text}</span>`)
      .join('\n');
    const block =
      `      <template #${slotName}>\n` +
      `        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->\n` +
      `${items}\n` +
      `      </template>\n`;

    const existingRe = new RegExp(
      `([ \\t]*)<template\\s+#${slotName}\\s*>[\\s\\S]*?</template>\\s*\\n`,
      'i',
    );
    if (existingRe.test(result)) {
      result = result.replace(existingRe, block); // 空插槽 → 填充
    } else {
      // 插到 <base-panel ...> 开标签之后
      result = result.replace(/(<base-panel[^>]*>\s*\n)/i, `$1${block}`);
    }
    injected.push(slotName);
  }

  if (injected.length > 0 && logger) {
    logger.warn('🔧 T09 已确定性补齐 base-panel 头部插槽（模型漏生成）', {
      injected,
      slotCount: slots.length,
    });
  }
  return result;
}

/**
 * 🛡️ 尺寸联动 clamp：min-height 超根容器高 → 压至 85%
 */
export function clampOversizeMinHeight(files, options = {}) {
  const logger = safeLogger(options.logger);
  const idx = files['package/index.vue'];
  if (typeof idx !== 'string') return null;
  // 1. 根容器 class（base-panel 内第一个 div，取含 -root 的优先）
  const rootClassMatch =
    idx.match(/<div\s+class="([^"]*-root[^"]*)"/) ||
    idx.match(/<div\s+class="([^"]+)"/);
  if (!rootClassMatch) return null;
  const rootClass = rootClassMatch[1].trim().split(/\s+/).pop();
  if (!rootClass) return null;
  // 2. 根容器固定 height（从 less/css + vue style 块里找 .rootClass 规则）
  const esc = rootClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rootRuleRe = new RegExp(`\\.${esc}\\s*\\{([^}]*)\\}`);
  let rootH = null;
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (!/\.(less|css)$/i.test(p) && !p.endsWith('.vue')) continue;
    const m = c.match(rootRuleRe);
    if (m) {
      const hm = m[1].match(/(?:^|;)\s*height:\s*(\d+(?:\.\d+)?)px/);
      if (hm) {
        rootH = parseFloat(hm[1]);
        break;
      }
    }
  }
  if (!rootH || rootH >= 600) return null;
  const cap = Math.round(rootH * 0.85);
  // 3. 所有样式文本里 min-height > rootH → clamp
  let changed = false;
  const out = {};
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (!/\.(less|css)$/i.test(p) && !p.endsWith('.vue')) continue;
    const next = c.replace(/min-height:\s*(\d+(?:\.\d+)?)px/g, (whole, num) => {
      if (parseFloat(num) > rootH) {
        changed = true;
        return `min-height: ${cap}px`;
      }
      return whole;
    });
    if (next !== c) out[p] = next;
  }
  if (!changed) return null;
  if (logger) {
    logger.warn(
      `🛡️ 尺寸联动 clamp：min-height 超根容器高 ${rootH}px → 压至 ${cap}px`,
      { files: Object.keys(out) },
    );
  }
  return out;
}

/**
 * 🛡️ fix-section-heights 规则实现（语义分流校验，2026-08-29，mc-max-1788003319188-c32142f3 实锤）。
 *
 * 背景：该规则早已在 code-fix-rules.js 注册，但本方法从未实现（悬挂引用），
 * 导致 `flex: 180 1 0` 这类「设计稿像素高度误填 flex-grow」的布局崩坏无法被自动修复。
 *
 * 根因不是「flex-grow 值太大」——flex-grow 是纯比例、无上限，100+ 完全合法。
 * 真正的病灶是**语义混淆**：设计稿 chart `height: 180px` 是像素高度，模型把它直接填进了
 * flex-grow 字段（`flex: 180 1 0`）。正常作者用 flex-grow 表达比例时写 1~5 的小整数
 * （1:2:3 ≡ 100:200:300，写大数无意义），一旦 flex-grow 落在「像素量级」（20~5000），
 * 几乎必然是「px 高度误填比例字段」。故此处不查「绝对值是否超限」，而查「值是否落在
 * 像素量级」这一误填信号——这就是与「值域禁止」的本质区别。
 *
 * 三条规则（均确定性、幂等）：
 *  ① flex-grow 量纲检测（**只告警、不改写**）
 *  ② height:100% section 根：flex 容器（规则体含 display:flex）内的 `height:100%`
 *     → `flex: 1 1 0`（等比例分配，杜绝多 section 各自 100% 高度互相溢出）
 *  ③ 比例失衡告警（不 BLOCK）：同文件 flex-grow 最大/最小比值 > 50 → warn
 *
 * ⚠️⚠️ 规则① 重大修订（2026-09-01，缺口③ 取证实锤）——**禁止**把像素量级 grow 归一化成 1：
 *
 * 原实现把 `flex: <grow 20~5000> <shrink> <basis>` 一律改成 `flex: 1 1 0`（等比例归一化），
 * 其前提是「grow 落在像素量级 = px 高度误填比例字段」。但该前提已与现行规范矛盾：
 *   - `prompts/engineer/shared/root-container.md`：内容区块**必须**写 `flex: <Figma高度px> 1 0`
 *     （flex-grow 直接取设计稿高度值，引擎按各区块设计稿高度自动等比分配）；
 *   - `prompts/engineer/dynamic/chart-standards.md`：多图表时同样要求 `flex: <Figma高度px> 1 0`；
 *   - `validators/code-fix-rules.js` 规则注释亦写「→ `flex: <px> 1 0; min-height: 0`」。
 * 即「像素量级 grow」是**规范要求的正确写法**，归一化反而把设计稿比例抹平成 1:1:1。
 *
 * 实锤（mc-max-1788186816669-8f7b5097 快照 revisions）：历史 revision 中
 * `BridgeHourly.vue:265`/`FlowPrediction.vue:277`/`common.less:81,160,162,311,315,395,396`
 * 出现大面积 `flex: 1 1 0` —— 正是本规则把 110/100/180/131/142 抹平后的残骸，
 * 下一轮生成又写回像素值，形成「改坏 → 重生成 → 再改坏」的震荡。
 *
 * 真正的病灶不是「grow 值大」，而是**量纲混用**：同一组兄弟节点里部分写像素量级
 * （如 131/142/180）、部分写比例量级（如 12/15/17/20），比例才崩坏。
 * 故规则①改为纯检测：发现量纲混用只告警，交由 L0-B 的 FLEX-003/004 携带 Figma 真值拦截，
 * 由 LLM 统一量纲（后处理无 Figma 真值，无法自行换算）。
 *
 * @param {string} content 单个样式文件（.vue 的 <style> 或 .less/.css）内容
 * @param {object} ctx 规则上下文（含 path）
 * @returns {string} 修复后内容（规则① 不再改写 grow 值）
 */
export function fixSectionHeightsForResource(content, ctx, options = {}) {
  const logger = safeLogger(options.logger);
  if (typeof content !== 'string' || !content) return content;
  const path = ctx?.path || '';
  const growValues = [];
  let changed = false;

  // 规则①：flex-grow 量纲检测（**只收集、不改写**）
  // ⚠️ 严禁恢复「像素量级 grow → 归一化成 1」：flex: <flexGrow系数> 1 0 才是规范要求的正确写法
  //（系数来自 A4 figma-height-ratio.js 归一化 avg=1 量纲，如 0.978 / 1.061）。像素量级 grow
  //（flex: 131 1 0）是过时写法，会导致 FLEX-005 BLOCK（混用比例+像素量纲）。
  const FLEX_TRIPLE_RE = /flex\s*:\s*(\d+)\s+([01])\s+(0|auto)\b/g;
  for (const m of content.matchAll(FLEX_TRIPLE_RE)) {
    growValues.push(parseInt(m[1], 10));
  }
  const out1 = content;

  // 规则②：flex 容器（section 根）的 height:100% → flex: 1 1 0
  // 仅处理「规则体含 display:flex」的块，避免误伤固定尺寸父容器内的 icon/img（height:100% 正确）
  const RULE_BLOCK_RE = /([^{}]*\{)([^{}]*)\}/g;
  // ⚠️ 组件根豁免（2026-09-02 实锤，mc-max-1788280914596-25b10e4d 等三组件）：
  // 本规则改写的是「父级为组件内部 flex 容器」的内部 section——它们各写 height:100% 会
  // 互相溢出，改成 flex 分配正确。但**组件根**（-root 结尾的类，与本文件 :1407 的
  // 根选择器识别同约定）的父级是宿主 `.pannel-content`——block 定高容器
  // （height: calc(100% - 38px)，**无 display:flex**，见 frontend default-panel/index.vue），
  // `flex: 1 1 0` 在非 flex 父容器下完全失效 → 根高度退 auto → 内部
  // `flex:1; min-height:0` 的图表区拿到 0 → 内容整块消失。
  // 生成时间线放大了该 bug：chunk 级快照推的是模型原始产出（height:100% 还在，预览正常），
  // 收尾 code-fix pipeline 改写后才推最终快照 → 用户看到「中途是好的，完成时反而坏了」。
  // `-root\b` 词边界：.c-x-rooter 不误豁免。
  // 🔴 2026-09-11 二次实锤（c-env-monitor-xh8jdcpy-2aa25837）：层① 确定性模板的根内容容器
  // 是 `c-{semantic}-slot-con`（code-generator.js buildDeterministicIndexTemplate 硬编码），
  // 同样直连宿主 block 容器 .pannel-content——只豁免 -root 时 slot-con 的 height:100% 仍被
  // 改写成 flex:1 1 0 → 塌陷复发（flex:1 1 0 在非 flex 父容器下完全失效）。
  // 🛡️ 事实优先级表（docs/确定性收回清单-2026-09-16.md §六 #1）：**section 根的 flex 由高度
  //   比例事实唯一决定**，规则②/④ 不得改写。⚠️ 本豁免**只认 `-root` / `-slot-con`**，
  //   而全语料 section 根尾段还有 `-con`(742) / `-section`(548) / `-wrapper`(396) /
  //   `-container`(324) / `-card`(302) **均未覆盖** → 它们的 grow 会被规则②/④ 抹平
  //   （实锤 `.c-…-chart-con` / `.c-…-switch-con`）。扩展豁免前先按 §六 加 WARN 观测。
  const ROOT_SELECTOR_RE = /\.[\w-]*-(root|slot-con)\b/;
  // 🆕 A4 加权（2026-09-04，实锤 mc-max-1788454423557-25e40782；2026-09-09 修订从 px 改系数）：
  // section 根类命中 ctx.sectionHeights（{根class: flexGrow系数}，由 engineer
  // _buildSectionHeightsMap 按「plan.effectiveSections 顺序 ↔ 主组件模板子组件标签顺序」
  // 1:1 构建）时，用 flexGrow 系数作 grow（规范写法 flex: <系数> 1 0，与 FLEX-005 兼容），
  // 不再盲注等比例 flex: 1 1 0。旧产物已被盲注 flex: 1 1 0 的（无 height:100% 残留），
  // 走升级分支同样改写——重跑修复管线即可修复存量坏产物。
  const sectionHeights = ctx?.sectionHeights || null;
  const lookupSectionPx = (head) => {
    if (!sectionHeights) return 0;
    for (const m of String(head).matchAll(/\.([A-Za-z][\w-]*)/g)) {
      const px = sectionHeights[m[1]];
      if (Number.isFinite(px) && px > 0) return px;
    }
    return 0;
  };
  // 🛡️ 事实优先级表 §六 #1（2026-09-28）：section 根的 flex 权威 = **高度比例事实**。
  //   历史：豁免 `ROOT_SELECTOR_RE` 只认 `-root|slot-con`，而确定性容器的 section 根尾段是
  //   `-con`（如 `.c-x-con-con`）→ 全语料 **19 处漏网**（规则② 把 `height:100%` 改成
  //   `flex:1 1 0` = 等分，抹平高度比例）。先经 WARN 观测确认命中面，**已于 §七 P2 收口**
  //   （见下方 `_isSectionRootHead` 精确跳过守卫）。
  const SECTION_ROOT_HINT_RE = /-(?:con|root|slot-con)$/;
  // 🛡️ §六 #1 收口（2026-09-28 · §七 P2 落地）：section 根**且无权威比例**时，规则② 原会把
  //   `height:100%` → `flex: 1 1 0`（等分）→ 抹平高度比例（全语料 `-con` 尾段 19 处）。
  //   口径**精确**（不盲目扩 `ROOT_SELECTOR_RE`，否则会连带跳过 px>0 处的「权威系数纠偏」）：
  //   仅当 ① 尾段命中 section 根形态（`-con/-root/-slot-con`）**且** ② px===0（不在 sectionHeights）
  //   **且** ③ 原将被写成等分（body 含 `height:100%`）→ 跳过。px>0 时仍按权威系数改写（写的就是
  //   比例事实本身，非臆造），不影响既有正确纠偏。
  const _isSectionRootHead = (head) =>
    SECTION_ROOT_HINT_RE.test(head.replace(/\s*\{$/, '').trim());

  const out2 = out1.replace(RULE_BLOCK_RE, (whole, head, body) => {
    if (!/display:\s*flex/i.test(body)) return whole;
    if (ROOT_SELECTOR_RE.test(head)) return whole;
    const px = lookupSectionPx(head);
    // 🛡️ §六 #1 收口（§七 P2 · 2026-09-28）：section 根 + 无权威比例 + 原将被写成等分 → 跳过。
    if (px <= 0 && /height:\s*100%\s*;?/i.test(body) && _isSectionRootHead(head)) {
      logger?.warn?.(
        `🛡️ §六 #1：section 根 ${head.replace(/\s*\{$/, '').trim()} 无权威比例 → 规则② 跳过（不再等分 flex:1 1 0）`,
        { file: ctx?.path },
      );
      return whole;
    }
    // 升级分支：无 height:100% 但残留盲注 flex: 1 1 0 → 命中映射时改写为真值 flexGrow 系数
    // 🎯 2026-09-14 治本（c-traffic-monitor-3147d679 真机实锤）：
    // 原分支只认**字面量** `flex: 1 1 0`——LLM 若直接写了错误系数（如 vision 猜的
    // `flex: 3.73 1 0`，一对 Figma 等高 131px 的柱状图被报成 3.73/0.952，3.9 倍失配），
    // 正则完全不匹配 → 错误比例原样落盘 → 高度塔状失衡（大空白 + 区块挤压重叠）。
    // 铁律：**sectionHeights（源自 repaired plan）是唯一权威**，凡是命中该映射的 section
    // 根类，其 ratio 量级 flex 声明一律改写为权威系数；grow=0 的附属区（`flex: 0 0 Npx`）
    // 与像素量级声明不碰。幂等：改写后再跑值不变。
    if (!/height:\s*100%\s*;?/i.test(body)) {
      if (px > 0) {
        const ratioMax = Number(FLEX_GROW_SCALES?.RATIO_MAX) || 19;
        // 🛡️ 治本（2026-09-15 · c-device-monitor-44384241 实锤）：正则只认三值 `flex: X Y Z`，
        // 但 LLM 常写单值 `flex: 1` / 双值 `flex: 1 1`（与三值等价的简写）→ 命中 sectionHeights 的
        // section 根若写单值，grow 恒不改写（如 .c-device-monitor-tabs-section 的 `flex: 1` 保持 1，
        // 而非权威系数 1.661）→ switch/tab 比例 1:2.95 而非 1:4.9。此处扩展正则覆盖单/双/三值，
        // 缺省的 shrink/basis 按 CSS 规范默认补齐（单值=1 1 0，双值=<grow> <shrink> 0）。
        const newBody = body.replace(
          /flex\s*:\s*(\d+(?:\.\d+)?)(\s+[01])?(\s+(?:0|auto|0%))?\s*;?/gi,
          (m, g, s, b) => {
            const gv = Number(g);
            if (!(gv > 0) || gv > ratioMax) return m;
            const shrink = s ? s.trim() : '1';
            const basis = b ? b.trim() : '0';
            return `flex: ${px} ${shrink} ${basis};`;
          },
        );
        if (newBody !== body) {
          changed = true;
          return head + newBody + '}';
        }
      }
      return whole;
    }
    let newBody;
    if (px > 0) {
      newBody = body.replace(/height:\s*100%\s*;?/gi, `flex: ${px} 1 0;`);
      if (!/min-height\s*:\s*0/i.test(newBody)) {
        newBody = newBody.replace(/(flex:\s*[^;]+;)/i, '$1\n  min-height: 0;');
      }
    } else {
      newBody = body.replace(/height:\s*100%\s*;?/gi, 'flex: 1 1 0;');
    }
    if (newBody !== body) changed = true;
    return head + newBody + '}';
  });

  // 规则④：固定 px 尺寸区块禁 flex-grow（2026-09-02 实锤，mc-max-1788280167414-49dfbe7d）
  // CategoryNav `width: 46px; flex: 1 1 0` → flex-grow 撑满剩余宽度（实测 186px，设计 46px）。
  // flex-grow 与显式 px 尺寸矛盾（grow+basis0 会忽略 width/height），固定尺寸区块的
  // 正确写法是 flex-shrink: 0（或 flex: 0 0 auto）。
  // ⚠️ 误伤面控制（全存量语料扫描实证）：精确 width/height:<px> + flex-grow 同块
  // 全仓仅此 1 处；图表 section 是 `min-height:<px> + flex:<px> 1 0`（合法组合，不触碰）；
  // `width: 100% + grow` 行父下等价、列父下无法静态判定（→ 不触碰）。
  // 规则② 输出的 section 根（height:100%→flex:1 1 0）无 px 尺寸 → 不落入本规则。
  // 🛡️ 2026-09-28 轴判定（c-device-monitor-18de33dd 实锤 · tab-bg 高度不撑）：
  //   `flex-grow` 只沿**父容器主轴**扩展 —— 仅当「固定 px 落在父容器主轴」才与 grow 冲突。
  //   旧判据 `(width|height):<px>` **不区分轴** → 把 column 容器里「定宽(交叉轴) + flex:1 1 0
  //   (主轴=高)」的 `tab-bg` 误改成 `flex: 0 0 auto` → 高度不撑（全语料另有 tab-item 同病）。
  //   父轴向证据 = 同一 content 内「类名最长真前缀」那条规则的 `flex-direction`；
  //   **找不到证据一律不改**（宁可少改，不可误伤）。
  const DIR_BY_CLS = new Map();
  for (const m of content.matchAll(RULE_BLOCK_RE)) {
    const dm = m[2].match(/flex-direction\s*:\s*(row|column)\b/i);
    if (!dm) continue;
    for (const cm of m[1].matchAll(/\.([A-Za-z][\w-]*)/g)) {
      if (!DIR_BY_CLS.has(cm[1])) DIR_BY_CLS.set(cm[1], dm[1].toLowerCase());
    }
  }
  const parentDirOf = (cls) => {
    for (let i = cls.lastIndexOf('-'); i > 0; i = cls.lastIndexOf('-', i - 1)) {
      const cand = cls.slice(0, i);
      if (DIR_BY_CLS.has(cand)) return DIR_BY_CLS.get(cand);
    }
    return null;
  };
  const FIXED_W_PX_RE = /(?:^|[^-\w])width\s*:\s*\d+(?:\.\d+)?px/;
  const FIXED_H_PX_RE = /(?:^|[^-\w])height\s*:\s*\d+(?:\.\d+)?px/;
  const FIXED_PX_RE = /(?:^|[^-\w])(?:width|height)\s*:\s*\d+(?:\.\d+)?px/;
  const FLEX_GROW_TRIPLE_RE = /flex\s*:\s*[1-9]\d*\s+[01]\s+(?:0|auto)\b/;
  const out4 = out2.replace(RULE_BLOCK_RE, (whole, head, body) => {
    if (!FIXED_PX_RE.test(body)) return whole;
    const gm = body.match(FLEX_GROW_TRIPLE_RE);
    if (!gm) return whole;
    // §六 #1：规则④ 对 section 根（`-con` 尾段）实测 **0 处**命中（全语料）→ 无需类似规则② 的跳过守卫。
    // 轴判定：grow 沿父容器主轴扩展；只有「固定 px 在主轴上」才与 grow 冲突
    const cls = (head.match(/\.([A-Za-z][\w-]*)/) || [])[1] || '';
    const dir = cls ? parentDirOf(cls) : null;
    if (!dir) return whole; // 父轴向未知 → 不动（fail-open，宁可少改）
    const mainAxisFixed = dir === 'row' ? FIXED_W_PX_RE.test(body) : FIXED_H_PX_RE.test(body);
    if (!mainAxisFixed) return whole; // 固定 px 在交叉轴 → 与 grow 不冲突 → 不动
    const newBody = body.replace(gm[0], 'flex: 0 0 auto');
    if (newBody !== body) changed = true;
    return head + newBody + '}';
  });

  // 规则③：量纲混用 / 比例失衡告警（不 BLOCK，只提示）
  // 真正的病灶是「同一组 grow 里像素量级与比例量级混用」，而非「grow 值大」。
  const nonZero = growValues.filter((g) => g > 0);
  if (nonZero.length >= 2) {
    const pixelScale = nonZero.filter((g) => g >= FLEX_GROW_SCALES.PIXEL_MIN);
    const ratioScale = nonZero.filter((g) => g <= FLEX_GROW_SCALES.RATIO_MAX);
    if (pixelScale.length > 0 && ratioScale.length > 0) {
      if (logger) {
        logger.warn(
          '⚠️ flex-grow 量纲混用：同一文件同时出现像素量级（设计稿高度）与比例量级 grow，区块高度比例将失真',
          {
            file: path,
            pixelScale,
            ratioScale,
            hint: '统一为 flexGrow 系数写法：flex: <系数> 1 0（如有映射节）',
          },
        );
      }
    } else {
      const max = Math.max(...nonZero);
      const min = Math.min(...nonZero);
      if (min > 0 && max / min > 50) {
        if (logger) {
          logger.warn(
            '⚠️ flex-grow 比例失衡（最大/最小 > 50x），疑似像素高度误填比例字段',
            { file: path, max, min, ratio: Math.round(max / min) },
          );
        }
      }
    }
  }

  // 🛡️ 规则⑤（删减法批次 3 loop 3a，2026-09-14；2026-09-15 补 flexGrow/inline-row）：
  // 取代 healGridContainer / ensureGridDisplay / ensureFlexDirection 的事后猜测修补。
  // 事实表（sectionLayoutFacts）给出 display / gridColumns / flexDirection / flexGrow，
  // 这里只做「缺则补」，不覆盖 LLM 已写的 display / 已有 flex / 已有对齐。
  //
  // 🎯 2026-09-15 真机（c-traffic-monitor-933cbc4b）：规则② 要求块内已有 display:flex
  // 才写 flexGrow；LLM 常只写 width/min-height → 规则② 整块跳过。规则⑤ 后补 display
  // 却不写 flexGrow → 高度比例恒丢，图表靠 min-height:160px 硬撑。治本：规则② 门槛保留
  // （防误伤非 flex 容器），规则⑤ 在补完 display 后同步写入 facts.flexGrow（缺则补）。
  const layoutFacts = ctx?.sectionLayoutFacts || null;
  let out5 = out4;
  const ratioMax = Number(FLEX_GROW_SCALES?.RATIO_MAX) || 19;
  out5 = out4.replace(RULE_BLOCK_RE, (whole, head, body) => {
    let facts = null;
    if (layoutFacts) {
      for (const m of String(head).matchAll(/\.([A-Za-z][\w-]*)/g)) {
        const f = layoutFacts[m[1]];
        if (f) {
          facts = f;
          break;
        }
      }
    }
    let newBody = body;
    if (!facts) {
      // 🛡️ 2026-09-16 兜底（c-vehicle-monitor-54c256c7 / b82c9d84 实锤）：facts 对齐失败（vision
      // section 数与子组件数不等 → layoutFacts 为 null）时，规则⑤整段空转 → 内部容器写了
      // `flex:X 1 0` / `gap` / `flex-direction` / `align-items` 等 flex 专属属性、却漏了
      // display:flex → 这些属性被浏览器忽略 → 子元素 block 纵向堆叠（「内部页应该 display 却没有」）。
      // 兜底：出现任意 flex 专属属性就说明意图是 flex 布局，缺 display 时补 display:flex；
      // 已有 flex-direction 则保留（只补 display），否则默认补 row（内容多数横向）。
      //
      // 🛡️ 2026-09-20 E2E 自测修复（mc-1789860683527 实锤）：原正则 `(?:…|gap|…)\s*:`
      //   无词首边界，把 Less **变量定义** `@gap: 12px;`（theme-vars.less 的 .common() mixin）
      //   误判为 CSS `gap:` 属性 → 给 mixin 注入 `display: flex; flex-direction: row;`
      //   → mixin 体内出现裸 CSS 属性 → LESS 编译 "Properties must be inside selector
      //   blocks" → 整任务被最终 LESS 门禁 BLOCK。
      //   修复①：正则加 `(^|[^@\w-])` 前置边界——`@gap:`/`-gap:`/`xgap:` 均不命中，仅裸 CSS 属性命中。
      //   修复②：mixin 定义块（head 含 `.xxx()`）整体跳过——mixin 内只有 Less 变量，不是渲染规则。
      const isMixinBlock = /\.[A-Za-z][\w-]*\([^)]*\)\s*$/.test(String(head).trim());
      if (isMixinBlock) {
        return whole;
      }
      
      // 🛡️ 2026-09-21 治本修复（c-device-monitor-bd796f8b 实锤）：
      //   原逻辑只看 CSS 属性名就强制补 display:flex，不判断元素类型和子元素数量。
      //   导致叶子节点（img/span/单图标 wrapper）被注入 flex → 浏览器忽略无效属性。
      //   治本：从 Figma 节点树提取每个 CSS 选择器对应的子元素数量，
      //   子元素 ≤1 不加 flex（叶子节点或单元素容器），≥2 才注入 flex。
      const childCounts = ctx?.selectorChildCounts || null;
      let childCount = null;
      if (childCounts) {
        for (const m of String(head).matchAll(/\.([A-Za-z][\w-]*)/g)) {
          if (childCounts[m[1]] !== undefined) {
            childCount = childCounts[m[1]];
            break;
          }
        }
      }
      
      const hasFlexGrow = /(?:^|[^@\w-])flex\s*:\s*\d+(?:\.\d+)?\s+1\s+0\b/.test(body);
      const hasFlexOnly =
        /(?:^|[^@\w-])(?:flex-direction|align-items|justify-content|align-content|gap|flex-wrap)\s*:/.test(
          body,
        );
      
      // 子元素 ≤1 不加 flex（叶子节点或单元素容器）
      if (childCount !== null && childCount <= 1) {
        return whole;
      }
      
      if ((hasFlexGrow || hasFlexOnly) && !/display\s*:/i.test(body)) {
        if (/flex-direction\s*:/.test(body)) {
          newBody = `\n  display: flex;${body}`;
        } else {
          newBody = `\n  display: flex;\n  flex-direction: row;${body}`;
        }
        changed = true;
        return head + newBody + '}';
      }
      return whole;
    }
    if (facts.display === 'grid') {
        if (!/display\s*:\s*grid/i.test(newBody)) {
          newBody = `\n  display: grid;${newBody}`;
        }
        if (
          facts.gridColumns &&
          !/grid-template-columns/i.test(newBody)
        ) {
          newBody += `\n  grid-template-columns: repeat(${facts.gridColumns}, 1fr);`;
        }
      } else if (!/display\s*:\s*flex/i.test(newBody)) {
        // 🛡️ 2026-09-30 复审 §8.8 #13（同族最后一个伪装兜底，A 类）：
        //   无方向事实时旧写法写 `flex-direction: column`（把「无事实」伪装成事实）；
        //   而**直接删掉** `|| 'column'` 又会打印 `flex-direction: undefined`
        //   （同族历史症状：09-22/09-23 实测 5 组件 20 文件，且**全部落在 `display:grid` 类上**）。
        //   正确修法 = **三态**，对齐 `utils/layout-facts-injector.js:90-115` 的既有护栏：
        //     有方向事实 → 写明方向；无方向事实 → **不写该行**（仅保留 display:flex），
        //     交后处理按事实表「缺则补」（规则⑤）。
        //   触发面 **0**（live 口径 505/505 flex 事实都有方向）⇒ 本次改动零行为变化。
        const dir = facts.flexDirection;
        newBody = dir
          ? `\n  display: flex;\n  flex-direction: ${dir};${newBody}`
          : `\n  display: flex;${newBody}`;
      }
      // flexGrow：内容根（-root/-slot-con）不写（父级是 block，flex 失效）。
      // 已有任何 flex: 声明（含 flex: 0 0 Npx / 已有正确 grow）不覆盖，交给规则②改错值。
      // 🛡️ 2026-09-16 收窄：row 容器不写 flexGrow（row 容器的高度不应由 flexGrow 决定，
      // 否则会被压缩到极小高度，内部固定高度内容溢出）。
      const grow = Number(facts.flexGrow);
      const hasFixedFlex = /flex\s*:\s*0\s+0\b/i.test(newBody);
      const hasAnyFlex = /(?:^|[\s;{])flex\s*:/i.test(newBody);
      const isRowContainer = facts.flexDirection === 'row';
      if (
        grow > 0 &&
        grow <= ratioMax &&
        !ROOT_SELECTOR_RE.test(head) &&
        !hasFixedFlex &&
        !hasAnyFlex &&
        !isRowContainer
      ) {
        newBody += `\n  flex: ${grow} 1 0;`;
        if (!/min-height\s*:/i.test(newBody)) {
          newBody += `\n  min-height: 0;`;
        }
      }
      // inline-row：横向 section 缺对齐时补两端对齐（不覆盖已有 align/justify；grid 不写）。
      // 🛡️ 2026-09-16 收窄：已有 gap 的容器不注入 justify-content（gap 已定义间距，
      // space-between 会破坏自然间距，导致内容被挤到容器边缘）。
      if (isRowContainer && facts.display !== 'grid') {
        if (!/align-items\s*:/i.test(newBody)) {
          newBody += `\n  align-items: center;`;
        }
        const hasGap = /gap\s*:/i.test(newBody);
        if (!hasGap && !/justify-content\s*:/i.test(newBody)) {
          newBody += `\n  justify-content: space-between;`;
        }
      }
      if (newBody !== body) {
        changed = true;
        return head + newBody + '}';
      }
      return whole;
    });

  if (changed && logger) {
    logger.warn(
      '🛡️ 语义分流修复：flex-grow 臆造值 / height:100% section 根 → 等比例分配；固定 px 尺寸区块 → flex: 0 0 auto；布局事实缺则补（display/grid/flex-direction）',
      { file: path },
    );
  }
  return changed ? out5 : content;
}

/**
 * 检测 index.vue 中引用的子组件路径
 */
export function detectSubComponents(indexVueContent) {
  if (!indexVueContent) return [];
  const set = new Set();

  // 静态 import: import X from '...components/xxx'
  const staticRe = /from\s*['"]([^'"]*?components\/([^'"\/]+?))['"]/g;
  let m;
  while ((m = staticRe.exec(indexVueContent)) !== null) {
    const name = m[2].replace(/\.vue$/i, '');
    if (name) set.add(`package/components/${name}.vue`);
  }

  // 动态 import(): import('...components/xxx')
  const dynamicRe =
    /import\s*\(\s*['"]([^'"]*?components\/([^'"\/]+?))['"]\s*\)/g;
  while ((m = dynamicRe.exec(indexVueContent)) !== null) {
    const name = m[2].replace(/\.vue$/i, '');
    if (name) set.add(`package/components/${name}.vue`);
  }

  // require(): require('...components/xxx')
  const requireRe =
    /require\s*\(\s*['"]([^'"]*?components\/([^'"\/]+?))['"]\s*\)/g;
  while ((m = requireRe.exec(indexVueContent)) !== null) {
    const name = m[2].replace(/\.vue$/i, '');
    if (name) set.add(`package/components/${name}.vue`);
  }

  return [...set];
}

/**
 * 自动补齐子组件 import（script 段漏 import 子组件时）
 */
export function ensureSubComponentImport(content, options = {}) {
  const logger = safeLogger(options.logger);
  if (!content || typeof content !== 'string') return content;
  const tpl = extractSfcTemplate(content);
  if (!tpl) return content;

  // 提取 template 里的 PascalCase 子组件标签（排除 Vue 内置组件）
  const VUE_BUILTINS = new Set([
    'RouterView',
    'RouterLink',
    'KeepAlive',
    'Transition',
    'TransitionGroup',
    'Suspense',
    'Teleport',
    'Component',
    'Slot',
  ]);
  const subComps = new Set();
  for (const m of tpl.matchAll(/<([A-Z][\w]*)\b/g)) {
    if (!VUE_BUILTINS.has(m[1])) subComps.add(m[1]);
  }
  if (subComps.size === 0) return content;

  // 提取 script 已 import 的绑定名（默认导入 + 具名导入）
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const scriptBody = scriptMatch ? scriptMatch[1] : '';
  const declared = new Set();
  for (const m of scriptBody.matchAll(
    /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]/g,
  ))
    declared.add(m[1]);
  for (const m of scriptBody.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]/g)) {
    for (const n of m[1].split(',')) {
      const name = n
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (name) declared.add(name);
    }
  }
  // 🛡️ 也识别 const/let/var/function 声明：模型可能用 defineAsyncComponent 动态导入子组件
  // （如 `const TotalTraffic = defineAsyncComponent(() => import(...))`），此时标识符已声明，
  // 若再补静态 `import TotalTraffic from ...` 会报 "already been declared" 导致写盘失败。
  for (const m of scriptBody.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
  ))
    declared.add(m[1]);
  for (const m of scriptBody.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\b/g))
    declared.add(m[1]);

  const missing = [...subComps].filter((c) => !declared.has(c));
  if (missing.length === 0) return content;

  const importLines = missing
    .map((c) => `import ${c} from './components/${c}.vue'`)
    .join('\n');
  if (logger) {
    logger.warn('🔧 自动补齐子组件 import（script 段漏 import 子组件）', {
      missing,
    });
  }
  // 插到 <script ...> 之后
  return content.replace(
    /<script([^>]*)>(\s*)/i,
    (m, attrs, ws) => `<script${attrs}>${ws}${importLines}\n`,
  );
}

/**
 * 🛡️ 层①（2026-09-11）：删除死子组件 import —— 治 CODE-021（import 了但模板 0 处引用）。
 * ensureSubComponentImport 只「补缺失 import」，本函数做对称的「删多余 import」：
 * 脚本里 `import X from './components/X.vue'` 但 X 在 <template> 里 0 处引用（非 <X 标签、
 * 非 :is="X" 动态引用）→ 该 import 是死代码（真实结构只活在未挂载的子组件里），确定性移除。
 * 与层①确定性模板装配配套：模板由系统生成后，脚本段的子组件 import 以模板标签为唯一事实源，
 * LLM 臆造/多 import 的子组件名被裁剪，杜绝「import 与模板不一致」→ CODE-021 BLOCK。
 */
export function pruneDeadSubComponentImports(content, options = {}) {
  const logger = safeLogger(options.logger);
  if (!content || typeof content !== 'string') return content;
  // 🛡️ 2026-09-11（0ca84358 实锤）：模板区提取改用共享边界法 —— lazy `</template>`
  // 会被具名插槽提前闭合截断，插槽后的主内容标签全部不可见 → 全部 import 被误判
  // 「模板未引用」删除 → 悬空标签（SwitchSection/TabsSection/MainSection 事故）。
  const templateBody = extractSfcTemplate(content);
  if (!templateBody) return content;

  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return content;
  const scriptBody = scriptMatch[1];

  // 模板里实际引用的子组件名：<PascalCase ...> 或 <component :is="X">
  const used = new Set();
  for (const m of templateBody.matchAll(/<([A-Z][\w]*)\b/g)) used.add(m[1]);
  for (const m of templateBody.matchAll(/:is\s*=\s*["']([A-Za-z_$][\w$]*)["']/g))
    used.add(m[1]);

  const dead = [];
  const importRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]\.\/components\/[^'"]+['"]/g;
  for (const m of scriptBody.matchAll(importRe)) {
    if (!used.has(m[1])) dead.push(m[1]);
  }
  if (dead.length === 0) return content;

  let newScript = scriptBody;
  for (const name of dead) {
    newScript = newScript.replace(
      new RegExp(`import\\s+${name}\\s+from\\s*['"]\\.\\/components\\/[^'"]+['"]\\s*\\n?`, 'g'),
      '',
    );
  }

  if (logger) {
    logger.warn('🔧 已删除死子组件 import（模板未引用）', { dead });
  }
  return content.replace(scriptBody, newScript);
}

/**
 * 将可点击的 icon div 重写为 button 元素
 */
export function rewriteClickableIconDivsToButtons(content) {
  if (!content || typeof content !== 'string') {
    return { content, changed: false, count: 0 };
  }

  const clickableIconDivPattern =
    /<div([^>]*\bclass=(['"])[^'"]*(?:icon|btn|button|action|control|close|refresh|setting|operate)[^'"]*\2[^>]*\s(?:@click|v-on:click|role=(['"])button\3|aria-label=|tabindex=)[^>]*)>([\s\S]*?)<\/div>/gi;

  let count = 0;
  const nextContent = content.replace(
    clickableIconDivPattern,
    (match, attrs = '', _quote, _roleQuote, inner = '') => {
      if (
        /<(?:div|section|article|header|footer|main|ul|ol|li|table|form)\b/i.test(
          inner,
        )
      ) {
        return match;
      }

      let nextAttrs = attrs
        .replace(/\srole=(['"])button\1/gi, '')
        .replace(/\stabindex=(['"])-?\d+\1/gi, '')
        .trim();

      // 加 role="button" 保证可访问性，但不使用原生 <button>（避免浏览器默认样式污染）
      if (!/\brole=/.test(nextAttrs)) {
        nextAttrs += ' role="button"';
      }

      count += 1;
      return `<div${nextAttrs}>${inner}</div>`;
    },
  );

  return {
    content: nextContent,
    changed: count > 0,
    count,
  };
}

/**
 * 清理 base-panel 壳层泄漏（重复的 bg-layer / panel-header）
 */
export function stripBasePanelShellLeak(content) {
  if (
    !content ||
    typeof content !== 'string' ||
    !/<base-panel\b/i.test(content)
  ) {
    return { content, changed: false, removedCount: 0 };
  }

  let removedCount = 0;
  let nextContent = content;

  // 仅清理非常明确的重复壳层节点，避免误删预览中应保留的 header 内容。
  const bgLayerPattern =
    /\n?\s*<div[^>]*class=(['"])[^'"]*\bbg-layer\b[^'"]*\1[^>]*>[\s\S]*?<\/div>\s*/gi;
  nextContent = nextContent.replace(bgLayerPattern, () => {
    removedCount += 1;
    return '\n';
  });

  const hasHeaderSlots =
    /<template\s+#(title-left|title-right|header-right)/i.test(nextContent);
  if (hasHeaderSlots) {
    const panelHeaderPattern =
      /\n?\s*<div[^>]*class=(['"])[^'"]*\bpanel-header\b[^'"]*\1[^>]*>[\s\S]*?<\/div>\s*/gi;
    nextContent = nextContent.replace(panelHeaderPattern, () => {
      removedCount += 1;
      return '\n';
    });
  }

  return {
    content: nextContent,
    changed: removedCount > 0,
    removedCount,
  };
}

/**
 * 🛡️ 阶段4修复（2026-09-17）：absolute 遮罩层父容器补 position:relative。
 *
 * 背景：微码设备监测「一片蓝」实锤——`.card-bg` 是 `position:absolute; top/left/right/bottom:0`
 * 的遮罩层，但其父容器 `.device-card` 无 `position:relative` → 遮罩层绝对定位一路向上
 * 找到最近的 positioned 祖先（整个面板），12 张卡片遮罩叠加铺满全屏 → 截图 99.9% 蓝。
 *
 * 治本：解析模板建立「子元素 class → 父元素 class」，凡父容器内的子元素用了
 * `position:absolute` 而父容器无任何 position 声明 → 给父容器补 `position: relative;`。
 *
 * @param {Object<string,string>} files 产物文件表（原地修改）
 * @param {Object} [options] { logger }
 * @returns {Array<{file:string, parentClass:string}>} 修复清单
 */
export function healAbsoluteOverlayParents(files, options = {}) {
  const logger = safeLogger(options.logger);
  const fixed = [];
  if (!files || typeof files !== 'object') return fixed;

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !path.endsWith('.vue')) continue;
    const styleBlock =
      (content.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';
    const tplBlock =
      (content.match(/<template[^>]*>([\s\S]*?)<\/template>/i) || [])[1] || '';
    if (!styleBlock || !tplBlock) continue;

    // 1. 收集所有 position:absolute 的 class
    const absClasses = new Set();
    const ruleRe = /\.([a-zA-Z][\w-]*)\s*\{([^{}]*)\}/g;
    let rm;
    while ((rm = ruleRe.exec(styleBlock)) !== null) {
      if (/position\s*:\s*absolute/i.test(rm[2])) absClasses.add(rm[1]);
    }
    if (absClasses.size === 0) continue;

    // 2. 栈追踪模板，找 absolute class 元素的直接父元素 class
    const parentClsSet = new Set();
    const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
    const VOID = /^(img|br|hr|input|meta|link|source|path|circle|rect)$/i;
    const stack = [];
    let m;
    while ((m = tagRe.exec(tplBlock)) !== null) {
      const [, slash, tag, attrs, selfClose] = m;
      if (slash) {
        stack.pop();
        continue;
      }
      // 🛡️ 仅匹配静态 class=，排除 :class= 动态绑定（否则 `:class="['tab-item', {...}]"`
      //   数组内容会被误当静态 class → 生成非法 `.` 规则 → TabsSection 编译崩溃被 P1-4 隔离）
      const clsM = attrs.match(/(?:^|\s)class="([^"]*)"/);
      const cls = clsM ? clsM[1] : '';
      const clsList = cls.split(/\s+/).filter(Boolean);
      for (const c of clsList) {
        if (absClasses.has(c)) {
          const parent = stack[stack.length - 1];
          if (parent && parent.cls) {
            for (const pc of parent.cls.split(/\s+/).filter(Boolean)) {
              parentClsSet.add(pc);
            }
          }
        }
      }
      if (!selfClose && !VOID.test(tag)) stack.push({ tag, cls });
    }
    if (parentClsSet.size === 0) continue;

    // 3. 对每个父容器 class，缺 position 则补 position:relative
    let updated = content;
    for (const pc of parentClsSet) {
      const esc = pc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pcRule = new RegExp('\\.' + esc + '\\s*\\{([^{}]*)\\}', 'g');
      let hasPosition = false;
      let prm;
      while ((prm = pcRule.exec(styleBlock)) !== null) {
        if (/position\s*:/i.test(prm[1])) hasPosition = true;
      }
      if (hasPosition) continue;
      const blockRe = new RegExp('(\\.' + esc + '\\s*\\{)', 'g');
      if (blockRe.test(updated)) {
        blockRe.lastIndex = 0;
        updated = updated.replace(blockRe, '$1\n  position: relative;');
      } else {
        updated = updated.replace(
          /<\/style>/i,
          '.' + pc + ' { position: relative; }\n</style>',
        );
      }
      fixed.push({ file: path, parentClass: pc });
    }
    if (updated !== content) files[path] = updated;
  }
  if (fixed.length > 0) {
    logger.warn('🛡️ 已补 absolute 遮罩层父容器 position:relative', {
      fixedCount: fixed.length,
    });
  }
  return fixed;
}

/**
 * 从 `:style` 对象内层文本中提取全部背景相关键值对的**原文片段**（不 eval、不重组值）。
 * @param {string} styleInner 形如 `{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%' }` 的内层
 * @returns {Array<{raw:string, key:string}>} raw=键值对原文；key=归一键名（小写无连字符，如 backgroundimage）
 */
function extractBgStyleEntries(styleInner) {
  const s = String(styleInner || '').trim().replace(/^\{/, '').replace(/\}$/, '');
  const entries = [];
  let depth = 0;
  let inStr = null;
  let start = 0;
  const push = (raw) => {
    const km = /^([A-Za-z-]+)\s*:/.exec(raw);
    if (km && /^background(image|size|position|repeat)?$/i.test(km[1].replace(/-/g, ''))) {
      entries.push({ raw, key: km[1].replace(/-/g, '').toLowerCase() });
    }
  };
  for (let i = 0; i <= s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (i === s.length) {
      const raw = s.slice(start, i).trim();
      if (raw) push(raw);
      break;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (ch === ']' || ch === '}') { continue; }
    if (ch === ',' && depth === 0) {
      const raw = s.slice(start, i).trim();
      start = i + 1;
      if (raw) push(raw);
    }
  }
  return entries;
}

const BG_KEY_DETECT_RES = [
  ['backgroundimage', /background-?[Ii]mage\s*:/],
  ['backgroundsize', /background-?[Ss]ize\s*:/],
  ['backgroundposition', /background-?[Pp]osition\s*:/],
  ['backgroundrepeat', /background-?[Rr]epeat\s*:/],
];

/** 判开标签文本上是否已声明某背景键（camel/kebab 都认） */
function tagHasBgKey(tagText, key) {
  const hit = BG_KEY_DETECT_RES.find(([k]) => k === key);
  return hit ? hit[1].test(tagText) : false;
}

/** 判开标签文本上是否声明了任意背景键 */
function tagHasAnyBgKey(tagText) {
  return BG_KEY_DETECT_RES.some(([, re]) => re.test(tagText));
}

/**
 * 兜底 backdrop 判定（形态学，命名无关）：backgroundSize 缺失或值含 % ⇒ 该层是
 * 「只挂图、几何靠百分比兜底」的撕裂层（a6d2e5e1 bg-m：size 100% 100%）；
 * size 为精确像素 ⇒ 自洽背景容器（a6d2e5e1 标题条 t：size 130px 9px）⇒ 不动。
 */
function isBackdropBgLayer(entries) {
  const size = entries.find((e) => e.key === 'backgroundsize');
  return !size || /%/.test(size.raw);
}

/**
 * 🛡️ 判 :style 顶层是否存在**非背景声明**（2026-09-30 · d368e7d8 半透明背景实锤）。
 * 与 extractBgStyleEntries 同一扫描口径；任一条目的 key 不属于背景四键即视为有
 * （典型：opacity——删层会静默丢视觉语义）。
 */
function hasNonBgStyleDeclarations(styleInner, bgEntries) {
  const s = String(styleInner || '').trim().replace(/^\{/, '').replace(/\}$/, '');
  if (!s) return false;
  const bgKeys = new Set((bgEntries || []).map((e) => e.key));
  let hit = false;
  let depth = 0;
  let inStr = null;
  let start = 0;
  const check = (raw) => {
    const km = /^([A-Za-z-]+)\s*:/.exec(String(raw || '').trim());
    if (!km) return;
    const key = km[1].replace(/-/g, '').toLowerCase();
    if (!bgKeys.has(key)) hit = true;
  };
  for (let i = 0; i <= s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (i === s.length) { check(s.slice(start, i)); break; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (ch === ']' || ch === '}') { continue; }
    if (ch === ',' && depth === 0) { check(s.slice(start, i)); start = i + 1; }
  }
  return hit;
}

/**
 * 从开标签的 `:style` 中剥除背景键条目，保留其余条目（非背景键原文不动）。
 * @returns {string} 新开标签；全剥空时连 ` :style="{...}"` 属性一起移除
 */
function stripBgEntriesFromTag(tagText, styleInner, bgEntries) {
  const pos = tagText.indexOf(styleInner);
  if (pos < 0) return tagText;
  const bgKeys = new Set(bgEntries.map((e) => e.key));
  // 顶层切分（与 extractBgStyleEntries 同一扫描口径），保留非背景条目
  const s = styleInner.trim().replace(/^\{/, '').replace(/\}$/, '');
  const kept = [];
  let depth = 0;
  let inStr = null;
  let start = 0;
  const tryPush = (raw) => {
    if (!raw) return;
    const km = /^([A-Za-z-]+)\s*:/.exec(raw);
    if (km && bgKeys.has(km[1].replace(/-/g, '').toLowerCase())) return;
    kept.push(raw);
  };
  for (let i = 0; i <= s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (i === s.length) { tryPush(s.slice(start, i).trim()); break; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (ch === ']' || ch === '}') { continue; }
    if (ch === ',' && depth === 0) { tryPush(s.slice(start, i).trim()); start = i + 1; }
  }
  if (kept.length === 0) {
    // 全剥空：连 ` :style="{...}"` 属性一起移除（styleInner 捕获自 ":style=..."，
    // 其后紧跟属性闭合引号，一并吃掉）
    const attrStart = tagText.lastIndexOf(':style', pos);
    if (attrStart < 0) return tagText;
    let cutStart = attrStart;
    while (cutStart > 0 && /\s/.test(tagText[cutStart - 1])) cutStart--;
    let cutEnd = pos + styleInner.length;
    if (tagText[cutEnd] === '"') cutEnd += 1;
    return tagText.slice(0, cutStart) + tagText.slice(cutEnd);
  }
  return tagText.slice(0, pos) + kept.join(', ') + tagText.slice(pos + styleInner.length);
}

/**
 * 把背景键值对注入一个开标签的 `:style`（调用方保证 ownership === 'none'）。
 * @returns {string|null} 新开标签；无法安全注入时 null
 */
function injectBgEntriesIntoTag(tag, entriesText) {
  const styleRe = /:style="([^"]*)"/;
  if (styleRe.test(tag)) {
    const inner = (tag.match(styleRe)[1] || '').trim();
    if (!/^\{[\s\S]*\}$/.test(inner)) return null;
    return tag.replace(styleRe, `:style="{ ...${inner}, ${entriesText} }"`);
  }
  return tag.replace(/\/?>$/, (tail) => ` :style="{ ${entriesText} }"${tail}`);
}

/**
 * 🛡️ 背景形态契约落地（2026-09-30 · mc-max-1790698932396-a6d2e5e1 实锤，用户确认方案）：
 *
 * 契约（方案 A 主路径 / 方案 B 兜底）：
 *   - 方案 A：bg 资源 = 宿主容器的 CSS 背景，**不生成独立 DOM**。空壳 bg div
 *     （无子标签、无有效文本）⇒ 把其 `:style` 里的背景键值**原文迁移**到直接父元素，
 *     然后删除该 div。
 *   - 方案 B：背景层上有可叠加内容（装饰子元素/文本）⇒ 保留独立 div，但强制
 *     `position:absolute; inset:0`（宿主 relative 由既有 healAbsoluteOverlayParents
 *     在本函数之后补——挂接顺序必须「先拆层/补 absolute，后补宿主 relative」）。
 *
 * 实锤形态（a6d2e5e1 车型分布）：同一张卡背景被拆两个元素——容器 :style 挂精确
 * 四件套（figmaBox 真值），内层 bg-m div 却单独挂 backgroundImage 且 100% 100%，
 * 且 bg-m 无 absolute 占 103px 文档流 ⇒ 标题被挤下移、内容区塌高。
 * prompt 铁律（bg 禁止独立 DOM）拦不住 LLM 违规 ⇒ 确定性后处理兜底。
 *
 * 迁移归属判定（复用 bgBindingOwnership，fail-closed）+ 键级合并（a6d2e5e1 真实产物驱动）：
 *   - 父 none   → 迁移背景键值（**父已有键=真值优先不覆盖**，如容器已挂 figmaBox
 *     精确 size/position 时只迁 backgroundImage）+ 空壳删 div / 非空壳剥背景键保留内容
 *   - 父 self   → 不迁移（父已含同资源完整绑定）+ 空壳删 div / 非空壳剥背景键
 *   - 父 other / literal → 宿主被外来背景占用 → 不迁移不剥（fail-closed），退化方案 B
 *
 * 方案 B 判据（保守，防误伤）：**仅「父元素也已绑定背景」的子 bg 层**（撕裂家族）
 * 才补 absolute——父无背景的独立 bg 内容块可能是正常文档流布局，盲目 absolute 化
 * 会破坏渲染（fail-open 原则优先于契约完备性；待新实锤再扩展）。
 *
 * 幂等：迁移后子层 :style 无背景键 → 再次扫描 hasBg=false 跳过；补过 absolute 的
 * class 再次扫描命中 hasPosition 跳过。
 *
 * @param {Object<string,string>} files 产物文件表（原地修改）
 * @param {Object} [options] { logger }
 * @returns {{collapsed: Array<{file:string, varName:string, mode:'merge'|'drop'}>, absoluteFixed: Array<{file:string, cls:string}>}}
 */
export function healStandaloneBgLayers(files, options = {}) {
  const logger = safeLogger(options.logger);
  const report = { collapsed: [], absoluteFixed: [] };
  if (!files || typeof files !== 'object') return report;

  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
  const VOID = /^(img|br|hr|input|meta|link|source|path|circle|rect|ellipse|line|polyline|polygon|use|stop)$/i;

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !path.endsWith('.vue')) continue;
    const tplM = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
    const styleM = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (!tplM) continue;
    const tpl = tplM[1];
    const styleBlock = styleM ? styleM[1] : '';

    const edits = []; // { start, end, text }（tpl 内偏移）
    const stylePatches = []; // { cls, ensureAbsolute: true }
    // 同一父被多个撕裂子层命中 → 记账，扫描结束后每父合并为一次注入 edit
    // （多 edit 同区间倒序应用会互相撕裂——CardGrid13 实锤）
    const parentInjections = new Map(); // parentOpenStart -> { parent, parentTag, texts, keys, elEdits }
    const stack = [];
    let m;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(tpl)) !== null) {
      const [full, slash, tag, attrs, selfClose] = m;
      if (slash) {
        const el = stack.pop();
        if (!el || !el.hasBg) continue;
        const closeStart = m.index;
        const inner = tpl
          .slice(el.openEnd, closeStart)
          .replace(/<!--[\s\S]*?-->/g, '');
        const hasChild = /<[A-Za-z]/.test(inner) || inner.trim() !== '';
        const parent = stack[stack.length - 1] || null;
        if (!parent) continue;
        const parentTag = tpl.slice(parent.openStart, parent.openEnd);
        const elOpenTag = tpl.slice(el.openStart, el.openEnd);
        const entries = extractBgStyleEntries(el.styleInner);
        if (entries.length === 0) continue;
        if (hasChild) {
          // 非空壳保守边界：
          //   ① 父完全无背景键 → 疑似合法 overlay 设计 → 不动（fail-open）
          //   ② 子层 size 精确像素 → 自洽背景容器（标题条 t 形态）→ 不动
          //   ③ 子层 size % 兜底 + 父有背景键 → 撕裂家族（bg-m 形态）→ 迁移
          const parentHasKey = tagHasAnyBgKey(parentTag);
          if (!parentHasKey) continue;
          if (!isBackdropBgLayer(entries)) continue;
        }
        const own = bgBindingOwnership(parentTag, el.bgVar || '__probe__');
        if (own === 'other' || own === 'literal') {
          // fail-closed：宿主被外来背景占用 → 不迁移不剥。
          // 补 absolute 仅限「父 size 为精确像素」的撕裂实锤（a6d2e5e1：父 191px 80px 真值
          // + 子 100% 兜底）。🛡️ f8116aa6 误伤收紧：父 size 也是 %（父子双兜底）无法认定
          // 几何真值在父——那是合法层叠标签设计（slot-tag-text 叠 slot-tag），补了
          // absolute+inset:0 会把标签文字层撑满整行压住面板标题 → 不动（fail-open）。
          // ⚠️ 值允许带引号（Vue :style 对象写法 backgroundSize: '191px 80px'）；
          // 扫描止于 ; , } —— 防止 '100% 100%' 后扫到对象里下一个属性（width: '191px'）误判
          const parentPx = /background-?[Ss]ize\s*:[^;,}]*\d+(?:\.\d+)?px/.test(parentTag);
          if (parentPx && el.cls && !/^\s*$/.test(el.cls)) {
            const firstCls = el.cls.split(/\s+/)[0];
            const esc = firstCls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const ruleM = styleBlock.match(new RegExp('\\.' + esc + '\\s*\\{([^{}]*)\\}'));
            const hasAbs = ruleM && /position\s*:\s*absolute/i.test(ruleM[1]);
            if (!hasAbs) stylePatches.push({ cls: firstCls, ensureAbsolute: true });
          }
          continue;
        }
        // own === 'none' | 'self'：键级合并迁移（父已有键=真值优先，不覆盖）
        let acc = parentInjections.get(parent.openStart);
        if (!acc) {
          acc = { parent, parentTag, texts: [], keys: new Set(), elEdits: [] };
          parentInjections.set(parent.openStart, acc);
        }
        const migratable = own === 'self'
          ? []
          : entries.filter((e) => {
              if (tagHasBgKey(parentTag, e.key)) return false; // 父已有=真值优先
              if (acc.keys.has(e.key)) return false; // 本轮已计划迁入，不重复
              return true;
            });
        const entriesText = migratable.map((e) => e.raw).join(', ');
        for (const e of migratable) acc.keys.add(e.key);
        // 子层剥背景键：非空壳保留 div 与内容；空壳整个 div 删除
        const newElTag = stripBgEntriesFromTag(elOpenTag, el.styleInner, entries);
        if (entriesText) acc.texts.push(entriesText);
        if (hasChild) {
          if (newElTag !== elOpenTag) {
            acc.elEdits.push({ start: el.openStart, end: el.openEnd, text: newElTag });
            report.collapsed.push({ file: path, varName: el.bgVar, mode: 'merge' });
          }
        } else if (hasNonBgStyleDeclarations(el.styleInner, entries)) {
          // 🛡️ 守门（2026-09-30 · mc-max-1790723575234-d368e7d8 实锤）：空壳 bg 层的
          // :style 含**非背景声明**（opacity/filter/mix-blend-mode 等视觉语义）时
          // 禁止删 div——这些声明无法内联进容器（半透明背景内联 = 透明度语义丢失或
          // 被错误提升到容器殃及兄弟内容）→ 保留原状（fail-open，宁缺勿错）。
          logger.warn?.('bg 空壳层含非背景声明，跳过合并（透明度等语义无法内联）', {
            file: path, cls: el.cls, varName: el.bgVar,
          });
        } else {
          acc.elEdits.push({ start: el.openStart, end: m.index + full.length, text: '' });
          report.collapsed.push({ file: path, varName: el.bgVar, mode: 'drop' });
        }
        continue;
      }
      const openStart = m.index;
      const openEnd = openStart + full.length;
      const clsM = attrs.match(/(?:^|\s)class="([^"]*)"/);
      const cls = clsM ? clsM[1] : '';
      const styleAttrM = attrs.match(/:style="([^"]*)"/);
      let bgVar = null;
      let styleInner = null;
      let hasBg = false;
      if (styleAttrM) {
        styleInner = (styleAttrM[1] || '').trim();
        if (/^\{[\s\S]*\}$/.test(styleInner)) {
          const frag = extractBgImageFragment(styleInner);
          if (frag !== null) {
            hasBg = true;
            const ref = extractBgImageRef(frag);
            if (ref.kind === 'var') bgVar = ref.name;
          }
        }
      }
      if (!selfClose && !VOID.test(tag)) {
        stack.push({ tag, cls, openStart, openEnd, bgVar, styleInner, hasBg });
      }
    }

    // 统一应用父注入：合并 texts 一次注入；注入失败则该父的子层改动一并放弃
    // （宁少改不半改）
    for (const acc of parentInjections.values()) {
      if (acc.texts.length === 0) {
        edits.push(...acc.elEdits); // 只剥不迁（self 场景）
        continue;
      }
      const newParentTag = injectBgEntriesIntoTag(acc.parentTag, acc.texts.join(', '));
      if (!newParentTag) continue;
      edits.push({ start: acc.parent.openStart, end: acc.parent.openEnd, text: newParentTag });
      edits.push(...acc.elEdits);
    }

    if (edits.length === 0 && stylePatches.length === 0) continue;

    // 应用模板 edits（倒序，防偏移）
    let newTpl = tpl;
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) {
      newTpl = newTpl.slice(0, e.start) + e.text + newTpl.slice(e.end);
    }

    // 应用 style 补丁：按完整 style 标签文本定位替换（模板 edits 改变了长度，
    // 禁止用扫描期的绝对偏移切片——否则样式替换落点漂移）
    let newContent = content.replace(tpl, () => newTpl);
    if (stylePatches.length > 0 && styleM) {
      let newStyleBlock = styleBlock;
      const applied = [];
      for (const p of stylePatches) {
        const esc = p.cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const ruleRe = new RegExp('(\\.' + esc + '\\s*\\{)', 'g');
        if (ruleRe.test(newStyleBlock)) {
          ruleRe.lastIndex = 0;
          // 已有规则：仅当无任何 position 声明才补（幂等）
          const bodyM = newStyleBlock.match(new RegExp('\\.' + esc + '\\s*\\{([^{}]*)\\}'));
          if (bodyM && !/position\s*:/i.test(bodyM[1])) {
            newStyleBlock = newStyleBlock.replace(ruleRe, '$1\n  position: absolute;\n  inset: 0;');
            applied.push(p.cls);
          }
        } else {
          newStyleBlock += `\n.${p.cls} {\n  position: absolute;\n  inset: 0;\n}\n`;
          applied.push(p.cls);
        }
      }
      if (applied.length > 0) {
        const oldStyleTag = styleM[0];
        const newStyleTag = oldStyleTag.replace(styleBlock, () => newStyleBlock);
        newContent = newContent.replace(oldStyleTag, () => newStyleTag);
        for (const cls of applied) {
          report.absoluteFixed.push({ file: path, cls });
        }
      }
    }

    if (newContent !== content) files[path] = newContent;
  }

  if (report.collapsed.length > 0) {
    logger.warn('🛡️ 空壳 bg 独立层已按契约折叠（方案 A：背景回归宿主容器 CSS）', {
      count: report.collapsed.length,
      detail: report.collapsed.slice(0, 20),
    });
  }
  if (report.absoluteFixed.length > 0) {
    logger.warn('🛡️ 有内容 bg 层缺 absolute，已补 position:absolute + inset:0（方案 B）', {
      count: report.absoluteFixed.length,
      detail: report.absoluteFixed.slice(0, 20),
    });
  }
  return report;
}

/**
 * 🛡️ 透明度归属修正（2026-09-30 · mc-max-1790723575234-d368e7d8 实锤，用户质询
 * 「cons 的透明度是不是挂错了」——确系挂错，治本于管线而非产物）：
 *
 * 【根源链】Figma 真值：卡片 GROUP 容器 opacity=1，其 bg 子层 GROUP opacity=0.5
 * （半透明底图）。产物链路两处偏离：
 *   ① prompt 铁律「bg=容器 CSS 背景、禁止独立 DOM」**没有 bg 层自带透明度的例外**
 *      —— 半透明背景内联进容器在 CSS 上结构性无法表达（背景图无法单独设 opacity）；
 *   ② LLM/refine 轮为补透明度把 `opacity:0.5` 挂到**容器** class ⇒ 图标/文字一并
 *      变透明（用户可见缺陷）。
 *
 * 【修正】真值驱动（不认 class 名，杜绝硬编码）：当容器 E 同时满足
 *   a) E 带内联背景四件套（bg 绑定）；
 *   b) E 的 class 在 CSS（scoped/common.less）声明 opacity: v（0<v<1）；
 *   c) 真值实锤「搬运」而非设计：nodeData 中存在某节点其 opacity ≈ v（±0.02）
 *      且该节点为 GROUP（bg 语义层），而 E 的对应资源映射 ownerSection 真值容器
 *      opacity 缺失或 ≥1 —— 即「子层透明度被提升到容器」；
 * 则重构为保真形态：
 *   - 容器 CSS 删 opacity、补 position:relative（若无）；
 *   - 容器 :style 的背景四件套移到**新插入的首子背景层**（class = <首class>-bg），
 *     层 CSS：position:absolute; inset:0; opacity:<真值>; pointer-events:none；
 *   - 容器既有**静态**子元素补 inline `style="position: relative"`（保内容画在
 *     半透明层之上——与 LLM 正确形态一致）。
 *
 * 幂等：容器无 opacity 或已存在 <首class>-bg 层 → 跳过。
 *
 * @param {Object<string,string>} files 产物文件表（原地修改）
 * @param {Object|null} nodeData Figma 全量节点真值
 * @param {Object} [options] { logger }
 * @returns {{fixed: Array<{file:string, containerCls:string, opacity:number}>}}
 */
export function fixMisplacedContainerOpacity(files, nodeData, options = {}) {
  const logger = safeLogger(options.logger);
  const report = { fixed: [] };
  if (!files || typeof files !== 'object') return report;

  // 真值侧：收集所有 opacity<1 的节点值集合（命名无关；GROUP/其它类型均可）
  const lowOpacityVals = [];
  const collect = (n) => {
    if (!n || typeof n !== 'object') return;
    const op = n.opacity;
    if (typeof op === 'number' && op > 0 && op < 0.999) lowOpacityVals.push(op);
    for (const v of Object.values(n)) {
      if (v && typeof v === 'object') collect(v);
      else if (Array.isArray(v)) v.forEach(collect);
    }
  };
  if (nodeData && typeof nodeData === 'object') collect(nodeData);
  if (lowOpacityVals.length === 0) return report; // 真值无低透明度节点 → 无从「搬运」，fail-open

  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
  const VOID = /^(img|br|hr|input|meta|link|source|path|circle|rect|ellipse|line|polyline|polygon|use|stop)$/i;
  const OPACITY_CSS_RE = /opacity\s*:\s*(0?\.\d+|0|1(?:\.0+)?|\d+%)/i;

  const parseOpacity = (raw) => {
    const m = /opacity\s*:\s*(0?\.\d+|0|1(?:\.0+)?|\d+%)/i.exec(raw || '');
    if (!m) return null;
    const v = /%$/.test(m[1]) ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return Number.isFinite(v) ? v : null;
  };
  const near = (a, b) => Math.abs(a - b) <= 0.02;
  /**
   * 在单个文件内容中删除 class 的 opacity 声明（容器无 position 则补 relative），返回新内容。
   * 🛡️ 补 relative 不再限定「容器规则在 .vue」——d368e7d8 实锤容器规则常只在
   *    common.less（scoped 里没有），而独立背景层是 absolute，宿主必须
   *    relative 才能成为其定位参照（否则层相对更外层祖先定位 → 铺满整槽位）。
   */
  const stripContainerOpacityCss = (content, esc) => {
    let out = content;
    let removed = false;
    const bodyRe = new RegExp('\\.' + esc + '\\s*\\{([^{}]*)\\}', 'g');
    let bm;
    while ((bm = bodyRe.exec(out)) !== null) {
      const v = parseOpacity(bm[1]);
      if (v === null || v >= 0.999) continue;
      let block = bm[0].replace(/[ \t]*opacity\s*:[^;\n}]*;?[ \t]*\n?/i, '');
      if (!/position\s*:/i.test(block.replace(/^[^{]*\{/, ''))) {
        block = block.replace(/(\{)/, '$1\n  position: relative;');
      }
      out = out.slice(0, bm.index) + block + out.slice(bm.index + bm[0].length);
      bodyRe.lastIndex = bm.index + block.length;
      removed = true;
    }
    return { content: out, removed };
  };

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !path.endsWith('.vue')) continue;
    const tplM = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
    if (!tplM) continue;
    const tpl = tplM[1];

    const escCls = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /**
     * 在模板文本里找某 class 的元素开标签（bg 层 / 容器）。
     * 🛡️ d368e7d8 实锤（2026-09-30）：预览的样式注入链不可靠 —— 微码预览实际是
     *    vue3-sfc-loader 运行时编译 .vue，样式来自 `<style lang=less>`（含
     *    `@import index.less`）与后端 index.css；**把层规则写进 .vue scoped 或
     *    common.less 都可能落空**（r-992fa002 实锤：元素在、任何 CSS 都没命中 →
     *    预览 bgLayerPos:static / bgLayerOpacity:1）。因此定位/透明度**直接 inline**
     *    写进层元素的 `:style` —— 与管线既有的「bg 内联绑定」一致，不依赖任何注入链。
     */
    const findTagByClsIn = (text, cls) => {
      const re = new RegExp(
        '<(?:[a-zA-Z][\\w-]*)[^>]*\\bclass="(?:[^"]*[\\s])?' + escCls(cls) + '(?=[\\s"])[^>]*>',
      );
      const mm = re.exec(text);
      return mm ? mm[0] : null;
    };
    /** 开标签的 :style 对象里是否已带 position（inline 保真判据） */
    const tagHasInlinePos = (tag) => !!tag && /:style="\{[^"]*position\s*:/.test(tag);
    /** 往 :style 对象尾部追加 inline 声明（幂等：已有 position 则原样返回） */
    const appendInlineToStyle = (tag, decl) =>
      tag.replace(/(:style="\{)([^"]*?)(\}")/, (mm, a, b, c2) =>
        /(?:^|,)\s*position\s*:/.test(b) ? mm : a + b + decl + c2,
      );
    /** 容器补 inline `style="position: relative;"`（absolute 层的定位参照） */
    const ensureContainerInlinePos = (tag) => {
      if (!tag) return tag;
      if (/\bstyle="/.test(tag)) return tag; // 已有静态 style，交给它
      if (tagHasInlinePos(tag)) return tag; // :style 已含 position
      return tag.replace(/(class="[^"]*")/, '$1 style="position: relative;"');
    };

    // 扫描候选容器：带内联背景绑定且非自闭合的元素
    tagRe.lastIndex = 0;
    const candidates = []; // { openStart, openEnd, full, attrs, cls, styleInner }
    let m;
    while ((m = tagRe.exec(tpl)) !== null) {
      const [full, slash, tag, attrs, selfClose] = m;
      if (slash || selfClose || VOID.test(tag)) continue;
      if (!/:style="/.test(attrs)) continue;
      const inner = (attrs.match(/:style="([^"]*)"/) || [])[1] || '';
      const hasBg = /backgroundImage/i.test(inner);
      if (!hasBg) continue;
      const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
      if (!cls) continue;
      candidates.push({ openStart: m.index, openEnd: m.index + full.length, full, attrs, cls, styleInner: inner, tag });
    }

    for (const cand of candidates) {
      const firstCls = cand.cls.split(/\s+/)[0];
      // 🛡️ 背景层自身不当候选容器（本管线层命名约定 firstCls+'-bg'）——否则会对
      // 已保真的 -bg 层二次套娃 -bg-bg（d368e7d8 重放实锤）
      if (/-bg$/.test(firstCls)) continue;
      const bgLayerCls = `${firstCls}-bg`;
      const layerTag = findTagByClsIn(tpl, bgLayerCls);
      // 幂等：模板已有层元素 **且** 其 :style 已带 inline position → 已保真。
      // （inline 是本管线唯一可靠的生效通道，无需再看任何 CSS 规则是否存在）
      if (layerTag && tagHasInlinePos(layerTag)) continue;

      // 真值实锤：容器 CSS opacity 值必须与真值某低透明度节点吻合
      // 🛡️ 检测范围 = 全部文件（scoped 在 .vue、同名块可能在 common.less）
      const esc = escCls(firstCls);
      let cssOpacity = null;
      for (const scope of Object.values(files)) {
        const m2 = new RegExp('\\.' + esc + '\\s*\\{([^{}]*)\\}').exec(scope);
        if (m2) {
          const v = parseOpacity(m2[1]);
          if (v !== null && v < 0.999 && lowOpacityVals.some((t) => near(t, v))) {
            cssOpacity = v;
            break;
          }
        }
      }
      const halfFixed = !!layerTag; // 层元素已在、inline 缺 → 半修正态
      if (cssOpacity === null && halfFixed) {
        // 半修正态：容器 opacity 已被上一轮清除 → 退化用「真值低透明度唯一值」
        // （去重后必须唯一，否则 fail-open，避免臆造透明度）
        const uniq = Array.from(new Set(lowOpacityVals.map((v) => Math.round(v * 1000) / 1000)));
        if (uniq.length === 1) cssOpacity = uniq[0];
      }
      if (cssOpacity === null) continue; // 容器无低透明度声明或值与真值不符 → fail-open

      // 1) 清容器 CSS opacity 声明（scoped + common.less 同名块都要清；
      //    容器自身规则无 position 则补 relative —— 兜底旧渲染链）
      for (const fp of Object.keys(files)) {
        if (typeof files[fp] !== 'string' || !/\.(vue|less|css)$/.test(fp)) continue;
        const r = stripContainerOpacityCss(files[fp], esc);
        if (r.removed) files[fp] = r.content;
      }
      let cur = files[path];
      const LAYER_INLINE = `, position: 'absolute', inset: 0, opacity: ${cssOpacity}, pointerEvents: 'none'`;
      // 2) 半修正态自愈：层元素已在 → 仅补 inline，**不重复插元素**
      if (halfFixed) {
        const newLayer = appendInlineToStyle(layerTag, LAYER_INLINE);
        const cTag = findTagByClsIn(cur, firstCls);
        const newCTag = ensureContainerInlinePos(cTag);
        let next = cur;
        if (newLayer !== layerTag) next = next.replace(layerTag, () => newLayer);
        if (newCTag && newCTag !== cTag) next = next.replace(cTag, () => newCTag);
        files[path] = next;
        report.fixed.push({ file: path, containerCls: firstCls, opacity: cssOpacity, inlineOnly: true });
        logger.warn('🛡️ 透明度归属修正：背景层补 inline 定位/透明度（不依赖 CSS 注入链）', {
          file: path, containerCls: firstCls, opacity: cssOpacity, layerCls: bgLayerCls,
        });
        continue;
      }
      // 3) 模板：容器 :style 的背景四件套移到新首子层；容器 :style 全为背景键时整体移除
      const bgEntries = extractBgStyleEntries(cand.styleInner);
      if (bgEntries.length === 0) continue; // 无可迁移背景键 → 不动
      const entriesText = bgEntries.map((e) => e.raw).join(', ');
      const bgEntriesSet = new Set(bgEntries.map((e) => e.key));
      const keptRaw = (() => {
        const s = cand.styleInner.trim().replace(/^\{/, '').replace(/\}$/, '');
        const kept = [];
        let depth = 0;
        let inStr = null;
        let start = 0;
        const tryPush = (raw) => {
          const t = String(raw || '').trim();
          if (!t) return;
          // 🛡️ 必须 trim 后再匹配（首条目带前导空格时 ^[A-Za-z-]+ 不命中 → 误判保留）
          const km = /^([A-Za-z-]+)\s*:/.exec(t);
          if (km && bgEntriesSet.has(km[1].replace(/-/g, '').toLowerCase())) return;
          kept.push(t);
        };
        for (let i = 0; i <= s.length; i++) {
          const ch = s[i];
          if (inStr) {
            if (ch === inStr && s[i - 1] !== '\\') inStr = null;
            continue;
          }
          if (i === s.length) { tryPush(s.slice(start, i)); break; }
          if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
          if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
          if (ch === ')') { depth--; continue; }
          if (ch === ']' || ch === '}') { continue; }
          if (ch === ',' && depth === 0) { tryPush(s.slice(start, i)); start = i + 1; }
        }
        return kept.join(', ');
      })();
      const newAttrs = keptRaw
        // 保留非背景条目（罕见）：把 position 追加进容器 :style 对象
        ? cand.attrs.replace(
            /:style="\{([^"]*)\}"/,
            () => `:style="{ ${keptRaw}, position: 'relative' }"`,
          )
        : cand.attrs.replace(/\s*:style="[^"]*"/, '');
      // 容器补 inline relative（absolute 层的定位参照）；已有静态 style / :style position 则不动
      const containerAttrs =
        /(^|\s)style="/.test(newAttrs) || tagHasInlinePos(newAttrs)
          ? newAttrs
          : newAttrs.replace(/(class="[^"]*")/, '$1 style="position: relative;"');
      // 层元素：背景四件套（迁自容器）+ inline 定位/透明度（不依赖任何 CSS 注入链）
      const newOpenTag =
        `<${cand.tag}${containerAttrs}>` +
        `\n      <div class="${bgLayerCls}" :style="{ ${entriesText}${LAYER_INLINE} }"></div>`;
      let newTpl = cur.match(/<template[^>]*>([\s\S]*?)<\/template>/i)[1];
      newTpl = newTpl.replace(cand.full, () => newOpenTag);

      // 4) 既有静态子元素补 relative（inline style 属性；已有 style/:style 的跳过——
      //    Vue 允许共存，但保守起见只补「完全无 style」的子元素，其余交给 LLM/refine 自愈）
      //    实现：在容器开标签之后、各直接子开标签前插入的层已居首；对容器内既有
      //    `class="..."` 且无 style 属性的子开标签补 style="position: relative"
      //    —— 仅限容器开标签到其配对闭标签之间的顶层子元素（简化：容器区间内所有
      //    无 style 的元素开标签，img 等 VOID 除外）。
      cur = cur.replace(tpl, () => newTpl);
      // 容器区间内的子元素 relative 补丁（基于新模板文本做区间定位）
      const tpl2 = cur.match(/<template[^>]*>([\s\S]*?)<\/template>/i)[1];
      const openIdx = tpl2.indexOf(newOpenTag);
      if (openIdx >= 0) {
        // 找容器配对闭标签（同 tag 计数）
        let depth2 = 1;
        const tagTokenRe = new RegExp(`<(\\/?)${cand.tag}(?=[\\s/>])((?:"[^"]*"|'[^']*'|[^>])*)>`, 'g');
        tagTokenRe.lastIndex = openIdx + newOpenTag.length;
        let closeIdx = -1;
        let t;
        while ((t = tagTokenRe.exec(tpl2)) !== null) {
          depth2 += t[1] ? -1 : 1;
          if (depth2 === 0) { closeIdx = t.index; break; }
        }
        if (closeIdx > openIdx) {
          const seg = tpl2.slice(openIdx + newOpenTag.length, closeIdx);
          const segPatched = seg.replace(
            /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g,
            (full2, tag2, attrs2, selfClose2) => {
              if (VOID.test(tag2) || selfClose2) return full2;
              if (/\bstyle=/.test(attrs2) || /:style=/.test(attrs2)) return full2;
              if (/class="/.test(attrs2)) {
                return `<${tag2} style="position: relative;"${attrs2}${selfClose2}>`;
              }
              return full2;
            },
          );
          if (segPatched !== seg) {
            cur = cur.replace(seg, () => segPatched);
          }
        }
      }

      files[path] = cur;
      report.fixed.push({ file: path, containerCls: firstCls, opacity: cssOpacity });
      logger.warn('🛡️ 透明度归属修正：容器 opacity 还原为独立半透明背景层（inline 定位/透明度）', {
        file: path, containerCls: firstCls, opacity: cssOpacity, layerCls: bgLayerCls,
      });
    }

    // 🔁 半修正态自愈（第二路）：以模板中的 <base>-bg 独立层为锚反推容器。
    //    该形态下容器 :style 背景绑定已被上一轮迁到层上（容器无 :style）→ 不进
    //    candidates 扫描；层元素在但 inline 缺（r-992fa002 实锤：元素在、任何 CSS
    //    规则都没命中 → 预览 bgLayerPos:static / bgLayerOpacity:1）→ 补 inline。
    {
      const seen = new Set();
      const snapshot = files[path];
      for (const cm of snapshot.matchAll(/class="([^"]*)"/g)) {
        for (const c of cm[1].split(/\s+/)) {
          if (!/-bg$/.test(c)) continue;
          const base = c.slice(0, -3);
          if (!base || /-bg$/.test(base) || seen.has(base)) continue;
          seen.add(base);
          const cur0 = files[path];
          const layerTag = findTagByClsIn(cur0, c);
          if (!layerTag || tagHasInlinePos(layerTag)) continue; // 已保真（幂等）
          if (!findTagByClsIn(cur0, base)) continue; // 容器不存在 → 不处理

          // 透明度：容器 CSS 残余（与真值吻合）优先；否则用真值低透明度唯一值
          let op = null;
          for (const scope of Object.values(files)) {
            const m2 = new RegExp('\\.' + escCls(base) + '\\s*\\{([^{}]*)\\}').exec(scope);
            if (m2) {
              const v = parseOpacity(m2[1]);
              if (v !== null && v < 0.999 && lowOpacityVals.some((t) => near(t, v))) {
                op = v;
                break;
              }
            }
          }
          if (op === null) {
            const uniq = Array.from(new Set(lowOpacityVals.map((v) => Math.round(v * 1000) / 1000)));
            if (uniq.length !== 1) continue; // 真值不唯一 → fail-open，避免臆造透明度
            op = uniq[0];
          }
          // 清容器残留 opacity（跨文件；无 position 补 relative 兜底旧渲染链）
          for (const fp of Object.keys(files)) {
            if (typeof files[fp] !== 'string' || !/\.(vue|less|css)$/.test(fp)) continue;
            const r = stripContainerOpacityCss(files[fp], escCls(base));
            if (r.removed) files[fp] = r.content;
          }
          const cur1 = files[path];
          const inline = `, position: 'absolute', inset: 0, opacity: ${op}, pointerEvents: 'none'`;
          const newLayer = appendInlineToStyle(layerTag, inline);
          const cTag = findTagByClsIn(cur1, base);
          const newCTag = ensureContainerInlinePos(cTag);
          let next = cur1;
          if (newLayer !== layerTag) next = next.replace(layerTag, () => newLayer);
          if (newCTag && newCTag !== cTag) next = next.replace(cTag, () => newCTag);
          if (next === cur1) continue;
          files[path] = next;
          report.fixed.push({ file: path, containerCls: base, opacity: op, inlineOnly: true });
          logger.warn('🛡️ 透明度归属修正：背景层补 inline 定位/透明度（半修正态自愈）', {
            file: path, containerCls: base, opacity: op, layerCls: c,
          });
        }
      }
    }
  }
  return report;
}
