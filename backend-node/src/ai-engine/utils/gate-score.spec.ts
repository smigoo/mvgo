import { computeGateScore, hasHardPublishBlock } from './gate-score.js';

describe('hasHardPublishBlock（发布硬闸 021/022/023）', () => {
  test('空列表 / 无 BLOCK → false', () => {
    expect(hasHardPublishBlock([])).toBe(false);
    expect(hasHardPublishBlock([{ id: 'FLEX-003', severity: 'WARN' }])).toBe(false);
    expect(hasHardPublishBlock([{ id: 'CODE-020', severity: 'BLOCK' }])).toBe(false);
  });

  test('021/022/023 BLOCK → true（含 -ERROR 变体）', () => {
    expect(hasHardPublishBlock([{ id: 'CODE-021', severity: 'BLOCK' }])).toBe(true);
    expect(hasHardPublishBlock([{ id: 'CODE-022', severity: 'BLOCK' }])).toBe(true);
    expect(hasHardPublishBlock([{ id: 'CODE-023', severity: 'BLOCK' }])).toBe(true);
    expect(hasHardPublishBlock([{ id: 'CODE-023-ERROR', severity: 'BLOCK' }])).toBe(true);
  });

  test('021 为 WARN（非 BLOCK）→ false', () => {
    expect(hasHardPublishBlock([{ id: 'CODE-021', severity: 'WARN' }])).toBe(false);
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
