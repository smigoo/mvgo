/**
 * 图表 resize 监听自愈器（治本 6a7599af「图表不跟随尺寸变化」）
 *
 * 事故：产物 `6a7599af6eb9eebf9fba56cd`（mc-max-1787623728679-f7fed228）的
 *   `echarts.init()` 在 onMounted 内 nextTick 调用，`onUnmounted` 只 dispose，
 *   **全程无 resize 监听**。后果：容器尺寸变化（预览拖拽调尺 / 窗口缩放 /
 *   栅格换行）时图表不重绘，画布冻结在 init 那一刻；而在设计稿 1:1 保真预览下
 *   视口恒定 ⇒ 该缺陷在预览里**完全不可见**，只能靠真实 resize 暴露。
 *
 * 与 I9 不变量的分工：
 *   I9（artifact-invariants）—— 发现并留痕（落盘后必跑的「正确产物必须满足」）
 *   本自愈器          —— 确定性修复（把 I9 的违规变成合规）
 *   二者共用判据 echarts-init-guard#checkEchartsResizeListener（单一事实源）。
 *   纯函数、无IO、不抛异常 ⇒ 可被 jest / 离线脚本直接调用，也可挂 CI 回归。
 *
 * 修复策略（确定性，非 LLM 猜）：
 *   在 `onUnmounted(...)` 之前插入一段 ResizeObserver 绑定，并把 observer 实例
 *   与 chart 一起在该钩子里 disconnect。选择 onUnmounted 作为插入锚是因为：
 *     ① 图表类产物必然有 dispose（dispose 与 init 成对），锚点必然存在；
 *     ② 放在 dispose 之前才能在卸载时先断开 observer，避免泄漏；
 *     ③ 不改动 init 逻辑本身 ⇒ 零回归面。
 *   找不到锚点时 **fail-open 返回原内容**（宁可漏修，不可注入坏代码）。
 */

/** 是否真的创建了 chart 实例（分母判据，与 I9 完全一致） */
const HAS_CHART_INSTANCE = /echarts\s*\.\s*init\s*\(/;

/** 是否已有 resize 处理（复用门禁判据，防重复注入） */
function alreadyHasResizeListener(scriptContent) {
  return (
    /ResizeObserver/.test(scriptContent) ||
    /\.resize\s*\(/.test(scriptContent) ||
    /addEventListener\s*\(\s*['"`]resize['"`]/.test(scriptContent) ||
    /\.onresize\s*=/.test(scriptContent)
  );
}

/** 提取 ref 名（优先 chartRef / chartDom / *ChartRef 等常见命名） */
function pickChartRefName(scriptContent) {
  const candidates = [
    /const\s+(\w*chart\w*)\s*=\s*ref\s*\(\s*null\s*\)/i,
    /const\s+(\w*Ref)\s*=\s*ref\s*\(\s*null\s*\)/,
  ];
  for (const re of candidates) {
    const m = scriptContent.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/** 取echarts 实例变量名（let chart = null / let chartInstance = null） */
function pickChartVarName(scriptContent) {
  const m =
    scriptContent.match(/let\s+(\w*[cC]hart\w*)\s*=\s*null/) ||
    scriptContent.match(/let\s+(\w*[cC]hart\w*)\s*;/);
  return m && m[1] ? m[1] : null;
}

/**
 * 为「有echarts.init 但无 resize 监听」的 .vue 内容注入 ResizeObserver 绑定。
 *
 * @param {string} content .vue 文件内容
 * @returns {{ content: string, injected: boolean, reason: string, detail?: object }}
 */
export function healChartResizeListener(content = '') {
  const noop = { content, injected: false, reason: 'no-change' };

  if (typeof content !== 'string' || !content) return noop;
  if (!HAS_CHART_INSTANCE.test(content)) return { ...noop, reason: 'no-chart-instance' };

  const scriptMatch = content.match(/(<script[^>]*>)([\s\S]*?)(<\/script>)/i);
  if (!scriptMatch) return { ...noop, reason: 'no-script-block' };

  const [, openTag, scriptContent, closeTag] = scriptMatch;

  // 已有 resize 处理 → 不重复注入（幂等）
  if (alreadyHasResizeListener(scriptContent)) {
    return { ...noop, reason: 'already-has-resize-listener' };
  }

  const chartVar = pickChartVarName(scriptContent);
  const refName = pickChartRefName(scriptContent);
  if (!chartVar) return { ...noop, reason: 'no-chart-var' };

  // 锚点：onUnmounted（图表 dispose 处）。找不到则 fail-open，绝不盲注入。
  const unmountRe = /^[ \t]*onUnmounted\s*\([\s\S]*?\)[ \t]*$/m;
  const anchorMatch = scriptContent.match(unmountRe);
  if (!anchorMatch) return { ...noop, reason: 'no-onunmounted-anchor' };

  const observeTarget = refName ? `${refName}.value` : 'null';
  const observerVar = `${chartVar}ResizeObserver`;
  // ⚠️ observe 必须延后到 DOM 挂载之后（onMounted 内nextTick）：
  //    setup 顶层同步执行时 chartRef.value 仍是 null，观察不到任何尺寸变化。
  //    onUnmounted 作为锚点只为拿到「dispose 成对」的语义保证（图表必有 dispose）。
  // ⚠️ 只在**末尾**留一个空行作与锚点的分隔；开头不留 ——
  //    锚点（onUnmounted）前原文通常已有一个空行，若开头再补会产生连续双空行（diff 脏）。
  const injectedBlock = refName
    ? [
        '// 🩹 图表 resize 自适应：容器尺寸变化时重绘（I9 不变量修复）',
        `const ${observerVar} = new ResizeObserver(() => { ${chartVar} && ${chartVar}.resize() })`,
        `onMounted(() => nextTick(() => { if (${observeTarget}) ${observerVar}.observe(${observeTarget}) }))`,
        `onUnmounted(() => ${observerVar}.disconnect())`,
        '',
      ].join('\n')
    : [
        '// 🩹 图表 resize 自适应：容器尺寸变化时重绘（I9 不变量修复）',
        `const ${observerVar} = new ResizeObserver(() => { ${chartVar} && ${chartVar}.resize() })`,
        `onUnmounted(() => ${observerVar}.disconnect())`,
        '',
      ].join('\n');

  const anchorIndex = scriptContent.indexOf(anchorMatch[0]);
  const anchorLineStart = scriptContent.lastIndexOf('\n', anchorIndex) + 1;
  const indentMatch = scriptContent.slice(anchorLineStart, anchorIndex).match(/^[ \t]*/);
  const indent = indentMatch ? indentMatch[0] : '';
  // injectedBlock 首尾已各含一个空串（作为与上下文的分隔），
  // 此处**只做缩进对齐**，不再额外补空行 —— 否则会产出连续双空行（diff 脏）。
  const indented = injectedBlock
    .split('\n')
    .map((l) => (l.trim() ? indent + l : l))
    .join('\n');

  const nextScript = scriptContent.slice(0, anchorIndex) + indented + '\n' + scriptContent.slice(anchorIndex);

  return {
    content: content.replace(scriptContent, nextScript),
    injected: true,
    reason: 'injected-resize-observer',
    detail: { chartVar, refName: refName || null },
  };
}
