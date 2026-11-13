import less from 'less'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { dirname, join, normalize, relative } from 'path'

// ⚠️ 本模块**刻意不** import config/backend-root.js（R0-8，2026-09-01）。
// 原因：backend-root.js 使用 `import.meta`，而 jest 以 CJS 模式 transform，
// `import.meta` 在 CJS 下是语法错误（已实测：cannot use 'import.meta' outside a module）。
// 一旦本文件在模块作用域静态依赖它，所有传递依赖本文件的测试套件都会整体加载失败——
// 实锤 code-healer.spec.ts 的 40 个用例由 PASS 变成 0 用例执行（本文件被 code-healer.js
// 以 healMissingLessBraces 引入）。
// 本门禁的 outputPath 由调用方显式传入（见 LessCompileGate.validate 注释），无需全局根路径。
// 若将来确实需要全局路径，**必须**改造成惰性动态 import，禁止恢复模块作用域静态依赖。

const SHARED_LESS = 'resources/styles/index.less'

function normalizePath(filePath = '') {
  return String(filePath).replaceAll('\\', '/')
}

export function collectLessCompileFiles(outputPath) {
  const files = {}
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.cache', '.checkpoint', '.mc-gen'].includes(name)) continue
      // 🛡️ 2026-11-11：跳过存量修复脚本留下的备份目录（`scripts/repair-less-artifacts.mjs`）
      //   否则门禁会把备份也当产物编译/修复 ⇒ 备份失去「原始现场」价值。
      if (name.startsWith('.less-heal-backup')) continue
      const fullPath = join(dir, name)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (name.endsWith('.vue') || name.endsWith('.less')) {
        const relativePath = normalizePath(relative(outputPath, fullPath))
        files[relativePath] = readFileSync(fullPath, 'utf-8')
      }
    }
  }
  walk(outputPath)
  return files
}

/**
 * 判断某行是否为「看起来像 CSS 代码」的行（而非注释续行）。
 * 用于识别「只开不闭」的块注释：若一行以斜杠星号开头、不含对应的星号斜杠结束符，
 * 且紧随其后的行是真实 CSS，则该注释几乎可以确定是被作者遗漏闭合的单行注释（如装饰性横幅）。
 */
function isCssLikeLine(line) {
  const t = String(line || '').trim()
  if (!t) return false
  return (
    /^[\.#{@[]/.test(t) || // 选择器：.class / #id / @media / [attr]
    /^[\}\{]/.test(t) || // 块结束 / 块开始
    /^[a-zA-Z_-][\w-]*\s*\{/.test(t) || // 标签选择器带 {
    t.startsWith('//') // 行注释（绝不可能是块注释续行）
  )
}

/**
 * 自动补全「只开不闭」的块注释。
 * 规则：遍历每一行，若某行以斜杠星号开头但不含星号斜杠结束符，则向后做小窗口扫描：
 * - 途中遇到星号斜杠闭合符 → 注释实际已闭合，不干预；
 * - 途中遇到第一个「CSS 代码行」→ 注释从未闭合（横幅正文吞掉了后续规则），
 *   在该 CSS 行前插入独立闭合行；
 * - 窗口（8 行）内无 CSS 行 → 不动（边界不可确认，保守留给门禁 BLOCK）。
 * 说明：LESS 块注释为 C 风格（不嵌套），未闭合的斜杠星号会一直吞到下一个闭合符才被迫闭合，
 * 从而把后续本应生效的 CSS 规则暴露为顶层裸 token —— 这正是 LESS-COMPILE-001
 * 「Unrecognised input. Possibly missing opening '{'」的常见根因。
 * 🛡️ 治本扩展（2026-09-29 · mc-max-1790696917698-bf3612dc 实锤）：
 *   旧版只看「下一行」是否为 CSS 行，对「横幅正文 1-N 行 + 空行 + 首个规则」形态
 *   （横幅杠线 / 中文标题 / 空行 / `.c-xxx {`）恒不命中 ⇒ 自愈恒空转 ⇒ 门禁阻断无人能消。
 *   窗口扫描对正常多行块注释（续行非 CSS）零影响；正文行里出现闭合符即认定闭合。
 */
function healUnclosedLessComments(styleSource = '') {
  const lines = String(styleSource || '').split('\n')
  let changed = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.includes('/*')) continue
    if (line.includes('*/')) continue
    // 小窗口向后扫描：找第一个 CSS 行（注释未闭合证据）或闭合符（已闭合）。
    // 插入后无需额外下标修正：插入行 ' */' 不含 '/*'，外层 i++ 顺序经过时自然跳过，
    // 后续未闭合注释照常被处理（⚠️ 禁止用「已处理下标集合」跳过——splice 使其后
    // 全部行号偏移，会把未处理的注释行误判为已处理，第一处插入后其余全部漏修，
    // bf3612dc 实锤：只修了文件头横幅、图表区横幅漏修）。
    for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
      if (lines[j].includes('*/')) break // 已闭合（多行注释），不干预
      if (isCssLikeLine(lines[j])) {
        // 未闭合：在该 CSS 行前插入独立闭合行（不动正文行，最干净）
        lines.splice(j, 0, ' */')
        changed = true
        break
      }
    }
  }
  return { source: lines.join('\n'), changed }
}

/**
 * 修复 LESS/CSS 中确定性可推断的缺失右大括号。
 *
 * LLM 截断通常表现为：一个规则已有声明但没有 `}`，后面紧接着新的无缩进规则，
 * 或整个文件只在末尾少了若干个 `}`。前一种情况要在新规则前闭合当前块，
 * 否则虽然补到文件末尾也可能把所有后续规则错误嵌套进根容器。
 * 不修复中间缺失且无法确认边界的括号、括号多余、字符串或注释未闭合，避免误改合法 LESS。
 *
 * R0-5（2026-09-01）：导出为单一事实源——code-healer 的 healVueEmbeddedStyleBraces
 * 已废弃本地「剥注释纯计数」实现，改为按 style 块委托本函数（同算法、同作用域）。
 */
export function healMissingLessBraces(styleSource = '') {
  const source = String(styleSource || '')
  const lines = source.split('\n')
  const output = []
  const frames = []
  let quote = ''
  let escaped = false
  let inBlockComment = false
  let inLineComment = false
  let changed = false

  const isTopLevelRule = (line) => {
    const trimmed = line.trim()
    if (!trimmed || line !== line.trimStart()) return false
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('}')) return false
    return /^(?:[.#\w\[]|@(media|supports|container|keyframes|font-face)\b)[^{}]*\{/.test(trimmed)
  }

  for (const line of lines) {
    const current = frames[frames.length - 1]
    if (current?.hasDeclaration && isTopLevelRule(line)) {
      output.push('}')
      frames.pop()
      changed = true
    }

    output.push(line)
    inLineComment = false
    let sawDeclaration = /^\s*[-\w]+\s*:/.test(line) && !/^\s*[.#\w\[\]]+\s*\{/.test(line)

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      const next = line[i + 1]

      if (inLineComment) continue
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false
          i++
        }
        continue
      }
      if (quote) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === quote) quote = ''
        continue
      }
      if (ch === '/' && next === '/') {
        inLineComment = true
        i++
        continue
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true
        i++
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '{') {
        frames.push({ hasDeclaration: sawDeclaration })
        sawDeclaration = false
      } else if (ch === '}') {
        if (frames.length === 0) return { source, changed: false }
        frames.pop()
      }
    }

    if (sawDeclaration && frames.length > 0) {
      frames[frames.length - 1].hasDeclaration = true
    }
  }

  if (quote || inBlockComment || inLineComment) return { source, changed: false }
  if (frames.length > 0) {
    output.push('}'.repeat(frames.length))
    changed = true
  }
  if (!changed) return { source, changed: false }
  return {
    source: output.join('\n'),
    changed: true,
    addedBraces: (output.join('\n').match(/}/g) || []).length - (source.match(/}/g) || []).length,
  }
}

/**
 * 自动补全「声明漏写结尾分号」的 LESS/CSS 语法错误。
 * 背景：LLM 生成的样式常在属性声明后漏写 `;`（如 `background-size: 100% 100%` 紧接下一行
 * `transition: ...`），导致 LESS 编译器把两行拼成一个非法值（"Unrecognised input"），
 * 预览 load-error → RUNTIME-004 硬阻断。
 * 规则：仅对 <style> 块内（或纯 .less/.css 文件整体）、形如 `prop: value`（值非空、不以 ; { } 结尾）
 * 的声明，且其下一行有意义内容为「新声明 / 块结束 / 嵌套选择器 / @规则」时，补 `;`。
 * 对选择器行（.foo / a:hover / & / > / @ 等）、块边界、注释无副作用。
 * 仅在修复后能干净编译时才由调用方写回（与 healUnclosedLessComments 一致的"先验证后写回"策略）。
 */

/**
 * 修复「同行内多个声明被黏连、中间无分号」的漏分号（行级 heal 覆盖不到的情况）。
 * 例：background-size: 100% 100%flex-shrink: 0;  →  background-size: 100% 100%;flex-shrink: 0;
 * 仅当第 2+ 个 `prop:` 前的字符不是合法声明分隔符（空白 / ; { } ( ) / " ' / @ , & > *）时才补 `;`，
 * 以避开 url(data:...) / http:// / content: "a: b" 等合法含冒号的值，避免误伤。
 * 启发式仅"在两个声明之间补 ;"，属恒安全的 CSS 修正。
 */
function fixGluedDeclarationsOnLine(line = '') {
  const trimmed = line.trim()
  if (!/^[\w-][\w-]*\s*:/.test(trimmed)) return line
  const re = /([\w-]+)(\s*):/g
  let out = ''
  let last = 0
  let m
  let count = 0
  const isSep = (ch) =>
    ch === undefined ||
    /\s/.test(ch) ||
    [';', '{', '}', '(', ')', '/', '"', "'", '@', ',', '&', '>', '*'].includes(ch)
  while ((m = re.exec(line))) {
    count++
    if (count >= 2 && !isSep(line[m.index - 1])) {
      out += line.slice(last, m.index) + ';'
      last = m.index
    }
  }
  if (last === 0) return line
  out += line.slice(last)
  return out
}

/**
 * 取第 i 行之后「首个有意义行」的 trim 结果（跳过空行与注释）。
 * 供 `healMissingSemicolons` 判断「当前声明行是否必须补尾分号」。
 */
function nextSignificantLine(lines, i) {
  let j = i + 1
  while (j < lines.length) {
    const nt = lines[j].trim()
    if (nt === '' || nt.startsWith('//') || nt.startsWith('/*') || nt.startsWith('*')) { j++; continue }
    break
  }
  return j < lines.length ? lines[j].trim() : ''
}

/**
 * 判断「下一有意义行」是否要求上一行声明必须以 `;` 收尾。
 * 四种形态：① 新声明 `prop:` ② 「选择器{首声明」（P0-2 新增，与本函数同源自指）
 * ③ 块结束 `}` / 嵌套 `&` ④ @规则。
 * ⚠️ 刻意**不**把 `.#[>` 开头的行判为「需要收尾」——`.5em` / `#fff` 等可能是跨行值续行，
 *    误补 `;` 会把合法多行值切断（fail-safe 优先，宁可漏修不误伤）。
 */
