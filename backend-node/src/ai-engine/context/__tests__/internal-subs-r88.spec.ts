/**
 * 🛡️ internalSubcomponents 透传（2026-11-04 · mc-max-1793771678347-18544d9c 实锤）。
 *
 * 病灶：normalizeComponentPlan 白名单重建剥掉 plan 级与 section 级 internalSubcomponents
 *   （droppedKeys.internalSubcomponents:8 真机观测）→ state.generationInput（生产输入）里
 *   宿主 section 永远丢失名下图表归属 → 双渲染/图表缺失。
 * 治本：白名单放行 + 最小契约归一化透传；其余内容型字段仍被剔除并按名计数（R8-7 观测不破）。
 */
// 🚨 assembler 经 createLogger → config/backend-root.js（import.meta.url）⇒ CJS 下需 virtual mock
//    （与 body-contract-r87.spec.ts 同口径）。
jest.mock('../../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
}), { virtual: true })

import { normalizeComponentPlan } from '../generation-context-assembler.js'

describe('normalizeComponentPlan：internalSubcomponents 透传（18544d9c 治本）', () => {
  it('plan 级 internalSubcomponents 归一化透传（字段白名单，junk 剔除）', () => {
    const out = normalizeComponentPlan({
      effectiveSections: [{ id: 's1', title: '段一' }],
      isForced: true,
      minFiles: 5,
      internalSubcomponents: [
        {
          type: 'chart-component',
          id: 'chart-2:7459',
          name: '图表1',
          responsibility: '图表组件：图表1',
          reason: 'R1-geo: 几何宿主归属',
          parentSectionId: '2:3550',
          parentSectionTitle: '当日总流量',
          props: ['chartData', 'chartConfig'],
          emits: ['legendClick', 'dataZoom'],
          chartType: 'bar',
          sourceNodeIds: ['2:7459'],
          hugeFigmaSubtree: { children: [{}, {}, {}] }, // junk 对象字段必须被剔除
        },
      ],
    });
    expect(Array.isArray(out.internalSubcomponents)).toBe(true);
    expect(out.internalSubcomponents).toHaveLength(1);
    expect(out.internalSubcomponents[0]).toEqual({
      type: 'chart-component',
      id: 'chart-2:7459',
      name: '图表1',
      responsibility: '图表组件：图表1',
      reason: 'R1-geo: 几何宿主归属',
      parentSectionId: '2:3550',
      parentSectionTitle: '当日总流量',
      props: ['chartData', 'chartConfig'],
      emits: ['legendClick', 'dataZoom'],
      chartType: 'bar',
      sourceNodeIds: ['2:7459'],
    });
    // droppedKeys 不再计入 internalSubcomponents（已透传）
    expect(out.normalization.droppedKeys.internalSubcomponents).toBeUndefined();
  });

  it('section 级 internalSubcomponents 透传到对应 section', () => {
    const out = normalizeComponentPlan({
      effectiveSections: [
        {
          id: '2:3550',
          title: '当日总流量',
          internalSubcomponents: [
            {
              type: 'chart-component',
              id: 'chart-2:7459',
              reason: 'R1-geo: 几何宿主归属',
              parentSectionId: '2:3550',
            },
          ],
        },
        { id: 's2', title: '无图表段' },
      ],
    });
    const s1 = out.effectiveSections.find((s) => s.id === '2:3550');
    const s2 = out.effectiveSections.find((s) => s.id === 's2');
    expect(s1.internalSubcomponents).toHaveLength(1);
    expect(s1.internalSubcomponents[0].id).toBe('chart-2:7459');
    expect(s2.internalSubcomponents).toBeUndefined(); // 缺省不产键
  });

  it('空数组/缺失 → 不产键（零副作用，体积预算不受影响）', () => {
    const out = normalizeComponentPlan({
      effectiveSections: [{ id: 's1', internalSubcomponents: [] }],
      internalSubcomponents: [],
    });
    expect(out.internalSubcomponents).toBeUndefined();
    expect(out.effectiveSections[0].internalSubcomponents).toBeUndefined();
  });

  it('既有 droppedKeys 观测对其余内容型字段不破（回归锁）', () => {
    const out = normalizeComponentPlan({
      effectiveSections: [
        { id: 's1', title: '段一', complexityReasons: { a: 1 }, junkArr: [{ x: 1 }] },
      ],
    });
    expect(out.normalization.droppedKeys.complexityReasons).toBe(1);
    expect(out.normalization.droppedKeys.junkArr).toBe(1);
    expect(out.effectiveSections[0].complexityReasons).toBeUndefined();
  });
});
