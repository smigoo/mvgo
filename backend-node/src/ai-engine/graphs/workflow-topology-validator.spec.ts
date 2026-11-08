/**
 * 动态 workflow 拓扑契约 / 条件边标签判据（2026-11-08，A + C）
 *
 * 治本对象：
 *   A — dynamic-workflow-graph.js 旧 :396「未注册的校验器，按通过处理」
 *   C — 旧 :201-218 needs_revision 无匹配边时 fallback 到 branches[0]（可能是通过边）
 * 判据统一放在 workflow-topology-validator.js，本 spec 只验证该判据；
 * 构图接线（assertWorkflowTopology）与 save() 接线由集成回归覆盖。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  GATE_VALIDATOR_IDS,
  WORKFLOW_NODE_TYPES,
  DECISION_LABELS,
  classifyDecisionLabel,
  validateWorkflowTopology,
  assertWorkflowTopology,
  resolveDecisionTarget,
} from './workflow-topology-validator.js';

const wf = (nodes: any[]) => ({ name: 'spec-workflow', nodes, edges: [] });

describe('A · validateWorkflowTopology — 阳性（必须拒绝）', () => {
  it('拒绝未注册的 gate 校验器，且错误信息带节点 id 与 handler', () => {
    const result = validateWorkflowTopology(
      wf([{ id: 'g1', type: 'gate', handler: 'totally-unknown-validator' }]),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('g1');
    expect(result.errors.join(' ')).toContain('totally-unknown-validator');
  });

  it('拒绝 gate 节点缺少 handler（旧实现会 no-op 静默放行）', () => {
    const result = validateWorkflowTopology(wf([{ id: 'g2', type: 'gate' }]));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('g2');
  });

  it('拒绝非法节点类型', () => {
    const result = validateWorkflowTopology(
      wf([{ id: 'n1', type: 'magic-node', handler: 'whatever' }]),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('magic-node');
  });

  it('拒绝 nodes 非数组（防止空壳定义绕过校验）', () => {
    expect(validateWorkflowTopology({ name: 'x' }).ok).toBe(false);
    expect(validateWorkflowTopology({ name: 'x', nodes: {} }).ok).toBe(false);
  });

  it('多个错误一次性汇总，便于用户一次修完', () => {
    const result = validateWorkflowTopology(
      wf([
        { id: 'a', type: 'gate', handler: 'nope-a' },
        { id: 'b', type: 'gate', handler: 'nope-b' },
      ]),
    );
    expect(result.errors).toHaveLength(2);
  });
});

describe('A · validateWorkflowTopology — 阴性（不得误伤）', () => {
  it('两个已注册校验器均通过', () => {
    for (const handler of GATE_VALIDATOR_IDS) {
      expect(validateWorkflowTopology(wf([{ id: 'g', type: 'gate', handler }])).ok).toBe(true);
    }
  });

  it('agent/skill 的任意 handler（动态 Agent Builder）不受限', () => {
    expect(
      validateWorkflowTopology(wf([{ id: 'a', type: 'agent', handler: 'my-read' }])).ok,
    ).toBe(true);
    expect(
      validateWorkflowTopology(wf([{ id: 's', type: 'skill', handler: 'brand-new-agent' }])).ok,
    ).toBe(true);
  });

  it('condition 空 handler 是合法空壳路由节点', () => {
    expect(
      validateWorkflowTopology(wf([{ id: 'c', type: 'condition', handler: '' }])).ok,
    ).toBe(true);
  });

  it('允许集合覆盖 start/end/parallel', () => {
    for (const type of WORKFLOW_NODE_TYPES) {
      if (type === 'gate') continue;
      expect(validateWorkflowTopology(wf([{ id: 'n', type }])).ok).toBe(true);
    }
  });

  it('存量 11 份自定义 workflow 全部通过（防回归误伤）', () => {
    const dir = path.resolve(process.cwd(), 'config/workflows');
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const workflow = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const result = validateWorkflowTopology(workflow);
      expect({ file, ...result }).toEqual({ file, ok: true, errors: [] });
    }
  });
});

describe('A · assertWorkflowTopology — 构图入口强断言', () => {
  it('非法拓扑抛错，合法拓扑原样返回', () => {
    expect(() =>
      assertWorkflowTopology(wf([{ id: 'g', type: 'gate', handler: 'unknown' }])),
    ).toThrow(/workflow-topology/);
    const valid = wf([{ id: 'e', type: 'end' }]);
    expect(assertWorkflowTopology(valid)).toBe(valid);
  });
});

describe('C · classifyDecisionLabel — 条件边标签契约', () => {
  it('pass → passed；retry → needs_revision（实际拓扑标签，旧实现两者都不认）', () => {
    expect(classifyDecisionLabel('pass')).toBe('passed');
    expect(classifyDecisionLabel('retry')).toBe('needs_revision');
  });

  it('原生二元标签与容错标签保持兼容', () => {
    expect(classifyDecisionLabel('passed')).toBe('passed');
    expect(classifyDecisionLabel('success')).toBe('passed');
    expect(classifyDecisionLabel('done')).toBe('passed');
    expect(classifyDecisionLabel('needs_revision')).toBe('needs_revision');
    expect(classifyDecisionLabel('needs-revision')).toBe('needs_revision');
    expect(classifyDecisionLabel('failed')).toBe('needs_revision');
    expect(classifyDecisionLabel('revise')).toBe('needs_revision');
  });

  it('非决策标签必须返回 null，不得被当成通过边', () => {
    for (const label of ['minimal', 'l0_enabled', 'l0_disabled', 'l1_enabled', 'full', 'stylistic', 'layout']) {
      expect(classifyDecisionLabel(label)).toBeNull();
    }
    expect(classifyDecisionLabel(undefined)).toBeNull();
    expect(classifyDecisionLabel(null)).toBeNull();
  });

  it('映射表覆盖测试：每个值都必须是二元决策之一', () => {
    for (const [label, decision] of Object.entries(DECISION_LABELS)) {
      expect(['passed', 'needs_revision']).toContain(decision);
      expect(classifyDecisionLabel(label)).toBe(decision);
    }
  });
});

describe('C · resolveDecisionTarget — 决策路由（含禁止静默 fallback）', () => {
  const branches = (...pairs: [string, string][]) =>
    pairs.map(([condition, target]) => ({ condition, target }));

  it('passed + 实际标签 pass → 命中通过边', () => {
    expect(resolveDecisionTarget('passed', branches(['pass', 'complete'], ['retry', 'regenerate']))).toBe(
      'complete',
    );
  });

  it('needs_revision + 实际标签 retry → 命中重试边（旧实现会 fallback 到 pass/complete）', () => {
    expect(
      resolveDecisionTarget('needs_revision', branches(['pass', 'complete'], ['retry', 'regenerate'])),
    ).toBe('regenerate');
  });

  it('needs_revision + 只有通过边 → 显式抛错，绝不静默走 complete', () => {
    expect(() =>
      resolveDecisionTarget('needs_revision', branches(['pass', 'complete'], ['minimal', 'legacy'])),
    ).toThrow(/workflow-routing/);
  });

  it('needs_revision + 原生 failed / needs-revision 标签保持兼容', () => {
    expect(resolveDecisionTarget('needs_revision', branches(['failed', 'revise']))).toBe('revise');
    expect(resolveDecisionTarget('needs_revision', branches(['needs-revision', 'revise']))).toBe('revise');
  });

  it('标签字面量等于 decision 时直接命中（不依赖别名表）', () => {
    expect(
      resolveDecisionTarget('needs_revision', branches(['needs_revision', 'exact'], ['retry', 'r'])),
    ).toBe('exact');
    expect(resolveDecisionTarget('passed', branches(['passed', 'done']))).toBe('done');
  });

  it('passed 遇到非决策标签仍保留原 branches[0] 容错（不误伤存量拓扑）', () => {
    expect(
      resolveDecisionTarget('passed', branches(['l0_enabled', 'l0-on'], ['l0_disabled', 'l0-off'])),
    ).toBe('l0-on');
  });

  it('边界：无边时 passed 返回 null，needs_revision 抛错', () => {
    expect(resolveDecisionTarget('passed', [])).toBeNull();
    expect(() => resolveDecisionTarget('needs_revision', [])).toThrow(/workflow-routing/);
    expect(() => resolveDecisionTarget('needs_revision', undefined as any)).toThrow(
      /workflow-routing/,
    );
  });
});
