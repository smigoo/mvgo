/**
 * 🛡️ #131（2026-10-20 · mc-max-1792471465235-5ef650ff 实锤）：BLOCK 版本晋升闸门（纯函数）。
 *
 * 背景：L0-B 软失败降级（2026-09-11 设计：结构 BLOCK 重试耗尽且非 021/022/023 硬闸 ⇒
 * 任务降级完成、产物仍可预览）只应影响「任务完成态」，不应影响「版本晋升语义」。
 * 旧实现晋升 last-good 只看 runtimeGate.status === 'PASS'，结构校验结果
 *（codeValidationResult）从不参与 ⇒ 带 1 个 IMG-SRC-001 BLOCK 的产物被标
 * 「稳定版本（已过门禁）」，与详情页「1 个阻断问题」徽标自相矛盾。
 *
 * 本函数是晋升判定的唯一收口：结构 BLOCK > 0（且未被显式降级 bypass）⇒ 禁止晋升，
 * 调用方走 markCandidateDegraded 保留候选。qualityPassed / terminalError / 落库 / 配额
 * 语义一律不动（软失败「降级完成」设计不变，只纠正晋升标签）。
 */
export interface StructureGateDecision {
  /** true = 存在未 bypass 的结构 BLOCK，禁止晋升 last-good */
  blocked: boolean;
  blockCount: number;
  /** blocked 时给出版本降级原因（写入 manifest.rejectionReason / 日志） */
  reason: string | null;
}

export function evalStructureGateForPromotion(genResult: any): StructureGateDecision {
  const r = genResult?.codeValidationResult;
  // 无结构校验结果（如 lite 模式无 L0-B）⇒ 不参与晋升判定，维持原行为
  if (!r || typeof r !== 'object') return { blocked: false, blockCount: 0, reason: null };
  // _bypassed 是显式降级放行语义（条件边同款认定），尊重它
  if (r._bypassed === true) return { blocked: false, blockCount: 0, reason: null };
  const issues = Array.isArray(r.issues) ? r.issues : [];
  const blockCount =
    typeof r.blockCount === 'number'
      ? r.blockCount
      : issues.filter((i: any) => i?.severity === 'BLOCK').length;
  if (blockCount <= 0) return { blocked: false, blockCount: 0, reason: null };
  const ids = issues
    .filter((i: any) => i?.severity === 'BLOCK')
    .map((i: any) => String(i?.id || '').trim())
    .filter(Boolean)
    .slice(0, 5);
  return {
    blocked: true,
    blockCount,
    reason: `结构校验存在 ${blockCount} 项阻断（${ids.join(', ') || 'BLOCK'}，L0-B 软失败降级），保留候选版本不晋升稳定版本`,
  };
}
