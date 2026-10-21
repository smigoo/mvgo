/**
 * 🛡️ T3 · `v-for` 列表方向守卫（2026-10-19 建立 · mc-max-1792373861220-5160a2ec 实锤）
 *
 * ── 事故（为什么已有 LAYOUT-001 还拦不住）────────────────────────────────
 *
 * 产物 `c-aiot-dpjh-bsjd-5160a2ec`：设计是 **6 张卡纵向列表 + 卡内横排三段**，
 * 生成结果却是 **6 卡横向溢出（只见 1 张）+ 卡内竖排**。
 *
 * **布局分析四层全对**（离线重放实测）：
 *   · E1 确定性推导 ✅ / 折叠段 `48:5798-list` = **vertical** ✅ / 卡模板 `48:5801` = **horizontal** ✅
 *   · 几何事实 `buildNodeLayoutFacts`：`565:3` column(high)、`48:5801` row ✅
 *   · 下发的「布局与顺序真值」原文就写着「重复单元×6 纵向堆叠…单元自身 flex-direction:row」✅
 *
 * 但产物把两个 class **贴反了一级**（`ContentSection.vue:2-6` + `common.less:63-87`）：
 *   · **wrapper**（v-for 外层）拿到 `group-2136638414`（= 卡**内**组 `48:5801` 的 class）⇒ 被事实强制成 **row**
 *   · **item**（v-for 单项）拿到 `group-2136638415`（= 卡框 `48:5798` 的 class，单子节点平凡推断）⇒ 被强制成 **column**
 *   ⇒ 两个方向**整体互换**。成因：子组件根被强制带**叶子段** id（`section-leaf-assembler.js:28`），
 *      而叶子段是「卡模板」⇒ 列表容器在产物里**没有独立身份**，class 与事实随之错一级。
 *
 * **现有 LAYOUT-001 零覆盖（实测）**：`stats={sections:5,truthFact:5,hosts:5,judged:5,mismatches:0}`
 *   —— 它只比「section 自身 `layout` vs 宿主 .vue **根元素**方向」，而根元素方向恰好等于
 *   叶子段真值（row）⇒ 全绿。**判据域（section 自身）≠ 事实落点（wrapper/item 各自扮演谁）**。
 *
 * ── 本守卫判据（只比「DOM 节点真实扮演的角色」）──────────────────────────
 *
 * 对产物中每个 `v-for`：
 *   · **wrapper 期望** = 该段**父段**（折叠列表段）的 `layout` 真值 → 本例 `vertical`
 *   · **item 期望**   = 该段（叶子/重复项原型）自身的 `layout` 真值 → 本例 `horizontal`
 *   · **实际**       = `resolveActualDirection`（inline style > :style > class 规则，跨文件层叠）
 *   · 两者任一不符 ⇒ issue。
 *
 * 三态 + fail-open（**不猜**）：父段缺失/无方向真值、方向真值为 grid、产物未声明方向、
 *   多 class 冲突、模板解析不出 v-for ⇒ **一律不判**（stats 留痕，可观察可达性）。
 *
 * ⚠️ 严重级：检测 issue 为 **WARN**；自愈 `healVForListDirection` 已于 2026-10-19 在
 *   pre-write-self-healing ④-h（刀 30）启用（第二起实锤 mc-max-1792401161280-17750e31：
 *   首轮 WARN 观察期带病落盘，「6 卡变 2 列巨型卡」用户截图实锤）。
 *   🔴 配套升级（同实锤）：LLM 会把同名 class 写进 SFC scoped + common.less 两份，
 *   检测端 `resolveActualDirection` 聚合全部规则块（矛盾方向入 `conflicts` 一并判违规），
 *   自愈端翻转**全部出现点**（含 .vue `<style>` 块），否则只改一处复检仍红。
 */

import { matchTemplateTags } from './layout-facts-injector.js'
import {
  resolveTruthLayout,
  buildStyleCorpus,
  resolveActualDirection,
} from './layout-direction-guard.js'

/** 折叠/重复列表段：`-list` 合成 id、显式 collapsed、或 renderHint=v-for */
export function isCollapsedListSection(sec) {
  if (!sec || typeof sec !== 'object') return false
  const id = String(sec.id ?? '')
  if (/-list$/.test(id)) return true
  if (sec.collapsed === true) return true
  if (sec.renderHint === 'v-for') return true
  return false
}

