/**
 * 🛡️ Phase E（2026-10-31 治理方案）：拒绝原因聚合对账判据。
 *
 * 交付物 1：任务级 summary——刀53 takeover skipped[].reason / hits / suppressed +
 *          D1 契约审计缺失聚合为一行日志 + `.checkpoint/reject-summary.json`；
 * 交付物 2：接管/兜底 0 命中必须可见（杜绝「接管 0 命中静默通过」——
 *          0 命中必须看 reject-summary 并配阳性对照）。
 *
 * 家族模式：纯函数归一 + role 回写（takeoverAudit）+ graph 落盘（reject-summary）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  pickTakeoverAudit,
  buildRejectSummary,
  formatRejectSummaryLine,
} from '../reject-summary.js';

const ROLES = join(__dirname, '../../roles');
const GRAPHS = join(__dirname, '../../graphs');
const readSrc = (p) => readFileSync(join(__dirname, p), 'utf8');

/** 构造一个完整 _fgTakeover 形态（与 collectFoldedGridTakeover 返回同构） */
const mkTakeover = (over = {}) => ({
  map: new Map([
    ['sec-a', { kind: 'table', sectionId: '43:1', suppressed: false, height: 120 }],
    ['sec-b', { kind: 'list', sectionId: '43:2', suppressed: true, height: 80 }],
  ]),
  evaluated: 9,
  headerHits: 1,
  gridHits: 0,
  textHits: 0,
  iconHits: 0,
  legendHits: 0,
  kvGridHits: 0,
  listHits: 1,
  listRow: 1,
  listColumn: 0,
  listItemBg: 3,
  listItemBgDeclared: 2,
  listItemBgSubtree: 1,
  listItemBgSkipped: 0,
  // 🔴 2026-11-03（列表卡盒真值治本 步①②）：列表几何真值计数（0 也打）
  listGeoNegGapClamped: 1,
  listGeoGeoNotReady: 0,
  // 🔴 步③：row 回退盒 + 异宽 ⇒ 横向几何（宽度+间距）未下发的段数（0 也打）
  listGeoWidthNotUniform: 0,
  // 🔴 步④：几何锚（按几何选可见底）生效段数 + 跨度自校验拒绝段数（0 也打）
  listGeoGeomPicked: 0,
  listGeoSpanRejected: 0,
  // 🔴 步⑤（P0-2）：卡内布局几何真值落点（0 也打）
  listGeoInnerStacked: 0,
  listGeoInnerInline: 0,
  listGeoInnerConflict: 0,
  listGeoValuePartsInline: 0,
  listGeoValuePartsStacked: 0,
  listGeoSamples: [
    { sectionId: '136:121', dir: 'row', w: 141, h: 60, widths: [141, 120, 140], gaps: null, neg: [-11, -12] },
  ],
  statRowHits: 0,
  statRowSuppressed: 1,
  tableHits: 1,
  tableSuppressed: 0,
  tableAnchorRepairs: 2,
  footerHits: 0,
  skipped: [
    { id: '43:9', reason: 'grid:notCollapsedList;header:noBox' },
    { id: '43:8', reason: 'noComponentName' },
  ],
  ...over,
});

