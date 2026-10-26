import {
  ESCALATED_SUFFIX,
  WARN_ESCALATION_POLICY,
  DEFAULT_ACTION,
  policyBlockIds,
  isEscalationEnabled,
  resolveAfterStreak,
  resolveBlockActionIds,
  isEscalatedBlockId,
  actionOf,
  rationaleOf,
  resolveWarnEscalations,
} from './gate-severity.js';

/**
 * 层 7（2026-10-26 · 方案 A）：WARN 升级 = 门禁分级 单一真相源。
 *
 * 设计铁律（本 spec 逐条钉死）：
 *  ① 只有策略表里 action==='BLOCK' 的 id 才能升级为发布阻断（逐 id 决策，其余一律 WARN 留痕）。
 *  ② 开关 MVGO_GATE_WARN_ESCALATE=0 ⇒ 完全停用（连 streak 都不计）。
 *  ③ streak 必须在跨轮 `prevStreak` 上累加；同一轮内同 id 重复出现只算 1。
 *  ④ 升级产出的 blockIssues 形状固定（id 带 -ESCALATED 后缀、severity='BLOCK'、带 escalatedFrom/streak）。
 */

const warn = (id: string, message = 'x') => ({
  id,
  severity: 'WARN',
  message,
  file: 'package/a.vue',
});

describe('gate-severity 策略表', () => {
  test('策略表是冻结对象（防运行期被改）', () => {
    expect(Object.isFrozen(WARN_ESCALATION_POLICY)).toBe(true);
  });

  test('BLOCK 决策项恰为 FLEX-004 / TEXT-AXIS（逐 id 决策的阳性名单）', () => {
    expect([...policyBlockIds()].sort()).toEqual(['FLEX-004', 'TEXT-AXIS'].sort());
  });

  test('策略表内非 BLOCK 项一律 action=WARN，且都带 rationale', () => {
    for (const [id, rule] of Object.entries(WARN_ESCALATION_POLICY)) {
      expect(typeof rule.rationale).toBe('string');
      expect(rule.rationale.length).toBeGreaterThan(0);
      if (id !== 'FLEX-004' && id !== 'TEXT-AXIS') {
        expect(rule.action).toBe('WARN');
      }
    }
  });

  test('actionOf/rationaleOf：未登记 id 走默认 WARN + 默认理由（宁漏不误）', () => {
    expect(actionOf('FLEX-004')).toBe('BLOCK');
    expect(actionOf('STYLE-003')).toBe('WARN');
    expect(actionOf('NOT-IN-TABLE')).toBe(DEFAULT_ACTION);
    expect(rationaleOf('NOT-IN-TABLE')).toMatch(/未在/);
  });
});

describe('gate-severity 开关', () => {
  test('默认开启', () => {
    expect(isEscalationEnabled({})).toBe(true);
  });

  test('MVGO_GATE_WARN_ESCALATE=0 关闭', () => {
    expect(isEscalationEnabled({ MVGO_GATE_WARN_ESCALATE: '0' })).toBe(false);
    expect(isEscalationEnabled({ MVGO_GATE_WARN_ESCALATE: 'false' })).toBe(false);
    expect(isEscalationEnabled({ MVGO_GATE_WARN_ESCALATE: '1' })).toBe(true);
  });

  test('resolveAfterStreak：默认 2；显式合法值生效；非法回退默认', () => {
    expect(resolveAfterStreak({})).toBe(2);
    expect(resolveAfterStreak({ MVGO_GATE_ESCALATE_MAX: '5' })).toBe(5);
    expect(resolveAfterStreak({ MVGO_GATE_ESCALATE_MAX: '0' })).toBe(2);
    expect(resolveAfterStreak({ MVGO_GATE_ESCALATE_MAX: 'abc' })).toBe(2);
  });

  test('resolveBlockActionIds：默认=策略表 BLOCK 项', () => {
    expect([...resolveBlockActionIds({})].sort()).toEqual(['FLEX-004', 'TEXT-AXIS'].sort());
  });

  test('resolveBlockActionIds：none→空 / all→任意策略 id 均可 / 逗号列表→指定', () => {
    expect(resolveBlockActionIds({ MVGO_GATE_ESCALATE_BLOCK_IDS: 'none' }).size).toBe(0);
    // all 语义：任何 id 都允许升级为 BLOCK（含策略外），故 STYLE-003 也在集合内
    expect(resolveBlockActionIds({ MVGO_GATE_ESCALATE_BLOCK_IDS: 'all' }).has('STYLE-003')).toBe(
      true,
    );
    const custom = resolveBlockActionIds({ MVGO_GATE_ESCALATE_BLOCK_IDS: 'STYLE-002, FLEX-004' });
    expect(custom.has('STYLE-002')).toBe(true);
    expect(custom.has('FLEX-004')).toBe(true);
    expect(custom.has('TEXT-AXIS')).toBe(false);
  });

  test('isEscalatedBlockId：后缀 + 策略双重匹配才为真', () => {
    expect(isEscalatedBlockId('FLEX-004-ESCALATED', {})).toBe(true);
    expect(isEscalatedBlockId('STYLE-003-ESCALATED', {})).toBe(false); // 策略外
    expect(isEscalatedBlockId('FLEX-004', {})).toBe(false); // 无后缀
    expect(isEscalatedBlockId(ESCALATED_SUFFIX, {})).toBe(false); // 空 id
    expect(isEscalatedBlockId(undefined, {})).toBe(false);
  });
});

