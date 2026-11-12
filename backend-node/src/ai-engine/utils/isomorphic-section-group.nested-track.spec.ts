/**
 * 🧬 刀 66-P0 契约：同构判据的**入参形态自适应**（2026-11-12）。
 *
 * 真机病灶（mc-max-1794420265256-036db2a1 实测）：
 *   ① 归一化口 `componentPlan.effectiveSections` 没有 `body`（内容在 `declaredContent`）
 *      ⇒ 判据恒 `no-body` ⇒ `ISO-CONVERGE groupsRaw=0`；
 *   ② 即使换成 planner 原形，条目在 `body.children[1]`（type=list, gridColumns=4）里、
 *      外层 `body.layout='vertical'` ⇒ 判据取外层布局 ⇒ `layout-column` 全拒。
 * 两条合起来 = 三厂商段永远不收敛，三段各写一套（用户诉求「后三个没有重复」）。
 *
 * 本 spec 用**真机同形** fixture 钉住三件事：
 *   A. 两种建模（body / declaredContent）都能过资格判据并归到同一组；
 *   B. 条目轨下钻只在「恰好一个列表容器 + 其余无叶子文案」时发生（不放宽门禁）；
 *   C. 图标按 Figma 节点取（planner 会给多段塞同一个 resourceFile）。
 */
import {
  isoSectionContent,
  isoSectionTrack,
  isoBodyEntries,
  isoSectionLayout,
  assessIsoEligibility,
  collectIsomorphicSectionGroups,
  extractIconResource,
  buildIsoResourceByNode,
} from './isomorphic-section-group.js';

/** 三厂商段的真机同形 fixture：外层 vertical，条目在 list(grid, 4 列) 里 */
function vendorSection(id, title, names, opts = {}) {
  const items = names.map((n, i) => ({ type: 'tag', label: n, value: i === 0 ? '8台' : '0台' }));
  const content = {
    layout: 'vertical',
    children: [
      { type: 'icon', figmaNode: opts.iconNode || '38:3160' },
      { type: 'list', layout: 'grid', gridColumns: 4, items },
    ],
  };
  return {
    id,
    title,
    header: { title, controls: [] },
    ...(opts.normalized ? { declaredContent: content } : { body: content }),
  };
}

const SMALL = vendorSection('38:3137', '战略合作厂商', ['华为技术', '中兴通讯', '海康威视']);
const MID = vendorSection('38:3162', '优质厂商', ['大华股份', '宇视科技', '西门子', '施耐德电气']);
const BIG = vendorSection('38:3206', '普通厂商', ['特来电', '金溢科技', '汉威科技', '烽火通信', '锐捷网络']);

describe('刀 66-P0 · 段内容访问器（两种建模）', () => {
  it('planner 原形（body）与归一化口（declaredContent）取到同一份内容', () => {
    const full = vendorSection('38:3137', '战略合作厂商', ['华为技术']);
    const norm = vendorSection('38:3137', '战略合作厂商', ['华为技术'], { normalized: true });
    expect(isoSectionContent(full)).toBeTruthy();
    expect(isoSectionContent(norm)).toBeTruthy();
    expect(isoSectionContent(norm)).toEqual(isoSectionContent(full));
  });

  it('阳性对照：只读 sec.body 的旧判据在归一化口上恒取空（证明新访问器不是恒真）', () => {
    const norm = vendorSection('38:3137', '战略合作厂商', ['华为技术'], { normalized: true });
    const legacyEntries = (sec) => {
      const body = sec?.body;
      if (!body || typeof body !== 'object') return [];
      for (const k of ['children', 'items', 'elements']) {
        if (Array.isArray(body[k]) && body[k].length > 0) return body[k];
      }
      return [];
    };
    expect(legacyEntries(norm)).toHaveLength(0);
    expect(isoBodyEntries(norm, { flattenOneLevel: true })).toHaveLength(1);
  });
});

