/**
 * 🛡️ header 几何兜底单测（2026-09-29 · mc-max-1790693732608-b6e018d6 拍板方案）
 *
 * 背景：header 类型事实此前只来自两条「命名运气」——① Figma 节点名 /header/i（E1）、
 * ② vision 的 type 语义回填。顶部条一旦不叫 header，装配器 headerLeaves 就是空集
 * ⇒ #header-right 不生成、上月/本年等头部控件全落内容区。
 * 几何兜底：顶层顶部 15% 薄条（高 ≤ 内容域 30%）+ 全树无 header 事实 ⇒ 强制标记。
 */
import { applyHeaderGeometryFallback } from './header-geometry-fallback.js';

const box = (x, y, w, h) => ({ x, y, width: w, height: h });

describe('applyHeaderGeometryFallback（header 几何兜底 · 命名无关）', () => {
  it('顶部 15% 薄条且无 header 事实 → 强制标记 type=header（b6e018d6 残余场景）', () => {
    const sections = [
      { id: 'a', name: '顶部栏', absoluteBoundingBox: box(0, 840, 460, 34), children: [] },
      { id: 'b', name: '图表区', type: 'chart', absoluteBoundingBox: box(0, 885, 436, 165), children: [] },
    ];
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit).not.toBeNull();
    expect(sections[0].type).toBe('header');
    expect(sections[0].header).toEqual({ title: '顶部栏' });
    expect(sections[1].type).toBe('chart');
  });

  it('已有 header 事实（嵌套也算）→ 不干预', () => {
    const sections = [
      { id: 'a', name: '顶部栏', absoluteBoundingBox: box(0, 0, 460, 34), children: [] },
      {
        id: 'b',
        name: '容器',
        isLayoutContainer: true,
        absoluteBoundingBox: box(0, 40, 460, 160),
        children: [{ id: 'b1', name: 'sub-header', type: 'header', children: [] }],
      },
    ];
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit).toBeNull();
    expect(sections[0].type).toBeUndefined();
  });

  it('顶部 section 不是薄条（高 > 30% 内容域）→ 不标记（防整块上卡误标）', () => {
    const sections = [
      { id: 'a', name: '大上卡', absoluteBoundingBox: box(0, 0, 460, 120), children: [] },
      { id: 'b', name: '下卡', absoluteBoundingBox: box(0, 130, 460, 80), children: [] },
    ];
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit).toBeNull();
    expect(sections[0].type).toBeUndefined();
  });

  it('顶部 section 不在顶部 15% 区域 → 不标记', () => {
    const sections = [
      { id: 'a', name: '图表区', type: 'chart', absoluteBoundingBox: box(0, 50, 460, 150), children: [] },
      { id: 'b', name: '底部卡', absoluteBoundingBox: box(0, 210, 460, 40), children: [] },
    ];
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit).toBeNull();
    expect(sections[0].type).toBe('chart');
  });

  it('bbox 缺失 / 数量不足 → fail-open 零影响', () => {
    expect(applyHeaderGeometryFallback([])).toBeNull();
    expect(applyHeaderGeometryFallback([{ id: 'only' }])).toBeNull();
    const noBox = [
      { id: 'a', name: '无几何', children: [] },
      { id: 'b', name: '也无几何', children: [] },
    ];
    expect(applyHeaderGeometryFallback(noBox)).toBeNull();
    expect(noBox[0].type).toBeUndefined();
  });
});
