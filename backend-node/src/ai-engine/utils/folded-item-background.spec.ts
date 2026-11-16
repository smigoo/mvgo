/**
 * 🛡️ S3-BG 折叠循环项背景归属绑定（2026-11-15 · mc-max-1794677281125-0fde9c29 实锤）
 *
 * 病灶：`2:8023` 三张同构卡折叠成 `136:129-list` 后，三张**不同**卡底图
 * （bg-125/124/126.png）没进 items ⇒ 刀 53 `itemBgStats.skipped=3` ⇒ 产物只有
 * 统一纯色 `fill:"#e8f0fe"`，三张真 bg 被资源兜底错挂到外层。
 *
 * 本单测锁死：按 ownerSectionId 唯一反查 → 每卡写回自己的 bg.resourceFile，
 * 且严格收窄（歧义/缺变量名/非折叠段一律不绑）。
 */
import {
  bindFoldedItemBackgrounds,
  collectFoldedOwnerIds,
  isFoldedListSection,
} from './folded-item-background.js';

const MAPPING = [
  {
    resourceFile: '../resources/images/bg-125.png',
    figmaNodeId: '136:125',
    ownerSectionId: '136:129',
    previewAnalysisRole: 'bg',
    recommendedUsage: 'backgroundBlock',
    downloadStatus: 'success',
    assignedVarName: 'bg1',
    figmaBox: { width: 140, height: 74 },
  },
  {
    resourceFile: '../resources/images/bg-124.png',
    figmaNodeId: '136:124',
    ownerSectionId: '136:128',
    previewAnalysisRole: 'bg',
    recommendedUsage: 'backgroundBlock',
    downloadStatus: 'success',
    assignedVarName: 'bg2',
    figmaBox: { width: 120, height: 74 },
  },
  {
    resourceFile: '../resources/images/bg-126.png',
    figmaNodeId: '136:126',
    ownerSectionId: '136:127',
    previewAnalysisRole: 'bg',
    recommendedUsage: 'backgroundBlock',
    downloadStatus: 'success',
    assignedVarName: 'bg3',
    figmaBox: { width: 141, height: 74 },
  },
];

const mkItem = (id: string, label: string) => ({
  id,
  figmaNode: id,
  bgPlaceholder: `card-bg-${id}`,
  repeatedFill: '#e8f0fe',
  icon: { resourceFile: `../resources/images/icon-${id}.png` },
  _vforData: { texts: [label], textStyles: [], resourceFiles: [`icon-${id}.png`] },
});

const mkSections = () => [
  {
    id: '2:8023',
    children: [
      {
        id: '136:129-list',
        collapsed: true,
        renderHint: 'v-for',
        itemCount: 3,
        _repeatContract: { members: ['136:129', '136:128', '136:127'] },
        items: [mkItem('136:129', '危化品车'), mkItem('136:128', '重型货车'), mkItem('136:127', '超高车辆')],
      },
    ],
  },
];

