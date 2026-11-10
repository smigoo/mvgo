/**
 * 🛡️ F1a 段树完整性对账（2026-11-10 · 方案 v4 §3-F1a / §5）
 *
 * fixture 口径（方案 §5：按子判据分别给预期）：
 * - 流量监测 4ecaa78b 阳性：88:33 容器吞并后续全部段 ⇒ reparented 命中
 * - 重点车辆 31a9bb41 阳性：136:122 顶层真丢 ⇒ missing 命中
 * - 环境监测 cbc44755 阴性：vision/planner 全对 ⇒ 全 0（错在装配层，F1a 必须不误报）
 */
import {
  auditSegTreeIntegrity,
  collectSectionIdMap,
  contentFingerprint,
} from './seg-tree-integrity.js';

/** 流量监测离线重放形态：vision 4 段（88:33 当日总流量为容器，后续段为兄弟）→ 出口被 88:33 吞并。 */
const TRAFFIC_VISION = [
  { id: '2:3550', title: '标题栏' },
  {
    id: '88:33',
    title: '当日总流量',
    children: [{ id: '88:34', title: '流量数值卡' }],
  },
  { id: '2:3438', title: '车型分布', children: [{ id: '2:3439', title: '车型分布 sub-header' }, { id: '1263:38', title: '车型分布卡' }] },
  { id: '83:30', title: '流量预测', children: [{ id: '2:3565', title: '预测 sub-header' }, { id: 'chart-2:3604', title: '预测图' }] },
];
const TRAFFIC_EXIT = [
  { id: '2:3550', title: '标题栏' },
  {
    id: '88:33',
    title: '当日总流量',
    children: [
      { id: '88:34', title: '流量数值卡' },
      { id: '2:3439', title: '车型分布 sub-header' },
      { id: '1263:38', title: '车型分布卡' },
      { id: '2:3565', title: '预测 sub-header' },
      { id: 'chart-2:3604', title: '预测图' },
    ],
  },
];

/** 重点车辆离线重放形态：vision 3 段 → 出口丢 136:122。 */
const VEHICLE_VISION = [
  { id: '2:7959', title: '头部统计' },
  { id: '136:122', title: '今日累计' },
  { id: '136:121', title: '重点车辆列表' },
];
const VEHICLE_EXIT = [
  { id: '2:7959', title: '头部统计' },
  { id: '136:121', title: '重点车辆列表' },
];

/** 环境监测阴性：vision 与出口全树一致。 */
const ENV_VISION = [
  { id: 'sec-a', title: '环境 tabs', children: [{ id: 'sec-a-1', title: 'tab1' }] },
  { id: 'sec-b', title: '环境图表' },
];
const ENV_EXIT = [
  { id: 'sec-a', title: '环境 tabs', children: [{ id: 'sec-a-1', title: 'tab1' }] },
  { id: 'sec-b', title: '环境图表' },
];

describe('F1a · 段树完整性对账', () => {
  it('① 流量监测阳性：容器吞并 ⇒ reparented≥4 且不记 missing', () => {
    const r = auditSegTreeIntegrity(TRAFFIC_VISION, TRAFFIC_EXIT);
    expect(r.reparented.length).toBeGreaterThanOrEqual(4);
    const repIds = r.reparented.map((x) => x.id);
    expect(repIds).toEqual(expect.arrayContaining(['2:3439', '1263:38', '2:3565', 'chart-2:3604']));
    // 吞并形态：2:3438/83:30 的子段仍存活（父变了），容器本身从顶层消失但其 id 若仍在树中
    // 由全树口径定性——本 fixture 容器 id 不在出口 ⇒ 记 missing
    const missIds = r.missing.map((x) => x.id);
    expect(missIds).toEqual(expect.arrayContaining(['2:3438', '83:30']));
    // reparented 子集：vision 父 2:3438/83:30 不在出口 ⇒ missingParent 计数
    expect(r.missingParent).toBeGreaterThanOrEqual(4);
  });

  it('② 重点车辆阳性：136:122 全树找不到 ⇒ missing 命中', () => {
    const r = auditSegTreeIntegrity(VEHICLE_VISION, VEHICLE_EXIT);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]).toEqual({ id: '136:122', title: '今日累计' });
    expect(r.reparented).toHaveLength(0);
  });

  it('③ 环境监测阴性：全树一致 ⇒ 全 0（装配层错误不误报）', () => {
    const r = auditSegTreeIntegrity(ENV_VISION, ENV_EXIT);
    expect(r.missing).toHaveLength(0);
    expect(r.reparented).toHaveLength(0);
    expect(r.orderInversions).toBe(0);
    expect(r.synthetic).toBe(0);
    expect(r.comparablePairs).toBe(1); // 2 个顶层段两两一组
  });

  it('④ 顺序偏离：出口顶层次序与 vision 相反 ⇒ inversions 命中（Q2：基准用 vision 序）', () => {
    const vision = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const exit = [{ id: 'C' }, { id: 'A' }, { id: 'B' }];
    const r = auditSegTreeIntegrity(vision, exit);
    // vision 序 A(0) B(1) C(2)；exit 序 C,A,B ⇒ 逆序对 (C,A)(C,B) = 2
    expect(r.orderInversions).toBe(2);
    expect(r.comparablePairs).toBe(3);
  });

  it('⑤ 顺序对账：单侧存在的段不参与（已由 missing/synthetic 覆盖）', () => {
    const vision = [{ id: 'A' }, { id: 'X' }, { id: 'B' }];
    const exit = [{ id: 'B' }, { id: 'A' }, { id: 'chart-9:9' }];
    const r = auditSegTreeIntegrity(vision, exit);
    expect(r.orderInversions).toBe(1); // 仅 A/B 参与：B 在 A 前 ⇒ 1 个逆序
    expect(r.comparablePairs).toBe(1);
    expect(r.synthetic).toBe(1);
    expect(r.syntheticSamples).toEqual(['chart-9:9']);
    expect(r.missing.map((m) => m.id)).toEqual(['X']);
  });

  it('⑥ 重复 id 首次出现为准；children 递归收集', () => {
    const m = collectSectionIdMap([
      { id: 'P', children: [{ id: 'C1' }, { id: 'P' }] },
      { id: 'P' },
    ]);
    expect(m.get('C1')).toBe('P');
    expect(m.get('P')).toBeNull(); // 首次出现为顶层
  });

  it('⑦ contentFingerprint：等值/不等值（F2 追踪配对）', () => {
    expect(contentFingerprint('abc')).toBe(contentFingerprint('abc'));
    expect(contentFingerprint('abc')).not.toBe(contentFingerprint('abd'));
    expect(contentFingerprint('abc')).not.toBe(contentFingerprint('abcd'));
    expect(contentFingerprint(null)).toBe('non-string');
  });

  it('⑧ 空入参 fail-open：不抛异常、全 0', () => {
    const r = auditSegTreeIntegrity([], []);
    expect(r.missing).toHaveLength(0);
    expect(r.visionTotal).toBe(0);
    expect(r.comparablePairs).toBe(0);
  });
});
