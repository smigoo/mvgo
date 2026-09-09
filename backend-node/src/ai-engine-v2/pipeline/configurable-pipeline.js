/**
 * ConfigurablePipeline —— 规范 × 档位 × 模型 三维可配的统一管线
 *
 * 取代旧的「一个规范一份 graph 文件」模式：
 *
 *   旧： mc-component-graph-phase2.js  (微码, 2800 行)
 *        mc-component-graph-vue3.js    (vue3,  重复的下游逻辑)
 *
 *   新： 1 个引擎  ×  N 份声明式配置
 *        spec  决定「产出什么形态」→ 节点内部行为（engineer 类 / prompt / 产物结构）
 *        tier  决定「花多大代价」  → DAG 拓扑裁剪（节点数 / 精修轮次 / 视觉回归）
 *        model 决定「用哪个大脑」  → 节点级模型路由
 *
 * 三者正交，所以不需要 spec × tier 份管线，只需要一个按配置装配的引擎。
 *
 * 与旧管线完全独立：不修改 ai-engine 下任何文件，只读复用其 role 实现。
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { resolveSpec } from '../specs/spec-registry.js'
import { resolveTier, DEFAULT_TIER } from './tier-profile.js'
import { resolvePipelineModels, auditCredentials } from './model-resolver.js'
import { instantiateNode, dryRunNodes, validateNodeCoverage, NODE_META } from './node-registry.js'
import { resolveTargetFiles } from '../../ai-engine/utils/revision-files.js'
import { resolveInputAdapter, validateIR } from './input-adapters/index.js'

/**
 * 把 profile 的边与并行组线性化为执行计划
 *
 * 拓扑形态是「线性链 + 并行组 + 条件回环」，不是任意 DAG，
 * 因此线性化比通用拓扑排序更简单也更可控。
 */
export function buildExecutionPlan(profile) {
  const next = new Map()
  for (const [from, to] of profile.edges || []) next.set(from, to)

  // 节点 → 所属并行组
  const groupOf = new Map()
  for (const group of profile.parallelGroups || []) {
    for (const n of group) groupOf.set(n, group)
  }

  const plan = []
  const visited = new Set()
  let cur = profile.entry

  while (cur && !visited.has(cur)) {
    const group = groupOf.get(cur)

    if (group && group.every(n => profile.nodes.includes(n))) {
      // 并行组：整组一次性执行，游标跳到组内最后一个节点的后继
      group.forEach(n => visited.add(n))
      plan.push({ type: 'parallel', nodes: [...group] })
      const last = group[group.length - 1]
      cur = next.get(last)
      continue
    }

    visited.add(cur)
    const isConditional = Boolean(profile.conditionalNodes?.[cur])
    plan.push({ type: isConditional ? 'conditional' : 'single', node: cur })
    cur = next.get(cur)
  }

  // 条件节点的 forwardTo 目标（如 emit）不在静态边上，补进计划尾部
  for (const cfg of Object.values(profile.conditionalNodes || {})) {
    if (cfg.forwardTo && !visited.has(cfg.forwardTo) && profile.nodes.includes(cfg.forwardTo)) {
      visited.add(cfg.forwardTo)
      plan.push({ type: 'single', node: cfg.forwardTo })
    }
  }

  const missed = profile.nodes.filter(n => !visited.has(n))
  if (missed.length) {
    throw new Error(`执行计划未覆盖节点：${missed.join(', ')}（检查 edges 是否连通）`)
  }

  return plan
}

export class ConfigurablePipeline {
  /**
   * @param {object} config {
   *   spec, specOverrides, tier, tierOverrides, sourceType,
   *   modelOverrides, aiConfig, workspaceDir, promptInjectionMode, onProgress
   * }
   */
  constructor(config = {}) {
    this.config = {
      spec: 'microcode',
      tier: DEFAULT_TIER,
      sourceType: 'screenshot',
      promptInjectionMode: 'replace',
      ...config
    }
    this.onProgress = config.onProgress || (() => {})
    this._prepared = null
  }

