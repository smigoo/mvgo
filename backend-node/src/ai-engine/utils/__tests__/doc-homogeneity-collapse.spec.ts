/**
 * 🔍 L1 文档同构折叠判据（2026-11-03，方案 docs/2026-11-03-折叠器文档同构判据.md）。
 *
 * 真实背景：mc-max-1793639342120-dc888541（今日累计）三张卡（危化品车/重型货车/
 * 超高车辆）几何签名不命中（宽 140/90/60 相对差 >25%）⇒ 未折叠 ⇒ planner 一段
 * 一文件产出 3 份重复卡组件。文档页面元素表声明同 api+同控件（point_type_statics
 * 数字卡片 ×2 + Tag 标签组 ×1）⇒ L1 证据放行。
 *
 * 阴阳同 fixture：同一份段树，无 docGroups = 现状不折叠（阴性），有 docGroups = 折叠（阳性）。
 */
import {
  collapseRepeatedSiblingSections,
  collapseSectionsDeep,
} from '../repeated-section-collapser.js';
import {
  buildDocHomogeneityGroups,
  matchDocEvidenceGroup,
  normalizeDocElementName,
} from '../doc-homogeneity-hints.js';

/** 真实 uiElements（本任务 docAnalysis 子集，逐字段保真：路段切换标签 control 不同组） */
const DOC_ANALYSIS = {
  uiElements: [
    { name: '路段切换标签', control: 'Tag 标签组', field: 'sections', api: 'sections' },
    { name: '危化品车数量', control: '数字卡片', field: 'hazardousCount', api: 'point_type_statics' },
    { name: '重型货车数量', control: '数字卡片', field: 'truckCount', api: 'point_type_statics' },
  ],
};

/**
 * 真实段树形态：三卡同行等高(74px)。宽度 82/130/200 —— 设计约束：
 * ① 全部 ≥80 过 isBusinessItem 尺寸门槛（真实三卡均 ≥80）；
 * ② 两两 wDiff>24 且相对差>25% ⇒ isGeoIsomorphic 宽度轨必不命中（几何路径确实放弃）。
 */
function makeCards() {
  const mk = (id, name, x, w) => ({
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x, y: 200, width: w, height: 74 },
    children: [
      { id: `${id}-t`, name: 'label', type: 'TEXT', text: '标签' },
      { id: `${id}-v`, name: 'value', type: 'TEXT', text: '0' },
    ],
  });
  return [
    mk('136:127', '危化品车', 20, 82),
    mk('136:128', '重型货车', 122, 130),
    mk('136:129', '超高车辆', 272, 200),
  ];
}

