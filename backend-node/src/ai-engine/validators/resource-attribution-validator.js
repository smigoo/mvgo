import { buildResourceUsageCorpus, isResourceUsedInCorpus, filterAvailableResources } from '../utils/resource-import-guard.js'
import { buildResourceManifest } from '../utils/resource-manifest.js'

/**
 * ResourceAttributionValidator - 资源归属一致性校验（方案5，2026-08-26；#278 升级）
 *
 * 背景（mc-max-1787709055958 实锤）：Figma 真值为「bg-7880 整体背景 + bg-7890 tabs 背景
 * + bg-tab-active-7891 active tab」，但模型生成代码时把 tabs 背景挂到 chart-section、
 * 漏用整体背景，导致洞外光强 tab 背景缺失 / 图表区多余背景。
 *
 * 本校验器做确定性的资源归属校验（零 LLM，纯几何/数据结构比对）：
 *   1. RES-UNUSED-BG：成功下载的 bg 背景资源未被任何组件代码引用 → 漏用背景（WARN + 自愈挂载）。
 *   2. RES-UNUSED-ICON：成功下载的 icon 资源未被任何组件代码引用 → 漏用图标（WARN）。
 *   3. RES-UNUSED-IMG：成功下载的 img 资源未被任何组件代码引用 → 漏用图片（WARN）。
 *   4. RES-BG-FULL-SCOPE：整体背景（figmaBox 覆盖整个画布 > 80%）却被识别为某区域背景
 *      （figmaPath 含逻辑容器）→ 归属边界矛盾（整体背景应挂根容器，不该归属子容器）（WARN）。
 *   5. RES-BG-MULTI-USE：同一 bg 被多个 .vue 组件引用 → 背景乱用信号（WARN）。
 *   6. RES-ATTR-CROSS-SECTION：资源被绑定到非归属 section 的组件文件（BLOCK，L7 防御性门禁）。
 *   7. bgAttribution：输出每个 bg 资源的「权威归属」映射（scope + figmaPath 逻辑容器 +
 *      figmaBox + parentBox + targetDomHint），供重试指导 / prompt 消费。
 *
 * #278 降级（2026-08-30）：bg/icon/img 未使用从 BLOCK 降为 WARN + 自愈。
 * 根因：LLM 可能把 N 个同类资源合并成 v-for 循环（如 14 个 tab icon → 12 项），
 * 这是合理的代码抽象，不应 fail-closed。bg 由 _autoMountUnusedBackgrounds 确定性挂载自愈，
 * icon/img 由 generateAttributionGuidance 注入重试 prompt 指导使用。
 */

/** 整体背景判定阈值：figmaBox 面积 / 根容器面积 > 0.8 视为覆盖整个画布的整体背景。 */
const FULL_BG_COVERAGE_THRESHOLD = 0.8

/** 整体背景语义容器名：figmaPath 逻辑容器命中这些语义时，视为「正确表达整体背景」，不算误归属。 */
const FULL_BG_CONTAINER_HINT = /整体|root|background|背景|主背景|main|canvas|画布|container|全局|全屏/i

/**
 * 从 figmaPath 推断资源的「逻辑容器」（倒数第二段）。
 * 例："整体背景/bg-7880.png" → "整体背景"；"tabs/bg-7890.png" → "tabs"。
 * @param {object} mapping 资源映射项
 * @returns {string|null}
 */
function inferLogicalContainer(mapping = {}) {
  const parts = String(mapping.figmaPath || '').split('/').filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return null
}

/**
 * 依据 figmaBox 面积 / 根容器面积，判定 bg 背景的「作用域」。
 * - full：覆盖整个画布（> 80%）→ 整体背景，应挂根容器
 * - region：仅覆盖局部 → 区域背景，应挂对应子容器
 * - unknown：缺少 figmaBox 或根尺寸，无法判定
 * @param {object} mapping bg 资源映射项
 * @param {object|null} rootBox 根容器 { width, height }
 * @returns {'full'|'region'|'unknown'}
 */