  /**
   * 解析全部配置并自检，不执行任何节点、不调用 LLM
   *
   * 单独暴露是因为配置页需要「执行前预览」：会跑哪些节点、用什么模型、
   * 花几次 LLM 调用、凭证齐不齐 —— 这些都应该在点「生成」之前就看得到。
   */
  prepare() {
    if (this._prepared) return this._prepared

    const { spec: specId, specOverrides, tier: tierId, tierOverrides } = this.config

    const spec = resolveSpec(specId, specOverrides)
    const tierProfile = resolveTier(tierId, tierOverrides)
    validateNodeCoverage(tierProfile)

    const { table: modelTable, llmNodes, llmCallCount, matchesExpected } = resolvePipelineModels({
      spec,
      tierProfile,
      modelOverrides: this.config.modelOverrides,
      aiConfig: this.config.aiConfig
    })

    const credentials = auditCredentials(modelTable)
    const plan = buildExecutionPlan(tierProfile)

    this._prepared = {
      spec,
      tierProfile,
      modelTable,
      llmNodes,
      llmCallCount,
      matchesExpected,
      credentials,
      plan,
      nodes: dryRunNodes(tierProfile, { spec, modelTable })
    }
    return this._prepared
  }

  /** 配置页预览用的精简视图 */
  preview() {
    const p = this.prepare()
    return {
      spec: { id: p.spec.id, label: p.spec.label, version: p.spec.version },
      tier: { id: p.tierProfile.id, label: p.tierProfile.label },
      sourceType: this.config.sourceType,
      llmCallCount: p.llmCallCount,
      credentialsOk: p.credentials.ok,
      missingCredentials: p.credentials.missing,
      artifacts: p.spec.artifacts,
      steps: p.plan.map(s => (s.type === 'parallel' ? s.nodes.join(' ∥ ') : s.node)),
      nodes: p.nodes
    }
  }