describe('Phase E · pickTakeoverAudit（takeover 统计子集归一）', () => {
  it('归一全字段：evaluated/candidates/hits/suppressed/anchorRepairs/skipped', () => {
    const a = pickTakeoverAudit(mkTakeover());
    expect(a.evaluated).toBe(9);
    expect(a.candidates).toBe(2);
    expect(a.hits).toEqual({ header: 1, grid: 0, text: 0, icon: 0, legend: 0, kvGrid: 0, list: 1, statRow: 0, table: 1, footer: 0, regions: 0 }); // 刀54：11 类计数键，0 也打
    expect(a.suppressed).toEqual({ statRow: 1, table: 0 });
    expect(a.listDirections).toEqual({ row: 1, column: 0 });
    expect(a.listItemBgs).toEqual({ total: 3, declared: 2, subtree: 1, skipped: 0 });
    // 🔴 步①②：负间距总闸与 geoReady 覆盖必须随 takeovers 一起可见（否则判据在审计侧不可见）
    expect(a.listGeo.negGapClamped).toBe(1);
    expect(a.listGeo.geoNotReady).toBe(0);
    // 🔴 步③：异宽拦宽度的计数字段必须归一（缺键即审计侧静默）
    expect(a.listGeo.widthNotUniform).toBe(0);
    expect(a.listGeo.geomPicked).toBe(0);
    expect(a.listGeo.spanRejected).toBe(0);
    // 真值现场必须留：clamp 后 `gaps` 已置 null，原始负值只能从 `neg` 回溯
    expect(a.listGeo.samples).toEqual([
      { sectionId: '136:121', dir: 'row', w: 141, h: 60, widths: [141, 120, 140], gaps: null, neg: [-11, -12] },
    ]);
    expect(a.anchorRepairs).toBe(2);
    expect(a.skippedTotal).toBe(2);
    expect(a.skipped).toEqual([
      { id: '43:9', reason: 'grid:notCollapsedList;header:noBox' },
      { id: '43:8', reason: 'noComponentName' },
    ]);
  });

  it('skipped 超量截断时 skippedTotal 保留真实总数', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `43:${i}`, reason: 'noComponentName' }));
    const a = pickTakeoverAudit(mkTakeover({ skipped: many }));
    expect(a.skippedTotal).toBe(20);
    expect(a.skipped.length).toBe(16);
  });

  it('fail-open：空/畸形输入返回 null（不编造零值结论）', () => {
    expect(pickTakeoverAudit(null)).toBeNull();
    expect(pickTakeoverAudit(undefined)).toBeNull();
    expect(pickTakeoverAudit('x')).toBeNull();
    expect(pickTakeoverAudit({})).toBeNull();
  });
});

describe('Phase E · buildRejectSummary（任务级双源聚合）', () => {
  it('双源聚合：takeover 统计 + contract 缺失计数与码表', () => {
    const s = buildRejectSummary({
      takeoverAudit: pickTakeoverAudit(mkTakeover()),
      contractAudit: {
        missing: [{ code: 'header-relation-missing', id: '1' }, { code: 'header-relation-missing', id: '2' }],
        conflicts: [],
      },
    });
    expect(s.takeover.evaluated).toBe(9);
    expect(s.takeover.candidates).toBe(2);
    expect(s.contract.missingCount).toBe(2);
    expect(s.contract.conflictCount).toBe(0);
    expect(s.contract.missingCodes).toEqual(['header-relation-missing']);
  });

  it('单源可用：contractAudit 缺席时 contract=null 不编造', () => {
    const s = buildRejectSummary({ takeoverAudit: pickTakeoverAudit(mkTakeover()), contractAudit: null });
    expect(s.takeover.candidates).toBe(2);
    expect(s.contract).toBeNull();
  });

  it('双源皆空 → null（无信息不落盘不刷日志）', () => {
    expect(buildRejectSummary({ takeoverAudit: null, contractAudit: null })).toBeNull();
    expect(buildRejectSummary({})).toBeNull();
  });

  it('fail-open：畸形 contractAudit 不抛错按空聚合', () => {
    const s = buildRejectSummary({
      takeoverAudit: pickTakeoverAudit(mkTakeover()),
      contractAudit: { missing: 'x', conflicts: 42 },
    });
    expect(s.contract.missingCount).toBe(0);
    expect(s.contract.conflictCount).toBe(0);
  });
});

describe('Phase E · formatRejectSummaryLine（一行确定性日志）', () => {
  it('含全部关键计数且键值确定（可 grep）', () => {
    const s = buildRejectSummary({
      takeoverAudit: pickTakeoverAudit(mkTakeover()),
      contractAudit: { missing: [{ code: 'k', id: '1' }], conflicts: [] },
    });
    const line = formatRejectSummaryLine(s);
    expect(line).toContain('REJECT-SUMMARY');
    expect(line).toContain('evaluated=9');
    expect(line).toContain('candidates=2');
    expect(line).toContain('header=1');
    expect(line).toContain('list=1');
    expect(line).toContain('listDirections:row=1,column=0');
    expect(line).toContain('listItemBg=3,declared=2,subtree=1,skipped=0');
    // 🔴 步①②：`listGeo:negGap=0` 而产物含负值 ⇒ 判据失效。故 0 也必须打出来。
    // 🔴 步③：`widthNotUniform=0` 而产物仍含异宽 `FG_LIST_WIDTHS` ⇒ 步③ 判据失效，同样 0 也打。
    expect(line).toContain('listGeo:negGap=1,geoNotReady=0,relaxed=0,widthNotUniform=0');
    expect(line).toContain('suppressed:statRow=1');
    expect(line).toContain('skipped=2');
    expect(line).toContain('anchorRepairs=2');
    expect(line).toContain('contract:missing=1');
    expect(line).toContain('conflicts=0');
  });

  it('零命中形态也要一行可见（0 命中 ≠ 静默）', () => {
    const a = pickTakeoverAudit(mkTakeover({
      map: new Map(), evaluated: 5, skipped: [{ id: '43:1', reason: 'notCollapsedList' }],
    }));
    const s = buildRejectSummary({ takeoverAudit: a, contractAudit: null });
    const line = formatRejectSummaryLine(s);
    expect(line).toContain('candidates=0');
    expect(line).toContain('evaluated=5');
    expect(line).toContain('skipped=1');
  });
});

