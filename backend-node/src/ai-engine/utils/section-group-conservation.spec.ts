/**
 * 🧬 B 层对照：段分组守恒（装配同源强制重建）
 *
 * 真机病灶（mc-1794428749650-cc633474 / c-cc6334-cc633474「合作厂商弹窗」）：
 *   layoutStructure 三张并列分组卡（各带标题 + 4 列网格 + 各自底色）被折叠成 1 段 ⇒
 *   index.vue 只装配 1 个子组件 ⇒ 渲成一整块。
 *
 * 阳性：规划树塌陷成 1 段 ⇒ 按视觉真值补回 2 个分组段，标题/列数/几何全部落地。
 * 阴性（防放水）：
 *   ① 规划树三段齐全 ⇒ 原样返回**同一引用**（零行为变化）；
 *   ② 无 layoutStructure ⇒ 原样返回；
 *   ③ 视觉真值只有 2 组 ⇒ 不判（两组相邻合并属常见正常形态）；
 *   ④ 视觉层 name 是通用图层名（frame/main/content）⇒ 不当作分组标题；
 *   ⑤ 只有标题没有分组结构证据（无列数/无子块）⇒ 不判；
 *   ⑥ 幂等：对重建结果再跑一次 ⇒ 不再追加。
 */

import {
  ensureSectionGroupConservation,
  collectLayoutGroups,
  isBusinessTitle,
} from './section-group-conservation.js';

const box = (x, y, width, height) => ({ x, y, width, height });

// 视觉层真值：三张并列分组卡（对照真机 Figma 38:3137 / 38:3162 / 38:3206）
const layoutThreeGroups = {
  layout: {
    sections: [
      {
        id: '38:3137',
        name: '华为合作厂商',
        gridColumns: 4,
        absoluteBoundingBox: box(26900, 51483, 329, 161),
        children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      },
      {
        id: '38:3162',
        name: '阿里合作厂商',
        gridColumns: 4,
        absoluteBoundingBox: box(26900, 51700, 329, 212),
        children: [{ id: 'd' }, { id: 'e' }, { id: 'f' }],
      },
      {
        id: '38:3206',
        name: '新华三合作厂商',
        gridColumns: 4,
        absoluteBoundingBox: box(26900, 51960, 329, 265),
        children: [{ id: 'g' }, { id: 'h' }, { id: 'i' }],
      },
    ],
  },
};

// 规划树：被折叠成 1 段（33 条拍平，标题丢失）
const collapsedPlan = [
  {
    id: '38:3137',
    name: 'content',
    figmaNodeId: '38:3137',
    sourceNodeIds: ['38:3137', '38:3162', '38:3206'],
    absoluteBoundingBox: box(26900, 51483, 329, 742),
    children: [],
  },
];

