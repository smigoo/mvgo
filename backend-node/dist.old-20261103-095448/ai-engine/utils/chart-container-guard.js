/**
 * 🎯 2026-09-29 治本·图表容器双刀（单一事实源，mc / vue3 双端共用）
 *
 * 事故（mc-max-1790679892888-891fbddc，用户看图：「柱状图宽度错误」实为整图塌陷）：
 *   图表组件 `ChartChart.vue` 的模板是
 *     `<div class="c-traffic-monitor-chart" ref="chartRef" v-bind="$attrs"></div>`
 *   —— **echarts 挂载容器 == 组件根元素**。装配器下发给组件标签的
 *     `style="flex:0.304;min-height:0;"` 经 `$attrs` 落到**同一个元素**上，
 *   inline 优先级 > 组件自身 CSS 的 `min-height: 127px` ⇒ 高度被压成 0 ⇒ 塌陷。
 *
 * 两刀（互补，任一单独生效也能改善，组合后结构性根治）：
 *   刀 1 `stripChartInlineMinHeight` —— 装配产物 `package/index.vue` 里，图表组件标签上的
 *        `min-height: 0/0px/auto/...` 一律剥除（保留 flex 比例）。
 *        与既有的 `stripZeroMinHeightForClass`（.vue style 块 / .less 共享表）**同一 0 值口径**
 *        （复用 `post-CHART_MH_ZERO_DECL_RE`，不另立正则）——只是补上「inline style」这第三个载体。
 *   刀 2 `wrapChartRootAsInnerWrapper` —— echarts 挂载容器是**根元素**时，确定性插入一层内层
 *        wrapper 承载 `ref`，把「组件根（吃父级 attrs，可收缩）」与「echarts 容器（须有非零
 *        min-height）」拆到两个元素上。此后任何作用在根元素上的 `min-height: 0`
 *        （装配器 / resource-mounter / flex-sibling-guard / LLM 手写）都不再压塌图表。
 *
 * 全语料影响面（498 组件 / 480 有 index.vue，2026-09-29 实测，**证明非死代码**）：
 *   含 `echarts.init(` 的图表组件 **547** 个；
 *   其中 echarts 容器 == 根元素 **13** 个（2.4%，全部为**空元素根**）→ 刀 2 命中；
 *   index.vue 里图表组件标签带 `min-height:0` **157 处** / 512 个标签（30.7%）→ 刀 1 命中。
 *
 * 纯函数、无副作用、不 import 任何带 `import.meta` 的模块（可被 jest / 离线脚本直接调用）。
 */

import { CHART_MH_ZERO_DECL_RE } from './post-process.js';

/** 需要剥除的 0 值口径（与 `isChartMinHeightProtected` / T2-D 同一集合，不另立） */
const ZERO_RE = () => new RegExp(CHART_MH_ZERO_DECL_RE.source, 'i');
const ZERO_RE_G = () => new RegExp(CHART_MH_ZERO_DECL_RE.source, 'gi');

/** 匹配一个开标签的全部属性（支持属性值内含 `>` 的极端情况） */
const ATTRS = '(?:[^>"\']|"[^"]*"|\'[^\']*\')*';

/**
 * 刀 1：剥除「图表组件标签」inline style 里的 0 值 min-height。
 *
 * 例：`<ChartChart style="flex:0.304;min-height:0;" />`
 *   → `<ChartChart style="flex:0.304;" />`
 * style 剥空则整个 `style` 属性移除（不留 `style=""`）。
 *
 * @param {string} indexContent `package/index.vue` 内容
 * @param {string[]} tagNames 图表组件标签名（= 组件文件名去 `.vue`）
 * @returns {{code:string, stripped:Array<{tag:string, before:string, after:string}>}}
 */
export function stripChartInlineMinHeight(indexContent, tagNames) {
  const empty = { code: indexContent, stripped: [] };
  if (typeof indexContent !== 'string' || !indexContent) return empty;
  const names = [...new Set((Array.isArray(tagNames) ? tagNames : []).filter(Boolean))];
  if (names.length === 0) return empty;

  let out = indexContent;
  const stripped = [];
  for (const name of names) {
    // ⚠️ 标签名后必须加**词边界**（`(?=[\s/>])`）：否则 `ChartChart` 会前缀命中
    //   `<ChartChart2 …>` / `<ChartChart3 …>`、`CardGrid` 会命中 `<CardGrid13 …>`
    //   —— 前者巧合无害（都是图表组件），后者是**真误伤**（非图表组件被剥）。
    const tagRe = new RegExp(`<${name}(?=[\\s/>])(${ATTRS})>`, 'g');
    out = out.replace(tagRe, (full, attrs) => {
      const styleM = /\bstyle="([^"]*)"/.exec(attrs);
      if (!styleM) return full;
      const before = styleM[1];
      if (!ZERO_RE().test(before)) return full;
      let after = before
        .replace(ZERO_RE_G(), (mm, sep) => (sep === ';' ? ';' : ''))
        .replace(/;\s*;/g, ';')
        .replace(/^\s*;+\s*/, '')
        .replace(/\s*;+\s*$/, '')
        .trim();
      const newAttrs = after
        ? attrs.replace(/\bstyle="[^"]*"/, `style="${after}"`)
        : attrs.replace(/\s*\bstyle="[^"]*"/, '');
      stripped.push({ tag: name, before, after });
      return `<${name}${newAttrs}>`;
    });
  }
  return { code: out, stripped };
}

