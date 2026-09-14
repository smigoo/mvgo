/**
 * 🛡️ 刀 22-grid 确定性治愈回归测试（2026-09-14，c-device-monitor-54038a3a 实锤）
 *
 * 病灶：analysis.json 已含 `device-grid { layout:"grid", gridColumns:3 }`，双层约束也进了
 * prompt，但 LLM 仍写出 `display:flex; flex-wrap:wrap` + 子项 `width:calc(25% - …)`，
 * 12 设备卡按 flex-wrap 流动排布（与设计稿严格 3 列等高栅格不符，窄容器下甚至塌成 1 列被裁）。
 * 所有代码门禁绿灯（CSS 合法、DOM 存在），纯视觉坏。
 *
 * 治本（本文件验证）：healGridContainer 按「结构事实 + gridColumns 事实源」确定性改写：
 *   - 父容器 `.c-device-monitor-cons` 当前是 flex-wrap → 改为 `display:grid; grid-template-columns: repeat(3,1fr)`
 *   - 子项 `.c-device-monitor-group` 的百分比宽度声明被清掉（grid 下破坏列宽）
 * 不靠类名硬编码，靠子项同质 + 等宽意图 + 父非 grid 三条件；事实列数缺失时绝不动作。
 */
import { describe, it, expect } from '@jest/globals';
import { healGridContainer } from '../flex-sibling-guard.js';

const mkDeviceMonitorFiles = () => [
  {
    path: 'package/index.vue',
    content: `<template>
  <div class="c-device-monitor-cons">
    <div class="c-device-monitor-group" v-for="d in devices" :key="d.id">
      <img class="c-device-monitor-icon" :src="d.icon" />
      <span class="c-device-monitor-group__label">{{ d.name }}</span>
      <span class="c-device-monitor-group__value">{{ d.value }}</span>
    </div>
  </div>
</template>
<style lang="less" scoped>
@import '../resources/styles/common.less';
</style>`,
  },
  {
    path: 'resources/styles/common.less',
    content: `.c-device-monitor-cons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
  min-width: 0;
  align-content: flex-start;
  overflow-y: auto;
}

.c-device-monitor-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: calc(25% - 6px);
  min-width: 120px;
  padding: 12px 8px;
  border-radius: 6px;
  box-sizing: border-box;
  position: relative;
}`,
  },
];

describe('healGridContainer (刀 22-grid)', () => {
  it('把 flex-wrap 设备网格确定性改写为 N 列 grid，并清理子项百分比宽度', () => {
    const files = mkDeviceMonitorFiles();
    const res = healGridContainer(files, { gridColumnsList: [3] }, null);
    expect(res.fixed.length).toBeGreaterThanOrEqual(1);

    const consFile = res.files.find((f) => f.path === 'resources/styles/common.less');
    expect(consFile.content).toMatch(/display:\s*grid/);
    expect(consFile.content).toMatch(/grid-template-columns:\s*repeat\(3,\s*1fr\)/);
    expect(consFile.content).not.toMatch(/flex-wrap/);

    // 子项百分比宽度被清掉
    const groupBlock = consFile.content.match(/\.c-device-monitor-group\s*\{[^}]*\}/s)?.[0] || '';
    expect(groupBlock).not.toMatch(/width:\s*calc\(25%[^;]*\)/);
    expect(groupBlock).not.toMatch(/min-width:\s*120px/);
  });

  it('事实列数缺失时不动作（绝不臆测列数）', () => {
    const files = mkDeviceMonitorFiles();
    const res = healGridContainer(files, { gridColumnsList: [] }, null);
    expect(res.fixed.length).toBe(0);
    expect(res.files).toBe(files); // 原引用未改
  });

  it('父容器已是 display:grid 时尊重作者意图，不动', () => {
    const files = mkDeviceMonitorFiles().map((f) =>
      f.path.endsWith('.less')
        ? {
            path: f.path,
            content: f.content.replace('display: flex;\n  flex-wrap: wrap;', 'display: grid;\n  grid-template-columns: repeat(2, 1fr);'),
          }
        : f,
    );
    const res = healGridContainer(files, { gridColumnsList: [3] }, null);
    expect(res.fixed.length).toBe(0);
  });

  it('子项非等宽网格意图（无 width 占比）时不误改非网格容器', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="c-x-row"><div class="c-x-cell">a</div><div class="c-x-cell">b</div><div class="c-x-cell">c</div></div></template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-x-row { display: flex; }\n.c-x-cell { padding: 4px; color: #333; }`,
      },
    ];
    const res = healGridContainer(files, { gridColumnsList: [3] }, null);
    expect(res.fixed.length).toBe(0);
  });

  it('幂等：二次运行不再产生修复', () => {
    const files = mkDeviceMonitorFiles();
    const once = healGridContainer(files, { gridColumnsList: [3] }, null);
    const twice = healGridContainer(once.files, { gridColumnsList: [3] }, null);
    expect(twice.fixed.length).toBe(0);
  });
});
