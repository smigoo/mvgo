import {
  GENERATION_INPUT_SCHEMA_VERSION,
  GENERATION_INPUT_FIELDS,
  RAW_CONTEXT_FIELDS,
  assertGenerationInputShape,
} from './context-schema.js'
import { compileDesignFacts } from './design-facts-compiler.js'
import { resolveContextConflicts } from './context-conflict-resolver.js'
import { applyContextBudget } from './context-budget.js'

function normalizeTableHeaderContract(section) {
  const headers = (owner) => Array.isArray(owner?.headers) ? owner.headers.map((h) => String(h)) : undefined
  const tableStyle = (owner) => Array.isArray(owner?.tableStyle?.headers)
    ? { headers: owner.tableStyle.headers.map((h) => String(h)) }
    : undefined
  const bodyChildren = Array.isArray(section?.body?.children)
    ? section.body.children.map((child) => {
        const childHeaders = headers(child)
        const childTableStyle = tableStyle(child)
        if (!childHeaders && !childTableStyle) return null
        return {
          ...(childHeaders ? { headers: childHeaders } : {}),
          ...(childTableStyle ? { tableStyle: childTableStyle } : {}),
        }
      }).filter(Boolean)
    : []
  const bodyHeaders = headers(section?.body)
  const bodyTableStyle = tableStyle(section?.body)
  // 🛡️ 40b65d9f（mc-max-1793429330206 实锤）：第三种表头形态——按列声明。
  //   body.children[].{role:'table-column', header} 每列自带表头文本；旧白名单
  //   既不回流该 body，也不归一成 headers 数组 ⇒ 真机接管器 declaredTableHeaders
  //   恒空 ⇒ LCA 回查失效 ⇒ table:notTableColumn 落入 LLM 自由渲染。
  //   这里把逐列 header 归一成共享契约的 body.headers（单一事实源仍是
  //   section-type-derive.js#declaredTableHeaders 的读取口径）。
  const rawChildren = Array.isArray(section?.body?.children) ? section.body.children : []
  const perColumn = rawChildren.map((c) => String(c?.header ?? '').trim())
  const allColumns =
    rawChildren.length >= 2 &&
    rawChildren.every((c) => String(c?.role || '').toLowerCase() === 'table-column') &&
    perColumn.every(Boolean)
  const columnHeaders = allColumns ? perColumn : undefined
  const body = bodyHeaders || bodyTableStyle || bodyChildren.length > 0 || columnHeaders
    ? {
        ...(bodyHeaders ? { headers: bodyHeaders } : {}),
        ...(bodyTableStyle ? { tableStyle: bodyTableStyle } : {}),
        ...(columnHeaders ? { headers: columnHeaders } : {}),
        ...(bodyChildren.length > 0 ? { children: bodyChildren } : {}),
      }
    : undefined
  return {
    ...(headers(section) ? { headers: headers(section) } : {}),
    ...(tableStyle(section) ? { tableStyle: tableStyle(section) } : {}),
    ...(body ? { body } : {}),
  }
}

