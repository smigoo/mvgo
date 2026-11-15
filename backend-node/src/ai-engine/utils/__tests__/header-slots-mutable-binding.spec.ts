/**
 * 🛡️ P0-b 防回归（2026-11-15 · mc-max-1794714093985-c60fbe6f 实锤）
 *
 * 病灶：`execute()` 里 `headerSlots` 从 `const { ... } = params` 解构，随后
 *   `header-right-contract-recovery` 又要重新赋值 ⇒ `TypeError: Assignment to
 *   constant variable.` ⇒ PATCH-CHAIN 每任务必现、该 pass 恒被 fail-open 跳过，
 *   header-right 契约从未真正生效（两个任务双证）。
 *
 * 本 spec 用源码静态断言钉死形态：解构必须是别名、`headerSlots` 必须是 `let`。
 * 纯静态读文件，不跑 LLM、无 IO 副作用。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../roles/microcode-engineer.js');

describe('P0-b headerSlots 可变绑定', () => {
  const code = readFileSync(SRC, 'utf-8');

  it('解构使用别名（不得直接把 headerSlots 从 const 解构）', () => {
    expect(code).toMatch(/headerSlots:\s*_headerSlotsFromParams\s*=/);
  });

  it('存在 let 声明的可变副本', () => {
    expect(code).toMatch(/let\s+headerSlots\s*=\s*_headerSlotsFromParams/);
  });

  it('契约恢复段仍在，且对 headerSlots 重新赋值（证明那条路径存在）', () => {
    expect(code).toContain('execute:header-right-contract-recovery');
    expect(code).toMatch(/headerSlots\s*=\s*_hdrRecovery\.headerSlots/);
  });

  it('反例守卫：不得同时存在 const 解构 + 重新赋值（会导致 TypeError）', () => {
    // const { ... headerSlots = null ... } = params 形态必须已被消除
    const constDestructure =
      /const\s*\{[\s\S]{0,4000}?\bheaderSlots\s*=\s*null[\s\S]{0,4000}?\}\s*=\s*params/;
    expect(constDestructure.test(code)).toBe(false);
  });
});
