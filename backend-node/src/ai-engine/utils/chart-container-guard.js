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

/* ------------------------------------------------------------------ *
 * 刀 3（F3，2026-11-04 · mc-max-1793769058951-9a0133fe 实锤）
 *   图表 `min-height` 保底被「后置同名规则」反杀。
 *
 * 病灶（真机 CSSOM 实证）：
 *   T2 已注入 `.c-env-monitor-chart { min-height: 160px }`，但 `code-validator` 的
 *   `[自动修复] 模板 class .chart → 匹配元素 chart-section` 又在 **文件末尾**追加了
 *   `.c-env-monitor-chart { min-height: 0; /* VERT-004 *\/ }`。预览层给所有选择器加了同权重
 *   作用域前缀 ⇒ **纯按源序定胜负** ⇒ 后置的 0 恒胜 ⇒ 图表容器高度塌成 0，echarts 已 init
 *   （canvas 405×110 真实存在）却被 `overflow:hidden` 裁掉，用户看到「图表消失」。
 *   T2-D 的 `stripZeroMinHeightForClass` 只剥「同块内」的 0，覆盖不到后置同名块。
 *
 * 判据（保守、无新事实）：
 *   **不发明新数值**——只在「该类此前已声明过正的 min-height」时，把其后出现的
 *   `min-height: 0` 恢复成那个**作者/管线自己写过的正值**。没有正值则一律不动（fail-open）。
 *   只作用于含 `echarts.init(` 的组件模板出现过的类（图表子树），非图表组件零影响。
 *
 * 落点：`writeFiles` 入口（全产物唯一写盘出口），保证「门禁校验内容 == 实际落盘内容」。
 * ------------------------------------------------------------------ */

const MH_DECL_RX = /(min-height\s*:\s*)(0(?:px)?|\d+(?:\.\d+)?px)/gi;