function normalizeSectionNode(section) {
  if (!section || typeof section !== 'object') return null
  const children = Array.isArray(section.children)
    ? section.children.map(normalizeSectionNode).filter(Boolean)
    : undefined
  // 🛡️ 治本（2026-09-16 · mc-1789501340553-e25b9b55 实锤）：透传 layoutMetadata。
  //   此前 normalizeSectionNode 完全丢弃 layoutMetadata → Engineer 拿不到 height/flexGrow/direction
  //   → context-shadow.json 全是 None → 代码生成 prompt 没有布局比例信息 → 所有 section flex:1 平分。
  //   analysis.json 显示 flexGrow 有值（0.606/0.549/0.703/2.142），说明 planner 的 applyFigmaHeightGrow 生效了，
  //   但 context-shadow 丢了这些事实 → Engineer 只能盲猜。
  const layoutMetadata = section.layoutMetadata && typeof section.layoutMetadata === 'object'
    ? {
        height: Number.isFinite(section.layoutMetadata.height) ? section.layoutMetadata.height : null,
        flexGrow: Number.isFinite(section.layoutMetadata.flexGrow) ? section.layoutMetadata.flexGrow : null,
        direction: section.layoutMetadata.direction || null,
        alignItems: section.layoutMetadata.alignItems || null,
        justifyContent: section.layoutMetadata.justifyContent || null,
        gap: Number.isFinite(section.layoutMetadata.gap) ? section.layoutMetadata.gap : null,
        padding: section.layoutMetadata.padding && typeof section.layoutMetadata.padding === 'object'
          ? {
              top: Number.isFinite(section.layoutMetadata.padding.top) ? section.layoutMetadata.padding.top : 0,
              right: Number.isFinite(section.layoutMetadata.padding.right) ? section.layoutMetadata.padding.right : 0,
              bottom: Number.isFinite(section.layoutMetadata.padding.bottom) ? section.layoutMetadata.padding.bottom : 0,
              left: Number.isFinite(section.layoutMetadata.padding.left) ? section.layoutMetadata.padding.left : 0,
            }
          : undefined,
      }
    : undefined
  return {
    id: section.id || null,
    title: section.title || null,
    responsibility: section.responsibility || null,
    elementCount: Number.isFinite(section.elementCount) ? section.elementCount : null,
    type: section.type || null,
    collapsed: section.collapsed === true,
    renderHint: section.renderHint || null,
    itemCount: Number.isFinite(section.itemCount) ? section.itemCount : null,
    items: Array.isArray(section.items) ? section.items : undefined,
    // 🛡️ bc38e1e6：表格接管在真实链路优先读 generationInput.componentPlan；
    //   白名单若剥掉 body.headers / body.children[].headers，analysis 单独回放虽绿，
    //   真机仍退化为 table:notTableColumn。只透传最小表头契约，不回流 cells/items/bg 大字段。
    ...normalizeTableHeaderContract(section),
    isLayoutContainer: section.isLayoutContainer === true,
    layout: section.layout || null,
    layoutSource: section.layoutSource || null,
    // 🛡️ R1-1：透传归属 Figma 节点 id 集合（dedupeDuplicateSections 单一归属去重依赖它）
    sourceNodeIds: Array.isArray(section.sourceNodeIds)
      ? section.sourceNodeIds.map((s) => String(s)).filter(Boolean)
      : undefined,
    // 🛡️ 刀 29b（mc-max-1793255115028-7ec263c9 实锤）：几何三件套透传。
    //   此前白名单重建剥掉 absoluteBoundingBox/figmaBox ⇒ engineer 的
    //   resolveSubComponentPlan 优先取本函数产物（generationInput.componentPlan）
    //   ⇒ 刀 28c 落在 plan 上的「整列并集几何」（宿主 470x517）丢失 ⇒ 装配
    //   回查 figma id（首卡 GROUP 72px）⇒ 列表挤进 72px 壳。与 #138 rowPeerIds
    //   同款第二断点。缺字段不产键，零副作用（纯几何事实，命名无关）。
    ...(section.absoluteBoundingBox &&
      Number.isFinite(Number(section.absoluteBoundingBox.width)) &&
      Number.isFinite(Number(section.absoluteBoundingBox.height))
      ? {
          absoluteBoundingBox: {
            x: Number(section.absoluteBoundingBox.x) || 0,
            y: Number(section.absoluteBoundingBox.y) || 0,
            width: Number(section.absoluteBoundingBox.width),
            height: Number(section.absoluteBoundingBox.height),
          },
        }
      : {}),
    ...(section.figmaBox &&
      Number.isFinite(Number(section.figmaBox.width)) &&
      Number.isFinite(Number(section.figmaBox.height))
      ? {
          figmaBox: {
            x: Number(section.figmaBox.x) || 0,
            y: Number(section.figmaBox.y) || 0,
            width: Number(section.figmaBox.width),
            height: Number(section.figmaBox.height),
          },
        }
      : {}),
    ...(Number.isFinite(Number(section.styles?.figmaHeightPx))
      ? { styles: { figmaHeightPx: Number(section.styles.figmaHeightPx) } }
      : {}),
    // 🛡️ #138 续（2026-10-20 · 60dee79d/d7abdee8 实锤）：E1 互挂兄弟真值第二断点。
    //   planner 已透传 rowPeerIds，但此处 normalizeSectionNode 白名单重建再次剥掉 ⇒
    //   engineer 的 resolveSubComponentPlan **优先取 generationInput.componentPlan**（本函数产物）
    //   ⇒ 刀32（healRowPeersWrap）真值条件仍恒 false、fail-open 静默跳过。缺字段不产键，零副作用。
    ...(Array.isArray(section.rowPeerIds) && section.rowPeerIds.length > 0
      ? { rowPeerIds: section.rowPeerIds.map((s) => String(s)) }
      : {}),
    // 🛡️ 2026-09-16：透传布局元数据（height/flexGrow/direction/gap/padding）
    ...(layoutMetadata ? { layoutMetadata } : {}),
    ...(children && children.length > 0 ? { children } : {}),
  }
}