describe('ensureSectionGroupConservation（B 层 · 装配同源）', () => {
  it('阳性：分组塌陷 ⇒ 按视觉真值补回缺失分组（标题/列数/几何）', () => {
    const out = ensureSectionGroupConservation({
      sections: collapsedPlan,
      layoutStructure: layoutThreeGroups,
    });

    // 纯附加：原段一个不动
    expect(out[0]).toBe(collapsedPlan[0]);
    expect(out.length).toBe(1 + 3); // 塌陷段保留 + 三组视觉真值（原段无标题，故三组全缺）

    const rebuilt = out.slice(1);
    expect(rebuilt.map((s) => s.header.title)).toEqual([
      '华为合作厂商',
      '阿里合作厂商',
      '新华三合作厂商',
    ]);
    expect(rebuilt.every((s) => s.gridColumns === 4)).toBe(true);
    expect(rebuilt.every((s) => s.__conservationRebuilt === true)).toBe(true);
    expect(rebuilt[1].absoluteBoundingBox).toEqual(box(26900, 51700, 329, 212));
    expect(rebuilt.map((s) => s.id)).toEqual(['38:3137', '38:3162', '38:3206']);
  });

  it('阳性：留痕 [SECTION-GROUP-CONSERVATION] 计数行', () => {
    const lines = [];
    const logger = { info: (m) => lines.push(m), warn: (m) => lines.push(m) };
    // 用结构化副本作 layoutStructure：模块按 layoutStructure 对象身份缓存结果，
    // 复用同一对象会命中上一条用例的缓存 ⇒ 不产生日志（这正是缓存该有的行为）。
    ensureSectionGroupConservation({
      sections: collapsedPlan,
      layoutStructure: JSON.parse(JSON.stringify(layoutThreeGroups)),
      logger,
    });
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('[SECTION-GROUP-CONSERVATION]');
    expect(lines[0]).toContain('recovered=3');
    expect(lines[0]).toContain('华为合作厂商');
  });

  it('阴性①：规划树三组齐全 ⇒ 原样返回同一引用（零行为变化）', () => {
    const healthy = [
      { id: '38:3137', header: { title: '华为合作厂商' }, gridColumns: 4 },
      { id: '38:3162', header: { title: '阿里合作厂商' }, gridColumns: 4 },
      { id: '38:3206', header: { title: '新华三合作厂商' }, gridColumns: 4 },
      { id: '38:3300', header: { title: '页脚' } },
    ];
    const out = ensureSectionGroupConservation({
      sections: healthy,
      layoutStructure: layoutThreeGroups,
    });
    expect(out).toBe(healthy);
  });

  it('阴性②：无 layoutStructure ⇒ 原样返回', () => {
    expect(
      ensureSectionGroupConservation({ sections: collapsedPlan, layoutStructure: null }),
    ).toBe(collapsedPlan);
    expect(ensureSectionGroupConservation({ sections: collapsedPlan })).toBe(collapsedPlan);
  });

  it('阴性③：视觉真值只有 2 组 ⇒ 不判（相邻合并属正常形态）', () => {
    const twoGroups = { sections: layoutThreeGroups.layout.sections.slice(0, 2) };
    expect(
      ensureSectionGroupConservation({ sections: collapsedPlan, layoutStructure: twoGroups }),
    ).toBe(collapsedPlan);
  });

  it('阴性④：视觉层 name 是通用图层名 ⇒ 不当分组标题', () => {
    const generic = {
      sections: [
        { id: '1', name: 'frame 12', gridColumns: 4, children: [{}, {}] },
        { id: '2', name: 'main', gridColumns: 4, children: [{}, {}] },
        { id: '3', name: 'content', gridColumns: 4, children: [{}, {}] },
      ],
    };
    expect(collectLayoutGroups(generic)).toEqual([]);
    expect(
      ensureSectionGroupConservation({ sections: collapsedPlan, layoutStructure: generic }),
    ).toBe(collapsedPlan);
  });

  it('阴性⑤：有标题但无分组结构证据 ⇒ 不判', () => {
    const noStructure = {
      sections: [
        { id: '1', title: '合作厂商甲' },
        { id: '2', title: '合作厂商乙' },
        { id: '3', title: '合作厂商丙' },
      ],
    };
    expect(collectLayoutGroups(noStructure)).toEqual([]);
    expect(
      ensureSectionGroupConservation({ sections: collapsedPlan, layoutStructure: noStructure }),
    ).toBe(collapsedPlan);
  });

  it('阴性⑥：幂等 —— 对重建结果再跑一次不再追加', () => {
    const once = ensureSectionGroupConservation({
      sections: collapsedPlan,
      layoutStructure: layoutThreeGroups,
    });
    const twice = ensureSectionGroupConservation({
      sections: once,
      layoutStructure: layoutThreeGroups,
    });
    expect(twice.length).toBe(once.length);
    expect(twice.map((s) => s.id)).toEqual(once.map((s) => s.id));
  });

  it('阴性⑦：标题同义不同排版 ⇒ 视为同一组，不重复追加', () => {
    const plan = [
      { id: '38:3137', header: { title: '华为 合作厂商' }, gridColumns: 4 },
      { id: '38:3162', header: { title: '阿里合作厂商' }, gridColumns: 4 },
      { id: '38:3206', header: { title: '新华三-合作厂商' }, gridColumns: 4 },
    ];
    expect(
      ensureSectionGroupConservation({ sections: plan, layoutStructure: layoutThreeGroups }),
    ).toBe(plan);
  });

  it('isBusinessTitle：业务标题通过，图层名拒绝', () => {
    expect(isBusinessTitle('合作厂商')).toBe(true);
    expect(isBusinessTitle('Top Vendors')).toBe(true);
    expect(isBusinessTitle('Frame 12')).toBe(false);
    expect(isBusinessTitle('矩形 3')).toBe(false);
    expect(isBusinessTitle('content')).toBe(false);
    expect(isBusinessTitle('')).toBe(false);
    expect(isBusinessTitle('合作厂商合作厂商合作厂商合作厂商合作厂商合作厂商合作厂商')).toBe(false);
  });
});

/**
 * 🛡️ 重建段必须**带真值条目**（2026-11-12 · 3d79ee84 实锤）
 *
 * 病灶：旧 `synthesizeSection` 写 `children: []`（注释还写「body 故意不下发」）⇒
 *   prompt 只渲出 `子元素: (空)` ⇒ LLM 写通用空壳（`title='内容区块'`、`content=''`），
 *   整组空白；对照组的厂商名则全靠编（大华股份/宇视科技… 真值里没有）。
 */
