/**
 * 🛡️ 根治⑨（2026-11-12 · mc-max-1794478507437-9abc87d3 实锤）：echarts 挂载点缺失确定性自愈
 *
 * 病灶：LLM 在 script 里写了完整 echarts 代码（`const chartRef = ref(null)` +
 * `echarts.init(chartRef.value)`），但 template 漏写 `<div ref="chartRef">` 挂载点
 * → chartRef.value 恒为 null → 图表永不渲染 → do-not-invent 硬闸
 * DO-NOT-INVENT-CHART-MOUNT-MISSING（BLOCK）→ 重试耗尽 → 整单 failed。
 *
 * 治法（与根治② :style 残留归一同款纪律——机械可修缺陷在校验前还原）：
 *   写盘前置自愈链扫描每个 .vue：
 *     ① script 有 `echarts.init(X.value)` / `echarts.init(X)`（X 为简单标识符）；
 *     ② 经 `chart-mount-truth#resolveChartMount` 裁决为「真缺挂载」
 *        （X 声明为 ref(null)/ref([]) 且模板无静态/动态/fn ref 挂载；判据与
 *         do-not-invent-validator#collectChartMountVerdicts 单一来源，禁止复制正则）；
 *     ③ 命中 ⇒ 在 template 根元素闭合标签前注入
 *        `<div ref="X" class="chart-mount-healed" style="width:100%;min-height:120px;"></div>`。
 *
 * ⚠️ 2026-11-15（bca81048 实锤）：X 为循环变量 / querySelector 自取 DOM / 声明无法溯源时
 *    **一律不注入** —— 旧版只看「模板有无 ref="X"」，会给函数式 ref 收集数组的产物
 *    塞进一个无人引用的 `ref="el"` 幽灵 div，既无效又污染产物。
 *
 * 注入形态取舍：
 *   - 内联 style（width 100% 保证 clientWidth>0，min-height 120px 保证 clientHeight>0
 *     —— echarts.init 二者任一为 0 都不会出图，组件内 ResizeObserver 会等到有尺寸才 init）；
 *   - 不改 <style> 块（避免与 less 全局变量注入链互相干扰）；
 *   - flex:1 不注入：宿主未必是 flex 容器，注入 inert 属性徒增噪音，min-height 已够兜底。
 *
 * 幂等：二次执行时 ref 已存在 ⇒ 零改动。无 echarts 的文件零改动。
 * 四象限覆盖：挂在 file-writer.js 写前自愈链，mc-max / vue3-max / lite 各象限共用该出口。
 */

/** 判据单一来源（2026-11-15）：挂载点裁决统一走 chart-mount-truth，禁止此处复制正则 */
import { collectChartInitTargets, resolveChartMount } from '../../utils/chart-mount-truth.js';

/** 提取 <template>...</template> 内层内容；无模板返回 null */
function extractTemplateInner(content) {
  const open = content.match(/<template>/);
  if (!open) return null;
  const start = open.index + open[0].length;
  const close = content.lastIndexOf('</template>');
  if (close <= start) return null;
  return { inner: content.slice(start, close), start, end: close };
}

/**
 * 定位 template 根元素的闭合位置（返回【内层坐标系】的插入下标 + 缩进）。
 * 根元素自闭合（<div ... />）⇒ 插入点在其后；否则扫描注释/标签深度找配对闭合标签。
 * 扫不到（畸形模板）返回 null —— 自愈是优化不是依赖，宁可不修不可改坏。
 */
function findRootCloseIndex(inner) {
  const rootM = inner.match(/^\s*<([A-Za-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/);
  if (!rootM) return null;
  const rootName = rootM[1];
  if (rootM[2].endsWith('/')) {
    // 自闭合根：插到它后面
    return { index: rootM.index + rootM[0].length, indent: '  ', afterSelfClosing: true };
  }
  // 逐 token 扫深度（跳过注释、串内 >）
  const tokenRe =
    /<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  tokenRe.lastIndex = rootM.index + rootM[0].length;
  let depth = 1;
  let m;
  while ((m = tokenRe.exec(inner)) !== null) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1] === '/') {
      // 闭合标签
      if (m[2] === rootName) {
        depth -= 1;
        if (depth === 0) return { index: m.index, indent: '  ', afterSelfClosing: false };
      }
    } else if (m[4] !== '/') {
      depth += 1;
    }
  }
  return null;
}

/**
 * 扫描并自愈单个 SFC 内容。
 *
 * 🛡️ 2026-11-15（bca81048 假阳性）：判据与门禁同源（chart-mount-truth），
 * 只对「声明为模板 ref（ref(null)/ref([])）且模板真无挂载」的目标注入，
 * 循环变量 / querySelector / 无法溯源的形态一律不动（避免给好产物塞无效 ref div）。
 *
 * @param {string} content 完整 .vue 文件内容
 * @returns {{ content: string, healed: boolean, fixes: Array<{refName: string}> }}
 */
export function healChartMountPoints(content) {
  const empty = { content, healed: false, fixes: [] };
  if (typeof content !== 'string' || !content.includes('echarts.init(')) return empty;

  const tpl = extractTemplateInner(content);
  if (!tpl) return empty;

  // ① 收集 init 目标（简单标识符；保序去重）
  const refNames = collectChartInitTargets(content);
  if (refNames.length === 0) return empty;

  // ② 只留「模板 ref 声明但无挂载」的真缺口（与门禁同一裁决函数）
  const missing = refNames
    .map((name) => ({ name, verdict: resolveChartMount(content, name) }))
    .filter(({ verdict }) => !verdict.mounted)
    .map(({ name }) => name);
  if (missing.length === 0) return empty;

  // ③ 定位根元素闭合点
  const root = findRootCloseIndex(tpl.inner);
  if (!root) return empty;

  const pad = root.afterSelfClosing ? '\n    ' : '';
  const inject =
    pad +
    missing
      .map(
        (name) =>
          `<div ref="${name}" class="chart-mount-healed" style="width:100%;min-height:120px;"></div>`,
      )
      .join('\n    ') +
    (root.afterSelfClosing ? '' : '\n  ');

  const newInner = tpl.inner.slice(0, root.index) + inject + tpl.inner.slice(root.index);
  return {
    content: content.slice(0, tpl.start) + newInner + content.slice(tpl.end),
    healed: true,
    fixes: missing.map((refName) => ({ refName })),
  };
}