describe('S3-BG 折叠项逐卡背景绑定', () => {
  it('① 阳性：三张不同 bg 按 ownerSectionId 各自绑定，写入刀 53 declared 通道所需字段', () => {
    const sections = mkSections();
    const audit = bindFoldedItemBackgrounds(sections, MAPPING);
    const items = (sections[0].children[0] as any).items;
    expect(audit.bound).toBe(3);
    expect(audit.ambiguous).toBe(0);
    expect(audit.groups[0].bound).toBe(3);
    for (const [i, want] of [
      ['bg-125.png', 'bg1'],
      ['bg-124.png', 'bg2'],
      ['bg-126.png', 'bg3'],
    ].entries()) {
      const it = items[i];
      // `resourceFile` 必须与 mapping 逐字一致（detectListLeaf declared 通道按字符串比对）
      expect(it.bg.resourceFile).toBe(MAPPING[i].resourceFile);
      expect(it.bg.assignedVarName).toBe(want[1]);
      expect(it.bg.ownerSectionId).toBe(MAPPING[i].ownerSectionId);
      expect(it.backgroundImage.src).toBe(MAPPING[i].resourceFile);
      expect(it._vforData.resourceFiles).toContain(want[0]);
    }
    // 三张确实是三份不同资源，不是同一个纯色
    expect(new Set(items.map((x: any) => x.bg.resourceFile)).size).toBe(3);
    // `fill` 纯色真值不被覆盖
    expect(items[0].repeatedFill).toBe('#e8f0fe');
  });

  it('② 幂等：重复执行不重复写、不改值（alreadyBound=3）', () => {
    const sections = mkSections();
    bindFoldedItemBackgrounds(sections, MAPPING);
    const snapshot = JSON.stringify(sections);
    const second = bindFoldedItemBackgrounds(sections, MAPPING);
    expect(second.bound).toBe(0);
    expect(second.alreadyBound).toBe(3);
    expect(JSON.stringify(sections)).toBe(snapshot);
  });

  it('③ 阴性：mapping 缺 assignedVarName ⇒ fail-open 不臆造变量名', () => {
    const sections = mkSections();
    const bad = MAPPING.map(({ assignedVarName, ...rest }) => rest);
    const audit = bindFoldedItemBackgrounds(sections, bad);
    expect(audit.bound).toBe(0);
    expect((sections[0].children[0] as any).items[0].bg).toBeUndefined();
  });

  it('④ 阴性：非折叠段（无 collapsed/renderHint）⇒ 不动', () => {
    const sections: any = mkSections();
    delete sections[0].children[0].collapsed;
    delete sections[0].children[0].renderHint;
    expect(isFoldedListSection(sections[0].children[0])).toBe(false);
    const audit = bindFoldedItemBackgrounds(sections, MAPPING);
    expect(audit.checked).toBe(0);
    expect(audit.bound).toBe(0);
  });

  it('⑤ 歧义：同一 owner 有两条背景证据 ⇒ 不猜（ambiguous=1）', () => {
    const sections = mkSections();
    const dup = [...MAPPING, { ...MAPPING[0], resourceFile: '../resources/images/bg-999.png' }];
    const audit = bindFoldedItemBackgrounds(sections, dup);
    expect(audit.bound).toBe(2);
    expect(audit.ambiguous).toBe(1);
    expect((sections[0].children[0] as any).items[0].bg).toBeUndefined();
  });

  it('⑥ 双轨：sec.body.items 与 sec.items 是两份数组时同步补齐', () => {
    const sections: any = mkSections();
    const leaf = sections[0].children[0];
    leaf.body = {
      items: [mkItem('136:129', '危化品车'), mkItem('136:128', '重型货车'), mkItem('136:127', '超高车辆')],
    };
    bindFoldedItemBackgrounds(sections, MAPPING);
    expect(leaf.body.items.map((x: any) => x.bg.resourceFile)).toEqual(
      MAPPING.map((m) => m.resourceFile),
    );
  });

  it('⑦ collectFoldedOwnerIds：从 plan 对象取出三卡原锚点（供兜底跳过）', () => {
    const sections = mkSections();
    const ids = collectFoldedOwnerIds({ subComponentPlan: { effectiveSections: sections } });
    expect([...ids].sort()).toEqual(['136:127', '136:128', '136:129']);
    // 数组形态同样可用
    expect([...collectFoldedOwnerIds(sections)].sort()).toEqual(['136:127', '136:128', '136:129']);
  });

  it('⑧ 阴性：mapping 为空 / 非数组 ⇒ 零副作用', () => {
    const sections = mkSections();
    expect(bindFoldedItemBackgrounds(sections, []).bound).toBe(0);
    expect(bindFoldedItemBackgrounds(sections, null as any).bound).toBe(0);
  });

  it('⑨ P0-b 阳性：P0-a 上溯后 ownerSectionId 变 section，靠 ownerSectionOriginal 找回绑定', () => {
    const sections = mkSections();
    // 模拟 `resolveOwnerSectionToNearestSection` 的产物：ownerSectionId=最近 section，
    // ownerSectionOriginal=上溯前原值（= 卡项锚点）
    const normed = MAPPING.map((m) => ({
      ...m,
      ownerSectionOriginal: m.ownerSectionId,
      ownerSectionId: '2016:219',
      ownerSectionOrigin: 'ancestor',
    }));
    const audit = bindFoldedItemBackgrounds(sections, normed);
    const items = (sections[0].children[0] as any).items;
    expect(audit.bound).toBe(3);
    expect(audit.skipped).toBe(0);
    expect(audit.ambiguous).toBe(0);
    // 三处全靠原值命中 ⇒ 计数槽必须落 3（计数行铁律：0 也要能区分）
    expect(audit.matchedByOriginal).toBe(3);
    for (const [i, m] of MAPPING.entries()) {
      expect(items[i].bg.resourceFile).toBe(m.resourceFile);
    }
  });

  it('⑨b 阴性对照：剥掉 ownerSectionOriginal ⇒ 回到「恒不命中」（证明测试确实在测这条通路）', () => {
    const sections = mkSections();
    const normed = MAPPING.map((m) => ({
      ...m,
      ownerSectionId: '2016:219',
    }));
    const audit = bindFoldedItemBackgrounds(sections, normed);
    expect(audit.bound).toBe(0);
    expect(audit.skipped).toBe(3);
    expect(audit.matchedByOriginal).toBe(0);
  });

  it('⑩ 阴性：跨组不得泄漏 —— tab 条目的 ownerSectionOriginal 不能绑到 list 行', () => {
    const sections = mkSections();
    const mixed = [
      ...MAPPING.map((m) => ({ ...m, ownerSectionId: '2016:219', ownerSectionOriginal: m.ownerSectionId })),
      // tab 组的三个底图（key `1:413/1:425/1:437`），同样已上溯到同一 section
      { resourceFile: '../resources/images/bg-tab-1.png', figmaNodeId: '2016:215', ownerSectionId: '2016:219', ownerSectionOriginal: '1:413', previewAnalysisRole: 'bg', recommendedUsage: 'backgroundBlock', downloadStatus: 'success', assignedVarName: 'bgT1' },
      { resourceFile: '../resources/images/bg-tab-2.png', figmaNodeId: '2016:216', ownerSectionId: '2016:219', ownerSectionOriginal: '1:425', previewAnalysisRole: 'bg', recommendedUsage: 'backgroundBlock', downloadStatus: 'success', assignedVarName: 'bgT2' },
      { resourceFile: '../resources/images/bg-tab-3.png', figmaNodeId: '2016:217', ownerSectionId: '2016:219', ownerSectionOriginal: '1:437', previewAnalysisRole: 'bg', recommendedUsage: 'backgroundBlock', downloadStatus: 'success', assignedVarName: 'bgT3' },
    ];
    const audit = bindFoldedItemBackgrounds(sections, mixed);
    const items = (sections[0].children[0] as any).items;
    expect(audit.bound).toBe(3);
    expect(audit.ambiguous).toBe(0);
    // 每一行必须绑到自己的 list bg，绝不能借到 tab 底图
    const files = items.map((x: any) => x.bg.resourceFile);
    expect(files).toEqual(MAPPING.map((m) => m.resourceFile));
    expect(files.some((f: string) => /tab/.test(f))).toBe(false);
  });

  it('⑪ 阴性：ownerSectionOriginal 不在 item 锚集合内 ⇒ fail-open 留空', () => {
    const sections = mkSections();
    const foreign = MAPPING.map((m) => ({
      ...m,
      ownerSectionId: '2016:219',
      ownerSectionOriginal: '9:9999', // 与任何 item 锚都不相等
    }));
    const audit = bindFoldedItemBackgrounds(sections, foreign);
    expect(audit.bound).toBe(0);
    expect(audit.skipped).toBe(3);
  });
});
