/**
 * NodeRegistry —— 节点实例化适配层
 *
 * ============ 架构权衡一：只读复用，不复制 ============
 *
 * 原计划把 ai-engine/roles 全量复制进 v2 再改造。实测统计后否决：
 *
 *     microcode-engineer 5108 行 / visual-parser 2367 / adversarial-checker 2181
 *     roles 总计 20008 行
 *
 * 复制 2 万行的代价是**双份维护**：旧管线修一个 bug，v2 要同步改一遍，
 * 不同步就产生行为漂移 —— 这比「两份 graph 文件」的原始痛点更严重。
 *
 * 改用：**只读复用 + 适配翻译**
 *   - v2 引用旧 role 类，但从不修改它们（旧管线行为零变化）
 *   - 差异通过「构造参数翻译」和「prompt 属性注入」在适配层完成
 *   - 旧 role 构造器都是 `constructor(config)` 且 `...config` 全展开，天然可配
 *
 * spec 差异的载体本来就只有两样 —— 构造参数（target/componentType）
 * 和规范文本（loadReferenceFiles 的结果），两者都能从外部注入。
 *
 * 需要真正独立实现时（如 react 需全新生成逻辑），在 v2 写新 Engineer
 * 注册到 NODE_OVERRIDES 即可 —— 渐进替换，而非一次性复制。
 *
 * ============ 架构权衡二：惰性加载 ============
 *
 * role 类一律用动态 import 惰性加载，不在模块顶层静态引入。原因有二：
 *
 *   1. 性能：配置解析 / dry-run / 配置页取数据都不需要 role 实现，
 *      静态 import 会让这些轻量操作白白加载 2 万行代码。
 *
 *   2. 环境解耦：本仓是 TS/JS 混合工程 —— `nest-cli.json` 把 所有 .js 文件
 *      原样复制，`.ts` 经 tsc 编译。role 的 .js 文件 import 了
 *      `config/backend-root.js`（源码里只有 .ts，构建后才有 .js），
 *      因此 role 只能在 dist 环境加载。惰性化后，v2 的配置层
 *      在 src 环境也能独立自检，不被构建产物绑架。
 */

import { resolveNodePrompt } from '../specs/prompt-resolver.js'
import { getNodeMode } from './tier-profile.js'

/**
 * engineerClass 白名单 —— 与 skill-loader 的 ALLOWED_ENGINEER_CLASSES 对应。
 * 用户上传的规范包只能引用这里的类名，杜绝任意类实例化。
 * 值为惰性加载器，不是类本身。
 */
export const ENGINEER_CLASSES = {
  MicrocodeEngineer: () =>
    import('../../ai-engine/roles/microcode-engineer.js').then(m => m.MicrocodeEngineer),
  Vue3Engineer: () => import('../../ai-engine/roles/vue3-engineer.js').then(m => m.Vue3Engineer)
}