/**
 * 在 section 树里定位 `id`，同时返回其**父段**（用于取 wrapper 期望方向）。
 * @returns {{sec:Object, parent:Object|null}|null}
 */
export function findSectionWithParent(sections, id) {
  const target = String(id ?? '')
  if (!target) return null
  const walk = (list, parent) => {
    for (const s of list || []) {
      if (!s || typeof s !== 'object') continue
      if (String(s.id ?? '') === target) return { sec: s, parent: parent || null }
      if (Array.isArray(s.children) && s.children.length) {
        const hit = walk(s.children, s)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(sections, null)
}

/**
 * 解析模板里的 `v-for` 元素及其**父元素**（栈式，只取开标签 + 闭合出栈）。
 * @returns {Array<{item:Object, parent:Object|null, file:string}>} tag = {name, attrs, index}
 */
export function findVForPairs(content, file = '') {
  const out = []
  if (typeof content !== 'string' || !content) return out
  // 只取 <template> 段，避免 <script> 里的字符串干扰
  const open = content.indexOf('<template>')
  const close = content.lastIndexOf('</template>')
  const src = open >= 0 && close > open ? content.slice(open + 10, close) : content

  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g
  const stack = []
  let rootIndex = -1
  let m
  while ((m = re.exec(src))) {
    const [, slash, name, attrs = ''] = m
    if (slash) {
      // 闭合标签：出栈（不校验同名，模板自闭合/组件标签形态多样，容错优先）
      stack.pop()
      continue
    }
    const tag = { name, attrs, index: m.index }
    // ⚠️ 自闭合标签（以 / 结尾）不入栈
    const selfClosing = /\/\s*$/.test(attrs)
    if (rootIndex < 0) rootIndex = m.index
    if (/\bv-for\s*=/.test(attrs)) {
      const parent = stack.length ? stack[stack.length - 1] : null
      out.push({
        item: tag,
        parent,
        // ⚠️ wrapper 必须是**子组件根元素**（首个开标签）。理由：
        //   ① 段 layout 真值描述的是「该段宿主根元素内子项的排布」，只有根元素才对应；
        //   ② 段内**嵌套的** `data-section-id` 子元素（如 header 段里的 tabs 子容器）属
        //      另一 section 的宿主，其方向分歧由既有 **LAYOUT-001** 管，本守卫不重复判
        //      （c-vehicle-monitor-tabs 实测：不加此约束会把它判成 column，而产物 row 才是设计）。
        wrapperIsHost: !!parent && parent.index === rootIndex,
        file,
      })
    }
    if (!selfClosing) stack.push(tag)
  }
  return out
}

/**
 * 主判据：`v-for` 列表的 wrapper / item 方向是否符合 section 树真值。
 *
 * @param {Array<{path:string,content:string}>} files 全量产物（需含 common.less 等样式文件）
 * @param {Object} layoutStructure `{layout:{sections}}` 或 `{sections}`
 * @param {Object} [opts] { fileFilter }
 * @returns {{issues:Array, stats:Object}}
 */
export function detectVForListDirectionMismatch(files, layoutStructure, opts = {}) {
  const issues = []
  const stats = {
    vueFiles: 0,
    vforPairs: 0,
    sectionHosted: 0,
    withParentTruth: 0,
    judged: 0,
    mismatches: 0,
    skippedNoSection: 0,
    skippedNoParent: 0,
    skippedNoTruth: 0,
    skippedNoActual: 0,
    skippedNoVFor: 0,
    skippedItemNotPrototype: 0,
    skippedWrapperNotHost: 0,
  }

  const sections = layoutStructure?.layout?.sections || layoutStructure?.sections || []
  if (!Array.isArray(sections) || sections.length === 0) return { issues, stats }

  const fileList = (Array.isArray(files) ? files : []).filter(
    (f) => f && typeof f.content === 'string' && f.content,
  )
  if (fileList.length === 0) return { issues, stats }
  const corpus = buildStyleCorpus(fileList)

  for (const f of fileList) {
    const path = String(f?.path || '')
    if (!/\.vue$/i.test(path)) continue
    if (typeof opts.fileFilter === 'function' && !opts.fileFilter(path)) continue
    stats.vueFiles += 1

    const content = f.content
    const pairs = findVForPairs(content, path)
    if (pairs.length === 0) {
      stats.skippedNoVFor += 1
      continue
    }
    stats.vforPairs += pairs.length

    // 该子组件的 section：根元素（`data-section-id`）
    const rootTag = matchTemplateTags(content).find((t) =>
      /\bdata-section-id\s*=\s*"([^"]+)"/.test(t.attrs || ''),
    )
    const secId = rootTag
      ? /\bdata-section-id\s*=\s*"([^"]+)"/.exec(rootTag.attrs)?.[1]
      : null
    if (!secId) {
      stats.skippedNoSection += 1
      continue
    }
    stats.sectionHosted += 1

    const found = findSectionWithParent(sections, secId)
    if (!found || !found.sec) {
      stats.skippedNoSection += 1
      continue
    }
    const { sec, parent } = found

    // 🛡️ 语义分叉（2026-10-19 复审 · c-vehicle-monitor-c6e8e295 误报实锤）：
    //   根元素 `data-section-id` 可能带 **①叶子/重复项原型段**（本例 `48:5801`），也可能带
    //   **②折叠列表段本身**（`136:127-list`）。两种情形下「段自身 layout」的含义**相反**：
    //     ① 叶子段：自身 layout = **单元内部**排布 ⇒ **item 期望**；父段 layout = wrapper 期望
    //     ② 折叠段：自身 layout = **重复单元之间**排布 ⇒ **wrapper 期望**；子段 layout = item 期望
    //   不做分叉会把「3 张卡横排」的真值当成「卡内横排」⇒ 误报（实测 vehicle-monitor card-item
    //   实际是 icon 上/文字下的 column，本就正确）。
    const secIsList = isCollapsedListSection(sec)
    let wrapperTruth
    let itemTruth
    let wrapperSectionId
    let itemSectionId
    if (secIsList) {
      // ② 折叠段：自身 layout = 重复单元**之间**排布 ⇒ wrapper 期望；子段（原型）= item 期望
      wrapperTruth = resolveTruthLayout(sec.layout || sec.body?.layout)
      wrapperSectionId = String(sec.id ?? '')
      const child = (Array.isArray(sec.children) ? sec.children : []).find(
        (c) => c && typeof c === 'object',
      )
      itemTruth = child
        ? resolveTruthLayout(child.layout || child.body?.layout)
        : { direction: null, isGrid: false }
      itemSectionId = child ? String(child.id ?? '') : ''
    } else if (parent && isCollapsedListSection(parent)) {
      // ① 叶子段（父为折叠段）：自身 layout = **单元内部**排布 ⇒ item 期望；父段 = wrapper 期望
      itemTruth = resolveTruthLayout(sec.layout || sec.body?.layout)
      itemSectionId = String(sec.id ?? '')
      wrapperTruth = resolveTruthLayout(parent.layout || parent.body?.layout)
      wrapperSectionId = String(parent.id ?? '')
    } else {
      // ③ 段是「集合」本身（v-for 直接挂在该段下，无折叠段/原型子段）：
      //    `section.layout` 描述的是**集合排布**，不是单元内部排布 ⇒ **item 不判**（不猜），
      //    只判 wrapper。（c-component-2/3、mc-…0856b233 的 StatsLeft 误报即由此而来：
      //    单项 `frame-2136638592` 内部本就是 icon+文字横排的 row，产物正确。）
      wrapperTruth = resolveTruthLayout(sec.layout || sec.body?.layout)
      wrapperSectionId = String(sec.id ?? '')
      itemTruth = { direction: null, isGrid: false }
      itemSectionId = ''
      stats.skippedItemNotPrototype += 1
    }
    if (!wrapperTruth.direction || wrapperTruth.isGrid) {
      stats.skippedNoParent += 1
      continue
    }
    stats.withParentTruth += 1

    for (const { item, parent: wrapperTag, wrapperIsHost } of pairs) {
      // ① item 方向：**无原型真值 ⇒ 不判**（段是集合时 `layout` 是集合排布，不是单元内部）
      // 🛡️ F16-b：开启「无任何方向声明 ⇒ 按块级默认 block 视为 column」，
      //   否则 `display:flex` 出现 0 次的列表容器会落进 skippedNoActual 被静默放过。
      const itemActual = itemTruth.direction
        ? resolveActualDirection(item, corpus, { inferDefaultBlock: true })
        : null
      const itemKinds = directionKindsOf(itemActual)
      if (!itemTruth.direction || itemTruth.isGrid) {
        stats.skippedNoTruth += 1
      } else if (!itemActual || itemActual.kind === 'grid') {
        stats.skippedNoActual += 1
      } else if (itemKinds.length > 1 || itemActual.kind !== itemTruth.direction) {
        stats.mismatches += 1
        issues.push({
          id: 'VFOR-DIR-ITEM',
          severity: 'WARN',
          file: path,
          message:
            `v-for 列表项方向与设计不符：section \`${String(sec.id)}\` 的真值方向是 ` +
            `\`${itemTruth.direction}\`，但产物中 v-for 单项实际是 \`${itemActual.kind}\`` +
            `${itemKinds.length > 1 ? `（同名 class 多份规则方向互相矛盾：${itemKinds.join(' / ')}）` : ''}` +
            `（class ${clsOf(item)}）。设计里该单元内部元素按 \`${itemTruth.direction}\` 排布，` +
            `请让 **v-for 单项** 元素承担该方向（列表外层容器应承担 \`${wrapperTruth.direction}\`）。`,
          hint: {
            suggestion: `把 v-for 单项元素（${
              clsOf(item) || '(无 class)'
            }）的 flex-direction 改为 ${itemTruth.direction}`,
            sectionId: itemSectionId,
            expected: itemTruth.direction,
            actual: itemActual.kind,
            role: 'item',
            className: clsOf(item),
          },
        })
      } else {
        stats.judged += 1
      }

      // ② wrapper 方向：仅当 wrapper 就是**根元素/宿主元素**时才判（段 layout 才对它成立）
      if (!wrapperTag || !wrapperIsHost) {
        stats.skippedWrapperNotHost += 1
        continue
      }
      const wrapperActual = resolveActualDirection(wrapperTag, corpus, { inferDefaultBlock: true })
      const wrapperKinds = directionKindsOf(wrapperActual)
      if (!wrapperActual || wrapperActual.kind === 'grid') {
        stats.skippedNoActual += 1
        continue
      }
      if (wrapperKinds.length > 1 || wrapperActual.kind !== wrapperTruth.direction) {
        stats.mismatches += 1
        issues.push({
          id: 'VFOR-DIR-WRAPPER',
          severity: 'WARN',
          file: path,
          message:
            `v-for 列表容器方向与设计不符：段 \`${wrapperSectionId}\` 的真值方向是 ` +
            `\`${wrapperTruth.direction}\`（重复单元之间按此排布），但产物中包裹 v-for 的外层容器实际是 ` +
            `\`${wrapperActual.kind}\`${wrapperKinds.length > 1 ? `（同名 class 多份规则方向互相矛盾：${wrapperKinds.join(' / ')}）` : ''}` +
            `（class ${clsOf(wrapperTag)}）。` +
            `⚠️ 典型成因：子组件根身份与 DOM 角色错一级 ⇒ class 与方向事实随之贴反 ⇒ 列表被排成一行而溢出。`,
          hint: {
            suggestion: `把包裹 v-for 的外层容器（${
              clsOf(wrapperTag) || '(无 class)'
            }）的 flex-direction 改为 ${wrapperTruth.direction}`,
            sectionId: wrapperSectionId,
            expected: wrapperTruth.direction,
            actual: wrapperActual.kind,
            role: 'wrapper',
            className: clsOf(wrapperTag),
          },
        })
      } else {
        stats.judged += 1
      }
    }
  }

  return { issues, stats }
}

