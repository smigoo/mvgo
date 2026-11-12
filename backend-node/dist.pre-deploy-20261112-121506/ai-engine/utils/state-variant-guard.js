/**
 * 🛡️ T3-C（2026-11-04）：互斥状态变体「展平」守卫（只留痕，不阻断）
 *
 * 背景（实锤 c-device-monitor-878b3ef1 · section `89:38`）：
 *   Figma 节点 `89:38` name=`switch`，**把同一控件的两个互斥状态变体并列画出**
 *   （children = [`active`, `default`]，各自含 5 个 TEXT）。产物无法表达「状态机」，
 *   于是把两态文本**展平并列**渲成一个 2×N 的 `<a-table>` ⇒ 视觉上从「一行控件」
 *   变成「多行表格」。实测该容器全树唯一，产物 8 条文本全部来自这 10 条真值子集
 *   （**零臆造**）—— 这是「结构还原」缺陷，不是「手写模仿」（antd-mimicry-guard 域）。
 *
 * 判据（确定性、零 LLM、真值驱动）：
 *   ① 真值节点 X 的**直接子节点**中，name 命中「互斥状态词」的 ≥2 个，且占比 ≥ 0.5；
 *   ② 每个变体都存在「独有文本」（= 本变体子树 TEXT − 其它变体 TEXT），≥2 个变体满足；
 *   ③ 产物把 **≥2 个变体的独有文本**同时渲染出来 ⇒ 报「状态变体被展平」。
 *
 * 状态词表（Figma 社区通用命名，非业务臆造；可扩展）：
 *   active / default / hover / disabled / selected / normal / pressed / focus /
 *   checked / unchecked / on / off
 *
 * 定位：与 antd-mimicry-guard / flex-shrink-guard 同模式 —— 只告警留痕
 *   （meta.stateVariantIssues），**不阻断落盘**。治本在结构还原层（只渲单一状态）。
 *
 * ⚠️ 与既有机制的关系（单一事实源）：
 *   - 归一函数复用 `normalizeTruthText`（hardcoded-text-gate 导出），不另立第二套口径；
 *   - 产物文本提取复用 `extractArtifactTextLiterals`（同源），不重造抽取规则；
 *   - 与 antd-mimicry-guard（class 词根指纹）/ flex-shrink-guard（收缩风险）/
 *     section-content-guard（借用资源·内容归属）维度正交，无重叠。
 */

import { extractArtifactTextLiterals, normalizeTruthText } from './hardcoded-text-gate.js'

/** 互斥状态词（Figma 社区通用命名，非业务白名单） */
const STATE_VARIANT_RX = /^(?:active|default|hover|disabled|selected|normal|pressed|focus|checked|unchecked|on|off)$/i

/** `data-section-id="X"` 提取（每文件单 section 约束用） */
const SECTION_ID_RX = /data-section-id="([^"]+)"/g

/** 双形态归一（数组 [{path,content}] / Record<path,content>），与 antd-mimicry-guard 同款 */
function normalizeFiles(files) {
  if (!files || typeof files !== 'object') return []
  if (Array.isArray(files)) {
    return files
      .filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string')
      .map((f) => [f.path, f.content])
  }
  return Object.entries(files).filter(([, c]) => typeof c === 'string')
}

/** 收集子树全部 TEXT 文本（归一化） */
function collectSubtreeTexts(node, out) {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'TEXT' && typeof node.characters === 'string') {
    const t = normalizeTruthText(node.characters)
    if (t) out.add(t)
  }
  const kids = node.children
  if (Array.isArray(kids)) for (const k of kids) collectSubtreeTexts(k, out)
  return out
}

/**
 * 真值侧：找出「互斥状态变体容器」。
 * @param {object} figmaRoot figmaNodeData（兼容 {document:…} 与裸根两种形态）
 * @returns {Array<{id:string|null,name:string|null,variants:Array<{name:string,uniqueTexts:string[]}>}>}
 */
