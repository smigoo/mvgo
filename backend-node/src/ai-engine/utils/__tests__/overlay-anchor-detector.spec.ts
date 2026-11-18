/**
 * 角标检测器 spec（2026-11-18 · D5 实锤：badge-count 骑跨 ratio 0.36~0.39）
 * 判据：名含 badge/tag/角标 + 容器有业务文本兄弟 + 骑跨重叠率 ∈ [0.3, 0.85)
 */
import { detectOverlayChildren } from '../overlay-anchor-detector.js';

function makeFigma() {
  return {
    document: {
      id: '0:0', type: 'FRAME', name: 'root',
      children: [
        {
          id: '2:9020', name: 'tabs', type: 'GROUP',
          absoluteBoundingBox: { x: 0, y: 100, width: 387, height: 38 },
          children: [
            { id: '2:9023', name: 'tab-active', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 100, width: 42, height: 29 },
              children: [{ id: '2:9024', name: 'tab-text', type: 'TEXT', characters: '全部' }] },
            { id: '2:9025', name: 'tab-traffic-trend', type: 'FRAME', absoluteBoundingBox: { x: 60, y: 100, width: 64, height: 29 },
              children: [{ id: '2:9026', name: 't', type: 'TEXT', characters: '交通态势' }] },
            { id: '2:9033', name: 'badge-count-01', type: 'GROUP', absoluteBoundingBox: { x: 28, y: 100, width: 18, height: 18 },
              children: [{ id: '2:9035', name: 'n', type: 'TEXT', characters: '6' }] },
            { id: '2:9036', name: 'badge-count-02', type: 'GROUP', absoluteBoundingBox: { x: 112, y: 100, width: 18, height: 18 },
              children: [{ id: '2:9038', name: 'n', type: 'TEXT', characters: '2' }] },
          ],
        },
        {
          // 流内 pill：完全包含于行容器（ratio=1.0）⇒ 不判 overlay
          id: '2:8945', name: 'item-event-1', type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 200, width: 400, height: 40 },
          children: [
            { id: '2:8971', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 200, width: 400, height: 40 } },
            { id: '2:8968', name: 'badge-status-pending', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 210, width: 36, height: 20 },
              children: [{ id: '2:8969', name: 't', type: 'TEXT', characters: '待处理' }] },
          ],
        },
      ],
    },
  };
}

describe('角标检测器（overlay-anchor-detector）', () => {
  test('P1 badge-count 骑跨宿主（ratio 0.39/0.36）⇒ 命中并写 overlay 契约', () => {
    const figma = makeFigma();
    const meta = { pairs: [] };
    const r = detectOverlayChildren(figma as any, meta);
    expect(r.overlays).toBe(2);
    expect(meta.pairs.length).toBe(2);
    // overlay 契约写上
    const find = (id: string) => {
      let hit: any = null;
      const w = (n: any) => {
        if (String(n.id) === id) hit = n;
        for (const c of n.children || []) w(c);
      };
      w(figma.document);
      return hit;
    };
    const b1 = find('2:9033');
    expect(b1.overlay).toBeTruthy();
    expect(b1.overlay.hostId).toBe('2:9023');
    // 宿主标 hasOverlayChildren
    const host = find('2:9023');
    expect(host.hasOverlayChildren).toBe(true);
  });

  test('N1 流内 pill（badge-status 完全包含 ratio=1.0）⇒ 不命中', () => {
    const figma = makeFigma();
    detectOverlayChildren(figma as any, { pairs: [] });
    let found: any = null;
    const w = (n: any) => {
      if (String(n.id) === '2:8968') found = n;
      for (const c of n.children || []) w(c);
    };
    w(figma.document);
    expect(found).toBeTruthy();
    expect(found.overlay).toBeUndefined();
  });

  test('P2 幂等：重复检测 overlays 数一致（写同值不重复计）', () => {
    const figma = makeFigma();
    const r1 = detectOverlayChildren(figma as any, { pairs: [] });
    const r2 = detectOverlayChildren(figma as any, { pairs: [] });
    expect(r1.overlays).toBe(r2.overlays);
  });

  test('N2 空树 fail-open', () => {
    expect(detectOverlayChildren(null as any).overlays).toBe(0);
    expect(detectOverlayChildren({} as any).overlays).toBe(0);
  });
});
