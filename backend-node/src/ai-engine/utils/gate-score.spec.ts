import { computeGateScore, hasHardPublishBlock } from './gate-score.js';

describe('hasHardPublishBlock（发布硬闸 021/022/023）', () => {
  test('空列表 / 无 BLOCK → false', () => {
    expect(hasHardPublishBlock([])).toBe(false);
    expect(hasHardPublishBlock([{ id: 'FLEX-003', severity: 'WARN' }])).toBe(false);
    expect(hasHardPublishBlock([{ id: 'CODE-020', severity: 'BLOCK' }])).toBe(false);
  });

  // 🛡️ 2026-11-16 收窄（P1）：只保留「渲染必然空白/加载失败」的 CODE-023。
  test('023 BLOCK → true（唯一保留的形态类硬闸）', () => {
    expect(hasHardPublishBlock([{ id: 'CODE-023', severity: 'BLOCK' }])).toBe(true);
    // 023-ERROR = 检测器自身异常 ⇒ 已改 fail-open WARN，不再进硬闸
    expect(hasHardPublishBlock([{ id: 'CODE-023-ERROR', severity: 'WARN' }])).toBe(false);
  });

  // 阴性对照：纯静态形态判据（死 import / 资源零挂载）不再否决发布 —— 最多丢一张背景，
  // 属「欠佳」而非「打不开」；仍是 BLOCK 计数项、照旧进 gateScore 与待补清单。
  test('021/022 BLOCK → false（已摘出硬闸，降级交付 + 待补清单）', () => {
    expect(hasHardPublishBlock([{ id: 'CODE-021', severity: 'BLOCK' }])).toBe(false);
    expect(hasHardPublishBlock([{ id: 'CODE-022', severity: 'BLOCK' }])).toBe(false);
    expect(hasHardPublishBlock([{ id: 'CODE-021-ERROR', severity: 'BLOCK' }])).toBe(false);
    expect(hasHardPublishBlock([{ id: 'CODE-022-ERROR', severity: 'BLOCK' }])).toBe(false);
  });

  test('021 为 WARN（非 BLOCK）→ false', () => {
    expect(hasHardPublishBlock([{ id: 'CODE-021', severity: 'WARN' }])).toBe(false);
  });

  // 🛡️ 层 7（方案 A）：WARN 升级注入的合成 BLOCK（<id>-ESCALATED）也必须进发布硬闸，
  //    否则「升级」在重试耗尽后仍会被软失败降级放行（= 零生效）。
  describe('层 7：WARN 升级 BLOCK（<id>-ESCALATED）', () => {
    // 🛡️ 2026-11-16：升级默认只留痕（空集合）⇒ -ESCALATED 默认不认；需显式 opt-in。
    test('默认（未 opt-in）→ -ESCALATED 一律 false', () => {
      const prev = process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
      delete process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
      try {
        expect(hasHardPublishBlock([{ id: 'FLEX-004-ESCALATED', severity: 'BLOCK' }])).toBe(false);
        expect(hasHardPublishBlock([{ id: 'TEXT-AXIS-ESCALATED', severity: 'BLOCK' }])).toBe(false);
      } finally {
        if (prev !== undefined) process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = prev;
      }
    });

    test('opt-in 后策略内 id 的 -ESCALATED → true', () => {
      const prev = process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
      process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = 'FLEX-004,TEXT-AXIS';
      try {
        expect(hasHardPublishBlock([{ id: 'FLEX-004-ESCALATED', severity: 'BLOCK' }])).toBe(true);
        expect(hasHardPublishBlock([{ id: 'TEXT-AXIS-ESCALATED', severity: 'BLOCK' }])).toBe(true);
      } finally {
        if (prev === undefined) delete process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
        else process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = prev;
      }
    });

    test('策略外 id 的 -ESCALATED → false（逐 id 决策，不得放宽）', () => {
      const prev = process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
      process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = 'FLEX-004,TEXT-AXIS';
      try {
        expect(hasHardPublishBlock([{ id: 'STYLE-002-ESCALATED', severity: 'BLOCK' }])).toBe(false);
        expect(hasHardPublishBlock([{ id: 'FLEX-002-ESCALATED', severity: 'BLOCK' }])).toBe(false);
      } finally {
        if (prev === undefined) delete process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
        else process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = prev;
      }
    });

    test('severity 非 BLOCK 的 -ESCALATED → false', () => {
      const prev = process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
      process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = 'FLEX-004';
      try {
        expect(hasHardPublishBlock([{ id: 'FLEX-004-ESCALATED', severity: 'WARN' }])).toBe(false);
      } finally {
        if (prev === undefined) delete process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
        else process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = prev;
      }
    });

    test('env 覆盖：MVGO_GATE_ESCALATE_BLOCK_IDS=none → 全部 -ESCALATED 失效', () => {
      const prev = process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
      process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = 'none';
      try {
        expect(hasHardPublishBlock([{ id: 'FLEX-004-ESCALATED', severity: 'BLOCK' }])).toBe(false);
      } finally {
        if (prev === undefined) delete process.env.MVGO_GATE_ESCALATE_BLOCK_IDS;
        else process.env.MVGO_GATE_ESCALATE_BLOCK_IDS = prev;
      }
    });
  });
});