function normalizeComponentPlan(plan) {
  if (!plan || typeof plan !== 'object') return null
  const sections = Array.isArray(plan.effectiveSections)
    ? plan.effectiveSections.map(normalizeSectionNode).filter(Boolean)
    : []

  return {
    effectiveSections: sections,
    isForced: plan.isForced === true,
    minFiles: Number.isFinite(plan.minFiles) ? plan.minFiles : null,
    reason: plan.reason || null,
  }
}

function normalizeResourceManifest(resourceDomMapping) {
  if (!Array.isArray(resourceDomMapping)) return []
  return resourceDomMapping.map((item) => ({
    resourceId: item.resourceId || item.id || item.name || null,
    fileName: item.fileName || item.filename || item.name || null,
    role: item.role || null,
    recommendedUsage: item.recommendedUsage || null,
    figmaNodeId: item.figmaNodeId || item.nodeId || null,
  }))
}

function checkpointRefs(state) {
  const outputPath = state.outputPath || state.ctx?.outputPath || null
  if (!outputPath) return {}
  return {
    figma: `${outputPath}/.checkpoint/figma.json`,
    visual: `${outputPath}/.checkpoint/visual.json`,
    analysis: `${outputPath}/.checkpoint/analysis.json`,
  }
}

/**
 * 构建 Engineer 未来唯一接收的 generationInput。
 * 当前模块为纯函数骨架；未接入任何 graph，调用方需显式选择 shadow/next。
 */
export function assembleGenerationContext(state = {}) {
  const visualAnalysis = state.visualAnalysis || {
    layoutStructure: state.layoutStructure,
    visualElements: state.visualElements,
    charts: state.charts,
    coverageReport: state.layoutStructure?.coverageReport,
  }
  const reviewResult = state.reviewResult || null
  const styleMappings = state.styleMappings || null
  const resourceDomMapping = state.resourceDomMapping || state.ctx?.resourceDomMapping || []
  const designFacts = compileDesignFacts({
    figmaNodeData: state.figmaNodeData || state.figmaData,
    visualAnalysis,
  })
  const resolution = resolveContextConflicts({
    designFacts,
    visualAnalysis,
    reviewResult,
    styleMappings,
  })

  const rawInput = {
    schemaVersion: GENERATION_INPUT_SCHEMA_VERSION,
    designFacts,
    componentPlan: normalizeComponentPlan(state.subComponentPlan || state.componentPlan),
    resourceManifest: normalizeResourceManifest(resourceDomMapping),
    currentIssues: resolution.currentIssues,
    trustVerdict: resolution.trustVerdict,
    contextManifest: {
      stage: 'engineer',
      mode: 'shadow-only',
      included: GENERATION_INPUT_FIELDS.filter((field) => field !== 'contextManifest'),
      excluded: RAW_CONTEXT_FIELDS,
      diagnosticsRef: checkpointRefs(state),
      conflictSummary: {
        rejectedClaimCount: resolution.diagnostics.rejectedClaims.length,
        rejectedClaimIds: resolution.diagnostics.rejectedClaims.map(
          (claim) => `${claim.source}:${claim.property}`,
        ),
      },
    },
  }

  const budgeted = applyContextBudget(rawInput)
  return assertGenerationInputShape(budgeted)
}
