/**
 * 🛡️ 共享样式表「同名类语义冲突」去冗余（2026-09-29 · mc-max-1790655877133-02ab668d 实锤）
 *
 * ── 事故现场（真机取证） ─────────────────────────────────────────────────────
 * 任务 `mc-max-1790655877133-02ab668d`（流量监测）：第一个柱状图容器实测 **width=52px**
 * （应为 411px），同组件的第二个柱状图 `.c-traffic-monitor-chart-2` 正常 411x150。
 * puppeteer + CSSOM 列出**全部命中规则**后发现，同一个元素命中了 13+ 条同选择器、
 * 同特异性的 `.c-traffic-monitor-chart`：
 *
 *   [GLOBAL index.css]        .c-traffic-monitor-chart            → width:52px   ← 共享表（生产也用）
 *   [SFC ChartChart.vue]      .c-traffic-monitor-chart[data-v-<CC>] → width:52px  ← 共享表被再 @import 一份
 *   [SFC ChartChart.vue]      .c-traffic-monitor-chart[data-v-<CC>] → width:100%  ← ChartChart 自己的真值
 *   [SFC index.vue]           .c-traffic-monitor-chart[data-v-<IDX>] → width:52px ← 父组件又 @import 一份
 *
 * ⇒ 每个 `.vue` 的 `<style scoped>@import '.../index.less'` 会把**整张共享表**（含全部子组件的类）
 *   复制一遍并以「本文件的 scope id」再生效一次；而父组件 `index.vue` 也复制一遍。
 *   于是共享表里那条 `width:52px` 被复制 N 份，**最终淹没** ChartChart 自己的 `width:100%`
 *   （同特异性 → 后注入者胜）。**与「预览是否剥离 scoped」无关**（实验开关 `KEEP_SCOPED`
 *   对照组渲染完全一致 52x150），**生产走同一条路**（component.js 直接 import index.vue）。
 *
 * ── 为什么不能靠 style-dedup-guard 解决 ──────────────────────────────────────
 * `style-dedup-guard.js` 的哲学是「**共享表 = 唯一真值**，剥掉子组件的重复声明」。
 * 但本事故里共享表**本身就是错的一方**：`.c-traffic-monitor-chart` 在 4 个子组件里语义不同
 * （CardGrid / CardGrid13 / ContentSection6 是 52x52 的环形图容器；ChartChart 是占满宽度的柱状图容器）。
 * 共享表取其一（52px），剥掉子组件后 ChartChart 只剩 `min-width:0;min-height:127px`
 * ⇒ **width 仍恒为 52px**，越修越死。
 *
 * ── 本模块的判据（保守、可证伪） ─────────────────────────────────────────────
 * 只处理「**冗余且有害**」的共享声明 —— 同时满足：
 *   ① 该 class 在共享表里有声明；
 *   ② 至少有 1 个子组件 `.vue` 的 `<style>` 里也声明了**同名属性**；
 *   ③ 该 class 的**每一个使用方**（`<template>` 里真的用到该 class 的 `.vue`）**都自带**了该属性声明；
 *      —— ②③ 合起来即「共享表这份是纯冗余」，删掉不会让任何使用方失去样式；
 *   ④ 各子组件的声明值**存在不一致**（≥2 个归一化后的不同值）。
 * 满足①②③④ ⇒ 从共享表（含 `.theme .class` 形态的主题覆盖块）中**删除该属性声明**，
 * 让每个子组件以自己的 scoped 声明为准（各归各位），共享表退回去只承载「真正共享」的属性。
 *
 * 不满足时**一律保留**（宁可不动，不可误删），并打印「已评估 · 未处理」原因，便于审计。
 *
 * 幂等：删除后共享表已无该属性 → 再跑无改动。形态跟随（数组进数组出 / 对象 map 进 map 出）。
 */

import { extractStyleBlocks } from './flex-sibling-guard.js'
import { toFileArray, mergeFileArray } from './file-collection.js'
import { extractSfcTemplateRegion } from './sfc-template-extractor.js'

/**
 * 参与判定的属性白名单。
 * 与 style-dedup-guard 的 LAYOUT_PROPS 不同：这里**包含 min-width/min-height**。
 * 原因：那个守卫是「无条件剥离子组件侧」，剥掉 min-* 会让容器塌缩（R5-minheight 事故）；
 * 而本守卫的判据是「所有使用方都自带该属性」——此时共享表那份纯冗余，删除安全。
 */
