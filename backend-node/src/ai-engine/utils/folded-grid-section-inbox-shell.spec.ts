/**
 * 🛡️ S1-b / S1-c（2026-11-17 · mc-max-1794845346507-a8d1722c 实锤）
 *   段盒**内**标题行事实 + 段外壳（纯色底框）事实 + 二者共用的包装层渲染。
 *
 * 病灶（用户原话「三个厂商 list 段产物根直接 grid，无分组标题、无边框圆角外框」）：
 *   三段（`38:3137` / `38:3162` / `38:3206`）的段锚点是**整个分组 GROUP**
 *   （底框 RECTANGLE + 标题 TEXT + icon + 行带 FRAME 全在 GROUP 内），而
 *   `resolveSectionHeaderFacts` 的候选域只认「条在段盒**上方**」（`bottom <= anchorTop+2`）
 *   且只从 `sec.sourceNodeIds` 取候选 ⇒ 三段既无 sourceNodeIds、标题又在盒内
 *   ⇒ 恒 null ⇒ 产物段根**裸网格**，E2-v3（icon 零消费）/ C1b（标题缺席）/
 *   D1（分组塌陷）三码同源，日志却 `sectionHeaderOutOfBox=0/0`（观测假绿）。
 *
 * 本 spec 锁四件事：
 *   ① 阳性：盒内标题**逐字等于** header.title 且在顶部带内 ⇒ 取到事实（含 icon 与几何）；
 *   ② 阴性：标题在带外 / 文本不等 / 无 header.title ⇒ null（fail-open 零回归）；
 *   ③ 阳性：与段盒完全同盒的 RECTANGLE 纯色底框 ⇒ 取到 background + borderRadius；
 *   ④ 阴性：包装层在「无段头无外壳」时**逐字不变**；有外壳无段头时不产 header 行。
 */
import {
  resolveSectionHeaderFacts,
  resolveSectionShellBg,
  applySectionHeader,
} from './folded-grid-section-takeover.js';

/** 本单真值（`mc-max-1794845346507-a8d1722c` 的 38:3137 子树，逐值取真机）。 */
const SEC_BOX = { x: 26894, y: 51592, width: 604, height: 161 };

const textNode = (over: Record<string, any> = {}) => ({
  id: '38:3139',
  type: 'TEXT',
  characters: '战略合作厂商',
  absoluteBoundingBox: { x: 26938, y: 51617, width: 96, height: 16 },
  style: { fontSize: 16, fontWeight: 500 },
  fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
  ...over,
});

const buildIndex = (over: Record<string, any> = {}) => {
  const rect = {
    id: '38:3138',
    type: 'RECTANGLE',
    absoluteBoundingBox: { ...SEC_BOX },
    fills: [
      {
        type: 'SOLID',
        visible: true,
        color: { r: 0.8879582285881042, g: 0.8138772249221802, b: 0.5175531506538391, a: 1 },
        opacity: 0.20000000298023224,
      },
    ],
    cornerRadius: 12,
  };
  const band1 = { id: '38:3140', type: 'FRAME', absoluteBoundingBox: { x: 26914, y: 51649, width: 564, height: 30 } };
  const band2 = { id: '38:3153', type: 'FRAME', absoluteBoundingBox: { x: 26914, y: 51699, width: 272, height: 30 } };
  const icon = { id: '38:3160', type: 'FRAME', absoluteBoundingBox: { x: 26914, y: 51617, width: 16, height: 16 } };
  const txt = over.text || textNode();
  return new Map<string, any>([
    ['38:3134', { rawNode: { id: '38:3134', type: 'FRAME' }, bbox: { x: 26866, y: 51431, width: 660, height: 868 } }],
    ['796:3', { rawNode: { id: '796:3', type: 'GROUP' }, bbox: { x: 26894, y: 51483, width: 604, height: 787 }, parentId: '38:3134' }],
    ['38:3137', { rawNode: { id: '38:3137', type: 'GROUP' }, bbox: { ...SEC_BOX }, parentId: '796:3' }],
    ['38:3138', { rawNode: rect, bbox: rect.absoluteBoundingBox, parentId: '38:3137' }],
    ['38:3139', { rawNode: txt, bbox: txt.absoluteBoundingBox, parentId: '38:3137' }],
    ['38:3140', { rawNode: band1, bbox: band1.absoluteBoundingBox, parentId: '38:3137' }],
    ['38:3153', { rawNode: band2, bbox: band2.absoluteBoundingBox, parentId: '38:3137' }],
    ['38:3160', { rawNode: icon, bbox: icon.absoluteBoundingBox, parentId: '38:3137' }],
  ]);
};