/**
 * 节点元数据表
 *
 *   className    role 类名（字符串，dry-run 时无需加载即可展示）
 *   load         惰性加载器，返回类或函数
 *   kind         'class' | 'fn' | 'builtin'（builtin = v2 自实现的确定性节点）
 *   promptProp   该 role 存放规范文本的实例属性名（真实属性，从源码提取）
 *   specParams   spec 需要翻译进构造参数的字段
 *   execParams   运行期入参翻译：v2 state → role.execute(params)
 *   resultPatch  运行期出参翻译：role 返回值 → v2 state 补丁
 *   invoke       非 execute() 调用约定时的自定义调用（如 VisualComparator.compare 位置参数）
 *   skip         前置判据，返回原因字符串则整节点跳过（配 skipPatch 写回空结果）
 *   onError      节点失败可容忍时的兜底补丁；未定义则失败即中断管线
 *   touchesDisk  该节点直接改写磁盘文件，执行后需从磁盘回读刷新 state.code
 *
 * ============ 架构权衡三：运行期 IO 也要翻译 ============
 *
 * 只翻译构造参数是不够的。旧 role 的 execute() 各有一套**位置固定的具名入参**
 * （VisualParser 要 previewImage/outputPath，StyleMapper 要 elements/visualElements，
 * Engineer 要 layoutStructure/styleMappings/headerSlots…），返回值字段名也各不相同
 * （Engineer 返回 files/writtenFiles，StyleMapper 整个返回值即 styleMappings）。
 *
 * 旧管线把这套映射硬编码在 mc-component-graph-phase2.js 的每个节点包装里。
 * v2 若直接 `role.execute(state)`，字段名对不上 → 参数全 undefined → 静默降级
 * （VisualParser 内部有 try/catch 兜底，不抛异常，只回退化结果，极难发现）。
 *
 * 因此把这套映射显式收敛到 execParams / resultPatch，来源是旧 graph 的调用点：
 *   visual-parser  :447  style-mapper :669  code-engineer:735
 *   layout-reviewer:617  layout-refiner:849 style-refiner:919
 *   adversarial-checker:1002  screenshot-renderer:1159  visual-comparator:1245
 * 保持与旧管线逐字段一致，避免行为漂移。
 *
 * ============ 架构权衡四：精修节点改的是磁盘，不是 state ============
 *
 * LayoutRefiner / StyleRefiner 只返回 { refined, modifiedFiles: 相对路径[] }，
 * 真正的内容改动直接写在 outputPath 下的文件里。code-engineer 产出的
 * state.code（文件名→内容）在精修后立刻过期 —— 若 emit 仍读 state.code，
 * max 档最终交付的会是**精修前**的代码，且外部完全看不出异常。
 *
 * 解决：给这类节点标 touchesDisk，引擎在该步骤结束后按 generatedFiles
 * 从磁盘回读一次，state.code 始终等于磁盘真值。
 */

/** 各 role 通用的运行期入参（进度回调、中断信号、限流策略） */
function commonExecParams(state) {
  return {
    onProgress: state.onProgress,
    signal: state.signal || state.__abortSignal || null,
    requestConcurrency: state.requestConcurrency,
    requestQueueTimeoutMs: state.requestQueueTimeoutMs,
    requestTimeoutMs: state.requestTimeoutMs,
    requestMaxRetries: state.requestMaxRetries
  }
}

