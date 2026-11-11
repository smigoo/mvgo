/**
 * section-coverage 判据契约（2026-11-11 · 74722f0f 实锤）
 *
 * 判据定位：**纯观测**。只回答「段清单覆盖了父容器的多少版面」，不改写、不拦截。
 * 阈值 SECTION_COVERAGE_RATIO_MIN = 0.55 来自 68 个已落盘任务的离线回算分布。
 */
import {
  liftSectionAnchorsByContentRange,
  mergeCollidedSections,
  mergeChildHeaderSections,
  auditSectionCoverage,
  SECTION_COVERAGE_RATIO_MIN,
} from '../section-plan-coverage.js';

/** 构造 Figma 树：root > cpFrame > [children...] */
const buildFigma = (children, parentBox = { width: 425, height: 807 }) => ({
  document: {
    id: '0:0',
    type: 'DOCUMENT',
    children: [
      {
        id: 'cp:1',
        type: 'FRAME',
        name: 'cp-component',
        absoluteBoundingBox: { x: 0, y: 0, ...parentBox },
        children,
      },
    ],
  },
});

const box = (id, name, h, w = 425) => ({
  id,
  name,
  type: 'FRAME',
  absoluteBoundingBox: { x: 0, y: 0, width: w, height: h },
  children: [],
});

describe('section-coverage 判据（纯观测）', () => {
  it('阈值常量应为 0.55（离线回算分布：好样本 min 0.707 / 最坏 0.432）', () => {
    expect(SECTION_COVERAGE_RATIO_MIN).toBe(0.55);
  });

  it('阳性：74722f0f 形态——3 段合计 349px 覆盖 807px 容器，556px slot 未进段清单 ⇒ ratio≈0.432 incomplete', () => {
    const figma = buildFigma([
      box('2:3550', 'header-', 33),
      box('2:3438', '车型分布', 142),
      box('83:30', '流量预测', 174),
      box('88:33', 'slot-当日总流量', 556, 426),
    ]);
    const sections = [
      { id: '2:3550', name: 'header-', styles: { figmaHeightPx: 33 } },
      { id: '2:3438', name: '车型分布', styles: { figmaHeightPx: 142 } },
      { id: '83:30', name: '流量预测', styles: { figmaHeightPx: 174 } },
    ];
    const r = auditSectionCoverage({ sections, figmaNodeData: figma });
    expect(r.evaluated).toBe(true);
    expect(r.ratio).toBeCloseTo(349 / 807, 3);
    expect(r.coveredPx).toBe(349);
    expect(r.containerPx).toBe(807);
    expect(r.containerId).toBe('cp:1');
    expect(r.verdict).toBe('incomplete');
  });

  it('阴性（防误杀）：cfa7136d 形态——2 段 104px / 147px ≈ 0.707 ⇒ pass（阈值 0.55 不误杀好样本）', () => {
    const figma = buildFigma(
      [box('2:7954', 'tabs', 52), box('2:7959', 'sub-header', 52)],
      { width: 425, height: 147 },
    );
    const sections = [
      { id: '2:7954', name: 'tabs', styles: { figmaHeightPx: 52 } },
      { id: '2:7959', name: 'sub-header', styles: { figmaHeightPx: 52 } },
    ];
    const r = auditSectionCoverage({ sections, figmaNodeData: figma });
    expect(r.evaluated).toBe(true);
    expect(r.ratio).toBeCloseTo(104 / 147, 3);
    expect(r.verdict).toBe('pass');
  });

  it('阴性：段高全部覆盖容器（ratio≥1）⇒ pass', () => {
    const figma = buildFigma([box('a', 's1', 200), box('b', 's2', 300)], {
      width: 425,
      height: 500,
    });
    const sections = [
      { id: 'a', styles: { figmaHeightPx: 200 } },
      { id: 'b', styles: { figmaHeightPx: 300 } },
    ];
    const r = auditSectionCoverage({ sections, figmaNodeData: figma });
    expect(r.ratio).toBeCloseTo(1, 3);
    expect(r.verdict).toBe('pass');
  });

  it('嵌套防护：父段与子段同时在清单里时只计父段，不重复计高', () => {
    const figma = {
      document: {
        id: '0:0',
        type: 'DOCUMENT',
        children: [
          {
            id: 'cp:1',
            type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 400 },
            children: [
              {
                id: 'parent-sec',
                type: 'FRAME',
                absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 300 },
                children: [
                  {
                    id: 'child-sec',
                    type: 'FRAME',
                    absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 120 },
                    children: [],
                  },
                ],
              },
              box('other-sec', 'other', 100),
            ],
          },
        ],
      },
    };
    const sections = [
      { id: 'parent-sec', styles: { figmaHeightPx: 300 } },
      { id: 'child-sec', styles: { figmaHeightPx: 120 } },
      { id: 'other-sec', styles: { figmaHeightPx: 100 } },
    ];
    const r = auditSectionCoverage({ sections, figmaNodeData: figma });
    // 只计 parent-sec(300) + other-sec(100) = 400，不把 child-sec 的 120 再加一遍
    expect(r.coveredPx).toBe(400);
    expect(r.ratio).toBeCloseTo(1, 3);
  });

  it('fail-open：无 figma 数据 ⇒ evaluated=false, verdict=pass（不误判）', () => {
    const r = auditSectionCoverage({ sections: [{ id: 'a' }], figmaNodeData: null });
    expect(r.evaluated).toBe(false);
    expect(r.skippedReason).toBe('no-figma-index');
    expect(r.verdict).toBe('pass');
  });

  it('fail-open：段无高度真值且 Figma 无 bbox ⇒ skip，不报 incomplete', () => {
    const figma = buildFigma([{ id: 'a', type: 'FRAME', children: [] }]);
    const r = auditSectionCoverage({
      sections: [{ id: 'a' }],
      figmaNodeData: figma,
    });
    expect(r.evaluated).toBe(false);
    expect(r.skippedReason).toBe('no-covered-height');
    expect(r.verdict).toBe('pass');
  });
});