describe('Phase E · 接线判据（role 回写 + graph 落盘 + 零命中可见）', () => {
  it('microcode-engineer：评估后回写 takeoverAudit 且主 return 透传', () => {
    const src = readSrc('../../roles/microcode-engineer.js');
    expect(src).toMatch(/pickTakeoverAudit\(_fgTakeover\)/);
    expect(src).toMatch(/takeoverAudit: this\._fgTakeoverAudit/);
  });

  it('microcode-engineer：接管评估无条件单行日志（0 命中可见）', () => {
    const src = readSrc('../../roles/microcode-engineer.js');
    expect(src).toMatch(/刀53 接管评估/);
  });

  it('vue3-engineer：同款回写 + 透传 + 无条件单行日志', () => {
    const src = readSrc('../../roles/vue3-engineer.js');
    expect(src).toMatch(/pickTakeoverAudit\(_fgTakeover\)/);
    expect(src).toMatch(/takeoverAudit: this\._fgTakeoverAudit/);
    expect(src).toMatch(/刀53 接管评估/);
  });

  it('phase2/vue3 两 graph：visual 节点暂存 contractAudit + 生成节点落 reject-summary', () => {
    const p2 = readSrc('../../graphs/mc-component-graph-phase2.js');
    const v3 = readSrc('../../graphs/mc-component-graph-vue3.js');
    for (const [name, src] of [['phase2', p2], ['vue3', v3]]) {
      // 🔴 真机修正断言：读取位置必须含 layoutStructure 双路归一（parser 挂在 parsed 上，
      // 顶层 result.contractAudit 恒 undefined——mc-max-1793452481019 实锤）
      expect(src).toMatch(/result\.layoutStructure\?\.contractAudit/);
      expect(src).toMatch(/state\._contractAudit = __contractAudit/);
      expect(src).toMatch(/_saveCheckpoint\?\.\('reject-summary'/);
      expect(src).toMatch(/buildRejectSummary\(/);
    }
  });
});

/**
 * 🔴 2026-11-03（列表卡盒真值治本 · 步①②）：负间距总闸 + 几何真值可见化。
 *
 * 病灶：`detectListLeaf` 的 row 分支（takeover `:2364`）只以 `boxesReady` 为守卫，
 * **不看 `geoReady`（同宽同高）**，异宽帧盒按 x 相减必然为负 ⇒ 产物写出
 * `FG_LIST_GAPS=[-11,-12]`（实测 c-vehicle-monitor-c2f78898，172 产物中 3 例，纵向横向都复发）。
 *
 * 判据（不可伪造）：间距非负是**几何恒真** —— 不需要任何真值对账，故零误伤。
 * 处置为「置 null（回落自然流）」而**非 clamp 成 0**：0 会把算错伪装成设计无间距。
 */
describe('步①② · 列表卡盒负间距总闸（阴性/阳性对照 + 同构锁）', () => {
  // 阴性对照：合法几何（等宽 + 正间距）⇒ 不得被动过
  it('阴性对照：正间距原样保留，negGapClamped=0', () => {
    const a = pickTakeoverAudit(mkTakeover({
      listGeoNegGapClamped: 0,
      listGeoSamples: [
        { sectionId: '5:1', dir: 'row', w: 120, h: 60, widths: [120, 120, 120], gaps: [9, 9], neg: [] },
      ],
    }));
    expect(a.listGeo.negGapClamped).toBe(0);
    expect(a.listGeo.samples[0].gaps).toEqual([9, 9]);
    expect(a.listGeo.samples[0].neg).toEqual([]);
  });

  // 阳性对照：真值现场必须自洽 —— clamp 后 gaps 为 null，原始负值只在 neg 里
  it('阳性对照：负间距被拦下（gaps→null），原始负值可从 neg 回溯', () => {
    const a = pickTakeoverAudit(mkTakeover());
    expect(a.listGeo.negGapClamped).toBe(1);
    expect(a.listGeo.samples[0].gaps).toBeNull();
    expect(a.listGeo.samples[0].neg).toEqual([-11, -12]);
  });

  it('零命中形态也可见：无 list 段 ⇒ negGap=0 而非缺键（0 命中 ≠ 静默）', () => {
    const a = pickTakeoverAudit(mkTakeover({ listGeoNegGapClamped: 0, listGeoSamples: [] }));
    expect(a.listGeo.negGapClamped).toBe(0);
    expect(a.listGeo.samples).toEqual([]);
    const line = formatRejectSummaryLine(buildRejectSummary({ takeoverAudit: a, contractAudit: null }));
    expect(line).toContain('listGeo:negGap=0,geoNotReady=0,relaxed=0,widthNotUniform=0');
  });

  it('samples 封顶 8（审计行不因段数增长而膨胀）', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ sectionId: `5:${i}`, dir: 'row', w: 1, h: 1, widths: null, gaps: null, neg: [-1] }));
    const a = pickTakeoverAudit(mkTakeover({ listGeoSamples: many, listGeoNegGapClamped: 20 }));
    expect(a.listGeo.samples.length).toBe(8);
    // 计数不截断（与 skippedTotal 同口径）
    expect(a.listGeo.negGapClamped).toBe(20);
  });

  // 同构锁：实现侧必须真的「置 null」且挂上计数聚合；防止后续被改成 clamp 成 0 而测试仍绿
  it('同构锁：takeover 实现必须置 null（非 clamp 0）并聚合计数', () => {
    const src = readSrc('../folded-grid-section-takeover.js');
    expect(src).toMatch(/negGapValues\s*=\s*Array\.isArray\(gaps\)\s*\?\s*gaps\.filter/);
    expect(src).toMatch(/if\s*\(negGapClamped\)\s*gaps\s*=\s*null;/);
    expect(src).not.toMatch(/gaps\s*=\s*gaps\.map\(\s*\(g\)\s*=>\s*Math\.max\(0/);
    expect(src).toMatch(/out\.listGeoNegGapClamped\s*\+=\s*1/);
    expect(src).toMatch(/out\.listGeoGeoNotReady\s*\+=\s*1/);
    expect(src).toMatch(/listGeo,/);
  });
});

