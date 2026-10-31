/**
 * 刀 5a（2026-09-13）：section type 推导 header 收窄。
 * 根因：旧 header 关键词 ['header','title','top','顶部','标题','头部'] 过宽，
 * 「小标题/sub-header/顶部/标题」等内容区小标题被误判 type=header → 确定性模板
 * 塞进 #header-right，与真正标题行 tabs 双轨 / 过拆（vehicle/traffic 实锤）。
 */
import { deriveSectionType, declaredTableHeaders, TYPE_KEYWORDS } from './section-type-derive.js';

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

  test('e7c4197c：显式 table 语义优先于 section-table 中的 tab 子串', () => {
    expect(deriveSectionType({ id: 'section-table', name: '设备列表', role: 'table' })).toBe('table');
    expect(deriveSectionType({
      id: 'section-table',
      body: { children: [{ role: 'table', control: 'table' }] },
    })).toBe('table');
    expect(deriveSectionType({ id: 'section-tabs', name: '标签页切换' })).toBe('tabs');
  });

  test('e99a736f：显式 control=table 与 body child type=table 均保持表格', () => {
    expect(deriveSectionType({ id: 'table-section', control: 'table' })).toBe('table');
    expect(deriveSectionType({
      id: 'table-section',
      body: { children: [{ type: 'table', headers: ['设备名称', '电量'] }] },
    })).toBe('table');
    expect(deriveSectionType({
      id: 'table-section', type: 'tabs',
      body: { headers: ['设备名称', '电量'] },
    })).toBe('table');
  });

  test('header-stats 复合词 → stats（顺序敏感不误判 header）', () => {
    expect(deriveSectionType({ id: 'x', name: 'header-stats' })).toBe('stats');
  });

  test('空 / 无匹配 → 空串', () => {
    expect(deriveSectionType({})).toBe('');
    expect(deriveSectionType({ id: 'x', name: 'foo' })).toBe('');
  });
});

describe('a100e890：footer-* 显式 id 前缀优先于 summary 关键词', () => {
  test('footer-summary（底部汇总）→ footer 而非 stats', () => {
    expect(deriveSectionType({ id: 'footer-summary', name: '底部汇总' })).toBe('footer');
    expect(deriveSectionType({ id: 'footer_bar', name: '底部信息' })).toBe('footer');
    // 阴性对照：无 footer 前缀的 summary 仍按关键词走 stats
    expect(deriveSectionType({ id: 'x', name: 'summary' })).toBe('stats');
    expect(deriveSectionType({ id: 'x', name: '概览' })).toBe('stats');
  });
});

describe('40b65d9f：按列声明的表头契约（body.children[].role=table-column + header）', () => {
  test('每列自带 header 文本 ⇒ 归一为表头数组', () => {
    const sec = {
      id: '43:4788',
      body: {
        children: [
          { id: 'a', role: 'table-column', header: '设备名称' },
          { id: 'b', role: 'table-column', header: '电量' },
          { id: 'c', role: 'table-column', header: '速度(m/s)' },
          { id: 'd', role: 'table-column', header: '启用状态' },
        ],
      },
    };
    expect(declaredTableHeaders(sec)).toEqual(['设备名称', '电量', '速度(m/s)', '启用状态']);
  });

  test('残缺列声明（缺 header / 缺 role）⇒ 不提升为表格契约（宁漏不误）', () => {
    expect(declaredTableHeaders({
      id: 'x',
      body: { children: [
        { role: 'table-column', header: '设备名称' },
        { role: 'table-column' },
      ] },
    })).toBeNull();
    expect(declaredTableHeaders({
      id: 'x',
      body: { children: [
        { role: 'table-column', header: '设备名称' },
        { header: '电量' },
      ] },
    })).toBeNull();
    expect(declaredTableHeaders({ id: 'x', body: { children: [] } })).toBeNull();
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
