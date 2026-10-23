/**
 * section-plan-coverage · A 方案（plan 层覆盖门禁）单测
 * 2026-10-23 · mc-max-1792718704810-f98f7463 实锤
 *
 * 对照纪律：每条形阳性判据必须配阴性，证明判据不是「见谁报谁」。
 * 真实语料基线（137 组件重放 `SubcomponentPlanner#plan`，见 docs 与当日 memory）：
 *   healed=0 / residual=0（③ 零命中 ⇒ 上线零回归）；uncovered 82 组件 307 容器；
 *   overlapping 11 组件 16 对 ⇒ ①② 只留痕不改 plan（理由见模块头注释：v-for 假阳）。
 */
import {
  indexCoverageTree,
  detectPlanCoverageGaps,
  healOversizedTextRowAnchors,
} from '../section-plan-coverage.js';

const T = (id, characters) => ({ id, type: 'TEXT', characters });
const card = (id, a, b) => ({
  id,
  type: 'FRAME',
  children: [T(`${id}-t1`, a), T(`${id}-t2`, b)],
});

/**
 * 真值树：ROOT → P（统计行容器）→ C1/C2/C3 三张同构卡；另有裸文本 T1、空文案卡 C4。
 */
const FIGMA = {
  document: {
    id: 'ROOT',
    type: 'FRAME',
    children: [
      {
        id: 'P',
        type: 'FRAME',
        children: [card('C1', '8', '总设备'), card('C2', '2', '运行中'), card('C3', '1', '离线'), card('C4', '', '')],
      },
      T('T1', '点击查看详情'),
    ],
  },
};

const leaf = (id) => ({ id, sourceNodeIds: [id], children: [] });
/**
 * 容器 section：必须带 `isLayoutContainer: true` —— `collectLeafSections` 只递归
 * `isLayoutContainerSection` 为真的段（否则容器自身会被当成叶子，子段永不参与）。
 */
const container = (id, children) => ({ id, isLayoutContainer: true, sourceNodeIds: [id], children });

describe('indexCoverageTree', () => {
  it('把每个 TEXT 映射到「最近容器祖先」（叶子容器）', () => {
    const idx = indexCoverageTree(FIGMA);
    expect(idx).not.toBeNull();
    expect(idx.leafContainerOfText.get('C1-t1')).toBe('C1');
    expect(idx.leafContainerOfText.get('T1')).toBe('ROOT');
    expect(idx.containerTexts.get('C1').ids.sort()).toEqual(['C1-t1', 'C1-t2'].sort());
    expect(idx.containerTexts.get('C1').sample.sort()).toEqual(['8', '总设备'].sort());
  });

  it('无有效 Figma 数据 ⇒ null（fail-open，不抛）', () => {
    expect(indexCoverageTree(null)).toBeNull();
    expect(indexCoverageTree({})).toBeNull();
  });
});

