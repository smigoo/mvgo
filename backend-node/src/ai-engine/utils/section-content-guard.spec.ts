/**
 * 🎯 2026-09-14 治本①②：section 内容映射守卫（验证优先，不自动重排/删除）。
 *
 * 真机验证（c-traffic-monitor-29570c8e）：
 *   memberOrderIssues 抓到 88:32（当日总流量/24小时反）与 2:3660（34,620/82,379 反）；
 *   duplicateTextIssues 抓到「24小时/当日总流量/流量预测」跨组件重复。
 */
import { checkSectionContent, buildSectionContentContract } from './section-content-guard.js';

/** 构造最小 figma 树节点 */
function node(id, name, type, x, y, children = []) {
  return { id, name, type, absoluteBoundingBox: { x, y, width: 10, height: 10 }, children };
}
function text(id, name, x, y) {
  return node(id, name, 'TEXT', x, y);
}
/** 构造 horizontal section plan */
function horizSection(id, ids) {
  return { id, title: id, body: { layout: 'horizontal' }, sourceNodeIds: ids, children: [] };
}
function planWith(sections) {
  return { effectiveSections: sections };
}

describe('checkSectionContent · 左右序与内容错装守卫', () => {
  const figmaRoot = {
    document: {
      id: 'root', name: 'root', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
      children: [
        node('s1', 'row', 'FRAME', 0, 0, [
          node('m1', 'm1', 'GROUP', 40, 0, [text('m1t', 't-隧道', 40, 0), text('m1d', 'd-34,620', 40, 0)]),
          node('m2', 'm2', 'GROUP', 200, 0, [text('m2t', 't-大桥', 200, 0), text('m2d', 'd-82,379', 200, 0)]),
        ]),
        node('s2', 'header', 'FRAME', 0, 100, [text('s2t', '当日总流量', 40, 100)]),
        node('s3', 'sub', 'FRAME', 0, 120, [text('s3t', '当日总流量', 40, 120), text('s3d', '24小时', 200, 120)]),
      ],
    },
  };

  it('① 统计行左右反：成员文本（d- 数值，最独特）在产物中反序 → 报 issue', () => {
    const files = [
      {
        path: 'package/components/ContentSection.vue',
        content: '<div>82,379 大桥</div><div>34,620 隧道</div>', // 大桥在前（错）
      },
      // 标题「隧道/大桥」同现于另一文件（模拟 tabs/车型分布引用）→ 标题不再独特，数值成为唯一签名
      { path: 'package/components/OtherTabs.vue', content: '隧道 大桥 切换' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([horizSection('s1', ['s1', 'm1', 'm2']), { id: 's2', sourceNodeIds: ['s2', 's2t'] }, { id: 's3', sourceNodeIds: ['s3', 's3t', 's3d'] }]),
      figmaRoot: figmaRoot.document,
    });
    expect(r.memberOrderIssues).toHaveLength(1);
    expect(r.memberOrderIssues[0].sectionId).toBe('s1');
    expect(r.memberOrderIssues[0].expectedLeftToRight).toEqual(['34,620', '82,379']);
  });

  it('① 顺序正确 → 不报', () => {
    const files = [
      {
        path: 'package/components/ContentSection.vue',
        content: '<div>34,620 隧道</div><div>82,379 大桥</div>',
      },
      { path: 'package/components/OtherTabs.vue', content: '隧道 大桥 切换' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([horizSection('s1', ['s1', 'm1', 'm2'])]),
      figmaRoot: figmaRoot.document,
    });
    expect(r.memberOrderIssues).toHaveLength(0);
  });

  it('② 唯一归属文本被 2 个组件渲染 → 报重复（t-/d- 前缀归一化生效）', () => {
    const files = [
      { path: 'package/components/HeaderSection.vue', content: '<div>当日总流量 24小时</div>' },
      { path: 'package/components/ContentSubHeader.vue', content: '<div>当日总流量 24小时</div>' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([{ id: 's2', sourceNodeIds: ['s2', 's2t'] }]),
      figmaRoot: figmaRoot.document,
    });
    // 「当日总流量」仅归属 s2，却渲染在 2 个文件 → 报；「24小时」归属 s3（未提供该 section）→ 不参与
    expect(r.duplicateTextIssues.some((d) => d.text === '当日总流量')).toBe(true);
  });

  it('② 多 section 共有的文本（图例类）→ 合法重复，不报', () => {
    const fig = {
      document: {
        id: 'root', name: 'r', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('c1', 'c1', 'FRAME', 0, 0, [text('c1t', '北京方向', 0, 0)]),
          node('c2', 'c2', 'FRAME', 0, 0, [text('c2t', '北京方向', 0, 0)]),
        ],
      },
    };
    const files = [
      { path: 'package/components/A.vue', content: '北京方向' },
      { path: 'package/components/B.vue', content: '北京方向' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([
        { id: 'c1', sourceNodeIds: ['c1', 'c1t'] },
        { id: 'c2', sourceNodeIds: ['c2', 'c2t'] },
      ]),
      figmaRoot: fig.document,
    });
    expect(r.duplicateTextIssues).toHaveLength(0);
  });

  it('无 figmaRoot / 无 plan / 空 files → 空结果（fail-open，不抛错）', () => {
    expect(checkSectionContent({ files: [], plan: { effectiveSections: [] }, figmaRoot: null })).toEqual({ memberOrderIssues: [], duplicateTextIssues: [] });
    expect(checkSectionContent({ files: [{ path: 'package/components/A.vue', content: 'x' }], plan: null, figmaRoot: null }).memberOrderIssues).toHaveLength(0);
  });
});

describe('buildSectionContentContract · per-section 内容归属契约（prompt 预防层）', () => {
  const figmaRoot = {
    document: {
      id: 'root', name: 'r', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
      children: [
        node('s1', 's1', 'FRAME', 0, 0, [
          node('g1', 'g1', 'GROUP', 40, 0, [text('t1', 't-隧道', 40, 0)]),
          node('g2', 'g2', 'GROUP', 260, 0, [text('t2', 't-大桥', 260, 0)]),
        ]),
      ],
    },
  };

  it('横向 section 成员级配对：隧道@40 左、大桥@260 右，标题↔数值成对，前缀归一化', () => {
    const fig = {
      document: {
        id: 'root', name: 'r', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('s1', 's1', 'FRAME', 0, 0, [
            node('g1', 'g1', 'GROUP', 40, 0, [text('t1', 't-隧道', 40, 0), text('d1', 'd-34,620', 40, 0)]),
            node('g2', 'g2', 'GROUP', 260, 0, [text('t2', 't-大桥', 260, 0), text('d2', 'd-82,379', 260, 0)]),
          ]),
        ],
      },
    };
    const c = buildSectionContentContract(
      { effectiveSections: [{ id: 's1', title: 'row', body: { layout: 'horizontal' }, sourceNodeIds: ['s1', 'g1', 'g2'] }] },
      fig.document,
    );
    expect(c).toHaveLength(1);
    expect(c[0].direction).toBe('row');
    expect(c[0].members).toEqual([
      { title: '隧道', value: '34,620', x: 40 },
      { title: '大桥', value: '82,379', x: 260 },
    ]);
  });

  it('无 figmaRoot / 无 plan → 空数组（fail-open）', () => {
    expect(buildSectionContentContract(null, figmaRoot.document)).toEqual([]);
    expect(buildSectionContentContract({ effectiveSections: [] }, null)).toEqual([]);
  });
});