describe('resolveWarnEscalations', () => {
  test('未达阈值：escalated/blockIssues 皆空，但 streak 仍累加', () => {
    const r = resolveWarnEscalations({ issues: [warn('FLEX-004')], prevStreak: {}, env: {} });
    expect(r.warnStreak['FLEX-004']).toBe(1);
    expect(r.escalated).toHaveLength(0);
    expect(r.blockIssues).toHaveLength(0);
  });

  test('连续 2 轮（默认阈值）⇒ FLEX-004 / TEXT-AXIS 升级为 BLOCK', () => {
    const r = resolveWarnEscalations({
      issues: [warn('FLEX-004'), warn('TEXT-AXIS')],
      prevStreak: { 'FLEX-004': 1, 'TEXT-AXIS': 1 },
      env: {},
    });
    expect(r.escalated.map((e) => `${e.id}:${e.action}`).sort()).toEqual([
      'FLEX-004:BLOCK',
      'TEXT-AXIS:BLOCK',
    ]);
    expect(r.blockIssues.map((b) => b.id).sort()).toEqual([
      'FLEX-004-ESCALATED',
      'TEXT-AXIS-ESCALATED',
    ]);
  });

  test('策略外 WARN 达阈值也只留痕（action=WARN，不注入 BLOCK）', () => {
    const r = resolveWarnEscalations({
      issues: [warn('STYLE-002')],
      prevStreak: { 'STYLE-002': 5 },
      env: {},
    });
    expect(r.escalated).toHaveLength(1);
    expect(r.escalated[0].action).toBe('WARN');
    expect(r.blockIssues).toHaveLength(0);
  });

  test('同一轮内同 id 重复出现只算 1（按 id 去重）', () => {
    const r = resolveWarnEscalations({
      issues: [warn('FLEX-004', 'a'), warn('FLEX-004', 'b'), warn('FLEX-004', 'c')],
      prevStreak: {},
      env: {},
    });
    expect(r.warnStreak['FLEX-004']).toBe(1);
  });

  test('非 WARN（BLOCK/severity 缺失）不参与 streak', () => {
    const r = resolveWarnEscalations({
      issues: [
        { id: 'CODE-001', severity: 'BLOCK' },
        { id: 'NO-SEV' },
        warn('FLEX-004'),
      ],
      prevStreak: {},
      env: {},
    });
    expect(Object.keys(r.warnStreak)).toEqual(['FLEX-004']);
  });

  test('开关关闭：enabled=false ⇒ 不算不升级（streak 也不产生）', () => {
    const r = resolveWarnEscalations({
      issues: [warn('FLEX-004')],
      prevStreak: { 'FLEX-004': 9 },
      env: { MVGO_GATE_WARN_ESCALATE: '0' },
    });
    expect(r.enabled).toBe(false);
    expect(r.escalated).toHaveLength(0);
    expect(r.blockIssues).toHaveLength(0);
  });

  test('阈值可调：MVGO_GATE_ESCALATE_MAX=3 ⇒ 第 3 轮才升', () => {
    const env = { MVGO_GATE_ESCALATE_MAX: '3' };
    expect(
      resolveWarnEscalations({ issues: [warn('FLEX-004')], prevStreak: { 'FLEX-004': 1 }, env })
        .escalated,
    ).toHaveLength(0);
    expect(
      resolveWarnEscalations({ issues: [warn('FLEX-004')], prevStreak: { 'FLEX-004': 2 }, env })
        .escalated,
    ).toHaveLength(1);
  });

  test('MVGO_GATE_ESCALATE_BLOCK_IDS=none ⇒ 策略项退化为 WARN（紧急泄压阀）', () => {
    const r = resolveWarnEscalations({
      issues: [warn('FLEX-004')],
      prevStreak: { 'FLEX-004': 5 },
      env: { MVGO_GATE_ESCALATE_BLOCK_IDS: 'none' },
    });
    expect(r.escalated[0].action).toBe('WARN');
    expect(r.blockIssues).toHaveLength(0);
  });

  test('MVGO_GATE_ESCALATE_BLOCK_IDS=all ⇒ 策略外 id 也可升 BLOCK', () => {
    const r = resolveWarnEscalations({
      issues: [warn('STYLE-002')],
      prevStreak: { 'STYLE-002': 5 },
      env: { MVGO_GATE_ESCALATE_BLOCK_IDS: 'all' },
    });
    expect(r.blockIssues.map((b) => b.id)).toEqual(['STYLE-002-ESCALATED']);
  });

  test('blockIssues 形状：id 带后缀、severity=BLOCK、带 escalatedFrom/streak、message 自解释', () => {
    const r = resolveWarnEscalations({
      issues: [warn('FLEX-004', 'flex-grow 量纲混用')],
      prevStreak: { 'FLEX-004': 1 },
      env: {},
    });
    const b = r.blockIssues[0];
    expect(b.id).toBe('FLEX-004-ESCALATED');
    expect(b.severity).toBe('BLOCK');
    expect(b.escalatedFrom).toBe('FLEX-004');
    expect(b.streak).toBe(2);
    expect(b.message).toMatch(/WARN 升级/);
    expect(b.message).toMatch(/连续 2 轮/);
    expect(b.message).toMatch(/FLEX-004/);
  });

  test('prevStreak 非法（null/非对象）按空处理，不抛异常', () => {
    expect(() =>
      resolveWarnEscalations({ issues: [warn('FLEX-004')], prevStreak: null as never, env: {} }),
    ).not.toThrow();
    const r = resolveWarnEscalations({ issues: [warn('FLEX-004')], env: {} });
    expect(r.warnStreak['FLEX-004']).toBe(1);
  });

  test('空 issue 列表：streak 归零（上一轮的 id 不再出现 ⇒ 愈合）', () => {
    const r = resolveWarnEscalations({ issues: [], prevStreak: { 'FLEX-004': 4 }, env: {} });
    expect(r.warnStreak).toEqual({});
    expect(r.escalated).toHaveLength(0);
  });
});
