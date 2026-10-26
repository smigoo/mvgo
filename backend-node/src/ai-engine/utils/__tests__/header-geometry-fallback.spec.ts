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