export const DECONFLICT_PROPS = new Set([
  // 布局尺寸
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'flex-direction', 'flex-wrap',
  'display', 'align-items', 'align-self', 'justify-content', 'gap',
  'row-gap', 'column-gap',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'position', 'top', 'right', 'bottom', 'left',
  'overflow', 'overflow-x', 'overflow-y', 'box-sizing',
])

/** 共享表里承认的块形态：`.class`（根级单 class）或 `.theme .class`（一层主题前缀）。 */
const SHARED_BLOCK_RX = /^(?:\.([\w-]+)\s+)?\.([\w-]+)$/

const normVal = (v) => String(v || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim()
const normProp = (p) => String(p || '').trim().toLowerCase()

/** 取 .vue 的 <style> 内容（首个块，与 code-parser 一致）。 */
function styleOf(vue) {
  const m = String(vue || '').match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  return m ? m[1] : ''
}

/**
 * 收集样式文本中的「共享块」：class → [{ theme, propMap }]
 * theme 为空表示根级 `.class`；非空表示 `.theme .class`。
 */
export function collectSharedBlocks(styleContent) {
  const out = new Map()
  for (const b of extractStyleBlocks(styleContent)) {
    const sel = String(b.selector).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').trim()
    const m = sel.match(SHARED_BLOCK_RX)
    if (!m) continue
    if (b.body.includes('{') || b.body.includes('&')) continue
    const cls = m[2]
    const theme = m[1] || ''
    if (!out.has(cls)) out.set(cls, [])
    out.get(cls).push({ theme, propMap: parseDecls(b.body) })
  }
  return out
}

/** 解析声明体 → Map<prop, value>（保序）。 */
export function parseDecls(body) {
  const map = new Map()
  for (const decl of String(body || '').split(';')) {
    const t = decl.trim()
    if (!t) continue
    const m = t.match(/^([a-zA-Z][\w-]*)\s*:\s*([\s\S]+)$/)
    if (!m) continue
    map.set(normProp(m[1]), normVal(m[2]))
  }
  return map
}

/** 收集某个 .vue 的 <style> 里「根级单 class」块的声明（子组件侧只认 `.class`）。 */
export function collectVueClassDecls(vueContent) {
  const out = new Map() // cls → Map(prop → value)
  for (const b of extractStyleBlocks(styleOf(vueContent))) {
    const sel = String(b.selector).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').trim()
    const m = sel.match(/^\.([\w-]+)$/)
    if (!m) continue
    if (b.body.includes('{') || b.body.includes('&')) continue
    out.set(m[1], parseDecls(b.body))
  }
  return out
}

/**
 * 收集 <template> 里出现的 class token（只保留 knownClasses 中的名字，避免把组件名/属性名当类名）。
 */
export function classesUsedInTemplate(vueContent, knownClasses) {
  const tpl = extractSfcTemplateRegion(vueContent) || ''
  const out = new Set()
  const attrRx = /(?::|v-bind:)?class\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m
  while ((m = attrRx.exec(tpl))) {
    const raw = m[1] ?? m[2] ?? ''
    for (const tok of raw.split(/[\s,{}:;'"`[\]()|&?!*+/\\<>~^$%@#=]+/)) {
      if (tok && knownClasses.has(tok)) out.add(tok)
    }
  }
  return out
}

/** 从声明体中删掉指定属性，返回新体；全空返回 ''。 */
function removePropsFromBody(body, props) {
  const kept = []
  for (const decl of String(body || '').split(';')) {
    const t = decl.trim()
    if (!t) continue
    const m = t.match(/^([a-zA-Z][\w-]*)\s*:/)
    if (m && props.has(normProp(m[1]))) continue
    kept.push(decl)
  }
  return kept.join(';').trim()
}

/**
 * 跨文件自愈入口：从共享样式表里删除「所有使用方都自带、且互相冲突」的属性声明。
 *
 * @param {Array<{path:string,content:string}>|Object<string,string>} files 全量产物文件（内存态）
 * @returns {{ files: Array|Object, changes: string[], evaluated: string[] }}
 *          `changes` 实际改动；`evaluated` 「已评估·未处理」的原因（审计用）
 */
export function deconflictSharedClassDecls(files = []) {
  const list = toFileArray(files)
  if (list.length < 2) return { files, changes: [], evaluated: [] }

  const shared = list.find(
    (f) => f && typeof f.content === 'string' && /resources\/styles\/common\.less$/i.test(f.path || ''),
  ) || list.find(
    (f) => f && typeof f.content === 'string' && /resources\/styles\/index\.less$/i.test(f.path || ''),
  )
  if (!shared) return { files, changes: [], evaluated: [] }

  const sharedBlocks = collectSharedBlocks(shared.content)
  if (sharedBlocks.size === 0) return { files, changes: [], evaluated: [] }

  const vues = list.filter((f) => f && typeof f.content === 'string' && /\.vue$/i.test(f.path || ''))
  if (vues.length === 0) return { files, changes: [], evaluated: [] }

  // 子组件侧声明：cls → Map(file → Map(prop → value))
  const subDecls = new Map()
  for (const f of vues) {
    const short = String(f.path).split('/').pop()
    for (const [cls, props] of collectVueClassDecls(f.content)) {
      if (!subDecls.has(cls)) subDecls.set(cls, new Map())
      subDecls.get(cls).set(short, props)
    }
  }

  // 使用方：cls → Set(file)
  const knownClasses = new Set([...sharedBlocks.keys(), ...subDecls.keys()])
  const users = new Map()
  for (const f of vues) {
    const short = String(f.path).split('/').pop()
    for (const cls of classesUsedInTemplate(f.content, knownClasses)) {
      if (!users.has(cls)) users.set(cls, new Set())
      users.get(cls).add(short)
    }
  }

  const changes = []
  const evaluated = []

  /** 需要从共享表删除的：cls → Set(prop) */
  const toRemove = new Map()
  for (const [cls, blocks] of sharedBlocks) {
    const declsByFile = subDecls.get(cls)
    if (!declsByFile || declsByFile.size === 0) continue // 没有子组件声明 → 纯共享，必留
    const userSet = users.get(cls) || new Set()
    const removable = new Set()
    for (const { propMap } of blocks) {
      for (const [prop, sharedVal] of propMap) {
        if (!DECONFLICT_PROPS.has(prop)) {
          evaluated.push(`.${cls}{${prop}} 非布局属性，不在判定范围`)
          continue
        }
        // 收集「子组件侧声明了该属性」的文件与值
        const vals = new Map()
        for (const [file, props] of declsByFile) if (props.has(prop)) vals.set(file, props.get(prop))
        if (vals.size === 0) {
          evaluated.push(`.${cls}{${prop}} 无子组件声明 → 共享表保留`)
          continue
        }
        // ③ 每个使用方都必须自带该属性
        const missing = [...userSet].filter((u) => !vals.has(u))
        if (userSet.size === 0) {
          evaluated.push(`.${cls}{${prop}} 未能确定使用方（模板未命中）→ 保守保留`)
          continue
        }
        if (missing.length > 0) {
          evaluated.push(`.${cls}{${prop}} 使用方 ${missing.join('/')} 未自带该声明 → 共享表保留`)
          continue
        }
        // ④ 值冲突
        const distinct = new Set(vals.values())
        if (distinct.size < 2) {
          evaluated.push(`.${cls}{${prop}} 使用方声明一致（${[...distinct][0]}）→ 保留（由 style-dedup-guard 处理）`)
          continue
        }
        // ①②③④ 全满足 ⇒ 共享表这份冗余且有害，删除
        removable.add(prop)
        changes.push(
          `.${cls}: 共享表删除 ${prop}: ${sharedVal} —— 使用方各自声明 ${[...vals.entries()].map(([f, v]) => `${f}=${v}`).join(', ')}`,
        )
      }
    }
    if (removable.size) toRemove.set(cls, removable)
  }

  if (toRemove.size === 0) return { files, changes: [], evaluated }

  // 改写共享表：逐块删除属性，块空则整块删除
  let nextShared = String(shared.content)
  for (const [cls, props] of toRemove) {
    for (const { theme } of sharedBlocks.get(cls) || []) {
      const sel = theme ? `\\.${theme}\\s+\\.${cls}` : `\\.${cls}`
      const rx = new RegExp(`(^|\\n)([ \\t]*${sel}\\s*)\\{([^{}]*)\\}`, 'g')
      nextShared = nextShared.replace(rx, (full, lead, s, body) => {
        const kept = removePropsFromBody(body, props)
        if (!kept.replace(/[\s;]/g, '')) return ''
        return `${lead}${s}{${kept}}`
      })
    }
  }
  nextShared = nextShared.replace(/\n{3,}/g, '\n\n')

  const out = list.map((f) =>
    f === shared || (f && f.path === shared.path) ? { ...f, content: nextShared } : f,
  )
  return { files: mergeFileArray(files, out), changes, evaluated }
}