describe('detectPlanCoverageGaps · ① 覆盖缺口', () => {
  it('阳性：同构兄弟里漏切的那张卡 ⇒ uncovered 命中（本单 43:4893 形态）', () => {
    // plan 只切出 C1 / C2（容器 section P 只透传，不算覆盖）
    const sections = [container('P', [leaf('C1'), leaf('C2')])];
    const r = detectPlanCoverageGaps({ sections, figmaNodeData: FIGMA });
    expect(r.skipped).toBe(false);
    expect(r.evaluated).toBe(2); // 只按叶子段计
    const ids = r.uncovered.map((u) => u.containerId);
    expect(ids).toContain('C3');
    expect(ids).not.toContain('C1');
    expect(ids).not.toContain('C2');
    const c3 = r.uncovered.find((u) => u.containerId === 'C3');
    expect(c3.textCount).toBe(2);
    expect(c3.sample.sort()).toEqual(['1', '离线'].sort());
  });

  it('阴性①：三张卡都在 plan 里 ⇒ uncovered 为 0', () => {
    const sections = [container('P', [leaf('C1'), leaf('C2'), leaf('C3')])];
    const r = detectPlanCoverageGaps({ sections, figmaNodeData: FIGMA });
    expect(r.uncovered).toHaveLength(0);
  });

  it('阴性②：容器 section 本身（非叶子）不算覆盖 ⇒ 不会因「顶层已覆盖」而假阴', () => {
    // 只有容器 section、没有叶子段（children 为空 ⇒ 它自己就是叶子）⇒ 覆盖全树 ⇒ uncovered 0
    const r = detectPlanCoverageGaps({ sections: [leaf('P')], figmaNodeData: FIGMA });
    expect(r.evaluated).toBe(1);
    expect(r.uncovered).toHaveLength(0);
  });

  it('阴性③：Figma 根节点不报（根是组件边界，不是内容容器）', () => {
    const sections = [container('P', [leaf('C1'), leaf('C2'), leaf('C3')])];
    const r = detectPlanCoverageGaps({ sections, figmaNodeData: FIGMA });
    expect(r.uncovered.map((u) => u.containerId)).not.toContain('ROOT');
  });

  it('阴性④：空文案容器不报（丢了也不产生视觉缺陷）', () => {
    const sections = [container('P', [leaf('C1'), leaf('C2'), leaf('C3')])];
    const r = detectPlanCoverageGaps({ sections, figmaNodeData: FIGMA });
    expect(r.uncovered.map((u) => u.containerId)).not.toContain('C4');
  });

  it('阴性⑤：段锚的是容器内裸 TEXT（tail-text 形态）⇒ 容器不算未覆盖（TEXT 级判定）', () => {
    // 真机 38:3137-tail-text：sourceNodeIds=['38:3139']，容器 38:3137 自身不进覆盖集。
    // 按容器 id 判会假阳（全量语料 3/137 组件命中）⇒ 必须按 TEXT 判。
    const sections = [
      { id: 'C1-tail-text', sourceNodeIds: ['C1-t1'], children: [] },
      container('P', [leaf('C2'), leaf('C3')]),
    ];
    const r = detectPlanCoverageGaps({ sections, figmaNodeData: FIGMA });
    expect(r.uncovered.map((u) => u.containerId)).not.toContain('C1');
  });
});

describe('detectPlanCoverageGaps · ② 兄弟覆盖重叠', () => {
  it('阳性：兄弟段覆盖闭包有交集 ⇒ overlapping 命中', () => {
    const sections = [leaf('P'), leaf('C1')]; // P 的闭包 ⊇ C1 的闭包
    const r = detectPlanCoverageGaps({ sections, figmaNodeData: FIGMA });
    expect(r.overlapping.length).toBe(1);
    expect(r.overlapping[0].shared).toBeGreaterThan(0);
  });

  it('阴性：兄弟段覆盖互不相交 ⇒ 不报', () => {
    const sections = [leaf('C1'), leaf('C2')];
    const r = detectPlanCoverageGaps({ sections, figmaNodeData: FIGMA });
    expect(r.overlapping).toHaveLength(0);
  });
});

describe('detectPlanCoverageGaps · ③ 纯文本行段覆盖膨胀', () => {
  const tailText = (id, src) => ({
    id,
    sourceNodeIds: src,
    children: [{ id: 'T1', type: 'TEXT', characters: '点击查看详情' }],
  });

  it('阳性：合成 id + children 全 TEXT + 锚点含容器 ⇒ 命中（本单 807:2-tail-text 形态）', () => {
    const r = detectPlanCoverageGaps({ sections: [tailText('P-tail-text', ['P', 'T1'])], figmaNodeData: FIGMA });
    expect(r.oversizedTextRow).toHaveLength(1);
    expect(r.oversizedTextRow[0].id).toBe('P-tail-text');
    expect(r.oversizedTextRow[0].containerAnchors).toEqual(['P']);
  });

  it('阴性①：id 是真 Figma 节点 ⇒ 不属合成段，不报', () => {
    const r = detectPlanCoverageGaps({ sections: [tailText('C1', ['P', 'T1'])], figmaNodeData: FIGMA });
    expect(r.oversizedTextRow).toHaveLength(0);
  });

  it('阴性②：折叠列表段（children 含容器）⇒ 不报（-list 段的容器锚点是设计内）', () => {
    const listSec = { id: 'P-list', sourceNodeIds: ['C1', 'C2'], children: [{ id: 'C1', type: 'FRAME' }] };
    const r = detectPlanCoverageGaps({ sections: [listSec], figmaNodeData: FIGMA });
    expect(r.oversizedTextRow).toHaveLength(0);
  });

  it('阴性③：锚点全是裸 TEXT ⇒ 不报', () => {
    const r = detectPlanCoverageGaps({ sections: [tailText('P-tail-text', ['T1'])], figmaNodeData: FIGMA });
    expect(r.oversizedTextRow).toHaveLength(0);
  });
});