  /**
   * 执行管线
   * @param {object} input 来源相关入参（screenshot / figmaUrl 等）
   */
  async execute(input = {}) {
    const prepared = this.prepare()
    const { spec, tierProfile, modelTable, plan } = prepared

    if (!prepared.credentials.ok) {
      const hints = prepared.credentials.missing.map(m => `${m.channel}.${m.field}（${m.hint}）`)
      throw new Error(`凭证缺失，无法执行：\n  - ${hints.join('\n  - ')}`)
    }

    const startedAt = Date.now()
    let state = {
      ...input,
      spec,
      tier: tierProfile.id,
      sourceType: this.config.sourceType,
      workspaceDir: this.config.workspaceDir,
      // 旧 role 统一用 outputPath 作为落盘根目录（生成文件、.mc-gen 缓存、调试产物）
      outputPath: this.config.outputPath || this.config.workspaceDir,
      // 截图渲染按 sessionId 做路径隔离，缺省退回组件名，避免多次生成互相覆盖
      sessionId: this.config.sessionId || input.sessionId || input.componentName || 'v2-session',
      // 预览发布按 groupId 分目录（vue3 规范用得到；microcode 平铺但仍需传递）
      groupId: this.config.groupId || input.groupId || 'default-group',
      // role 内部的 LLM 心跳进度直接汇入管线进度流
      onProgress: p =>
        this._report(p?.stage || 'role', p?.message || '', p?.status || 'running'),
      _revisionCount: 0,
      _nodeTrace: []
    }

    this._report('pipeline', `开始执行（规范 ${spec.label} / 档位 ${tierProfile.label}）`, 'running')

    let cursor = 0
    let guard = 0
    const maxSteps = plan.length + (tierProfile.maxRevisions || 0) * plan.length

    while (cursor < plan.length) {
      if (++guard > maxSteps) {
        throw new Error(`执行步数超过上限 ${maxSteps}，疑似回环失控`)
      }

      const step = plan[cursor]

      if (step.type === 'parallel') {
        const results = await Promise.all(
          step.nodes.map(n => this._runNode(n, state, { spec, tierProfile, modelTable }))
        )
        // 并发分支各自基于同一份 state 计算 _nodeTrace，直接展开会互相覆盖，
        // 只留下最后一个节点的记录 —— 这里按增量合并，保证轨迹完整
        const traceBase = state._nodeTrace || []
        const added = []
        for (const r of results) {
          const { _nodeTrace, ...rest } = r
          added.push(...(_nodeTrace || []).slice(traceBase.length))
          state = { ...state, ...rest }
        }
        state._nodeTrace = [...traceBase, ...added]
        state = this._syncIfDirty(step.nodes, state)
        cursor++
        continue
      }

      const patch = await this._runNode(step.node, state, { spec, tierProfile, modelTable })
      state = { ...state, ...patch }
      state = this._syncIfDirty([step.node], state)

      if (step.type === 'conditional') {
        const decision = state._decision
        const cfg = tierProfile.conditionalNodes[step.node]
        if (decision === 'revise' && cfg.loopBackTo) {
          const back = plan.findIndex(
            s =>
              (s.type === 'parallel' && s.nodes.includes(cfg.loopBackTo)) ||
              s.node === cfg.loopBackTo
          )
          if (back >= 0) {
            this._report(step.node, `质量不达标，回退至 ${cfg.loopBackTo} 重修`, 'running')
            cursor = back
            continue
          }
        }
      }

      cursor++
    }

    const durationMs = Date.now() - startedAt
    this._report('pipeline', `执行完成（${(durationMs / 1000).toFixed(1)}s）`, 'completed')

    return {
      ok: true,
      spec: { id: spec.id, label: spec.label, version: spec.version },
      tier: tierProfile.id,
      sourceType: this.config.sourceType,
      componentName: state.componentName,
      artifacts: state.artifacts || null,
      code: state.code || null,
      quality: {
        textScore: state.qualityScore ?? null,
        visualScore: state.visualComparison?.similarity ?? null,
        mergedScore: state._mergedScore ?? null,
        revisions: state._revisionCount || 0,
        decisionReason: state._decisionReason || null
      },
      // 修订回环会让对抗检查重复报同一批问题，去重后再交付
      warnings: [...new Set(state.warnings || [])],
      durationMs,
      trace: state._nodeTrace
    }
  }

  /**
   * 精修节点改的是磁盘文件，state.code 会立刻过期。
   * 该步骤含 touchesDisk 节点时按 generatedFiles 回读一次，让 state.code 等于磁盘真值。
   */
  _syncIfDirty(nodeIds, state) {
    if (!nodeIds.some(n => NODE_META[n]?.touchesDisk)) return state

    const root = state.outputPath
    const files = state.generatedFiles
    if (!root || !Array.isArray(files) || !files.length) return state

    const code = { ...(state.code || {}) }
    let changed = 0
    for (const rel of files) {
      const full = join(root, rel)
      if (!existsSync(full)) continue
      const content = readFileSync(full, 'utf-8')
      if (code[rel] !== content) changed++
      code[rel] = content
    }

    this._report('disk-sync', `磁盘回读 ${files.length} 个文件，${changed} 个内容有变更`, 'completed')
    return { ...state, code }
  }

