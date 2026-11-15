/**
 * 🛡️ RUNTIME-018 判据单一来源（2026-11-15 · 标题行几何真值）。
 *
 * 背景（mc-max-1794710719020-d8887ee9 用户反馈「副标题文字跑到右侧」实锤）：
 *   `<div class="c-traffic-monitor-header c-traffic-monitor-forecast-title-wrap">`
 *   内层元素与外层**共用同一个分布语义类** `.c-traffic-monitor-header`
 *   （`justify-content:space-between; width:100%; gap:8px`），把本该「图标+文字紧挨」
 *   的标题组掰成两端对齐；空 icon 占位 span 占住第一端，文字被推到最右。
 *   静态门禁（类名/样式表）与 VISUAL-002 像素分均无法归因，只能靠真机 DOM 几何。
 *
 * 真机三阶段对照（同一预览页，Puppeteer 只读探针）：
 *   A 原状           leftGap=344 / groupWidth=403 = 0.854 → BLOCK
 *   B 仅剥内层同名类 leftGap=11  / groupWidth=66  = 0.167 → PASS
 *   C 仅删空 icon 槽 leftGap=4   / groupWidth=403 = 0.010 → PASS
 *   ⇒ 判的是「几何事实」，不是类名重复；B/C 两条互不相同的修法都应放行。
 *
 * 设计约束：
 * - **零依赖纯函数**：页内探针只采 DOM 事实（只采不判），本模块只吃这些真机事实裁决，
 *   不读产物源码、不塞构造入参（避免「改的人=验的人」假绿），便于 jest 阴阳对照。
 * - **判据单一来源**：`DISTRIBUTED_JUSTIFY` 与 `LEFT_GAP_RATIO` 只在本文件定义，
 *   页内探针不得复制阈值、不得自行 addBlock。
 * - **缺证据 fail-open**：探针开关关闭 / 执行失败 / 未找到标题组 ⇒ `verdict:'no-evidence'`。
 * - **真机计数行**：调用方恒打 `titleGeometryReality:...`（0 也打），不得塞入参冒充读数。
 *
 * 真错定义：标题组自身是分布型 justify（space-between/space-around/space-evenly），
 *   且「文字子元素左缘 − 组左缘」/ 组宽 > 0.5 ⇒ 文字被推到右半区。
 * 排除项：非分布型 justify（flex-start/center/end 等）、组宽 <= 0、比例恰等于阈值、
 *   缺 gap 数值、探针未采到任何标题组。
 */

/** 只有「会把子元素推到两端」的分布语义才进入判据；flex-start/center 等一律不判。 */
export const DISTRIBUTED_JUSTIFY = Object.freeze([
  'space-between',
  'space-around',
  'space-evenly',
]);

/** 文字左缘相对组宽的可容忍上限；> 0.5 视为「跑到右半区」。 */
export const LEFT_GAP_RATIO = 0.5;

const DISTRIBUTED_SET = new Set(DISTRIBUTED_JUSTIFY);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object|null} renderProbes 页内探针结果（collectRenderProbesInPage 返回值）
 * @returns {{evaluated:number,total:number,distributed:number,bad:Array,
 *            shouldBlock:boolean,verdict:'block'|'pass'|'no-evidence'}}
 */
export function evaluateTitleGeometryReality(renderProbes) {
  const groups = renderProbes?.titleGroups;
  if (!Array.isArray(groups) || groups.length === 0) {
    return {
      evaluated: 0,
      total: 0,
      distributed: 0,
      bad: [],
      shouldBlock: false,
      verdict: 'no-evidence',
    };
  }

  let distributed = 0;
  const bad = [];
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue;
    if (!DISTRIBUTED_SET.has(String(g.justify || '').trim().toLowerCase())) continue;
    const width = num(g.groupWidth);
    const gap = num(g.leftGap);
    if (width == null || gap == null || width <= 0) continue;
    distributed += 1;
    // 阈值严格大于：恰等于 0.5 视为居中态，不判（避免边界抖动误伤）
    if (gap / width > LEFT_GAP_RATIO) {
      bad.push({
        el: g.el || '',
        justify: g.justify,
        leftGap: gap,
        groupWidth: width,
        ratio: Number((gap / width).toFixed(3)),
        emptyChildren: num(g.emptyChildren) || 0,
        titleText: String(g.titleText || '').slice(0, 24),
      });
    }
  }

  return {
    evaluated: 1,
    total: groups.length,
    distributed,
    bad,
    shouldBlock: bad.length > 0,
    verdict: bad.length > 0 ? 'block' : 'pass',
  };
}