/** 面板明暗主题：与旧 graph 的取值链一致 */
function deriveBrightness(state) {
  return (
    state.visualElements?.backgroundBrightness ||
    state.layoutStructure?.styles?.backgroundBrightness ||
    'dark'
  )
}
export const NODE_META = {
  'visual-parser': {
    kind: 'class',
    className: 'VisualParser',
    load: () => import('../../ai-engine/roles/visual-parser.js').then(m => m.VisualParser),
    // 该 role 自行探测项目根加载 preview-analysis prompt，不走属性注入
    promptProp: null,
    specParams: spec => ({
      target: deriveTarget(spec),
      componentType: deriveTarget(spec),
      // 面板外壳剥离由规范声明驱动，不再靠 id 硬判断
      stripOuterPanel: spec.panel?.stripOuterShell ?? false
    }),
    // 对齐旧 graph:447
    execParams: (state, { spec }) => ({
      ...commonExecParams(state),
      target: deriveTarget(spec),
      previewImage: state.imagePath,
      figmaData: state.figmaData,
      outputPath: state.outputPath,
      resourceDomMapping: state.resourceDomMapping || null,
      fileKey: state.meta?.fileKey || null,
      nodeId: state.meta?.nodeId || null
    }),
    // 对齐旧 graph:569
    resultPatch: result => {
      // VisualParser 内部对任何异常都返回 degraded 结果而不抛错。
      // 旧管线容忍它继续跑，代价是「拿空布局生成组件」——产物看似成功实则无依据。
      // v2 视其为硬失败：没有视觉依据就没有生成的意义，早失败早暴露。
      if (result.degraded) {
        throw new Error(`视觉分析降级，无有效布局依据：${result.degradeReason || '未知原因'}`)
      }
      return {
        layoutStructure: result.layoutStructure,
        visualElements: result.visualElements,
        interactions: result.interactions,
        charts: result.charts,
        headerSlots: result.headerSlots || [],
        analysisType: result.analysisType || '',
        analysisTarget: result.analysisTarget || '',
        analysisDescription: result.analysisDescription || '',
        analysisEvidence: result.analysisEvidence || []
      }
    }
  },

  'layout-reviewer': {
    kind: 'class',
    className: 'LayoutReviewer',
    load: () => import('../../ai-engine/roles/layout-reviewer.js').then(m => m.LayoutReviewer),
    promptProp: 'guidelines',
    specParams: () => ({}),
    // 对齐旧 graph:617
    execParams: state => ({
      ...commonExecParams(state),
      layoutStructure: state.layoutStructure
    }),
    resultPatch: result => ({ reviewResult: result })
  },

  'style-mapper': {
    kind: 'class',
    className: 'StyleMapper',
    load: () => import('../../ai-engine/roles/style-mapper.js').then(m => m.StyleMapper),
    promptProp: 'styleGuides',
    specParams: spec => ({
      useCssVariables: spec.style?.useCssVariables ?? false,
      styleExt: spec.artifacts?.styleExt || 'less'
    }),
    // 对齐旧 graph:669
    execParams: state => ({
      ...commonExecParams(state),
      visualElements: state.visualElements,
      figmaStyles: state.figmaData?.styles,
      // 传完整 layoutStructure：SM 内部递归收集子元素
      elements: state.layoutStructure,
      backgroundBrightness: deriveBrightness(state)
    }),
    // 对齐旧 graph:691 —— 整个返回值即 styleMappings
    resultPatch: result => ({ styleMappings: result })
  },

  'code-engineer': {
    kind: 'class',
    // 动态选类：由 spec.engineerClass 决定
    className: spec => spec.engineerClass || 'MicrocodeEngineer',
    load: spec => {
      const name = spec.engineerClass || 'MicrocodeEngineer'
      const loader = ENGINEER_CLASSES[name]
      if (!loader) {
        throw new Error(
          `规范 "${spec.id}" 声明的 engineerClass "${name}" 不在白名单中，` +
            `可用：${Object.keys(ENGINEER_CLASSES).join(', ')}`
        )
      }
      return loader()
    },
    promptProp: spec => (spec.engineerClass === 'Vue3Engineer' ? 'vue3Specs' : 'constraints'),
    specParams: spec => ({
      componentType: spec.id,
      styleExt: spec.artifacts?.styleExt || 'less',
      scriptLang: spec.artifacts?.scriptLang || 'js',
      namingRules: spec.naming || {},
      bindingMode: spec.binding?.mode
    }),
    // 对齐旧 graph:735（去掉 Figma 专属与自优化等 v2 暂不支持的字段）
    execParams: (state, { spec }) => ({
      ...commonExecParams(state),
      layoutStructure: state.layoutStructure,
      visualElements: state.visualElements,
      componentName: state.componentName,
      displayName: state.figmaData?.name || state.analysisTarget || state.componentName,
      outputPath: state.outputPath,
      stage: state.sourceType === 'figma' ? 'figma' : 'preview',
      reviewResult: state.reviewResult,
      previousCritiques: state.checkResult?.critiques,
      charts: state.charts,
      interactions: state.interactions,
      analysisType: state.analysisType || '',
      analysisTarget: state.analysisTarget || '',
      analysisDescription: state.analysisDescription || '',
      analysisEvidence: state.analysisEvidence || [],
      figmaNodeData: state.figmaData,
      styleMappings: state.styleMappings,
      resourceDomMapping: state.resourceDomMapping || null,
      panelType: spec.panel?.defaultPanelType || 'default-panel',
      headerSlots: state.headerSlots || [],
      elementStyleMap: state.styleMappings?.elementStyleMap,
      backgroundBrightness: deriveBrightness(state)
    }),
    // 对齐旧 graph:800；额外产出 code（文件名→内容），供 v2 的
    // code-structure-validator / emit 这两个确定性节点消费
    resultPatch: result => ({
      code: result.files || result.generatedFiles || {},
      generatedFiles: result.writtenFiles,
      componentStructure: result.componentStructure,
      componentDir: result.componentDir,
      // 精修前快照：adversarial-checker 用它做越权改动检测（旧 graph:1008 originalFiles）
      preRefineFiles: result.files || result.generatedFiles || {}
    })
  },

  'layout-refiner': {
    kind: 'class',
    className: 'LayoutRefiner',
    load: () => import('../../ai-engine/roles/layout-refiner.js').then(m => m.LayoutRefiner),
    promptProp: 'rules',
    specParams: spec => ({ target: deriveTarget(spec) }),
    // 对齐旧 graph:849
    execParams: state => ({
      ...commonExecParams(state),
      figmaNodeData: state.figmaData,
      layoutStructure: state.layoutStructure,
      outputPath: state.outputPath,
      generatedFiles: state.generatedFiles,
      visualDiffGuidance: state.visualDiffGuidance || null,
      targetFiles: state.refineTargetFiles || null,
      targetClassNames: state.refineTargetClassNames || null,
      // _reviseTarget：决定 refiner 的精修范围（layout/stylistic/full）。
      // 首轮默认 'full'，后续由 revision-decision 按 issueCategories 派生。
      _reviseTarget: state._reviseTarget || 'full'
    }),
    resultPatch: result => ({ layoutRefineResult: result }),
    touchesDisk: true
  },

  'style-refiner': {
    kind: 'class',
    className: 'StyleRefiner',
    load: () => import('../../ai-engine/roles/style-refiner.js').then(m => m.StyleRefiner),
    promptProp: 'rules',
    specParams: spec => ({
      target: deriveTarget(spec),
      useCssVariables: spec.style?.useCssVariables ?? false
    }),
    // 对齐旧 graph:919
    execParams: state => ({
      ...commonExecParams(state),
      figmaNodeData: state.figmaData,
      styleMappings: state.styleMappings,
      visualElements: state.visualElements,
      outputPath: state.outputPath,
      generatedFiles: state.generatedFiles,
      visualDiffGuidance: state.visualDiffGuidance || null,
      targetFiles: state.refineTargetFiles || null,
      targetClassNames: state.refineTargetClassNames || null,
      _reviseTarget: state._reviseTarget || 'full'
    }),
    resultPatch: result => ({ styleRefineResult: result }),
    touchesDisk: true
  },

  'adversarial-checker': {
    kind: 'class',
    className: 'AdversarialChecker',
    load: () => import('../../ai-engine/roles/adversarial-checker.js').then(m => m.AdversarialChecker),
    // 该 role 用 _referencePaths 懒加载文档，机制与其他 role 不同，
    // 走专用注入分支（见 applyPromptInjection）
    promptProp: '__adversarial',
    specParams: spec => ({
      componentType: spec.id,
      target: deriveTarget(spec),
      validatorRuleSet: spec.validatorRuleSet
    }),
    // 对齐旧 graph:1002
    execParams: (state, { spec }) => ({
      ...commonExecParams(state),
      componentType: deriveTarget(spec),
      generatedFiles: state.generatedFiles,
      outputPath: state.outputPath,
      layoutStructure: state.layoutStructure,
      originalFiles: state.preRefineFiles || null,
      resourceDomMapping: state.resourceDomMapping || null,
      headerSlots: state.headerSlots || [],
      elementStyleMap: state.styleMappings?.elementStyleMap,
      // _reviseTarget 由 revision-decision 派生（首轮默认 'full'）。
      // 越权检测 detectUnauthorizedChanges 依赖此字段：'full' 模式无限制（不检），
      // 'stylistic'/'layout'/'structural' 各有禁止项。不透传则永远走 'full' -> 检测失效。
      _reviseTarget: state._reviseTarget || 'full'
    }),
    // 质量信号必须外溢：此前只把整个 result 塞进 state.checkResult，
    // 调用方拿到的 warnings 永远是空的 —— 检查器发现的问题等于白检。
    // 这里把 high/medium 级 critique 与越权改动提升为管线级 warnings。
    resultPatch: (result, state) => {
      const critiques = result?.critiques || []
      const surfaced = critiques
        .filter(c => (c.severity === 'high' || c.severity === 'medium') && !c.autoResolved)
        .map(c => `[${c.severity}/${c.category || 'general'}] ${c.issue}${c.location ? `（${c.location}）` : ''}`)

      if (result?.authorizationViolation?.violation) {
        surfaced.push(
          `[high/authorization] 检测到越权改动：${result.authorizationViolation.reason || '未说明'}`
        )
      }

      return {
        checkResult: result,
        qualityScore: result?.qualityScore ?? null,
        needsRevision: result?.checkResult === 'needs_revision',
        violationCount:
          (state.violationCount || 0) + (result?.authorizationViolation?.violation ? 1 : 0),
        warnings: [...(state.warnings || []), ...surfaced]
      }
    }
  },

  'screenshot-renderer': {
    // 函数式模块，无类导出
    kind: 'fn',
    className: 'renderScreenshot()',
    load: () => import('../../ai-engine/roles/screenshot-renderer.js').then(m => m.renderScreenshot),
    promptProp: null,
    specParams: () => ({}),
    // 对齐旧 graph:1159。旧管线把截图包成后台 Promise 与 adversarial-checker 并行，
    // v2 拓扑中 adversarial-checker 已在其之前完成，并行无收益，改为直接等待。
    skip: state => {
      if (!state.outputPath) return '缺少 outputPath'
      if (!state.imagePath) return '缺少设计原图'
      return null
    },
    skipPatch: () => ({ renderedImage: null, renderedImageIsStaticFallback: false }),
    execParams: (state, { spec }) => ({
      outputPath: state.outputPath,
      sessionId: state.sessionId,
      componentName: state.componentName,
      groupId: state.groupId || 'default-group',
      target: deriveTarget(spec),
      previewImage: state.imagePath,
      onProgress: state.onProgress,
      // 对齐旧 graph:1074/1333：硬门禁 + 缺图自愈。
      // 少了 hardGate，运行时报错不会进 runtimeGate；少了自愈，缺图直接判 BLOCK。
      hardGate: true,
      allowMissingAssetSelfHeal: true
    }),
    // 截图前必须先发布到前端 workspace（对齐旧 graph:1062/1318）。
    // renderScreenshot 走的是前端预览页 /preview/:componentId，而预览页只认
    // frontend/workspace/custom-components/<componentId>；产物待在 temp-components 里
    // 预览页就渲染「组件不存在」——截图有内容（不触发空白检测）但和设计稿毫无关系，
    // 视觉相似度恒为 0，修订回环会带着一个永远修不好的分数空转满轮次。
    invoke: async (fn, params) => {
      const { publishQualityPreview } = await import('../../ai-engine/utils/workspace-preview-publisher.js')
      await publishQualityPreview({
        outputPath: params.outputPath,
        componentId: params.sessionId,
        groupId: params.groupId,
        target: params.target
      })
      return fn(params)
    },
    resultPatch: result => ({
      renderedImage: result?.renderedImage || null,
      renderedImageIsStaticFallback: Boolean(result?.isStaticFallback),
      runtimeGate: result?.runtimeGate || null
    }),
    // 截图依赖前端预览服务与无头浏览器，属外部环境依赖；
    // 渲染失败只应让视觉回归退化为「不做」，不该让整次生成失败（对齐旧 graph:1170）
    onError: () => ({ renderedImage: null, renderedImageIsStaticFallback: false })
  },

  'visual-comparator': {
    kind: 'class',
    className: 'VisualComparator',
    load: () => import('../../ai-engine/roles/visual-comparator.js').then(m => m.VisualComparator),
    promptProp: null,
    specParams: () => ({}),
    // 对齐旧 graph:1208/1214/1225
    skip: state => {
      if (!state.renderedImage) return '无渲染截图'
      // 静态抽取降级的截图含未解析模板，比对结果无参考价值
      if (state.renderedImageIsStaticFallback) return '截图来自静态抽取降级（前端服务未连接）'
      if (!state.imagePath) return '无设计原图'
      return null
    },
    skipPatch: () => ({ visualComparisonReport: null, visualComparison: null, visualDiffGuidance: null }),
    // compare() 是位置参数 + 非 execute 方法名，走 invoke 自定义调用
    execParams: state => ({
      figmaImage: state.imagePath,
      renderedImage: state.renderedImage,
      options: commonExecParams(state)
    }),
    invoke: async (role, p) => {
      const report = await role.compare(p.figmaImage, p.renderedImage, p.options)
      // formatForRefiner 是静态方法，用 role.constructor 取，免得适配层再 import 一次类
      const guidance =
        report && !report.degraded ? role.constructor.formatForRefiner(report) : null
      return { report, guidance }
    },
    // 降级报告的 overallSimilarity 恒为 0，若当成有效分数会让 revision-decision
    // 每轮都判定「极低分」→ 无意义地打满修订轮次（旧 graph:1254 同样规避）
    resultPatch: ({ report, guidance }) => {
      if (!report || report.degraded) {
        return { visualComparisonReport: null, visualComparison: null, visualDiffGuidance: null }
      }
      return {
        visualComparisonReport: report,
        visualDiffGuidance: guidance,
        visualComparison: {
          similarity: report.overallSimilarity,
          pass: Boolean(report.pass),
          issueCount: report.issues?.length || 0,
          hasHighIssue: (report.issues || []).some(i => i.severity === 'high')
        }
      }
    },
    onError: () => ({ visualComparisonReport: null, visualComparison: null, visualDiffGuidance: null })
  },

  // ---- 以下为 v2 自行实现的确定性节点 ----
  'input-adapter': { kind: 'builtin', className: null, promptProp: null, specParams: () => ({}) },
  'code-structure-validator': { kind: 'builtin', className: null, promptProp: null, specParams: () => ({}) },
  'revision-decision': { kind: 'builtin', className: null, promptProp: null, specParams: () => ({}) },
  emit: { kind: 'builtin', className: null, promptProp: null, specParams: () => ({}) }
}