  /** 执行单个节点：builtin 走内置实现，其余实例化 role */
  async _runNode(nodeId, state, ctx) {
    const { spec, tierProfile, modelTable } = ctx
    const startedAt = Date.now()
    this._report(nodeId, `执行 ${nodeId}`, 'running')

    try {
      const builtin = BUILTIN_NODES[nodeId]
      let patch

      if (builtin) {
        patch = await builtin(state, { ...ctx, pipeline: this })
      } else {
        // 前置判据先于实例化：截图/比对这类节点的实例化会拉起无头浏览器与视觉模型客户端，
        // 条件不满足时不该付这份代价
        const skipReason = NODE_META[nodeId]?.skip?.(state, ctx)
        if (skipReason) {
          this._report(nodeId, `跳过 ${nodeId}：${skipReason}`, 'skipped')
          return {
            ...(NODE_META[nodeId].skipPatch?.(state) || {}),
            _nodeTrace: [
              ...(state._nodeTrace || []),
              { nodeId, durationMs: 0, ok: true, skipped: skipReason }
            ]
          }
        }

        const { role, fn, meta } = await instantiateNode(nodeId, {
          spec,
          tierProfile,
          modelEntry: modelTable[nodeId],
          promptInjectionMode: this.config.promptInjectionMode
        })

        // 运行期 IO 翻译：state → role 具名入参 → state 补丁。
        // 缺失映射时退回直传 state（等价旧行为），但记为警告 —— 字段名对不上
        // 会让 role 静默降级，必须显式暴露。
        const params = meta.execParams ? meta.execParams(state, ctx) : state
        if (!meta.execParams) {
          this._report(nodeId, `节点 ${nodeId} 未定义 execParams，已直传 state`, 'running')
        }

        // 少数 role 不遵守 execute(params) 约定（如 VisualComparator.compare 收位置参数），
        // 由 meta.invoke 承接差异，不为此在 role 上加壳
        const raw = meta.invoke
          ? await meta.invoke(role || fn, params, ctx)
          : fn
            ? await fn(params)
            : await role.execute(params)
        patch = meta.resultPatch ? await meta.resultPatch(raw, state) : raw
      }

      const durationMs = Date.now() - startedAt
      this._report(nodeId, `${nodeId} 完成（${(durationMs / 1000).toFixed(1)}s）`, 'completed')

      return {
        ...(patch || {}),
        _nodeTrace: [...(state._nodeTrace || []), { nodeId, durationMs, ok: true }]
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const onError = NODE_META[nodeId]?.onError

      // 依赖外部环境的节点（无头浏览器、视觉服务）失败只降级不中断，
      // 但一定要留痕：既进 warnings 也进 trace，不做无声吞异常
      if (onError) {
        this._report(nodeId, `${nodeId} 失败，已降级继续：${error.message}`, 'warning')
        return {
          ...(onError(error, state) || {}),
          warnings: [...(state.warnings || []), `${nodeId} 失败（已降级继续）：${error.message}`],
          _nodeTrace: [
            ...(state._nodeTrace || []),
            { nodeId, durationMs, ok: false, tolerated: true, error: error.message }
          ]
        }
      }

      this._report(nodeId, `${nodeId} 失败：${error.message}`, 'failed')
      error.nodeId = nodeId
      error.trace = [...(state._nodeTrace || []), { nodeId, durationMs, ok: false, error: error.message }]
      throw error
    }
  }

  _report(stage, message, status) {
    try {
      this.onProgress({ stage, message, status, ts: Date.now() })
    } catch {
      // 进度回调异常不得影响主流程
    }
  }
}

/* ============ v2 自实现的确定性节点 ============ */

const BUILTIN_NODES = {
  /** 输入归一：来源差异到此为止，下游只见 IR */
  'input-adapter': async (state, { pipeline }) => {
    const sourceType = state.sourceType
    const adapter = resolveInputAdapter(sourceType)
    const ir = await adapter({
      ...state,
      workspaceDir: state.workspaceDir || pipeline.config.workspaceDir
    })
    validateIR(ir, sourceType)
    return ir
  },

  /**
   * 结构校验：按规范声明的产物结构检查生成结果
   * 纯确定性规则，不调 LLM
   */
  'code-structure-validator': async (state, { spec }) => {
    const issues = []
    const code = state.code || {}
    const expected = [spec.artifacts.entryFile, ...(spec.artifacts.extraFiles || [])]

    for (const file of expected) {
      if (!code[file] || !String(code[file]).trim()) {
        issues.push(`缺少规范要求的产物文件：${file}`)
      }
    }

    const entry = code[spec.artifacts.entryFile]
    if (entry && !/<template[\s>]/.test(entry) && spec.artifacts.entryFile.endsWith('.vue')) {
      issues.push(`${spec.artifacts.entryFile} 缺少 <template> 块`)
    }

    // declare.json 结构校验（P2：模板先行后 LLM 业务字段仍需 schema 把关；
    // simple 档/降级路径的 LLM 完整输出也在此拦截）
    if (code['declare.json']) {
      try {
        const declareJson = JSON.parse(code['declare.json'])
        const { DeclareJsonSchemaValidator } = await import(
          '../../ai-engine/validators/declare-json-schema-validator.js'
        )
        const result = DeclareJsonSchemaValidator.validate(declareJson, {
          componentId: state.componentId || state.componentName || undefined
        })
        if (!result.pass || result.warnCount > 0) {
          issues.push(
            `declare.json 校验：${DeclareJsonSchemaValidator.formatSummary(result).replace(/\n/g, ' ')}`
          )
        }
      } catch (e) {
        issues.push(`declare.json 无法解析：${e.message}`)
      }
    }

    return {
      structureIssues: issues,
      warnings: [...(state.warnings || []), ...issues]
    }
  },

  /**
   * 修订决策：文本质量分 × 视觉相似度 合并评判
   *
   * 旧 graph 的同名节点有 ~400 行分支（reviseTarget 细分、收敛提前退出、
   * 复杂度分级…）。v2 只保留其决策骨架：
   *   合并分 = 文本分 × 0.5 + 视觉分 × 0.5（任一缺失则退回单边分）
   * 这与旧 graph:1530 的加权一致，细分策略留待有实测依据后再补，
   * 不预先把没验证过的启发式规则搬进新引擎。
   *
   * 视觉比对降级时 visualComparison 已被置 null（而非 similarity: 0），
   * 因此这里不会把「比对服务挂了」误判成「像素差极大」而空转满修订轮次。
   */
  'revision-decision': async (state, { tierProfile }) => {
    const textScore = typeof state.qualityScore === 'number' ? state.qualityScore : null
    const rawVisual = state.visualComparison?.similarity ?? null
    const threshold = state.qualityThreshold ?? 75
    const count = state._revisionCount || 0
    const max = tierProfile.maxRevisions ?? 0

    // 视觉分为 0 不是「差」，是「没比出来」——真渲染出的组件再离谱也不会一处不像。
    // degraded 报告已在 resultPatch 里置 null，能走到这里的 0 说明比对跑通但结论不可信
    // （预览页没渲染出组件、截图内容与设计稿完全不相干等）。
    // 当真分用会把合并分永久压在阈值下，修订每轮都判不达标却修不动，纯烧钱。
    const visualUntrusted = rawVisual === 0
    const visualScore = visualUntrusted ? null : rawVisual

    const merged =
      textScore !== null && visualScore !== null
        ? Math.round(textScore * 0.5 + visualScore * 0.5)
        : (textScore ?? visualScore ?? 100)

    const reasons = []
    if (merged < threshold) reasons.push(`合并分 ${merged} < ${threshold}`)
    // 报告整体不可信时，其中的 high 级差异同样不可信，不作为修订理由
    if (state.visualComparison?.hasHighIssue && !visualUntrusted) reasons.push('存在 high 级视觉差异')
    if (state.needsRevision) reasons.push('对抗检查判定 needs_revision')
    // structureIssues（缺文件/缺 template）不列为修订理由：回环起点是精修节点，
    // 精修只改已有文件的样式与布局，补不出缺失产物，据此重跑只会空转满轮次。
    // 该问题已由 code-structure-validator 记入 warnings。

    const warnings = [...(state.warnings || [])]
    if (visualUntrusted) {
      warnings.push(
        '视觉比对相似度为 0，判定为不可信信号并已从合并评分中剔除；请确认前端预览服务能正常渲染该组件'
      )
    }

    // ---- 派生精修范围与靶子文件 ----
    // _reviseTarget：adversarial-checker 越权检测与 refiner prompt 都依赖此字段。
    //   按问题类别优先级：compliance/structural -> full/structural（需重生成）
    //                     stylistic -> stylistic（仅样式）
    //                     layout -> layout（仅布局）
    //                     视觉差异为主且无文本分类 -> layout（合并精修，默认较便宜）
    //   无任何类别信息时退回 'full'，与旧管线首轮默认一致。
    const checkResult = state.checkResult || {}
    const cats = checkResult.issueCategories || {}
    const hasCompliance = (cats.compliance?.length || 0) > 0
    const hasStructural = (cats.structural?.length || 0) > 0
    const hasStylistic = (cats.stylistic?.length || 0) > 0
    const hasLayout = (cats.layout?.length || 0) > 0

    let _reviseTarget = 'full'
    if (hasCompliance || hasStructural) {
      _reviseTarget = hasStructural ? 'structural' : 'full'
    } else if (hasStylistic) {
      _reviseTarget = 'stylistic'
    } else if (hasLayout) {
      _reviseTarget = 'layout'
    } else if (state.visualComparison?.hasHighIssue && !visualUntrusted) {
      _reviseTarget = 'layout'
    }

    // refineTargetFiles / refineTargetClassNames：从 critiques[].location 抽取
    //   靶子文件与 CSS 类，让 refiner 只改问题文件。'full' 模式不限制靶子
    //   （全量重做时 refiner 会读全部 generatedFiles）。
    let refineTargetFiles = null
    let refineTargetClassNames = null
    if (_reviseTarget !== 'full' && checkResult.critiques?.length) {
      const genFiles = Array.isArray(state.generatedFiles) ? state.generatedFiles : []
      const rt = resolveTargetFiles(checkResult, genFiles, { mainComponentFile: 'package/index.vue' })
      if (rt.hasTargets) {
        refineTargetFiles = Array.from(rt.targetFiles)
        refineTargetClassNames = rt.targetClassNames.length ? rt.targetClassNames : null
      }
    }

    const base = {
      _mergedScore: merged,
      _reviseTarget,
      refineTargetFiles,
      refineTargetClassNames,
      warnings
    }

    if (!reasons.length) {
      return { ...base, _decision: 'pass', _decisionReason: `质量达标（合并分 ${merged}）` }
    }
    if (count >= max) {
      const reason = `已达修订上限 ${max} 轮，带问题交付：${reasons.join('；')}`
      return {
        ...base,
        _decision: 'pass',
        _decisionReason: reason,
        warnings: [...warnings, reason]
      }
    }
    return {
      ...base,
      _decision: 'revise',
      _revisionCount: count + 1,
      _decisionReason: `第 ${count + 1} 轮修订（${_reviseTarget}）：${reasons.join('；')}`
    }
  },

  /** 产物落定：按规范的 artifacts 结构组装最终文件清单 */
  emit: async (state, { spec }) => {
    const code = state.code || {}
    const files = {}

    for (const file of [spec.artifacts.entryFile, ...(spec.artifacts.extraFiles || [])]) {
      if (code[file]) files[file] = code[file]
    }
    // 生成但未在规范中声明的文件仍保留，只标注
    const extra = Object.keys(code).filter(f => !(f in files))

    return {
      artifacts: {
        specId: spec.id,
        entryFile: spec.artifacts.entryFile,
        styleExt: spec.artifacts.styleExt,
        files,
        undeclaredFiles: extra
      }
    }
  }
}

export default ConfigurablePipeline
