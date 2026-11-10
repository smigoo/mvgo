/**
 * 🛡️ 2026-11-10（重点车辆 2:8023 实锤 · 用户裁决最小版）：非等宽行网格契约兜底
 *
 * 形态：3 卡 x=37/166/274、宽 140/120/140（bbox 含出血 ⇒ pitch 129/108 不等距），
 *   旧判据 `uniformPitch===null ⇒ return null` ⇒ 刀41/53 全部不接管 ⇒ LLM 直写裸奔。
 *   兜底窄判据：≥2 项 + 高度一致 ±2 + 宽度众数占比 ≥2/3 + 跨度 ≤ 众数宽×N+8。
 *   产出 `columnWidths/gaps`（供接管器逐列消费）；等距网格路径零变化。
 *
 * figmaIndex 直接手写 Map（绕开 indexFigmaNodes 的 jest 装配谜团——该函数对真机数据
 * 已离线验证正常，本 spec 只测 buildGridContract 主体）。
 */
import { buildGridContract } from './grid-list-layout-contract.js';

const KID = (id: string, x: number, w: number) => ({
  id,
  name: id,
  type: 'FRAME',
  absoluteBoundingBox: { x, y: 984, width: w, height: 74 },
  children: [],
});

/** 与真机 2:8023 同形态：非等宽 140/120/141，x=37/166/274（pitch 129/108 不等距） */
const NONUNIFORM_INDEX = new Map([
  [
    '2:8023',
    {
      id: '2:8023',
      rawNode: {
        id: '2:8023',
        children: [KID('136:127', 274, 141), KID('136:128', 166, 120), KID('136:129', 37, 140)],
      },
    },
  ],
]);

/** 等距对照：等宽 120 ×3，x=37/187/337（pitch 150 等距 ⇒ 走 uniformPitch 原路径） */
const UNIFORM_INDEX = new Map([
  [
    '2:8023',
    {
      id: '2:8023',
      rawNode: {
        id: '2:8023',
        children: [KID('a', 37, 120), KID('b', 187, 120), KID('c', 337, 120)],
      },
    },
  ],
]);

const SEC = { id: '2:8023', type: 'stats' };

describe('非等宽行网格契约兜底（buildGridContract）', () => {
  it('① 阳性：非等宽 3 卡产出 columnWidths（真机 2:8023 形态）', () => {
    const c = buildGridContract(SEC as any, { figmaIndex: NONUNIFORM_INDEX });
    expect(c).toBeTruthy();
    expect(c!.columnWidths).toEqual([140, 120, 141]);
    expect(c!.cols).toBe(3);
    expect(c!.cardH).toBe(74);
    expect(c!.geometryFrom).toBe('figma-nonuniform');
  });

  it('② 阴性：宽度众数占比 <2/3（140/80/60）⇒ 不猜，仍 null', () => {
    const idx = new Map([
      ['2:8023', { id: '2:8023', rawNode: { id: '2:8023', children: [KID('a', 274, 140), KID('b', 166, 80), KID('c', 37, 60)] } }],
    ]);
    const c = buildGridContract(SEC as any, { figmaIndex: idx });
    expect(c).toBeNull();
  });

  it('③ 阴性：子项高度不一致（±>2）⇒ null', () => {
    const kids = [KID('a', 274, 140), KID('b', 166, 120), KID('c', 37, 140)];
    (kids[2] as any).absoluteBoundingBox.height = 40;
    const idx = new Map([['2:8023', { id: '2:8023', rawNode: { id: '2:8023', children: kids } }]]);
    const c = buildGridContract(SEC as any, { figmaIndex: idx });
    expect(c).toBeNull();
  });

  it('④ 等距网格回归：等宽等距走原路径（无 columnWidths 字段，零行为变化）', () => {
    const c = buildGridContract(SEC as any, { figmaIndex: UNIFORM_INDEX });
    expect(c).toBeTruthy();
    expect(c!.columnWidths).toBeUndefined(); // 等距走 uniformPitch 原路径
    expect(c!.cols).toBe(3);
    expect(c!.colGap).toBe(30);
  });
});
