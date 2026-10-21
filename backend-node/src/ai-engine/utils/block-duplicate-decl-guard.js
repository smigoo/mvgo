/**
 * 🛡️ 刀 40（2026-10-21 · mc-1792575046720-2c0767be 实锤）—
 * 「同一规则块内同属性重复声明」消歧。
 *
 * ── 事故链（真机产物 `resources/styles/common.less:15`） ──
 *   ```less
 *   .c-component-card-grid-list {height: 100%;
 *     display: grid;          ← LLM 知道要网格
 *     width: 100%;
 *     flex: 1 1 0;
 *     min-height: 0;
 *     display: flex;          ← 同一块后写，静默覆盖 grid
 *     flex-direction: column;
 *     flex-wrap: wrap;
 *     gap: 20px;
 *   }
 *   ```
 *   实际生效 = `display:flex; flex-direction:column` ⇒ 折叠列表的 12 张卡**纵向单列堆叠**。
 *   渲染截图实锤：12 个厂商名全在，但看起来像「完全没修」。
 *
 * ── 为什么必须单独一刀 ──
 *   既有 `style-dedup-guard.js` 解决的是**跨文件**同名 class 冲突（SFC scoped vs shared 表），
 *   判据是「文件名不同 + class 相同 + 属性相同」；本事故是**同一个规则块内**
 *   同一属性写了两遍 —— 跨文件索引看不见它，任何门禁都不会报，只有浏览器知道后者胜。
 *
 * ── 处理口径：删前面、留最后（不改变实际生效值，零视觉风险） ──
 *   CSS 语义就是「后写者胜」⇒ 保留最后一条、删掉前面几条，**渲染结果完全不变**，
 *   但歧义消失：跨文件索引/审计/后续布局契约判据能看见唯一值。
 *
 *   🔴 本刀**不负责修视觉**。本例删掉 `display:grid` 后仍是 flex+column，视觉照旧散架；
 *   把「折叠段容器必须横向网格」修对是**另一条判据**（布局契约），不能塞进这里。
 *   若把两者混在一刀里，就会出现「删了哪条」取决于真值是否可得，判据不可证伪。
 *
 * ── 安全约束（宁可少改，绝不误伤合法的渐进增强） ──
 *   下列形态**一律跳过**（它们不是笔误，是刻意分层回退）：
 *     ① 任一值是厂商前缀值（`display: -webkit-box; display: flex`）；
 *     ② 任一值含 `var(` / `env(`（`color: #333; color: var(--c)`）；
 *     ③ 任一声明带 `!important` 且另一条不带（优先级语义不同，不能按顺序取舍）；
 *     ④ 后者是图像/渐变函数而前者不是（`background: #fff; background: linear-gradient(...)`）。
 *   另：嵌套块（body 内含 `{`）整体跳过；同值重复按冗余清理（删前面留一条）。
 */

import { toFileArray, mergeFileArray } from './file-collection.js'
import { formatDeclarationList } from './style-dedup-guard.js'

