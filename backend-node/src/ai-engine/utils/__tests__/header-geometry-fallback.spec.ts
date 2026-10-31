/**
 * P0 治本 spec（2026-10-26 · ab7bb76c 连带）：`applyHeaderGeometryFallback` 的
 * `headerFactStripped` 闸门。
 *
 * 背景：`headerIsChromeOnly` 判据细化后，`807:3` 首次被判 chromeOnly 并由
 * `subcomponent-planner#stripChromeOnly` 剥离。此时 sections 里已无 `type:'header'`，
 * 若几何兜底照旧执行，会把紧随其下的「顶部统计概览」（真值 y=51637 h=66，
 * 占内容域 512px 的 12.9% ≤ 30% 阈值）误标成 header ⇒ 用一个新误判换掉旧误判。
 *
 * 闸门语义：剥离动作本身即证明「header 事实存在」（由 base-panel 宿主渲染），
 * 兜底的前提「全树无任何 header 类型事实」不成立 ⇒ 整条跳过。
 */
import { applyHeaderGeometryFallback } from '../header-geometry-fallback.js';

const section = (id, name, y, height) => ({
  id,
  name,
  absoluteBoundingBox: { x: 0, y, width: 510, height },
});

/** 事故件剥离后的真实几何：统计卡在顶（12.9%）、表格居中、图例在底 */
const strippedSections = () => [
  section('43:4893', '顶部统计概览', 51637, 66),
  section('43:4788', '设备列表表格', 51728, 388),
  section('807:2', '底部图例与链接', 52138, 14),
];

describe('applyHeaderGeometryFallback · headerFactStripped 闸门', () => {
  it('闸门开启（chrome header 已剥离）⇒ 即使顶部薄条几何命中也不标 header', () => {
    const sections = strippedSections();
    const hit = applyHeaderGeometryFallback(sections, { headerFactStripped: true });
    expect(hit).toBeNull();
    // 逐段确认无副作用（原地修改函数，必须验证没被标）
    expect(sections.every((s) => s.type === undefined)).toBe(true);
  });

  it('阳性对照：同一组几何在闸门关闭时会命中统计卡 ⇒ 证明闸门真的在起作用', () => {
    const sections = strippedSections();
    const hit = applyHeaderGeometryFallback(sections, { headerFactStripped: false });
    expect(hit).not.toBeNull();
    expect(hit.id).toBe('43:4893');
    expect(sections[0].type).toBe('header');
  });

  it('不传 opts（旧调用形态）⇒ 行为与 headerFactStripped=false 一致（向后兼容）', () => {
    const sections = strippedSections();
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit?.id).toBe('43:4893');
  });

  it('fail-open 不受闸门影响：sections 不足 2 段仍返回 null', () => {
    expect(
      applyHeaderGeometryFallback([section('a', 'A', 0, 10)], { headerFactStripped: false }),
    ).toBeNull();
    expect(applyHeaderGeometryFallback(null, { headerFactStripped: true })).toBeNull();
  });

  it('已有 header 事实 ⇒ 闸门无需介入也返回 null（原有判据不回归）', () => {
    const sections = [...strippedSections()];
    sections[0].type = 'header';
    expect(applyHeaderGeometryFallback(sections, { headerFactStripped: false })).toBeNull();
  });
});

describe('4851eedd：vision 显式发言不得被几何兜底覆盖', () => {
  /** 真实形态：设备统计 = body.items[] 三卡，卡内 content.elements value+label，无 role/type */
  const statItemsSection = () => ({
    id: '43:4890',
    name: '设备统计',
    headerRelation: 'no-header',
    absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 66 },
    body: {
      layout: 'horizontal-3-columns',
      items: ['总设备', '运行中', '离线'].map((label, i) => ({
        id: `43:48${93 + i * 5}`,
        name: label,
        layout: 'horizontal',
        content: {
          layout: 'horizontal',
          elements: [
            { type: 'value', text: '8', styles: { fontSize: 28, color: 'rgba(57,101,255,1)' } },
            { type: 'label', text: label, styles: { fontSize: 14 } },
          ],
        },
      })),
    },
  });

  const statsFirst = () => [
    statItemsSection(),
    section('43:4788', '设备列表', 91, 388),
    section('43:4890-footer', '底部图例与链接', 501, 14),
  ];

  it('headerRelation=no-header（vision 显式结论）⇒ 不标 header、不改写结构', () => {
    const sections = statsFirst();
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit).toBeNull();
    expect(sections[0].type).toBeUndefined();
    expect(sections[0].header).toBeUndefined();
  });

  it('value+label 元素结构（vision 沉默 headerRelation 时）⇒ 识别为统计业务内容，不标 header', () => {
    const sections = statsFirst();
    delete sections[0].headerRelation;
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit).toBeNull();
    expect(sections[0].type).toBeUndefined();
  });

  // 🛡️ 单闸门隔离判据（Phase B-3 变异验证用）：fixture 不带 value 元素，
  //   使第一闸门（declaredHeaderRelation）成为唯一防线——摘除它 ⇒ 本条必红。
  it('headerRelation=no-header、无 value 元素（纯 label 文本条）⇒ 不标 header（第一闸门独立生效）', () => {
    const pureTextLabel = () => ({
      id: '43:4890',
      name: '设备统计',
      headerRelation: 'no-header',
      absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 66 },
      body: {
        layout: 'horizontal',
        items: ['总设备', '运行中', '离线'].map((label, i) => ({
          id: `43:48${93 + i * 5}`,
          name: label,
          layout: 'horizontal',
          content: {
            layout: 'horizontal',
            elements: [{ type: 'label', text: label, styles: { fontSize: 14 } }],
          },
        })),
      },
    });
    const sections = [
      pureTextLabel(),
      section('43:4788', '设备列表', 91, 388),
      section('43:4890-footer', '底部图例与链接', 501, 14),
    ];
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit).toBeNull();
    expect(sections[0].type).toBeUndefined();
    expect(sections[0].header).toBeUndefined();
  });

  it('阴性对照：纯几何薄条（无 headerRelation、无业务结构）⇒ 仍标 header（原行为不回归）', () => {
    const sections = [
      section('top-bar', '顶部薄条', 0, 66),
      section('43:4788', '设备列表', 91, 388),
      section('807:2', '底部图例与链接', 501, 14),
    ];
    const hit = applyHeaderGeometryFallback(sections);
    expect(hit).not.toBeNull();
    expect(hit.id).toBe('top-bar');
    expect(sections[0].type).toBe('header');
  });
});
