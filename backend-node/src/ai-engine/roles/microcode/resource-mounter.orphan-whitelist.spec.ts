/**
 * 🛡️ F5 回归测试：L0-B 重试轮孤儿白名单（2026-09-01）
 *
 * 事故实证 mc-max-1788252098143-12469472「子组件震荡删除」：
 * 断点续跑恢复的子组件被 P1-2 孤儿清退 → 下轮重新生成 → 3 轮烧 ~15 个生成预算。
 *
 * 与 P1-2 立项事故（mc-1787829888023）的设计张力：
 * 续跑旧组件引用上轮 theme-vars 变量 → 本轮 LESS fail-closed，剔除是正确的。
 * 区分信号 = LESS 安全性（splitLessSafeOrphans）：
 *   引用的全部 less 变量在本轮产物（allFiles .less + 自身 style）有定义 → 白名单保留；
 *   存在未定义引用（陈旧产物）→ 照旧剔除（P1-2 回归保护）。
 */
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { describe, it, expect } from '@jest/globals';
import { pruneOrphanSubComponents } from './resource-mounter.js';

const INDEX_VUE = `<template>
  <div class="c-test-root">
    <ChartArea />
  </div>
</template>
<script setup>
import ChartArea from './components/ChartArea.vue';
</script>`;

const THEME_VARS = `@tab-color: #00d4ff;
@panel-gap: 12px;`;

const mkFiles = (deviceGridStyle: string) => ({
  'package/index.vue': INDEX_VUE,
  'package/components/ChartArea.vue': `<template><div class="chart-area"></div></template>
<style lang="less" scoped>
.chart-area { color: @tab-color; }
</style>`,
  'package/components/DeviceGrid.vue': `<template><div class="device-grid"></div></template>
<style lang="less" scoped>
${deviceGridStyle}
</style>`,
  'resources/styles/theme-vars.less': THEME_VARS,
});

describe('F5：L0-B 重试轮孤儿白名单（splitLessSafeOrphans 分区）', () => {
  it('非重试（默认）：孤儿照旧剔除（P1-2 原语义不变）', () => {
    const files = mkFiles('.device-grid { color: @tab-color; }');
    const pruned = pruneOrphanSubComponents(files, null, null, {});
    expect(pruned).toEqual(['package/components/DeviceGrid.vue']);
    expect(files['package/components/DeviceGrid.vue']).toBeUndefined();
  });

  it('重试 + 孤儿引用本轮已定义变量（theme-vars.less）→ 白名单保留', () => {
    const files = mkFiles('.device-grid { color: @tab-color; gap: @panel-gap; }');
    const pruned = pruneOrphanSubComponents(files, null, null, {
      isL0BRetry: true,
    });
    expect(pruned).toEqual([]);
    // 关键断言：文件未被剔除，仍可复用（斩断「清退→重生成」震荡）
    expect(files['package/components/DeviceGrid.vue']).toContain(
      'device-grid',
    );
  });

  it('重试 + 孤儿引用未定义变量（上轮 theme-vars 遗留）→ 照旧剔除（P1-2 回归保护）', () => {
    // @stale-var 是上轮 theme-vars 的变量，本轮产物没有定义 → LESS fail-closed 风险
    const files = mkFiles('.device-grid { color: @stale-var; }');
    const pruned = pruneOrphanSubComponents(files, null, null, {
      isL0BRetry: true,
    });
    expect(pruned).toEqual(['package/components/DeviceGrid.vue']);
    expect(files['package/components/DeviceGrid.vue']).toBeUndefined();
  });

  it('重试 + 孤儿自声明自用变量 → 白名单保留（自洽产物）', () => {
    const files = mkFiles(
      '@local-gap: 8px;\n.device-grid { gap: @local-gap; }',
    );
    const pruned = pruneOrphanSubComponents(files, null, null, {
      isL0BRetry: true,
    });
    expect(pruned).toEqual([]);
    expect(files['package/components/DeviceGrid.vue']).toBeDefined();
  });

  it('重试 + 孤儿无 style 块（纯模板）→ 白名单保留（无 LESS 编译风险）', () => {
    const files = {
      'package/index.vue': INDEX_VUE,
      'package/components/ChartArea.vue':
        '<template><div class="chart-area"></div></template>',
      'package/components/PlainList.vue':
        '<template><ul><li>1</li></ul></template>',
      'resources/styles/theme-vars.less': THEME_VARS,
    };
    const pruned = pruneOrphanSubComponents(files, null, null, {
      isL0BRetry: true,
    });
    expect(pruned).toEqual([]);
    expect(files['package/components/PlainList.vue']).toBeDefined();
  });

  it('重试 + 混合：一个 LESS 安全、一个陈旧 → 只剔陈旧', () => {
    const files = {
      'package/index.vue': INDEX_VUE,
      'package/components/ChartArea.vue':
        '<template><div class="chart-area"></div></template>',
      'package/components/SafePanel.vue': `<template><div class="safe-panel"></div></template>
<style lang="less" scoped>
.safe-panel { color: @tab-color; }
</style>`,
      'package/components/StalePanel.vue': `<template><div class="stale-panel"></div></template>
<style lang="less" scoped>
.stale-panel { color: @old-round-var; }
</style>`,
      'resources/styles/theme-vars.less': THEME_VARS,
    };
    const pruned = pruneOrphanSubComponents(files, null, null, {
      isL0BRetry: true,
    });
    expect(pruned).toEqual(['package/components/StalePanel.vue']);
    expect(files['package/components/SafePanel.vue']).toBeDefined();
    expect(files['package/components/StalePanel.vue']).toBeUndefined();
  });
});