function clsOf(tag) {
  const m = /(?:^|\s)class\s*=\s*"([^"]*)"/.exec(String(tag?.attrs || ''))
  return m ? m[1].trim() : ''
}

/** 元素实际生效的全部去重方向（含同名 class 多份规则矛盾形态）；无解析 ⇒ [] */
function directionKindsOf(actual) {
  if (!actual) return []
  if (Array.isArray(actual.conflicts) && actual.conflicts.length > 1) return actual.conflicts
  return [actual.kind]
}

/**
 * 确定性自愈：按 issue 的 `expected` 翻转对应 class 的 `flex-direction`。
 *
 * 改写域 = 样式承载文件（.less/.css 全文 + .vue 内 `<style>` 块）里该 class 规则块中的
 * `flex-direction` 声明；找不到该 class 规则或块内无该声明 ⇒ **不改**（留痕 failed）。
 *
 * 🔴 2026-10-19（c-aiot-dpjh-bsjd-17750e31 实锤）：**必须翻转全部出现点**。
 *   旧实现「首个命中文件 + 首个规则块」有两个盲区：
 *   ① LLM 常把同名 class 写进 SFC `<style scoped>` 与 common.less 两份（方向甚至互相
 *      矛盾），只改 common.less 那份 ⇒ SFC 里残留的 row 继续生效，复检仍红；
 *   ② .vue 被整体跳过 ⇒ SFC scoped 块内的错误方向永远摸不到。
 *   现改为：遍历全部样式承载文件、文件内**全局**翻转该 class 规则块的方向声明；
 *   同一文件改多处按出现点逐条留痕。幂等（已等于 expected 的块不动）。
 *
 * @param {Array<{path:string,content:string}>} files
 * @param {Array} issues `detectVForListDirectionMismatch` 的 issues
 * @returns {{files:Array, healed:Array, failed:Array}}
 */
