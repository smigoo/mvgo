/**
 * 🔴 P0-1（2026-11-11 交接文档 L4）：flex 按 Figma layoutMode 真值注入。
 * 覆盖：buildSelectorLayoutModes 真值表（与 selectorChildCounts 同源对称）+
 * applySectionRootFlexTruth 段根双向（补缺失 / 移除误注）。
 * 实锤：418c3310 TabsSection 缺 display:flex 竖排；a2fcdff7 vendor-name 误注文字重叠。
 */
import { buildSelectorLayoutModes } from './figma-layout-facts.js';
import { applySectionRootFlexTruth } from '../validators/code-fix-rules.js';

describe('P0-1 buildSelectorLayoutModes（layoutMode 真值表）', () => {
  const fig = {
    document: {
      id: '0:0',
      children: [
        { id: '2:7955', name: 'tabs', type: 'FRAME', layoutMode: 'HORIZONTAL', children: [] },
        { id: '2:9000', name: 'vendor-name', type: 'FRAME', layoutMode: 'NONE', children: [] },
        { id: '2:9001', name: 'col', type: 'FRAME', layoutMode: 'VERTICAL', children: [] },
      ],
    },
  };

  it('① alignedSections 路径：按 sourceNodeIds 解析真值', () => {
    const r = buildSelectorLayoutModes(fig, [
      { cls: 'c-x-tab', sec: { sourceNodeIds: ['2:7955'] } },
      { cls: 'c-x-name', sec: { sourceNodeIds: ['2:9000'] } },
      { cls: 'c-x-col', sec: { sourceNodeIds: ['2:9001'] } },
      { cls: 'c-x-miss', sec: { sourceNodeIds: ['ghost:1'] } },
    ]);
    expect(r).toEqual({ 'c-x-tab': 'HORIZONTAL', 'c-x-name': 'NONE', 'c-x-col': 'VERTICAL' });
  });

  it('② 非法入参返回空表（不抛）', () => {
    expect(buildSelectorLayoutModes(null, null)).toEqual({});
  });
});

describe('P0-1 applySectionRootFlexTruth（段根双向）', () => {
  const fig = {
    document: {
      id: '0:0',
      children: [
        { id: '2:7955', name: 'tabs', type: 'FRAME', layoutMode: 'HORIZONTAL', children: [] },
        {
          id: '2:9000', name: 'vendor', type: 'FRAME', layoutMode: 'NONE',
          children: [{ id: 't1', type: 'TEXT', characters: '合作厂商' }],
        },
      ],
    },
  };
  const sections = [
    { id: '2:7955', sourceNodeIds: ['2:7955'] },
    { id: '2:9000', sourceNodeIds: ['2:9000'] },
  ];

  const mkFile = () => ({
    'package/components/TabsSection.vue':
      '<template><div data-section-id="2:7955" class="c-vehicle-monitor-tab">x</div></template>\n' +
      '<style>\n.c-vehicle-monitor-tab {\n  gap: 10px;\n  flex-shrink: 0;\n}\n</style>',
    'package/components/VendorSection.vue':
      '<template><span data-section-id="2:9000" class="c-a2fcdf-vendor-name">合作厂商</span></template>\n' +
      '<style>\n.c-a2fcdf-vendor-name {\n  display: flex;\n  flex-direction: column;\n  color: #333;\n}\n</style>',
  });

  it('① 补缺失：真值 HORIZONTAL + 类块缺 display ⇒ 注入真值方向 row', () => {
    const files = mkFile();
    const r = applySectionRootFlexTruth(files, sections, fig);
    expect(r.stats.flexInjected).toBe(1);
    const out = r.files['package/components/TabsSection.vue'];
    expect(out).toContain('display: flex;');
    expect(out).toContain('flex-direction: row;');
    // 幂等：再跑一次不再注入
    const r2 = applySectionRootFlexTruth(r.files, sections, fig);
    expect(r2.stats.flexInjected).toBe(0);
    expect(r2.stats.alreadyConform).toBeGreaterThanOrEqual(1);
  });

  it('② 移除误注：真值 NONE + 子树全 TEXT ⇒ 段根 display:flex 被剥', () => {
    const files = mkFile();
    const r = applySectionRootFlexTruth(files, sections, fig);
    expect(r.stats.flexRemoved).toBe(1);
    const out = r.files['package/components/VendorSection.vue'];
    expect(out).not.toContain('display: flex');
    expect(out).not.toContain('flex-direction: column');
    expect(out).toContain('color: #333'); // 其余声明保留
  });

  it('③ 无真值锚点计数（noTruth），不误改文件', () => {
    const files = mkFile();
    const r = applySectionRootFlexTruth(files, [{ id: 'ghost:9' }], fig);
    expect(r.stats.noTruth).toBe(1);
    expect(r.stats.flexInjected).toBe(0);
    expect(r.files['package/components/TabsSection.vue']).toBe(files['package/components/TabsSection.vue']);
  });

  it('④ 空入参安全（sections 空 / figma 缺失）', () => {
    const files = mkFile();
    expect(applySectionRootFlexTruth(files, [], null).stats.evaluated).toBe(0);
    expect(applySectionRootFlexTruth(files, sections, null).stats.evaluated).toBe(sections.length);
  });
});