/** 从 .vue 的 <template> 收集 class 名（图表子树类集合） */
function collectTemplateClasses(vueContent) {
  const out = new Set();
  const tplM = /<template[\s\S]*<\/template>/i.exec(vueContent);
  if (!tplM) return out;
  for (const m of tplM[0].matchAll(/\bclass="([^"]*)"/g)) {
    for (const c of m[1].trim().split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

/** 定位 `.cls` 作为选择器的规则块区间（深度感知；返回 [{start,end}]，end 为开括号后） */
function findClassBlockRanges(text, cls) {
  const ranges = [];
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 注意：cls 来自 `class="…"`（不带点），选择器侧必须带 `.`；`at` 指向类名首字符（跳过点）
  const selRx = new RegExp(`(^|[\\s,>+~}])\\.${esc}(?![\\w-])`, 'g');
  let m;
  while ((m = selRx.exec(text)) !== null) {
    const at = m.index + m[1].length + 1;
    const open = text.indexOf('{', at);
    if (open < 0) continue;
    if (text.slice(at + cls.length, open).trim() !== '') continue; // 该 class 后不应有其它选择器片段
    let depth = 1;
    let i = open + 1;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') depth -= 1;
    }
    if (depth !== 0) continue;
    ranges.push({ start: open, end: i });
    selRx.lastIndex = i;
  }
  return ranges;
}

/**
 * 刀 3：恢复被后续同名规则反杀的图表 min-height。
 * @param {Record<string,string>} files 产物文件表（path → content）
 * @returns {{files: Record<string,string>, fixed: Array<{path:string, cls:string, value:number}>}}
 */
export function restoreChartMinHeightAfterZero(files = {}) {
  const next = { ...files };
  const fixed = [];
  if (!next || typeof next !== 'object') return { files: next, fixed };

  // 1) 图表子树类集合（唯一来源：含 echarts.init 的 .vue 模板）
  const chartClasses = new Set();
  for (const [p, c] of Object.entries(next)) {
    if (!/\.vue$/i.test(p) || typeof c !== 'string' || !c.includes('echarts.init(')) continue;
    for (const cls of collectTemplateClasses(c)) chartClasses.add(cls);
  }
  if (chartClasses.size === 0) return { files: next, fixed };

  // 2) 逐文件修复：正的 min-height 一旦出现，其后同类 0 值恢复为该正值
  for (const [p, content] of Object.entries(next)) {
    if (typeof content !== 'string') continue;
    if (!/\.(vue|less|css)$/i.test(p)) continue;
    // .vue 只处理 <style> 区段（模板里的 min-height 属于内联样式，不参与源码重写）
    const segments = [];
    if (/\.vue$/i.test(p)) {
      const rx = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      let sm;
      while ((sm = rx.exec(content)) !== null) {
        const start = sm.index + sm[0].indexOf('>') + 1;
        segments.push({ start, end: start + sm[1].length });
      }
    } else {
      segments.push({ start: 0, end: content.length });
    }

    let text = content;
    for (const cls of chartClasses) {
      for (const seg of segments) {
        const region = text.slice(seg.start, seg.end);
        let positive = null;
        const ranges = findClassBlockRanges(region, cls);
        let regionOut = region;
        let offsetShift = 0;
        for (const r of ranges) {
          const body = regionOut.slice(r.start + offsetShift + 1, r.end + offsetShift - 1);
          let local = positive;
          let changed = false;
          const newBody = body.replace(MH_DECL_RX, (full, pre, val) => {
            const num = parseFloat(val);
            if (num > 0) {
              local = num;
              return full;
            }
            if (local != null && local > 0) {
              changed = true;
              return `${pre}${local}px`;
            }
            return full;
          });
          if (changed) {
            regionOut = regionOut.slice(0, r.start + offsetShift + 1) + newBody + regionOut.slice(r.end + offsetShift - 1);
            offsetShift += newBody.length - body.length;
            fixed.push({ path: p, cls, value: local });
          }
          positive = local;
        }
        if (regionOut !== region) {
          text = text.slice(0, seg.start) + regionOut + text.slice(seg.end);
        }
      }
    }
    if (text !== content) next[p] = text;
  }
  return { files: next, fixed };
}

/**
 * 🛡️ 2026-11-14（真机 6f02cdb0 实锤）：**剥除前提判定** —— 组件根是否就是 echarts 容器。
 *
 * 刀 1 的存在理由是「`min-height:0` 经 `$attrs` 落到 echarts 挂载容器 ⇒ 图表被压成 0」，
 * 而这只在 **根元素 == echarts 容器** 时成立。真机 `ContentTunnel` / `ContentBridge` /
 * `ChartSection` 的根都**不是** echarts 容器（图在内部子元素上），刀 1 仍把
 * `flex:<比例>;min-height:0;` 里的 `min-height:0` 剥掉 ⇒ flex item 回到 `min-height:auto`
 * ⇒ 图表段被内容最小高**撑高**、兄弟段被压缩 ⇒ 段高比例与设计不符
 * （实测 3 段各被撑高，画布 807 内其它段等比缩水）。
 *
 * 判据：`<template>` 的第一个元素是否带 `ref="<refName>"`（与 `wrapChartRootAsInnerWrapper`
 *   同一观察口径）。是 ⇒ 才允许剥；否 ⇒ 保留 `min-height:0`（比例优先，图表不会塌，因为
 *   挂载容器在内层、自带非零 min-height）。
 *
 * @param {string} content 组件源码
 * @param {string} refName echarts.init 的 ref 变量名
 * @returns {boolean}
 */
export function chartRootIsEchartsContainer(content, refName) {
  if (typeof content !== 'string' || !content || !refName) return false;
  const tplM = content.match(/<template>([\s\S]*?)<\/template>/);
  if (!tplM) return false;
  const body = tplM[1];
  // 跳过注释/空白后取第一个标签
  const first = body.replace(/<!--[\s\S]*?-->/g, '').match(/<([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/);
  if (!first) return false;
  const attrs = first[2] || '';
  return new RegExp(`\\bref\\s*=\\s*["']${refName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(attrs);
}
