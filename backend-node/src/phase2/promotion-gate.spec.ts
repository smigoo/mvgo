import { evalStructureGateForPromotion } from './promotion-gate';

/**
 * 🛡️ #131（2026-10-20 · 5ef650ff 实锤）：结构 BLOCK 不得晋升「稳定版本（已过门禁）」。
 * 形态锚：pass:false + blockCount:1 + issues[IMG-SRC-001 BLOCK]（L0-B 软失败降级产物）。
 */
describe('promotion-gate · evalStructureGateForPromotion（#131）', () => {
  it('5ef650ff 形态：IMG-SRC-001 BLOCK（软失败降级）⇒ blocked，reason 含错误码', () => {
    const d = evalStructureGateForPromotion({
      runtimeGate: { status: 'PASS' }, // 实锤点：runtime PASS 但结构 BLOCK
      codeValidationResult: {
        pass: false,
        blockCount: 1,
        issues: [
          { id: 'IMG-SRC-001', severity: 'BLOCK', file: 'package/index.vue', message: '裸 img 无图源' },
        ],
      },
    });
    expect(d.blocked).toBe(true);
    expect(d.blockCount).toBe(1);
    expect(d.reason).toContain('IMG-SRC-001');
    expect(d.reason).toContain('不晋升稳定版本');
  });

  it('blockCount 缺失时从 issues 数 BLOCK ⇒ blocked', () => {
    const d = evalStructureGateForPromotion({
      codeValidationResult: {
        pass: false,
        issues: [
          { id: 'CODE-017', severity: 'BLOCK', message: 'x' },
          { id: 'CODE-022', severity: 'BLOCK', message: 'y' },
          { id: 'STYLE-001', severity: 'WARN', message: 'z' },
        ],
      },
    });
    expect(d.blocked).toBe(true);
    expect(d.blockCount).toBe(2);
  });

  it('无 codeValidationResult（lite 模式无 L0-B）⇒ 放行（阳性对照）', () => {
    expect(evalStructureGateForPromotion({}).blocked).toBe(false);
    expect(evalStructureGateForPromotion(null).blocked).toBe(false);
    expect(evalStructureGateForPromotion(undefined).blocked).toBe(false);
  });

  it('pass:true / blockCount:0 ⇒ 放行（阳性对照）', () => {
    const d = evalStructureGateForPromotion({
      codeValidationResult: { pass: true, blockCount: 0, issues: [] },
    });
    expect(d.blocked).toBe(false);
    expect(d.reason).toBeNull();
  });

  it('仅 WARN 无 BLOCK ⇒ 放行（阳性对照）', () => {
    const d = evalStructureGateForPromotion({
      codeValidationResult: {
        pass: true,
        blockCount: 0,
        issues: [{ id: 'STYLE-001', severity: 'WARN', message: 'z' }],
      },
    });
    expect(d.blocked).toBe(false);
  });

  it('_bypassed:true 带 BLOCK ⇒ 尊重显式降级放行（阳性对照）', () => {
    const d = evalStructureGateForPromotion({
      codeValidationResult: {
        pass: false,
        _bypassed: true,
        blockCount: 2,
        issues: [{ id: 'CODE-017', severity: 'BLOCK', message: 'x' }],
      },
    });
    expect(d.blocked).toBe(false);
  });
});