/**
 * v2 覆盖实现注册处
 *
 * 当某规范无法用参数表达、必须写独立实现时在此注册：
 *     NODE_OVERRIDES['code-engineer'] = { react: () => import('../roles/react-engineer.js').then(m => m.ReactEngineer) }
 * 解析时优先于 NODE_META，实现渐进式替换而非全量复制。
 */
export const NODE_OVERRIDES = {}

/** 从规范派生旧 role 认识的 target 值 */
function deriveTarget(spec) {
  if (spec.id === 'microcode') return 'microcode'
  if (spec.binding?.mode === 'declare-config') return 'microcode'
  return 'vue3'
}

/** promptProp 可能是字符串或 spec 函数，统一求值 */
function resolvePromptProp(meta, spec) {
  return typeof meta.promptProp === 'function' ? meta.promptProp(spec) : meta.promptProp
}

/** className 同理 */
function resolveClassName(meta, spec) {
  return typeof meta.className === 'function' ? meta.className(spec) : meta.className
}

/**
 * 把 v2 装配好的 prompt 文本注入 role 实例
 *
 * 注入内容来自 spec.promptInjection，而该映射本身是从旧 role 的
 * loadReferenceFiles 真实清单提取的 —— 所以默认 replace 不降低生成质量，
 * 只是把「role 硬编码读哪些文档」变成「规范声明读哪些文档」。
 */
