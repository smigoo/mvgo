import { reportPatchChainError, isStructuralChainError } from './patch-chain-observer.js';

describe('patch-chain-observer（PATCH-CHAIN-ERROR 哨兵，2026-11-03 S0.2）', () => {
  const mkLogger = () => {
    const calls: { level: string; msg: string; meta?: any }[] = [];
    return {
      calls,
      info() {},
      debug() {},
      warn(msg: string, meta?: any) {
        calls.push({ level: 'warn', msg, meta });
      },
      error(msg: string, meta?: any) {
        calls.push({ level: 'error', msg, meta });
      },
    };
  };

  it('结构性错误（ReferenceError/TypeError/SyntaxError）打 PATCH-CHAIN-ERROR 计数行并自增 counter', () => {
    for (const Err of [ReferenceError, TypeError, SyntaxError]) {
      const logger = mkLogger();
      const counter: Record<string, number> = {};
      const n = reportPatchChainError(new Err('boom'), { logger, pass: 't:1', counter });
      expect(n).toBe(1);
      expect(counter.patchChainErrors).toBe(1);
      expect(
        logger.calls.some((c) => c.msg.includes('PATCH-CHAIN-ERROR')),
      ).toBe(true);
    }
  });

  it('业务分支异常（Error/RangeError/字符串抛掷）不计数、不打行', () => {
    const logger = mkLogger();
    const counter: Record<string, number> = {};
    expect(reportPatchChainError(new Error('biz'), { logger, counter })).toBe(0);
    expect(reportPatchChainError(new RangeError('biz'), { logger, counter })).toBe(0);
    expect(reportPatchChainError('string-throw', { logger, counter })).toBe(0);
    expect(counter.patchChainErrors).toBeUndefined();
    expect(logger.calls.length).toBe(0);
  });

  it('logger 缺失或自身抛错时静默容错，哨兵绝不抛出（fail-open 纪律）', () => {
    expect(reportPatchChainError(new ReferenceError('x'))).toBe(1);
    const badLogger = {
      warn() {
        throw new Error('logger broken');
      },
    };
    expect(reportPatchChainError(new TypeError('x'), { logger: badLogger })).toBe(1);
  });

  it('isStructuralChainError 判定口径', () => {
    expect(isStructuralChainError(new ReferenceError())).toBe(true);
    expect(isStructuralChainError(new TypeError())).toBe(true);
    expect(isStructuralChainError(new SyntaxError())).toBe(true);
    expect(isStructuralChainError(new Error())).toBe(false);
    expect(isStructuralChainError(null)).toBe(false);
    expect(isStructuralChainError(undefined)).toBe(false);
  });
});
