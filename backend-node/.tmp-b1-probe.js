/**
 * B-1 / B-1b 行为探针（用 dist 真函数，只读）。
 * 用法：env -i PATH=... HOME=... node .tmp-b1-probe.js
 */
const {
  injectChartMinHeight,
  injectChartMinHeightIntoClass,
  createChartClassBlockIfAbsent,
  hasChartTruthHeight,
} = require('./dist/ai-engine/utils/post-process.js');

const wrap = (css) => `<template>\n  <div class="c-x-chart"><div ref="r" class="c-x-chart-container"></div></div>\n</template>\n<style lang="less" scoped>\n@import '../../resources/styles/index.less';\n${css}\n</style>\n`;

console.log('=== B-1: 显式绝对高度 → 不注入 min-height ===');
const withHeight = wrap('.c-x-chart {\n  height: 52px;\n  flex-shrink: 0;\n}');
const r1 = injectChartMinHeight(withHeight);
const blk = r1.match(/\.c-x-chart\s*\{([^}]*)\}/);
console.log('  hasChartTruthHeight(height:52px) =', hasChartTruthHeight('height: 52px; flex-shrink: 0;'));
console.log('  hasChartTruthHeight(height:100%) =', hasChartTruthHeight('height: 100%;'));
console.log('  hasChartTruthHeight(height:0)    =', hasChartTruthHeight('height: 0;'));
console.log('  .c-x-chart 块 →', blk ? blk[1].replace(/\s+/g, ' ').trim() : '(无)');
console.log(
  /min-height/.test(blk ? blk[1] : '') ? '  ❌ 仍注入了 min-height' : '  ✅ 未注入（尊重真值 52px）',
);

console.log('\n=== 对照：相对高度 height:100% → 仍注入兜底 ===');
const relHeight = wrap('.c-x-chart {\n  height: 100%;\n}');
const r2 = injectChartMinHeight(relHeight);
const blk2 = r2.match(/\.c-x-chart\s*\{([^}]*)\}/);
console.log('  .c-x-chart 块 →', blk2 ? blk2[1].replace(/\s+/g, ' ').trim() : '(无)');
console.log(/min-height/.test(blk2 ? blk2[1] : '') ? '  ✅ 已注入（父容器塌陷保护保留）' : '  ❌ 未注入');

console.log('\n=== B-1b: 块已存在时 createChartClassBlockIfAbsent 不新建重复块 ===');
const dup = wrap('.c-x-chart-container {\n  height: 100%;\n  min-height: 52px;\n}');
const created = createChartClassBlockIfAbsent(dup, 'c-x-chart-container', 160);
const n = (created.match(/\.c-x-chart-container\s*\{/g) || []).length;
console.log(`  .c-x-chart-container 规则块数 = ${n}`);
console.log(n === 1 ? '  ✅ 未新建重复块' : '  ❌ 产生了重复块');

console.log('\n=== B-1b 对照：块真缺失 → 仍会新建 ===');
const absent = wrap('.c-other { color: red; }');
const created2 = createChartClassBlockIfAbsent(absent, 'c-x-chart-container', 160);
console.log(
  /\.c-x-chart-container\s*\{/.test(created2) ? '  ✅ 真缺失时新建（原能力保留）' : '  ❌ 未新建（原能力丢失）',
);
