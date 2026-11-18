/**
 * R1-c 图标资源占位段剔除 spec（2026-11-18 · 批量回归 A2/A4 段高错位实锤）
 *
 * 病根：vision 把统计图标（1:477 FRAME icon-statistics h24，body.children 全 icon）
 * 升格独立 section ⇒ 混进段集参与段高顺序配对 ⇒ 错位一位（tab 错拿 170px）。
 * 判据三条件：body.children 全 icon/image + (锚名 icon-* 或 薄条≤40) + 无业务内容。
 * 阴性：Tab 切换栏（tab 文本内容）、标题行（header.title）不剔。
 */
import { sanitizeVisionSections } from '../vision-section-sanitizer.js';

function makeFigma(withIcon477 = true) {
  const children: any[] = [
    { id: '1:412', name: 'sub-t', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 27 } },
    { id: '1:376', name: 'warning-list', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 60, width: 420, height: 170 } },
  ];
  if (withIcon477) {
    children.push({ id: '1:477', name: 'icon-statistics', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 } });
  }
  return { document: { id: '0:0', type: 'FRAME', name: 'root', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 240 }, children } };
}

const SECTIONS_WITH_ICON = [
  { id: '1:412', name: 'Tab切换栏', role: '常驻', header: { title: '' }, body: { layout: 'horizontal', children: [{ id: '2:1', type: 'tab', name: '全部' }, { id: '2:2', type: 'tab', name: '桥梁监测' }] } },
  { id: '1:376', name: 'warning-list', role: '常驻', header: { title: '' }, body: { layout: 'vertical', children: [{ id: '3:1', type: 'text', name: '卡片' }] } },
  { id: '1:477', name: '统计图标', role: '常驻', header: { title: '' }, body: { layout: 'horizontal', children: [{ figmaNode: '1:477', type: 'icon', name: '统计图标', resourceFile: 'icon-477.png' }] } },
];

describe('R1-c 图标资源占位段剔除', () => {
  test('P1 图标占位段（1:477）被剔除 ⇒ 段集回 2 段（修段高错位）', () => {
    const layout = { sections: JSON.parse(JSON.stringify(SECTIONS_WITH_ICON)) };
    const meta = { removed: [], reanchored: [] };
    const out = sanitizeVisionSections(layout as any, makeFigma(true) as any, meta);
    expect(meta.removed).toContain('1:477');
    expect(out.sections.map((s: any) => s.id)).toEqual(['1:412', '1:376']);
  });

  test('N1 Tab 切换栏（tab 文本内容，27px 薄条）不被剔', () => {
    const layout = { sections: JSON.parse(JSON.stringify([SECTIONS_WITH_ICON[0]])) };
    const meta = { removed: [], reanchored: [] };
    const out = sanitizeVisionSections(layout as any, makeFigma(false) as any, meta);
    expect(meta.removed).toEqual([]);
    expect(out.sections.length).toBe(1);
  });

  test('N2 header.title 有值的薄条段不被剔（标题行合法形态）', () => {
    const sections = [
      { id: '1:477', name: '统计图标', role: '常驻', header: { title: '今日累计' }, body: { layout: 'horizontal', children: [{ type: 'icon', name: 'icon', resourceFile: 'x.png' }] } },
    ];
    const layout = { sections: JSON.parse(JSON.stringify(sections)) };
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigma(true) as any, meta);
    expect(meta.removed).toEqual([]);
  });

  test('N3 body.children 含非 icon 类型（业务内容）⇒ 不剔', () => {
    const sections = [
      { id: '1:477', name: '统计图标', role: '常驻', header: { title: '' }, body: { layout: 'horizontal', children: [{ type: 'icon', name: 'i' }, { type: 'text', name: '数值' }] } },
    ];
    const layout = { sections: JSON.parse(JSON.stringify(sections)) };
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigma(true) as any, meta);
    expect(meta.removed).toEqual([]);
  });

  test('N4 无锚/无树 fail-open：图标段缺锚时不动（交给既有锚点校验链）', () => {
    const sections = [{ id: '9:999', name: '统计图标', body: { children: [{ type: 'icon' }] } }];
    const layout = { sections: JSON.parse(JSON.stringify(sections)) };
    const meta = { removed: [], reanchored: [] };
    sanitizeVisionSections(layout as any, makeFigma(false) as any, meta);
    // 9:999 不在树 ⇒ recordOf=null ⇒ iconThinStrip 的薄条分支不成立；且无 iconPlaceholderByName
    expect(meta.removed).toEqual([]);
  });


  test('P3 近方形图标盒（47.5×47.5 Mask group，E5 实锤形态）⇒ 剔除', () => {
    const figma = {
      document: {
        id: '0:0', type: 'FRAME', name: 'root',
        children: [
          { id: '136:120', name: 'header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 30 } },
          { id: '2:8023', name: 'cards', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 74 } },
          { id: '2:8061', name: 'Mask group', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 104, width: 47.5, height: 47.5 } },
        ],
      },
    };
    const sections = [
      { id: '136:120', name: 'header', role: '常驻', body: { layout: 'horizontal', children: [{ type: 'tab', name: 'Tab切换栏' }] } },
      { id: '2:8023', name: 'cards', role: '常驻', body: { layout: 'horizontal', children: [{ type: 'text', name: '超高车辆' }, { type: 'text', name: '危化品车' }] } },
      { id: '2:8061', name: '超高客车图标', role: '常驻', header: { title: '' }, body: { layout: 'horizontal', children: [{ type: 'icon', name: 'mask', resourceFile: 'mask.png' }] } },
    ];
    const layout = { sections: JSON.parse(JSON.stringify(sections)) };
    const meta = { removed: [], reanchored: [] };
    const out = sanitizeVisionSections(layout as any, figma as any, meta);
    expect(meta.removed).toContain('2:8061');
    expect(out.sections.map((s: any) => s.id)).toEqual(['136:120', '2:8023']);
  });

  test('P2 幂等：剔除后再跑零变化', () => {
    const run = () => {
      const layout = { sections: JSON.parse(JSON.stringify(SECTIONS_WITH_ICON)) };
      const meta = { removed: [], reanchored: [] };
      const out = sanitizeVisionSections(layout as any, makeFigma(true) as any, meta);
      return { ids: out.sections.map((s: any) => s.id), removed: meta.removed };
    };
    expect(run()).toEqual(run());
  });
});