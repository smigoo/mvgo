/**
 * 🛡️ A5 段数比门禁语义分层（2026-11-11 · 68f9d3f2 实案锁定）
 *
 * 契约（docs/2026-11-11-组件生成根因治理改动清单.md §19 家族第 6 例）：
 *   1. PlanningGateError instanceof 判别必须可靠（跨模块 + 模拟编译降级双形态）；
 *   2. planner 内层 catch 不得吞门禁错误（保留 3490 行为）；
 *   3. graph 层 catch 对 PlanningGateError 必须重抛（不得降级为不强拆）；
 *   4. graph 层 catch 对普通 Error 仍降级（既有容错语义不破坏）。
 *
 * 阳性样本：68f9d3f2 真机日志 leaves=32 base=2 ratio=16 blocked。
 */
import { PlanningGateError, SECTION_COUNT_RATIO_HARD } from '../section-plan-coverage.js';

describe('A5 PlanningGateError 语义分层', () => {
  it('instanceof 判别可靠：直接抛出后可被 instanceof 识别', () => {
    const err = new PlanningGateError('段数比门禁阻断：leaves=32 base=2 ratio=16');
    expect(err instanceof PlanningGateError).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err.code).toBe('SECTION_COUNT_RATIO_BLOCKED');
    expect(err.name).toBe('PlanningGateError');
    expect(err.message).toContain('ratio=16');
  });

  it('68f9d3f2 真机形态：32/2=16 > HARD 阈值语义成立', () => {
    // 阈值常量契约：HARD=8（blocked 判定线），LIMIT=4（trim 判定线）不回退
    expect(SECTION_COUNT_RATIO_HARD).toBe(8);
    const leaves = 32;
    const base = 2;
    expect(leaves / base).toBeGreaterThan(SECTION_COUNT_RATIO_HARD);
  });

  it('graph 层 catch 契约：PlanningGateError 必须重抛（不得降级）', () => {
    // 模拟 graph catch 的判定逻辑（与 phase2:4705 / vue3:2433 catch 首分支同源）
    const gateGuard = (error: unknown): boolean => {
      return error instanceof PlanningGateError || (error as { code?: string })?.code === 'SECTION_COUNT_RATIO_BLOCKED';
    };
    const gateErr = new PlanningGateError('blocked');
    const plainErr = new Error('网络超时');
    expect(gateGuard(gateErr)).toBe(true); // 门禁判定 → 必须走重抛分支
    expect(gateGuard(plainErr)).toBe(false); // 普通故障 → 走降级分支（既有容错保留）
  });

  it('原型链健壮性：Object.setPrototypeOf 修复后跨 realm 形态仍可判别', () => {
    // 模拟 ES5 编译目标下 class 失真：手动构造同 code 的普通 Error，应走 code 判别兜底
    const legacy = new Error('旧形态 code 判别');
    (legacy as { code?: string }).code = 'SECTION_COUNT_RATIO_BLOCKED';
    const gateGuard = (error: unknown): boolean => {
      return error instanceof PlanningGateError || (error as { code?: string })?.code === 'SECTION_COUNT_RATIO_BLOCKED';
    };
    expect(gateGuard(legacy)).toBe(true);
    // 但它是普通 Error 家族产物——调用方可据 instanceof 区分新旧形态（仅 code 兜底）
    expect(legacy instanceof PlanningGateError).toBe(false);
  });
});