export function healVForListDirection(files, issues = []) {
  const healed = []
  const failed = []
  const list = (Array.isArray(files) ? files : []).map((f) => ({ ...f }))
  for (const it of issues) {
    const hint = it?.hint || {}
    if (hint.role !== 'wrapper' && hint.role !== 'item') continue
    const clsAttr = String(hint.className || '')
    const cls = clsAttr.split(/\s+/).find((c) => /^c-/.test(c))
    if (!cls || !hint.expected) {
      failed.push({ id: it?.id, reason: 'no-class-or-expected' })
      continue
    }
    const re = new RegExp(
      `(\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])\\s*\\{[^{}]*?flex-direction\\s*:\\s*)(row-reverse|column-reverse|row|column)`,
      'g',
    )
    let done = false
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      const path = String(f?.path || '')
      if (!/\.(less|css|vue)$/i.test(path)) continue
      const src = String(f.content || '')
      if (!re.test(src)) continue
      re.lastIndex = 0
      let fileHits = 0
      const next = src.replace(re, (_m, head, dir) => {
        if (String(dir).trim() === hint.expected) return `${head}${dir}`
        fileHits++
        return `${head}${hint.expected}`
      })
      if (next !== src) {
        list[i] = { ...f, content: next }
        done = true
        healed.push({ id: it?.id, file: path, class: cls, to: hint.expected, occurrences: fileHits })
      }
    }
    if (!done) {
      // 🛡️ F16-c（2026-10-21 · c-c8d-195c8d0e 实锤）：**整块都没有 `flex-direction`**
      //   （`ListList.vue` / `ListList2.vue` 通篇 `display:flex` 出现 0 次）⇒ 翻转无从下手。
      //   治本：在该 class 规则块首注入 `display:flex; flex-direction:<expected>`。
      //   只在 class 规则**确实存在**时注入；规则本身不存在 ⇒ 仍判 failed（不凭空造选择器）。
      const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const reInj = new RegExp(`(\\.${esc}(?![\\w-])\\s*\\{)([^{}]*)`, 'g')
      for (let i = 0; i < list.length; i++) {
        const f = list[i]
        const path = String(f?.path || '')
        if (!/\.(less|css|vue)$/i.test(path)) continue
        const src = String(f.content || '')
        let fileHits = 0
        reInj.lastIndex = 0
        const next = src.replace(reInj, (m0, head, body) => {
          // 已有 display:flex ⇒ 只需补方向（保持幂等，不重复注入）
          if (/display\s*:\s*(inline-)?flex/i.test(body)) {
            if (/flex-direction\s*:/i.test(body)) return m0
            fileHits++
            return `${head} flex-direction: ${hint.expected};${body}`
          }
          fileHits++
          return `${head} display: flex; flex-direction: ${hint.expected};${body}`
        })
        if (next !== src) {
          list[i] = { ...f, content: next }
          done = true
          healed.push({
            id: it?.id,
            file: path,
            class: cls,
            to: hint.expected,
            occurrences: fileHits,
            mode: 'inject-display-flex',
          })
        }
      }
    }
    if (!done) failed.push({ id: it?.id, class: cls, reason: 'class-rule-not-found' })
  }
  return { files: list, healed, failed }
}