describe('detectPlanCoverageGaps · fail-open', () => {
  it('无 sections ⇒ skippedReason=no-sections', () => {
    expect(detectPlanCoverageGaps({ sections: [], figmaNodeData: FIGMA }).skippedReason).toBe('no-sections');
  });
  it('无 figma ⇒ skippedReason=no-figma-tree（不得抛、不得误报）', () => {
    expect(detectPlanCoverageGaps({ sections: [leaf('C1')] }).skippedReason).toBe('no-figma-tree');
  });
});

describe('healOversizedTextRowAnchors', () => {
  const tailText = (id, src, children) => ({
    id,
    sourceNodeIds: src,
    children: children || [{ id: 'T1', type: 'TEXT', characters: '点击查看详情' }],
  });

  it('阳性：用 children 的 TEXT id 重建 sourceNodeIds（容器锚点被摘掉）', () => {
    const r = healOversizedTextRowAnchors({ sections: [tailText('P-tail-text', ['P', 'T1'])], figmaNodeData: FIGMA });
    expect(r.healed).toHaveLength(1);
    expect(r.healed[0].after).toEqual(['T1']);
    expect(r.sections[0].sourceNodeIds).toEqual(['T1']);
  });

  it('闭环：heal 后再 detect ⇒ ③ 归零', () => {
    const h = healOversizedTextRowAnchors({ sections: [tailText('P-tail-text', ['P', 'T1'])], figmaNodeData: FIGMA });
    const d = detectPlanCoverageGaps({ sections: h.sections, figmaNodeData: FIGMA });
    expect(d.oversizedTextRow).toHaveLength(0);
  });

  it('幂等：同一输入跑两次 ⇒ 第二次零命中', () => {
    const first = healOversizedTextRowAnchors({ sections: [tailText('P-tail-text', ['P', 'T1'])], figmaNodeData: FIGMA });
    const second = healOversizedTextRowAnchors({ sections: first.sections, figmaNodeData: FIGMA });
    expect(second.healed).toHaveLength(0);
    expect(second.sections[0].sourceNodeIds).toEqual(['T1']);
  });

  it('宁漏不误删：children 里没有可锚定的真实 TEXT ⇒ residual，原样不动', () => {
    const r = healOversizedTextRowAnchors({
      sections: [tailText('P-tail-text', ['P'], [{ id: 'GHOST', type: 'TEXT', characters: '点击查看详情' }])],
      figmaNodeData: FIGMA,
    });
    expect(r.healed).toHaveLength(0);
    expect(r.residual).toHaveLength(1);
    expect(r.residual[0].reason).toBe('no-text-child-anchor');
    expect(r.sections[0].sourceNodeIds).toEqual(['P']);
  });

  it('阴性：非合成段 / 折叠列表段 ⇒ 一个都不动', () => {
    const sections = [
      tailText('C1', ['P', 'T1']),
      { id: 'P-list', sourceNodeIds: ['C1', 'C2'], children: [{ id: 'C1', type: 'FRAME' }] },
    ];
    const r = healOversizedTextRowAnchors({ sections, figmaNodeData: FIGMA });
    expect(r.healed).toHaveLength(0);
    expect(r.sections[0].sourceNodeIds).toEqual(['P', 'T1']);
    expect(r.sections[1].sourceNodeIds).toEqual(['C1', 'C2']);
  });

  it('递归：嵌套在 children 里的膨胀段也会被修', () => {
    const sections = [{ id: 'P', isLayoutContainer: true, sourceNodeIds: ['P'], children: [tailText('P-tail-text', ['P'])] }];
    const r = healOversizedTextRowAnchors({ sections, figmaNodeData: FIGMA });
    expect(r.healed).toHaveLength(1);
    expect(r.sections[0].children[0].sourceNodeIds).toEqual(['T1']);
  });

  it('fail-open：无 figma ⇒ 原样返回，不抛', () => {
    const sections = [tailText('P-tail-text', ['P'])];
    const r = healOversizedTextRowAnchors({ sections, figmaNodeData: null });
    expect(r.skipped).toBe(true);
    expect(r.skippedReason).toBe('no-figma-tree');
    expect(r.sections).toBe(sections);
  });
});
