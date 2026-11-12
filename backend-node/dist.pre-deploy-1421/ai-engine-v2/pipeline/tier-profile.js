/**
 * TierProfile —— 档位定义（DAG 拓扑裁剪）
 *
 * 设计前提：spec 与 tier 正交
 *   - spec 决定「产出什么形态」→ 作用于节点内部行为
 *   - tier 决定「花多大代价」→ 作用于 DAG 拓扑（哪些节点参与、循环几轮）
 *
 * 因此不按 spec×tier 建管线，而是同一个 DAG 引擎按 profile 裁剪。
 * 加新档位 = 加一条 profile 配置，引擎代码不动。
 *
 * 与旧管线的差异（重要）：
 *   旧 mc-component-graph-phase2.js 里 generationTier 只在 L757 传给 ctx，
 *   **没有裁剪任何节点** —— lite 档实质是假的。v2 补齐真正的 tier 语义。
 *
 *   另注：microcode-engineer 内部的 tier（s|m|l|xl）是**代码块尺寸档**，
 *   与此处的业务档位无关，v2 中一律称 sizeTier 以免混淆。
 */

/** 视觉通道节点（用 visionAIConfig，其余走 textAIConfig） */
export const VISION_NODES = new Set(['visual-parser', 'visual-comparator'])

/** 不调用 LLM 的确定性节点 */
export const DETERMINISTIC_NODES = new Set([
  'input-adapter',
  'screenshot-renderer',
  'code-structure-validator',
  'revision-decision',
  'emit'
])

/**
 * 节点模式说明
 *   style-mapper:
 *     - 'programmatic' 仅做 elementStyleMap 提取（源码注释标注「程序化，无需 LLM」），0 次 LLM
 *     - 'llm'          额外产出 themeVars / lessVariables / cssClasses
 *   adversarial-checker:
 *     - 'rules' 走确定性规则集（spec.validatorRuleSet），0 次 LLM
 *     - 'llm'   完整对抗性检查
 */
export const TIER_PROFILES = {
  lite: {
    id: 'lite',
    label: '轻量档',
    description: '6 节点单程直出（无精修、无视觉回归），全程仅 2 次 LLM 调用，用于快速验证与批量生成',

    nodes: [
      'input-adapter',
      'visual-parser',
      'style-mapper',
      'code-engineer',
      'adversarial-checker',
      'emit'
    ],

    edges: [
      ['input-adapter', 'visual-parser'],
      ['visual-parser', 'style-mapper'],
      ['style-mapper', 'code-engineer'],
      ['code-engineer', 'adversarial-checker'],
      ['adversarial-checker', 'emit']
    ],

    entry: 'input-adapter',

    nodeModes: {
      'style-mapper': 'programmatic',
      'adversarial-checker': 'rules'
    },

    refineLoops: 0,
    visualRegression: false,
    maxRevisions: 0,

    /** 预期 LLM 调用次数，用于自检与成本预估 */
    expectedLlmCalls: 2
  },

  max: {
    id: 'max',
    label: '完整档',
    description: '13 节点全跑（含 8 次 LLM）+ 2 轮精修 + 视觉回归，对齐旧 phase2 管线质量',

    nodes: [
      'input-adapter',
      'visual-parser',
      'layout-reviewer',
      'style-mapper',
      'code-engineer',
      'code-structure-validator',
      'layout-refiner',
      'style-refiner',
      'adversarial-checker',
      'screenshot-renderer',
      'visual-comparator',
      'revision-decision',
      'emit'
    ],

    edges: [
      ['input-adapter', 'visual-parser'],
      // layout-reviewer 与 style-mapper 在旧管线是 parallel-analysis 并行节点，
      // v2 由引擎识别 parallelGroups 并发执行，此处仍以线性边声明依赖顺序
      ['visual-parser', 'layout-reviewer'],
      ['layout-reviewer', 'style-mapper'],
      ['style-mapper', 'code-engineer'],
      ['code-engineer', 'code-structure-validator'],
      ['code-structure-validator', 'layout-refiner'],
      // layout-refiner -> style-refiner 串行：两节点都 touchesDisk，
      // 并行写同一组 .vue/.less 会互相覆盖（_syncIfDirty 只兜底 state.code，
      // 无法防止磁盘文件互盖）。靠"各改各文件"的巧合不冲突不是结构性保证，
      // 改串行换安全性，损失 1 次 LLM 等待（10-30s）
      ['layout-refiner', 'style-refiner'],
      ['style-refiner', 'adversarial-checker'],
      ['adversarial-checker', 'screenshot-renderer'],
      ['screenshot-renderer', 'visual-comparator'],
      ['visual-comparator', 'revision-decision']
      // revision-decision 是条件节点：回环至 layout-refiner 或前进至 emit，
      // 由引擎按 refineLoops / maxRevisions 决策，不在静态边中声明
    ],

    entry: 'input-adapter',

    /**
     * 可并发执行的节点组（对齐旧管线 parallel-analysis / parallel-refine）
     *
     * 仅保留 layout-reviewer ∥ style-mapper：两节点读同一份输入
     * layoutStructure，写不同 state 字段（reviewResult / styleMappings），
     * 纯内存计算无磁盘写入，并行安全且收益明显。
     *
     * layout-refiner ∥ style-refiner 已移除：两节点都 touchesDisk，
     * 写同一组 .vue/.less 文件，并发写会互相覆盖，串行更安全。
     */
    parallelGroups: [
      ['layout-reviewer', 'style-mapper']
    ],

    /** 条件节点：返回下一跳节点 id */
    conditionalNodes: {
      'revision-decision': {
        loopBackTo: 'layout-refiner',
        forwardTo: 'emit'
      }
    },

    nodeModes: {
      'style-mapper': 'llm',
      'adversarial-checker': 'llm'
    },

    refineLoops: 2,
    visualRegression: true,
    maxRevisions: 3,

    expectedLlmCalls: 8
  }
}

