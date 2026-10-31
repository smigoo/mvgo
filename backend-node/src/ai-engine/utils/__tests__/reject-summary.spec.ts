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
  statRowHits: 0,
  statRowSuppressed: 1,
  tableHits: 1,
  tableSuppressed: 0,
  tableAnchorRepairs: 2,
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
    expect(a.hits).toEqual({ header: 1, grid: 0, text: 0, icon: 0, legend: 0, kvGrid: 0, list: 1, statRow: 0, table: 1 });
    expect(a.suppressed).toEqual({ statRow: 1, table: 0 });
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