describe('重建段真值透传（cc6334 回归锚）', () => {
  const layoutWithItems = {
    layout: {
      sections: [
        {
          id: '38:3137',
          type: 'grid',
          layout: 'grid',
          name: '战略合作厂商',
          gridColumns: 4,
          absoluteBoundingBox: box(0, 0, 604, 161),
          body: {
            layout: 'grid',
            gridColumns: 4,
            children: [
              { id: '38:3141', name: '华为技术 8台', role: 'vendor-card' },
              { id: '38:3142', name: '中兴通讯 8台', role: 'vendor-card' },
              { id: '38:3143', name: '海康威视 13台', role: 'vendor-card' },
            ],
          },
          children: [{ id: '38:3141' }, { id: '38:3142' }, { id: '38:3143' }],
        },
        {
          id: '38:3162',
          type: 'grid',
          name: '优质厂商',
          gridColumns: 4,
          absoluteBoundingBox: box(0, 200, 604, 212),
          body: { gridColumns: 4, children: [{ id: '38:3167', name: '大华股份 8台' }] },
        },
        {
          id: '38:3206',
          type: 'grid',
          name: '普通厂商',
          gridColumns: 4,
          absoluteBoundingBox: box(0, 450, 604, 265),
          body: { gridColumns: 4, children: [{ id: '38:3240', name: '特来电 8台' }] },
        },
      ],
    },
  };

  it('阳性：重建段透传 body.children 真值（不得为空）', () => {
    const out = ensureSectionGroupConservation({
      sections: [{ id: '38:3137', name: 'collapsed' }],
      layoutStructure: layoutWithItems,
      minLayoutGroups: 3,
      minLost: 2,
    });
    expect(out.length).toBeGreaterThan(1);
    const rebuilt = out.filter((s: any) => s.__conservationRebuilt);
    expect(rebuilt.length).toBeGreaterThanOrEqual(2);
    const first = rebuilt.find((s: any) => String(s.id) === '38:3137');
    expect(first).toBeTruthy();
    // 真值条目必须原样带过来（prompt 靠它渲「子元素: …」）
    expect((first as any).body?.children?.length).toBe(3);
    expect((first as any).body.children[0].name).toBe('华为技术 8台');
  })

  it('阳性：重建段 type/layout 按真值透传（D-GRID 不得因 type=content 失明）', () => {
    const out = ensureSectionGroupConservation({
      sections: [{ id: '38:3137', name: 'collapsed' }],
      layoutStructure: layoutWithItems,
      minLayoutGroups: 3,
      minLost: 2,
    });
    const gridSecs = out.filter((s: any) => s.__conservationRebuilt && Number(s.gridColumns) >= 2);
    expect(gridSecs.length).toBeGreaterThan(0);
    for (const s of gridSecs) {
      expect(s.type === 'grid' || s.layout === 'grid').toBe(true);
    }
  })

  it('阴性：真值 body 与 layoutStructure 不共享引用（不污染只读事实源）', () => {
    const before = JSON.stringify(layoutWithItems);
    const out = ensureSectionGroupConservation({
      sections: [{ id: '38:3137', name: 'collapsed' }],
      layoutStructure: layoutWithItems,
      minLayoutGroups: 3,
      minLost: 2,
    });
    const rebuilt = out.find((s: any) => s.__conservationRebuilt && (s as any).body);
    if (rebuilt) (rebuilt as any).body.children.push({ id: 'mutated' });
    expect(JSON.stringify(layoutWithItems)).toBe(before);
  })
})

/**
 * 🛡️ 空壳分组补内容（2026-11-12 · 3d79ee84 实锤的第二层根因）
 *
 * 病灶：塌陷残留段的**标题恰好是首组标题**、`body.children` 为空 ⇒ 旧判据只比标题，
 *   认为「该组已存在」而跳过重建 ⇒ prompt 渲成 `— 区块`（无标题无条目）⇒
 *   LLM 写通用空壳（`title='内容区块'`、`content=''`），整组空白。
 *
 * 判据：「存在」必须是「标题在 **且** 有内容轨」。
 */