describe('L1 文档同构折叠判据（doc-homogeneity-hints × repeated-section-collapser）', () => {
  it('归一化：文档元素名剥数据后缀（危化品车数量→危化品车）', () => {
    expect(normalizeDocElementName('危化品车数量')).toBe('危化品车');
    expect(normalizeDocElementName('路段切换标签')).toBe('路段切换');
  });

  it('buildDocHomogeneityGroups：同 api+同控件成组，异控件不成组', () => {
    const groups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    expect(groups.length).toBe(1);
    expect(groups[0].api).toBe('point_type_statics');
    expect(groups[0].control).toBe('数字卡片');
    expect(groups[0].nameSet.has('危化品车')).toBe(true);
    expect(groups[0].nameSet.has('路段切换')).toBe(false);
  });

  it('阳性：几何不命中 + 文档声明 ⇒ 三卡折叠为 1 个 list 段（超高车辆弱相似并入）', () => {
    const docGroups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    const out = collapseRepeatedSiblingSections(makeCards(), { docGroups });
    expect(out.length).toBe(1);
    expect(out[0].collapsed).toBe(true);
    expect(out[0]._foldEvidence).toBe('doc');
    expect(out[0].items.length).toBe(3);
    expect(out[0].id).toBe('136:127-list');
  });

  it('阳性（collapseSectionsDeep 全链路）：递归入口同样命中且产物挂 _foldEvidence', () => {
    const docGroups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    const out = collapseSectionsDeep(makeCards(), { docGroups });
    expect(out.length).toBe(1);
    expect(out[0]._foldEvidence).toBe('doc');
  });

  it('阴性回归：同 fixture 无 docGroups ⇒ 保持 3 段不折叠（几何路径零变化）', () => {
    const out = collapseRepeatedSiblingSections(makeCards(), {});
    expect(out.length).toBe(3);
    expect(out[0].collapsed).toBeUndefined();
  });

  it('保守门：doc 命中但核心成员不同行（y 差 >4px）⇒ 整组放弃不折叠', () => {
    const cards = makeCards();
    cards[1].absoluteBoundingBox.y = 300; // 重型货车掉行
    const docGroups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    const mg = matchDocEvidenceGroup(cards, docGroups);
    expect(mg).toBeNull();
    const out = collapseRepeatedSiblingSections(cards, { docGroups });
    expect(out.length).toBe(3);
  });

  it('证据组明细：matched=文档命中的 2 卡，absorbed=弱相似并入的超高车辆', () => {
    const docGroups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    const mg = matchDocEvidenceGroup(makeCards(), docGroups);
    expect(mg).not.toBeNull();
    expect(mg.matched.sort()).toEqual(['危化品车', '重型货车']);
    expect(mg.absorbed).toEqual(['超高车辆']);
    expect(mg.idxs).toEqual([0, 1, 2]);
  });

  // 🔧 2026-11-03 真机实证回归锁（mc-doc-20c428fd 路径B）：vision sections 在
  //   planner 折叠时机无内联 box（figmaBox/absoluteBoundingBox/body.box 全空），
  //   几何真值只存在于 figmaRoot（Figma 节点树）⇒ geoBox 必须按段 id 兜底，
  //   否则否决门 fail-closed 恒不折叠（真机 docFolded=0 根因）。
  it('真机形态：vision 段无内联 box，figmaRoot 按 id 兜底 ⇒ 否决门放行并折叠', () => {
    const mk = (id, name) => ({ id, name, type: 'FRAME', children: [] }); // 无任何 box 字段
    const cards = [mk('136:127', '危化品车'), mk('136:128', '重型货车'), mk('136:129', '超高车辆')];
    // 真值逐字取自 mc-doc-20c428fd figma-node-data.json：三卡 y=984 同行、h=74.195 等高
    const figmaRoot = {
      children: [
        { id: '136:127', name: '3', absoluteBoundingBox: { x: 274, y: 984, width: 141, height: 74.195 } },
        { id: '136:128', name: '2', absoluteBoundingBox: { x: 166, y: 984, width: 120, height: 74.195 } },
        { id: '136:129', name: '1', absoluteBoundingBox: { x: 37, y: 984, width: 140.48, height: 74.195 } },
      ],
    };
    const docGroups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    const mg = matchDocEvidenceGroup(cards, docGroups, figmaRoot);
    expect(mg).not.toBeNull();
    expect(mg.matched.sort()).toEqual(['危化品车', '重型货车']);
    expect(mg.absorbed).toEqual(['超高车辆']);
    const out = collapseRepeatedSiblingSections(cards, { docGroups, figmaRoot });
    expect(out.length).toBe(1);
    expect(out[0]._foldEvidence).toBe('doc');
  });

  it('fail-closed：figmaRoot 也查不到 box ⇒ 否决门保持拒绝（兜底不放水）', () => {
    const cards = [
      { id: 'x1', name: '危化品车' },
      { id: 'x2', name: '重型货车' },
      { id: 'x3', name: '超高车辆' },
    ];
    const docGroups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    expect(matchDocEvidenceGroup(cards, docGroups, { children: [] })).toBeNull();
    const out = collapseRepeatedSiblingSections(cards, { docGroups, figmaRoot: { children: [] } });
    expect(out.length).toBe(3);
  });

  // 🔧 2026-11-03 真机实证回归锁 #2（mc-doc-337f2bf2）：折叠 shape 方向判据
  //   （sortItemsByVisualOrder / unionBoxOf / decideCollapsedShape）此前同样只吃
  //   内联 box ⇒ doc 路径 boxes=[] ⇒ 数量兜底 `type:'list'` 无 layout ⇒ 产物纵排，
  //   与 Figma 真值（三卡横排一行）方向相反。修法：三处同走 geoBoxWithRoot 兜底。
  it('真机形态方向锁：无内联 box + figmaRoot 横排真值 ⇒ layout=horizontal + 并集 _box + 视觉排序', () => {
    const mk = (id, name) => ({ id, name, type: 'FRAME', children: [] }); // 无任何 box 字段
    // 故意乱序投喂（真值 x 序：136:129 < 136:128 < 136:127）⇒ 验证视觉排序生效
    const cards = [mk('136:127', '危化品车'), mk('136:128', '重型货车'), mk('136:129', '超高车辆')];
    const figmaRoot = {
      children: [
        { id: '136:127', name: '3', absoluteBoundingBox: { x: 274, y: 984, width: 141, height: 74.195 } },
        { id: '136:128', name: '2', absoluteBoundingBox: { x: 166, y: 984, width: 120, height: 74.195 } },
        { id: '136:129', name: '1', absoluteBoundingBox: { x: 37, y: 984, width: 140.48, height: 74.195 } },
      ],
    };
    const docGroups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    const out = collapseRepeatedSiblingSections(cards, { docGroups, figmaRoot });
    expect(out.length).toBe(1);
    expect(out[0].collapsed).toBe(true);
    // 🔴 方向事实：三卡同行等高 ⇒ side-by-side 判 row（3<4 不判网格）⇒ 横排，不再数量兜底
    expect(out[0].type).toBe('list');
    expect(out[0].layout).toBe('horizontal');
    // 刀25 整列并集几何：doc 路径 _box 不再是 null（x 37 → 274+141=415）
    expect(out[0].absoluteBoundingBox).toBeTruthy();
    expect(out[0].absoluteBoundingBox.width).toBeCloseTo(378, 0);
    // 视觉排序：成员按 x 升序（136:129 → 136:128 → 136:127）
    expect(out[0].items.map((i: any) => i.name)).toEqual(['超高车辆', '重型货车', '危化品车']);
  });

  it('fail-closed 方向锁：figmaRoot 查不到 ⇒ 不写 layout（无真值不判方向，保持旧行为）', () => {
    const mk = (id, name) => ({ id, name, type: 'FRAME', children: [] });
    const cards = [mk('x1', '危化品车'), mk('x2', '重型货车')];
    const docGroups = buildDocHomogeneityGroups(DOC_ANALYSIS);
    const out = collapseRepeatedSiblingSections(cards, { docGroups, figmaRoot: { children: [] } });
    // 真机第一轮形态（20c428fd）：能兜底折叠与否决门是 hints 的事；此处 figmaRoot 空
    // ⇒ 否决门拒绝不折叠（3 段保持），不涉及 shape——单测口径与「兜底不放水」一致。
    expect(out.length).toBe(2);
  });
});