function requiresTrailingSemicolon(next) {
  return (
    /^[\w-][\w-]*\s*:/.test(next) ||
    /^.*\{\s*[A-Za-z-][\w-]*\s*:\s*[^;{}\s]/.test(next) ||
    next.startsWith('}') || next.startsWith('&') || next.startsWith('@')
  )
}

export function healMissingSemicolons(source = '', { sourceType = 'auto' } = {}) {
  const lines = String(source || '').split('\n')
  let changed = false
  const hasStyleTag = /<style\b/i.test(source)
  const looksLikeVueSfc = /<(?:template|script)\b/i.test(source)
  const isVueSfc = sourceType === 'vue' || (sourceType === 'auto' && looksLikeVueSfc)
  // Vue SFC 只允许修复真实 <style> 块；没有 style 的子组件直接跳过，绝不能把 script 当成 LESS。
  if (isVueSfc && !hasStyleTag) {
    return { source: String(source || ''), changed: false }
  }
  // 仅纯 .less/.css 文件允许把全文视为样式上下文。
  let inStyle = sourceType === 'style' || (!isVueSfc && !hasStyleTag)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const open = /<style\b/.test(raw)
    const close = /<\/style>/.test(raw)
    if (open) inStyle = true
    if (!inStyle) { if (close) inStyle = false; continue }

    // 行内黏连修复：background-size: 100% 100%flex-shrink: 0; → ...;flex-shrink: 0;
    const glued = fixGluedDeclarationsOnLine(raw)
    if (glued !== raw) {
      lines[i] = glued
      changed = true
      if (close) inStyle = false
      continue
    }

    const t = raw.trim()
    // 🛡️ P0-2（2026-10-01 · 869be6fe 实锤）：选择器（或裸 `{`）与「首个声明」同行且该声明缺尾分号。
    //   形态：`.c-x {flex-direction: column`（真实产物 common.less:163）。来源链：
    //     pruneVueStyleAgainstShared 输出 `${sel} {${body}}`（body 无尾分号）
    //     → vertical-layout-guard VERT-004 追加 `\n  min-height: 0; /* ... */` ⇒ 粘连
    //     → LESS `Unrecognised input`（报错列号指向 `column`）。
    //   原实现两处盲区：① `t.startsWith('{')` 直接 continue（裸 `{` 形态被吃掉）
    //   ② `decl` 正则 `^[\w-][\w-]*\s*:` 要求行首即属性名（选择器前缀形态被吃掉）⇒ 恒漏修。
    //   本分支置于 skip 之前，命中后同样 continue，不改动其余分支语义。
    const joint = t.match(/^(.*\{)\s*([A-Za-z-][\w-]*\s*:\s*[^;{}\s][^;{}]*)$/)
    if (joint) {
      if (requiresTrailingSemicolon(nextSignificantLine(lines, i))) {
        lines[i] = raw.replace(/\s*$/, '') + ';'
        changed = true
      }
      if (close) inStyle = false
      continue
    }

    // 跳过：空行 / 注释 / 块边界 / 选择器（以 { } & > @ * 开头）/ @规则
    if (
      t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') ||
      t.startsWith('{') || t.startsWith('}') || t.startsWith('&') || t.startsWith('>') || t.startsWith('@')
    ) {
      if (close) inStyle = false
      continue
    }
    // 声明行：prop: value（值非空，允许值内含空格如 background-size: 100% 100%），且不以 ; { } 结尾
    const decl = t.match(/^[\w-][\w-]*\s*:\s*\S.*$/)
    if (decl && !/[,;{}]\s*$/.test(t)) {
      if (requiresTrailingSemicolon(nextSignificantLine(lines, i))) {
        lines[i] = raw.replace(/\s*$/, '') + ';'
        changed = true
      }
    }
    if (close) inStyle = false
  }
  return { source: lines.join('\n'), changed }
}

/**
 * 串联两类自动修复（未闭合块注释 + 漏写分号），供 .vue 与 .less 两条 heal 路径复用。
 * 仅在修复后能干净编译时才由调用方写回磁盘（避免写坏文件）。
 */
export function healLessSource(source = '', options = {}) {
  const sourceType = options.sourceType || 'auto'
  const looksLikeVueSfc = /<(?:template|script)\b/i.test(source)
  if ((sourceType === 'vue' || (sourceType === 'auto' && looksLikeVueSfc)) && !/<style\b/i.test(source)) {
    return { source: String(source || ''), changed: false }
  }
  const a = healUnclosedLessComments(source)
  const b = healMissingSemicolons(a.source, { sourceType })
  const c = healMissingLessBraces(b.source)
  return {
    source: c.source,
    changed: a.changed || b.changed || c.changed,
    addedBraces: c.addedBraces || 0,
  }
}

/* ============================================================================
 * 🛡️ 2026-11-11（mc-lite-1794382414032-bff01bf7 实锤）：**非声明残留行**确定性清理。
 *
 * 真机病灶（backend workspace 464 个含样式产物中 16 个不可编译，3.4%）：
 *   a) 横幅残片 `}============== 左侧垂直 Tab ====================`（前缀 `}` 正常闭合，
 *      其后 `=` 串是丢失 `//` 的横幅注释）—— less `Unrecognised input`；
 *   b) `</style>` 混进独立 .less（模型把 SFC 结束标签也写进样式段）；
 *   c) 根作用域**悬空声明**（只剩 `color:`，值被分块截断吃掉）—— 后接系统补缺横幅；
 *   d) 根级裸属性 `color: @color-bg-container;`（选择器块外游离声明）；
 *   e) 独立成行的 `undefined` / `null` 字面量（模板插值取空后落盘）。
 *
 * 🔴 为什么既有 healer 全瞎：`healLessSource` 只做「注释配平 + 漏分号 + 漏 `}`」，
 *   `scanStandaloneLessDefects` 的 001-007 也只看括号平衡 / 粘连 / 根级**非空**裸属性
 *   ⇒ 上述五种形态对它完全透明，`gateStandaloneLessWrite` 返回 `ok:true`（**假绿**），
 *   坏文本一路落盘 → 预览红卡。
 *
 * 判据（全部结构性、零硬编码文案、单一定义供 scanner 复用）：
 *   · 行首（可选 `}` 后）连续 `=` ≥3 ⇒ 横幅残片（CSS/LESS 无任何合法行以 `=` 起头）；
 *   · 整行仅一个 HTML 结束/开始标签（style/template/script）⇒ 非样式残留；
 *   · 整行仅 `undefined`/`null`/`NaN`（可带 `;`）⇒ 插值残留；
 *   · `prop:` 后**值为空**，且「下一有意义行」确定是新语句（`}`/注释/`@`/选择器/新声明）
 *     ⇒ 悬空声明；🔴 值续行形态（`grid-template-areas:` 后接 `"a b"`、`(`、数字/颜色/变量）
 *     一律**不删**（防误伤合法多行值）。
 *   · 深度 0 且行内无 `{` 的 `prop: value;` ⇒ 根级裸属性（与 007 同判据，本函数负责修）。
 * ========================================================================== */
const BANNER_RESIDUE_RE = /^\s*\}?\s*[=]{3,}/
const STRAY_TAG_LINE_RE = /^\s*<\/?(?:style|template|script)\b[^>]*>\s*$/i
const BARE_LITERAL_LINE_RE = /^\s*(?:undefined|null|NaN)\s*;?\s*$/
const EMPTY_VALUE_DECL_RE = /^\s*([-a-zA-Z][\w-]*)\s*:\s*;?\s*$/

