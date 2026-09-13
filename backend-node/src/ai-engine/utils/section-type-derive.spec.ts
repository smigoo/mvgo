/**
 * 刀 5a（2026-09-13）：section type 推导 header 收窄。
 * 根因：旧 header 关键词 ['header','title','top','顶部','标题','头部'] 过宽，
 * 「小标题/sub-header/顶部/标题」等内容区小标题被误判 type=header → 确定性模板
 * 塞进 #header-right，与真正标题行 tabs 双轨 / 过拆（vehicle/traffic 实锤）。
 */
import { deriveSectionType, TYPE_KEYWORDS } from './section-type-derive.js';

describe('deriveSectionType（header 收窄）', () => {
  test('explicit type 优先，不受关键词影响', () => {
    expect(deriveSectionType({ id: 'x', type: 'header' })).toBe('header');
    expect(deriveSectionType({ id: 'x', type: 'stats', name: '标题区' })).toBe('stats');
  });

  test('内容区小标题 → 不再判 header（回落 content）', () => {
    expect(deriveSectionType({ id: '2:7959', name: '小标题' })).not.toBe('header');
    expect(deriveSectionType({ id: '136:122', name: 'sub-header' })).not.toBe('header');
    expect(deriveSectionType({ id: '88:32', name: 'Sub Header' })).not.toBe('header');
    expect(deriveSectionType({ id: 'x', name: '副标题' })).not.toBe('header');
    expect(deriveSectionType({ id: 'x', name: '子标题' })).not.toBe('header');
  });

  test('真正的面板标题栏 → 仍判 header', () => {
    expect(deriveSectionType({ id: '2:3550', name: 'header' })).toBe('header');
    expect(deriveSectionType({ id: 'x', name: '标题栏' })).toBe('header');
    expect(deriveSectionType({ id: 'x', name: 'titlebar' })).toBe('header');
    expect(deriveSectionType({ id: 'x', name: '页头' })).toBe('header');
  });

  test('业务类型正常匹配（stats/chart/tabs）', () => {
    expect(deriveSectionType({ id: 'x', name: '数据统计指标区' })).toBe('stats');
    expect(deriveSectionType({ id: 'x', name: '车型分布图表' })).toBe('chart');
    expect(deriveSectionType({ id: 'x', name: '标签页切换' })).toBe('tabs');
  });

  test('header-stats 复合词 → stats（顺序敏感不误判 header）', () => {
    expect(deriveSectionType({ id: 'x', name: 'header-stats' })).toBe('stats');
  });

  test('空 / 无匹配 → 空串', () => {
    expect(deriveSectionType({})).toBe('');
    expect(deriveSectionType({ id: 'x', name: 'foo' })).toBe('');
  });
});

describe('TYPE_KEYWORDS header 行已收窄', () => {
  test('header 关键词不再含 title/top/顶部/标题/头部', () => {
    const headerRow = TYPE_KEYWORDS.find(([t]) => t === 'header');
    expect(headerRow).toBeTruthy();
    const kws = headerRow[1];
    for (const banned of ['title', 'top', '顶部', '标题', '头部']) {
      expect(kws).not.toContain(banned);
    }
    expect(kws).toContain('header');
  });
});