const RES_MAP = [
  {
    resourceFile: '../resources/images/icon-战略厂商-3160.png',
    figmaNodeId: '38:3160',
    ownerSectionId: '38:3137',
    assignedVarName: 'icon4',
    figmaBox: { x: 26914, y: 51617, width: 16, height: 16 },
  },
];

const sec = (over: Record<string, any> = {}) => ({
  id: '38:3137',
  header: { title: '战略合作厂商', controls: [] },
  collapsed: true,
  absoluteBoundingBox: { ...SEC_BOX },
  styles: { figmaHeightPx: 161 },
  ...over,
});

describe('S1-b 段盒内标题行事实', () => {
  it('阳性：盒内标题逐字一致 + 顶部带内 ⇒ 取到事实（含 icon 与全部几何真值）', () => {
    const stats: any = { evaluated: 0, outOfBox: 0, inBox: 0 };
    const hdr: any = resolveSectionHeaderFacts(sec(), buildIndex(), stats, RES_MAP);
    expect(hdr).toMatchObject({
      title: '战略合作厂商',
      height: 16,
      gap: 16, // 51649（首个行带顶） − 51633（标题底）
      fontSize: 16,
      fontWeight: 500,
      paddingLeft: 44, // 26938 − 26894
      stripId: '38:3139',
      inBox: true,
    });
    // icon：与标题垂直重叠 + 资源映射给了模块变量名（16×16，右距 26938−26930=8）
    expect(hdr.icon).toEqual({
      varName: 'icon4',
      file: 'icon-战略厂商-3160.png',
      w: 16,
      h: 16,
      gap: 8,
    });
    // 盒内形态**不进** S1-a 的盒比对 ⇒ evaluated 保持 0，inBox 单独计
    expect(stats).toEqual({ evaluated: 0, outOfBox: 0, inBox: 1 });
  });

  it('阴性：标题落在顶部带之外（内容区文本）⇒ null（不把内容当段头）', () => {
    const idx = buildIndex({
      text: textNode({ absoluteBoundingBox: { x: 26938, y: 51680, width: 96, height: 16 } }),
    });
    const stats: any = { evaluated: 0, outOfBox: 0, inBox: 0 };
    expect(resolveSectionHeaderFacts(sec(), idx, stats, RES_MAP)).toBeNull();
    expect(stats.inBox).toBe(0);
  });

  it('阴性：文本不逐字等于 header.title ⇒ null（不做包含匹配）', () => {
    const idx = buildIndex({
      text: textNode({ characters: '战略合作厂商（共 6 家）' }),
    });
    expect(resolveSectionHeaderFacts(sec(), idx, undefined, RES_MAP)).toBeNull();
  });

  it('阴性：段没有 header.title ⇒ null（不进盒内分支）', () => {
    expect(resolveSectionHeaderFacts(sec({ header: {} }), buildIndex(), undefined, RES_MAP)).toBeNull();
  });

  it('阴性：不传 resourceMapping ⇒ 段头仍取到，但 icon 为 null（零侵入）', () => {
    const hdr: any = resolveSectionHeaderFacts(sec(), buildIndex(), undefined);
    expect(hdr).not.toBeNull();
    expect(hdr.icon).toBeNull();
  });
});