/**
 * 🛡️ 2026-11-05 治本：P1-2 传递闭包恒空转（c-traffic-monitor-9b36d0ac 实锤）
 *
 * 病灶：`keep` 已被 detectSubComponents(indexVue) 预填 index 的直接子组件，BFS 的入队条件却是
 * `!keep.has(target)` ⇒ index 的直接子组件一条都不入队 ⇒ 队列出队一次就空 ⇒ 沿 import 的
 * **传递闭包从未发生**。三层引用链的末端文件永远进不了保留集 → 误判孤儿删除 →
 * 「悬空子组件引用剥离」把父组件里的标签与样式一起掏空（真机：ForecastAreaChart 被删后
 * ContentForecast 的 chart-wrap 变成空 div，刀53h 再删 chart-* 样式）。
 *
 * 修法：「保留」与「是否已遍历」解耦（keep 表示保留，visited 单独控制入队）。
 */
describe('P1-2 传递闭包：二层子组件不得误判孤儿（2026-11-05）', () => {
  const mkChain = () => ({
    'package/index.vue': `<template>
  <div class="c-test-root"><CompA /></div>
</template>
<script setup>
import CompA from './components/CompA.vue';
</script>`,
    'package/components/CompA.vue': `<template><div><CompB /></div></template>
<script setup>
import CompB from './CompB.vue';
</script>`,
    'package/components/CompB.vue': `<template><div><CompC /></div></template>
<script setup>
import CompC from './CompC.vue';
</script>`,
    'package/components/CompC.vue': '<template><div>c</div></template>',
    'package/components/Orphan.vue': '<template><div>orphan</div></template>',
    'resources/styles/theme-vars.less': THEME_VARS,
  });

  it('三层引用链 a→b→c：末端 c 必须保留，只剔真孤儿', () => {
    const files = mkChain();
    const pruned = pruneOrphanSubComponents(files, null, null, {});
    expect(pruned).toEqual(['package/components/Orphan.vue']);
    expect(files['package/components/CompB.vue']).toBeDefined();
    expect(files['package/components/CompC.vue']).toBeDefined();
    expect(files['package/components/Orphan.vue']).toBeUndefined();
  });

  it('真实形态：index 只 import 父组件，父组件 import 图表子组件 → 子组件保留', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-test-root"><ContentForecast /></div>
</template>
<script setup>
import ContentForecast from './components/ContentForecast.vue';
</script>`,
      'package/components/ContentForecast.vue': `<template>
  <div class="forecast-wrap"><ForecastAreaChart /></div>
</template>
<script setup>
import ForecastAreaChart from './ForecastAreaChart.vue';
</script>`,
      'package/components/ForecastAreaChart.vue':
        '<template><div ref="chartRef" class="chart-canvas"></div></template>',
      'resources/styles/theme-vars.less': THEME_VARS,
    };
    const pruned = pruneOrphanSubComponents(files, null, null, {});
    expect(pruned).toEqual([]);
    expect(files['package/components/ForecastAreaChart.vue']).toBeDefined();
  });

  it('阴性：index 无任何引用 → components 内文件仍按原语义全部剔除（不得放松）', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-test-root">plain</div>
</template>
<script setup>
</script>`,
      'package/components/Lonely.vue': '<template><div>lonely</div></template>',
      'resources/styles/theme-vars.less': THEME_VARS,
    };
    const pruned = pruneOrphanSubComponents(files, null, null, {});
    expect(pruned).toEqual(['package/components/Lonely.vue']);
    expect(files['package/components/Lonely.vue']).toBeUndefined();
  });
});
