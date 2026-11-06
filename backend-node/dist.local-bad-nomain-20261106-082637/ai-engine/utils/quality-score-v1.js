/**
 * 生成质量评分 v1（确定性，不含 LLM）
 *
 * specScore：L0-B BLOCK/WARN 计数
 * styleScore：Figma 期望字面量 vs 产物 CSS 声明（离线回放）；无期望则 null
 *
 * Vision overallSimilarity / adversarial qualityScore / 直方图 VISUAL-002 不进总分。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import { 
  resolveStyleVariables, 
  substituteVariables,
  colorFuzzyMatch,
  colorDistance,
  parseColor,
  numericFuzzyMatch,
  parseNumericValue 
} from './style-var-resolver.js'
// 🛡️ P3（2026-11-03）：装饰叶子落地判定。语义判据（无语义名/资源封装/叶子形态）与
// `visual-parser#_generateCoverageReport` 同源，均在 utils/decor-leaf-truth.js，禁止另立口径。
import { judgeDecorLeaves } from './decor-leaf-truth.js'
// 🛡️ 档A 面板壳判据（2026-11-03 同源化）：**直接消费生成侧真值 `skipMount === true`**，
//   由调用方从 `.mc-gen/resource-dom-mapping.json` 读出后以节点 id 集合传入（本文件保持纯函数、零 IO）。
//   🔴 为何不用 `isPanelResource`（名字白名单）：它是「命名像面板壳」的**近似**判据，实测存在
//      `isPanelResource===true` 但**无** `skipMount` 的反例（`36:1697 header`，产物确实渲染它）
//      ⇒ 用它会让「几何守卫版 4 例」放宽成 158 例纯名字命中，两判据只是**恰好重合**而非同源。
//      `skipMount`（`figma-connector.js:2679-2704`：`previewAnalysisRole==='bg'` ∧ 路径段数 ≤2）
//      才是「产物不还原它」的**唯一事实源** —— 与 `scoreResourceMount`（本文件 :940）同一口径。

export const QUALITY_SCORE_V1_VERSION = 'v1'
export const SPEC_BLOCK_PENALTY = 8
export const SPEC_WARN_PENALTY = 3
export const STYLE_COVERAGE_CAP = 60
export const STYLE_COVERAGE_THRESHOLD = 0.4

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.checkpoint',
  '.mc-gen',
  '_upload',
  'images',
  'fonts',
])

const TEXT_EXTS = new Set(['.vue', '.less', '.css', '.js', '.json', '.ts'])

/**
 * 查找组件目录下的「产物渲染截图」（用于设计图对比的右侧「产物预览」）。
 * 截图存储在 .mc-gen/screenshots/ 目录下，文件名形如 <taskId>-rendered.png。
 *
 * 2026-09-29 校正：本函数返回的是**生成产物**的渲染截图（对应前端「产物预览」框），
 * 不是 Figma 设计图；Figma 真值图请用 findDesignImage()。
 *
 * @param {string} componentDir - 组件目录路径
 * @returns {Array<{path: string, name: string}>} - 截图文件列表（相对路径）
 */
export function findScreenshotFiles(componentDir) {
  const screenshotsDir = join(componentDir, '.mc-gen', 'screenshots')
  if (!existsSync(screenshotsDir)) return []

  try {
    const files = readdirSync(screenshotsDir)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort()
    return files.map(f => ({
      path: `.mc-gen/screenshots/${f}`,
      name: f,
    }))
  } catch (err) {
    console.warn('[quality-score-v1] 读取截图目录失败:', err.message)
    return []
  }
}

/**
 * 查找组件目录下的 Figma 真值设计图（用于设计图对比的左侧「设计图（Figma）」）。
 *
 * 2026-09-29 新增：此前「设计图」框误用 .mc-gen/screenshots/（产物渲染截图），
 * 导致用户看到的「设计图」其实是生成效果。Figma 真值图固定为 resources/images/mc-preview.png。
 *
 * @param {string} componentDir - 组件目录路径
 * @returns {Array<{path: string, name: string}>} - 设计图文件列表（相对路径）
 */
export function findDesignImage(componentDir) {
  const candidates = [
    join(componentDir, 'resources', 'images', 'mc-preview.png'),
    join(componentDir, 'package', 'resources', 'images', 'mc-preview.png'),
  ]
  for (const abs of candidates) {
    if (existsSync(abs)) {
      const rel = relative(componentDir, abs).replace(/\\/g, '/')
      return [{ path: rel, name: 'mc-preview.png' }]
    }
  }
  return []
}

export function clampScore(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(100, Math.round(x)))
}

/**
 * specScore = clamp(0,100, 100 - 8×BLOCK - 3×WARN)
 * 有 BLOCK 时硬顶 79（不允许带阻断项显示为「良好」）。
 */
export function computeSpecScore(l0b = {}) {
  const issues = Array.isArray(l0b.issues) ? l0b.issues : []
  const blockCount =
    typeof l0b.blockCount === 'number'
      ? l0b.blockCount
      : issues.filter((i) => String(i?.severity || '').toUpperCase() === 'BLOCK').length
  const warnCount =
    typeof l0b.warnCount === 'number'
      ? l0b.warnCount
      : issues.filter((i) => String(i?.severity || '').toUpperCase() === 'WARN').length
  let score = 100 - SPEC_BLOCK_PENALTY * blockCount - SPEC_WARN_PENALTY * warnCount
  if (blockCount > 0) score = Math.min(score, 79)
  return {
    score: clampScore(score),
    blockCount,
    warnCount,
    issues: issues.slice(0, 40).map((i) => ({
      id: i.id || i.code || '',
      severity: i.severity || '',
      message: String(i.message || '').slice(0, 240),
    })),
  }
}

/**
 * 🛡️ style 色彩判据单一来源（2026-11-03）：
 * 此处原有第二套 `parseRgbTuple` + `colorDistance` 私有实现，与 `style-var-resolver.js` 的
 * `parseColor` + `colorDistance` 并行——后者保留 alpha，前者把 `#RRGGBBAA` 直接 `slice(0,6)` 截掉。
 * 两份算出的 RGB 欧氏距离目前逐字等价（已逐分支核对：hex3/hex6/hex8/rgb/rgba 解析路径相同），
 * 但「同构判据必须单一来源」不允许留第二份，故删除私有实现改为委托。
 */
function colorsMatch(expected, actuals, maxDelta = 24) {
  return actuals.some((a) => colorDistance(expected, a) <= maxDelta)
}

/**
 * 🛡️ 2026-11-03：色彩匹配**明细**（不改判定，只把「这次匹配有多勉强」说清楚）。
 *
 * 背景（离线取证 3741 个期望色 · 262 目录）：`maxDelta=24` 的原始理由是「吸收取整/浮点噪声」，
 * 但噪声几乎全部落在 d=0（(0,3] 仅 19 例 / 0.51%），而 (10,24] 有 443 例（11.84%）是**实质色差**
 * （#ff4747 vs #ff5a50 d=21.0、#333333 vs #2b2b2b d=13.9）却仍被判「匹配」；
 * 另有 414 例 RGB 命中但 |Δalpha|>0.08（exp=#2c68ff(a=1) vs act=rgba(44,104,255,0.08)），
 * 静态产物无法区分「产物用纯色+opacity 实现」与「透明度真的写错」。
 *
 * 故本函数只做**分档留痕**，判定阈值一个字不改 ⇒ matched/missed 与 styleScore 逐字不变。
 * 分档（按「最近产物色的 RGB 欧氏距离」）：exact(d=0) / near(0<d<=3) / loose(3<d<=24) / over(d>24)。
 * 注意 `over` 只表示「超出 colorsMatch 的 maxDelta=24」——是否最终被兜住需看 matched 字段
 * （d∈(24,32] 仍可能被 colorFuzzyMatch 的 maxDelta=32 判匹配），本档位不声称「未匹配」。
 */
function colorMatchDetail(expected, actuals) {
  let best = null
  for (const a of actuals || []) {
    const d = colorDistance(expected, a)
    if (!best || d < best.delta) best = { delta: d, actual: a }
  }
  if (!best || !isFinite(best.delta)) {
    return { delta: Infinity, actual: null, alphaDiff: null, tier: 'over' }
  }
  const ec = parseColor(expected)
  const ac = parseColor(best.actual)
  const alphaDiff = ec && ac ? Math.abs(ec.a - ac.a) : null
  const tier = best.delta === 0 ? 'exact' : best.delta <= 3 ? 'near' : best.delta <= 24 ? 'loose' : 'over'
  return { delta: best.delta, actual: best.actual, alphaDiff, tier }
}

function parsePx(value) {
  const m = String(value || '').match(/(-?\d+(?:\.\d+)?)px/i)
  return m ? Number(m[1]) : null
}

function pxMatch(expected, actuals, tol = 2) {
  const e = typeof expected === 'number' ? expected : parsePx(expected)
  if (!Number.isFinite(e)) return false
  return actuals.some((a) => {
    const n = typeof a === 'number' ? a : parsePx(a)
    return Number.isFinite(n) && Math.abs(n - e) <= tol
  })
}

function uniqueStrings(list) {
  return [...new Set((list || []).map((x) => String(x).trim()).filter(Boolean))]
}

/**
 * 从产物文件中提取样式字面量（color / spacing / font / radius）。
 *
 * 2026-09-22 根治样式分非确定性：此前对全部文件（含 .js / .json / .vue 的
 * <script>/<template>）用宽泛正则提取颜色，LLM 每次生成的 JS 代码中颜色字面量
 * 略有不同（注释、字符串、变量值等）→ 提取集合不同 → 覆盖率波动 → 样式分不稳定。
 * 修复：只扫描真正的样式上下文（.less/.css 全文 + .vue 的 <style> 块）。
 */
export function extractDeclaredStyleLiterals(files = []) {
  return stringifyDeclaredLiterals(extractDeclaredStyleLiteralsWithLocation(files))
}

/**
 * 带定位的产物样式字面量。
 * 与 extractDeclaredStyleLiterals 不同：返回值是 `{ value, source: { file, line, className, field } }[]` 数组。
 *
 * 让前端 QualityScore 面板展示「未匹配的 20px 圆角：Figma 来自 slot-流量预测（id=83:30, FRAME），
 * 产物期望写在 `package/components/HeaderSub.vue:42`（`.c-xx-slot` 类）」，用户可直接定位到产物文件具体行。
 *
 * 行号算法：先在原文件中定位 <style> 块起始行，再在 styleContent 内匹配正则时按累积偏移加回，得到原文件行号。
 * className：取该 CSS 声明所在规则块的选择器（如 `.c-x-root`）；LESS 文件取 `@media` 等容器上一层。
 */
