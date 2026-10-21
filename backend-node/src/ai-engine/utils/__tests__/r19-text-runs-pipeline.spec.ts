/**
 * R19 贯通单测：Figma 真值 → 折叠器 `_vforData.lines` → prompt 可消费结构
 *
 * 只验「真值通道是否真的接通」，不验 LLM 行为：
 *   ① `collapseSectionsDeep({ figmaRoot })` 后 items 带 `lines`（一行一组 run）；
 *   ② `texts` / `textStyles` 由 runs 展平 ⇒ 两数组**同长**（旧实现条件 push 会左移串色）；
 *   ③ 无 figmaRoot 时保持旧行为（vision 平行数组）——回归不得回归掉兼容性。
 */
import { collapseSectionsDeep } from '../repeated-section-collapser.js';

const solid = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return {
    type: 'SOLID',
    visible: true,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 },
  };
};

const textNode = (id: string, characters: string, color: string, x: number) => ({
  id,
  type: 'TEXT',
  characters,
  fills: [solid(color)],
  style: { fontSize: 14, fontWeight: 400 },
  absoluteBoundingBox: { x, y: 8, width: 56, height: 18 },
});

/** 三张同构 chip（宽 126 高 30）——折叠器 minRepeat=3 才会折叠 */
const chipSection = (i: number) => ({
  id: `38:314${i}`,
  name: 'Frame 2136639903',
  figmaNodeId: `38:314${i}`,
  absoluteBoundingBox: { x: 20, y: 100 + i * 40, width: 126, height: 30 },
  children: [],
});

const figmaRoot = () => ({
  id: 'root',
  type: 'FRAME',
  children: [3131, 3132, 3133].map((n, i) => ({
    id: `38:${n}`,
    type: 'FRAME',
    name: 'Frame 2136639903',
    absoluteBoundingBox: { x: 20, y: 100 + i * 40, width: 126, height: 30 },
    children: [
      textNode(`${n}-a`, ['华为技术', '中兴通讯', '海康威视'][i], '#333333', 20),
      textNode(`${n}-b`, ['8台', '8台', '13台'][i], '#b9a000', 80),
    ],
  })),
});

describe('R19 真值贯通：折叠 → _vforData.lines', () => {
  it('有 figmaRoot ⇒ items 带 lines（1 行 2 段，色各自成立）', () => {
    // ⚠️ chipSection 的 id 必须与 figmaRoot 对齐，真值才挂得上
    const sections = [3131, 3132, 3133].map((n, i) => ({
      ...chipSection(i),
      id: `38:${n}`,
      figmaNodeId: `38:${n}`,
    }));
    const out = collapseSectionsDeep(sections, { figmaRoot: figmaRoot() });
    expect(out).toHaveLength(1);
    const list = out[0] as any;
    expect(list.renderHint).toBe('v-for');
    const it0 = list.items[0];
    expect(it0._vforData.lines).toHaveLength(1);
    expect(it0._vforData.lines[0].runs.map((r: any) => r.text)).toEqual(['华为技术', '8台']);
    expect(it0._vforData.lines[0].runs.map((r: any) => r.color)).toEqual([
      'rgb(51,51,51)',
      'rgb(185,160,0)',
    ]);
    expect(it0._vforData.mixedRunStyles).toBe(true);
  });

  it('texts / textStyles 由 runs 展平 ⇒ 同长（旧实现条件 push 会左移）', () => {
    const sections = [3131, 3132, 3133].map((n, i) => ({
      ...chipSection(i),
      id: `38:${n}`,
      figmaNodeId: `38:${n}`,
    }));
    const out = collapseSectionsDeep(sections, { figmaRoot: figmaRoot() }) as any[];
    const d = out[0].items[0]._vforData;
    expect(d.texts).toEqual(['华为技术', '8台']);
    expect(d.textStyles).toEqual(['rgb(51,51,51)', 'rgb(185,160,0)']);
    expect(d.texts.length).toBe(d.textStyles.length);
  });

  it('无 figmaRoot ⇒ 走旧 vision 平行数组（兼容不回归）', () => {
    const sections = [0, 1, 2].map((i) => ({
      ...chipSection(i),
      children: [{ text: `名称${i}`, styles: { color: '#333333' } }],
    }));
    const out = collapseSectionsDeep(sections) as any[];
    expect(out).toHaveLength(1);
    const d = out[0].items[0]._vforData;
    expect(d.texts[0]).toBe('名称0');
    expect(d.lines).toBeUndefined();
  });
});