export const DEFAULT_TIER = 'lite'

/**
 * 解析档位配置，支持请求级局部覆盖
 * @param {string} tierId
 * @param {object} overrides 如 { maxRevisions: 1, nodeModes: { 'style-mapper': 'llm' } }
 * @returns {object} 冻结的 profile 副本
 */
export function resolveTier(tierId = DEFAULT_TIER, overrides = null) {
  const base = TIER_PROFILES[tierId]
  if (!base) {
    throw new Error(
      `未知档位 "${tierId}"，可用档位：${Object.keys(TIER_PROFILES).join(', ')}`
    )
  }

  // 深拷贝避免污染原始定义
  const profile = JSON.parse(JSON.stringify(base))
  // Set 类字段不参与序列化，此处无需还原（VISION_NODES 等为模块级常量）

  if (overrides && typeof overrides === 'object') {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) continue
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        profile[key] &&
        typeof profile[key] === 'object' &&
        !Array.isArray(profile[key])
      ) {
        profile[key] = { ...profile[key], ...value }
      } else {
        profile[key] = value
      }
    }
  }

  validateProfile(profile)
  return profile
}

/**
 * 档位自检：拓扑合法性
 * 保证配置错误在启动/解析期暴露，而不是跑到一半才炸
 */
export function validateProfile(profile) {
  const nodeSet = new Set(profile.nodes)
  const errors = []

  if (!nodeSet.has(profile.entry)) {
    errors.push(`entry "${profile.entry}" 不在 nodes 列表中`)
  }

  for (const [from, to] of profile.edges || []) {
    if (!nodeSet.has(from)) errors.push(`边起点 "${from}" 未在 nodes 中声明`)
    if (!nodeSet.has(to)) errors.push(`边终点 "${to}" 未在 nodes 中声明`)
  }

  for (const group of profile.parallelGroups || []) {
    for (const n of group) {
      if (!nodeSet.has(n)) errors.push(`并行组节点 "${n}" 未在 nodes 中声明`)
    }
  }

  for (const [node, cfg] of Object.entries(profile.conditionalNodes || {})) {
    if (!nodeSet.has(node)) errors.push(`条件节点 "${node}" 未在 nodes 中声明`)
    for (const target of [cfg.loopBackTo, cfg.forwardTo]) {
      if (target && !nodeSet.has(target)) {
        errors.push(`条件节点 "${node}" 的目标 "${target}" 未在 nodes 中声明`)
      }
    }
  }

  for (const node of Object.keys(profile.nodeModes || {})) {
    if (!nodeSet.has(node)) {
      errors.push(`nodeModes 声明了未参与的节点 "${node}"`)
    }
  }

  // 可达性：从 entry 出发能否走到所有节点
  const adj = new Map()
  for (const [from, to] of profile.edges || []) {
    if (!adj.has(from)) adj.set(from, [])
    adj.get(from).push(to)
  }
  const reached = new Set([profile.entry])
  const queue = [profile.entry]
  while (queue.length) {
    const cur = queue.shift()
    for (const next of adj.get(cur) || []) {
      if (!reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  // 条件节点的目标也算可达
  for (const cfg of Object.values(profile.conditionalNodes || {})) {
    for (const t of [cfg.loopBackTo, cfg.forwardTo]) {
      if (t) reached.add(t)
    }
  }
  const unreachable = profile.nodes.filter(n => !reached.has(n))
  if (unreachable.length) {
    errors.push(`存在不可达节点：${unreachable.join(', ')}`)
  }

  if (errors.length) {
    throw new Error(`档位 "${profile.id}" 拓扑校验失败：\n  - ${errors.join('\n  - ')}`)
  }
  return true
}

/** 节点在当前档位下的运行模式，未声明则为 'default' */
export function getNodeMode(profile, nodeId) {
  return profile.nodeModes?.[nodeId] || 'default'
}

/** 该节点在当前档位下是否会调用 LLM */
export function willCallLlm(profile, nodeId) {
  if (DETERMINISTIC_NODES.has(nodeId)) return false
  const mode = getNodeMode(profile, nodeId)
  if (mode === 'programmatic' || mode === 'rules') return false
  return true
}

/** 配置页下拉数据 */
export function listTiers() {
  return Object.values(TIER_PROFILES).map(t => ({
    id: t.id,
    label: t.label,
    description: t.description,
    nodeCount: t.nodes.length,
    expectedLlmCalls: t.expectedLlmCalls
  }))
}

export default {
  TIER_PROFILES,
  DEFAULT_TIER,
  VISION_NODES,
  DETERMINISTIC_NODES,
  resolveTier,
  validateProfile,
  getNodeMode,
  willCallLlm,
  listTiers
}
