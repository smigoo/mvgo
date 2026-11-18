/**
 * anchorKind 语义锚定声明 spec（2026-11-18 · 断点一三层方案）
 *
 * L1 主证：vision 声明 anchorKind（container/title-strip）+ contentAnchor ⇒
 *   sanitizer 回填 contentAnchorBox、段高链（figma-height-ratio）按 contentAnchor 直配。
 * L2 树校验：声明与 Figma 真值矛盾 ⇒ corrected 计数（可观测）。
 * L3 兜底：无声明 ⇒ blind 计数、行为与旧版一致（旧缓存任务兼容）。
 *
 * fixture 忠实复现 c8e25b42 盲区版式：标题壳 6sub-header(24px) 与内容容器
 * @echarts/line-7(141px) 并列，LLM 把 section 锚在壳内 tit(24px) 上 ——
 * 几何门 h/父比=1.0>0.25 跳过（R2 盲区），R1/R2 对该形态零操作（已实测）。
 */
import { sanitizeVisionSections } from '../vision-section-sanitizer.js';
import { applyFigmaSectionRatios } from '../figma-height-ratio.js';

/** 忠实复现 c8e25b42 版式（标题壳嵌套 tit + 并列内容容器） */
function makeFigmaTree() {
  return {
    document: {
      id: '0:0', name: 'root', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 800 },
      children: [
        {
          id: '1744:125', name: 'slot-con', type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 745 },
          children: [
            { id: '1744:127', name: '2charts', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 200, width: 420, height: 131 } },
            { id: '2:3660', name: '1统计', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 100, width: 420, height: 91 } },
            {
              id: '2:3565', name: '6sub-header', type: 'FRAME',
              absoluteBoundingBox: { x: 0, y: 700, width: 420, height: 24 },
              children: [
                { id: '2:3571', name: 'tit', type: 'TEXT', absoluteBoundingBox: { x: 0, y: 700, width: 86, height: 24 } },
              ],
            },
            { id: '2:3604', name: '@echarts/line-7', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 724, width: 420, height: 141 } },
          ],
        },
      ],
    },
  };
}

function makeSections() {
  return [
    { id: '2:3660', name: '当日总流量', role: '常驻', header: { title: '当日总流量' } },
    { id: '1744:127', name: '江阴靖江长江隧道', role: '常驻', header: { title: 'x' } },
    { id: '2:3571', name: '流量预测', role: '常驻', header: { title: '流量预测' } },
  ];
}

describe('anchorKind 语义锚定（三层方案）', () => {
  test('N0 盲区复现：无声明时 R2 对壳嵌套形态零纠偏（几何门脱靶的忠实复现）', () => {
    const layout = { sections: makeSections() };
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigmaTree() as any, meta);
    expect(meta.reanchored).toEqual([]); // 几何门盲区实锤
  });

  test('P1 title-strip + contentAnchor ⇒ sanitizer 回填 contentAnchorBox=141（L1 主证生效）', () => {
    const layout = { sections: makeSections() };
    const sec: any = layout.sections[2];
    sec.anchorKind = 'title-strip';
    sec.contentAnchor = '2:3604';
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigmaTree() as any, meta);
    expect(meta.anchorKindStats.declared).toBe(1);
    expect(meta.anchorKindStats.honored).toBe(1);
    expect(sec.contentAnchorBox).toBeTruthy();
    expect(Math.round(sec.contentAnchorBox.h)).toBe(141);
    expect(sec.id).toBe('2:3571'); // 声明形态下不重锚，标题锚保留
  });

  test('P2 段高链按 contentAnchor 直配 ⇒ flex 回真值量级', () => {
    const sections: any[] = makeSections();
    const sec: any = sections[2];
    sec.anchorKind = 'title-strip';
    sec.contentAnchor = '2:3604';
    const stats: Record<string, number> = {};
    const n = applyFigmaSectionRatios(sections, makeFigmaTree(), stats);
    expect(stats.contentAnchorDirect).toBe(1);
    expect(stats.contentAnchorMiss).toBe(0);
    expect(n).toBeGreaterThan(0);
    const fg = parseFloat(sec.styles?.flexGrow ?? '0');
    expect(fg).toBeGreaterThan(0.15); // 旧盲区直配 24px 只能给 ~0.04x
  });

  test('P3 container 声明 + 正常内容锚 ⇒ honored，锚不变', () => {
    const layout = { sections: makeSections() };
    const sec: any = layout.sections[1]; // 1744:127（131px）
    sec.anchorKind = 'container';
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigmaTree() as any, meta);
    expect(meta.anchorKindStats.honored).toBe(1);
    expect(sec.id).toBe('1744:127');
  });

  test('N1 无声明 ⇒ blind 计数 + sections 不变（L3 旧缓存兼容）', () => {
    const layout = { sections: makeSections() };
    const before = JSON.stringify(layout.sections);
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigmaTree() as any, meta);
    expect(meta.anchorKindStats.blind).toBe(3);
    expect(meta.anchorKindStats.declared).toBe(0);
    expect(JSON.stringify(layout.sections)).toBe(before);
  });

  test('N2 container 声明但锚是薄条 ⇒ corrected 计数（L2 矛盾可观测）', () => {
    const layout = { sections: makeSections() };
    const sec: any = layout.sections[2]; // 2:3571 h=24
    sec.anchorKind = 'container';
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigmaTree() as any, meta);
    expect(meta.anchorKindStats.corrected).toBe(1);
    expect(meta.anchorKindStats.honored).toBe(0);
  });

  test('N3 title-strip 但 contentAnchor 无效 ⇒ fail-open honored（不猜不崩）', () => {
    const layout = { sections: makeSections() };
    const sec: any = layout.sections[2];
    sec.anchorKind = 'title-strip';
    sec.contentAnchor = '999:999';
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigmaTree() as any, meta);
    expect(meta.anchorKindStats.honored).toBe(1);
    expect(sec.contentAnchorBox).toBeUndefined();
  });

  test('N4 幂等：同输入两次运行结果逐字一致', () => {
    const run = () => {
      const layout = { sections: makeSections() };
      const sec: any = layout.sections[2];
      sec.anchorKind = 'title-strip';
      sec.contentAnchor = '2:3604';
      const meta = { removed: [], reanchored: [] };
      const out = sanitizeVisionSections(layout as any, makeFigmaTree() as any, meta);
      return { out: JSON.stringify(out), stats: meta.anchorKindStats };
    };
    const r1 = run();
    const r2 = run();
    expect(r1.out).toBe(r2.out);
    expect(r1.stats).toEqual(r2.stats);
  });

  test('N5 真实产物回放：c8e25b42 存盘树（无声明）⇒ 行为不变（回归锚）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const p = 'workspace/custom-components/c-traffic-monitor-c8e25b42/.mc-gen/config/preview-analysis.json';
    const fp = 'workspace/custom-components/c-traffic-monitor-c8e25b42/.mc-gen/cache/figma-node-data.json';
    if (!fs.existsSync(p) || !fs.existsSync(fp)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const f = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const layout = JSON.parse(JSON.stringify(d.layout));
    const before = JSON.stringify(layout.sections);
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, f as any, meta);
    expect(JSON.stringify(layout.sections)).toBe(before);
    expect(meta.anchorKindStats.blind).toBe(layout.sections.length);
  });
});