function applyPromptInjection(role, nodeId, spec, meta, { mode = 'replace' } = {}) {
  const prop = resolvePromptProp(meta, spec)
  if (!prop) return { injected: false, reason: 'no-prompt-prop' }

  const resolved = resolveNodePrompt(spec, nodeId)
  if (!resolved.text) {
    return { injected: false, reason: 'empty-injection', warnings: resolved.warnings }
  }

  // adversarial-checker 用 _referencePaths 懒加载，不能直接覆盖属性，
  // 改为塞入预解析文本，由其 prompt 组装阶段消费
  if (prop === '__adversarial') {
    role.__v2InjectedSpecDocs = resolved.text
    return { injected: true, prop: '__v2InjectedSpecDocs', docs: resolved.docs.length }
  }

  const original = role[prop]
  role[prop] =
    mode === 'append' && typeof original === 'string' && original
      ? `${original}\n\n${resolved.text}`
      : resolved.text

  return {
    injected: true,
    prop,
    mode,
    docs: resolved.docs.length,
    chars: resolved.text.length,
    warnings: resolved.warnings
  }
}

/**
 * 实例化节点（惰性加载 role 实现）
 *
 * @param {string} nodeId
 * @param {object} ctx { spec, tierProfile, modelEntry, promptInjectionMode }
 * @returns {Promise<{ role, fn, meta, mode, injection }>}
 */