/** 厂商前缀值：`-webkit-box` / `-webkit-flex` / `-moz-…` */
const VENDOR_PREFIX_VALUE_RX = /^-(?:webkit|moz|ms|o)-/i
/** 变量/环境变量回退 */
const VAR_REF_RX = /\b(?:var|env)\s*\(/i
/** `!important` */
const IMPORTANT_RX = /!\s*important/i
/** 图像/渐变函数（常作为纯色之后的回退层） */
const IMAGE_FN_RX = /\b(?:linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|image-set|-webkit-image-set|url)\s*\(/i

/** 只匹配「最内层、body 内不含花括号」的规则块 —— 嵌套块天然跳过（与既有口径一致） */
const INNERMOST_BLOCK_RX = /([^{}]+)\{([^{}]*)\}/g

const DECL_RX = /^([a-zA-Z-][\w-]*)\s*:\s*([\s\S]*)$/

/**
 * 把声明体切成「片段」。非声明片段（如块内注释、空串）原样保留位置。
 * @param {string} body
 * @returns {Array<{raw: string, prop: string|null, value: string}>}
 */
export function splitDeclFragments(body) {
  return String(body || '')
    .split(';')
    .map((raw) => {
      const trimmed = raw.trim()
      const m = trimmed.match(DECL_RX)
      if (!m) return { raw, prop: null, value: '' }
      return { raw, prop: m[1].toLowerCase(), value: m[2].trim() }
    })
}

/**
 * 一组同属性声明是否属「合法的渐进增强」（不是笔误）—— 是则不得去重。
 * 判据见文件头「安全约束」①~④。
 * @param {Array<{value: string}>} group 同一属性的所有声明（按出现顺序）
 * @returns {boolean}
 */
export function isBenignFallbackGroup(group) {
  if (!Array.isArray(group) || group.length < 2) return false
  const values = group.map((g) => String(g.value || ''))
  // ① 厂商前缀值参与 ⇒ 渐进增强
  if (values.some((v) => VENDOR_PREFIX_VALUE_RX.test(v))) return true
  // ② var()/env() 回退
  if (values.some((v) => VAR_REF_RX.test(v))) return true
  // ③ !important 与普通混存 ⇒ 优先级语义不同
  const importantCount = values.filter((v) => IMPORTANT_RX.test(v)).length
  if (importantCount > 0 && importantCount < values.length) return true
  // ④ 靠后的值是图像/渐变函数、靠前的不是 ⇒ 典型的「纯色 + 渐变」双层回退
  const last = values[values.length - 1]
  const head = values.slice(0, -1)
  if (IMAGE_FN_RX.test(last) && head.some((v) => v && !IMAGE_FN_RX.test(v))) return true
  return false
}

/**
 * 对单个声明体消歧：同一属性重复声明时保留最后一条、删掉前面几条。
 *
 * @param {string} body 规则块声明体（不含外层花括号）
 * @returns {{ body: string, removed: Array<{prop: string, dropped: string[], kept: string, reason: string}> }}
 */
export function dedupeBlockDecls(body) {
  const fragments = splitDeclFragments(body)
  // 块内若含无法解析为声明的非空片段（块注释、`&` 嵌套残留等）⇒ 整块跳过。
  // 因为重建声明体必须走 formatDeclarationList（P2-11：逐条 `;` 收尾，否则下游追加会粘连），
  // 而它会把非声明片段也当成一条声明输出 ⇒ 破坏注释。宁可少改。
  const hasNonDeclFragment = fragments.some((f) => !f.prop && String(f.raw || '').trim() !== '')
  if (hasNonDeclFragment) return { body, removed: [] }

  const byProp = new Map()
  fragments.forEach((f, idx) => {
    if (!f.prop) return
    if (!byProp.has(f.prop)) byProp.set(f.prop, [])
    byProp.get(f.prop).push(idx)
  })

  const dropSet = new Set()
  const removed = []
  for (const [prop, indices] of byProp) {
    if (indices.length < 2) continue
    const group = indices.map((i) => fragments[i])
    const values = group.map((g) => String(g.value || '').trim())
    const allSame = values.every((v) => v === values[0])

    // 同值重复：纯冗余，删前面留一条（不涉及语义取舍）
    if (allSame) {
      for (const i of indices.slice(0, -1)) dropSet.add(i)
      removed.push({
        prop,
        dropped: indices.slice(0, -1).map((i) => fragments[i].value),
        kept: values[values.length - 1],
        reason: 'redundant',
      })
      continue
    }

    // 合法渐进增强：一条都不动
    if (isBenignFallbackGroup(group)) continue

    // 真冲突：保留最后一条（= 浏览器实际生效值），删前面
    for (const i of indices.slice(0, -1)) dropSet.add(i)
    removed.push({
      prop,
      dropped: indices.slice(0, -1).map((i) => fragments[i].value),
      kept: values[values.length - 1],
      reason: 'conflict',
    })
  }

  if (dropSet.size === 0) return { body, removed: [] }

  const kept = fragments.filter((_f, idx) => !dropSet.has(idx)).map((f) => f.raw)
  return { body: formatDeclarationList(kept), removed }
}

/**
 * 对一个样式文本（.less/.css 全文，或 <style> 内部）逐块消歧。
 * @param {string} content
 * @returns {{ content: string, changes: Array<{selector: string, prop: string, dropped: string[], kept: string, reason: string}> }}
 */
export function dedupeStyleBlocks(content) {
  if (!content || typeof content !== 'string') return { content, changes: [] }
  const changes = []
  const next = content.replace(INNERMOST_BLOCK_RX, (full, selector, body) => {
    const r = dedupeBlockDecls(body)
    if (r.removed.length === 0) return full
    const sel = String(selector || '').trim().replace(/\s+/g, ' ')
    for (const item of r.removed) {
      changes.push({
        selector: sel,
        prop: item.prop,
        dropped: item.dropped,
        kept: item.kept,
        reason: item.reason,
      })
    }
    return `${selector}{${r.body}}`
  })
  return changes.length === 0 ? { content, changes: [] } : { content: next, changes }
}

/**
 * 全量产物入口：对 `*.less` / `*.css` 全文与 `*.vue` 的每个 `<style>` 块消歧。
 *
 * 形态契约（与 `style-dedup-guard.js` 一致）：数组进数组出 / 对象 map 进对象 map 出；
 * 无改动返回**输入原引用**（供 `pre-write-self-healing.js` 判定 applied）。
 *
 * @param {Array<{path:string,content:string}>|Object<string,string>} files
 * @returns {{ files: Array|Object, changes: string[] }}
 */
export function dedupeDuplicateDeclsInBlocks(files = []) {
  const list = toFileArray(files)
  if (list.length === 0) return { files, changes: [] }

  const allChanges = []
  let changed = false

  const out = list.map((f) => {
    if (!f || typeof f.content !== 'string') return f
    const path = f.path || ''
    const isStyle = /\.(?:less|css)$/i.test(path)
    const isVue = /\.vue$/i.test(path)
    if (!isStyle && !isVue) return f

    let next = f.content
    let touched = false

    const report = (c) => {
      allChanges.push(
        `${path} → ${c.selector} ${c.prop}: 删 [${c.dropped.join(' | ')}]，留 [${c.kept}]` +
          (c.reason === 'redundant' ? '（同值冗余）' : ''),
      )
    }

    if (isStyle) {
      const r = dedupeStyleBlocks(next)
      if (r.changes.length > 0) {
        next = r.content
        touched = true
        r.changes.forEach(report)
      }
    } else {
      const styleRx = /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi
      next = next.replace(styleRx, (full, open, inner, close) => {
        const r = dedupeStyleBlocks(inner)
        if (r.changes.length === 0) return full
        touched = true
        r.changes.forEach(report)
        return open + r.content + close
      })
    }

    if (!touched) return f
    changed = true
    return { ...f, content: next }
  })

  return { files: changed ? mergeFileArray(files, out) : files, changes: allChanges }
}