export function extractDeclaredStyleLiteralsWithLocation(files = []) {
  const colors = []
  const spacing = []
  const fonts = []
  const radii = []
  const colorRe = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(\s*[\d.,%\s]+\)/g
  const spaceRe = /(?:gap|row-gap|column-gap|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?)\s*:\s*([^;}{]+)/gi
  const fontRe = /font-size\s*:\s*([^;}{]+)/gi
  const radiusRe = /border-radius\s*:\s*([^;}{]+)/gi

  // 检测是否使用变量化字体（@fontSize / var(--fontSize) 等）
  let fontUsesVariable = false
  const fontVarRe = /font-size\s*:\s*(?:@fontSize|var\(--fontSize|calc\(@fontSize|calc\(var\(--fontSize)/gi

  // 🔴 2026-11-02 修复（实证 mc-max-1793629839483-bf86ddba）：fg-takeover 产物的 fg 样式
  // 大量写在模板内联 style="..." 与 :style="{...}"，此前只扫 <style> 块 ⇒ 真实存在的值被判
  // missed（#3965ff≡rgba(57,101,255,1) 内联实存却扣分）。正则在下方 .vue 分支内使用。
  const inlineStyleAttrRe = /\s(?::)?style\s*=\s*"([^"]*)"/gi
  const inlineSpaceKeyRe = /(?:row-gap|rowGap|column-gap|columnGap|gap|padding|margin)[a-zA-Z-]*\s*:\s*([^,;}"]+)/gi
  const inlineFontKeyRe = /(?:font-size|fontSize)\s*:\s*([^,;}"]+)/gi
  const inlineRadiusKeyRe = /(?:border-radius|borderRadius)\s*:\s*([^,;}"]+)/gi
  const pxTokenRe = /(-?[\d.]+px)/gi

  for (const f of files) {
    const content = String(f?.content || '')
    const p = String(f?.path || '')
    // 只扫描样式上下文：.less/.css 全文 + .vue 的 <style> 块
    // 同时把每段样式块映射回原文件行号（<style block起始行 + styleContent 内偏移）
    const styleBlocks = [] // [{ styleText, startLine }]
    if (/\.less$/i.test(p) || /\.css$/i.test(p)) {
      styleBlocks.push({ styleText: content, startLine: 1 })
    } else if (/\.vue$/i.test(p)) {
      // 提取所有 <style> 块（含 scoped / lang="less" 等变体），记录起始行号
      for (const m of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
        const matchIndex = m.index ?? 0
        const styleText = m[1]
        // 计算原文件起始行：m.index 之前的换行符数 + 1
        const before = content.slice(0, matchIndex)
        const startLine = (before.match(/\n/g) || []).length + 1
        styleBlocks.push({ styleText: styleText + '\n', startLine })
      }
      // 模板内联样式补扫：静态 style="..."（CSS 声明）+ 绑定 :style="{...}"（对象字面量）。
      // 仅取字符串字面量；row.c0.pad 等动态表达式天然提不出 px/色值，不会误采。
      // 只扫模板 style 属性值，不扫 <script>，避免 2026-09-22 修掉的
      // 「非样式上下文颜色字面量导致分数波动」问题复发。
      for (const t of content.matchAll(/<template[^>]*>([\s\S]*?)<\/template>/gi)) {
        const tpl = t[1]
        const tplBaseLine = (content.slice(0, t.index ?? 0).match(/\n/g) || []).length + 1
        for (const m of tpl.matchAll(inlineStyleAttrRe)) {
          const styleText = m[1]
          const baseLine = tplBaseLine + (tpl.slice(0, m.index ?? 0).match(/\n/g) || []).length
          if (!styleText || !/[;:{}]/.test(styleText)) continue
          let cm
          colorRe.lastIndex = 0
          while ((cm = colorRe.exec(styleText))) {
            colors.push(
              makeDeclaredEntry(
                cm[0].replace(/\s+/g, ''),
                p,
                baseLine + offsetToLine(styleText, cm.index),
                '(inline-style)',
                'fills'
              )
            )
          }
          let sm
          inlineSpaceKeyRe.lastIndex = 0
          while ((sm = inlineSpaceKeyRe.exec(styleText))) {
            const field = (sm[0].match(/^[a-zA-Z-]+/i) || ['spacing'])[0]
            const line = baseLine + offsetToLine(styleText, sm.index)
            const valText = sm[1]
            pxTokenRe.lastIndex = 0
            let tm
            while ((tm = pxTokenRe.exec(valText))) {
              spacing.push(makeDeclaredEntry(tm[1], p, line, '(inline-style)', field))
            }
          }
          inlineFontKeyRe.lastIndex = 0
          while ((sm = inlineFontKeyRe.exec(styleText))) {
            const px = parsePx(sm[1])
            if (px != null) {
              const line = baseLine + offsetToLine(styleText, sm.index)
              fonts.push(makeDeclaredEntry(`${px}px`, p, line, '(inline-style)', 'font-size'))
            }
          }
          inlineRadiusKeyRe.lastIndex = 0
          while ((sm = inlineRadiusKeyRe.exec(styleText))) {
            const line = baseLine + offsetToLine(styleText, sm.index)
            const valText = sm[1]
            pxTokenRe.lastIndex = 0
            let tm
            while ((tm = pxTokenRe.exec(valText))) {
              radii.push(makeDeclaredEntry(tm[1], p, line, '(inline-style)', 'border-radius'))
            }
          }
        }
      }
    } else {
      continue // .js / .json / .ts 等非样式文件 → 跳过
    }

    if (styleBlocks.length === 0) continue

    for (const { styleText, startLine } of styleBlocks) {
      let m
      colorRe.lastIndex = 0
      while ((m = colorRe.exec(styleText))) {
        // 🔴 B3（2026-11-03 修复 · 参数错位）：此前把 `offsetToLine(...)` 传进了 className 位、
        //   丢掉行内偏移与 field（多传一个实参 + 'fills' 落到第 6 位被忽略），后果有二：
        //   ① color 维度 source.className **恒为数字**（行偏移）——313 组件目录实测 11748 条 actual 颜色条目中
        //      11155 条（94.9%）className 是纯数字，颜色指纹/定位归因全部失真；
        //   ② source.line 停在 `<style>` 块首行，不含声明所在行内偏移 ⇒ 前端「未匹配颜色来自哪个类名 / 哪一行」一直错
        //      （实测 11155 条行号恒 = 块首行，如 common.less line 1，真实声明在 42/48/54 行）。
        //   现与 spacing/font/radius 三支（:326/:336/:347）统一口径：line = 块起始行 + 行内偏移，className = 所属规则选择器。
        //   ⚠️ 判定零影响：scoreDimension 只读 entries[].value（uniqueStrings(actList.map(a => a.value))），
        //   source 仅经 missed[].closestActualSource 透传给前端 ⇒ matched / missed / score 逐字不变。
        colors.push(
          makeDeclaredEntry(
            m[0].replace(/\s+/g, ''),
            p,
            startLine + offsetToLine(styleText, m.index),
            findEnclosingClass(styleText, m.index),
            'fills'
          )
        )
      }
      spaceRe.lastIndex = 0
      while ((m = spaceRe.exec(styleText))) {
        const matchedStr = m[0] || ''
        const field = (matchedStr.match(/^[a-z-]+/i) || ['spacing'])[0]
        const line = startLine + offsetToLine(styleText, m.index)
        const className = findEnclosingClass(styleText, m.index)
        for (const tok of m[1].split(/\s+/)) {
          if (/px$/i.test(tok)) {
            spacing.push(makeDeclaredEntry(tok, p, line, className, field))
          }
        }
      }
      fontRe.lastIndex = 0
      while ((m = fontRe.exec(styleText))) {
        const px = parsePx(m[1])
        if (px != null) {
          const line = startLine + offsetToLine(styleText, m.index)
          const className = findEnclosingClass(styleText, m.index)
          fonts.push(makeDeclaredEntry(`${px}px`, p, line, className, 'font-size'))
        }
      }
      radiusRe.lastIndex = 0
      while ((m = radiusRe.exec(styleText))) {
        const matchedStr = m[0] || ''
        const field = (matchedStr.match(/^[a-z-]+/i) || ['border-radius'])[0]
        const line = startLine + offsetToLine(styleText, m.index)
        const className = findEnclosingClass(styleText, m.index)
        for (const tok of m[1].split(/\s+/)) {
          if (/px$/i.test(tok) || tok === '0') {
            radii.push(makeDeclaredEntry(tok, p, line, className, field))
          }
        }
      }

      // 检测变量化字体
      fontVarRe.lastIndex = 0
      if (fontVarRe.test(styleText)) {
        fontUsesVariable = true
      }
    }
  }
  return {
    color: dedupeDeclaredEntries(colors),
    spacing: dedupeDeclaredEntries(spacing),
    font: dedupeDeclaredEntries(fonts),
    radius: dedupeDeclaredEntries(radii),
    fontUsesVariable,
  }
}

// 把「当前样式块内的字符偏移」转换为「块内行号」（从 1 开始）
function offsetToLine(text, offset) {
  if (offset <= 0) return 0
  const before = text.slice(0, offset)
  return (before.match(/\n/g) || []).length
}

// 找当前声明所在 CSS 规则块的最内层选择器（人类可读定位）
// 算法：在 index 之前最近的 `{` 之前的「最后一个以 . 或 @ 开头的选择器段」
// 简化版：直接抓 index 之前最近的「`}` ... `{`」之间最后一行以 `}` 或 `@` 或 `.` 开头的字符
function findEnclosingClass(text, index) {
  // 在 index 之前找最近的 `{`（当前规则块起点），再看这一对 `{` 之前最近的 `}`（上一个块终点），
  // 这之间中找以 `.x` 或 `&` 开头的「最末行」作为最近外层选择器
  const head = text.slice(0, index)
  const lastBraceIdx = head.lastIndexOf('{')
  if (lastBraceIdx < 0) return null
  // 在 lastBraceIdx 之前找最近的 `}`
  const prevCloseIdx = head.lastIndexOf('}', lastBraceIdx)
  const startIdx = prevCloseIdx >= 0 ? prevCloseIdx + 1 : 0
  const block = text.slice(startIdx, lastBraceIdx)
  // 找 block 里最后一个 `.x` 或 `@media x` 或嵌套选择器段
  // 简化为：最后一个形如 `\.[\w-]+` 或 `&` 或 `^[.@&][^\s,{]+` 的子串
  const candidates = []
  const selectorRe = /(?:^|[\s,])([.@&][^\s,{]+)/g
  let sm
  while ((sm = selectorRe.exec(block))) candidates.push(sm[1])
  if (candidates.length === 0) return null
  // 取最后一个选择器（最贴近当前声明的外层）
  return candidates[candidates.length - 1]
}

function makeDeclaredEntry(value, file, line, className, field) {
  return {
    value,
    source: {
      file: String(file || ''),
      line: typeof line === 'number' ? line : 0,
      className: className || null,
      field: field || null,
    },
  }
}

// 按 value 去重，但保留首个命中的 source（最权威：第一个出现的位置即「主样式」位置）
function dedupeDeclaredEntries(list) {
  const seen = new Map()
  for (const entry of list) {
    if (!seen.has(entry.value)) seen.set(entry.value, entry)
  }
  return Array.from(seen.values())
}

// 把带定位的 actual 条目降级回纯字符串数组（向后兼容 style-auto-fix.js 等）
function stringifyDeclaredLiterals(structured) {
  return {
    color: structured.color.map((e) => e.value),
    spacing: structured.spacing.map((e) => e.value),
    font: structured.font.map((e) => e.value),
    radius: structured.radius.map((e) => e.value),
    fontUsesVariable: structured.fontUsesVariable,
  }
}

function figmaColorToCss(fill) {
  const c = fill?.color
  if (!c || typeof c.r !== 'number') return null
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const op = typeof fill.opacity === 'number' ? fill.opacity : typeof c.a === 'number' ? c.a : 1
  if (op < 0.999) return `rgba(${r},${g},${b},${Math.round(op * 100) / 100})`
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function extractExpectedStyleLiterals(figmaNodeData) {
  return stringifyExpectedLiterals(extractExpectedStyleLiteralsWithLocation(figmaNodeData))
}

/**
 * 带定位的 Figma 期望样式字面量（每个值携带 Figma 节点 id / 路径 / 类型 / 名称）。
 * 与 extractExpectedStyleLiterals 不同：返回值是 `{ value, source: { figmaNodeId, figmaPath, nodeType, nodeName, field } }[]` 数组。
 *
 * 调用方（scoreComponentDir）拿到结构化数据后可让前端展示「未匹配的圆角来自哪个 Figma 节点」，
 * 用户能直接定位设计稿源头，比只看 `未匹配：20px` 信息密度高得多。
 *
 * 注意：保留字符串版本是为了向后兼容（style-auto-fix.js 等仍在用）。
 */
export function extractExpectedStyleLiteralsWithLocation(figmaNodeData, opts = {}) {
  // 🛡️ A1 配套（2026-11-03）：去重开关，**默认 true = 判据口径，一个字不改**。
  //   `dedupe: false` 供 prompt 侧「样式真值强化」使用，原因有二：
  //   ① 需要「每个值 → 全部来源节点」的完整锚点，去重只留首个节点会丢锚点；
  //   ② `spacing` 是按 **value 字符串**去重的（见 dedupeExpectedEntries），把
  //      itemSpacing（gap）与 padding 同值条目混在一个桶里 —— 若 gap 10px 先入，
  //      padding 10px 会被**整个吞掉**，prompt 侧直接读去重结果就会漏报内边距真值。
  //   ⚠️ 判据（scoreComponentDir）永远走默认值，不得传 false —— 传了会改变期望分母。
  const dedupe = opts.dedupe !== false
  // 🛡️ 档B 成品位图资源节点（2026-11-03）：这些节点的**像素类属性**（fill 颜色 / cornerRadius）
  //   已随「按节点渲染」的 PNG 导出烘进像素，产物以 `<img>`/background-image 直接显示该位图
  //   ⇒ CSS 侧无从（也不该）声明 ⇒ 不收期望（否则系统性假扣分）。
  //   判据**单一来源** = `.mc-gen/resource-dom-mapping.json` 的 `downloadStatus === 'success'`
  //   （与挂载侧同源），由调用方（`scoreComponentDir`）读盘后以节点 id 集合传入 —— 本函数
  //   保持**纯函数、零 IO**，签名之外不碰磁盘。
  //   ⚠️ 必须严格只取 success：`resourceFile` 有值但 `downloadStatus === 'missing'` 的节点没有
  //      真导出、产物走 CSS 兜底，其颜色仍是真值（如 36:1694）⇒ 不在本集合内。
  const exemptPixelNodeIds =
    opts.exemptPixelNodeIds instanceof Set
      ? opts.exemptPixelNodeIds
      : Array.isArray(opts.exemptPixelNodeIds)
        ? new Set(opts.exemptPixelNodeIds)
        : null
  // 🛡️ 档A 面板壳节点（2026-11-03）：`skipMount === true` 的节点 —— 生成侧已裁决「产物不还原它」
  //   （面板外壳由宿主 base-panel 提供），其 cornerRadius 恒失配 ⇒ 不收期望。
  //   判据**单一来源** = `.mc-gen/resource-dom-mapping.json` 的 `skipMount`，由调用方读盘后传入；
  //   与 `scoreResourceMount`（本文件）同一字段、同一语义，禁止此处再叠名字白名单。
  const panelShellNodeIds =
    opts.panelShellNodeIds instanceof Set
      ? opts.panelShellNodeIds
      : Array.isArray(opts.panelShellNodeIds)
        ? new Set(opts.panelShellNodeIds)
        : null
  const colors = []
  const spacing = []
  const fonts = []
  const radii = []
  // 🛡️ P4 位图替代矢量豁免档计数（2026-11-03）：被豁免的 cornerRadius 条数（详见下方判据）。
  let bitmapRadiusExempted = 0
  // 🛡️ 档B 计数（2026-11-03）：成品位图资源节点被豁免的 fill 颜色条数。
  let exportedPixelColorExempted = 0
  // 🛡️ 档A 计数（2026-11-03）：面板壳（宿主 base-panel 提供）被豁免的 cornerRadius 条数。
  let panelShellRadiusExempted = 0
  const root = figmaNodeData?.document || figmaNodeData
  if (!root || typeof root !== 'object') {
    return {
      color: [],
      spacing: [],
      font: [],
      radius: [],
      stats: { bitmapRadiusExempted, exportedPixelColorExempted, panelShellRadiusExempted },
    }
  }
  const walk = (node, depth, maskCtx = false, figmaPath = '') => {
    if (!node || typeof node !== 'object' || depth > 12) return
    const kids = Array.isArray(node.children)
      ? node.children
      : Array.isArray(node.document?.children)
        ? node.document.children
        : []
    // 掩码子树判定：当前节点是 mask，或其子树含 isMask 节点（图标矢量占位，
    // 产物用 <img> 渲染真实位图，其占位色与最终渲染不可比，跳过避免假阳性）。
    const nodeHasMask = node.isMask === true || kids.some((k) => k && k.isMask === true)
    const childMaskCtx = maskCtx || nodeHasMask
    // 同节点存在可见渐变时，被覆盖的 SOLID 层不代表最终可见色，不作为期望。
    const hasVisibleGradient = (node.fills || []).some(
      (f) => f.visible !== false && f.type === 'GRADIENT_LINEAR'
    )
    if (!childMaskCtx) {
      const fills = Array.isArray(node.fills) ? node.fills : []
      const topFill = fills.find(
        (f) => f.visible !== false && f.type === 'SOLID'
      )
      if (topFill && !hasVisibleGradient) {
        const op =
          typeof topFill.opacity === 'number'
            ? topFill.opacity
            : topFill.color && typeof topFill.color.a === 'number'
              ? topFill.color.a
              : 1
        // 近似全透明层（op < 0.01）对视觉无贡献，跳过。
        if (op >= 0.01) {
          const css = figmaColorToCss(topFill)
          if (css) {
            // 🛡️ 档B（2026-11-03）：成品位图资源节点 —— Figma 里这里是**矢量源色**
            //   （如 48:5903 fill #3965ff → 导出 icon-关闭-5903.png），产物写 `<img :src>`，
            //   CSS 里既没有也不该有该色 ⇒ 仍作期望则恒失配（全库 158 条实证）。
            if (exemptPixelNodeIds && node.id && exemptPixelNodeIds.has(node.id)) {
              exportedPixelColorExempted += 1
            } else {
              colors.push(makeExpectedEntry(css, node, figmaPath, 'fills[0]'))
            }
          }
        }
      }
    }
    if (typeof node.itemSpacing === 'number') {
      // 🛡️ 2026-09-30 复审修正：**只去浮点噪声，不改变「纳入集合」**。
      //   Figma itemSpacing 常带精度噪声（17.600000381469727），round 成 18 便于与产物整数刻度
      //   对齐（与 L323 cornerRadius 同源做法；numericFuzzyMatch 内建 |round(e)-round(a)|<=1 豁免）。
      //   🔴 禁止用 `> 0` 过滤：itemSpacing = 0 与**负值**都是真实布局事实（负 gap 即叠加排布），
      //      过滤会让期望分母变小 ⇒ 分数虚高，与「门禁只降不升」冲突（09-30 复审实锤）。
      spacing.push(makeExpectedEntry(`${Math.round(node.itemSpacing)}px`, node, figmaPath, 'itemSpacing'))
    }
    for (const key of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) {
      // 纳入条件与既有口径一致（仅 raw > 0）；本次只对**字面量**去噪，不增删条目。
      if (typeof node[key] === 'number' && node[key] > 0) {
        spacing.push(makeExpectedEntry(`${Math.round(node[key])}px`, node, figmaPath, key))
      }
    }
    if (typeof node.style?.fontSize === 'number') {
      fonts.push(makeExpectedEntry(`${node.style.fontSize}px`, node, figmaPath, 'style.fontSize'))
    }
    // 2026-09-29 修复：过滤掉圆形/椭圆节点的 cornerRadius（不是 CSS border-radius）
    // 圆形节点的 cornerRadius 等于其半径（如 75px），但产物不会用 border-radius: 75px
    //
    // 🛡️ P4 位图替代矢量豁免档（2026-11-03 · 实证 mc-max-1793629839483-bf86ddba radius 0/2）：
    //   判据 = 节点**顶层可见 fill** 为 IMAGE。依据：资源经 `figma-client.js:77`
    //   `GET /files/{key}/images?ids={nodeId}&format=png` **节点渲染端点**导出，Figma 按节点
    //   渲染 ⇒ cornerRadius 已**烘入位图 PNG 的 alpha 通道**（实测 12/12 目录 `image_473938-37.png`
    //   四角 alpha=95~96、中心 255）。产物以 `<img>`/background-image 直接显示该位图 ⇒
    //   CSS 无需（也不应）再写 border-radius；仍作期望项则恒失配 ⇒ 假扣分。
    //   **边界（不放水）**：仅「顶层可见 fill === IMAGE」豁免；顶层为 SOLID/GRADIENT 的节点，
    //   CSS 侧仍需 border-radius（如 43:5688 SOLID rgba(20,105,169,.37) r=3，属真值），照常纳入。
    //
    // 🛡️ 档A 面板壳圆角豁免（2026-11-03 同源化 · 实证 mc-max-1793672978279-c85bc59c radius 0/3）：
    //   判据 = 节点 id ∈ `collectPanelShellNodeIds(resourceMapping)`，
    //   即生成侧 `resource-dom-mapping.json` 的 **`skipMount === true`** 真值。
    //   依据（`figma-connector.js:2679-2704`）：`previewAnalysisRole === 'bg'` ∧ 路径段数 ≤2 的 `bg`
    //   （如 36:1694「cp-设备详情/bg」，box 603×555 ≡ 图根盒）被置 `skipMount = true`；prompt 侧
    //   明写「base-panel 外壳由宿主提供，只需还原 slot 内容，**无需输出面板背景/标题栏**」⇒ 产物
    //   **不渲染**它是管线既定决策，其圆角由宿主提供。仍作期望则恒失配（全库实测 158 例 0 兑现）。
    //   ⚠️ 为何**不用** `isPanelResource`（今次同源化的直接动因）：它是「命名像面板壳」的**近似**
    //      判据（`bg|background|header|panel-header|title-bar`），实测存在 `isPanelResource === true`
    //      但**无** `skipMount` 的反例（`36:1697 header`，产物确实渲染它）⇒ 两判据只是**恰好重合**，
    //      并非同源；且纯名字版会把命中面从 4 例放大到 158 例。`skipMount` 才是「产物不还原它」的
    //      **唯一事实源**，并天然排除**嵌套** bg（`cp-xxx/tabs-list/bg`，≥3 段 ⇒ 走 `mountTarget`
    //      挂载、产物**要**渲染）—— 与 `scoreResourceMount`（本文件）消费同一字段、同一语义。
    //   ⚠️ 只作用于 **radius**：面板壳的颜色/间距不是本档语义（颜色走档B、间距是容器事实照审）。
    const topVisibleFill = (node.fills || []).find((f) => f && f.visible !== false)
    const isBitmapTopFill = !!topVisibleFill && topVisibleFill.type === 'IMAGE'
    // 档B：该节点已导出为成品位图资源 ⇒ 圆角同样已烘入 PNG alpha（与 P4 同源证据、更宽的覆盖面）。
    const isExportedPixelNode = !!(exemptPixelNodeIds && node.id && exemptPixelNodeIds.has(node.id))
    // 档A：生成侧已裁决不做挂载还原（skipMount）⇒ 其圆角由宿主面板提供，不收期望。
    const isPanelShellNode = !!(panelShellNodeIds && node.id && panelShellNodeIds.has(node.id))
    if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
      // 跳过 ELLIPSE 类型节点（圆形/椭圆装饰）
      if (node.type !== 'ELLIPSE') {
        // 四舍五入到整数，避免浮点精度问题（如 1.7600001096725464 → 2）
        const rounded = Math.round(node.cornerRadius)
        if (rounded > 0) {
          if (isBitmapTopFill || isExportedPixelNode) {
            bitmapRadiusExempted += 1
          } else if (isPanelShellNode) {
            panelShellRadiusExempted += 1
          } else {
            radii.push(makeExpectedEntry(`${rounded}px`, node, figmaPath, 'cornerRadius'))
          }
        }
      }
    }
    if (Array.isArray(kids)) {
      // 拼出从根到当前节点的 Figma 节点路径（用 name 而非 id：id 无语义不便人类定位）
      const childPath = figmaPath
        ? `${figmaPath} / ${node.name || node.id || '<unnamed>'}`
        : (node.name || node.id || '<unnamed>')
      for (const child of kids.slice(0, 80)) walk(child, depth + 1, childMaskCtx, childPath)
    }
  }
  walk(root, 0)
  return {
    color: dedupe ? dedupeExpectedEntries(colors) : colors,
    spacing: dedupe ? dedupeExpectedEntries(spacing) : spacing,
    font: dedupe ? dedupeExpectedEntries(fonts) : fonts,
    radius: dedupe ? dedupeExpectedEntries(radii) : radii,
    // 🛡️ P4 可观测性（2026-11-03）：位图替代矢量豁免档的计数，随 structured 一并下发，
    //   经 `expectedWithLocation` 直达前端，用户可看到「已豁免 N 条位图圆角（无需 CSS）」。
    //   注意：`stringifyExpectedLiterals` 只取四维，故该字段对字符串版 API 无影响（向后兼容）。
    //   档B（2026-11-03）扩展：`bitmapRadiusExempted` 现同时计入「成品位图资源」节点的圆角
    //   （顶层 IMAGE ∨ 已导出为位图 ⇒ 像素已在 PNG 里），语义统一为「位图替代矢量的圆角豁免」。
    stats: { bitmapRadiusExempted, exportedPixelColorExempted, panelShellRadiusExempted },
  }
}

/**
 * 成品位图资源节点 id 集合（档B · 2026-11-03）。
 *
 * 判据**单一来源** = `resource-dom-mapping.json` 的 `downloadStatus === 'success'` —— 该节点
 * 已经 `figma-client.js` 的 `GET /files/{key}/images?ids={nodeId}&format=png` **按节点渲染**
 * 导出为 PNG，其颜色/圆角已在位图像素里；产物以 `<img>`/background-image 直接显示 ⇒ CSS 侧
 * 无需（也不该）声明这些像素类属性 ⇒ 作期望则恒失配（全库实证：color 158 条、radius 38 条）。
 *
 * ⚠️ 严格只取 `success`：`resourceFile` 有值但 `downloadStatus !== 'success'` 的节点（如
 *    36:1694 `missing`）**没有真导出**，产物走 CSS 兜底 ⇒ 其颜色仍是真值，不放水。
 *
 * @param {Array|null} resourceMapping `resource-dom-mapping.json` 内容
 * @returns {Set<string>|null} 空集合返回 null（与「不传」等价，避免无谓的 opts）
 */
export function collectExportedResourceNodeIds(resourceMapping) {
  if (!Array.isArray(resourceMapping)) return null
  const ids = new Set()
  for (const m of resourceMapping) {
    if (m && m.downloadStatus === 'success' && typeof m.figmaNodeId === 'string' && m.figmaNodeId) {
      ids.add(m.figmaNodeId)
    }
  }
  return ids.size > 0 ? ids : null
}

/**
 * 面板壳节点 id 集合（档A · 2026-11-03 同源化）。
 *
 * 判据**单一来源** = `resource-dom-mapping.json` 的 `skipMount === true` —— 生成侧
 * （`figma-connector.js:2679-2704`）对 `previewAnalysisRole === 'bg'` ∧ 路径段数 ≤2 的 `bg`
 * 置此标记，语义是「面板外壳由宿主 base-panel 提供，产物**不还原**它」（prompt 侧同义）。
 * ⇒ 其 cornerRadius 恒失配，不作期望。与 `scoreResourceMount`（本文件）消费同一字段，口径一致。
 *
 * 🔴 不使用 `isPanelResource`（命名近似）：实测反例 `36:1697 header` 为 `isPanelResource === true`
 *    但无 `skipMount`（产物确实渲染它）⇒ 名字判据会**过宽**。`skipMount` 才是真值。
 *
 * ⚠️ 严格只取 `true`（`skipMount` 为 `false`/`undefined` 一律不算）；空集合返回 null（与「不传」等价）。
 *
 * @param {Array|null} resourceMapping `resource-dom-mapping.json` 内容
 * @returns {Set<string>|null}
 */
export function collectPanelShellNodeIds(resourceMapping) {
  if (!Array.isArray(resourceMapping)) return null
  const ids = new Set()
  for (const m of resourceMapping) {
    if (m && m.skipMount === true && typeof m.figmaNodeId === 'string' && m.figmaNodeId) {
      ids.add(m.figmaNodeId)
    }
  }
  return ids.size > 0 ? ids : null
}

// 构造带 Figma 定位的期望条目
function makeExpectedEntry(value, node, parentPath, field) {
  const name = node.name || ''
  const id = node.id || ''
  // 完整路径：root-name / ... / 当前节点名（人类可读，不带 id 噪音）
  const figmaPath = parentPath
      ? `${parentPath} / ${name || id || '<unnamed>'}`
      : (name || id || '<unnamed>')
  return {
    value,
    source: {
      figmaNodeId: id,
      figmaNodeName: name,
      figmaNodeType: typeof node.type === 'string' ? node.type : null,
      figmaPath,
      field, // 字段名（itemSpacing / paddingLeft / cornerRadius / fills[0] / style.fontSize）
    },
  }
}

// 按 value 字符串去重，但保留定位（首个命中即权威；后续同名值的不同节点不重复计数）
function dedupeExpectedEntries(list) {
  const seen = new Map()
  for (const entry of list) {
    if (!seen.has(entry.value)) seen.set(entry.value, entry)
  }
  return Array.from(seen.values())
}

// 把带定位的期望条目降级回纯字符串数组（向后兼容）
function stringifyExpectedLiterals(structured) {
  return {
    color: structured.color.map((e) => e.value),
    spacing: structured.spacing.map((e) => e.value),
    font: structured.font.map((e) => e.value),
    radius: structured.radius.map((e) => e.value),
  }
}

/**
 * 从 Figma 节点提取结构信息（布局类型、对齐方式、层级深度）
 */
/**
 * 🔴 2026-11-03：节点构成分类常量——供 `nodes` 子项输出**可解释的构成明细**。
 *
 * 为何要分类：Figma 的 `nodeCount` 与产物侧「`<template>` 开标签数」**口径不同源**——
 *   Figma 里 56% 的节点是 VECTOR / ELLIPSE 这类**纯矢量装饰**，产物侧通常由
 *   CSS 背景 / 伪元素 / 内联 SVG path 承载，**不产生独立 DOM 标签**。
 *   实测 c-device-monitor-7c5ef300：Figma 437 节点 = 容器 105 + 文本 74 + 装饰 258，
 *   而产物只有 25 个标签 ⇒ `min(1, 25/437)=0.057`。这不是产物缺了 412 个 DOM，
 *   而是两侧在数不同的东西。故本项**退出 structure 分母**，改以构成明细呈现。
 */
const FIGMA_CONTAINER_TYPES = new Set([
  'FRAME',
  'GROUP',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
])
const FIGMA_DECOR_TYPES = new Set([
  'VECTOR',
  'ELLIPSE',
  'RECTANGLE',
  'LINE',
  'STAR',
  'POLYGON',
  'BOOLEAN_OPERATION',
])

export function extractExpectedStructure(figmaNodeData) {
  const layouts = [] // flex/grid/none
  const alignments = [] // align-items/justify-content
  let maxDepth = 0
  let nodeCount = 0
  // 节点构成统计（仅供 nodes 明细展示，不参与判据）
  let containerCount = 0 // 容器类节点（FRAME/GROUP/COMPONENT/INSTANCE/SECTION）
  let layoutContainerCount = 0 // 其中带 auto layout 的（HORIZONTAL/VERTICAL/GRID）
  let decorNodeCount = 0 // 纯矢量装饰节点（VECTOR/ELLIPSE/RECTANGLE/…，多数为叶）
  let textNodeCount = 0
  const nodeBreakdown = {}
  const root = figmaNodeData?.document || figmaNodeData
  if (!root || typeof root !== 'object') {
    return {
      layouts: [],
      alignments: [],
      maxDepth: 0,
      nodeCount: 0,
      containerCount: 0,
      layoutContainerCount: 0,
      decorNodeCount: 0,
      textNodeCount: 0,
      nodeBreakdown: {},
    }
  }
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 12) return
    nodeCount++
    if (depth > maxDepth) maxDepth = depth
    // 节点构成（按 type 归类；未知类型归入 other）
    const nodeType = String(node.type || 'other')
    nodeBreakdown[nodeType] = (nodeBreakdown[nodeType] || 0) + 1
    if (FIGMA_CONTAINER_TYPES.has(nodeType)) containerCount++
    if (FIGMA_DECOR_TYPES.has(nodeType)) decorNodeCount++
    if (nodeType === 'TEXT') textNodeCount++
    if (
      node.layoutMode === 'HORIZONTAL' ||
      node.layoutMode === 'VERTICAL' ||
      node.layoutMode === 'GRID'
    ) {
      layoutContainerCount++
    }
    const kids = Array.isArray(node.children)
      ? node.children
      : Array.isArray(node.document?.children)
        ? node.document.children
        : []
    // 布局类型
    const layoutMode = node.layoutMode
    if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
      layouts.push('flex')
      // 对齐方式
      const primary = node.primaryAxisAlignItems
      const counter = node.counterAxisAlignItems
      if (primary) {
        const justifyMap = {
          MIN: 'flex-start',
          MAX: 'flex-end',
          CENTER: 'center',
          SPACE_BETWEEN: 'space-between',
        }
        alignments.push(`justify-content:${justifyMap[primary] || primary}`)
      }
      if (counter) {
        const alignMap = {
          MIN: 'flex-start',
          MAX: 'flex-end',
          CENTER: 'center',
          BASELINE: 'baseline',
        }
        alignments.push(`align-items:${alignMap[counter] || counter}`)
      }
    } else if (layoutMode === 'GRID') {
      layouts.push('grid')
    }
    // 🔴 2026-11-03 删除 `layouts.push('none')`（旧代码：`else if (kids.length > 1)` 时记 'none'）
    //
    // 根因：'none' 是**不可满足字面量**——对照侧 extractActualStructure 的 displayRe
    //   只采集 `display:(flex|grid|block|inline-flex|inline-grid)`，**永不产出 'none'**
    //   （`display:none` 恰好不在此枚举内，且隐藏元素不该参与布局比对）。
    //   ⇒ 该期望值命中率恒为 0，却照样计入 layout 分母 ⇒ 凡 Figma 含「多子节点但无
    //   auto layout」的容器，layout ratio 就被无条件稀释。
    //
    // 实证（mc-max-1793679145822-fae4130a）：expected=['none','flex'] /
    //   actual=['grid','flex','block'] ⇒ layout 1/2=0.5，**白扣 50 分**（折 structure 总分
    //   12.5）。该组件深度修正后与真值完全一致、对齐项才是唯一真缺陷，故这 50 分纯属判据噪声。
    //
    // 为何不改成「映射到 'block'」：'none' 的语义是「无 auto layout」，既可能是绝对定位
    //   （position:absolute）也可能是默认块级流，无法辩驳地断言产物「应该」出现某个
    //   display 字面量；而对 CSS 而言 `display:block` 是默认值、产物通常不显式声明，
    //   映射过去会反向制造假阴性。
    //   守则：**不可判定 / 不可满足的期望项不得进入分母**。
    if (Array.isArray(kids)) {
      for (const child of kids.slice(0, 80)) walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return {
    layouts: uniqueStrings(layouts),
    alignments: uniqueStrings(alignments),
    maxDepth,
    nodeCount,
    // 节点构成（nodes 明细展示用；判据不消费）
    containerCount,
    layoutContainerCount,
    decorNodeCount,
    textNodeCount,
    nodeBreakdown,
  }
}

/**
 * 🔴 2026-11-03：标签配平计数前必须剥离「**不产生配对**的标签」——depth / nodeCount 虚高根因
 *
 * 事故 mc-max-1793679145822-fae4130a：maxDepth 被判 5（Figma 真值 4）⇒ depth 维度白扣
 *   20 分（ratio 0.8），而实际深度与设计**完全一致**。定位到该文件模板里恰有 1 个
 *   `<img … />`：tagRe 把它当作开始标签 `+1`，却永远没有对应的 `</img>` 来 `-1`
 *   ⇒ 其后所有 depth 读数**永久偏移**，maxDepth 与 nodeCount 双双虚高。
 *   剥离后实测：maxDepth 5→**4**（= 真值 4）、nodeCount 59→58。
 *
 * 三类必须剥（缺一不可）：
 *   ① HTML 注释：`<!-- <div> -->` 里的标签会被 tagRe 数进去，注释本身也不配对；
 *   ② 语法自闭合：`<Img … />` / `<Icon …/>`（Vue 自定义组件极常见）；
 *   ③ HTML void 元素的无斜杠写法：`<img src="x">` / `<br>` / `<input>`（规范上永不闭合）。
 *
 * 🔴 但它们**不是不存在**——是真实存在的**叶子元素**（DOM 里占一个位置，Figma 侧也有
 *   对应的 IMAGE/VECTOR 节点）。所以处理方式不是「删干净」，而是**替换成配平的叶子
 *   占位符** `<x-leaf></x-leaf>`：配平器看到它 +1 再 -1（深度不永久偏移），但它确实
 *   占了一层（`<div><img/></div>` 与 `<div><span/></div>` 深度一致=2）、并计入节点数。
 *   若直接删成空串，纯叶子容器会**少算一层**（实测本改动首版即如此）。
 *
 * 为何是「语法自闭合（任意标签名）+ void 元素名清单」双口径，而不是只按元素名白名单：
 *   只按 `img/input/br…` 会漏掉 `<Icon />` 这类自定义组件 → 虚高照旧。反之若只按语法
 *   自闭合，则漏掉 `<img src="x">` 无斜杠写法。
 *
 * 🔴🔴 void 元素名后必须用 `(?=[\s/>])` 而非 `\b`：`-` 是「非单词字符」，`\b` 在
 *   `<base-panel …>` 的 `base|` 处同样成立 ⇒ 会把产物根容器 `<base-panel>` 整段当成
 *   `<base>` 剥掉。首版实测即中此招：全库 378 处误伤（几乎全是 `<base-panel`），
 *   其中 12 个组件 nodeCount 断崖下跌（17→8、6→4）。同理 `<col-*>`/`<link-*>` 等带
 *   前缀标签全部中招。
 *
 * 已知边界：属性值内含 `>` 或 `/>` 的极端写法（如 `v-if="a > b"`）不会被正确匹配，
 *   属正则级固有局限，对「结构性偏移」的量化影响可忽略。
 */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const SELF_CLOSING_TAG_RE = /<[a-z][\w.-]*\b[^>]*\/>/gi
const VOID_ELEMENT_RE =
  /<(?:img|input|br|hr|source|area|base|col|embed|link|meta|track|wbr|param)(?=[\s/>])[^>]*>/gi
// 叶子占位符：成对出现，配平后深度归位，但本身占一层、计一个节点
const LEAF_MARKER = '<x-leaf></x-leaf>'

/**
 * 把「不产生配对的标签」（自闭合 / void / 注释）归一化为叶子占位符
 * @returns {string} 可安全配平的模板
 */
function normalizeUnpairedTags(template) {
  return String(template || '')
    .replace(HTML_COMMENT_RE, '')
    .replace(SELF_CLOSING_TAG_RE, LEAF_MARKER)
    .replace(VOID_ELEMENT_RE, LEAF_MARKER)
}

/**
 * 从产物 CSS 提取结构信息
 */
export function extractActualStructure(files = []) {
  const layouts = []
  const alignments = []
  let maxDepth = 0
  let nodeCount = 0
  const displayRe = /display\s*:\s*(flex|grid|block|inline-flex|inline-grid)/gi
  const justifyRe = /justify-content\s*:\s*(flex-start|flex-end|center|space-between|space-around|space-evenly)/gi
  const alignRe = /align-items\s*:\s*(flex-start|flex-end|center|baseline|stretch)/gi
  const templateRe = /<template>([\s\S]*?)<\/template>/i
  for (const f of files) {
    const content = String(f?.content || '')
    // 提取模板计算层级深度和节点数
    const tplMatch = content.match(templateRe)
    if (tplMatch) {
      // 🔴 先把不产生配对的标签（自闭合 / void / 注释）归一化为叶子占位符，
      //    否则 `<img />` 只 +1 不 -1 ⇒ 之后所有 depth 永久偏移
      const tpl = normalizeUnpairedTags(tplMatch[1])
      // 简单统计标签嵌套深度（非精确，但可用于比较）
      let depth = 0
      let maxD = 0
      const tagRe = /<\/?([a-z][\w-]*)/gi
      let m
      while ((m = tagRe.exec(tpl))) {
        if (m[0].startsWith('</')) {
          depth--
        } else {
          depth++
          if (depth > maxD) maxD = depth
          nodeCount++
        }
      }
      if (maxD > maxDepth) maxDepth = maxD
    }
    // 提取布局类型
    let m
    while ((m = displayRe.exec(content))) {
      layouts.push(m[1])
    }
    while ((m = justifyRe.exec(content))) {
      alignments.push(`justify-content:${m[1]}`)
    }
    while ((m = alignRe.exec(content))) {
      alignments.push(`align-items:${m[1]}`)
    }
  }
  return {
    layouts: uniqueStrings(layouts),
    alignments: uniqueStrings(alignments),
    maxDepth,
    nodeCount,
  }
}

/**
 * 从产物 Vue 文件中提取实际挂载的资源 data-section-id（2026-09-28 · resourceMount 维度）
 *
 * 根因：resource-dom-mapping.json 定义了每个背景图应挂载的 figmaNodeId，
 * 但 LLM 生成代码时可能把背景图挂到错误的元素上（data-section-id 不匹配）。
 * 此前质量评分只检查颜色/间距/字体/圆角/结构，完全无法识别这种挂载错误。
 *
 * @param {Array} files - collectGeneratedFilesFromDir 返回的文件列表
 * @returns {Set<string>} - 所有 data-section-id 值的集合
 */
/**
 * 提取 SFC 中所有**最外层** `<template>` 块的内容（depth 配平扫描）
 *
 * 🔴 2026-11-02 修复（实证 59 目录 / 324 条挂载假失配，如 c-aiot-dpjh-bsjd-* 系列
 * base 0/6 → 6/6）：此前用非贪婪 `/<template[^>]*>([\s\S]*?)<\/template>/` 提取，
 * 而产物的 `<base-panel><template #header-right>…` 是**常态**结构 ⇒ 提取在**第一个内层
 * `</template>`** 处截断（实测单文件 5015 → 98 字符），根级 section 的 data-section-id
 * 全落在被截掉的尾部 ⇒ resourceMount 维度对**已正确挂载**的产物也恒判未挂载。
 *
 * 实现：① 先剥 script/style（其中字符串可能含 `</template>` 干扰）；② 按
 * `<template` / `</template>` 嵌套深度配平，只收 depth 0→1 的最外层块；
 * ③ 自闭合 `<template ... />` 不计数；④ 未闭合（产物被截断）时容错收剩余内容。
 */
function extractRootTemplateBlocks(content) {
  const src = String(content || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
  const blocks = []
  const tagRe = /<\/?template\b/gi
  let depth = 0
  let start = -1
  let m
  while ((m = tagRe.exec(src))) {
    if (!m[0].startsWith('</')) {
      const gt = src.indexOf('>', m.index)
      if (gt < 0) break
      const selfClosing = src.slice(m.index, gt).trimEnd().endsWith('/')
      if (depth === 0 && !selfClosing) start = gt + 1
      if (!selfClosing) depth++
      tagRe.lastIndex = gt + 1
    } else {
      if (depth > 0) depth--
      if (depth === 0 && start >= 0) {
        blocks.push(src.slice(start, m.index))
        start = -1
      }
    }
  }
  // 容错：未闭合时把剩余内容也收进来（避免因产物截断而整块丢失）
  if (start >= 0 && depth > 0) blocks.push(src.slice(start))
  return blocks
}

export function extractActualResourceMounts(files = []) {
  const sectionIds = new Set()
  const sectionIdRe = /data-section-id\s*=\s*["']([^"']+)["']/gi

  for (const f of files) {
    const content = String(f?.content || '')
    const p = String(f?.path || '')
    // 只扫描 .vue 文件的 <template> 块
    if (!/\.vue$/i.test(p)) continue

    let templateContent = ''
    for (const block of extractRootTemplateBlocks(content)) {
      templateContent += block + '\n'
    }
    if (!templateContent) continue

    sectionIdRe.lastIndex = 0
    let m
    while ((m = sectionIdRe.exec(templateContent))) {
      sectionIds.add(m[1])
    }
  }

  return sectionIds
}

/**
 * 资源挂载维度评分（2026-09-28 · resourceMount 维度）
 *
 * 对比 resource-dom-mapping.json 中期望的 figmaNodeId 与产物中实际的 data-section-id。
 * 只对 bgRole 或 backgroundImage 类型的资源进行检查。
 *
 * @param {Array|null} resourceMapping - resource-dom-mapping.json 内容
 * @param {Set<string>} actualSectionIds - extractActualResourceMounts 返回的集合
 * @returns {{ scored: boolean, score: number|null, expected: number, matched: number, missed: Array, unanchored?: Array, reason?: string }}
 *   - expected：**可判定**的挂载条目数（已剔除 class 锚/无锚的不可判定条目）
 *   - unanchored：被剔除的不可判定条目（无法确定期望挂载目标，判据不成立）
 *   - 若全部条目都不可判定 ⇒ scored:false（维度不进等权平均，避免假 0 分）
 */
export function scoreResourceMount(resourceMapping, actualSectionIds) {
  if (!Array.isArray(resourceMapping) || resourceMapping.length === 0) {
    return { scored: false, score: null, expected: 0, matched: 0, missed: [] }
  }

  // 过滤出需要检查的背景图挂载条目（bgRole / backgroundImage 用法）
  const bgEntries = resourceMapping.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false
    // 跳过 skipMount 为 true 的条目（如大型容器背景，故意不挂载）
    if (entry.skipMount === true) return false
    // 跳过下载失败的条目（missing），这些本来就无法挂载
    if (entry.downloadStatus === 'missing') return false
    // 只检查有 bgRole 或 usage 含 backgroundImage 的条目
    const hasBgRole = typeof entry.bgRole === 'string' && entry.bgRole.length > 0
    const hasBgImageUsage = typeof entry.usage === 'string' && entry.usage.includes('backgroundImage')
    return hasBgRole || hasBgImageUsage
  })

  if (bgEntries.length === 0) {
    return { scored: false, score: null, expected: 0, matched: 0, missed: [], unanchored: [] }
  }

  // 🔴 2026-11-02 修复（实证 mc-max-1793629839483-bf86ddba）：此前用 entry.figmaNodeId
  // （资源图片**自身**的节点 id，如 48:5909）当 data-section-id 匹配目标，而 mapping 里
  // 真正的挂载目标是 targetDomSelector（如 [data-section-id="43:4893"]）/ ownerSectionId——
  // 资源自身 id 几乎从不出现在产物 DOM ⇒ 背景图挂载正确也恒判 0（该任务三卡全挂对仍 0/3）。
  // 另：shared alias（isSharedAlias，如三张相同统计卡共用一图 deduplicatedFrom=48:5909）的
  // 自身 target/owner section 可能已被归并进主资源的 section（刀53 statrow 归并后
  // 43:4898/43:4903 不复存在）⇒ alias 需回退主资源条目的候选再判。
  const sectionIdFromSelector = (sel) => {
    const m = /\[data-section-id="([^"]+)"\]/.exec(String(sel || ''))
    return m ? m[1] : null
  }
  const primaryByNodeId = new Map()
  for (const e of resourceMapping) {
    if (e && typeof e === 'object' && e.figmaNodeId) primaryByNodeId.set(e.figmaNodeId, e)
  }
  const candidatesFor = (entry, depth = 0) => {
    const candidates = []
    const fromSelector = sectionIdFromSelector(entry.targetDomSelector)
    if (fromSelector) candidates.push(fromSelector)
    if (entry.ownerSectionId) candidates.push(entry.ownerSectionId)
    // shared alias：自身候选全部不存在的场景，回退主资源（去重来源）条目的候选
    if (
      entry.isSharedAlias === true &&
      entry.deduplicatedFrom &&
      depth < 1
    ) {
      const primary = primaryByNodeId.get(entry.deduplicatedFrom)
      if (primary && primary !== entry) {
        for (const c of candidatesFor(primary, depth + 1)) candidates.push(c)
      }
    }
    return [...new Set(candidates.filter(Boolean))]
  }

  // 🔴 2026-11-02 修复（实证 759 条 / 107 目录，如 c-device-monitor-* 系列 14/14 全失配）：
  //   ① **锚点可用性前置过滤**：这批条目的 targetDomSelector 是 **class 选择器**
  //      （如 ".bg-container"）而非 [data-section-id="…"] 形态，且**没有 ownerSectionId**。
  //      class 名由 LLM 自定（targetDomHint 仅是语义提示），无法确定性映射到 data-section-id
  //      ⇒ 这些条目**不可判定**（判据不成立），必须移出分母；否则整维度假 0 分，
  //      在六维等权平均（computeStyleScore:1023）里把 styleScore 直接拉低。
  //   ② **移除 figmaNodeId 兜底**：全量实测该兜底命中 0 次（资源自身 id 从不出现在产物的
  //      data-section-id 上），保留只会把不可判定条目伪装成「可判定且未挂载」。
  const expectedMounts = []
  const unanchored = []
  for (const entry of bgEntries) {
    const candidates = candidatesFor(entry)
    if (candidates.length > 0) {
      expectedMounts.push({ entry, candidates })
    } else {
      unanchored.push({
        figmaNodeId: entry.figmaNodeId || null,
        name: entry.name || null,
        targetDomSelector: entry.targetDomSelector || '(none)',
        reason: `无法确定期望挂载目标（targetDomSelector="${entry.targetDomSelector || ''}" 非 [data-section-id="…"] 形态且无 ownerSectionId）⇒ 不参与评分`,
      })
    }
  }

  if (expectedMounts.length === 0) {
    return {
      scored: false,
      score: null,
      expected: 0,
      matched: 0,
      missed: [],
      unanchored,
      reason: 'no-anchored-mount',
    }
  }

  // 🔴 2026-11-02 后缀容错（实证 90 条，如候选 "48:5798" vs 产物 "48:5798-list"）：
  //   合并列表段会给 section id 加 `-list` 后缀，而 mapping 记录的是原始节点 id
  //   ⇒ 精确比对恒失配。按 `-list` 归一后双向比对（归一后相同的 id 视为同一 section）。
  const normalizeSectionId = (s) => String(s || '').replace(/-list$/i, '')
  const actualByNormalized = new Map()
  for (const a of actualSectionIds) {
    const n = normalizeSectionId(a)
    if (n && !actualByNormalized.has(n)) actualByNormalized.set(n, a)
  }
  const matchSectionId = (candidates) => {
    for (const c of candidates) {
      if (actualSectionIds.has(c)) return c
      const n = actualByNormalized.get(normalizeSectionId(c))
      if (n && n !== c) return n
    }
    return null
  }

  let matched = 0
  const missed = []

  for (const { entry, candidates } of expectedMounts) {
    const hit = matchSectionId(candidates)
    if (hit) {
      matched++
    } else {
      // 未匹配：记录详细信息
      missed.push({
        figmaNodeId: entry.figmaNodeId,
        targetDomSelector: entry.targetDomSelector || '(unknown)',
        name: entry.name || '(unnamed)',
        reason: `背景图 "${entry.name || entry.figmaNodeId || '(unnamed)'}" 期望挂载到 [${candidates.join(' / ')}]，但产物中均未找到`,
      })
    }
  }

  const ratio = matched / expectedMounts.length
  const score = clampScore(ratio * 100)

  return {
    scored: true,
    score,
    expected: expectedMounts.length,
    matched,
    missed: missed.slice(0, 12),
    unanchored,
  }
}

/**
 * 结构维度评分：比较布局类型、对齐方式、层级深度、节点数量比例
 */
/**
 * 结构维度评分：比较布局类型、对齐方式、层级深度、节点数量构成。
 *
 * 🔴 2026-11-03（本轮）三处判据修正，配套「缺什么」明细：
 *   ① `layout` / `alignment` 由「只报 ratio」改为**同时输出差集 missed** ——
 *      这两个子项天然可列：期望集合 − 实际集合 = 缺失的具体 CSS 值，零噪声。
 *   ② `depth` 输出 `diff`（差几层），如实呈现为差值（深度无法列「缺哪一层」）。
 *   ③ **`nodes` 退出分母**（只统计、不计分）—— 见下方长注释。
 *   顶层补 `expected` / `matched` / `missed`，使前端通用明细渲染（读 `dim.missed`）
 *   零改动即可展示，同时修掉 UI 上 `undefined/undefined` 的空分母。
 */
function scoreStructure(expected, actual) {
  if (!expected || typeof expected !== 'object') {
    return { scored: false, score: null, details: {}, expected: 0, matched: 0, missed: [] }
  }
  const details = {}
  const missed = []
  let totalScore = 0
  let scoredDims = 0
  let perfectDims = 0

  // 布局类型匹配（flex/grid）
  const expLayouts = new Set(expected.layouts || [])
  const actLayouts = new Set(actual?.layouts || [])
  if (expLayouts.size > 0) {
    const missing = [...expLayouts].filter((l) => !actLayouts.has(l))
    const layoutMatch = expLayouts.size - missing.length
    const layoutRatio = layoutMatch / expLayouts.size
    details.layout = {
      expected: expLayouts.size,
      matched: layoutMatch,
      ratio: layoutRatio,
      missed: missing,
    }
    for (const l of missing) {
      missed.push({
        value: `display:${l}`,
        kind: 'layout',
        reason:
          l === 'grid'
            ? 'Figma 使用 GRID 网格布局，产物 CSS 未声明 display:grid'
            : `Figma 使用 auto layout，产物 CSS 未声明 display:${l}`,
      })
    }
    totalScore += layoutRatio * 100
    scoredDims++
    if (layoutRatio === 1) perfectDims++
  }

  // 对齐方式匹配
  const expAligns = new Set(expected.alignments || [])
  const actAligns = new Set(actual?.alignments || [])
  if (expAligns.size > 0) {
    const missing = [...expAligns].filter((a) => !actAligns.has(a))
    const alignMatch = expAligns.size - missing.length
    const alignRatio = alignMatch / expAligns.size
    details.alignment = {
      expected: expAligns.size,
      matched: alignMatch,
      ratio: alignRatio,
      missed: missing,
    }
    for (const a of missing) {
      missed.push({
        value: a,
        kind: 'alignment',
        reason: `Figma 主轴/交叉轴对齐为 ${a}，产物 CSS 未声明该对齐`,
      })
    }
    totalScore += alignRatio * 100
    scoredDims++
    if (alignRatio === 1) perfectDims++
  }

  // 层级深度比较（每差 1 层扣 20%）
  if (expected.maxDepth > 0) {
    const actDepth = actual?.maxDepth || 0
    const depthDiff = Math.abs(actDepth - expected.maxDepth)
    const depthRatio = Math.max(0, 1 - depthDiff / 5)
    details.depth = {
      expected: expected.maxDepth,
      actual: actDepth,
      diff: depthDiff,
      ratio: depthRatio,
    }
    if (depthDiff > 0) {
      missed.push({
        value: `嵌套深度：期望 ${expected.maxDepth} 层 / 实际 ${actDepth} 层`,
        kind: 'depth',
        diff: depthDiff,
        unit: '层',
        reason: `产物标签嵌套深度与 Figma 设计树相差 ${depthDiff} 层（${
          actDepth > expected.maxDepth ? '偏深' : '偏浅'
        }）`,
      })
    }
    totalScore += depthRatio * 100
    scoredDims++
    if (depthRatio === 1) perfectDims++
  }

  // 🔴🔴 节点数量（2026-11-03：退出分母，只统计不计分）
  //
  // 根因：`expected.nodeCount`（Figma 全节点）与 `actual.nodeCount`（产物 `<template>`
  //   开标签数）**口径不同源**，硬做比值不是评分而是**恒定惩罚项**——
  //   全库 120 个有 Figma 数据的组件实测：min(1, actual/expected) 均值仅 0.213、
  //   中位 0.195，**满分个数 0/120、落在 0.7~1 带内 0/120**。
  //   即所有组件在该子项都被扣掉约 79 分（折 structure 总分约 19.6 分），
  //   且扣分幅度与产物质量无关：Figma 侧过半是纯矢量装饰（VECTOR/ELLIPSE/RECTANGLE），
  //   产物侧由 CSS 背景 / 伪元素 / 内联 SVG 承载、不产生独立标签。
  //
  // 为何不改口径而是退出分母（两条备选口径均已实测排除）：
  //   · 「仅数 Figma 容器节点」→ 全库均值 0.627、满分 20/120，仍偏低；
  //     因 Figma GROUP 在产物中常被扁平化（不产生包装 DOM），比值低不代表缺 DOM。
  //   · 「仅数带 auto layout 的容器」→ 均值 0.993、**满分 116/120**，
  //     恒满分 = 零区分力，等于把一个子项白送分。
  //   两条路都不成立 ⇒ 按本仓守则「**口径不同源即不得进入分母**」（同 a 改动守则），
  //   本项不计分，但**完整保留构成明细**（details.nodes），让「缺什么 DOM」可被人工核对。
  if (expected.nodeCount > 0) {
    const actNodes = actual?.nodeCount || 0
    details.nodes = {
      scored: false, // 🔴 不参与 structure 等权平均
      expected: expected.nodeCount,
      actual: actNodes,
      ratio: Math.min(1, actNodes / expected.nodeCount),
      figma: {
        containerCount: expected.containerCount ?? null,
        layoutContainerCount: expected.layoutContainerCount ?? null,
        textNodeCount: expected.textNodeCount ?? null,
        decorNodeCount: expected.decorNodeCount ?? null,
        byType: expected.nodeBreakdown || null,
      },
      note:
        `口径不同源：Figma 全树 ${expected.nodeCount} 节点（容器 ${expected.containerCount ?? '?'} / ` +
        `文本 ${expected.textNodeCount ?? '?'} / 纯矢量装饰 ${expected.decorNodeCount ?? '?'}），` +
        `产物按 <template> 开标签计 ${actNodes} 个。装饰节点在产物侧由 CSS/伪元素/内联 SVG 承载、` +
        `不产生独立标签 ⇒ 本项不计入 structure 平均分，仅作结构完备性参考。`,
    }
  }

  if (scoredDims === 0) {
    return { scored: false, score: null, details, expected: 0, matched: 0, missed }
  }
  const score = clampScore(totalScore / scoredDims)
  return { scored: true, score, details, expected: scoredDims, matched: perfectDims, missed }
}

function scoreDimension(expected, actual, kind) {
  // 🛡️ 2026-09-30 第一层可观测性：expected/actual 可能是带定位的条目（{ value, source }），
  // 兼容两形态（字符串数组 或 对象数组），未带定位的当作裸值。
  const expList = (expected || []).map((e) =>
    typeof e === 'string' ? { value: e, source: null } : e
  )
  const actList = (actual || []).map((a) =>
    typeof a === 'string' ? { value: a, source: null } : a
  )
  const expValues = uniqueStrings(expList.map((e) => e.value))
  const actValues = uniqueStrings(actList.map((a) => a.value))
  if (expValues.length === 0) {
    return { scored: false, score: null, expected: 0, matched: 0, missed: [], fuzzyMatches: [] }
  }
  const missed = []
  const fuzzyMatches = []
  // 🛡️ 2026-11-03 style 色彩分档留痕（**判定仍走 colorsMatch，阈值一个字不改**）：
  // 记录每个期望色「离最近产物色有多远」，把 maxDelta=24 里被吞掉的实质色差摆到明面上。
  // 只统计不参与判定 ⇒ matched/missed/score 逐字不变（复用 P3 装饰叶子的零回归验收法）。
  const colorAudit = kind === 'color'
    ? { maxDelta: 24, expected: 0, exact: 0, near: 0, loose: 0, over: 0, alphaGaps: 0, samples: [] }
    : null
  let matched = 0
  for (const expVal of expValues) {
    const expEntry = expList.find((e) => e.value === expVal) || { value: expVal, source: null }
    // 色彩分档（只留痕，不参与判定；tier 描述最近产物色的距离带）
    if (colorAudit) {
      const det = colorMatchDetail(expVal, actValues)
      colorAudit.expected += 1
      if (det.tier === 'exact') colorAudit.exact += 1
      else if (det.tier === 'near') colorAudit.near += 1
      else if (det.tier === 'loose') colorAudit.loose += 1
      else colorAudit.over += 1
      // 「RGB 命中但 alpha 明显不同」——静态产物无法区分「纯色+opacity 实现」与「透明度写错」
      const alphaGap = det.alphaDiff != null && det.delta <= 24 && det.alphaDiff > 0.08
      if (alphaGap) colorAudit.alphaGaps += 1
      if ((det.tier === 'loose' || alphaGap) && colorAudit.samples.length < 8) {
        colorAudit.samples.push({
          expected: expVal,
          closest: det.actual,
          delta: Math.round(det.delta * 10) / 10,
          alphaDiff: det.alphaDiff == null ? null : Math.round(det.alphaDiff * 100) / 100,
        })
      }
    }
    // 先精确匹配
    const exactOk = kind === 'color' ? colorsMatch(expVal, actValues) : pxMatch(expVal, actValues)
    if (exactOk) {
      matched += 1
      continue
    }

    // P2 集成：精确匹配失败后 fallback 到模糊匹配
    // 🛡️ B1（2026-11-03 可观测性治本）：**「最近产物值」的计算移出 `if (fuzzyOk)`**。
    //   原实现只在模糊命中时才算 bestActualVal，而命中后立刻 `matched += 1` 走掉 ⇒
    //   未命中分支里 bestActualVal 恒 null ⇒ missed[] 的 closestActualValue /
    //   closestActualSource / diff 永远是 null（全量 763 份 component-meta 实测 0 非空），
    //   前端「未匹配 20px：产物最贴近 4px（在 HeaderSub.vue:42）」这条承诺从未兑现。
    //   🔴 只改「算不算」，不改「判不判」：fuzzyOk 判定式、fuzzyMatches 内容、
    //      matched / missed 条数 / score 逐字不变（零回归，按逐字段 diff 验收）。
    let fuzzyOk = false
    let bestActualVal = null
    if (kind === 'color') {
      // 颜色模糊匹配：支持透明度误差 + 更大的颜色容差
      fuzzyOk = colorFuzzyMatch(expVal, actValues, { maxDelta: 32, alphaTolerance: 0.15 })
      // 找到最近的实际颜色，记录距离（**无条件计算**：未命中时也用于定位「差多远」）
      let bestDist = Infinity
      for (const a of actValues) {
        const d = colorDistance(expVal, a)
        if (d < bestDist) {
          bestDist = d
          bestActualVal = a
        }
      }
      if (fuzzyOk) {
        fuzzyMatches.push({ expected: expVal, matchedTo: bestActualVal, distance: Math.round(bestDist * 10) / 10, unit: 'rgb' })
      }
    } else {
      // 🛡️ 2026-09-30 容差沿用 c6b287b 实测过的 (3, 0.15)（放过 +0/-0 取整 + ±3px 噪声，不破坏
      // 「不匹配即判 50」设计契约）。第一层做的是「未匹配项带定位」而非放宽。
      fuzzyOk = numericFuzzyMatch(expVal, actValues, { tolerance: 3, relativeTolerance: 0.15 })
      // 找到最近的实际数值，记录差值（**无条件计算**）
      const expPxVal = parseNumericValue(expVal)
      let bestDiff = Infinity
      for (const a of actValues) {
        const actPxVal = parseNumericValue(a)
        if (actPxVal != null && expPxVal != null) {
          const diff = Math.abs(expPxVal - actPxVal)
          if (diff < bestDiff) {
            bestDiff = diff
            bestActualVal = a
          }
        }
      }
      if (fuzzyOk) {
        fuzzyMatches.push({ expected: expVal, matchedTo: bestActualVal, distance: Math.round(bestDiff * 10) / 10, unit: 'px' })
      }
    }

    if (fuzzyOk) {
      matched += 1
    } else {
      // 🛡️ 2026-09-30 第一层可观测性：missed 项带上 Figma 源 + 候选 actual 源字段
      // 让前端可以展示「未匹配 20px：Figma 来自 slot-流量预测 / 产物最贴近 4px（在 HeaderSub.vue:42）」
      // 同时记录实际值数组里最接近的一个，让用户知道「差多远」（diff）
      const bestActualEntry = bestActualVal
        ? actList.find((a) => a.value === bestActualVal) || { value: bestActualVal, source: null }
        : null
      const diff = (() => {
        if (!bestActualVal) return null
        if (kind === 'color') return Math.round(colorDistance(expVal, bestActualVal) * 10) / 10
        const eV = parseNumericValue(expVal)
        const aV = parseNumericValue(bestActualVal)
        if (eV == null || aV == null) return null
        return Math.round(Math.abs(eV - aV) * 10) / 10
      })()
      missed.push({
        value: expVal,
        expectedSource: expEntry.source || null,
        closestActualValue: bestActualVal,
        closestActualSource: bestActualEntry?.source || null,
        diff,
        unit: kind === 'color' ? 'rgb' : 'px',
      })
    }
  }
  const ratio = matched / expValues.length
  let score = clampScore(ratio * 100)
  const coverage = expValues.length ? matched / expValues.length : 0
  if (coverage < STYLE_COVERAGE_THRESHOLD) score = Math.min(score, STYLE_COVERAGE_CAP)
  const result = {
    scored: true,
    score,
    expected: expValues.length,
    matched,
    missed: missed.slice(0, 12),
    fuzzyMatches: fuzzyMatches.slice(0, 20),
  }
  // 🛡️ 2026-11-03：色彩分档只挂在 color 维度（其余维度 colorAudit=null 不挂）
  if (colorAudit) result.colorAudit = colorAudit
  return result
}

/**
 * 六维等权：color / spacing / font / radius / structure / resourceMount。
 * 无任何期望 → null（不是 0，也不是 100）。
 * 某维无期望 → unscored，不进平均。
 *
 * resourceMount 维度（2026-09-28）：检查背景图是否挂载到正确的 data-section-id 元素。
 * 通过 opts.resourceMountResult 传入（由 scoreComponentDir 预先计算）。
 */
export function computeStyleScore(expected, actual, opts = {}) {
  if (!expected || typeof expected !== 'object') {
    return { score: null, reason: 'no-expected', coverage: 0, dimensions: {}, diffs: [] }
  }

  // 检测产物是否使用变量化字体
  const fontUsesVariable = actual?.fontUsesVariable === true

  // 🛡️ 2026-09-30 第一层可观测性：
  //   - 优先用 opts.expectedWithLocation（带 Figma 节点定位的期望值对象数组），
  //     让 scoreDimension 的 missed 能带上 expectedSource（图 1 链路：Figma 节点 / path / type）。
  //   - 字符串版 expected 兼容旧调用方（向后兼容）。
  //   - actual 一律从 opts.actualWithLocation 拿（带产物文件行号定位），没有时退回到裸字符串数组。
  const expectedColored = opts.expectedWithLocation || expected
  const actualColored = opts.actualWithLocation || actual

  const dims = {
    color: scoreDimension(expectedColored.color, actualColored?.color, 'color'),
    spacing: scoreDimension(expectedColored.spacing, actualColored?.spacing, 'px'),
    font: fontUsesVariable
      ? { scored: true, score: 100, expected: expectedColored.font?.length || 0, matched: expectedColored.font?.length || 0, missed: [], fuzzyMatches: [], variableAdapted: true }
      : scoreDimension(expectedColored.font, actualColored?.font, 'px'),
    radius: scoreDimension(expectedColored.radius, actualColored?.radius, 'px'),
  }
  // 结构维度单独处理（需要结构提取结果）
  if (expected.structure || actual?.structure) {
    dims.structure = scoreStructure(expected.structure, actual?.structure)
  }
  // 资源挂载维度（2026-09-28）：由 scoreComponentDir 预先计算后传入
  if (opts?.resourceMountResult) {
    dims.resourceMount = opts.resourceMountResult
  }
  const scored = Object.values(dims).filter((d) => d.scored)
  if (scored.length === 0) {
    return {
      score: null,
      reason: 'no-expected',
      coverage: 0,
      dimensions: dims,
      diffs: [],
      ...(dims.color?.colorAudit ? { colorAudit: dims.color.colorAudit } : {}),
    }
  }
  const avg = scored.reduce((s, d) => s + d.score, 0) / scored.length
  const expectedTotal = scored.reduce((s, d) => s + (d.expected || 0), 0)
  const matchedTotal = scored.reduce((s, d) => s + (d.matched || 0), 0)
  const coverage = expectedTotal ? matchedTotal / expectedTotal : 0
  let score = clampScore(avg)
  if (coverage < STYLE_COVERAGE_THRESHOLD) score = Math.min(score, STYLE_COVERAGE_CAP)
  const diffs = []
  for (const [name, d] of Object.entries(dims)) {
    if (!d.scored) continue
    for (const miss of d.missed || []) {
      if (name === 'resourceMount') {
        // resourceMount 的 missed 是对象，直接展开
        diffs.push({ dimension: name, expected: miss.figmaNodeId, actual: miss.reason || '(unmatched)' })
      } else {
        // 🛡️ 2026-09-30 第一层可观测性：diffs 直接透传 missed 对象（含 expectedSource / closestActualSource）
        // 让前端 QualityScoreAdminButton.vue 等位置拿到 Figma 节点 ID / 产物 file:line。
        diffs.push({ dimension: name, ...miss, actual: '(unmatched)' })
      }
    }
  }
  return {
    score,
    reason: 'ok',
    coverage,
    dimensions: dims,
    diffs: diffs.slice(0, 40),
    // 🛡️ 2026-11-03 style 色彩分档留痕（顶层便捷出口；完整对象亦见 dimensions.color.colorAudit）。
    // 用途：把「maxDelta=24 兜住的实质色差」「RGB 命中但 alpha 缺口」直接摆到 quality.style 上，
    // 不改任何判定与分数（与 P3 装饰叶子分账同策略）。
    ...(dims.color?.colorAudit ? { colorAudit: dims.color.colorAudit } : {}),
  }
}

export function collectGeneratedFilesFromDir(componentDir) {
  const files = []
  if (!componentDir || !existsSync(componentDir)) return files
  const walk = (dir) => {
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue
      const abs = join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(abs)
        continue
      }
      if (!TEXT_EXTS.has(extname(ent.name))) continue
      try {
        const st = statSync(abs)
        if (st.size > 1_500_000) continue
        files.push({
          path: relative(componentDir, abs).replace(/\\/g, '/'),
          content: readFileSync(abs, 'utf8'),
        })
      } catch {
        /* skip unreadable */
      }
    }
  }
  walk(componentDir)
  return files
}

function loadJsonIfExists(abs) {
  try {
    if (!existsSync(abs)) return null
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch {
    return null
  }
}

export function findFigmaNodeData(componentDir) {
  // 真实落盘名是 figma-node-data.json（见 figma-connector._saveFigmaCache
  // 与 vue3.service 的 .mc-gen/cache 写入），此前候选只写了 figma-node.json，
  // 导致已落盘组件的 styleScore 全部误判为 null。真实名放首位。
  const candidates = [
    join(componentDir, '.mc-gen', 'cache', 'figma-node-data.json'),
    join(componentDir, '.mc-gen', 'figma-node-data.json'),
    join(componentDir, '.cache', 'figma-node-data.json'),
    join(componentDir, 'figma-node-data.json'),
    // 兼容历史/手工落盘的简写名
    join(componentDir, '.mc-gen', 'cache', 'figma-node.json'),
    join(componentDir, '.mc-gen', 'figma-node.json'),
    join(componentDir, '.cache', 'figma-node.json'),
    join(componentDir, 'figma-node.json'),
  ]
  for (const p of candidates) {
    const json = loadJsonIfExists(p)
    if (json && typeof json === 'object') return json
  }
  return null
}

/**
 * ️ 加载 resource-dom-mapping（2026-09-22 · CODE-025-WARN 根治）。
 *
 * 根因：scoreComponentDir() 此前从未加载 resource-dom-mapping.json，
 * 导致 CodeStructureValidator.validate() 用空 mapping 跑 CODE-025 检查 →
 * 所有资源变量引用都被判为 R3（orphan imports）→ 全部误报。
 *
 * @param {string} componentDir
 * @returns {Array|null}
 */
export function findResourceDomMapping(componentDir) {
  const candidates = [
    join(componentDir, '.mc-gen', 'resource-dom-mapping.json'),
    join(componentDir, '.mc-gen', 'cache', 'resource-dom-mapping.json'),
    join(componentDir, 'resource-dom-mapping.json'),
  ]
  for (const p of candidates) {
    const json = loadJsonIfExists(p)
    if (Array.isArray(json)) return json
  }
  return null
}

export function mergeQualityIntoMeta(prevMeta, qualityV1) {
  const prev = prevMeta && typeof prevMeta === 'object' ? prevMeta : {}
  const prevQuality = prev.quality && typeof prev.quality === 'object' ? prev.quality : {}
  return {
    ...prev,
    quality: {
      ...prevQuality,
      ...qualityV1,
    },
  }
}

export function persistQualityScore(componentDir, qualityV1) {
  const metaPath = join(componentDir, 'component-meta.json')
  const prev = loadJsonIfExists(metaPath) || {}
  const next = mergeQualityIntoMeta(prev, qualityV1)
  writeFileSync(metaPath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/**
 * Vue3 组件识别（判据：是否含微码专属的 declare.json）。
 *
 * 实测（2026-09-19）：
 *   - 微码产物必有 declare.json（componentId/componentName/themeConfig 等），**必有** common.less；
 *   - Vue3 产物**从不**生成 declare.json，也**可能有** common.less。
 * 故不能以 common.less 判断，唯一可靠判据是 declare.json 的有无。
 * 用途：评分时把 target 切到 vue3，避免微码专有规则（CODE-008 手写图片 import /
 * CODE-003 common.less 前缀 / CODE-009 declare.json 标题）误扣 Vue3 分数。
 */
export function detectComponentType(componentDir, files) {
  const hasMicrocodeDeclare = files.some((f) => (f.path || '').endsWith('declare.json'))
  return hasMicrocodeDeclare ? 'microcode' : 'vue3'
}

/**
 * 查找组件目录中的 theme-vars.less（2026-09-28 P2 集成）
 * 
 * 优先级：resources/styles/themes/theme-vars.less > resources/theme-vars.less
 */
export function findThemeVarsPath(componentDir) {
  const candidates = [
    join(componentDir, 'resources', 'styles', 'themes', 'theme-vars.less'),
    join(componentDir, 'resources', 'theme-vars.less'),
    join(componentDir, 'theme-vars.less'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * 对已落盘组件做 v1 离线评分（不调 LLM、不截图）。
 * styleScore 无 Figma 期望时为 null。
 *
 * 评分用确定性 L0-B：Vue3 组件传 target='vue3' 跳过微码专有规则；
 * 但 CODE-008（手写图片 import 应交给 injectResourceImports）在校验器里未做 Vue3 分流，
 * 对 Vue3 一律误报，故此处对 Vue3 显式剔除 CODE-008 假阳性。
 */
export async function scoreComponentDir(componentDir, opts = {}) {
  const files = collectGeneratedFilesFromDir(componentDir)
  const declareJson = loadJsonIfExists(join(componentDir, 'declare.json')) || {}
  const componentId =
    opts.componentId ||
    (typeof declareJson.componentId === 'string' && declareJson.componentId) ||
    ''

  // 目录级 target：显式 opts.target 优先，否则自动识别
  const target = opts.target || detectComponentType(componentDir, files)
  const isVue3 = target === 'vue3'

  // 🛡️ 加载 resource-dom-mapping（2026-09-22 · CODE-025-WARN 根治）
  const resourceMapping = opts.resourceMapping || findResourceDomMapping(componentDir)

  let l0b = { pass: true, blockCount: 0, issues: [] }
  let l0bError = null
  try {
    const { CodeStructureValidator } = await import('../validators/code-structure-validator.js')
    l0b = CodeStructureValidator.validate(files, componentId, {
      ...(opts.l0bOptions || {}),
      target: isVue3 ? 'vue3' : undefined,
      // 🔴🔴 F1（2026-11-03 治本）：mapping 事实源**键名失配**修正。
      //   校验器内部有**两个**键名，各管一片检查，必须同时传：
      //     · `resourceDomMapping` —— 事实源九处：:172 根背景期望 / :1280+ CODE-008 /
      //       :1535 RESOURCE-001+002 / :1687 CODE-014 面板资源豁免 / :1952 资源变量归属分级 /
      //       :2083 整块背景宿主 / :2182 CODE-018 契约改写豁免 / :2213 P1-1 节点级尺寸绑定 /
      //       :2229 detectMissingPropsWiring
      //     · `resourceMapping` —— :3318 幽灵引用体检（读的就是这个旧键名）
      //   历史事故（c-vehicle-monitor-c46c2631，11:42:50）：此前只传 `resourceMapping`
      //   ⇒ 九处全部拿到空 mapping ⇒ `validResourceFiles` 空集 ⇒ **每条资源 import 恒判
      //   CODE-008 WARN**（实测 12 条假阳性，与日志「规范 12」逐数吻合）⇒ quality-fix 的
      //   stripLlmResourceImports 全量删除 12 行 import ⇒ CODE-025 BLOCK。
      //   注：2026-09-22「CODE-025-WARN 根治」只加了 findResourceDomMapping() 加载，
      //   键名一直没对上，那次的修复从未真正生效。
      //   A/B 对照（真实产物 + 真实 mapping）：传 resourceMapping → CODE-008×12；
      //   传 resourceDomMapping → CODE-008×0（同时首次暴露 RESOURCE-001）。
      resourceMapping,
      resourceDomMapping: resourceMapping,
    })
    // Vue3 手写图片 import 是合法写法，剔除 CODE-008 假阳性（校验器未做 Vue3 分流）
    if (isVue3 && Array.isArray(l0b.issues)) {
      l0b = {
        ...l0b,
        issues: l0b.issues.filter((i) => {
          const id = i?.id || ''
          // CODE-008：Vue3 允许手写资源 import
          if (id === 'CODE-008') return false
          // CODE-025-WARN：Vue3 允许手写资源 import，R3 orphan imports 不是问题
          if (id === 'CODE-025-WARN') return false
          return true
        }),
      }
    }
  } catch (err) {
    l0bError = err?.message || String(err)
    l0b = {
      pass: false,
      blockCount: 1,
      issues: [{ id: 'L0B-LOAD', severity: 'BLOCK', message: `L0-B 无法执行：${l0bError}` }],
    }
  }

  const spec = computeSpecScore(l0b)
  const figma = opts.figmaNodeData || findFigmaNodeData(componentDir)
  // 🛡️ 档B 接线（2026-11-03）：成品位图资源节点 ⇒ 像素类属性（fill 颜色 / 圆角）不审。
  //   判据单一来源 = 上面已加载的 `resourceMapping`（`.mc-gen/resource-dom-mapping.json`）
  //   的 `downloadStatus === 'success'`，与挂载侧同源；extractor 侧保持纯函数（收 id 集合）。
  const exemptPixelNodeIds = collectExportedResourceNodeIds(resourceMapping)
  // 🛡️ 档A 接线（2026-11-03 同源化）：面板壳节点（生成侧 `skipMount === true`）⇒ 圆角不审。
  //   判据单一来源 = 上面已加载的 `resourceMapping`，与 `scoreResourceMount` 同字段同语义。
  const panelShellNodeIds = collectPanelShellNodeIds(resourceMapping)
  // 🛡️ 2026-09-30 第一层可观测性：带定位版本，让 missed 项能展示「Figma 节点 / 产物文件 + 行号」
  const expectedStyleWithLoc = extractExpectedStyleLiteralsWithLocation(figma, {
    exemptPixelNodeIds,
    panelShellNodeIds,
  })
  const expectedStyle = stringifyExpectedLiterals(expectedStyleWithLoc) // 向后兼容的字符串版
  const expectedStructure = extractExpectedStructure(figma)

  // P2 集成（2026-09-28）：先解析 Less 变量再提取样式字面量
  // 根因：产物用 @color-primary 等变量，Figma 期望 #559eff 字面量，评分只做字面量比较
  // 解法：从 theme-vars.less + common.less 解析变量链，替换后再提取
  let actualStyle
  let actualStyleWithLoc // 🛡️ 带定位版本：actual 字面量来自哪个文件/行/类
  let varResolutionInfo = null
  // 🛡️ P3（2026-11-03）：变量替换后的产物文件单独留存，供装饰叶子落地判定复用同一份
  // 「归一化后字面量」——否则判定会拿未解析的 @color-xxx 去比 Figma 真值色 ⇒ 全部假 missing。
  let resolvedFilesForJudge = files
  try {
    const themeVarsPath = findThemeVarsPath(componentDir)
    const varMap = resolveStyleVariables(files, themeVarsPath)
    if (varMap.size > 0) {
      // 把变量替换到文件内容中
      const resolvedFiles = files.map((f) => ({
        ...f,
        content: substituteVariables(f.content, varMap),
      }))
      resolvedFilesForJudge = resolvedFiles
      // 🛡️ 2026-09-30：两个版本都产，外部 API 默认看字符串版（向后兼容），
      // 但 qualityV1 输出同时携带 WithLocation 完整信息，让前端能渲染 Figma/产物双向定位。
      actualStyleWithLoc = extractDeclaredStyleLiteralsWithLocation(resolvedFiles)
      actualStyle = stringifyDeclaredLiterals(actualStyleWithLoc)
      varResolutionInfo = {
        enabled: true,
        varCount: varMap.size,
        themeVarsPath: themeVarsPath || null,
      }
    } else {
      // 没有变量，走原路径
      actualStyleWithLoc = extractDeclaredStyleLiteralsWithLocation(files)
      actualStyle = stringifyDeclaredLiterals(actualStyleWithLoc)
      varResolutionInfo = { enabled: false, varCount: 0 }
    }
  } catch (err) {
    // 变量解析失败时降级到原路径（fail-open）
    console.warn('[quality-score-v1] 变量解析失败，降级到字面量提取:', err.message)
    actualStyleWithLoc = extractDeclaredStyleLiteralsWithLocation(files)
    actualStyle = stringifyDeclaredLiterals(actualStyleWithLoc)
    varResolutionInfo = { enabled: false, varCount: 0, error: err.message }
  }

  const actualStructure = extractActualStructure(files)

  // 🛡️ P3（2026-11-03）：装饰叶子落地判定。
  // 为什么放在这里而不是 visual-parser：装饰叶子被覆盖率判定 `ignored`（正确：无语义名不该算缺失），
  // 但「豁免是否成立」需要产物存在才能验证。评分阶段产物已落盘 ⇒ 这是唯一能判定的时机。
  // 判据：SOLID 取 RGB±3 ∧ alpha±0.08；GRADIENT 取全部不透明 stop 的 RGB±3；
  // <12px VECTOR 图标与全透明渐变视为判据盲区显式豁免。几何通道已实测零区分力，不采用。
  let decorLeavesResult = null
  try {
    decorLeavesResult = judgeDecorLeaves(figma, resolvedFilesForJudge)
  } catch (err) {
    // fail-open：判定失败不得影响 v1 评分（与 resourceMount 同策略）
    console.warn('[quality-score-v1] 装饰叶子判定失败（非阻断）:', err.message)
  }

  // resourceMount 维度（2026-09-28）：检查背景图是否挂载到正确的 data-section-id
  let resourceMountResult = null
  try {
    const actualSectionIds = extractActualResourceMounts(files)
    resourceMountResult = scoreResourceMount(resourceMapping, actualSectionIds)
  } catch (err) {
    console.warn('[quality-score-v1] resourceMount 评分失败:', err.message)
  }

  // 合并样式和结构到 expected/actual 对象
  const expected = { ...expectedStyle, structure: expectedStructure }
  const actual = { ...actualStyle, structure: actualStructure }
  // 🛡️ 2026-09-30 第一层可观测性：把带定位的 expected / actual 一起传给 computeStyleScore，
  // 让 scoreDimension 的 missed 项能带上 Figma 节点 ID / 产物 file:line（前后端可定位）。
  // 同时把两份原始数据塞到 quality.styleV1 上，让前端 QualityScoreAdminButton 直接渲染 Figma/产物双向定位。
  const style = computeStyleScore(expected, actual, {
    resourceMountResult,
    expectedWithLocation: {
      color: expectedStyleWithLoc.color,
      spacing: expectedStyleWithLoc.spacing,
      font: expectedStyleWithLoc.font,
      radius: expectedStyleWithLoc.radius,
    },
    actualWithLocation: {
      color: actualStyleWithLoc.color,
      spacing: actualStyleWithLoc.spacing,
      font: actualStyleWithLoc.font,
      radius: actualStyleWithLoc.radius,
      fontUsesVariable: actualStyleWithLoc.fontUsesVariable,
    },
  })

  // 查找截图文件（用于设计图对比）
  //  - screenshots：产物渲染截图（前端「产物预览」框）
  //  - designImages：Figma 真值图 mc-preview.png（前端「设计图（Figma）」框）
  const screenshots = findScreenshotFiles(componentDir)
  const designImages = findDesignImage(componentDir)

  const quality = {
    version: QUALITY_SCORE_V1_VERSION,
    specScore: spec.score,
    styleScore: style.score,
    spec,
    style,
    scoredAt: new Date().toISOString(),
    fileCount: files.length,
    excluded: {
      qualityScore: 'adversarial LLM，不进 v1 总分',
      visualSimilarity: 'Vision LLM，不进 v1 总分',
      visual002: '直方图，不进 v1 总分',
    },
    // 🛡️ P3（2026-11-03）：装饰叶子分账（不进 v1 总分）。
    // 覆盖率把无语义名叶子判 `ignored` 是**正确豁免**（Phase 6 全量实测：1600 条中 1553 条确实已落地，97.06%），
    // 但豁免本身不可见 ⇒ 缺陷被藏起来。这里把「豁免是否成立」变成可读明账：
    //   verified = 产物里确实找得到该颜色（落地证据）；unverified = 找不到（真缺陷候选）；
    //   exempt = 判据盲区（<12px VECTOR 图标 / 全透明渐变 / 仅描边 / 未知填充类型），显式标注不猜。
    // 不参与 specScore/styleScore 计算——与 excluded 同策略，避免二次扣分。
    ...(decorLeavesResult ? { decorLeaves: decorLeavesResult } : {}),
    // 🛡️ 2026-09-30 第一层可观测性：把带定位的期望/实际一并下发到前端，
    //   让 QualityScoreAdminButton 能渲染「未匹配 20px：Figma 来自 slot-流量预测 (id=83:30, FRAME) /
    //   产物最贴近 4px（package/components/HeaderSub.vue:42, .c-x-slot 类）」。
    //   这是 QualityScore 面板定位的根本：原 missed 只是字符串，无法告诉用户「具体是哪个节点/哪行」，
    //   现在通过 expectedSource / actualSource 把前后端两侧的图谱连起来。
    expectedWithLocation: expectedStyleWithLoc,
    actualWithLocation: {
      color: actualStyleWithLoc.color,
      spacing: actualStyleWithLoc.spacing,
      font: actualStyleWithLoc.font,
      radius: actualStyleWithLoc.radius,
      fontUsesVariable: actualStyleWithLoc.fontUsesVariable,
    },
    ...(l0bError ? { l0bError } : {}),
    ...(varResolutionInfo ? { varResolutionInfo } : {}),
    ...(screenshots.length > 0 ? { screenshots } : {}),
    ...(designImages.length > 0 ? { designImages } : {}),
  }

  // 🛡️ P3（2026-11-03）：未落地装饰叶子出 WARN，让豁免不再沉默。
  // 只告警不扣分：判据是「颜色字面量缺失」，单凭颜色不能断定视觉缺陷（可能由 svg/背景图实现），
  // 故不阻断、不改分数，仅把 44/1600（2.75%）这类结构性盲区摆到日志面上。
  if (decorLeavesResult && decorLeavesResult.unverified.count > 0) {
    const unverifiedPct = Math.round(decorLeavesResult.unverified.rate * 10000) / 100
    console.warn(
      `[quality-score-v1] 装饰叶子未落地: ${decorLeavesResult.unverified.count}/${decorLeavesResult.total} (${unverifiedPct}%)`,
      {
        componentId,
        samples: decorLeavesResult.unverified.items.slice(0, 5).map((i) => ({
          id: i.id,
          type: i.type,
          size: `${i.w}x${i.h}`,
          reason: i.reason,
        })),
      },
    )
  }

  // 🛡️ 2026-11-03 style 色彩分档留痕：把「被 maxDelta=24 兜住的实质色差 / alpha 缺口」摆到日志面上。
  // 只告警不改分：单凭 RGB 距离无法断定缺陷（产物可能用纯色+opacity 或图层混色实现，静态产物分不开），
  // 故与 P3 装饰叶子同策略——先让假匹配可见，阈值调整另行立项，绝不在本轮放水或收紧判定。
  if (style?.colorAudit && (style.colorAudit.loose > 0 || style.colorAudit.alphaGaps > 0)) {
    console.warn(
      `[quality-score-v1] 色彩松匹配留痕: loose=${style.colorAudit.loose} alphaGaps=${style.colorAudit.alphaGaps} / expected=${style.colorAudit.expected} (maxDelta=${style.colorAudit.maxDelta})`,
      { componentId, samples: style.colorAudit.samples.slice(0, 3) },
    )
  }

  // 🛡️ 2026-11-03 structure 明细留痕（真机计数行）：让「结构究竟缺什么」在服务日志里可直接核对，
  // 不必只依赖前端界面——按本仓守则，判定类改动必须留下真机可读的计数行。
  // 只记录不改分：layout/alignment 差集与 depth 差值如实输出；nodes 已退出分母（口径不同源），
  // 仅登记 Figma 全树构成 vs 产物开标签计数，供人工判断「缺了哪些 DOM」。
  const structDim = style?.dimensions?.structure
  if (structDim?.scored) {
    const nodesDetail = structDim.details?.nodes
    console.log(
      `[quality-score-v1] 结构明细: 子项 ${structDim.matched}/${structDim.expected} 满分 · 缺失 ${structDim.missed.length} 项 · nodes(不计分) figma=${nodesDetail?.expected ?? '-'} 产物=${nodesDetail?.actual ?? '-'}`,
      {
        componentId,
        missed: structDim.missed.slice(0, 5).map((m) => m.value),
      },
    )
  }

  if (opts.persist !== false) persistQualityScore(componentDir, quality)
  return { componentDir, componentId, quality }
}