export async function instantiateNode(nodeId, ctx = {}) {
  const { spec, tierProfile, modelEntry, promptInjectionMode } = ctx

  const meta = NODE_META[nodeId]
  if (!meta) {
    throw new Error(`未知节点 "${nodeId}"，已注册：${Object.keys(NODE_META).join(', ')}`)
  }

  const mode = tierProfile ? getNodeMode(tierProfile, nodeId) : 'default'

  // v2 覆盖实现优先
  const overrideLoader = NODE_OVERRIDES[nodeId]?.[spec?.id]

  if (meta.kind === 'builtin' && !overrideLoader) {
    return { role: null, fn: null, meta, mode, injection: { injected: false, reason: 'builtin-node' } }
  }

  const Impl = overrideLoader ? await overrideLoader() : await meta.load(spec)

  if (meta.kind === 'fn' && !overrideLoader) {
    return { role: null, fn: Impl, meta, mode, injection: { injected: false, reason: 'functional-node' } }
  }

  const roleConfig = {
    // 模型与凭证（来自 model-resolver）
    apiKey: modelEntry?.apiKey,
    baseURL: modelEntry?.baseURL,
    model: modelEntry?.model,
    // 规范翻译出的构造参数
    ...meta.specParams(spec),
    // 节点运行模式（programmatic / rules / llm / default）
    v2NodeMode: mode,
    // 完整 spec 备查（v2 新实现可直接消费；旧 role 忽略未知字段）
    v2Spec: spec
  }

  const role = new Impl(roleConfig)
  const injection = applyPromptInjection(role, nodeId, spec, meta, {
    mode: promptInjectionMode || 'replace'
  })

  return { role, fn: null, meta, mode, injection, usedOverride: Boolean(overrideLoader) }
}