/** 判定「值为空的声明行」是否确定悬空（需看下一个有意义行）。单一定义，healer 与 scanner 共用。 */
function isEmptyValueDeclarationDangling(line, nextSignificant) {
  if (!EMPTY_VALUE_DECL_RE.test(String(line || ''))) return false
  const next = String(nextSignificant || '').trim()
  if (!next) return true // 文件尾部 ⇒ 悬空
  // 值续行形态（合法多行值）⇒ 不判悬空
  if (/^["'`]/.test(next)) return false
  if (/^[([]/.test(next)) return false
  // 🔴 `.` 必须区分「`.5em` 数值续行」与「`.c-x` 类选择器新语句」：前者带数字，后者带字母。
  //   把 `.c-x` 当成续行是实测踩过的坑（c-device-f0eedd20 悬空 `color:` 因此漏删）。
  if (/^(?:\.\d|[\d#$])/.test(next)) return false
  // 确定开始新语句 ⇒ 本行值缺失
  return /^[}/*@a-zA-Z.&#>\-]/.test(next)
}

/**
 * 🛡️ 修复「错误嵌套声明」（2026-11-13 · mc-max-1794546172891-8b9302bc 实锤）：
 * 孤儿声明出现在选择器位置 ⇒ LESS 报 `Unrecognised input. Possibly missing opening '{'`
 * ⇒ SFC 写盘门禁判死整文件 ⇒ 子组件不落盘 ⇒ 宿主悬空引用 ⇒ CODE-023 BLOCK（重试两轮
 * 同错，ContentBridge.vue:45/:44 实锤——healMissingLessBraces 只补「缺失」方向，
 * 本形是「多余 `}` 过早闭合」方向，此前无人管）。
 *
 * 病灶形态（两变体，共同点 = 上一非空行是孤立 `}`）：
 *   ```less
 *   .x { decls...
 *   }                      ← 过早闭合（本应更晚才关）
 *       display: flex;}    ← 孤儿声明 + 自带闭合（变体1）
 *   }                      ← 连锁多余
 *   ```
 *   变体2 = 孤儿声明行无自带 `}`（`display: flex;`），后随孤立 `}`。
 *
 * 修复：删除孤儿声明行**前面最近的孤立 `}`**（过早闭合者）——声明归位到块内，
 * 孤儿行自带的 `}`（变体1）接替闭合，后续 `}` 逐级归位；变体2 由紧随的孤立 `}` 闭合、
 * 外层缺口交给 healMissingLessBraces（调用序：本函数先跑 → 补缺括号 → 补分号）。
 *
 * 判据（纯行级、命名无关）：
 *   ① 孤儿声明行 = `prop: value;` 形态、行内无 `{`、值非空（`[^;{}]+`）；
 *   ② 上一**非空**行是孤立 `}`（该形态在任何合法 LESS 中都不存在——块内声明的上一行
 *     必是声明/嵌套规则，孤立 `}` 后紧跟声明必是错嵌套）；
 *   ③ 上限 20 处/文件（防极端残片连环误删）；引号/注释行不匹配形态，天然跳过。
 *
 * @param {string} styleSource - style 块正文（无 <style> 标签）
 * @returns {{ source: string, changed: boolean, fixed: number }}
 */
export function healMisnestedStyleDeclarations(styleSource = '') {
  const source = String(styleSource || '')
  const lines = source.split('\n')
  if (lines.length < 2) return { source, changed: false, fixed: 0 }
  const orphanRe = /^\s*[-\w]+\s*:\s*[^;{}]+;\s*}?\s*$/
  const loneCloseRe = /^\s*}\s*$/
  const output = [...lines]
  const removed = new Set()
  const MAX_FIXES = 20
  for (let i = 1; i < lines.length && removed.size < MAX_FIXES; i++) {
    if (!orphanRe.test(lines[i])) continue
    if (lines[i].includes('{')) continue
    let p = i - 1
    while (p >= 0 && lines[p].trim() === '') p--
    if (p < 0 || !loneCloseRe.test(lines[p]) || removed.has(p)) continue
    removed.add(p)
  }
  if (removed.size === 0) return { source, changed: false, fixed: 0 }
  return {
    source: output.filter((_, idx) => !removed.has(idx)).join('\n'),
    changed: true,
    fixed: removed.size,
  }
}

/**
 * 根级裸属性（深度 0 且行内无 `{` 的游离声明）扫描。与 LESS-WRITE-007 **同一判据**。
 * @returns {number[]} 命中的 0 基行号数组
 */
function collectRootLevelBareDeclarations(cleanedText = '') {
  const hits = []
  let depth = 0
  String(cleanedText || '').split('\n').forEach((cl, index) => {
    const depthAtLineStart = depth
    for (const ch of cl) {
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
    }
    const t = cl.trim()
    if (!t) return
    if (depthAtLineStart !== 0 || cl.indexOf('{') !== -1) return
    if (t.startsWith('@') || t.startsWith('&') || t.startsWith('/') || t.startsWith('*')) return
    // 🔴 自定义属性（`--x: v;`）不参与「根级裸属性」清理：它虽是非法根级声明，但承载
    //   整份主题色板；删掉能让编译通过却把主题变量全丢（视觉静默劣化）。真因是
    //   「主题 mixin 丢了大括号」这类结构缺失，属语义决策 ⇒ 只报错（LESS-WRITE-007）不删。
    if (/^--[\w-]+\s*:/.test(t)) return
    if (!/^([-a-zA-Z][\w-]*)\s*:\s*(.+)$/.test(t)) return
    hits.push(index)
  })
  return hits
}

/**
 * 判定「声明值里被塞进了另一条声明」——如 `font-size: calc( color: line-height: 16px);`
 * （LLM 把 Figma 文本样式拼进值位置）。判据：某个括号区间内出现 **≥2 个** `prop:` 形态。
 * 🔴 为什么要求 ≥2：`filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#x')`
 *   这类合法旧语法括号内只有 **1 个** 冒号 ⇒ 要求 2 个即可天然排除（阴性对照）。
 * 与 scanner 的 LESS-WRITE-011 共用本函数（单一定义）。
 */
function hasNestedDeclarationInsideCall(line = '') {
  for (const m of String(line || '').matchAll(/[(\[]([^)\]]*)[)\]]/g)) {
    const hits = m[1].match(/[-a-zA-Z]+\s*:\s*(?=[\w#@$%.-])/g) || []
    if (hits.length >= 2) return true
  }
  return false
}

/**
 * 清理非声明残留行（横幅残片 / 混入标签 / 裸字面量 / 悬空声明 / 根级裸属性 / 值内嵌套声明）。
 * 仅作用于样式上下文（独立 .less/.css 全文；Vue SFC 只处理 `<style>` 段）。
 * 幂等：修后由 `scanStandaloneLessDefects` 复检，零命中即通过。
 *
 * @param {string} source
 * @param {{sourceType?: 'auto'|'style'|'vue'}} [options]
 * @returns {{source: string, removedLines: number, keptBraces: number, changed: boolean}}
 */
export function healStrayLessArtifacts(source = '', { sourceType = 'auto' } = {}) {
  const src = String(source || '')
  const looksLikeVueSfc = /<(?:template|script)\b/i.test(src)
  const isVueSfc = sourceType === 'vue' || (sourceType === 'auto' && looksLikeVueSfc)
  if (isVueSfc && !/<style\b/i.test(src)) {
    return { source: src, removedLines: 0, keptBraces: 0, changed: false }
  }

  const lines = src.split('\n')
  const out = []
  let removedLines = 0
  let keptBraces = 0
  let inStyle = sourceType === 'style' || (!isVueSfc && !/<style\b/i.test(src))
  // 🔴 独立 .less 全文恒为样式上下文：混入的 `</style>` 只是一行垃圾，**不能**让它把
  //   后续内容判成「非样式」而保留下来（真机 `c-*` 产物里 `</style>` 后面就是正常规则）。
  const isStandalone = sourceType === 'style' || (!isVueSfc && !/<style\b/i.test(src))
  const exitStyle = (hitCloseTag) => { if (hitCloseTag && !isStandalone) inStyle = false }
  // 根级裸属性：对「仅样式」上下文一次性算出靶行（跨行深度状态机，无法逐行独立判定）
  const rootBare = new Set()
  if (!isVueSfc) {
    for (const idx of collectRootLevelBareDeclarations(stripCommentsAndStrings(src))) rootBare.add(idx)
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const open = /<style\b/i.test(raw)
    const close = /<\/style>/i.test(raw)
    if (open) inStyle = true
    if (!inStyle) {
      out.push(raw)
      exitStyle(close)
      continue
    }
    // `<style>` 标签本身所在行原样保留（Vue 分支）
    if (open) {
      out.push(raw)
      continue
    }

    // ① 横幅残片：`}====` 保留 `}`、把残串转块注释；纯 `====` 整行转块注释
    if (BANNER_RESIDUE_RE.test(raw)) {
      const m = /^(\s*)\}(\s*)([=]{3,}.*)$/.exec(raw)
      if (m) {
        out.push(`${m[1]}} /*${m[2]}${m[3].replace(/\*\//g, '*/')} */`)
        keptBraces += 1
      } else {
        out.push(`${/^\s*/.exec(raw)[0]}/*${raw.trim().replace(/\*\//g, '*/')} */`)
      }
      removedLines += 1
      exitStyle(close)
      continue
    }

    // ② 混入的 HTML 标签行 / ③ 裸字面量行 ⇒ 直接丢弃
    if (STRAY_TAG_LINE_RE.test(raw) || BARE_LITERAL_LINE_RE.test(raw)) {
      removedLines += 1
      exitStyle(close)
      continue
    }

    // ⑥ 值内嵌套声明（`font-size: calc( color: line-height: 16px);`）⇒ 丢弃整条声明
    //   （无法确定性还原哪个属性本该生效；删一条声明远优于整份样式编译失败）
    if (hasNestedDeclarationInsideCall(raw)) {
      let end = i
      while (end < lines.length && !/;\s*$/.test(lines[end]) && end - i < 12) end++
      i = end
      removedLines += 1
      exitStyle(close)
      continue
    }

    // ④ 悬空声明（值为空）⇒ 丢弃
    if (isEmptyValueDeclarationDangling(raw, nextSignificantLine(lines, i))) {
      removedLines += 1
      exitStyle(close)
      continue
    }

    // ⑤ 根级裸属性 ⇒ 丢弃（浏览器本就不会应用根级游离声明）
    if (rootBare.has(i)) {
      removedLines += 1
      exitStyle(close)
      continue
    }

    out.push(raw)
    exitStyle(close)
  }

  return { source: out.join('\n'), removedLines, keptBraces, changed: removedLines > 0 }
}

/**
 * 🛡️ 2026-11-11：**文件尾部散文裁剪**。
 *
 * 真机病灶（`page-page-1785049023343-dc4245c3-2-7879` theme-vars.less:132+）：模型把
 * 自己的「回答正文」直接追加进了样式文件 ——
 *   ```
 *   .theme-light();
 *   已生成环境监测组件的样式文件，严格遵循以下规范：
 *   **✅ 命名规范**
 *   - 所有 class 使用 `.c-环境监测-` 前缀，与 index.vue 保持一致
 *   ```
 * ⇒ less 在根作用域遇到裸文本 ⇒ `Unrecognised input`。
 *
 * 判据（从文件末尾向上扫，只裁**连续**的散文行）：
 *   行内无 `{}:;`、且（含中文 或 markdown 前缀 或 长英文句子）= 散文行；
 *   遇到第一个「像代码」的行（含 `{}:;`、或以 `. # @ } & / *` 起头）立即停止
 *   ⇒ `.theme-light();` 这类真实语句绝不会被裁掉（有 `;` 且以 `.` 起头）。
 *
 * @returns {{source: string, trimmedLines: number, changed: boolean}}
 */
function trimTrailingProse(source = '') {
  const lines = String(source || '').split('\n')
  const isProse = (t) => {
    if (!t) return false
    if (/[{}:;]/.test(t)) return false
    // markdown 粗体/列表（`**✅ 命名规范**`、`- 说明`）先于「以 `*` 开头即代码」判断
    if (/^\*\*[^*]+\*\*:?$/.test(t)) return true
    if (/^(?:[-*+#>]\s|\d+[.)]\s)/.test(t)) return true
    if (/^[.#@}&/*]/.test(t)) return false
    if (/[\u4e00-\u9fa5]/.test(t)) return true
    return /^[A-Za-z][A-Za-z ,.'"!?()\-]{12,}$/.test(t)
  }
  let end = lines.length - 1
  let trimmed = 0
  while (end >= 0) {
    const t = lines[end].trim()
    if (!t) { end--; continue } // 尾部空行不算散文，但也不阻断扫描
    if (!isProse(t)) break
    trimmed++
    end--
  }
  if (trimmed === 0) return { source: String(source || ''), trimmedLines: 0, changed: false }
  return { source: lines.slice(0, end + 1).join('\n'), trimmedLines: trimmed, changed: true }
}

/**
 * 🔒 单一自愈链（2026-11-11）：写盘门禁与落盘后门禁**必须**调同一函数。
 * 此前 `gateStandaloneLessWrite` 跑 8 个 healer，而 `healCriticalStandaloneLess`
 * 只跑 2 个（healLessSource + healRootFixedSize）⇒ 同一份磁盘文件两条路径结论不同。
 */
export function healLessFull(source = '', { sourceType = 'style' } = {}) {
  const fixes = []
  let content = stripMarkdownFence(String(source || ''))
  if (content !== String(source || '')) fixes.push('markdown-fence')

  // 🆕 尾部散文（模型回答正文误入样式文件）先裁掉，避免被后续 healer 误判成选择器
  const prose = trimTrailingProse(content)
  if (prose.changed) {
    content = prose.source
    fixes.push(`trim-trailing-prose:${prose.trimmedLines}`)
  }

  const healed = healLessSource(content, { sourceType })
  if (healed.changed) {
    content = healed.source
    fixes.push(`heal(braces:${healed.addedBraces || 0})`)
  }

  const parens = rebalanceOrphanCloseParens(content)
  if (parens.changed) {
    content = parens.source
    fixes.push(`heal(parens:${parens.dropped.length})`)
  }

  const missingParens = healMissingCloseParens(content)
  if (missingParens.changed) {
    content = missingParens.source
    fixes.push(`heal(missing-paren:${missingParens.added})`)
  }

  const pseudo = healMangledPseudoSelectors(content)
  if (pseudo.changed) {
    content = pseudo.source
    fixes.push(`heal(pseudo:${pseudo.fixedPseudo},stray-semi:${pseudo.fixedStraySemi})`)
  }

  const deep = stripDeepSelectors(content)
  if (deep.count > 0) {
    content = deep.source
    fixes.push(`strip-deep:${deep.count}`)
  }

  const nested = healNestedPropertyDeclarations(content)
  if (nested.changed) {
    content = nested.source
    fixes.push(`heal(nested-prop:${nested.count})`)
  }

  // 🆕 2026-11-11：非声明残留行清理（放在结构/选择器纠正之后，终裁 scan 之前）
  const stray = healStrayLessArtifacts(content, { sourceType })
  if (stray.changed) {
    content = stray.source
    fixes.push(`heal(stray:${stray.removedLines},brace:${stray.keptBraces})`)
  }

  const rooted = healRootFixedSize(content, { sourceType })
  if (rooted.changed) {
    content = rooted.source
    fixes.push('heal(root-fixed-size)')
  }

  return { source: content, fixes, changed: fixes.length > 0 }
}

/**
 * 确定性自愈：微码根容器固定像素宽高 → 100%（占满宿主面板）。
 *
 * 背景：LLM 常把 Figma 设计框尺寸（_figma-size.json 的 absoluteBoundingBox.width/height）
 * 直接写成根容器 `.c-<safeName>-root` 的 width/height 固定像素（如 420px / 186px）。
 * 但微码组件须占满宿主 default-panel 的 .pannel-content（width:100% + flex:1 +
 * height:calc(100% - 38px)），固定像素会让组件在面板内出现留白/滚动条、且面板尺寸一变就错位。
 *
 * 治本（不依赖模型）：写盘/校验自愈把根容器的 width/height 固定长度强制改为 100%，
 * 同时保留 max-width/max-height/min-width/min-height 与 padding/flex/gap 等不变量。
 * 仅匹配微码约定根类 `.c-<name>-root`（含其后可能的组合/后代选择器），且只在该规则块内替换，
 * 不会误伤 max-width/min-height 或嵌套子元素。
 */
const ROOT_FIXED_LEN_RE =
  /(?<![\w-])(width|height)\s*:\s*-?\d+(?:\.\d+)?(?:px|rem|em|vw|vh|vmin|vmax|pt|pc|cm|mm|in|ex|ch|fr)\s*(?:!important)?\s*;/gi

export function healRootFixedSize(source = '', options = {}) {
  const content = String(source || '')
  if (!/\.c-[\w-]+-root\b/.test(content)) return { source: content, changed: false }
  const ruleRe = /\.c-[\w-]+-root\b[^{}]*\{/g
  let result = ''
  let lastIndex = 0
  let changed = false
  let m
  while ((m = ruleRe.exec(content)) !== null) {
    const braceStart = m.index + m[0].length - 1
    // 括号计数定位匹配的 }（根规则通常为扁平声明块，无嵌套选择器块）
    let depth = 0
    let end = -1
    for (let i = braceStart; i < content.length; i++) {
      const ch = content[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end === -1) break // 块未闭合：交给 healMissingLessBraces 处理，此处不动
    const block = content.slice(braceStart + 1, end)
    const fixedBlock = block.replace(
      ROOT_FIXED_LEN_RE,
      (mm, prop) => `${prop}: 100%;`,
    )
    if (fixedBlock !== block) {
      changed = true
      result += content.slice(lastIndex, m.index) + m[0] + fixedBlock + content[end]
    } else {
      result += content.slice(lastIndex, end + 1)
    }
    lastIndex = end + 1
    ruleRe.lastIndex = end + 1
  }
  result += content.slice(lastIndex)
  return { source: result, changed }
}

function safeWriteFile(filePath, content) {
  try {
    const current = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null
    if (current !== content) {
      writeFileSync(filePath, content, 'utf-8')
    }
  } catch {
    // 写回失败不应阻断校验流程
  }
}

/**
 * 防御性剥除 Markdown 代码围栏（```less / ```css / ```vue 等）。
 * 背景：LLM 生成的 .less / .vue 文件偶尔会在首行带 ````less` 围栏、尾行带 ````，
 * 若写入路径绕过了 _sanitizeFileContent（如 style-refiner 直接落盘、快照回填等），
 * less.render 会把 ````less` 当成非法 token 抛出 "Unrecognised input"，
 * 导致整组件 LESS 编译门禁失败、样式全失。此处在校验编译前统一兜底剥除，
 * 与 microcode-engineer 的去围栏逻辑同源，属恒安全修复。
 */
function stripMarkdownFence(source = '') {
  let s = String(source || '')
  // 去除开头围栏：``` 或 ```less / ```css / ```vue 等（含前导空白与换行）
  s = s.replace(/^\s*```[a-zA-Z]*\s*\n?/m, '')
  // 去除中间孤立围栏行（整行只有 ``` 或 ```lang）
  s = s.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')
  // 去除结尾围栏（单独成行的 ```）
  s = s.replace(/\n?\s*```\s*$/g, '')
  return s
}

/** 剥离注释与字符串字面量（供结构扫描做「括号/分号计数」时避免误伤 `content: "{"` 之类） */
function stripCommentsAndStrings(source = '') {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*$/gm, '$1')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
}

/**
 * 🛡️ 2026-10-19（mc-max-1792235823223-5e063d76 实锤）：**孤立右圆括号**配平。
 *
 * 病灶：LLM 写 `background: @color-bg-page);`（多一个 `)`），而既有判据只查
 *   `{`/`}`（scanStandaloneLessDefects ① + healLessSource(braces) 全都是只数大括号）
 *   ⇒ `){` 平衡、缺陷扫描零命中 ⇒
 *   坏文本原样落盘 ⇒ LessCompileGate 报 `Unrecognised input. Possibly missing
 *   opening '('`（191:29）⇒ L0-B 重试 2 轮仍失败 ⇒ **整次生成失败**。
 *
 * 判据（与 rebalanceBlockComments 同构的栈模型，纯语法、命名无关）：
 *   `(` 入栈；`)` 出栈，**栈空时遇到的 `)` 即孤立闭括号**（无对应开括号），抹掉它。
 *   未配对的 `(`（缺闭括号）**不猜位置补**——交给缺陷扫描报 LESS-WRITE-004。
 *   ⚠️ 扫描**逐字符跳过注释与字符串**（`content: "("` / `// )` 不得误伤）。
 *
 * @param {string} source
 * @returns {{source: string, dropped: Array<{line:number,column:number,code:string}>, changed: boolean}}
 */
export function rebalanceOrphanCloseParens(source = '') {
  const cur = String(source || '')
  const drop = []
  const stack = []
  let i = 0
  const n = cur.length
  while (i < n) {
    const c = cur[i]
    const nx = cur[i + 1]
    // 块注释
    if (c === '/' && nx === '*') {
      const end = cur.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      continue
    }
    // 行注释
    if (c === '/' && nx === '/') {
      const end = cur.indexOf('\n', i)
      i = end < 0 ? n : end
      continue
    }
    // 字符串
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n) {
        if (cur[j] === '\\') { j += 2; continue }
        if (cur[j] === c) { j++; break }
        j++
      }
      i = j
      continue
    }
    if (c === '(') stack.push(i)
    else if (c === ')') {
      if (stack.length === 0) drop.push(i)
      else stack.pop()
    }
    i++
  }
  if (drop.length === 0) return { source: cur, dropped: [], changed: false }

  const lines = cur.split('\n')
  const lineStarts = []
  let acc = 0
  for (const l of lines) { lineStarts.push(acc); acc += l.length + 1 }
  const dropped = drop.map((idx) => {
    let line = 1
    for (let k = 0; k < lineStarts.length; k++) {
      if (lineStarts[k] <= idx) line = k + 1
      else break
    }
    return {
      line,
      column: idx - lineStarts[line - 1] + 1,
      code: (lines[line - 1] || '').trim().slice(0, 80),
    }
  })
  // ⚠️ 用**删除**而非替换空格（与 rebalanceBlockComments 不同）：圆括号紧贴值/分号，
  //   留空格会产出 `background: @color-bg-page ;` 这类虽可编译但不洁的文本。
  //   行列信息已在删除前算好（见上），不受索引位移影响。
  const dropSet = new Set(drop)
  const kept = cur.split('').filter((_, idx) => !dropSet.has(idx)).join('')
  return { source: kept, dropped, changed: true }
}

/**
 * 🛡️ L1-b（2026-10-20 · mc-max-1792497064987-195c8d0e 实锤）：**缺失右圆括号**确定性补全。
 *
 * 病灶：`rebalanceOrphanCloseParens` 按设计只抹「孤立 `)`」（多出来的），
 *   **缺 `)` 一律不补**（其头注明确「不猜位置补」）⇒ 这是整条链上唯一没有自愈出口的缺陷，
 *   只能靠 L0-B 重试，重试 6 轮仍失败 ⇒ 写盘门禁跳过 ⇒ 兜底模板覆盖磁盘
 *   （195c8d0e：641 行合格样式被换成 15 行兜底，19 个布局容器类零定义）。
 *
 * 判据（纯语法、位置唯一、不猜语义）：
 *   括号**不允许跨越声明终结符**（`;`）或块终结符（`}`）。因此扫描到 `;` / `}`
 *   时若括号栈仍非空，缺失的 `)` 唯一确定位置就是**该终结符之前**：
 *     `background: linear-gradient(\n 180deg,\n rgba(...) 0%;`  → 补在 `;` 前 ✓
 *     `background: rgba(1,2,3;`                                 → 补成 `rgba(1,2,3);` ✓
 *     `.a { color: red; }`（正常）                              → 栈空，零改动 ✓
 *   文件末尾仍有残留开括号 ⇒ 追加到末尾。
 *
 * 安全边界：
 *   - 逐字符**跳过注释与字符串**（`content: "("` / `url("a;b.png")` / `// (` 不得误伤）；
 *   - 与 `rebalanceOrphanCloseParens` **互补不冲突**：先抹多余、再补缺失；
 *   - 补完由 `scanStandaloneLessDefects` 复检 ⇒ 救不回来的仍判坏跳过（不劣于现状）。
 *
 * @param {string} source
 * @returns {{source: string, added: number, changed: boolean}}
 */
export function healMissingCloseParens(source = '') {
  const cur = String(source || '')
  const pending = [] // [{ at: 插入位置, count: 补几个 }]
  const stack = []
  let i = 0
  const n = cur.length
  while (i < n) {
    const c = cur[i]
    const nx = cur[i + 1]
    if (c === '/' && nx === '*') {
      const end = cur.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      continue
    }
    if (c === '/' && nx === '/') {
      const end = cur.indexOf('\n', i)
      i = end < 0 ? n : end
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n) {
        if (cur[j] === '\\') { j += 2; continue }
        if (cur[j] === c) { j += 1; break }
        j += 1
      }
      i = j
      continue
    }
    if (c === '(') stack.push(i)
    else if (c === ')') { if (stack.length) stack.pop() }
    else if (c === ';' || c === '}') {
      // 声明/块终结符处仍有未闭合 `(` ⇒ 缺的 `)` 只能在这个终结符之前
      if (stack.length) {
        pending.push({ at: i, count: stack.length })
        stack.length = 0
      }
    }
    i += 1
  }
  const tailCount = stack.length
  if (pending.length === 0 && tailCount === 0) {
    return { source: cur, added: 0, changed: false }
  }

  let out = cur
  let added = 0
  for (const p of pending) added += p.count
  added += tailCount
  if (tailCount > 0) out += ')'.repeat(tailCount)
  // 从后往前插入，避免索引位移
  for (let k = pending.length - 1; k >= 0; k -= 1) {
    const { at, count } = pending[k]
    out = out.slice(0, at) + ')'.repeat(count) + out.slice(at)
  }
  return { source: out, added, changed: true }
}

/**
 * 🛡️ P1-5（2026-10-01）：独立 `.less` 的**残留缺陷扫描**（结构级，不依赖 less 编译器）。
 *
 * ⚠️ 注意本注释内不得出现块注释的闭合符号字面量（会提前终结本注释）——用「开闭标记数量」表述。
 * 只扫「`healLessSource` 修不好 ⇒ 必然编译失败」的三族：
 *   ① 括号不平衡（`{` ≠ `}`）—— less `Unrecognised input` / `missing }`
 *   ② 块注释开闭标记数量不配对 —— less `Unrecognised input`
 *   ③ 「选择器/裸 `{` + 首声明」同行后缺分隔导致声明粘连（`{flex-direction: column` 家族）
 * 返回 `[{ id, line, message }]`；空数组 = 通过。
 */
export function scanStandaloneLessDefects(source = '') {
  const defects = []
  const text = String(source || '')
  const cleaned = stripCommentsAndStrings(text)

  const opens = (cleaned.match(/\{/g) || []).length
  const closes = (cleaned.match(/\}/g) || []).length
  if (opens !== closes) {
    defects.push({
      id: 'LESS-WRITE-001',
      line: 1,
      message: `括号不平衡：{ ×${opens} vs } ×${closes}（heal 未能补全，写盘必然编译失败）`,
    })
  }

  const cOpens = (text.match(/\/\*/g) || []).length
  const cCloses = (text.match(/\*\//g) || []).length
  if (cOpens !== cCloses) {
    defects.push({
      id: 'LESS-WRITE-002',
      line: 1,
      message: `块注释未闭合：/* ×${cOpens} vs */ ×${cCloses}`,
    })
  }

  // 🛡️ 2026-10-19（5e063d76 实锤）：圆括号平衡。孤立 `)` 由 rebalanceOrphanCloseParens
  //   抹掉 ⇒ 走到这里仍不平衡 ⇒ 是「缺 `(`」（无法确定性补位）⇒ 判坏、跳过写盘。
  const pOpens = (cleaned.match(/\(/g) || []).length
  const pCloses = (cleaned.match(/\)/g) || []).length
  if (pOpens !== pCloses) {
    defects.push({
      id: 'LESS-WRITE-004',
      line: 1,
      message: `圆括号不平衡：( ×${pOpens} vs ) ×${pCloses}（孤立 ) 已抹除仍有差 ⇒ 缺 ( ，less 必报 Unrecognised input）`,
    })
  }

  // ③ 声明粘连残留：与 healMissingSemicolons 的 joint 判据同源，heal 后仍有 ⇒ 判坏
  const jointRe = /(.*\{)\s*([A-Za-z-][\w-]*\s*:\s*[^;{}\s][^;{}]*)$/
  text.split('\n').forEach((line, index) => {
    if (!jointRe.test(line.trim())) return
    defects.push({
      id: 'LESS-WRITE-003',
      line: index + 1,
      message: `声明粘连未修复（选择器/裸 { 与首声明同行且缺尾分号）：${line.trim().slice(0, 80)}`,
    })
  })

  // ⑤ 🛡️ R8-3（2026-11-02 · 3a7d3fb3 实锤）：畸形「属性名拼接」声明残留
  //   （`background: box-shadow: X` —— LLM 把 Figma effect 拼进值位置）。heal
  //   已先行抽取内层 ⇒ 走到这里仍残留的是 heal 锚定不到的形态（压缩写法等）
  //   ⇒ less 编译必报 Unrecognised input，判坏跳过写盘（保 last-good）。
  //   🔴 与 healNestedPropertyDeclarations **同锚同形**（声明位置 `[;{]` 起）：
  //   无锚定的宽松形态会把 `.a:first-child:hover {` 这类双伪类选择器误判死。
  const nestedRe = /([;{]\s*)([-a-zA-Z]+)(\s*):(\s*)([-a-zA-Z]+)(\s*):(\s)/
  {
    const nm = nestedRe.exec(cleaned)
    if (nm) {
      const line = cleaned.slice(0, nm.index).split('\n').length
      defects.push({
        id: 'LESS-WRITE-006',
        line,
        message: `畸形「属性名拼接」声明残留（prop: prop: value，heal 未能抽取）：${(nm[0] || '').trim().slice(0, 60)}`,
      })
    }
  }

  // ④ 2026-10-19（c-a579d-6a579df0 实锤）：残留 `:deep(` / `::v-deep(`。
  //   gateStandaloneLessWrite 已先跑 stripDeepSelectors ⇒ 走到这里仍残留的只有
  //   「未闭合无法改写」的形态 —— 全局注入下是死规则，判坏不落盘。
  const deepIdx = cleaned.search(/:{1,2}(?:v-deep|deep)\(/)
  if (deepIdx !== -1) {
    const line = cleaned.slice(0, deepIdx).split('\n').length
    defects.push({
      id: 'LESS-WRITE-005',
      line,
      message: `残留 :deep( / ::v-deep(（未闭合无法确定性改写；全局 CSS 注入下为死规则，整条规则会被浏览器丢弃）`,
    })
  }

  // ⑥ R20（2026-10-21 · 72ede0c9 实锤）：残留的伪类/伪元素选择器损坏 + `{` 后孤立分号。
  //   healMangledPseudoSelectors 已先跑 ⇒ 走到这里仍残留的（跨行、@规则内等）属无法
  //   确定性改写的形态 ⇒ 判坏不落盘。二者都是 less `Unrecognised input` 的硬死因。
  //   判据域与 healer **同一实现口径**：只看「行内首个 `{` 之前的选择器部分」，
  //   `;` 先出现即视为声明行（否则 `color: #fff` 会被误判）。
  text.split('\n').forEach((line, index) => {
    const t = line.trim()
    if (!t || t.startsWith('@')) return
    const brace = line.indexOf('{')
    if (brace === -1) return
    const head = line.slice(0, brace)
    if (head.includes(';')) return
    // ⚠️ 损坏形态必然含空白（`: :` / `: name`）⇒ 用 `\s+`；`\s*` 会误判合法 `::placeholder`
    if (/:\s+:\s*[-A-Za-z]|:\s+[-A-Za-z]/.test(head)) {
      defects.push({
        id: 'LESS-WRITE-006',
        line: index + 1,
        message: `伪类/伪元素选择器被拆开（\`::\`→\`: :\` 或 \`:name\`→\`: name\`），less 必报 Unrecognised input：${t.slice(0, 80)}`,
      })
    }
    if (/\{(\s*);/.test(line)) {
      defects.push({
        id: 'LESS-WRITE-006',
        line: index + 1,
        message: `\`{\` 后紧跟孤立 \`;\`（空声明起始），less 解析器拒收：${t.slice(0, 80)}`,
      })
    }
  })

  // ⑦ 🛡️ R4（2026-11-09 · loop-verify · mc-1794186438485-3c9509f8 实锤）：
  //   **根级裸属性**（选择器块外的游离 `prop: value;` 行）。真机 common.less:176-178：
  //   `[样式补缺]` 段下方混入三行 `font-size: calc();`（无选择器 + 空 calc() 双重非法）
  //   ⇒ less `Properties must be inside selector blocks. They cannot be in the root`
  //   ⇒ 最终 LESS 编译门禁 BLOCK ⇒ 整单失败。既有 001-006 均不认此形态（006 的
  //   `prop: prop:` 双冒号锚定不到单冒号游离声明；001 只数括号平衡——裸属性不影响
  //   平衡）⇒ 结构级盲区。
  //   判据（零硬编码、结构判据、与 006 的教训对齐防误伤）：
  //   逐行深度扫描（cleaned 已剥注释/字符串），维护 `{`/`}` 深度；
  //   命中须**同时**满足：
  //     a) 深度 0（不在任何选择器块内 —— 「根级」的定义，跨行状态机而非单行正则）；
  //     b) 行内无 `{`（有 `{` 即是选择器行，交 006 域管辖）；
  //     c) 首个非空 token 是 `prop:` 形态且以 `;` 或行尾收束（游离声明的定义）；
  //     d) 排除：`@` 规则行（@media/@import 合法在根级）、`&` 嵌套选择器、
  //        注释/变量声明（`@name:` 是 LESS 变量，深度 0 合法）。
  //   🔴 阴性保障（防误伤）：`@media` 行、根级 `@var: x;` 变量声明、`/* 注释 */`、
  //     `.a { }` 选择器行、块内正常声明（深度 >0）均不命中。
  {
    let depth = 0
    const rawLines = cleaned.split('\n')
    rawLines.forEach((cl, index) => {
      const depthAtLineStart = depth // 行首深度：声明文字所处层级以此为准（行内 `}` 后归零不影响本行判定）
      for (const ch of cl) {
        if (ch === '{') depth += 1
        else if (ch === '}') depth -= 1
      }
      const t = cl.trim()
      if (!t) return
      if (depthAtLineStart !== 0 || cl.indexOf('{') !== -1) return // 块内 / 选择器行 ⇒ 非本域
      if (t.startsWith('@') || t.startsWith('&') || t.startsWith('/') || t.startsWith('*')) return
      // 游离声明形态：`prop:` 起头（属性名字符 + 可选空格 + 冒号），且冒号后非空
      const m = t.match(/^([-a-zA-Z][\w-]*)\s*:\s*(.+)$/)
      if (!m) return
      defects.push({
        id: 'LESS-WRITE-007',
        line: index + 1,
        message: `根级裸属性（选择器块外游离声明，less 报 Properties must be inside selector blocks）：${t.slice(0, 80)}`,
      })
    })
  }

  // ⑧ 🛡️ 2026-11-11（mc-lite-1794382414032-bff01bf7 / c-device-f0eedd20 实锤）：
  //   **非声明残留行**。与 `healStrayLessArtifacts` **同一判据函数**（单一定义，绝不各写一份）：
  //     · 横幅残片 `}====`（丢 `//`）—— less `Unrecognised input`
  //     · 混入的 `<style>` / `</style>` 行 —— 同上
  //     · 裸 `undefined` / `null` 行 —— 同上
  //     · 悬空声明 `color:`（值为空且后接新语句）—— 同上
  //   heal 已先跑 ⇒ 走到这里仍残留 ⇒ 判坏不落盘（此前 001-007 全瞎 ⇒ 假绿放行）。
  const scanLines = text.split('\n')
  scanLines.forEach((line, index) => {
    if (BANNER_RESIDUE_RE.test(line)) {
      defects.push({
        id: 'LESS-WRITE-008',
        line: index + 1,
        message: `横幅注释残片（\`//\` 丢失后与 \`}\` 粘连），less 必报 Unrecognised input：${line.trim().slice(0, 80)}`,
      })
      return
    }
    if (STRAY_TAG_LINE_RE.test(line) || BARE_LITERAL_LINE_RE.test(line)) {
      defects.push({
        id: 'LESS-WRITE-009',
        line: index + 1,
        message: `非样式残留行（HTML 标签 / 裸 undefined 字面量），less 必报 Unrecognised input：${line.trim().slice(0, 80)}`,
      })
      return
    }
    if (hasNestedDeclarationInsideCall(line)) {
      defects.push({
        id: 'LESS-WRITE-011',
        line: index + 1,
        message: `声明值内被塞进另一条声明（括号内 ≥2 个 \`prop:\`），less 必报 Unrecognised input：${line.trim().slice(0, 80)}`,
      })
      return
    }
    if (isEmptyValueDeclarationDangling(line, nextSignificantLine(scanLines, index))) {
      defects.push({
        id: 'LESS-WRITE-010',
        line: index + 1,
        message: `声明值为空（输出被截断的残片，如 \`color:\`），less 必报 Unrecognised input：${line.trim().slice(0, 80)}`,
      })
    }
  })

  return defects
}

/**
 * 🛡️ R20（2026-10-21 · mc-max-1792553283427-72ede0c9 实锤）：**伪类/伪元素选择器损坏的确定性修复**。
 *
 * 背景（真机产物 `common.less:111 / :129`）：
 *   ```
 *   &: :-webkit-scrollbar {;      ← 伪元素双冒号被拆成「冒号 空格 冒号」
 *   &: hover {                    ← 伪类被拆成「冒号 空格 名字」
 *   ```
 *   less 报 `Unrecognised input` ⇒ L0-B `LESS-COMPILE-001` ×6 ⇒ BLOCK=8 ⇒ 6 轮重试全败。
 *   **而现有全部自愈器都看不见它**：`healLessSource` 只数 `{}` 与分号，圆括号族只数
 *   `()`，伪类选择器的损坏对它们完全透明 —— 对这份文件 `healLessSource` 返回
 *   `changed:false`（假绿：自愈器认为文件是好的，编译却必败）。
 *
 * 三种损坏形态：
 *   ① `: :name`（伪元素的 `::` 被拆成两个冒号 + 空白）
 *   ② `: <name>`（伪类的 `:name` 被拆成冒号 + 空白 + 名字；**这是声明形态**，极易误伤）
 *   ③ `{` 紧跟一个孤立 `;`（`{;`）⇒ 空声明
 *
 * 🔴 判据域：**只在「选择器部分」改写**（行内第一个 `{` 之前），声明部分一律不动
 *   ⇒ `color: #fff` / `background: linear-gradient(...)` / `transition: color .2s`
 *   天然不受影响。`@media (min-width: 768px) {` 等 @规则行整体跳过。
 *
 * 🔴 ① 的正确展开必须**按名字分类**，不能一律补成 `::`：
 *   `&: :hover` 的本意是伪类 `&:hover`（单冒号），`&: :-webkit-scrollbar` 才是伪元素
 *   `&::-webkit-scrollbar`（双冒号）。一律补双冒号会把 hover 变成不存在的伪元素
 *   （选择器永不匹配 ⇒ **样式静默消失**，比编译失败更难查）。
 *
 * 幂等：修后不再存在这三种形态（由 `scanStandaloneLessDefects` 的 LESS-WRITE-006 复检）。
 *
 * @param {string} source
 * @returns {{source: string, fixedPseudo: number, fixedStraySemi: number, changed: boolean}}
 */
const PSEUDO_ELEMENTS = new Set([
  'before', 'after', 'first-line', 'first-letter', 'selection', 'placeholder',
  'backdrop', 'marker', 'file-selector-button', 'cue', 'grammar-error', 'spelling-error',
  'target-text', 'highlight', 'part', 'slotted', 'file-selector-button',
  '-webkit-scrollbar', '-webkit-scrollbar-thumb', '-webkit-scrollbar-track',
  '-webkit-scrollbar-button', '-webkit-scrollbar-corner', '-webkit-input-placeholder',
  '-webkit-file-upload-button', '-webkit-slider-thumb', '-webkit-slider-runnable-track',
  '-moz-placeholder', '-ms-input-placeholder', '-moz-selection', '-ms-clear',
])

export function healMangledPseudoSelectors(source = '') {
  const src = String(source || '')
  let fixedPseudo = 0
  let fixedStraySemi = 0

  const normalizeSelectorPart = (sel) => sel.replace(
    // ⚠️ 两种损坏形态都**必然含空白**（`: :` / `: name`）⇒ 空白用 `\s+` 而非 `\s*`。
    //   用 `\s*` 会把**合法的** `::placeholder` / `:hover` 也当成损坏（实测误报，
    //   连带 `gateStandaloneLessWrite` 把干净文件判死）。
    // 名字允许以 `-` 开头：`-webkit-scrollbar` / `-moz-placeholder` / `-ms-clear`
    /:\s+:\s*([-A-Za-z][\w-]*)|:\s+([-A-Za-z][\w-]*)/g,
    (m, dbl, sgl) => {
      fixedPseudo += 1
      const name = dbl || sgl
      // 双冒号形态：按名单判定；单冒号形态恒为伪类
      return dbl && PSEUDO_ELEMENTS.has(name) ? `::${name}` : `:${name}`
    },
  )

  const lines = src.split('\n')
  const out = lines.map((line) => {
    const t = line.trim()
    if (!t) return line
    if (t.startsWith('@')) return line // @media / @supports 等 @规则行不参与
    const brace = line.indexOf('{')
    if (brace === -1) return line // 无块起始 ⇒ 纯声明/纯文本行，不动
    const head = line.slice(0, brace)
    if (head.includes(';')) return line // `;` 已出现 ⇒ `{` 之前是声明，属声明行
    const fixedHead = normalizeSelectorPart(head)
    return fixedHead + line.slice(brace)
  })
  let result = out.join('\n')

  // ③ `{` 后紧邻孤立 `;` → 删除（仅当 `;` 与 `{` 之间只有空白）
  result = result.replace(/\{(\s*);/g, (m, ws) => {
    fixedStraySemi += 1
    return `{${ws}`
  })

  return {
    source: result,
    fixedPseudo,
    fixedStraySemi,
    changed: result !== src,
  }
}

/**
 * 🛡️ 2026-10-19（c-a579d-6a579df0 实锤）：`:deep(...)` 确定性改写为裸后代选择器。
 *
 * 背景：微码产物的独立 .less 编译为 CSS 后经全局 `style.textContent` 注入预览，
 * **没有 Vue scoped 编译器参与**。`:deep(...)` 是 SFC scoped 专有语法，浏览器视为
 * 非法伪类 ⇒ **整条规则被丢弃**（该组件 common.less 4 条 :deep 全部失效，antd
 * 接管样式全丢、深色下输入控件/label 不可读）。而管线 prompt 出于 scoped 语义
 * 又在教 `:deep()`（对 SFC 内联块是正确写法），产物必然携带 ⇒ 必须在独立样式
 * 写盘口确定性拦截。
 *
 * 改写规则（保语义：deep 本质就是「后代选择器」）：
 *   · `:deep(X)` → `X`（嵌套块内 `.parent { :deep(.a) {} }` → `.parent .a`）
 *   · `&:deep(X)` / `.foo:deep(X)` 等复合形态 → 补空格降为后代（`& X` / `.foo X`）
 *   · 同步覆盖旧写法 `::v-deep(X)`
 *   · 注释与字符串内的字面量不动（扫描时跳过）；未闭合的 `:deep(` 不猜改写
 *     （交给 scanStandaloneLessDefects 判 LESS-WRITE-005）
 *
 * @param {string} source
 * @returns {{source: string, count: number}}
 */
export function stripDeepSelectors(source = '') {
  const src = String(source || '')
  // 长者在前：`::v-deep(` 必须先于 `:deep(` 匹配，否则会被吃掉半截
  const OPENERS = ['::v-deep(', ':deep(']
  let out = ''
  let i = 0
  let count = 0
  while (i < src.length) {
    const two = src[i] + (src[i + 1] || '')
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      out += src.slice(i, stop)
      i = stop
      continue
    }
    if (two === '//') {
      const nl = src.indexOf('\n', i)
      const stop = nl === -1 ? src.length : nl
      out += src.slice(i, stop)
      i = stop
      continue
    }
    if (src[i] === '"' || src[i] === "'") {
      const quote = src[i]
      let j = i + 1
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\') j++
        j++
      }
      const stop = Math.min(j + 1, src.length)
      out += src.slice(i, stop)
      i = stop
      continue
    }
    const opener = OPENERS.find((o) => src.startsWith(o, i))
    if (!opener) {
      out += src[i]
      i++
      continue
    }
    // 括号深度匹配取内层选择器（内层可含嵌套括号，如 :deep(.a:not(.b))）
    const openStart = i + opener.length - 1 // '(' 下标
    let depth = 0
    let closeIdx = -1
    for (let j = openStart; j < src.length; j++) {
      if (src[j] === '(') depth++
      else if (src[j] === ')') {
        depth--
        if (depth === 0) {
          closeIdx = j
          break
        }
      }
    }
    if (closeIdx === -1) {
      out += src[i]
      i++
      continue
    }
    const inner = src.slice(openStart + 1, closeIdx).trim()
    const prevChar = out.length ? out[out.length - 1] : ''
    // 复合形态（前接 & / .foo / ] 等）补空格降为后代选择器；嵌套裸形态（前接空白）保持
    const needsSpace = /[\w\-.#[\]&)]/.test(prevChar)
    out += (needsSpace ? ' ' : '') + inner
    i = closeIdx + 1
    count++
  }
  return { source: out, count }
}

/**
 * 🛡️ R8-3（2026-11-02 · mc-max-1793607686262-3a7d3fb3 实锤）：畸形「属性名拼接」声明自愈。
 *
 * 病灶：LLM 把 Figma effect（内发光 box-shadow）错误拼进 `background:` 的值位置——
 *   `background: box-shadow: inset 0px 0px 16px 0px rgba(25, 181, 186, 0.67);`
 *   既有自愈族（braces/parens/missing-paren/pseudo/deep）对「属性名拼接」全部
 *   changed:false（假绿），终裁也不判 ⇒ 直接落盘 ⇒ 落盘后异步 LessCompileGate
 *   真编译 `Unrecognised input` ⇒ LESS_COMPILE_GATE_BLOCKED ⇒ 整单终态失败。
 *
 * 判据（宁漏不误伤）：
 *   · 只匹配**声明起点**（`;` / `{` 之后）的 `outerProp: innerProp:` 形态；
 *   · 内层冒号后**必须有空白**（`data:image/...`、`https://...` 等 URI scheme
 *     形态冒号后紧跟路径 ⇒ 不命中，防误抽协议前缀）；
 *   · `[-a-zA-Z]+` 不含引号/空白 ⇒ 字符串字面量（`content: "a: b: c"`）天然不匹配；
 *   · 修复语义 = 抽出内层声明、弃外层壳（`background: box-shadow: X` → `box-shadow: X`；
 *     多层 `a: b: c: d` 循环剥离，上限 3 层防失控）。
 * 漏修形态（内层冒号后无空白的压缩写法等）交给 LESS-WRITE-006 终裁判死，不臆修。
 *
 * @param {string} source
 * @returns {{source: string, changed: boolean, count: number}}
 */
export function healNestedPropertyDeclarations(source = '') {
  let out = String(source || '')
  let total = 0
  // 声明起点锚定：`;` 或 `{` 之后（含起始位置）；外层壳与内层名均为 CSS 属性名形态；
  // 内层冒号后必须紧跟空白（URI scheme 防线）。
  const NESTED_DECL_RE = /([;{]\s*)([-a-zA-Z]+)(\s*):(\s*)([-a-zA-Z]+)(\s*):(\s)/g
  for (let round = 0; round < 3; round++) {
    let count = 0
    out = out.replace(NESTED_DECL_RE, (_m, lead, outer, sp1, sp2, inner, sp3, tailWs) => {
      count++
      // 抽内层：lead + inner + sp3 + ':' + 原尾部空白
      return `${lead}${inner}${sp3}:${tailWs}`
    })
    if (count === 0) break
    total += count
  }
  return { source: out, changed: total > 0, count: total }
}

/**
 * 🛡️ P1-5（2026-10-01）：独立 `.less` 的**写盘前等价门禁**。
 *
 * 背景（mc-max-1790828667794-869be6fe 实锤）：`.vue` 有 `validateVueSfc` 写盘门禁（失败即跳过该文件），
 * 但 `common.less` 走 `healLessSource` 且**无等价门禁** —— `style-class-consolidator#mergeIntoCommonLess`
 * 把已被判死的坏文本原样搬进共享样式表直接落盘 ⇒ 最终 LESS 门禁 BLOCK ⇒ L0-B 重试耗尽 ⇒ 任务失败。
 *
 * ⚠️ 为什么不做真编译：`writeFiles` 是**同步**函数，而 less 4.x 只有 `less.render`（异步）。
 * 强行改异步会波及 7 处调用点（含未 await 的调用）→ 排序风险大于收益。
 * 故此处 = 「结构性自愈 + 残留缺陷扫描」：
 *   · 能修的一律修（Markdown 围栏 / 未闭合注释 / 漏分号 / 漏右大括号）；
 *   · 修不掉 ⇒ `ok:false`，调用方**跳过写盘**（保住磁盘上的 last-good 版本，预览不至于全黑）。
 * 真正「绝对」的编译校验仍由落盘后的 `LessCompileGate`（异步 + 内存 FileManager 完整 import 链）承担。
 *
 * @param {string} source 待写盘的 .less 源码
 * @param {string} filePath 相对路径（仅用于日志）
 * @returns {{content: string, fixes: string[], defects: Array, ok: boolean}}
 */
export function gateStandaloneLessWrite(source = '', filePath = '') {
  // 🔒 2026-11-11：改为调用**单一自愈链** `healLessFull`（原先本函数内联 8 个 healer，
  //   而落盘后门禁 healCriticalStandaloneLess 只跑 2 个 ⇒ 两处结论不一致）。
  const full = healLessFull(source, { sourceType: 'style' })
  const content = full.source
  const fixes = full.fixes

  const defects = scanStandaloneLessDefects(content)
  return { content, fixes, defects, ok: defects.length === 0, filePath }
}

/**
 * 🛡️ 2026-10-15（mc-max-1791967522207-a715fafc 实锤，B 降级配套）：块注释配平。
 *
 * 背景：LESS 写盘门禁「跳过 = 保留磁盘 last-good」对新任务首次写盘不成立
 * （无 last-good 时跳过 = 交付空兜底模板裸产物）。门禁降级路径调用本函数把
 * 未闭合的注释开符号与孤立的注释闭符号替换为两个空格——牺牲被吞注释段
 * （其内容降级为普通文本，CSS 解析容错忽略），保住其余样式规则，复检后再落盘。
 *
 * 迭代至稳定：抹掉未闭合的开符号后，原本被它吞进注释的闭符号/开符号会暴露为
 * 新的孤立/未闭合符号，需多轮收敛（正常 ≤2 轮，上限 10 轮防死循环）。
 *
 * @param {string} source
 * @returns {string} 注释配平后的文本
 */
export function rebalanceBlockComments(source = '') {
  const cur = String(source || '')
  // 配对栈模型（与门禁 scanStandaloneLessDefects 的简单计数严格等价）：
  //   每个开符号入栈、每个闭符号弹栈（栈空则记孤立闭符号）；扫描结束栈内剩余
  //   即未闭合开符号。抹掉「栈剩余 + 孤立闭」后开/闭计数必然相等。
  //   ⚠️ 不能用「不嵌套状态机」：注释内容里出现开符号字样时状态机会将其忽略
  //   （a715fafc 实锤：自动修复注释文本含开符号字面），计数依然失衡。
  const stack = [] // 未配对开符号的字符索引
  const blanks = [] // 待抹除的字符索引（每处 2 字符）
  for (let i = 0; i < cur.length - 1; i++) {
    const two = cur[i] + cur[i + 1]
    if (two === '/*') { stack.push(i); i++; continue }
    if (two === '*/') {
      if (stack.length > 0) stack.pop()
      else blanks.push(i) // 孤立闭符号
      i++
    }
  }
  for (const idx of stack) blanks.push(idx) // 未闭合开符号
  if (blanks.length === 0) return cur
  const chars = cur.split('')
  for (const idx of blanks) {
    chars[idx] = ' '
    chars[idx + 1] = ' '
  }
  return chars.join('')
}

function readSnippet(source, line, radius = 2) {
  const lines = String(source || '').split('\n')
  const safeLine = Math.max(1, Number(line) || 1)
  const start = Math.max(1, safeLine - radius)
  const end = Math.min(lines.length, safeLine + radius)
  return lines.slice(start - 1, end).map((code, index) => ({
    line: start + index,
    code,
    current: start + index === safeLine
  }))
}

function extractLessStyles(vueSource = '') {
  const styles = []
  const pattern = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi
  let match
  while ((match = pattern.exec(vueSource)) !== null) {
    const attrs = match[1] || ''
    if (!/\blang\s*=\s*["']less["']/i.test(attrs)) continue
    const content = match[2] || ''
    const contentOffset = match.index + match[0].indexOf(content)
    const startLine = vueSource.slice(0, contentOffset).split('\n').length
    styles.push({ content, startLine, index: styles.length })
  }
  return styles
}

function detectMixinHint(source, error) {
  const line = Number(error?.line) || 1
  const currentLine = String(source || '').split('\n')[line - 1] || ''
  const call = currentLine.match(/^\s*([.#][\w-]+)\s*(\([^;{}]*\))?\s*;?\s*$/)
  if (!call) return null
  return {
    rule: 'LESS-MIXIN-001',
    message: `疑似 Mixin 调用语法或参数不匹配：${currentLine.trim()}`,
    suggestion: '检查 Mixin 定义是否带参数、调用末尾是否有分号，并确认调用名称与定义一致。'
  }
}

/**
 * 「无法加载 LESS 依赖」是 createFileManager 里自定义抛出的错误（{ type: 'File', message, filename }），
 * 不带 line 字段。若不做处理，`Number(error?.line) || 1` 会回退成第 1 行，
 * 映射回 SFC 后落在 `<style>` 标签行而不是真正的 `@import` 行（实测差 1 行：48 vs 49），
 * 用户照着行号找过去看到的是 `<style lang="less" scoped>`，找不到出错的引用。
 * 这里用 message 里的依赖路径在当前编译源里定位真实的 @import 行。
 */
function resolveImportLine(source, message) {
  const spec = String(message || '').match(/无法加载 LESS 依赖：(.+)$/)?.[1]?.trim()
  if (!spec) return null
  const lines = String(source || '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(spec)) return i + 1
  }
  return null
}

function toDiagnostic({ error, file, source, sourceType, styleIndex = null, lineOffset = 0, importedFrom = null }) {
  // 仅当 LESS 自身没给出行号时（File 类错误）才用依赖路径反查，避免覆盖真实行号
  const rawLine = Number(error?.line) || resolveImportLine(source, error?.message) || 1
  const line = rawLine + lineOffset
  const column = Math.max(1, Number.isFinite(Number(error?.column)) ? Number(error.column) + 1 : 1)
  const mixinHint = detectMixinHint(source, error)
  return {
    id: 'LESS-COMPILE-001',
    severity: 'BLOCK',
    sourceType,
    file: normalizePath(file),
    line,
    column,
    message: error?.message || 'LESS 编译失败',
    // less 的 error.extract 末尾可能是 null 补位，直接透传会让下游渲染出空行
    extract: Array.isArray(error?.extract)
      ? error.extract.filter((row) => typeof row === 'string')
      : [],
    snippet: readSnippet(source, rawLine),
    styleIndex,
    // 🎯 2026-10-05：报错来自 @import 链上的**另一个文件**时，记录引入方（调用方文件），
    // 便于下游（重试提示 / 详情面板）说明「该错误由谁引入」，而 file/line 始终指向真实病灶。
    importedFrom,
    hint: mixinHint,
    originalError: {
      type: error?.type || 'Parse',
      filename: error?.filename || normalizePath(file)
    }
  }
}

function createFileManager(files, outputPath) {
  const normalizedFiles = new Map(Object.entries(files || {}).map(([key, value]) => [normalizePath(key), String(value)]))
  class GeneratedFileManager extends less.FileManager {
    supports() { return true }
    supportsSync() { return false }
    async loadFile(filename, currentDirectory) {
      const base = normalizePath(currentDirectory || '')
      const requested = normalizePath(normalize(join(base, filename)))
      const relativeToOutput = normalizePath(relative(outputPath || '/', requested))
      const candidates = [requested, relativeToOutput, normalizePath(filename)]
      for (const candidate of candidates) {
        if (normalizedFiles.has(candidate)) {
          // 虚拟文件命中：仍返回绝对磁盘路径作为 filename，
          // 让 LESS 把当前目录定位到 outputPath 下真实的目录层级，
          // 这样被导入文件再 @import 相对路径（如 ./themes/theme-vars.less）时
          // 能基于正确的父目录解析，不会错把 package/ 当成 resources/styles/。
          const absPath = candidate.startsWith('/') ? candidate : normalizePath(join(outputPath, candidate))
          return { contents: normalizedFiles.get(candidate), filename: absPath }
        }
      }
      try {
        // fallback 读磁盘：requested 已经是绝对路径（由 base + filename join 而来），直接用
        return { contents: readFileSync(requested, 'utf-8'), filename: requested }
      } catch {
        throw { type: 'File', message: `无法加载 LESS 依赖：${filename}`, filename: requested }
      }
    }
  }
  return new GeneratedFileManager()
}

// 关键 standalone less 文件（common.less / theme-vars.less）的候选路径。
// 兼容两种产物布局：resources/styles/themes/theme-vars.less 与 resources/styles/theme-vars.less。
function collectCriticalLessFiles(outputPath) {
  const list = ['resources/styles/common.less', 'resources/styles/themes/theme-vars.less']
  if (existsSync(join(outputPath, 'resources/styles/theme-vars.less'))) {
    list.push('resources/styles/theme-vars.less')
  }
  return list
}

/**
 * 🛡️ 2026-10-20（5ef650ff/ee06ee24 实锤）：双真值产物的**设计深色轨中性灰猜色** BLOCK。
 *
 * 病灶：双真值（dualTruth）产物的「设计深色轨」mixin（`.theme-theme_2()` 等，非内置
 *   占位 `.theme-dark()`）里，颜色槽位若是「自愈迁出/语义推断」的**中性灰**
 *   （#2b2b2b/#e6e6e6/#333333 这类 r≈g≈b 的消色）且被 common.less 实际引用 ⇒
 *   该深色轨渲染观感 ≈ 默认 dark（设计稿深蓝/深青色板丢失）——prompt 侧
 *   formatCrossThemeColorFacts 早已明令禁止这类猜色，但缺门禁兜底。
 *
 * 判据（三条件同时成立才命中，全部可辩驳）：
 *   ① declare.json 标 dualTruth（或主题清单含非内置深色轨）；
 *   ② 设计轨 mixin 内的 `@color*` 槽位带「语义推断/迁出」猜测标记且值是消色灰；
 *   ③ 该槽位被 common.less 实际引用（不引用的死槽位不判）。
 * 近白豁免（#ffffff 系，min 通道 ≥200）：深色轨常见合理值，不判（967f9696 实锤）。
 * LLM 亲笔（无猜测标记）的灰色同样命中——设计稿可能真有灰色。
 *
 * 🛡️ 2026-10-20 降级（77caa86b/967f9696 双实锤）：原 BLOCK 造成任务级必失败——
 *   猜灰槽位在跨稿真值表**无映射可依**（#2b2b2b 是臆造/内置默认灰，副稿无对应色），
 *   LLM 重试修不掉 ⇒ BLOCK = 死锁，比要防的「深色稿发灰」破坏性更大。
 *   且门禁侧拿不到真值表、无法证明「有真值可依」⇒ 恒 WARN 留痕，
 *   severity 判定交视觉验收/人工评估（诊断随 task.result 可审计）。
 *
 * 纯函数、零 IO，供 spec 直测；接线在 LessCompileGate.validate（outputPath 分支）。
 *
 * @param {object} opts
 * @param {string} opts.themeVarsContent theme-vars.less 全文
 * @param {string} opts.commonLessContent common.less 全文
 * @param {boolean} opts.hasDesignDarkTrack 是否存在设计深色轨（declare 判定结果）
 * @returns {Array<{slot:string, value:string, mixin:string, blocked:boolean, guessed:boolean}>}
 */
export function auditDesignDarkTrackGuessedGray({ themeVarsContent, commonLessContent, hasDesignDarkTrack } = {}) {
  if (!hasDesignDarkTrack) return []
  const tv = String(themeVarsContent || '')
  if (!tv) return []
  const isNeutralGrayHex = (v) => {
    const m = /#([0-9a-fA-F]{3,8})\b/.exec(String(v).trim())
    if (!m) return false
    let h = m[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (h.length < 6) return false
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    // 消色判定：RGB 三通道近似相等（容差 4）
    return Math.max(r, g, b) - Math.min(r, g, b) <= 4
  }
  // 近白豁免（2026-10-20 · 967f9696 实锤误杀）：深色轨上次要文字/滚动条/反白
  // 用 #ffffff 系是常见合理值（消色但非「僵尸灰」），不判。
  const isNearWhiteHex = (v) => {
    const m = /#([0-9a-fA-F]{3,8})\b/.exec(String(v).trim())
    if (!m) return false
    let h = m[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (h.length < 6) return false
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    return Math.min(r, g, b) >= 200
  }
  // common.less 里的**引用**（先剔定义行，避免把定义算成引用）
  const common = String(commonLessContent || '').replace(/^\s*@[a-zA-Z0-9_-]+\s*:[^;]+;/gm, '')
  const hits = []
  // 按 mixin 块切分（brace 配对，兼容嵌套）
  const mixinRe = /\.([\w-]+)\s*\(\s*\)\s*\{/g
  let mm
  while ((mm = mixinRe.exec(tv)) !== null) {
    const mixinName = mm[1]
    // 只盯设计轨（theme-theme_* 等自定义 key）；common/light/dark 不在此列
    if (!/^theme-(?!dark$|light$)/.test(mixinName)) continue
    const bodyStart = mm.index + mm[0].length
    let depth = 1
    let i = bodyStart
    while (i < tv.length && depth > 0) {
      if (tv[i] === '{') depth++
      else if (tv[i] === '}') depth--
      i++
    }
    const body = tv.slice(bodyStart, i - 1)
    const declRe = /@([a-zA-Z0-9_-]*color[a-zA-Z0-9_-]*)\s*:\s*([^;]+);(\s*\/\/[^\n]*)?/gi
    let dm
    while ((dm = declRe.exec(body)) !== null) {
      const [, slot, value, comment = ''] = dm
      if (isNearWhiteHex(value)) continue
      if (!isNeutralGrayHex(value)) continue
      const guessed = /语义推断|迁出/.test(comment)
      // 引用计数（common.less 剔定义行后）
      const refRe = new RegExp(`(^|[^@\\w-])@${slot}(?![\\w-])`, 'g')
      const referenced = (common.match(refRe) || []).length > 0
      if (!referenced) continue
      // 🛡️ 2026-10-20 降级（77caa86b/967f9696 双实锤）：BLOCK 曾造成任务级必失败——
      //   跨稿真值表对猜灰槽位**无映射可依**（#2b2b2b 是臆造/内置默认灰，副稿没有对应色），
      //   LLM 重试修不掉 ⇒ BLOCK = 死锁，比它要防的「深色稿发灰」破坏性更大。
      //   门禁侧也拿不到真值表、无法证明「有真值可依」⇒ 全量 WARN 留痕，
      //   交视觉验收/人工评估；诊断随 task.result.lessCompileGate.diagnostics 可审计。
      hits.push({ slot, value: value.trim(), mixin: mixinName, blocked: false, guessed })
    }
  }
  return hits
}

/**
 * 在 fileManager 创建之前预自愈 standalone less，避免虚拟文件缓存住修复前的内容。
 * 副作用：修复成功时写回磁盘，并同步更新内存中的 files 映射。
 */
function healCriticalStandaloneLess(files, outputPath, diagnostics = []) {
  for (const lessFile of collectCriticalLessFiles(outputPath)) {
    const fullPath = join(outputPath, lessFile)
    try {
      // 🔒 R1（2026-09-01）：内存 files map 为单一事实源——优先读内存（可能含写盘后
      // 尚未落盘的修复），内存没有才回退磁盘；避免用磁盘旧内容覆盖内存新内容。
      const memContent = files && typeof files === 'object' ? files[lessFile] : null
      let content = stripMarkdownFence(
        typeof memContent === 'string' ? memContent : readFileSync(fullPath, 'utf-8'),
      )
      // 🔒 2026-11-11：与写盘门禁 `gateStandaloneLessWrite` 共用**同一条**自愈链
      //   （此前这里只跑 healLessSource + healRootFixedSize 两步，其余 6 个 healer
      //   在落盘后门禁上缺失 ⇒ 同一文件两处结论不一致，磁盘坏点无法被救回）。
      const full = healLessFull(content, { sourceType: 'style' })
      if (!full.changed) continue
      content = full.source
      safeWriteFile(fullPath, content)
      if (files && typeof files === 'object') files[lessFile] = content
      diagnostics.push({
        id: 'LESS-AUTOHEAL-001',
        severity: 'INFO',
        sourceType: 'standalone-less',
        file: normalizePath(lessFile),
        line: 1,
        column: 1,
        message: `自动修复 LESS（${full.fixes.join('；')}），已写回磁盘。`,
        healApplied: true
      })
    } catch (err) {
      // 文件不存在（ENOENT）属正常分支，其余异常不阻断门禁流程
      if (err.code !== 'ENOENT') {
        diagnostics.push({
          id: 'LESS-AUTOHEAL-000',
          severity: 'INFO',
          sourceType: 'standalone-less',
          file: normalizePath(lessFile),
          line: 1,
          column: 1,
          message: `预自愈跳过：${err?.message || err}`,
          healApplied: false
        })
      }
    }
  }
}

/**
 * P0-③（2026-09-01）：standalone less 文件 url() 资源引用终验（并入 LessCompileGate 单一收口）。
 *
 * 校验本地资源类 url（含 resources/ 或 images/ 路径、或图片/字体扩展名），
 * 跳过 http(s)/data:/#/var(/gradient/绝对路径；相对路径以 less 文件所在目录为基准解析。
 * 注意不能照搬 validateCssResourceUrls 的「必须含 resources/」过滤——.vue 在 package/ 下
 * 写 url('../resources/images/x.png') 含 resources/，而 common.less 位于 resources/styles/ 内，
 * 写 url('../images/x.png') 不含 resources/（已实锤漏检）。
 * 🔒 R1：优先读内存 files map（单一事实源），内存没有才回退磁盘。
 * 严重度 WARN（不阻断）：文件缺失时生成重试也修不了（无法重新下载），给出明确诊断即可。
 */
function validateStandaloneLessUrls(files, outputPath, diagnostics = []) {
  for (const lessFile of collectCriticalLessFiles(outputPath)) {
    const memContent = files && typeof files === 'object' ? files[lessFile] : null
    let content
    try {
      content =
        typeof memContent === 'string'
          ? memContent
          : readFileSync(join(outputPath, lessFile), 'utf-8')
    } catch {
      continue // 文件不存在属正常分支（如无 common.less）
    }
    if (typeof content !== 'string' || !content.includes('url(')) continue

    const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
    let m
    const reported = new Set()
    while ((m = urlPattern.exec(content)) !== null) {
      const rawUrl = m[2].trim()
      if (
        rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ||
        rawUrl.startsWith('data:') || rawUrl.startsWith('#') ||
        rawUrl.startsWith('var(') || rawUrl.startsWith('linear-gradient') ||
        rawUrl.startsWith('radial-gradient') || rawUrl.startsWith('/')
      ) {
        continue
      }
      // 本地资源判定：resources/ 或 images/ 路径、或图片/字体扩展名
      const looksLikeAsset =
        rawUrl.includes('resources/') ||
        rawUrl.includes('images/') ||
        /\.(png|jpe?g|gif|svg|webp|bmp|ico|woff2?|ttf|eot|otf)(\?.*)?$/i.test(rawUrl)
      if (!looksLikeAsset) continue
      if (reported.has(rawUrl)) continue
      reported.add(rawUrl)

      const resolvedPath = normalizePath(join(outputPath, dirname(lessFile), rawUrl))
      if (!existsSync(resolvedPath)) {
        const line = content.slice(0, m.index).split('\n').length
        diagnostics.push({
          id: 'LESS-URL-001',
          severity: 'WARN',
          sourceType: 'standalone-less',
          file: normalizePath(lessFile),
          line,
          column: 1,
          message: `url() 引用的资源文件不存在: ${rawUrl}（解析为 ${resolvedPath}），预览将 404 静默丢图`,
          snippet: readSnippet(content, line),
          healApplied: false,
        })
      }
    }
  }
}

/**
 * 🛡️ 2026-11-11（bff01bf7 红卡根治）：**以 less 解析器为 oracle 的定点修复**。
 *
 * 为什么需要它：写盘门禁是同步的（`writeFiles` 全同步，less 只有异步 render），
 * 所以落盘前只能做**形态枚举**式检查（001-010）；一旦出现枚举之外的损坏（模型输出
 * 的新变体、未来新增后处理），枚举法必然漏。落盘后链路是异步的，可以**真编译**，
 * 于是这里用 less 自己报出的 `filename:line:column` 作判据，对出错行做确定性手术，
 * 每轮重编译、直到通或轮次耗尽 —— 不依赖「猜有哪些坏形态」。
 *
 * 手术优先级（每轮只动一处，保证可归因与幂等）：
 *   ① 残留行（横幅 / 混入标签 / 裸字面量）⇒ 删行
 *   ② 空值声明（`color:`）⇒ 删行
 *   ③ 值的括号内嵌套声明（`calc( color: x: 1px)`）⇒ 删整条声明
 *   ④ 选择器行报错 ⇒ 删整块（含匹配的 `}`）
 *   ⑤ 其余 ⇒ 删该行
 *
 * 🔴 安全阀：累计删除行数 > 非空行数 25% ⇒ 立即中止并报 BLOCK
 *   （宁可如实失败，也不要把整份样式删成空壳）。
 *
 * @returns {{content: string, action: string, snippet: string} | null} null = 无可手术位置
 */
function applyCompileErrorSurgery(content, errLine) {
  const lines = String(content || '').split('\n')
  if (!lines.length) return null
  const idx = Math.min(Math.max(1, Number(errLine) || 1), lines.length) - 1
  const line = lines[idx]
  const t = line.trim()
  const dropLine = (reason) => {
    lines.splice(idx, 1)
    return { content: lines.join('\n'), action: `drop-line(${reason})`, snippet: t.slice(0, 90) }
  }

  // ① 残留行
  if (BANNER_RESIDUE_RE.test(line) || STRAY_TAG_LINE_RE.test(line) || BARE_LITERAL_LINE_RE.test(line)) {
    return dropLine('residue')
  }
  // 🔴 安全阀：CSS 自定义属性（`--x: v;`）在 LESS 根作用域非法，但它承载整份主题色板。
  //   删掉能让文件编译通过，却把主题变量全丢（视觉静默劣化，比红卡更难查）
  //   ⇒ **拒绝手术**，交由调用方如实报 BLOCK。真因是「主题 mixin 被在根作用域调用」，
  //   属语义决策（该包在哪个选择器里），不做机械猜测。
  if (/^\s*--[\w-]+\s*:/.test(line)) return null
  // ② 空值声明
  if (EMPTY_VALUE_DECL_RE.test(line)) return dropLine('empty-value')

  // ③ 值内嵌套声明（`font-size: calc( color: line-height: 16px);`）⇒ 删整条声明
  if (/[(\[]/.test(line) && /[-a-zA-Z]+\s*:\s*[-a-zA-Z]+\s*:/.test(line)) {
    // 声明可能跨行：向后找到以 `;` 收尾的那一行
    let end = idx
    while (end < lines.length && !/;\s*$/.test(lines[end]) && end - idx < 12) end++
    const removed = lines.splice(idx, end - idx + 1)
    return {
      content: lines.join('\n'),
      action: 'drop-declaration(nested-prop)',
      snippet: removed.join(' ').trim().slice(0, 90),
    }
  }

  // ④ 选择器行报错 ⇒ 删整块
  if (t.includes('{') && !t.startsWith('}')) {
    let depth = 0
    let end = idx
    for (; end < lines.length; end++) {
      for (const ch of stripCommentsAndStrings(lines[end])) {
        if (ch === '{') depth++
        else if (ch === '}') depth--
      }
      if (depth <= 0) break
    }
    const removed = lines.splice(idx, end - idx + 1)
    return {
      content: lines.join('\n'),
      action: 'drop-rule-block',
      snippet: removed[0].trim().slice(0, 90),
    }
  }

  // ⑤ 兜底：删行
  return dropLine('fallback')
}

/**
 * 对某个组件产物目录做「确定性自愈 + 真编译定点修复」，成功则写回磁盘。
 * 供 index.css 重编译（Lite / Max 精修后）与发布前终验共用 —— 单一收口点。
 *
 * @param {string} outputPath 组件产物根目录（绝对路径）
 * @param {{maxRounds?: number, logger?: any}} [options]
 * @returns {Promise<{ok: boolean, skipped?: boolean, applied: string[], error: any, repairedFiles: string[]}>}
 */
export async function repairLessDirectory(outputPath, { maxRounds = 10, logger = null } = {}) {
  const styleDir = join(outputPath, 'resources', 'styles')
  const entry = join(styleDir, 'index.less')
  const applied = []
  const repairedFiles = new Set()
  if (!existsSync(entry)) {
    return { ok: true, skipped: true, applied, repairedFiles: [], error: null }
  }

  const renderEntry = async () => {
    try {
      await less.render(readFileSync(entry, 'utf-8'), {
        filename: entry,
        paths: [styleDir, outputPath],
        javascriptEnabled: true,
      })
      return null
    } catch (e) {
      return e
    }
  }

  // 阶段 1：对产物内全部 .less 跑单一自愈链（与写盘门禁同源），有变更即写回
  for (const rel of Object.keys(collectLessCompileFiles(outputPath))) {
    if (!rel.endsWith('.less')) continue
    const abs = join(outputPath, rel)
    try {
      const full = healLessFull(readFileSync(abs, 'utf-8'), { sourceType: 'style' })
      if (!full.changed) continue
      safeWriteFile(abs, full.source)
      repairedFiles.add(rel)
      applied.push(`${rel}: ${full.fixes.join('；')}`)
    } catch { /* 读不了就跳过，交给编译阶段如实报错 */ }
  }

  let error = await renderEntry()
  if (!error) return { ok: true, applied, repairedFiles: [...repairedFiles], error: null }

  // 阶段 2：oracle 定点手术
  const totalNonEmpty = Object.keys(collectLessCompileFiles(outputPath))
    .filter((f) => f.endsWith('.less'))
    .reduce((n, f) => {
      try { return n + readFileSync(join(outputPath, f), 'utf-8').split('\n').filter((l) => l.trim()).length }
      catch { return n }
    }, 0)
  let removedLines = 0

  for (let round = 1; round <= maxRounds && error; round++) {
    const errFile = error?.filename ? normalizePath(error.filename) : normalizePath(entry)
    const rel = normalizePath(relative(outputPath, errFile))
    const abs = errFile.startsWith('/') ? errFile : join(outputPath, rel)
    if (!existsSync(abs) || !abs.endsWith('.less')) {
      break // 报错落在无法修复的位置（如 node_modules）⇒ 如实失败
    }
    const before = readFileSync(abs, 'utf-8')
    const surgery = applyCompileErrorSurgery(before, error.line)
    if (!surgery || surgery.content === before) break
    removedLines += before.split('\n').length - surgery.content.split('\n').length
    if (totalNonEmpty > 0 && removedLines > totalNonEmpty * 0.25) {
      applied.push(`中止：累计删除 ${removedLines}/${totalNonEmpty} 行超过 25% 安全阀`)
      break
    }
    safeWriteFile(abs, surgery.content)
    repairedFiles.add(rel)
    applied.push(`${rel}:${error.line} ${surgery.action} 「${surgery.snippet}」`)
    logger?.warn?.(`🔧 LESS 真编译修复 [round ${round}] ${rel}:${error.line} ${surgery.action}`, {
      snippet: surgery.snippet,
    })
    error = await renderEntry()
  }

  return { ok: !error, applied, repairedFiles: [...repairedFiles], error }
}

export class LessCompileGate {
  /** 🆕 2026-11-11：真编译自愈（确定性 healer + oracle 定点手术），写回磁盘。 */
  static async repairDirectory(outputPath, options = {}) {
    return repairLessDirectory(outputPath, options)
  }

  static async validateDirectory(outputPath) {
    return this.validate(collectLessCompileFiles(outputPath), { outputPath })
  }

  static async validate(files = {}, options = {}) {
    const diagnostics = []
    // 🛡️ R0-8（2026-09-01）：outputPath 改回**必填**入参，删掉 `|| workspaceRoot` 死兜底。
    // 原兜底两宗罪：
    //   ① 语义错误——workspaceRoot 指向全局 /mvgo/workspace，从来不是任何组件的产物目录；
    //      真被触发时，下面两个磁盘检查会对着错误根目录判定，刷出一堆假 WARN（资源不存在）。
    //   ② 依赖错误——为拿这个默认值，本文件在模块作用域静态 import config/backend-root.js
    //      （import.meta），把整条依赖链拖进 jest 无法加载的死路（见文件头注释）。
    // 全部 4 处生产调用点均显式传入 outputPath，确认该兜底从未被触发：
    //   - mc-component-graph-phase2.js:3425  validate(files, { outputPath: state.outputPath })
    //   - mc-component-graph-phase2.js:2497  validateDirectory(...)  → 内部包装为 { outputPath }
    //   - mc-component-graph-vue3.js:2426    validate(files, { outputPath: state.outputPath })
    //   - mc-component-graph-vue3.js:1592    validateDirectory(state.outputPath)
    //   - snapshot-quality.service.ts:201    validateDirectory(workDir)
    // 缺失时不静默猜一个根路径，而是显式告警并跳过磁盘依赖型检查（诚实降级，不制造假结论）。
    const outputPath = options.outputPath || ''
    if (!outputPath) {
      diagnostics.push({
        id: 'LESS-GATE-001',
        severity: 'WARN',
        sourceType: 'gate',
        file: '(全部)',
        line: 1,
        column: 1,
        message:
          'LessCompileGate.validate 未收到 outputPath（必填）：磁盘依赖型检查（LESS 预自愈写回 / 资源 url() 存在性）已跳过，仅执行内存编译校验。调用方必须显式传入组件产物根目录',
        snippet: '',
        healApplied: false,
      })
    } else {
      // 预愈合必须在 createFileManager 之前：fileManager 会把 files 复制进内部 Map 缓存，
      // 若自愈在其之后执行，wrapper 的 @import 会命中缓存里的旧内容（磁盘已修复但门禁仍 BLOCK）。
      healCriticalStandaloneLess(files, outputPath, diagnostics)

      // P0-③（2026-09-01）：standalone less 的 url() 资源终验并入本门禁（单一收口，WARN 不阻断）。
      // 背景：模型在 common.less 写 url('../images/xxx.png') 完全靠 prompt 自觉，文件名写错 → 预览 404
      // 且 LESS 编译能通过（url() 不参与语法校验）→ 静默丢图。此处对照磁盘真实文件给出明确诊断。
      // .vue <style> 内的 url() 已由 resource-import-guard.validateCssResourceUrls 覆盖，此处只查独立 less。
      validateStandaloneLessUrls(files, outputPath, diagnostics)

      // 🛡️ 2026-10-20（5ef650ff/ee06ee24 实锤）：双真值设计深色轨中性灰猜色门禁。
      //   有副稿真值可依却仍用猜测中性灰 ⇒ BLOCK 触发重试（真值已在 prompt 里，
      //   重试有修正机会）；LLM 亲笔灰 WARN 不挡。fail-open：读不到文件/declare 跳过。
      try {
        const findFile = (suffix) => {
          const key = Object.keys(files || {}).find((k) => normalizePath(k).endsWith(suffix))
          if (key && typeof files[key] === 'string') return files[key]
          try { return readFileSync(join(outputPath, suffix), 'utf-8') } catch { return '' }
        }
        const themeVarsContent = findFile('resources/styles/themes/theme-vars.less') || findFile('resources/styles/theme-vars.less')
        const commonLessContent = findFile('resources/styles/common.less')
        let hasDesignDarkTrack = false
        try {
          const declareRaw = readFileSync(join(outputPath, 'declare.json'), 'utf-8')
          const tc = JSON.parse(declareRaw)?.themeConfig || {}
          hasDesignDarkTrack = tc.dualTruth === true ||
            (Array.isArray(tc.list) && tc.list.some((t) => t && t.key !== 'dark' && t.builtin !== true &&
              (t.brightness === 'dark' || /dark|深色|夜|night/i.test(`${t.key} ${t.name || ''}`))))
        } catch { /* declare 缺失 ⇒ fail-open 跳过 */ }
        if (themeVarsContent && hasDesignDarkTrack) {
          const grayHits = auditDesignDarkTrackGuessedGray({ themeVarsContent, commonLessContent, hasDesignDarkTrack })
          for (const hit of grayHits) {
            // 🛡️ 2026-10-20 降级（77caa86b/967f9696 双实锤）：两级 id 保留语义区分，severity 恒 WARN——
            //   THEME-GRAY-001 = 猜测标记（语义推断/迁出）灰被引用，疑似僵尸灰，视觉验收关注；
            //   THEME-GRAY-002 = 亲笔灰被引用，可能真有灰色。BLOCK 曾致任务必失败（真值表无映射，
            //   LLM 无修复路径），WARN 留痕交人工评估。
            diagnostics.push({
              id: hit.guessed ? 'THEME-GRAY-001' : 'THEME-GRAY-002',
              severity: 'WARN',
              sourceType: 'standalone-less',
              file: 'resources/styles/themes/theme-vars.less',
              line: 1,
              column: 1,
              message: `设计深色轨 .${hit.mixin}() 的 @${hit.slot} = ${hit.value} 为中性灰且被 common.less 引用${hit.guessed ? '（语义推断/迁出，疑似内置默认灰顶替副稿色板）' : ''}——跨稿真值表对该槽位无映射时以人工/视觉验收为准`,
              snippet: `@${hit.slot}: ${hit.value};`,
              healApplied: false,
            })
          }
        }
      } catch (e) {
        diagnostics.push({
          id: 'THEME-GRAY-000',
          severity: 'WARN',
          sourceType: 'gate',
          file: '(theme-gray-audit)',
          line: 1,
          column: 1,
          message: `设计深色轨中性灰审计执行异常（非阻断）：${e?.message || String(e)}`,
          snippet: '',
          healApplied: false,
        })
      }
    }

    const fileManager = createFileManager(files, outputPath)
    const entries = Object.entries(files || {})

    const renderSource = async (source, absFile) => {
      try {
        await less.render(source, {
          filename: absFile,
          paths: [dirname(absFile), outputPath],
          plugins: [{ install(_, pluginManager) { pluginManager.addFileManager(fileManager) } }],
          javascriptEnabled: false
        })
        return null
      } catch (error) {
        return error
      }
    }

    // 🎯 2026-10-05 报错归属修正（mc-max-1791132079721-6b655282 真机实锤）：
    // less 对「@import 进来的文件内」的语法错误，给出的是**被导入文件**的 filename/line；
    // 但旧实现无条件套用调用方的 `lineOffset`（.vue 的 <style> 起始行偏移）并把 file 写成调用方，
    // ⇒ 同一处病灶（common.less:91）被每个 .vue 平移成 107 / 154 / 166 等**互不相同的假行号**，
    //    顶层报错消息与 L0-B 修复提示（buildFixGuidance）随之指错文件，
    //    下游按 issue.file 计算的 `_reviseFiles` 还会把 **4 个无辜 .vue** 列为重写目标（有改坏好代码的风险）。
    // 修正：仅当 error.filename ≠ 当前编译文件、且该路径**确实存在**（内存 files map / 磁盘）时，
    // 才认定「导入文件内报错」→ file 取相对 outputPath 的路径、行号以该文件为基准、lineOffset 归零。
    // ⚠️ File 型错误（createFileManager 抛的「无法加载 LESS 依赖」）指向的是**找不到**的路径，
    //    存在性检查会把它挡在外面 ⇒ 继续走「在当前源里反查 @import 行」的旧逻辑，语义不变
    //    （snapshot-quality.service#collapseMissingImportDuplicates 依赖该语义，勿破）。
    const resolveErrorOrigin = (error, file) => {
      const compiledAbs = normalizePath(join(outputPath || '', file))
      const errFile = error?.filename ? normalizePath(error.filename) : ''
      if (!errFile || errFile === compiledAbs) return null
      const rel = outputPath ? normalizePath(relative(outputPath, errFile)) : errFile
      const memHit = files && typeof files === 'object' ? files[rel] : null
      if (typeof memHit === 'string') return { file: rel, source: memHit }
      try {
        if (!existsSync(errFile)) return null
        return { file: rel, source: readFileSync(errFile, 'utf-8') }
      } catch {
        return null
      }
    }

    const compile = async ({ file, source, sourceType, styleIndex = null, lineOffset = 0 }) => {
      const absoluteFilename = join(outputPath, file)
      const cleaned = stripMarkdownFence(source)
      const error = await renderSource(cleaned, absoluteFilename)
      if (!error) return
      const origin = resolveErrorOrigin(error, file)
      if (origin) {
        diagnostics.push(toDiagnostic({
          error,
          file: origin.file,
          source: origin.source,
          sourceType,
          styleIndex: null,
          lineOffset: 0,
          importedFrom: normalizePath(file),
        }))
        return
      }
      diagnostics.push(toDiagnostic({ error, file, source: cleaned, sourceType, styleIndex, lineOffset }))
    }

    // 对单个 .vue 的 style 内容做「未闭合块注释」自动修复，并仅在修复后能干净编译时才写回磁盘。
    // 返回最终用于校验的 SFC 源码（已修复或原样）。
    const healAndMaybeWriteVue = async (file, originalSource) => {
      const healed = healLessSource(originalSource, { sourceType: 'vue' })
      if (!healed.changed) return originalSource
      const healedStyles = extractLessStyles(healed.source)
      let healedOk = healedStyles.length > 0
      for (const s of healedStyles) {
        if (await renderSource(s.content, join(outputPath, file))) {
          healedOk = false
          break
        }
      }
      if (healedOk) {
        safeWriteFile(join(outputPath, file), healed.source)
        // 🔒 R1（2026-09-01）：自愈结果同步回写内存 files map（单一事实源），
        // 避免「磁盘已修但候选快照/下游校验仍读旧内容」的分叉。
        if (files && typeof files === 'object') files[file] = healed.source
        diagnostics.push({
          id: 'LESS-AUTOHEAL-001',
          severity: 'INFO',
          sourceType: 'sfc-style',
          file: normalizePath(file),
          line: 1,
          column: 1,
          message: '自动补全未闭合块注释（如 `/* ===` 横幅注释漏写 `*/`），已修复并写回文件。建议生成阶段显式闭合块注释。',
          healApplied: true
        })
        return healed.source
      }
      return originalSource
    }

    for (const [rawPath, content] of entries) {
      const file = normalizePath(rawPath)
      if (file.endsWith('.vue')) {
        const sourceToUse = await healAndMaybeWriteVue(file, String(content))
        const styles = extractLessStyles(sourceToUse)
        for (const style of styles) {
          await compile({
            file,
            source: style.content,
            sourceType: 'sfc-style',
            styleIndex: style.index,
            lineOffset: style.startLine - 1
          })
        }
      } else if (file === SHARED_LESS || file.endsWith('/resources/styles/index.less')) {
        await compile({ file, source: String(content), sourceType: 'shared-less' })
      }
    }

    // L1 增强：对关键 LESS 文件单独编译校验（捕获 common.less 等独立文件的语法错误）
    // 注意：dark.less / light.less 含 `&.dark` / `&.light` 嵌套选择器，且依赖 theme-vars.less 定义的
    // `.theme-dark()` / `.theme-light()` mixin，本就不能脱离 index.less 的 @import 链被孤立编译
    // （孤立编译必报 ".theme-dark is undefined" / "& 无父选择器" 的误报）。它们已由上方 SFC 的
    // `index.less` 链路覆盖校验，故此处仅保留自洽可独立编译的 common.less 与 theme-vars.less。
    // 自愈已由 healCriticalStandaloneLess 在 fileManager 创建前完成，此处直接读取修复后的磁盘内容。
    const criticalLessFiles = collectCriticalLessFiles(outputPath)

    // 主题变量文件正则：theme-vars.less / dark.less / light.less 自身不参与 prepend（避免自我 import 循环）
    const THEME_FILE_RE = /(^|\/)(theme-vars|dark|light)\.less$/

    for (const lessFile of criticalLessFiles) {
      const fullPath = join(outputPath, lessFile)
      try {
        // 防御性剥除 Markdown 围栏（LLM 偶尔在 .less 首行带 ```less）
        let content = stripMarkdownFence(readFileSync(fullPath, 'utf-8'))
        // 兼容：standalone 编译不经过 index.less 的 import 链，若文件引用主题变量却未自行 @import，
        // 会自动 prepend 同目录（或 themes/ 子目录）的 theme-vars.less，消除 "variable @x is undefined" 误报
        const hasOwnThemeImport = /@import\s+['"][^'"]*theme-vars\.less['"]/.test(content)
        let selectedThemePath = null
        if (!THEME_FILE_RE.test(lessFile)) {
          // 🛡️ 2026-09-30 修复（事故 mc-max-1790759302006-e22f2263）：候选顺序改为「themes/ 子目录优先」，
          // 与 index.less 的实际 `@import './themes/theme-vars.less'` 对齐（单一事实源 = 真实 import 指向）。
          // 事故成因：产物普遍并存两份 theme-vars.less（workspace 8/8 组件实测）——
          //   resources/styles/themes/theme-vars.less ← index.less 真正引用，含系统注入的 §3 核心槽位
          //                                              （@color-bg-container 等），是唯一被 @import 的那份；
          //   resources/styles/theme-vars.less        ← LLM 生成的孤儿（全仓 0 处 @import），缺核心槽位。
          // 旧顺序「同目录优先」⇒ wrapper 拿孤儿版当主题源 ⇒ `.theme-light()` 里找不到 @color-bg-container
          // ⇒ 假阳性 BLOCK `common.less:91:10 variable @color-bg-container is undefined`
          // （实测：同一产物 index.less 完整链路编译成功、index.css 已正确产出 color:#ffffff、预览正常）。
          const themeCandidates = [
            join(dirname(fullPath), 'themes', 'theme-vars.less'),
            join(dirname(fullPath), 'theme-vars.less')
          ]
          selectedThemePath = themeCandidates.find(candidate => existsSync(candidate)) || null
          if (!hasOwnThemeImport && selectedThemePath) {
            const relImport = './' + normalizePath(relative(dirname(fullPath), selectedThemePath))
            content = `@import '${relImport}';\n${content}`
          }
        }

        // common.less 不能脱离主题作用域孤立编译。分别模拟 dark.less/light.less 的真实调用顺序：
        // .common() + 对应主题 mixin 生效后再导入 common.less，既能捕获变量断链，也不会产生假失败。
        if (lessFile.endsWith('resources/styles/common.less') && selectedThemePath) {
          const themeSource = readFileSync(selectedThemePath, 'utf-8')
          const relTheme = './' + normalizePath(relative(dirname(fullPath), selectedThemePath))
          const commonCall = /\.common\s*\(/.test(themeSource) ? '.common();\n' : ''
          const wrappers = []
          if (/\.theme-dark\s*\(/.test(themeSource)) {
            wrappers.push(`.__less_gate_dark__ {\n${commonCall}.theme-dark();\n@import (multiple) './common.less';\n}`)
          }
          if (/\.theme-light\s*\(/.test(themeSource)) {
            wrappers.push(`.__less_gate_light__ {\n${commonCall}.theme-light();\n@import (multiple) './common.less';\n}`)
          }
          if (wrappers.length === 0 && commonCall) {
            wrappers.push(`.__less_gate_common__ {\n${commonCall}@import (multiple) './common.less';\n}`)
          }
          if (wrappers.length > 0) {
            content = `@import '${relTheme}';\n${wrappers.join('\n')}`
          }
        }
        await compile({
          file: lessFile,
          source: content,
          sourceType: 'standalone-less'
        })
      } catch (err) {
        // 文件不存在时忽略，存在但编译失败时记录错误
        if (err.code !== 'ENOENT') {
          // 编译错误已在 compile 函数中记录到 diagnostics
        }
      }
    }

    // 仅 BLOCK 严重度计入通过/阻断判定；INFO（如自动补全未闭合注释）只作可见性记录，不阻断发布
    const blockDiagnostics = diagnostics.filter(d => d.severity === 'BLOCK')
    return {
      pass: blockDiagnostics.length === 0,
      blockCount: blockDiagnostics.length,
      diagnostics,
      checkedFiles: entries.map(([file]) => normalizePath(file)).filter(file => file.endsWith('.vue') || file.endsWith('.less'))
    }
  }

  static buildFixGuidance(result) {
    const diagnostics = result?.diagnostics || []
    if (!diagnostics.length) return ''
    // 🎯 2026-10-05：归属修正后，同一个真实病灶会由多个 @import 方各报一条（本次事故 6 条 → 同一
    // `common.less:91`）。修复提示按 `file:line:column` 去重，并把各引入方合并到同一条，
    // 避免模型看到 6 条近乎相同的指令而误判成「6 个文件都要改」。
    const merged = new Map()
    for (const item of diagnostics) {
      const key = `${item.file}:${item.line}:${item.column}`
      const hit = merged.get(key)
      if (hit) {
        if (item.importedFrom && !hit.importers.includes(item.importedFrom)) {
          hit.importers.push(item.importedFrom)
        }
        continue
      }
      merged.set(key, {
        ...item,
        importers: item.importedFrom ? [item.importedFrom] : [],
      })
    }
    const lines = ['\n\n🔴 上次产物未通过 LESS 真实编译门禁。只修改下列文件并修复语法，不要改动布局与业务逻辑：']
    Array.from(merged.values()).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.file}:${item.line}:${item.column} ${item.message}`)
      const current = item.snippet?.find(row => row.current)
      if (current) lines.push(`   错误代码：${current.code.trim()}`)
      if (item.importers.length > 0) {
        lines.push(`   引入方：${item.importers.join('、')} 通过 @import 引用了该文件 —— 请只修此文件，不要改引入方`)
      }
      if (item.hint?.suggestion) lines.push(`   诊断建议：${item.hint.suggestion}`)
      // 变量未定义：不是语法错误，自动修复需明确给出补 import 的指引
      const varMatch = String(item.message || '').match(/variable @([\w-]+) is undefined/)
      if (varMatch) {
        lines.push(`   诊断建议：变量 @${varMatch[1]} 未定义。该变量若来自主题变量文件（theme-vars.less），请在文件顶部添加 @import './theme-vars.less';（或实际相对路径的主题变量定义文件）后重试，不要删除变量引用。`)
      }
    })
    lines.push('修复后必须保证所有 <style lang="less"> 与 resources/styles/index.less 均可被 less.render 成功编译。')
    return lines.join('\n')
  }
}

export default LessCompileGate
