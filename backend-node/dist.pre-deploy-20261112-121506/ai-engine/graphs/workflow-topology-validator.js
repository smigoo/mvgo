/**
 * 动态 workflow 拓扑契约（单一判据，2026-11-08）
 *
 * 背景：dynamic-workflow-graph.js 的 gate 节点曾对未注册 handler 静默放行
 * （旧 :396「按通过处理」），且保存 / 构图 / 运行三层都没有拓扑校验，
 * 任务终态又恒 success:true ⇒ 自定义管线的校验点可被静默跳过。
 *
 * 本模块只放「无副作用、可单测」的契约判据，由两个执行入口共用：
 *   · workflow.service.ts#save()          保存时显式拒绝非法拓扑
 *   · dynamic-workflow-graph.js#buildDynamicGraph()  构图时统一兜底
 * 规则定义的唯一真相源在此；其它文件不得复制第二份口径。
 *
 * 刻意不校验 agent/skill 的 handler：动态 Agent Builder 允许任意注册名，
 * 校验它会误伤存量自定义管线（config/workflows/*.json 里存在 my-read 等）。
 */

/** gate 节点允许的校验器 id（与 dynamic-workflow-graph.js:382-394 的注册分支一一对应） */
export const GATE_VALIDATOR_IDS = Object.freeze([
  'preview-validator',
  'code-structure-validator',
]);

/** 允许的节点类型（与 buildNodeHandler 的分支 + graph.js 的 setEntry 兜底一致） */
export const WORKFLOW_NODE_TYPES = Object.freeze([
  'start',
  'end',
  'agent',
  'skill',
  'condition',
  'gate',
  'parallel',
]);

/**
 * 条件出边标签 → 二元决策的显式映射。
 * 旧路由只认 passed / needs_revision 及少量容错标签，而实际拓扑使用
 * pass / retry / minimal 等标签，导致 needs_revision 找不到匹配边时
 * fallback 到 branches[0]（常为通过边）。此表是标签契约的唯一真相源。
 */
export const DECISION_LABELS = Object.freeze({
  passed: 'passed',
  pass: 'passed',
  success: 'passed',
  done: 'passed',
  ok: 'passed',
  needs_revision: 'needs_revision',
  'needs-revision': 'needs_revision',
  failed: 'needs_revision',
  fail: 'needs_revision',
  revise: 'needs_revision',
  retry: 'needs_revision',
});

/**
 * 把条件边标签归类为二元决策；非决策标签（l0_enabled / minimal / stylistic 等）返回 null。
 * @param {unknown} label
 * @returns {'passed'|'needs_revision'|null}
 */
export function classifyDecisionLabel(label) {
  if (typeof label !== 'string') return null;
  return DECISION_LABELS[label] || null;
}

/**
 * 校验一份 workflow 定义的拓扑契约。
 * @param {object} workflow { name, nodes:[{id,type,handler}], edges:[...] }
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateWorkflowTopology(workflow) {
  const errors = [];
  const nodes = workflow?.nodes;
  if (!Array.isArray(nodes)) {
    return { ok: false, errors: ['workflow.nodes 必须是数组'] };
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const id = node?.id ?? `index#${i}`;
    const type = node?.type;

    if (!WORKFLOW_NODE_TYPES.includes(type)) {
      errors.push(
        `节点 ${id} 的 type="${String(type)}" 不在允许集合 [${WORKFLOW_NODE_TYPES.join(', ')}]`,
      );
      continue;
    }

    if (type === 'gate') {
      const handler = node?.handler;
      if (typeof handler !== 'string' || handler.length === 0) {
        errors.push(`gate 节点 ${id} 缺少 handler（校验器 id），拒绝静默放行`);
      } else if (!GATE_VALIDATOR_IDS.includes(handler)) {
        errors.push(
          `gate 节点 ${id} 的 handler="${handler}" 未注册；可用: [${GATE_VALIDATOR_IDS.join(', ')}]`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 构图/运行入口使用的强断言：非法拓扑直接抛错，不让流程继续。
 * @param {object} workflow
 * @returns {object} 原 workflow（便于链式调用）
 */
export function assertWorkflowTopology(workflow) {
  const result = validateWorkflowTopology(workflow);
  if (!result.ok) {
    throw new Error(`[workflow-topology] ${result.errors.join('; ')}`);
  }
  return workflow;
}

/**
 * 决策节点（condition / gate）条件出边的唯一路由判据。
 *
 * 旧实现：精确匹配 _decision → needs_revision 容错 → 默认 passed → `branches[0]`。
 * 当 needs_revision 找不到匹配边时，最后那步会把它**静默路由到第一条边**
 * （实际拓扑里第一条边常是 `pass` ⇒ complete），即「未通过却走完成」。
 *
 * 本判据：标签先过 DECISION_LABELS 归类；needs_revision 无匹配时显式抛错；
 * passed 分支保留原有默认容错（兼容 l0_enabled / minimal 等非决策标签）。
 *
 * @param {string} decision state._decision，'passed' | 'needs_revision'
 * @param {Array<{condition: string, target: string}>} branches 该节点的条件出边
 * @param {string} nodeId 仅用于错误信息
 * @returns {string|null} 下一个节点 id
 */
export function resolveDecisionTarget(decision, branches, nodeId = '(unknown)') {
  const list = Array.isArray(branches) ? branches : [];

  // 1. 精确匹配：标签字面量等于决策，或标签归类后等于决策（pass / retry 等别名在此生效）
  const matched = list.find(
    (b) => b.condition === decision || (decision && classifyDecisionLabel(b.condition) === decision),
  );
  if (matched) return matched.target;

  // 2. needs_revision 容错：仍只接受归类为 needs_revision 的边
  if (decision === 'needs_revision') {
    const alt = list.find((b) => classifyDecisionLabel(b.condition) === 'needs_revision');
    if (alt) return alt.target;
    throw new Error(
      `[workflow-routing] 决策节点 ${nodeId} 的 needs_revision 没有匹配的条件边` +
        `（现有标签: ${list.map((b) => b.condition).join(', ') || '无'}）；拒绝回退到通过分支`,
    );
  }

  // 3. passed 保持兼容：优先显式通过边，否则沿用原 branches[0] 容错
  const def = list.find((b) => classifyDecisionLabel(b.condition) === 'passed') || list[0];
  return def?.target || null;
}
