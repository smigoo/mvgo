/**
 * 🛡️ header 几何兜底单测（2026-09-29 · mc-max-1790693732608-b6e018d6 拍板方案）
 *
 * 背景：header 类型事实此前只来自两条「命名运气」——① Figma 节点名 /header/i（E1）、
 * ② vision 的 type 语义回填。顶部条一旦不叫 header，装配器 headerLeaves 就是空集
 * ⇒ #header-right 不生成、上月/本年等头部控件全落内容区。
 * 几何兜底：顶层顶部 15% 薄条（高 ≤ 内容域 30%）+ 全树无 header 事实 ⇒ 强制标记。
 */
import { applyHeaderGeometryFallback, isTopThinHeaderBand } from './header-geometry-fallback.js';

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

  it('🔴 vision 业务主权：顶部 stat-card 薄条不得被改标 header（7d7925d2）', () => {
    const sections = [
      {
        id: '43:4893', name: '统计卡片区', absoluteBoundingBox: box(0, 0, 470, 66),
        body: { children: [{ role: 'stat-card', body: { children: [{ type: 'value', text: '8' }] } }] },
      },
      { id: '43:4788', name: '设备列表', absoluteBoundingBox: box(0, 84, 470, 345) },
    ];
    expect(applyHeaderGeometryFallback(sections)).toBeNull();
    expect(sections[0].type).toBeUndefined();
  });

  it('阴性：普通顶部控件条无业务角色 ⇒ 几何兜底仍生效', () => {
    const sections = [
      { id: 'a', absoluteBoundingBox: box(0, 0, 470, 34), body: { children: [{ role: 'controls' }] } },
      { id: 'b', absoluteBoundingBox: box(0, 50, 470, 200) },
    ];
    expect(applyHeaderGeometryFallback(sections)).not.toBeNull();
    expect(sections[0].type).toBe('header');
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

/**
 * 🛡️ P2-12（2026-10-01）：面板标题带几何判据（`microcode-engineer#T1 面板标题剥离` 复用）。
 * 真值抽样来自 `workspace/custom-components/<组件名>/.checkpoint/figma.json`（461 个组件全量审计：
 * 顶部 `header` 条 relY 0~14 / h 24~67 / rootH 225~389 ⇒ 全部 true，零翻转）。
 */
describe('isTopThinHeaderBand（面板标题带 · 顶部薄条）', () => {
  const ROOT = box(0, 0, 460, 340); // 真值量级：rootH 330~389

  it('真值顶部 header 条（relY=14 h=24 / rootH=330）→ true', () => {
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 14, 460, 24) }, ROOT)).toBe(true);
  });

  it('真值顶部 header 条（relY=0 h=67 / rootH=389 同量级）→ true', () => {
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 0, 460, 67) }, ROOT)).toBe(true);
  });

  it('内容区里叫 header 的块：偏下（relY ≥ 15% 根高）→ false', () => {
    // relY=60 ≥ 340*0.15=51
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 60, 460, 30) }, ROOT)).toBe(false);
  });

  it('内容区里叫 header 的块：贴顶但整块上卡（h > 30% 根高）→ false', () => {
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 0, 460, 120) }, ROOT)).toBe(false);
  });

  it('边界：relY 恰为 15% 根高 → false（判据为严格小于）', () => {
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 51, 460, 20) }, ROOT)).toBe(false);
  });

  it('边界：h 恰为 30% 根高 → true；超 1px → false', () => {
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 0, 460, 102) }, ROOT)).toBe(true);
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 0, 460, 103) }, ROOT)).toBe(false);
  });

  it('几何不可判（任一 bbox 缺失/非法）→ null（调用方保持既有判据，不翻案）', () => {
    expect(isTopThinHeaderBand({}, ROOT)).toBeNull();
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 0, 460, 0) }, ROOT)).toBeNull();
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 0, 460, 20) }, null)).toBeNull();
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 0, 460, 20) }, box(0, 0, 460, 0))).toBeNull();
  });

  it('阈值可覆盖（保持与调用方同一口径时可显式传参）', () => {
    expect(isTopThinHeaderBand({ absoluteBoundingBox: box(0, 60, 460, 30) }, ROOT, { relYRatio: 0.5 })).toBe(true);
  });
});