describe('computeGateScore（软失败评分）', () => {
  test('无 issue → 满分 100，四维度皆空', () => {
    const r = computeGateScore([]);
    expect(r.score).toBe(100);
    expect(r.blockCount).toBe(0);
    expect(r.dimensions.map((d) => d.name)).toEqual(['结构', '资源', '类名', '语义']);
    expect(r.dimensions.every((d) => d.blockCount === 0 && d.warnCount === 0)).toBe(true);
  });

  test('BLOCK 每项扣 10 分、WARN 每项扣 2 分，下限 0', () => {
    const r = computeGateScore([
      { id: 'CODE-021', severity: 'BLOCK', message: '死代码' },
      { id: 'CODE-020', severity: 'BLOCK', message: 'class 未定义' },
      { id: 'CODE-019', severity: 'BLOCK', message: '资源 prop 未传' },
      { id: 'FLEX-003', severity: 'WARN', message: 'flex 冲突' },
    ]);
    expect(r.blockCount).toBe(3);
    expect(r.warnCount).toBe(1);
    expect(r.score).toBe(100 - 3 * 10 - 1 * 2); // 68
  });

  test('维度归属：CODE-019→资源、CODE-020→类名、COMP-001→结构、SFC-语义', () => {
    const r = computeGateScore([
      { id: 'CODE-019', severity: 'BLOCK', message: 'x' },
      { id: 'CODE-020', severity: 'BLOCK', message: 'x' },
      { id: 'COMP-001', severity: 'BLOCK', message: 'x' },
      { id: 'CODE-021', severity: 'BLOCK', message: 'x' },
      { id: 'SFC-UNDECLARED', severity: 'BLOCK', message: 'x' },
    ]);
    const dim = Object.fromEntries(r.dimensions.map((d) => [d.name, d.blockCount]));
    expect(dim['资源']).toBe(1); // CODE-019
    expect(dim['类名']).toBe(1); // CODE-020
    expect(dim['结构']).toBe(2); // COMP-001 + CODE-021
    expect(dim['语义']).toBe(1); // SFC-UNDECLARED
  });

  test('大量 BLOCK 时分数钳到 0', () => {
    const issues = Array.from({ length: 20 }, (_, i) => ({
      id: 'CODE-021',
      severity: 'BLOCK',
      message: `x${i}`,
    }));
    expect(computeGateScore(issues).score).toBe(0);
  });

  test('单维度 issue 明细最多 5 条', () => {
    const issues = Array.from({ length: 10 }, (_, i) => ({
      id: 'CODE-019',
      severity: 'BLOCK',
      message: `x${i}`,
    }));
    const r = computeGateScore(issues);
    const resDim = r.dimensions.find((d) => d.name === '资源');
    expect(resDim!.issues.length).toBe(5);
    expect(resDim!.blockCount).toBe(10);
  });
});
