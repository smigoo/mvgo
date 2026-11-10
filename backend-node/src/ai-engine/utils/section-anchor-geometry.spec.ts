/**
 * 🛡️ L1（2026-11-10 · 重点车辆 fbc0feb5 判分器实锤）：段锚几何错配判据
 *
 * 真实形态：产物把 `data-section-id="136:122"` 挂在 405×109 的内容区上，
 *   而 Figma 136:122 只是 86×24 的 sub-header ⇒ 锚点挂到子节点、父容器顶着它的 id。
 */
import { computeSectionAnchorMismatch, indexFigmaBoxes } from './section-anchor-geometry.js';

const FIGMA = {
  document: {
    id: 'root',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 147 },
    children: [
      { id: '136:122', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 86, height: 24 } },
      { id: '89:42', name: 'sub-t', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 380, height: 32 } },
      { id: '2:7954', name: 'tabs', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 204, height: 18 } },
      { id: 'tiny', name: 'dot', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 6, height: 6 } },
    ],
  },
};

describe('L1 · 段锚几何错配', () => {
  it('① 阳性：父容器顶子节点 id（405×109 vs 86×24）⇒ 命中', () => {
    const r = computeSectionAnchorMismatch([{ sid: '136:122', w: 405, h: 109 }], FIGMA);
    expect(r).toHaveLength(1);
    expect(r[0].sid).toBe('136:122');
    expect(r[0].truth).toEqual({ w: 86, h: 24 });
    expect(r[0].dw).toBeGreaterThanOrEqual(0.3);
  });

  it('② 阴性：尺寸匹配（405×33 vs 380×32）⇒ 不报', () => {
    expect(computeSectionAnchorMismatch([{ sid: '89:42', w: 405, h: 33 }], FIGMA)).toEqual([]);
  });

  it('③ 阴性：合成 id（含 `-`）与极小节点不参与', () => {
    const r = computeSectionAnchorMismatch(
      [{ sid: 'chart-2:7898', w: 405, h: 117 }, { sid: 'tiny', w: 400, h: 400 }],
      FIGMA,
    );
    expect(r).toEqual([]);
  });

  it('④ 阴性：尺寸为 0（未渲染，归 RUNTIME-006）与真值缺失 ⇒ 不报', () => {
    const r = computeSectionAnchorMismatch(
      [{ sid: '136:122', w: 0, h: 0 }, { sid: 'unknown:1', w: 405, h: 109 }],
      FIGMA,
    );
    expect(r).toEqual([]);
  });

  it('⑤ indexFigmaBoxes：仅在 bbox 完整时入索引', () => {
    const idx = indexFigmaBoxes(FIGMA);
    expect(idx.get('136:122')).toEqual({ w: 86, h: 24, name: 'sub-header' });
    expect(indexFigmaBoxes(null).size).toBe(0);
  });
});
