/**
 * 动态自定义 workflow 运行终态判据（单一真相源，2026-11-08 B）
 *
 * 旧行为：workflow.service.ts#executeWorkflow 无条件
 *   sendComplete({ success: true, message:'工作流执行完成', result })
 * 且 checkResult 被嵌在 result.result 内，tasks.service.ts#completeTask
 * 读的是 result.checkResult ⇒ 读不到，qualityGate 恒 'warned'。
 * 结果：gate 判 needs_revision 的任务仍被报成「执行成功」。
 *
 * 本协议只裁决「dynamic 自定义管线」的终态，生产委托链
 * （isProtectedWorkflow / isPhase2Like → phase2Service）不经过此处。
 * 判据为纯函数，便于单测与前后对照；不修改任务数据结构。
 */
export function evaluateDynamicTerminal(finalState) {
  const checkResult = finalState?.checkResult;
  const decision = finalState?._decision;
  const blockCount = Number(checkResult?.blockCount) || 0;

  // 明确未通过：校验器给出 needs_revision，或仍有阻断项
  const checkerFailed =
    checkResult?.checkResult === 'needs_revision' || blockCount > 0;

  // 收敛豁免：condition 节点在「质量分达标」或「达到修订上限」时会显式
  // 把 _decision 置为 passed（dynamic-workflow-graph.js:299-327）。
  // 这是 dynamic 链既有的「尽力生成 + 收敛放行」语义，不能判成失败。
  const converged = decision === 'passed';

  const failed = checkerFailed && !converged;
  const source = checkResult?.source || '(unknown validator)';

  return {
    outcome: failed ? 'failed' : 'completed',
    reason: failed
      ? `校验门未通过（source=${source}, checkResult=${checkResult?.checkResult ?? 'missing'}, blockCount=${blockCount}）`
      : 'workflow-finished',
    // 提升到 sendComplete 载荷顶层，供 completeTask 的 qualityGate 消费
    quality: {
      checkResult: checkResult ?? null,
      qualityScore:
        typeof checkResult?.qualityScore === 'number' ? checkResult.qualityScore : null,
      blockCount,
    },
  };
}

export default { evaluateDynamicTerminal };