/**
 * 🔴 2026-11-03（列表卡盒真值治本 · 步③）：row 分支缺 `geoReady` 守卫。
 *
 * 病灶：`detectListLeaf` 的 row 分支（takeover `:2364`）原判据
 * `if (boxesReady && direction === 'row')` **不看 `geoReady`**，而异宽帧盒按
 * `x(后) − (x(前)+w(前))` 相减必然跟随宽度误差产生错值 ⇒ 产物的逐项宽度
 * `FG_LIST_WIDTHS` 与横向 `gaps` **同源于同一个不可信盒**。
 *
 * 判据（治本）：row 的横向几何（宽度+间距）只取决于**宽度轴**。可证条件二选一：
 *   ① `sameWidth`：与 v-for「重复成员同构」契约一致 ⇒ 可下发；
 *   ② `horizProven`：每卡盒都由 `resolveCardBox` 独立证明（`node` 非空）⇒ 真异宽也是真值 ⇒ 可下发。
 * 两者皆不满足（回退盒 + 异宽）⇒ 横向几何**不可证** ⇒ 同门拦下（宽度与间距一起不下发）。
 *
 * 🔴 为何不能只拦宽度：宽度与间距由**同一盒**同时决定，只拦一个会留下自相矛盾态。
 * 🔴 为何必须保留 ② 支路：只用 `sameWidth` 会误伤「逐项已证明的真异宽」样本（那才是事实）。
 */
