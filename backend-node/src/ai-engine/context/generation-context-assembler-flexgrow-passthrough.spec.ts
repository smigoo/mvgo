/**
 * 🛡️ R9（2026-11-09 · loop-verify R9 轮）：assembler styles 归一化 **flexGrow 真值透传**。
 *
 * 病灶（设备监测 49d23fe1 真机实锤）：A4（figma-height-ratio）把容器级比例写进段级
 * styles.flexGrow（89:39=2.054 / 2:8437=1.911），prompt 下发的 planner plan 原文里有，
 * 但 normalizeComponentPlan 的 styles 归一化只保留 figmaHeightPx ⇒
 * generationInput.componentPlan（engineer 装配/结构契约/healing 的统一输入）里
 * flexGrow 全部丢失 ⇒ LLM 无从对照真值，自写 flex:0.111/0.889 ⇒ tab 列塌成 1 字宽、
 * 双统计卡被裁（「南北接：设备」截断）。
 *
 * 修法：styles 归一化 figmaHeightPx 与 flexGrow 一起透传（缺省不产键，零副作用）。
 */
import { normalizeComponentPlan } from './generation-context-assembler.js';

jest.mock('../logger/index.js', () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}), { virtual: true });

const SECTIONS = [
  {
    id: '89:38',
    name: 'switch',
    role: 'content-container',
    layout: 'horizontal',
    children: [
      {
        id: '2:8787',
        name: '隧道设备统计',
        role: '常驻',
        layout: 'horizontal',
        body: { children: [] },
        styles: { flexGrow: 0.42, flexShrink: 1, flexBasis: 0, figmaHeightPx: 65 },
      },
      {
        id: '2:8806',
        name: '南北接线设备统计',
        role: '常驻',
        layout: 'horizontal',
        body: { children: [] },
        styles: { flexGrow: 0.42, figmaHeightPx: 65 },
      },
    ],
  },
  {
    id: '89:37',
    name: '@antd/tab',
    role: 'content-container',
    layout: 'horizontal',
    children: [
      {
        id: '89:39',
        name: '功能Tab导航',
        role: '常驻',
        layout: 'vertical',
        body: { children: [] },
        styles: { flexGrow: 2.054, flexShrink: 1, flexBasis: 0, figmaHeightPx: 317 },
      },
      {
        id: '2:8437',
        name: '设备类型卡片网格',
        role: '常驻',
        layout: 'grid',
        body: { items: [] },
        styles: { flexGrow: 1.911, flexShrink: 1, flexBasis: 0, figmaHeightPx: 295 },
      },
    ],
  },
];

describe('R9 · assembler styles 归一化 flexGrow 透传', () => {
  it('⭐ 阳性：段级 styles.flexGrow 与 figmaHeightPx 一起保留（49d23fe1 真值 2.054/1.911）', () => {
    const out = normalizeComponentPlan({ effectiveSections: SECTIONS });
    const s37 = (out.effectiveSections || []).find((s) => s.id === '89:37');
    expect(s37).toBeTruthy();
    const kids = s37.children || [];
    const tab = kids.find((k) => k.id === '89:39');
    const grid = kids.find((k) => k.id === '2:8437');
    expect(tab.styles).toMatchObject({ flexGrow: 2.054, figmaHeightPx: 317 });
    expect(grid.styles).toMatchObject({ flexGrow: 1.911, figmaHeightPx: 295 });
  });

  it('阴性·双卡 flexGrow=0.42 同样透传（switch-con 场景）', () => {
    const out = normalizeComponentPlan({ effectiveSections: SECTIONS });
    const s38 = (out.effectiveSections || []).find((s) => s.id === '89:38');
    const kids = s38.children || [];
    expect(kids.map((k) => k.styles.flexGrow)).toEqual([0.42, 0.42]);
  });

  it('阴性·无 styles 的段不产 styles 键（零副作用）', () => {
    const out = normalizeComponentPlan({
      effectiveSections: [{ id: '1:1', name: 'x', body: { children: [] } }],
    });
    const s = (out.effectiveSections || [])[0];
    expect(s.styles).toBeUndefined();
  });

  it('阴性·figmaHeightPx 缺失但 flexGrow 存在 ⇒ 只产 flexGrow（不造空壳键）', () => {
    const out = normalizeComponentPlan({
      effectiveSections: [
        { id: '1:2', name: 'y', body: { children: [] }, styles: { flexGrow: 1.5 } },
      ],
    });
    expect((out.effectiveSections || [])[0].styles).toEqual({ flexGrow: 1.5 });
  });
});