describe('S1-c 段外壳（纯色底框）事实', () => {
  it('阳性：与段盒完全同盒的 RECTANGLE 纯色填充 ⇒ background + borderRadius', () => {
    expect(resolveSectionShellBg(sec(), buildIndex())).toEqual({
      background: 'rgba(226, 208, 132, 0.2)',
      borderRadius: 12,
      nodeId: '38:3138',
    });
  });

  it('阴性：底框比段盒小（不是外壳）⇒ null', () => {
    const idx = buildIndex();
    const rect: any = idx.get('38:3138');
    rect.bbox = { x: 26914, y: 51649, width: 564, height: 30 };
    rect.rawNode.absoluteBoundingBox = rect.bbox;
    expect(resolveSectionShellBg(sec(), idx)).toBeNull();
  });

  it('阴性：段锚点不在索引里 ⇒ null（fail-open）', () => {
    expect(resolveSectionShellBg(sec({ id: '99:99' }), buildIndex())).toBeNull();
  });
});

describe('S1-b/c 包装层渲染（applySectionHeader）', () => {
  const body = [
    '<template>',
    '  <div data-section-id="38:3137" class="c-a8d172-fg-grid-383137" style="display:grid;">',
    '    <div class="c-a8d172-fg-grid-383137-card"><span>{{ it.text }}</span></div>',
    '  </div>',
    '</template>',
    '',
    '<script setup>',
    'const items = [];',
    '</script>',
  ].join('\n');

  const trOf = (over: Record<string, any> = {}) => ({
    kind: 'grid',
    sectionId: '38:3137',
    semantic: 'a8d172',
    ...over,
  });

  it('阳性：段头 + icon + 段外壳 ⇒ 三样同时落进模板，原根降为 flex:1', () => {
    const hdr: any = resolveSectionHeaderFacts(sec(), buildIndex(), undefined, RES_MAP);
    const out = applySectionHeader(body, trOf({ header: hdr, sectionBg: resolveSectionShellBg(sec(), buildIndex()) }), 'a8d172');
    // 外壳层：类名含 -fg-header-（M5-7 豁免口径）+ 真值背景/圆角
    expect(out).toContain('class="c-a8d172-fg-header-383137"');
    expect(out).toContain('background:rgba(226, 208, 132, 0.2);');
    expect(out).toContain('border-radius:12px;');
    // 段头行：高度/左内距/下间距全部真值
    expect(out).toContain('data-section-header="38:3137"');
    expect(out).toContain('height:16px;flex:none;display:flex;align-items:center;padding-left:44px;margin-bottom:16px;');
    expect(out).toContain('>战略合作厂商</span>');
    // icon：真值尺寸 + 右距 + 模块变量绑定
    expect(out).toContain(':src="icon4"');
    expect(out).toContain('width:16px;height:16px;flex:none;object-fit:contain;margin-right:8px;');
    // import 注入在 script 开标签之后
    expect(out).toContain("import icon4 from '../../resources/images/icon-战略厂商-3160.png'");
    expect(out.indexOf("import icon4 from")).toBeGreaterThan(out.indexOf('<script setup>'));
    // 原根降为 body
    expect(out).toContain('style="flex:1;min-height:0;display:grid;"');
  });

  it('阴性：无段头无外壳 ⇒ 逐字返回（零回归硬约束）', () => {
    expect(applySectionHeader(body, trOf(), 'a8d172')).toBe(body);
  });

  it('阴性：只有外壳无段头 ⇒ 包装但不产 header 行、不写 height:100%', () => {
    const out = applySectionHeader(body, trOf({ sectionBg: resolveSectionShellBg(sec(), buildIndex()) }), 'a8d172');
    expect(out).toContain('background:rgba(226, 208, 132, 0.2);');
    expect(out).not.toContain('data-section-header');
    expect(out).not.toContain('height:100%;');
    expect(out).toContain('style="flex:1;min-height:0;display:grid;"');
  });

  it('阴性：kind 不在渲染域内 ⇒ 逐字返回（不改 statrow/table 等既有形态）', () => {
    const hdr: any = resolveSectionHeaderFacts(sec(), buildIndex(), undefined, RES_MAP);
    expect(applySectionHeader(body, trOf({ kind: 'table', header: hdr }), 'a8d172')).toBe(body);
  });
});