describe('步③ · 列表 row 异宽拦横向几何（同宽/已证明二支路 + 防误伤 + 同构锁）', () => {
  it('阴性对照：同宽（sameWidth）⇒ 横向几何照发，widthNotUniform=0', () => {
    const a = pickTakeoverAudit(mkTakeover({
      listGeoWidthNotUniform: 0,
      listGeoNegGapClamped: 0,
      listGeoSamples: [
        { sectionId: '5:1', dir: 'row', w: 120, h: 60, rawW: [120, 120, 120], widths: [120, 120, 120], gaps: [9, 9], neg: [], wnu: false },
      ],
    }));
    expect(a.listGeo.widthNotUniform).toBe(0);
    expect(a.listGeo.samples[0].widths).toEqual([120, 120, 120]);
    expect(a.listGeo.samples[0].gaps).toEqual([9, 9]);
  });

  // 阳性对照：回退盒 + 异宽 ⇒ 横向几何未下发（widths/gaps 皆 null），但原始帧盒宽度可回溯
  it('阳性对照：回退盒异宽 ⇒ widths/gaps 皆不下发，rawW 保留真值现场', () => {
    const a = pickTakeoverAudit(mkTakeover({
      listGeoWidthNotUniform: 1,
      listGeoNegGapClamped: 0,
      listGeoSamples: [
        { sectionId: '136:121', dir: 'row', w: 141, h: 60, rawW: [141, 120, 140], widths: null, gaps: null, neg: [], wnu: true },
      ],
    }));
    expect(a.listGeo.widthNotUniform).toBe(1);
    // 🔴 同门：宽度与间距必须**同时**不下发（不能只拦一个）
    expect(a.listGeo.samples[0].widths).toBeNull();
    expect(a.listGeo.samples[0].gaps).toBeNull();
    // 原始帧盒宽度真值必须可回溯（否则「不下发」就是新的静默降级）
    expect(a.listGeo.samples[0].rawW).toEqual([141, 120, 140]);
    expect(a.listGeo.samples[0].wnu).toBe(true);
  });

  it('零命中形态也可见：无异宽段 ⇒ widthNotUniform=0 而非缺键（0 命中 ≠ 静默）', () => {
    const a = pickTakeoverAudit(mkTakeover({ listGeoWidthNotUniform: 0, listGeoSamples: [] }));
    expect(a.listGeo.widthNotUniform).toBe(0);
    const line = formatRejectSummaryLine(buildRejectSummary({ takeoverAudit: a, contractAudit: null }));
    expect(line).toContain('widthNotUniform=0');
  });

  // 同构锁：row 分支必须挂 `widthNotUniform` 守卫，且必须「同门」拦宽度与间距
  it('同构锁：row 分支必须有 widthNotUniform 守卫且同门拦宽度+间距', () => {
    const src = readSrc('../folded-grid-section-takeover.js');
    // ① 独立宽度轴判定必须存在（否则 row 无法只按宽度轴裁决）
    expect(src).toMatch(/const\s+sameWidth\s*=\s*boxesReady\s*&&\s*cardBoxes\.every\(/);
    // ② 防误伤支路：逐项已证明（node 非空）
    expect(src).toMatch(/const\s+horizProven\s*=\s*boxesReady\s*&&\s*cards\.every\(\s*\(c\)\s*=>\s*!!c\.node\s*\)/);
    // ③ 判定式：row ∧ !similarWidth ∧ !horizProven
    //    🛡️ 2026-11-06：否定项由 `sameWidth`（精确等值）改为 `similarWidth`（近似带）——
    //    视觉阶段只能判「大概相似」，用等值当闸门会让一个 11px 离群盒废掉整段真值
    //    （64a1a31f 实锤）。相似带判据本身必须存在且单一来源：
    expect(src).toMatch(/const\s+similarWidth\s*=\s*boxesReady\s*&&\s*axisSimilar\(/);
    expect(src).toMatch(/const\s+widthNotUniform\s*=\s*boxesReady\s*&&\s*direction\s*===\s*'row'\s*&&\s*!similarWidth\s*&&\s*!horizProven/);
    // ④ 同门：`cardWidths` 与 `gaps` 赋值都必须在 `if (!widthNotUniform)` 内
    expect(src).toMatch(/if\s*\(!widthNotUniform\)\s*\{/);
    // ⑤ 计数聚合必须存在（否则审计侧静默）
    expect(src).toMatch(/out\.listGeoWidthNotUniform\s*\+=\s*1/);
    // ⑥ listGeo 必须挂 widthNotUniform 字段
    expect(src).toMatch(/widthNotUniform,/);
  });
});

describe('步④ · 列表几何锚（按几何选可见底）+ 跨度自校验（同构锁）', () => {
  it('生效计数可见：几何锚救回真机样本 ⇒ geomPicked=1、spanRejected=0', () => {
    const a = pickTakeoverAudit(
      mkTakeover({ listGeoGeomPicked: 1, listGeoSpanRejected: 0 }),
    );
    expect(a.listGeo.geomPicked).toBe(1);
    expect(a.listGeo.spanRejected).toBe(0);
    const line = formatRejectSummaryLine(buildRejectSummary({ takeoverAudit: a, contractAudit: null }));
    expect(line).toContain('geomPicked=1,spanRejected=0');
  });

  it('自校验拒绝计数可见：几何锚误选被拦 ⇒ spanRejected=1（是判据生效的证据，不是故障）', () => {
    const a = pickTakeoverAudit(
      mkTakeover({ listGeoGeomPicked: 3, listGeoSpanRejected: 1 }),
    );
    expect(a.listGeo.geomPicked).toBe(3); // 尝试数
    expect(a.listGeo.spanRejected).toBe(1);
    const line = formatRejectSummaryLine(buildRejectSummary({ takeoverAudit: a, contractAudit: null }));
    expect(line).toContain('geomPicked=3,spanRejected=1');
  });

  it('零命中形态也可见：两键都必须 0 而非缺键（缺键 = 真机日志无法区分「没触发」与「字段丢了」）', () => {
    const a = pickTakeoverAudit(
      mkTakeover({ listGeoGeomPicked: 0, listGeoSpanRejected: 0 }),
    );
    expect(a.listGeo.geomPicked).toBe(0);
    expect(a.listGeo.spanRejected).toBe(0);
    const line = formatRejectSummaryLine(buildRejectSummary({ takeoverAudit: a, contractAudit: null }));
    expect(line).toContain('geomPicked=0,spanRejected=0');
  });

  it('采样透传：boxW/boxX（生效盒）与 rawW/rawX（帧轨）必须并列，geom/spanRej 标记齐备', () => {
    const a = pickTakeoverAudit(
      mkTakeover({
        listGeoGeomPicked: 1,
        listGeoSpanRejected: 0,
        listGeoSamples: [
          {
            sectionId: '136:121',
            dir: 'row',
            w: 120,
            h: 60,
            rawW: [141, 120, 140],
            rawX: [274, 166, 37],
            boxW: [120, 120, 120],
            boxX: [295, 166, 37],
            geom: 3,
            spanRej: false,
            widths: [120, 120, 120],
            gaps: [9, 9],
            neg: [],
            wnu: false,
          },
        ],
      }),
    );
    const s0 = a.listGeo.samples[0];
    expect(s0.rawW).toEqual([141, 120, 140]); // 帧轨真值（不随支路漂移）
    expect(s0.boxW).toEqual([120, 120, 120]); // 生效卡盒（可见底）
    expect(s0.boxX).toEqual([295, 166, 37]);
    expect(s0.geom).toBe(3);
    expect(s0.spanRej).toBe(false);
    expect(s0.gaps).toEqual([9, 9]);
  });

  // 🔴 同构锁：步④ 的四条判据一旦被「简化」掉，真机样本会静默退回负间距
  it('同构锁：几何锚必须「不限 SOLID + 含于帧盒 + 共享边 + 面积最大」，且跨度自校验存在', () => {
    const src = readSrc('../folded-grid-section-takeover.js');
    // ① 几何锚函数存在，且**不限** SOLID（`visible !== false` 即可，不要求 `type === 'SOLID'`）
    expect(src).toMatch(/const\s+pickVisibleFillBox\s*=/);
    expect(src).toMatch(/fills\.some\(\(f\)\s*=>\s*f\s*&&\s*f\.visible\s*!==\s*false\)/);
    // ② 方向必须是「行盒 ⊇ 卡盒」（与颜色锚相反）—— 沿用 `cb.w >= rowBox.w` 即回归病灶
    expect(src).toMatch(/boxContains\(rowBox,\s*cb\)/);
    // ③ 必须排除 TEXT（TEXT 的 fills 是字色）
    expect(src).toMatch(/isText/);
    // ④ 必须与行盒共享至少一条边（排除卡内居中浮块）
    expect(src).toMatch(/sharesEdge\(rowBox,\s*cb\)/);
    // ⑤ 多候选必须取面积最大
    expect(src).toMatch(/cands\.sort\(\(a,\s*z\)\s*=>\s*z\.area\s*-\s*a\.area\)/);
    // ⑥ 跨度自校验必须存在，且 ±2 容差（不是随意阈值）
    expect(src).toMatch(/Math\.abs\(sp\s*-\s*sr\)\s*>\s*2/);
    // ⑦ 颜色锚未命中时**不得** immediate return（否则几何锚永远跑不到）
    expect(src).not.toMatch(/return ok \? \{ box: cb, node, fillNode: hit \} : \{ box: rowBox, node: null, fillNode: null \};/);
    // ⑧ 计数聚合：生效口径必须排除 spanRejected（否则「尝试」会被算成「生效」）
    expect(src).toMatch(/out\.listGeoGeomPicked\s*\+=\s*1/);
    expect(src).toMatch(/lg\.geomPicked > 0 && !lg\.spanRejected/);
    expect(src).toMatch(/out\.listGeoSpanRejected\s*\+=\s*1/);
  });
});

describe('步⑤ · 卡内布局几何真值（名称/数值堆叠 + 数值/单位同行）（审计归一 + 同构锁）', () => {
  it('生效计数可见：判据落点三卡一致 ⇒ innerStacked=1、vPartsInline=1（0 也打）', () => {
    const a = pickTakeoverAudit(
      mkTakeover({ listGeoInnerStacked: 1, listGeoValuePartsInline: 1 }),
    );
    expect(a.listGeo.innerStacked).toBe(1);
    expect(a.listGeo.valuePartsInline).toBe(1);
    const line = formatRejectSummaryLine(buildRejectSummary({ takeoverAudit: a, contractAudit: null }));
    expect(line).toContain('innerStacked=1');
    expect(line).toContain('vPartsInline=1');
  });

  it('冲突计数可见：各卡投票不一致被拦 ⇒ innerConflict=1（是判据在工作，不是故障）', () => {
    const a = pickTakeoverAudit(mkTakeover({ listGeoInnerConflict: 1, listGeoInnerStacked: 0 }));
    expect(a.listGeo.innerConflict).toBe(1);
    expect(a.listGeo.innerStacked).toBe(0); // 被拦 ⇒ 不计生效（否则「尝试」会被算成「生效」）
    const line = formatRejectSummaryLine(buildRejectSummary({ takeoverAudit: a, contractAudit: null }));
    expect(line).toContain('innerConflict=1');
    expect(line).toContain('innerStacked=0');
  });

  it('零命中形态也可见：五键都必须 0 而非缺键（缺键 = 无法区分「没触发」与「字段丢了」）', () => {
    const a = pickTakeoverAudit(
      mkTakeover({
        listGeoInnerStacked: 0,
        listGeoInnerInline: 0,
        listGeoInnerConflict: 0,
        listGeoValuePartsInline: 0,
        listGeoValuePartsStacked: 0,
      }),
    );
    expect(a.listGeo.innerStacked).toBe(0);
    expect(a.listGeo.innerInline).toBe(0);
    expect(a.listGeo.innerConflict).toBe(0);
    expect(a.listGeo.valuePartsInline).toBe(0);
    expect(a.listGeo.valuePartsStacked).toBe(0);
    const line = formatRejectSummaryLine(buildRejectSummary({ takeoverAudit: a, contractAudit: null }));
    expect(line).toContain('innerStacked=0,innerInline=0,innerConflict=0,vPartsInline=0,vPartsStacked=0');
  });

  it('采样透传：inner/innerProv/vParts/vGap 必须与几何盒同条落盘（现场可回溯）', () => {
    const a = pickTakeoverAudit(
      mkTakeover({
        listGeoInnerStacked: 1,
        listGeoSamples: [
          {
            sectionId: '136:121',
            dir: 'row',
            w: 120,
            h: 60,
            boxW: [120, 120, 120],
            boxX: [295, 166, 37],
            inner: 'stacked',
            innerProv: 3,
            vParts: 'inline',
            vGap: 2,
          },
        ],
      }),
    );
    const s0 = a.listGeo.samples[0];
    expect(s0.inner).toBe('stacked');
    expect(s0.innerProv).toBe(3);
    expect(s0.vParts).toBe('inline');
    expect(s0.vGap).toBe(2);
  });

  // 🔴 同构锁：步⑤ 的判据一旦被「简化」，真机样本会静默退回「数值贴右 + 数值/单位两行」
  it('同构锁：几何原语 + 三道 fail-open 闸 + 阈值/分母口径 + 计数与日志齐备', () => {
    const src = readSrc('../folded-grid-section-takeover.js');
    // ① 三个纯几何原语必须存在
    expect(src).toMatch(/const\s+textBoxesIn\s*=\s*\(node\)\s*=>/);
    expect(src).toMatch(/const\s+uniqueTextBox\s*=\s*\(tb,\s*s\)\s*=>/);
    expect(src).toMatch(/const\s+overlapRatio\s*=\s*\(a,\s*b,\s*axis\)\s*=>/);
    // ② 重叠率分母必须取**较窄者**（否则「小盒被大盒包含」算不出 1.0 ⇒ 判据静默失效）
    expect(src).toMatch(/const\s+m\s*=\s*Math\.min\(la,\s*lb\)/);
    // ③ 阈值口径：50% + 反向轴「不重叠」（不是「不显著重叠」——宽松化会吃掉真机样本）
    expect(src).toMatch(/xr\s*>\s*0\.5\s*&&\s*yr\s*<=\s*0\.5/);
    expect(src).toMatch(/yr\s*>\s*0\.5\s*&&\s*xr\s*<=\s*0\.5/);
    // ④ 闸①：配对必须唯一（0 个取不到真值 / ≥2 个有歧义 ⇒ 一律 null，绝不按顺序猜）
    expect(src).toMatch(/hit\.length\s*===\s*1\s*\?\s*hit\[0\]\.box\s*:\s*null/);
    // ⑤ 闸②：投票必须一致；出现第二种即冲突（不下发）
    expect(src).toMatch(/const\s+tallyVotes\s*=\s*\(vs\)\s*=>/);
    expect(src).toMatch(
      /if\s*\(uniq\.length\s*>\s*1\)\s*return\s*\{\s*dir:\s*null,\s*proven:\s*vs\.length,\s*conflict:\s*true\s*\}/,
    );
    expect(src).toMatch(/const\s+innerLayout\s*=\s*\{/);
    // ⑥ `valuePartsGap` 必须**门控在 inline 内**（纵排时 x 差无意义 ⇒ 不得下发）
    expect(src).toMatch(/vPartsTally\.dir\s*===\s*'inline'\s*&&\s*vGapUniq\.length\s*===\s*1/);
    // ⑦ 闸③：只有 stacked 移动 stats 块（inline 仅确认现状 ⇒ 判错最坏保持原样）
    expect(src).toMatch(/innerStacked\s*\?\s*statsBlock\(' {8}'\)\s*:\s*\[\]/);
    expect(src).toMatch(/innerStacked\s*\?\s*\[\]\s*:\s*statsBlock\(' {6}'\)/);
    // ⑧ 旧结构的 `margin-left:auto` 只在**非** stacked 分支（= 缺真值时逐字回退）
    expect(src).toMatch(/statsOuterStyle\s*=\s*innerStacked\s*\?/);
    expect(src).toMatch(/'margin-left:auto;display:flex;flex-direction:row;flex:none;'/);
    // ⑨ 计数聚合（审计侧不得静默）
    expect(src).toMatch(/out\.listGeoInnerStacked\s*\+=\s*1/);
    expect(src).toMatch(/out\.listGeoInnerInline\s*\+=\s*1/);
    expect(src).toMatch(/out\.listGeoInnerConflict\s*\+=\s*1/);
    expect(src).toMatch(/out\.listGeoValuePartsInline\s*\+=\s*1/);
    expect(src).toMatch(/out\.listGeoValuePartsStacked\s*\+=\s*1/);
    // ⑩ 一行日志必须能 grep（0 也打）——这是真机验证的唯一入口
    const rs = readSrc('../reject-summary.js');
    expect(rs).toMatch(/innerStacked=\$\{t\.listGeo\?\.innerStacked \?\? 0\}/);
    expect(rs).toMatch(/innerConflict=\$\{t\.listGeo\?\.innerConflict \?\? 0\}/);
    expect(rs).toMatch(/vPartsInline=\$\{t\.listGeo\?\.valuePartsInline \?\? 0\}/);
  });
});