/**
 * 刀 2：echarts 挂载容器是根元素（且为**空元素**）时，插入内层 wrapper。
 *
 * ```
 * <template>
 *   <div class="X" ref="chartRef" v-bind="$attrs"></div>
 * </template>
 * ```
 * →
 * ```
 * <template>
 *   <div class="X" v-bind="$attrs"><div ref="chartRef" class="X-canvas" style="width:100%;height:100%"></div></div>
 * </template>
 * ```
 *
 * fail-closed（任一条件不满足即原样返回，绝不在无把握时改结构）：
 *   · 没有 `<template>`；· 找不到 `ref="<refName>"`；
 *   · ref 元素**不是** template 的第一个元素（说明已有外层结构）；
 *   · ref 元素**非空**（含子节点 → 挪动子树的布局语义不可靠）；
 *   · 内层 class 已在文件中出现（幂等保护）。
 *
 * @param {string} content SFC 内容
 * @param {string} refName `echarts.init(xxx.value)` 的 ref 名
 * @returns {{code:string, applied:boolean, detail?:{rootClass:string, canvasClass:string}}}
 */
export function wrapChartRootAsInnerWrapper(content, refName) {
  const noop = { code: content, applied: false };
  if (typeof content !== 'string' || !content || !refName) return noop;

  const tplM = /<template[^>]*>([\s\S]*)<\/template>/.exec(content);
  if (!tplM) return noop;
  const tpl = tplM[1];

  // 定位带该 ref 的开标签（属性顺序任意）
  const safeOpenRe = new RegExp(`<([A-Za-z][\\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\\bref="${refName}"((?:[^>"']|"[^"]*"|'[^']*')*?)>`, '');
  const m = safeOpenRe.exec(tpl);
  if (!m) return noop;

  // 必须是 template 的第一个元素
  const before = tpl.slice(0, m.index).replace(/<!--[\s\S]*?-->/g, '').trim();
  if (before !== '') return noop;

  const tag = m[1];
  // ⚠️ `m[2]`/`m[3]` 是非贪婪组，空白会同时残留在两侧（`ref` 前的空格进 `m[2]`、
  //   `ref` 后的空格进 `m[3]`）⇒ 直接拼接会得到 `<div class="X"  v-bind="$attrs">`。
  //   这里先把两侧空白收边再拼（只动属性间隙，不动属性值内部）。
  const attrsLeft = `${m[2]}`.replace(/\s+$/, '');
  const attrsRight = `${m[3]}`.replace(/^\s+/, '');
  const attrs = attrsRight ? `${attrsLeft} ${attrsRight}` : attrsLeft;
  const openTag = m[0];

  // 必须是空元素：开标签后紧跟同标签闭合
  const rest = tpl.slice(m.index + openTag.length);
  const closeM = new RegExp(`^\\s*</${tag}>`).exec(rest);
  if (!closeM) return noop;

  // 根元素的 class（取第一个作为基名）；无 class 时兜底 chart
  const clsM = /\bclass="([^"]*)"/.exec(attrs);
  const rootClass = clsM ? clsM[1].trim().split(/\s+/)[0] : '';
  const canvasClass = rootClass ? `${rootClass}-canvas` : 'c-echarts-canvas';
  if (content.includes(`class="${canvasClass}"`)) return noop; // 幂等保护

  // 外层：原开标签去掉 ref 属性（其余属性原样保留）
  const outerOpen = `<${tag}${attrs.replace(/\s*\bref="[^"]*"/, '')}>`;
  const inner = `<${tag} ref="${refName}" class="${canvasClass}" style="width:100%;height:100%"></${tag}>`;

  const start = m.index;
  const end = m.index + openTag.length + closeM[0].length;
  const nextTpl = `${tpl.slice(0, start)}${outerOpen}${inner}</${tag}>${tpl.slice(end)}`;
  const nextContent = content.replace(tplM[1], nextTpl);

  return { code: nextContent, applied: true, detail: { rootClass, canvasClass } };
}