/**
 * 干跑：不加载 role 实现、不调 LLM，只解析每个节点会用什么配置
 * 供配置页预览与 CI 自检使用（可在 src 环境直接运行）
 */
export function dryRunNodes(tierProfile, { spec, modelTable } = {}) {
  return tierProfile.nodes.map(nodeId => {
    const meta = NODE_META[nodeId]
    const mode = getNodeMode(tierProfile, nodeId)
    const entry = modelTable?.[nodeId]

    const prop = meta ? resolvePromptProp(meta, spec) : null
    const promptInfo = prop ? resolveNodePrompt(spec, nodeId) : null

    return {
      nodeId,
      kind: meta?.kind,
      impl: meta ? resolveClassName(meta, spec) : null,
      mode,
      model: entry?.callsLlm ? entry.model : null,
      modelSource: entry?.callsLlm ? entry.source : null,
      channel: entry?.channel,
      callsLlm: entry?.callsLlm ?? false,
      promptProp: prop || null,
      promptDocs: promptInfo?.docs.length ?? 0,
      promptChars: promptInfo?.text.length ?? 0
    }
  })
}

/**
 * 校验档位中所有节点都已注册（配置错误在启动期暴露）
 */
export function validateNodeCoverage(tierProfile) {
  const unregistered = tierProfile.nodes.filter(n => !NODE_META[n])
  if (unregistered.length) {
    throw new Error(
      `档位 "${tierProfile.id}" 含未注册节点：${unregistered.join(', ')}`
    )
  }
  return true
}

export default {
  ENGINEER_CLASSES,
  NODE_META,
  NODE_OVERRIDES,
  instantiateNode,
  dryRunNodes,
  validateNodeCoverage
}