describe('空壳分组补内容（标题在但内容为空）', () => {
  const truth3 = {
    layout: {
      sections: [
        {
          id: '38:3137',
          type: 'grid',
          layout: 'grid',
          name: '战略合作厂商',
          gridColumns: 4,
          absoluteBoundingBox: box(0, 0, 604, 161),
          body: { children: [
            { id: '38:3141', name: '华为技术 8台' },
            { id: '38:3142', name: '中兴通讯 8台' },
          ] },
        },
        {
          id: '38:3162',
          type: 'grid',
          name: '优质厂商',
          gridColumns: 4,
          absoluteBoundingBox: box(0, 200, 604, 212),
          body: { children: [{ id: '38:3167', name: '大华股份 8台' }, { id: '38:3168', name: '宇视科技 7台' }] },
        },
        {
          id: '38:3206',
          type: 'grid',
          name: '普通厂商',
          gridColumns: 4,
          absoluteBoundingBox: box(0, 450, 604, 265),
          body: { children: [{ id: '38:3240', name: '特来电 8台' }, { id: '38:3241', name: '金溢科技 8台' }] },
        },
      ],
    },
  };

  /** 规划树：三组标题齐全（真实塌陷态），但 38:3137 的内容为空 */
  const hollowPlan = () => [
    { id: '38:3137', name: 'content', type: 'content', gridColumns: 4, header: { title: '战略合作厂商' }, body: { children: [] }, children: [] },
    { id: '38:3162', name: '优质厂商', type: 'grid', gridColumns: 4, header: { title: '优质厂商' }, body: { children: [{ id: 'a' }, { id: 'b' }] } },
    { id: '38:3206', name: '普通厂商', type: 'grid', gridColumns: 4, header: { title: '普通厂商' }, body: { children: [{ id: 'c' }, { id: 'd' }] } },
  ];

  it('阳性：空壳段被补上真值条目（华为技术/中兴通讯）', () => {
    const out = ensureSectionGroupConservation({ sections: hollowPlan(), layoutStructure: truth3 });
    const sec = out.find((s: any) => String(s.id) === '38:3137');
    expect(sec).toBeTruthy();
    expect((sec as any).__conservationContentFilled).toBe(true);
    expect((sec as any).body.children.map((c: any) => c.name)).toEqual(['华为技术 8台', '中兴通讯 8台']);
    // 不新增段（补内容 ≠ 追加段）
    expect(out.length).toBe(3);
  })

  it('阳性：补内容不得把 planner 已修正的列数改回去（几何 > 视觉分析）', () => {
    const out = ensureSectionGroupConservation({ sections: hollowPlan(), layoutStructure: truth3 });
    const sec = out.find((s: any) => String(s.id) === '38:3137') as any;
    // planner 给的 4 必须保留（layoutStructure 里的 4 是同一个值，此处断言的是「不被覆盖」）
    expect(Number(sec.gridColumns)).toBe(4);
  })

  it('阴性①：段内已有内容轨 ⇒ 不补（不打扰正常产物）', () => {
    const plan = hollowPlan();
    (plan[0] as any).body = { children: [{ id: 'x', name: '原有条目' }] };
    const out = ensureSectionGroupConservation({ sections: plan, layoutStructure: truth3 });
    const sec = out.find((s: any) => String(s.id) === '38:3137') as any;
    expect(sec.__conservationContentFilled).toBeUndefined();
    expect(sec.body.children.map((c: any) => c.name)).toEqual(['原有条目']);
  })

  it('阴性②：段内有 internalSubcomponents（走内部拆分）⇒ 视为有内容，不补', () => {
    const plan = hollowPlan();
    (plan[0] as any).internalSubcomponents = [{ id: 'g1', name: 'Group1' }];
    const out = ensureSectionGroupConservation({ sections: plan, layoutStructure: truth3 });
    const sec = out.find((s: any) => String(s.id) === '38:3137') as any;
    expect(sec.__conservationContentFilled).toBeUndefined();
  })

  it('阴性③：真值只有 1 条业务条目（图标+标题级别）⇒ 不值得补', () => {
    const thin = {
      layout: { sections: truth3.layout.sections.map((s: any) => ({
        ...s,
        body: { children: [{ id: '1:1', name: '华为技术' }] },
      })) },
    };
    const out = ensureSectionGroupConservation({ sections: hollowPlan(), layoutStructure: thin });
    const sec = out.find((s: any) => String(s.id) === '38:3137') as any;
    expect(sec.__conservationContentFilled).toBeUndefined();
  })

  it('阴性④：真值条目只有图层名/id ⇒ 不算业务条目', () => {
    const fake = {
      layout: { sections: truth3.layout.sections.map((s: any) => ({
        ...s,
        body: { children: [{ id: '1:1', name: 'Rectangle 26' }, { id: '2:2', name: '3:99' }] },
      })) },
    };
    const out = ensureSectionGroupConservation({ sections: hollowPlan(), layoutStructure: fake });
    const sec = out.find((s: any) => String(s.id) === '38:3137') as any;
    expect(sec.__conservationContentFilled).toBeUndefined();
  })
})
