import {
  GENERATION_INPUT_SCHEMA_VERSION,
  GENERATION_INPUT_FIELDS,
  RAW_CONTEXT_FIELDS,
  assertGenerationInputShape,
} from './context-schema.js'
import { compileDesignFacts } from './design-facts-compiler.js'
import { resolveContextConflicts } from './context-conflict-resolver.js'
import { applyContextBudget, jsonByteLength } from './context-budget.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'generation-context-assembler' })
// 🛡️ e7da39ca（2026-11-02）：形态⑤（单个 `table-header` 容器）的**读取口径唯一来源**
//   在 vision-facts.js；本模块只消费，不自写第二份解析（判据同构单一来源纪律）。
import { declaredTableHeaderContainerTexts } from '../utils/vision-facts.js'

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
  // 🛡️ e7da39ca（mc-max-1793582610570 实锤，2026-11-02）：第五种表头形态——单个
  //   `table-header` 容器声明（`{role:'table-header', children:[{text},…]}`）。
  //   白名单此前只认前四形态 ⇒ 该形态契约在装配层被剥掉 ⇒ 真机退化
  //   `table:notTableColumn`。读取口径唯一来源是
  //   vision-facts#declaredTableHeaderContainerTexts（此处不重写解析）。
  const containerHeaders = declaredTableHeaderContainerTexts(section) || undefined
  const normalizedHeaders = columnHeaders || containerHeaders
  const body = bodyHeaders || bodyTableStyle || bodyChildren.length > 0 || normalizedHeaders
    ? {
        ...(bodyHeaders ? { headers: bodyHeaders } : {}),
        ...(bodyTableStyle ? { tableStyle: bodyTableStyle } : {}),
        ...(normalizedHeaders ? { headers: normalizedHeaders } : {}),
        ...(bodyChildren.length > 0 ? { children: bodyChildren } : {}),
      }
    : undefined
  return {
    ...(headers(section) ? { headers: headers(section) } : {}),
    ...(tableStyle(section) ? { tableStyle: tableStyle(section) } : {}),
    ...(body ? { body } : {}),
  }
}

/**
 * 🔴 R8-7（2026-11-02 · mc-max-1793630407343-dea074f9 实锤）：段**内容契约**透传。
 *
 * 病灶：本函数白名单重建此前不透传 `body`，而 `resolvePlanSections`（prompt-builder）
 * 优先读 `generationInput.componentPlan`（本函数产物）⇒ vision 的 `body.items`（厂商 6 项）
 * / `body.children`（2 张 stat-card）在装配层被丢弃 ⇒ 刀53 的 R3（collectSectionFigmaRefs）
 * / R6（collectDeclaredItems）/ 刀20a / statrow / table 五处判据共用同一断供开关、全部
 * fail-open ⇒ 段内容被 header/icon 单形态确定性裁没且零告警（真机 `headerTaken:3,iconTaken:1`）。
 *
 * 此处**不是整体回流 body**（体积 + vision 幻觉双控），只透传「声明内容量」所需的最小骨架：
 *   · 布局标量：`layout` / `gridColumns`
 *   · 内容数组：`items` / `children` / `elements`（三键取首个非空，与 collectDeclaredItems 同族）
 *   · 节点递归白名单（深度 ≤ 4）：文本载体 `text/name/value/label/title`、结构 `id/role/type/
 *     figmaNode/layout/gridColumns`、容器 `children/items/elements/content/parts`、
 *     资源 `icon.resourceFile/width/height`（仅引用，不回 base64）
 *   · 体积：单段节点 ≤ 200、单字符串 ≤ 40 字符；componentPlan 级 body 总字节 ≤ 6144
 *     （`componentPlanBytes` 预算 8KB，余量留给既有字段），超限**截断并计数**，不静默丢。
 * 缺 body / 无内容数组 ⇒ 不产键（零副作用，既有 spec 的无 body fixture 逐字不变）。
 */