describe('刀 66-P0 · 条目轨下钻与布局归一', () => {
  it('下钻唯一 list 容器，条目数与列数取自 list（不是外层 vertical）', () => {
    const track = isoSectionTrack(MID, { flattenOneLevel: true });
    expect(track.container.layout).toBe('grid');
    expect(track.entries).toHaveLength(4);
    expect(track.entries[0]).toMatchObject({ label: '大华股份' });
    const lay = isoSectionLayout(MID, { flattenOneLevel: true });
    expect(lay.direction).toBe('row');
    expect(lay.columns).toBe(4);
  });

  it('归一化口同样下钻（形状一致才谈得上同构）', () => {
    const norm = vendorSection('38:3162', '优质厂商', ['大华股份', '宇视科技'], { normalized: true });
    expect(isoBodyEntries(norm, { flattenOneLevel: true })).toHaveLength(2);
    expect(isoSectionLayout(norm, { flattenOneLevel: true }).columns).toBe(4);
  });

  it('负向①：list 为纵向（无列数）⇒ layout-column 拒，不收敛（归刀 53 list 域）', () => {
    const vertical = {
      id: '2:100',
      header: { title: '设备清单', controls: [] },
      body: {
        layout: 'vertical',
        children: [
          { type: 'icon', figmaNode: '2:101' },
          { type: 'list', layout: 'vertical', items: [{ type: 'row', label: 'A', value: '1' }] },
        ],
      },
    };
    expect(assessIsoEligibility(vertical, { flattenOneLevel: true })).toMatchObject({
      eligible: false,
      reason: 'layout-column',
    });
  });

  it('负向②：扁平条目轨（成员自带文案）不下钻，entries 仍取外层', () => {
    const flat = {
      id: '2:200',
      header: { title: '指标', controls: [] },
      body: {
        layout: 'horizontal',
        children: [
          { type: 'tag', label: 'A', value: '1' },
          { type: 'tag', label: 'B', value: '2' },
        ],
      },
    };
    const track = isoSectionTrack(flat, { flattenOneLevel: true });
    expect(track.container).toBe(track.content);
    expect(track.entries).toHaveLength(2);
    expect(assessIsoEligibility(flat, { flattenOneLevel: true }).eligible).toBe(true);
  });

  it('负向③：无 header 的统计卡不因结构相似被拉进组', () => {
    const statCard = {
      id: '38:3260',
      body: {
        layout: 'vertical',
        children: [
          { type: 'icon', figmaNode: '187:262' },
          { type: 'value', text: '33' },
          { type: 'label', text: '合作厂商' },
        ],
      },
    };
    expect(assessIsoEligibility(statCard, { flattenOneLevel: true })).toMatchObject({
      eligible: false,
      reason: 'no-header',
    });
  });
});

describe('刀 66-P0 · 三厂商段成组（两条入参口都必须命中）', () => {
  for (const [label, normalized] of [['planner 原形(body)', false], ['归一化口(declaredContent)', true]]) {
    it(`${label} ⇒ 1 组 3 成员，列数 4，条目不并入布局签名`, () => {
      const secs = [SMALL, MID, BIG].map((s) =>
        normalized ? { ...s, body: undefined, declaredContent: s.body } : s,
      );
      const res = collectIsomorphicSectionGroups(secs, { flattenOneLevel: true });
      expect(res.evaluated).toBe(3);
      expect(res.groups).toHaveLength(1);
      const g = res.groups[0];
      expect(g.sectionIds).toEqual(['38:3137', '38:3162', '38:3206']);
      expect(g.representativeId).toBe('38:3137');
      expect(g.columns).toBe(4);
      expect(g.direction).toBe('row');
      expect(g.members.map((m) => m.items.length)).toEqual([3, 4, 5]);
      // 条目数不同不影响同构（参数化差异），标题进成员不进签名
      expect(g.members.map((m) => m.title)).toEqual(['战略合作厂商', '优质厂商', '普通厂商']);
    });
  }

  it('阳性对照：判据若回退成只认外层布局（vertical）⇒ 三段全拒、组消失', () => {
    const legacyEligible = (sec) => {
      const lay = String(sec?.body?.layout || '');
      return !/vertical/.test(lay);
    };
    expect([SMALL, MID, BIG].every((s) => legacyEligible(s))).toBe(false);
    expect([SMALL, MID, BIG].every((s) => assessIsoEligibility(s, { flattenOneLevel: true }).eligible)).toBe(true);
  });
});

describe('刀 66-P0 · 成员图标按 Figma 节点取', () => {
  it('节点映射优先于 planner 塞的同一个 resourceFile', () => {
    const byNode = buildIsoResourceByNode([
      { figmaNodeId: '38:3160', resourceFile: '../resources/images/icon-战略厂商-3160.png' },
      { figmaNodeId: '38:3164', resourceFile: '../resources/images/icon-优质厂商-3164.png' },
      { figmaNodeId: '38:3208', resourceFile: '../resources/images/icon-普通厂商-3208.png' },
    ]);
    // planner 原形把三段 icon 都写成 icon-战略厂商-3160.png，只有节点不同
    const wrongShared = {
      id: '38:3162',
      header: { title: '优质厂商', controls: [] },
      body: {
        layout: 'vertical',
        children: [
          { type: 'icon', figmaNode: '38:3164', resourceFile: '../resources/images/icon-战略厂商-3160.png' },
          { type: 'list', layout: 'grid', gridColumns: 4, items: [{ type: 'tag', label: 'A', value: '1' }] },
        ],
      },
    };
    expect(extractIconResource(wrongShared, { resourceByNode: byNode })).toBe(
      '../resources/images/icon-优质厂商-3164.png',
    );
    // 无映射时退回自带字段（fail-open，不制造空 icon）
    expect(extractIconResource(wrongShared)).toBe('../resources/images/icon-战略厂商-3160.png');
  });
});