/**
 * V-6 段锚点几何范围上提（2026-11-11 · 74722f0f 实锤：标题条 33px vs 内容区 556px）
 */
describe('V-6 liftSectionAnchorsByContentRange', () => {
  /** 复刻 74722f0f：header(33) 与 slot(556) 是兄弟；两张卡在 slot 内 */
  const figma = {
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      children: [
        {
          id: 'cp:1',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 807 },
          children: [
            {
              id: '2:3550',
              name: 'header-',
              type: 'FRAME',
              absoluteBoundingBox: { x: 0, y: 119, width: 380, height: 33 },
              children: [],
            },
            {
              id: '88:33',
              name: 'slot-content',
              type: 'FRAME',
              absoluteBoundingBox: { x: 0, y: 159, width: 426, height: 556 },
              children: [
                {
                  id: '2:3660',
                  type: 'FRAME',
                  absoluteBoundingBox: { x: 0, y: 196, width: 426, height: 91 },
                  children: [
                    { id: '2:3683', name: 'card-a', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 216, width: 128, height: 52 }, children: [] },
                    { id: '2:3680', name: 'card-b', type: 'GROUP', absoluteBoundingBox: { x: 140, y: 216, width: 131, height: 52 }, children: [] },
                  ],
                },
              ],
            },
            {
              id: '2:3438',
              name: 'slot-dist',
              type: 'FRAME',
              absoluteBoundingBox: { x: 0, y: 573, width: 387, height: 142 },
              children: [
                { id: '2:3800', name: 'dist-a', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 600, width: 180, height: 114 }, children: [] },
              ],
            },
          ],
        },
      ],
    },
  };

  const mkSections = () => [
    {
      id: '2:3550',
      name: '当日总流量',
      styles: { figmaHeightPx: 33, flexGrow: 0.28 },
      header: { title: '当日总流量' },
      body: {
        children: [
          { id: '2:3683', name: 'card-a', figmaNode: '2:3683' },
          { id: '2:3680', name: 'card-b', figmaNode: '2:3680' },
        ],
      },
    },
    {
      id: '2:3438',
      name: '车型分布',
      styles: { figmaHeightPx: 142 },
      body: { children: [{ id: '2:3800', figmaNode: '2:3800' }] },
    },
  ];

  it('阳性：段锚点只覆盖标题条（33px）⇒ 上提到内容容器 88:33 的 556px', () => {
    const sections = mkSections();
    const r = liftSectionAnchorsByContentRange({ sections, figmaNodeData: figma });
    const s0 = r.sections[0];
    expect(r.stats.lifted).toBe(1);
    expect(s0.styles.figmaHeightPx).toBe(556);
    expect(s0.figmaAnchorId).toBe('88:33');
    // 段 id 保持不变化（下游判据按原 id 对位）
    expect(s0.id).toBe('2:3550');
  });

  it('阴性：段锚点本身就是内容容器（LCA 上溯到自身）⇒ 不改高度', () => {
    const sections = mkSections();
    const r = liftSectionAnchorsByContentRange({ sections, figmaNodeData: figma });
    const s1 = r.sections[1];
    expect(s1.styles.figmaHeightPx).toBe(142);
    expect(s1.figmaAnchorId).toBeUndefined();
    expect(r.stats.lifted).toBe(1); // 只有第一段被上提
  });

  it('幂等：连续调用两次，第二次 lifted=0 且高度不漂移', () => {
    const sections = mkSections();
    liftSectionAnchorsByContentRange({ sections, figmaNodeData: figma });
    const h1 = sections[0].styles.figmaHeightPx;
    const r2 = liftSectionAnchorsByContentRange({ sections, figmaNodeData: figma });
    expect(r2.stats.lifted).toBe(0);
    expect(sections[0].styles.figmaHeightPx).toBe(h1);
  });

  it('阈值：目标容器高不足当前高 1.5 倍 ⇒ 不改（避免正常误差被误改）', () => {
    const small = {
      document: {
        id: '0:0',
        type: 'DOCUMENT',
        children: [
          {
            id: 'cp:1',
            type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 400 },
            children: [
              { id: 'h1', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 100 }, children: [] },
              {
                id: 'c1',
                type: 'FRAME',
                absoluteBoundingBox: { x: 0, y: 110, width: 400, height: 120 },
                children: [{ id: 'k1', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 120, width: 100, height: 50 }, children: [] }],
              },
            ],
          },
        ],
      },
    };
    const sections = [
      { id: 'h1', styles: { figmaHeightPx: 100 }, body: { children: [{ figmaNode: 'k1' }] } },
    ];
    const r = liftSectionAnchorsByContentRange({ sections, figmaNodeData: small });
    expect(r.stats.lifted).toBe(0); // 120 < 100*1.5=150 ⇒ 不上提
    expect(r.sections[0].styles.figmaHeightPx).toBe(100);
  });
});