const BODY_NODE_SCALAR_KEYS = ['id', 'role', 'type', 'name', 'text', 'value', 'label', 'title', 'figmaNode', 'layout', 'gridColumns']
const BODY_NODE_ARRAY_KEYS = ['children', 'items', 'elements', 'parts']
const BODY_MAX_DEPTH = 4
const BODY_MAX_NODES_PER_SECTION = 200
const BODY_MAX_TEXT_LEN = 40
const BODY_BUDGET_BYTES = 6144
// 🛡️ G04 观测（2026-11-14）：body 子节点白名单的「已透传」全集。
//   原 R8-7 droppedKeys 只扫 section 顶层，body 子节点里被剥的 25 类细粒度真值
//   （charts/series/seriesColors/axes/styles/resourceFile/…）0 留痕 ⇒ S7 断裂长期不可见。
//   这里把「被剥字段名 + 次数」聚合进 normalization.bodyDroppedKeys（纯附加，不改 plan 结构）。
const BODY_NODE_PASSTHROUGH_KEYS = new Set([
  ...BODY_NODE_SCALAR_KEYS, ...BODY_NODE_ARRAY_KEYS, 'content', 'icon',
])

function normalizeBodyText(value) {
  if (typeof value === 'string') return value.slice(0, BODY_MAX_TEXT_LEN)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function normalizeBodyNode(node, depth, counter) {
  if (!node || typeof node !== 'object' || depth > BODY_MAX_DEPTH) return null
  if (counter.nodes >= BODY_MAX_NODES_PER_SECTION) {
    counter.truncated += 1
    return null
  }
  counter.nodes += 1
  const out = {}
  // 🛡️ G04：逐节点登记被白名单剥掉的内容型字段（0 也必须可观测，聚合在 normalizeBodyContract）
  if (counter.droppedKeys) {
    for (const [key, value] of Object.entries(node)) {
      if (BODY_NODE_PASSTHROUGH_KEYS.has(key)) continue
      if (value && typeof value === 'object') {
        counter.droppedKeys[key] = (counter.droppedKeys[key] || 0) + 1
      }
    }
  }
  for (const key of BODY_NODE_SCALAR_KEYS) {
    const v = normalizeBodyText(node[key])
    if (v !== undefined && v !== '') out[key] = v
  }
  // 容器对象（`content` 在 vision 里是对象，其 parts/elements 才是文本载体）
  if (node.content && typeof node.content === 'object' && !Array.isArray(node.content)) {
    const content = normalizeBodyNode(node.content, depth + 1, counter)
    if (content && Object.keys(content).length > 0) out.content = content
  }
  for (const key of BODY_NODE_ARRAY_KEYS) {
    const arr = node[key]
    if (!Array.isArray(arr) || arr.length === 0) continue
    const kids = arr
      .map((child) => normalizeBodyNode(child, depth + 1, counter))
      .filter(Boolean)
    if (kids.length > 0) out[key] = kids
  }
  if (node.icon && typeof node.icon === 'object') {
    const icon = {}
    if (typeof node.icon.resourceFile === 'string') icon.resourceFile = node.icon.resourceFile
    if (Number.isFinite(Number(node.icon.width))) icon.width = Number(node.icon.width)
    if (Number.isFinite(Number(node.icon.height))) icon.height = Number(node.icon.height)
    if (Object.keys(icon).length > 0) out.icon = icon
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * @returns {{contract:Object, nodes:number, truncated:number}|undefined} 无内容契约 ⇒ undefined
 */
function normalizeBodyContract(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  const items =
    (Array.isArray(body.items) && body.items.length > 0 && { key: 'items', arr: body.items }) ||
    (Array.isArray(body.children) && body.children.length > 0 && { key: 'children', arr: body.children }) ||
    (Array.isArray(body.elements) && body.elements.length > 0 && { key: 'elements', arr: body.elements }) ||
    null
  // 🔴 产键门槛（assembler-rowpeers 既有阴性断言的语义）：**无内容数组 ⇒ 不产 body 键**。
  //   layout/gridColumns 只是内容契约的附带标量，不能单独构成 body —— 否则「表格表头契约
  //   残缺 ⇒ 不产 body（宁缺不猜）」的既有行为被漂移，且空 body 对 R6/R3 对账无意义。
  if (!items) return undefined
  const contract = {}
  if (typeof body.layout === 'string' && body.layout) contract.layout = body.layout
  if (Number.isFinite(Number(body.gridColumns))) contract.gridColumns = Number(body.gridColumns)
  const counter = { nodes: 0, truncated: 0, droppedKeys: {} }
  const kids = items.arr.map((child) => normalizeBodyNode(child, 0, counter)).filter(Boolean)
  if (kids.length > 0) contract[items.key] = kids
  if (Object.keys(contract).length === 0) return undefined
  return {
    contract,
    nodes: counter.nodes,
    truncated: counter.truncated,
    droppedKeys: counter.droppedKeys,
  }
}

/** R8-7 droppedKeys 判定的「已透传字段」全集（与本函数 return 的键一一对应）。 */
const BODY_PASSTHROUGH_KEYS = new Set([
  'id', 'title', 'responsibility', 'elementCount', 'type', 'collapsed', 'renderHint',
  'itemCount', 'items', 'headers', 'tableStyle', 'body', 'isLayoutContainer', 'layout',
  'layoutSource', 'sourceNodeIds', 'figmaAnchorId', 'absoluteBoundingBox', 'figmaBox', 'styles',
  'rowPeerIds', 'layoutMetadata', 'children', 'header',
  // 🛡️ 2026-11-04（mc-max-1793771678347-18544d9c 实锤）：internalSubcomponents 是图表宿主归属
  //   事实源（chart-section.js 几何宿主挂载），此前被白名单剥掉 → production 输入 internalSubcomponents:0
  //   → 宿主 section 永远不知道自己名下有图表 → 双渲染/图表缺失。白名单放行 + 下方显式归一化透传。
  'internalSubcomponents', '_derivedFromId',
  // 🛡️ 2026-11-08（mc-1794126061219-cbcac19a 实锤）：internalGeometry 是**段内结构事实**
  //   （planner P-4 采集：锚点子树顶层元素 bbox + 直接文本，最多 24 项）。
  //   此前被白名单剥掉 → production 输入段内结构全空 → 段 `2:8787`（Figma 里是一行两张
  //   193×64.8 卡）在 prompt 里只剩「一个 tabs 段」 → LLM 只画一张卡，单卡被拉成整条、
  //   底图箭头变形、卡内文字溢出。白名单放行 + 下方显式归一化透传，与 18544d9c 同款第二断点。
  'internalGeometry',
  // 🛡️ 2026-11-08（mc-1794142475652-ad63598d 实锤）：itemSkeleton 是**卡内骨架事实**
  //   （planner H DOM contract：`deriveItemSkeleton` 从 Figma 几何推导
  //   `textDirection / gapPx / texts / icon{w,h} / iconPosition`）。
  //   此前被白名单剥掉 → `section-tree.js:1473/1546` 的「H3 硬骨架 DOM 模板」拿不到事实
  //   → LLM 把「icon 左 + 文本列竖排（名称上/数值下）」写成**一行横排** ⇒
  //   实测卡片内「摄像机」(x=601) 与「(2/484)」(x=643) 同行、后者右边界 700 > 卡片 679
  //   ⇒ 数值被裁 21px。与 internalGeometry 同族第二断点，白名单放行 + 归一化透传。
  'itemSkeleton',
])

/** internalSubcomponents 透传字段（最小契约，与 planner R1/chart-section 产出字段对齐）。 */
const INTERNAL_SUB_PASSTHROUGH_KEYS = [
  'type', 'id', 'name', 'responsibility', 'reason',
  'parentSectionId', 'parentSectionTitle',
  'props', 'emits', 'sourceNodeIds', 'chartType',
  'elementNames', 'textTruths',
]

function normalizeInternalSubs(subs) {
  if (!Array.isArray(subs)) return undefined
  const out = subs
    .filter((s) => s && typeof s === 'object')
    .map((s) => {
      const o = {}
      for (const k of INTERNAL_SUB_PASSTHROUGH_KEYS) {
        if (s[k] === undefined || s[k] === null) continue
        o[k] = s[k]
      }
      return o
    })
    .filter((o) => Object.keys(o).length > 0)
  return out.length > 0 ? out : undefined
}

/** internalGeometry 归一化上限（planner 侧最多 24 项，此处兜底防 prompt 膨胀） */
const INTERNAL_GEOMETRY_MAX_ITEMS = 24

/** 单条段内元素文本上限（与 planner 采集口径一致） */
const INTERNAL_GEOMETRY_TEXT_MAX = 40

/**
 * 段内结构事实归一化（P-4 `internalGeometry`）。
 *
 * 只保留「几何 + 直接文本」两类事实，坐标取整、文本截断、非法项丢弃；
 * 空数组 ⇒ 返回 undefined（缺字段不产键，零副作用）。
 *
 * @param {unknown} raw planner 采集的 [{x,y,w,h,text?}]
 * @returns {Array<{x:number,y:number,w:number,h:number,text?:string}>|undefined}
 */
function normalizeInternalGeometry(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out = []
  for (const it of raw.slice(0, INTERNAL_GEOMETRY_MAX_ITEMS)) {
    if (!it || typeof it !== 'object') continue
    const w = Number(it.w)
    const h = Number(it.h)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue
    const item = {
      x: Number.isFinite(Number(it.x)) ? Math.round(Number(it.x)) : 0,
      y: Number.isFinite(Number(it.y)) ? Math.round(Number(it.y)) : 0,
      w: Math.round(w),
      h: Math.round(h),
    }
    const text = typeof it.text === 'string' ? it.text.trim().slice(0, INTERNAL_GEOMETRY_TEXT_MAX) : ''
    if (text) item.text = text
    out.push(item)
  }
  return out.length > 0 ? out : undefined
}

/**
 * 卡内骨架事实归一化（planner H DOM contract 的 `itemSkeleton`）。
 *
 * 只保留「文本列方向 / 行间距 / 各行文本 / icon 尺寸与左右位置」五类事实，
 * 非法值丢弃；无 `textDirection` 或 `texts` 为空 ⇒ 返回 undefined（缺字段不产键，零副作用）。
 *
 * @param {unknown} raw planner `deriveItemSkeleton` 产出
 * @returns {{textDirection:'column'|'row', gapPx:number, texts:string[], icon?:{widthPx:number,heightPx:number}, iconPosition?:'left'|'right'}|undefined}
 */
function normalizeItemSkeleton(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const dir = raw.textDirection === 'column' || raw.textDirection === 'row' ? raw.textDirection : null
  const texts = Array.isArray(raw.texts)
    ? raw.texts.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 40))
    : []
  if (!dir || texts.length === 0) return undefined
  const out = {
    textDirection: dir,
    gapPx: Number.isFinite(Number(raw.gapPx)) ? Math.max(0, Math.round(Number(raw.gapPx))) : 0,
    texts,
  }
  const icon = raw.icon && typeof raw.icon === 'object' ? raw.icon : null
  const iw = Number(icon?.widthPx)
  const ih = Number(icon?.heightPx)
  if (Number.isFinite(iw) && Number.isFinite(ih) && iw > 0 && ih > 0) {
    out.icon = { widthPx: Math.round(iw), heightPx: Math.round(ih) }
  }
  if (raw.iconPosition === 'left' || raw.iconPosition === 'right') out.iconPosition = raw.iconPosition
  return out
}

function normalizeSectionNode(section, ctx = null) {  if (!section || typeof section !== 'object') return null
  const children = Array.isArray(section.children)
    ? section.children.map((child) => normalizeSectionNode(child, ctx)).filter(Boolean)
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
  const bodyResult = normalizeBodyContract(section.body)
  // 🛡️ 2026-11-04（18544d9c 实锤）：图表宿主归属（internalSubcomponents）透传——
  //   几何宿主挂载在 section 级与 plan 级两处消费，归一化剥掉即生产断供。
  const internalSubcomponents = normalizeInternalSubs(section.internalSubcomponents)
  // 🛡️ 2026-11-08（cbcac19a 实锤）：段内结构事实（P-4）。缺省不产键。
  const internalGeometry = normalizeInternalGeometry(section.internalGeometry)
  // 🛡️ 2026-11-08（ad63598d 实锤）：卡内骨架事实（H DOM contract）。缺省不产键。
  const itemSkeleton = normalizeItemSkeleton(section.itemSkeleton)
  if (ctx) {
    // 🔴 R8-7 观测：白名单剔除的**内容型**字段（对象/数组值）按名计数 —— 终结「第 N 次
    //   同类补丁」：今后任何事实被白名单剥掉，真机日志一行可见（聚合于 normalizeComponentPlan）。
    for (const [key, value] of Object.entries(section)) {
      if (BODY_PASSTHROUGH_KEYS.has(key)) continue
      if (value && typeof value === 'object') ctx.droppedKeys[key] = (ctx.droppedKeys[key] || 0) + 1
    }
    // R7：修复锚点透传计数（递归容器/叶子共用同一 ctx，0 也必须可观测）。
    if (typeof section.figmaAnchorId === 'string' && section.figmaAnchorId) ctx.repairedAnchors += 1
    // 🛡️ G14a 同源续接：显式核算 E1 派生身份留痕，字符串字段不由 droppedKeys 观测。
    if (typeof section._derivedFromId === 'string' && section._derivedFromId) ctx.derivedIdPassthrough += 1
    if (bodyResult) {
      ctx.bodySections += 1
      ctx.bodyNodes += bodyResult.nodes
      ctx.bodyTruncated += bodyResult.truncated
      // 🛡️ G04：body 子节点被剥字段按名计数（0 也出现在 normalization.bodyDroppedKeys={}）
      for (const [key, count] of Object.entries(bodyResult.droppedKeys || {})) {
        ctx.bodyDroppedKeys[key] = (ctx.bodyDroppedKeys[key] || 0) + count
      }
    }
  }
  return {
    id: section.id || null,
    title: section.title || null,
    responsibility: section.responsibility || null,
    elementCount: Number.isFinite(section.elementCount) ? section.elementCount : null,
    type: section.type || null,
    // 🛡️ C0（2026-11-04 · mc-max-1793723025659-a72365c4 实锤）：header 是结构事实源。
    //   planner 已透传 `header.controls/headerSlots`，此处若不透传会在第二断点再次断供。
    //   原样透传，不做字段级修补。
    ...(section.header && typeof section.header === 'object' ? { header: section.header } : {}),
    collapsed: section.collapsed === true,
    renderHint: section.renderHint || null,
    itemCount: Number.isFinite(section.itemCount) ? section.itemCount : null,
    items: Array.isArray(section.items) ? section.items : undefined,
    // 🛡️ bc38e1e6：表格接管在真实链路优先读 generationInput.componentPlan；
    //   白名单若剥掉 body.headers / body.children[].headers，analysis 单独回放虽绿，
    //   真机仍退化为 table:notTableColumn。只透传最小表头契约，不回流 cells/items/bg 大字段。
    ...normalizeTableHeaderContract(section),
    // 🛡️ R8-7：段内容契约透传（见 normalizeBodyContract 注释）。**独立键 declaredContent**，
    //   不与 normalizeTableHeaderContract 的 `body` 合并 —— 既有契约刻意「body 只承载最小
    //   表头、不回流 cells/items/bg」（bc38e1e6/40b65d9f/e7da39ca 深等于断言），共用键必然
    //   互相覆盖。判据读取口径：collectDeclaredItems / collectSectionFigmaRefs 的 OR 链。
    //   缺内容数组 ⇒ 不产键（零副作用）。
    ...(bodyResult ? { declaredContent: bodyResult.contract } : {}),
    isLayoutContainer: section.isLayoutContainer === true,
    layout: section.layout || null,
    layoutSource: section.layoutSource || null,
    // 🛡️ R1-1：透传归属 Figma 节点 id 集合（dedupeDuplicateSections 单一归属去重依赖它）
    sourceNodeIds: Array.isArray(section.sourceNodeIds)
      ? section.sourceNodeIds.map((s) => String(s)).filter(Boolean)
      : undefined,
    // R7：主锚与归属集合是两种契约——sourceNodeIds 再完整也不能替代 figmaAnchorId。
    ...(section.figmaAnchorId ? { figmaAnchorId: String(section.figmaAnchorId) } : {}),
    // 🛡️ G14a 同源续接：保留 E1 派生身份留痕供后续统一去重判据消费；不进入锚点候选与归属集合。
    ...(typeof section._derivedFromId === 'string' && section._derivedFromId
      ? { _derivedFromId: section._derivedFromId }
      : {}),
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
    ...(Number.isFinite(Number(section.styles?.figmaHeightPx)) || Number.isFinite(Number(section.styles?.flexGrow))
      ? {
          styles: {
            // 🛡️ R9（2026-11-09 · loop-verify · 设备监测 49d23fe1 实锤）：flexGrow 真值透传。
            //   病灶：A4（figma-height-ratio）把容器级宽度/高度比例写进段级 styles.flexGrow
            //   （89:39=2.054 / 2:8437=1.911），prompt 下发的 planner plan 原文里有，
            //   但本函数 styles 归一化只保留 figmaHeightPx ⇒ generationInput.componentPlan
            //   （engineer 装配/结构契约/healing 的统一输入）里 flexGrow 全部丢失 ⇒
            //   LLM 无从对照真值，自写 flex:0.111/0.889 ⇒ tab 列塌成 1 字宽、双统计卡被裁。
            //   修法：figmaHeightPx 与 flexGrow 一起透传（缺省不产键，零副作用）。
            ...(Number.isFinite(Number(section.styles.figmaHeightPx))
              ? { figmaHeightPx: Number(section.styles.figmaHeightPx) }
              : {}),
            ...(Number.isFinite(Number(section.styles.flexGrow))
              ? { flexGrow: Number(section.styles.flexGrow) }
              : {}),
          },
        }
      : {}),
    // 🛡️ 2026-11-04（18544d9c 实锤）：图表宿主归属透传（缺省不产键，零副作用）
    ...(internalSubcomponents ? { internalSubcomponents } : {}),
    // 🛡️ 2026-11-08（cbcac19a 实锤）：段内结构事实透传（缺省不产键，零副作用）
    ...(internalGeometry ? { internalGeometry } : {}),
    // 🛡️ 2026-11-08（ad63598d 实锤）：卡内骨架事实透传（缺省不产键，零副作用）
    ...(itemSkeleton ? { itemSkeleton } : {}),
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

export function normalizeComponentPlan(plan) {
  if (!plan || typeof plan !== 'object') return null
  const ctx = {
    droppedKeys: {},
    bodyDroppedKeys: {},
    repairedAnchors: 0,
    bodySections: 0,
    bodyNodes: 0,
    bodyTruncated: 0,
    bodyDroppedByBudget: 0,
    bodyBytes: 0,
    derivedIdPassthrough: 0,
  }
  const sections = Array.isArray(plan.effectiveSections)
    ? plan.effectiveSections.map((sec) => normalizeSectionNode(sec, ctx)).filter(Boolean)
    : []
  // 🔴 R8-7 体积闸：componentPlan 预算 8KB（CONTEXT_LIMITS.componentPlanBytes），body 透传
  //   总量另设 6KB 上限（余量留给既有字段）。超限段**只剥 body、保留段本身**并计数 ——
  //   宁可该段退回「无声明」旧行为，也不让整个 plan 超预算（next 模式预算门禁会阻断）。
  let used = 0
  for (const sec of sections) {
    if (!sec || !sec.declaredContent) continue
    const bytes = jsonByteLength(sec.declaredContent)
    if (used + bytes > BODY_BUDGET_BYTES) {
      delete sec.declaredContent
      ctx.bodyDroppedByBudget += 1
      continue
    }
    used += bytes
  }
  ctx.bodyBytes = used

  // 🛡️ 2026-11-04（18544d9c 实锤）：plan 级 internalSubcomponents 透传（图表宿主归属），
  //   与 section 级同契约；缺省不产键（零副作用）。
  const planInternalSubs = normalizeInternalSubs(plan.internalSubcomponents)

  return {
    effectiveSections: sections,
    isForced: plan.isForced === true,
    minFiles: Number.isFinite(plan.minFiles) ? plan.minFiles : null,
    reason: plan.reason || null,
    ...(planInternalSubs ? { internalSubcomponents: planInternalSubs } : {}),
    // 🔴 R8-7 计数行数据源（0 也必须出现）：调用方据此打一行 `plan 归一化·已评估`。
    normalization: { sections: sections.length, ...ctx },
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

  const componentPlan = normalizeComponentPlan(state.subComponentPlan || state.componentPlan)
  // 🔴 R8-7 计数行（0 也必须出现）：bodySections/bodyBytes=透传生效分母；bodyDroppedByBudget/
  //   bodyTruncated=截断留痕；droppedKeys=白名单剔除的内容型字段（第 N 次同类补丁的终结观测）。
  if (componentPlan?.normalization) {
    logger.info('🛡️ plan 归一化·已评估', componentPlan.normalization)
  }
  const rawInput = {
    schemaVersion: GENERATION_INPUT_SCHEMA_VERSION,
    designFacts,
    componentPlan,    resourceManifest: normalizeResourceManifest(resourceDomMapping),
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
