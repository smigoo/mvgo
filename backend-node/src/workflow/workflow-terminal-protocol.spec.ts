/**
 * B · dynamic 自定义管线终态协议（2026-11-08）
 * 验证「无校验器不误伤 / 明确未通过判失败 / 收敛豁免 / 质量字段提升」。
 */
import { evaluateDynamicTerminal } from './workflow-terminal-protocol.js';

const state = (checkResult?: any, decision?: string) => ({
  ...(checkResult === undefined ? {} : { checkResult }),
  ...(decision === undefined ? {} : { _decision: decision }),
});

describe('B · evaluateDynamicTerminal — 阴性（不得误伤存量）', () => {
  it('无 checkResult（hello-demo 等无校验器管线）仍为 completed', () => {
    const t = evaluateDynamicTerminal(state());
    expect(t.outcome).toBe('completed');
    expect(t.quality.checkResult).toBeNull();
    expect(t.quality.blockCount).toBe(0);
  });

  it('校验器明确 passed → completed', () => {
    const t = evaluateDynamicTerminal(
      state({ checkResult: 'passed', qualityScore: 88, blockCount: 0, source: 'preview-validator' }, 'passed'),
    );
    expect(t.outcome).toBe('completed');
  });

  it('收敛豁免：checkResult 仍 needs_revision 但 _decision=passed（质量分达标/修订上限）', () => {
    const t = evaluateDynamicTerminal(
      state({ checkResult: 'needs_revision', qualityScore: 91, blockCount: 2, source: 'code-structure-validator' }, 'passed'),
    );
    expect(t.outcome).toBe('completed');
  });
});

describe('B · evaluateDynamicTerminal — 阳性（必须判失败）', () => {
  it('gate 判 needs_revision 且未收敛 → failed（旧实现恒 success:true）', () => {
    const t = evaluateDynamicTerminal(
      state({ checkResult: 'needs_revision', qualityScore: 40, blockCount: 1, source: 'code-structure-validator' }, 'needs_revision'),
    );
    expect(t.outcome).toBe('failed');
    expect(t.reason).toContain('code-structure-validator');
    expect(t.reason).toContain('blockCount=1');
  });

  it('checkResult 缺失但 blockCount>0 的矛盾态也判失败', () => {
    const t = evaluateDynamicTerminal(state({ blockCount: 3, source: 'preview-validator' }));
    expect(t.outcome).toBe('failed');
  });

  it('_decision 缺失时不给予收敛豁免', () => {
    const t = evaluateDynamicTerminal(state({ checkResult: 'needs_revision', blockCount: 1 }));
    expect(t.outcome).toBe('failed');
  });
});

describe('B · quality 载荷提升（供 completeTask.qualityGate 消费）', () => {
  it('checkResult / qualityScore / blockCount 原样提升到顶层', () => {
    const cr = {
      checkResult: 'passed',
      qualityScore: 82,
      blockCount: 0,
      errors: [],
      source: 'preview-validator',
    };
    const t = evaluateDynamicTerminal(state(cr, 'passed'));
    expect(t.quality.checkResult).toBe(cr);
    expect(t.quality.qualityScore).toBe(82);
    expect(t.quality.blockCount).toBe(0);
  });

  it('qualityScore 非数字时回退 null，不伪造分数', () => {
    const t = evaluateDynamicTerminal(state({ checkResult: 'passed', qualityScore: 'N/A' }, 'passed'));
    expect(t.quality.qualityScore).toBeNull();
  });
});