function classifyBgScope(mapping = {}, rootBox = null) {
  const box = mapping?.figmaBox
  if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height)) return 'unknown'
  if (!rootBox || !Number.isFinite(rootBox.width) || !Number.isFinite(rootBox.height)) return 'unknown'
  const rootArea = rootBox.width * rootBox.height
  if (rootArea <= 0) return 'unknown'
  const coverage = (box.width * box.height) / rootArea
  return coverage > FULL_BG_COVERAGE_THRESHOLD ? 'full' : 'region'
}

/**
 * 构建 bg 资源的权威归属映射（供重试指导 / prompt 消费）。
 * @param {Array} bgResources 成功下载的 bg 资源映射
 * @param {object|null} rootBox 根容器 { width, height }
 * @returns {Array<{varName, name, scope, logicalContainer, targetDomHint, figmaBox, parentBox}>}
 */
export function buildBgAttribution(bgResources = [], rootBox = null) {
  return bgResources.map((m) => ({
    varName: m.assignedVarName,
    name: m.name || m.resourceFile || null,
    scope: classifyBgScope(m, rootBox),
    logicalContainer: inferLogicalContainer(m),
    targetDomHint: m.targetDomHint || null,
    figmaBox: m.figmaBox || null,
    parentBox: m.parentBox || null,
  }))
}

/**
 * 资源归属一致性校验（告警级）。
 *
 * @param {object} options
 * @param {Array}  options.resourceDomMapping 资源映射（含 assignedVarName / previewAnalysisRole /
 *                                             downloadStatus / figmaPath / figmaBox / parentBox / targetDomHint）
 * @param {Record<string,string>} options.files 生成代码文件 map（path → content）
 * @param {object|null} options.rootBox 根容器 { width, height }（用于整体背景判定）
 * @returns {{ pass: boolean, issues: Array, bgAttribution: Array }}
 */