/**
 * V-7 同 id 段合并（2026-11-11 · 5d6a6a25 实锤：两个 2:3550，一个有锚点一个是幻影段）
 */
describe('V-7 mergeCollidedSections', () => {
  /** 复刻 5d6a6a25：4 段，其中两个同 id；后者 body 无 figmaNode（幻影段）但带 2 条描述 */
  const figma = {
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      children: [
        {
          id: 'cp:1',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 807 },
          children: [
            { id: '2:3550', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 119, width: 380, height: 33 }, children: [] },
            {
              id: '88:33',
              type: 'FRAME',
              absoluteBoundingBox: { x: 0, y: 159, width: 426, height: 556 },
              children: [
                { id: '2:3683', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 216, width: 128, height: 52 }, children: [] },
                { id: '2:3680', type: 'GROUP', absoluteBoundingBox: { x: 140, y: 216, width: 131, height: 52 }, children: [] },
              ],
            },
            { id: '2:3438', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 573, width: 387, height: 142 }, children: [] },
            { id: '83:30', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 720, width: 425, height: 174 }, children: [] },
          ],
        },
      ],
    },
  };

  const mkSections = () => [
    {
      id: '2:3550',
      name: '当日总流量',
      styles: { figmaHeightPx: 33 },
      body: { children: [{ figmaNode: '2:3683' }, { figmaNode: '2:3680' }] },
    },
    { id: '2:3438', name: '车型分布', styles: { figmaHeightPx: 142 }, body: { children: [] } },
    { id: '83:30', name: '流量预测', styles: { figmaHeightPx: 174 }, body: { children: [] } },
    {
      id: '2:3550',
      name: '流量趋势柱状图',
      styles: { figmaHeightPx: 33 },
      // 幻影段：body 无 figmaNode，但带 2 条真实描述
      body: { children: [{ type: 'label', text: '流量趋势' }, { type: 'chart', chartId: 'c1' }] },
    },
  ];

  it('阳性：撞 id 且一段有锚点 ⇒ 保留有锚点者并吸收幻影段 contents，段数 4→3', () => {
    const secs = mkSections();
    // 先上提（让有锚点那段拿到 556）
    liftSectionAnchorsByContentRange({ sections: secs, figmaNodeData: figma });
    const r = mergeCollidedSections({ sections: secs, figmaNodeData: figma });
    expect(r.stats.merged).toBe(1);
    expect(r.stats.removed).toBe(1);
    expect(r.sections).toHaveLength(3);
    expect(r.sections.filter((s) => s.id === '2:3550')).toHaveLength(1);
    const kept = r.sections.find((s) => s.id === '2:3550');
    expect(kept.styles.figmaHeightPx).toBe(556);
    // 幻影段的 2 条描述被吸收，不丢内容
    expect(kept.body.children.length).toBe(4);
    expect(JSON.stringify(kept.body.children)).toContain('流量趋势');
    expect(JSON.stringify(kept.body.children)).toContain('c1');
  });

  it('阴性：id 唯一时不动（merged=0）', () => {
    const secs = mkSections().slice(0, 3);
    const r = mergeCollidedSections({ sections: secs, figmaNodeData: figma });
    expect(r.stats.merged).toBe(0);
    expect(r.stats.removed).toBe(0);
    expect(r.sections).toHaveLength(3);
  });

  it('幂等：连续调用两次，第二次 merged=0 且段数稳定', () => {
    const secs = mkSections();
    liftSectionAnchorsByContentRange({ sections: secs, figmaNodeData: figma });
    const r1 = mergeCollidedSections({ sections: secs, figmaNodeData: figma });
    const r2 = mergeCollidedSections({ sections: r1.sections, figmaNodeData: figma });
    expect(r2.stats.merged).toBe(0);
    expect(r2.sections).toHaveLength(3);
  });

  it('fail-open：无 Figma 树时按高度最大者合并（不抛错、不丢 body）', () => {
    const secs = mkSections();
    const r = mergeCollidedSections({ sections: secs, figmaNodeData: null });
    expect(r.stats.merged).toBe(1);
    expect(r.sections).toHaveLength(3);
  });
});