export function collectVariantContainers(figmaRoot) {
  const out = []
  if (!figmaRoot || typeof figmaRoot !== 'object') return out
  const root = figmaRoot.document || figmaRoot.node || figmaRoot.nodes || figmaRoot
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    const kids = Array.isArray(n.children) ? n.children : []
    const variantKids = kids.filter((k) => k && typeof k.name === 'string' && STATE_VARIANT_RX.test(k.name.trim()))
    // ① 直接子节点中状态词 ≥2 个，且占比 ≥ 0.5（过滤「某容器偶然有个名为 on 的子节点」）
    if (variantKids.length >= 2 && variantKids.length / kids.length >= 0.5) {
      const variants = variantKids.map((k) => ({ name: k.name.trim(), texts: collectSubtreeTexts(k, new Set()) }))
      // ② 独有文本 = 本变体 texts − 其它变体 texts；要求 ≥2 个变体有独有文本
      const withUnique = variants
        .map((v) => {
          const others = new Set()
          for (const w of variants) if (w !== v) for (const t of w.texts) others.add(t)
          return { name: v.name, uniqueTexts: [...v.texts].filter((t) => !others.has(t)) }
        })
        .filter((v) => v.uniqueTexts.length > 0)
      if (withUnique.length >= 2) {
        out.push({ id: n.id || null, name: typeof n.name === 'string' ? n.name : null, variants: withUnique })
      }
    }
    for (const k of kids) walk(k)
  }
  walk(root)
  return out
}

/**
 * 产物侧：抽取某 SFC 的所有文本字面量（复用 hardcoded-text-gate 的抽取规则）。
 * @param {string} content
 * @returns {Set<string>}
 */
export function collectArtifactTexts(content) {
  const set = new Set()
  if (typeof content !== 'string') return set
  try {
    for (const it of extractArtifactTextLiterals(content)) if (it && it.text) set.add(it.text)
  } catch (_) {
    /* fail-open：抽取失败按空集 */
  }
  return set
}

/**
 * 扫描产物中的「互斥状态变体被展平」问题。
 * @param {{files?: any, figmaRoot?: object}} opts
 * @returns {{issues: Array<{file:string,sectionId:string,nodeName:string|null,variants:string[],sampleTexts:string[]}>}}
 */
export function scanStateVariantFlatten({ files, figmaRoot } = {}) {
  const issues = []
  const containers = collectVariantContainers(figmaRoot)
  if (containers.length === 0) return { issues }
  const entries = normalizeFiles(files)

  for (const vc of containers) {
    if (!vc.id) continue
    for (const [filePath, content] of entries) {
      if (!/\.vue$/.test(filePath)) continue
      // 单 section 约束：文件内 data-section-id 恰好 1 个且与真值节点一致
      // （index.vue 等聚合文件为 0 或 >1 ⇒ 跳过，宁可漏报也不误报）
      const ids = [...content.matchAll(new RegExp(SECTION_ID_RX.source, 'g'))].map((m) => m[1])
      if (ids.length !== 1 || ids[0] !== vc.id) continue
      const texts = collectArtifactTexts(content)
      // ③ ≥2 个变体的独有文本同时出现在产物中
      const hits = vc.variants
        .map((v) => ({ name: v.name, hit: v.uniqueTexts.filter((t) => texts.has(t)) }))
        .filter((h) => h.hit.length > 0)
      if (hits.length >= 2) {
        issues.push({
          file: filePath,
          sectionId: vc.id,
          nodeName: vc.name,
          variants: hits.map((h) => h.name),
          sampleTexts: hits.flatMap((h) => h.hit).slice(0, 6),
        })
      }
      break // 一个 section 只匹配首个命中文件
    }
  }
  return { issues }
}

/**
 * 摘要（日志/进度消息用）
 */
export function summarizeStateVariantIssues(issues) {
  if (!issues || issues.length === 0) return ''
  const top = issues
    .slice(0, 3)
    .map((i) => `${i.sectionId}[${i.variants.join('+')}]`)
    .join('、')
  return `${issues.length} 处（${top}）`
}