export function validateResourceAttribution({ resourceDomMapping, files, rootBox = null, sectionManifest = null, fileSectionMap = null }) {
  const issues = []
  let blockCount = 0

  // #283：skipMount（面板整体背景，设计为不挂载）与 isTinyDecoration（≤12px 微小装饰）
  // 不应强制要求使用——它们本就不承载业务语义，纳入 BLOCK 会误伤（如 bg1 面板整体背景、
  // 8×8 圆点装饰），导致复杂组件生成必失败。
  // R0-6（2026-09-01）：可用资源过滤统一走 filterAvailableResources 单一帮手
  const availableResources = filterAvailableResources(resourceDomMapping)
  const bgResources = availableResources.filter(
    (m) => m.previewAnalysisRole === 'bg' && m.assignedVarName &&
      !m.skipMount && !m.isTinyDecoration,
  )

  const iconResources = availableResources.filter(
    (m) => m.previewAnalysisRole === 'icon' && m.assignedVarName &&
      !m.skipMount && !m.isTinyDecoration,
  )

  const imgResources = availableResources.filter(
    (m) => (m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image') && m.assignedVarName &&
      !m.skipMount && !m.isTinyDecoration,
  )

  // 检查1：bg/icon/img 资源未使用（漏用）——判定 assignedVarName / semanticVarName / 资源文件名
  // 是否在产物中被真实引用。排除 import 声明行（injectResourceImports 会为「已使用」变量补 import，
  // 纯 import 不算真实使用）。
  //
  // 🛡️ P0-4（2026-08-29）：判定改为共享单一事实源 buildResourceUsageCorpus / isResourceUsedInCorpus
  // （utils/resource-import-guard.js），与 microcode-engineer 的兜底挂载器同口径。
  // 旧口径只扫 .vue + 只认变量名 → 模型把背景写进 common.less（url(../images/bg-7890.png)）
  // 时判「未使用」BLOCK，而产物里其实已经用了（mc-max-1788056145870-6e65dc88 实锤）。
  // 现在扫描范围扩展到 .vue/.less/.css/.scss/.sass，并追加「资源文件名」匹配。
  //
  // 🛡️ 职责分工（2026-09-01 收敛）：本处（生成期 A）的 icon/img 判定结果**专门服务于
  //   generateAttributionGuidance 重试指导**（#278 补的 icon 漏用反复复发修复，勿删），
  //   与 bg 判定（触发真实挂载自愈）一起构成「生成期修复 + 指导」职责。
  //   最终「未使用」兜底由 L0-B RESOURCE-001（generate 模式）/ adversarial RES-UNUSED
  //   （精修模式）负责——三者共用 isResourceUsedInCorpus 单一事实源，零口径漂移。
  const allCode = buildResourceUsageCorpus(files)

  // 🛡️ P0-1a（2026-08-29）：资源使用判定统一——assignedVarName（编号 bg1）或 semanticVarName
  // （语义 bgm）任一被引用即算「已使用」。此前只认 assignedVarName，而 code-structure-validator
  // 的 RESOURCE-001 认两者 → 模型用 semanticVarName 时，此处判「未使用」BLOCK、那里判「已用」，
  // 同一资源两套结论矛盾（mc-max-1787934982316 bg5 误 BLOCK 潜在根因）。
  const isResourceUsed = (m, code) => isResourceUsedInCorpus(code, m)

  // #278 降级（2026-08-30）：bg/icon/img 未使用从 BLOCK 降为 WARN + 自愈提示。
  // 根因：LLM 可能把 N 个同类资源合并成 v-for 循环（如 14 个 tab icon → 12 项），
  // 这是合理的代码抽象，不应 fail-closed。改为 WARN 并在 microcode-engineer 层自动追加未引用资源。
  for (const m of bgResources) {
    const varName = m.assignedVarName
    const used = isResourceUsed(m, allCode)
    if (!used) {
      issues.push({
        id: 'RES-UNUSED-BG',
        severity: 'WARN',
        message:
          `背景资源 ${varName}（${m.name || m.resourceFile || '?'}` +
          `${m.targetDomHint ? '，' + m.targetDomHint : ''}）未被任何组件代码引用。` +
          `bg 是用户自定义命名，代表设计意图，建议作为 backgroundImage 使用。`,
        varName,
        resource: m.name || m.resourceFile || null,
      })
    }
  }

  // 🛡️ 第二道防线：bg 资源被多个 .vue 组件复用检测（2026-09-03，mc-max-1788373427334 背景乱用实锤）。
  // 背景乱用的典型形态：一个 bg（如车型分布右图背景）被 LLM 挂到了多个语义不同的组件
  // （大桥流量/车型分布/流量预测）。bg 语义 = 「它直接父元素的背景」，通常只对应一个父容器，
  // 被 >1 个 .vue 文件引用是强烈的乱用信号。WARN 级（合理复用如多 tab 同背景会误报，故不 BLOCK），
  // 提示 LLM/用户在重试指导中核对。
  for (const m of bgResources) {
    const varName = m.assignedVarName
    if (!varName) continue
    // 🛡️ files 兼容两种形态（2026-09-03）：微码链路传的是对象（Record<path, content>），
    // 部分调用方传数组（[{path, content}]）。统一归一化后再统计引用文件数。
    const fileEntries = Array.isArray(files)
      ? files.map((f) => ({ path: f?.path, content: f?.content }))
      : Object.entries(files || {}).map(([p, c]) => ({ path: p, content: c }))
    const refFiles = []
    for (const f of fileEntries) {
      const p = f?.path || ''
      if (!p.endsWith('.vue')) continue
      const c = typeof f?.content === 'string' ? f.content : ''
      if (c.includes(varName)) refFiles.push(p)
    }
    if (refFiles.length > 1) {
      issues.push({
        id: 'RES-BG-MULTI-USE',
        severity: 'WARN',
        message:
          `背景资源 ${varName}（${m.targetDomHint || m.name || '?'}）被 ${refFiles.length} 个组件引用` +
          `（${refFiles.slice(0, 4).join('、')}${refFiles.length > 4 ? ' 等' : ''}）。` +
          `bg 语义是「直接父元素的背景」，通常只对应一个父容器；多组件复用很可能是背景乱用，请核对每个引用是否真的需要该背景。`,
        varName,
        resource: m.name || m.resourceFile || null,
      })
    }
  }

  for (const m of iconResources) {
    const varName = m.assignedVarName
    const used = isResourceUsed(m, allCode)
    if (!used) {
      issues.push({
        id: 'RES-UNUSED-ICON',
        severity: 'WARN',
        message:
          `图标资源 ${varName}（${m.name || m.resourceFile || '?'}` +
          `${m.targetDomHint ? '，' + m.targetDomHint : ''}）未被任何组件代码引用。` +
          `icon 是用户自定义命名，代表设计意图，建议作为 <img :src> 使用。`,
        varName,
        resource: m.name || m.resourceFile || null,
      })
    }
  }

  for (const m of imgResources) {
    const varName = m.assignedVarName
    const used = isResourceUsed(m, allCode)
    if (!used) {
      issues.push({
        id: 'RES-UNUSED-IMG',
        severity: 'WARN',
        message:
          `图片资源 ${varName}（${m.name || m.resourceFile || '?'}` +
          `${m.targetDomHint ? '，' + m.targetDomHint : ''}）未被任何组件代码引用。` +
          `img 是用户自定义命名，代表设计意图，建议作为 <img :src> 使用。`,
        varName,
        resource: m.name || m.resourceFile || null,
      })
    }
  }

  // 检查2（P1#3 归属边界校验）：整体背景（覆盖整个画布）却归属到某「区域」逻辑容器 → 边界矛盾。
  // 逻辑容器名命中整体语义（整体/root/background/main 等）视为正确表达整体背景，不误报。
  for (const m of bgResources) {
    const scope = classifyBgScope(m, rootBox)
    const logicalContainer = inferLogicalContainer(m)
    if (scope === 'full' && logicalContainer && !FULL_BG_CONTAINER_HINT.test(logicalContainer)) {
      issues.push({
        id: 'RES-BG-FULL-SCOPE',
        severity: 'WARN',
        message:
          `背景资源 ${m.assignedVarName}（${m.name || m.resourceFile || '?'}）覆盖整个画布（整体背景），` +
          `却被归属到「${logicalContainer}」容器，存在挂错容器风险——整体背景应挂根容器，不应归属子 section`,
        varName: m.assignedVarName,
        resource: m.name || m.resourceFile || null,
        scope,
        logicalContainer,
      })
    }
  }

  const bgAttribution = buildBgAttribution(bgResources, rootBox)

  // 🔴 0907 L7 治本·跨 section 资源错绑 BLOCK（防御性门禁，L5/L6 已在 prompt 层过滤）
  // 仅当显式传入 sectionManifest 时启用；未传则 fail-open（不影响现有调用方行为）。
  if (sectionManifest) {
    const crossIssues = detectCrossSectionResourceBindings(sectionManifest, files, fileSectionMap)
    for (const ci of crossIssues) {
      issues.push(ci)
      if (ci.severity === 'BLOCK') blockCount += 1
    }
  }

  return {
    pass: issues.length === 0,
    blockCount,
    issues,
    bgAttribution,
  }
}

/**
 * 跨 section 资源错绑检测（0907 L7 治本·绑定校验 BLOCK）。
 *
 * 根因（资源错绑）：LLM 把 A section 的资源（如 icon1 属当日总流量）绑定到了 B section 的组件文件
 * （如车型分布的 VehicleTypeDistribution.vue），导致视觉错乱。L5/L6 已在 prompt 层按 section 过滤资源，
 * 本函数为防御性门禁：确定性检测「资源被绑定到非归属 section 的文件」并 BLOCK。
 *
 * 判定：
 * - 构建 varName → 归属 section（来自 Manifest.sections）的映射。
 * - 对每个子组件 .vue 文件（排除 index.vue 根聚合），统计其引用的资源分属哪些 section。
 * - 若 fileSectionMap 提供（精确）：文件归属 section != 资源归属 section → BLOCK。
 * - Loop 0.D：未提供 fileSectionMap → 跳过自动挂载式启发式，不按「引用最多」猜主 section。
 *   返回 WARN 级「未归因」诊断，禁止 fail-open 当 BLOCK。
 *
 * @param {Object} manifest - buildResourceManifest 的返回值（含 sections）
 * @param {Object|Array} files - 生成代码文件 map（path→content）或 [{path,content}]
 * @param {Object|null} [fileSectionMap] - 可选，path → 归属 section key（精确模式，来自 chunk→section 规划）
 * @returns {Array<{id,severity,message,varName,owningSection,boundSection,file}>}
 */
export function detectCrossSectionResourceBindings(manifest, files, fileSectionMap = null) {
  const varToSection = {}
  for (const [sec, res] of Object.entries(manifest?.sections || {})) {
    for (const m of res || []) {
      const v = m?.assignedVarName || m?.semanticVarName
      if (v) varToSection[v] = sec
    }
  }
  if (Object.keys(varToSection).length === 0) return []

  const issues = []
  const fileEntries = Array.isArray(files)
    ? files.map((f) => ({ path: f?.path, content: f?.content }))
    : Object.entries(files || {}).map(([p, c]) => ({ path: p, content: c }))

  for (const f of fileEntries) {
    const p = f?.path || ''
    if (!p.endsWith('.vue')) continue
    if (/index\.vue$/.test(p)) continue // 根聚合文件不参与（它引用子组件而非直接引用资源变量）

    const c = typeof f?.content === 'string' ? f.content : ''
    // 本文件引用的资源 → 归属 section 集合
    const referenced = []
    for (const [v, sec] of Object.entries(varToSection)) {
      if (c.includes(v)) referenced.push({ varName: v, section: sec })
    }
    if (referenced.length === 0) continue

    // 主 section：精确模式必须有 fileSectionMap。无 map → 跳过启发式，只记未归因 WARN。
    if (!fileSectionMap || !fileSectionMap[p]) {
      issues.push({
        id: 'RES-ATTR-UNATTRIBUTED',
        severity: 'WARN',
        message: `文件 ${p} 无 fileSectionMap，跳过跨 section 启发式拦截（Loop 0.D）`,
        file: p,
      })
      continue
    }
    const primarySec = fileSectionMap[p]

    for (const r of referenced) {
      if (r.section !== primarySec) {
        issues.push({
          id: 'RES-ATTR-CROSS-SECTION',
          severity: 'BLOCK',
          message:
            `资源 ${r.varName}（归属 ${r.section}）被错误绑定到 ${primarySec} 的组件文件 ${p}` +
            `（跨 section 资源错绑，禁止挪用其他 section 的资源）`,
          varName: r.varName,
          owningSection: r.section,
          boundSection: primarySec,
          file: p,
        })
      }
    }
  }
  return issues
}

/**
 * 跨 section 资源错绑确定性剥离（0907 L7 治本·1.C：修，不只 BLOCK）。
 *
 * 与 detectCrossSectionResourceBindings 配套的「自愈」变体：返回**修改后的 files**，
 * 把被错误绑定到非归属 section 的 DOM 引用（url(${varName}) / <img :src="varName"> /
 * background 引用）与对应的 import 语句一并移除，并记 WARN。不只为 BLOCK 等 LLM 重试。
 *
 * 仅当 fileSectionMap 精确传入时生效（Loop 0.D：无 map 不启发式，只 WARN 不删）。
 * 返回 { files, removed: [{ file, varName, owningSection, boundSection }] }。
 *
 * @param {Object} manifest - buildResourceManifest 返回值（含 sections）
 * @param {Object|Array} files - 生成代码文件 map（path→content）或 [{path,content}]
 * @param {Object|null} [fileSectionMap] - path → 归属 section key（精确模式）
 * @returns {{ files: Object, removed: Array }}
 */
export function stripCrossSectionResourceBindings(manifest, files, fileSectionMap = null) {
  const varToSection = {}
  for (const [sec, res] of Object.entries(manifest?.sections || {})) {
    for (const m of res || []) {
      const v = m?.assignedVarName || m?.semanticVarName
      if (v) varToSection[v] = sec
    }
  }
  if (Object.keys(varToSection).length === 0 || !fileSectionMap) {
    return { files: Array.isArray(files) ? files : { ...files }, removed: [] }
  }

  const fileEntries = Array.isArray(files)
    ? files.map((f) => ({ path: f?.path, content: f?.content }))
    : Object.entries(files || {}).map(([p, c]) => ({ path: p, content: c }))

  const out = {}
  const removed = []

  for (const f of fileEntries) {
    const p = f?.path || ''
    let c = typeof f?.content === 'string' ? f.content : ''
    if (p.endsWith('.vue') && !/index\.vue$/.test(p) && fileSectionMap[p]) {
      const primarySec = fileSectionMap[p]
      const referenced = []
      for (const [v, sec] of Object.entries(varToSection)) {
        if (c.includes(v)) referenced.push({ varName: v, section: sec })
      }
      for (const r of referenced) {
        if (r.section !== primarySec) {
          // ① 移除 import 语句（import varName from '.../images/varName...'）
          c = c.replace(
            new RegExp(`\\n?\\s*import\\s+${r.varName}\\s+from\\s+['\"][^'\"]*['\"]\\s*;?`, 'g'),
            '',
          )
          // ② 移除 <img ... :src="varName" ...> 整标签
          c = c.replace(
            new RegExp(`<img[^>]*\\s:src=["']${r.varName}["'][^>]*>`, 'g'),
            '',
          )
          // ③ 移除 url(${varName}) / url(varName)
          c = c.replace(new RegExp(`url\\(\\s*\\$?\\{?${r.varName}\\}?\\s*\\)`, 'g'), '')
          // ④ 兜底：模板里裸 ${varName} / "varName" 字符串引用（如 :style 拼接）
          c = c.replace(new RegExp(`\\$\\{${r.varName}\\}`, 'g'), '')
          removed.push({
            file: p,
            varName: r.varName,
            owningSection: r.section,
            boundSection: primarySec,
          })
        }
      }
    }
    out[p] = c
  }

  return { files: out, removed }
}

/**
 * 生成资源归属修订指导（WARN 级，供重试轮次注入 prompt，非阻断）。
 * @param {Array} issues validateResourceAttribution 返回的 issues
 * @param {Array} bgAttribution bg 资源权威归属映射（含 scope）
 * @returns {string}
 */
export function generateAttributionGuidance(issues = [], bgAttribution = []) {
  // #278 补齐（2026-08-28）：此前只过滤 RES-UNUSED-BG，icon/img 漏用时生成的指导为空串，
  // 重试轮次拿不到任何修正信息（与 bg 不对称，是 icon 漏用反复复发的诱因之一）。三类一并纳入。
  const unused = issues.filter(
    (i) =>
      i.id === 'RES-UNUSED-BG' ||
      i.id === 'RES-UNUSED-ICON' ||
      i.id === 'RES-UNUSED-IMG',
  )
  const fullScope = issues.filter((i) => i.id === 'RES-BG-FULL-SCOPE')
  if (unused.length === 0 && fullScope.length === 0) return ''

  let g = '\n\n# 🟡 资源归属提示（上轮生成漏用/挂错资源，本轮务必修正）\n\n'
  if (unused.length > 0) {
    g += '以下资源在上轮产物中**未被引用**，请务必在对应位置使用（用户自定义命名代表设计意图，不得漏用）：\n'
    for (const i of unused) {
      const attr = bgAttribution.find((a) => a.varName === i.varName)
      // bg 有权威归属（整体/区域）可提示挂载容器；icon/img 无归属概念，提示正确的使用形式
      const where =
        i.id === 'RES-UNUSED-BG'
          ? attr?.scope === 'full'
            ? '（整体背景，应挂根容器）'
            : attr?.logicalContainer
              ? `（应归属「${attr.logicalContainer}」容器）`
              : ''
          : i.id === 'RES-UNUSED-ICON'
            ? '（图标，必须作为 <img :src> 插入对应容器）'
            : '（图片，必须作为 <img :src> 插入对应容器）'
      g += `- \`${i.varName}\` = ${i.resource || '?'}${where}\n`
    }
  }
  if (fullScope.length > 0) {
    g += '\n以下背景资源是**整体背景**（覆盖整个画布），却被当作区域背景挂到子容器，请改为挂到**根容器**：\n'
    for (const i of fullScope) {
      g += `- \`${i.varName}\` = ${i.resource || '?'}（当前误归属「${i.logicalContainer}」）\n`
    }
  }
  g += '\n完整的背景资源归属如下，请按「作用域」挂载：整体背景挂根容器，区域背景挂对应 section，严禁跨容器挂载：\n'
  for (const a of bgAttribution) {
    const scopeLabel = a.scope === 'full' ? '整体背景（挂根容器）' : a.scope === 'region' ? '区域背景' : '作用域未知'
    g += `- \`${a.varName}\` = ${a.name || '?'} → ${scopeLabel}${a.logicalContainer ? '，容器「' + a.logicalContainer + '」' : ''}${a.targetDomHint ? '（' + a.targetDomHint + '）' : ''}\n`
  }
  return g
}