/**
 * V-8 父子段合并 + header 上提（2026-11-11 · bafe3fb7 实锤：两个「◆今日累计」）
 */
describe('V-8 mergeChildHeaderSections', () => {
  /** 复刻 bafe3fb7：136:122(24px) 是 136:121(86px) 的直接子节点，父段无 title */
  const mkFigma = (parentH = 86, childH = 24) => ({
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      children: [
        {
          id: '2:7952',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 377, height: 400 },
          children: [
            { id: '2:7959', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 900, width: 200, height: 28 }, children: [] },
            {
              id: '136:121',
              type: 'FRAME',
              absoluteBoundingBox: { x: 0, y: 963, width: 377, height: parentH },
              children: [
                {
                  id: '136:122',
                  type: 'FRAME',
                  absoluteBoundingBox: { x: 0, y: 963, width: 86, height: childH },
                  children: [],
                },
                { id: '136:130', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 990, width: 300, height: 50 }, children: [] },
              ],
            },
          ],
        },
      ],
    },
  });

  const mkSections = (opts = {}) => [
    { id: '2:7959', name: '标题栏', header: { title: '重点车辆监测' }, styles: { figmaHeightPx: 28 }, body: { children: [] } },
    {
      id: '136:122',
      name: '今日累计',
      header: { title: '今日累计' },
      styles: { figmaHeightPx: 24 },
      body: { children: [{ figmaNode: '2:9001', type: 'label', text: '今日累计' }] },
    },
    {
      id: '136:121',
      name: '统计卡片区',
      header: { title: opts.parentTitle ?? '' },
      styles: { figmaHeightPx: 86 },
      body: { children: [{ figmaNode: '136:130' }] },
    },
  ];

  it('阳性：子段只是父段标题条（24/86=0.279）⇒ 合并进父段并把 title 上提', () => {
    const r = mergeChildHeaderSections({ sections: mkSections(), figmaNodeData: mkFigma() });
    expect(r.stats.merged).toBe(1);
    expect(r.stats.removed).toBe(1);
    expect(r.sections).toHaveLength(2);
    const parent = r.sections.find((s) => s.id === '136:121');
    expect(parent.header.title).toBe('今日累计'); // 标题上提，不丢
    expect(parent.body.children.length).toBe(2); // 子段描述并入
    expect(r.stats.detail[0].ratio).toBeCloseTo(0.279, 2);
    expect(r.stats.detail[0].promotedTitle).toBe('今日累计');
  });

  it('阴性（防误并）：子段高度占父段 70%（合法子区块）⇒ 不合并', () => {
    const secsSub = mkSections();
    secsSub[1].styles.figmaHeightPx = 60; // 60/86 = 0.70 > 0.4
    const r = mergeChildHeaderSections({ sections: secsSub, figmaNodeData: mkFigma(86, 60) });
    expect(r.stats.merged).toBe(0);
    expect(r.sections).toHaveLength(3);
  });

  it('父段已有 title ⇒ 不用子段标题覆盖（保留父语义）', () => {
    const r = mergeChildHeaderSections({
      sections: mkSections({ parentTitle: '统计卡片区' }),
      figmaNodeData: mkFigma(),
    });
    expect(r.stats.merged).toBe(1);
    const parent = r.sections.find((s) => s.id === '136:121');
    expect(parent.header.title).toBe('统计卡片区');
    expect(r.stats.detail[0].promotedTitle).toBeNull();
  });

  it('幂等 + fail-open：连续两次不再合并；无 Figma 树原样返回', () => {
    const figma = mkFigma();
    const secs = mkSections();
    const r1 = mergeChildHeaderSections({ sections: secs, figmaNodeData: figma });
    const r2 = mergeChildHeaderSections({ sections: r1.sections, figmaNodeData: figma });
    expect(r2.stats.merged).toBe(0);
    expect(r2.sections).toHaveLength(2);
    const r3 = mergeChildHeaderSections({ sections: mkSections(), figmaNodeData: null });
    expect(r3.stats.merged).toBe(0);
    expect(r3.sections).toHaveLength(3);
  });
});
