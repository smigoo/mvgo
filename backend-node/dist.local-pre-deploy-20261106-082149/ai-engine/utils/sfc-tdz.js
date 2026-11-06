/**
 * 引用型 TDZ 检测与修复（2026-09-10）
 *
 * 统一编号中心：RUNTIME-STATIC-001（预防运行时 RUNTIME-009/010），
 * 见 validators/runtime-static-rules.js（G3 立项：静态规则 ↔ 运行时码 单一映射表）。
 *
 * 纯函数、零依赖、**无 import.meta**，便于 jest 单测（sfc-semantics.js 含 import.meta 导致 CJS 转换失败，
 * 故将 TDZ 治理单独拆出）。sfc-semantics.js 通过 re-export 透传，既有调用方无需改动。
 *
 * 背景（env 样本 mc-max-1789019718053-fb0a0de7 实锤）：
 *   index.vue 的 <script setup> 把 `watch(activeTab, ...)` 写在 `const activeTab = ref(...)` 之前 →
 *   运行时 "Cannot access 'activeTab' before initialization"，setup 中断、组件空白。
 *   根因：scriptSplit 把脚本拆为 状态/生命周期/图表 三段合并，mergeScriptParts 只做 import/Builder/
 *        生命周期 hook 去重，**不做声明顺序校验**，引用型 TDZ 漏网写盘。
 *
 * 与 findTdzAssignments（裸赋值型 TDZ）的区别：
 *   - 赋值型：`x = ...` 出现在 `const x` 之前；
 *   - 引用型：非声明语句读取/调用了索引更大的 const/let 声明。
 */

/**
 * 将 <script> 内部内容按顶层语句切分（括号深度感知，不进函数体）。
 * 仅用于 TDZ 检测的「跨语句顺序」比对；行为需与 sfc-semantics.splitTopLevelStatements 一致。
 * @param {string} body 不含 <script> 标签的脚本内容
 * @returns {{ text: string, isDecl: boolean, declName: string|null, key: string }[]}
 */
function splitTopLevelStatements(body) {
  const stmts = []
  if (!body || typeof body !== 'string') return stmts
  const lines = body.split('\n')
  let depth = 0
  let cur = null
  const pushCur = () => {
    if (cur && cur.text.trim()) {
      stmts.push({ text: cur.text.trim(), isDecl: cur.isDecl, declName: cur.declName, key: cur.text.trim().replace(/\s+/g, ' ') })
    }
    cur = null
  }
  for (const line of lines) {
    const trimmed = line.trim()
    const open = (line.match(/[({[]/g) || []).length
    const close = (line.match(/[)}\]]/g) || []).length
    const startsBlock = depth === 0 && trimmed.length > 0
    if (startsBlock) {
      pushCur()
      const m = trimmed.match(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/)
      cur = { text: line, isDecl: !!m, declName: m ? m[1] : null }
    } else if (cur) {
      cur.text += '\n' + line
    } else if (trimmed.length > 0) {
      const m = trimmed.match(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/)
      stmts.push({ text: trimmed, isDecl: !!m, declName: m ? m[1] : null, key: trimmed.replace(/\s+/g, ' ') })
    }
    depth += open - close
    if (depth < 0) depth = 0
  }
  pushCur()
  return stmts
}

/**
 * 引用型 TDZ 检测：非声明语句读取/调用了索引更大的 const/let/class 声明。
 * 判定口径（保守，避免误报）：
 *   - 仅比对顶层语句（不进入函数体，函数体调用时才求值不构成 TDZ）；
 *   - 仅当引用位置 < 该变量首次声明位置时命中；
 *   - 排除 function/var 声明（提升语义，无 TDZ）；排除 import 绑定（提升语义）。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {Array<{name:string, refIndex:number, declIndex:number, kind:string}>}
 */
export function findTdzReferences(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return []
  const stmts = splitTopLevelStatements(scriptBody)
  if (stmts.length === 0) return []

  // 首次声明位置（仅 const/let/class；function/var 提升，不构成 TDZ）
  const declIdx = new Map()
  const declKind = new Map()
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]
    if (!s.isDecl || !s.declName || declIdx.has(s.declName)) continue
    const kindM = s.text.trim().match(/^(const|let|var|function|class)\b/)
    const kind = kindM ? kindM[1] : 'const'
    if (kind === 'function' || kind === 'var') continue // 提升，无 TDZ
    declIdx.set(s.declName, i)
    declKind.set(s.declName, kind)
  }
  if (declIdx.size === 0) return []

  const identRx = /[A-Za-z_$][\w$]*/g
  const hits = []
  const seen = new Set()
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]
    if (s.isDecl) continue
    if (/^\s*import\b/.test(s.text)) continue // import 绑定具提升语义
    for (const m of s.text.matchAll(identRx)) {
      const name = m[0]
      if (!declIdx.has(name)) continue
      const d = declIdx.get(name)
      if (d <= i) continue // 引用在声明之后 → 合法
      const key = `${name}@${i}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ name, refIndex: i, declIndex: d, kind: declKind.get(name) || 'const' })
    }
  }
  return hits
}

/**
 * 引用型 TDZ 自动修复：把被提前引用的声明语句整体上移到首次引用之前（语义等价、不删语句）。
 * 迭代处理（每次移最靠前声明），上限 50 次防死循环；若某声明初始化又依赖更晚声明 → 残余交由门禁 fail-closed。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {{ content: string, fixed: string[] }}
 */
export function autoFixTdzReferences(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return { content: scriptBody, fixed: [] }
  let stmts = splitTopLevelStatements(scriptBody)
  if (stmts.length === 0) return { content: scriptBody, fixed: [] }

  const fixed = []
  for (let guard = 0; guard < 50; guard++) {
    const hits = findTdzReferences(stmts.map(s => s.text).join('\n'))
    if (hits.length === 0) break
    hits.sort((a, b) => a.declIndex - b.declIndex || a.refIndex - b.refIndex)
    const target = hits[0]
    const declStmt = stmts[target.declIndex]
    if (!declStmt) break
    const insertAt = target.refIndex
    if (insertAt >= target.declIndex) break // 理论与实现不符，放弃防死循环
    const next = stmts.slice()
    next.splice(target.declIndex, 1)
    next.splice(insertAt, 0, declStmt)
    stmts = next
    fixed.push(`把 ${target.name} 的声明上移到首次引用之前`)
  }

  if (fixed.length === 0) return { content: scriptBody, fixed: [] }
  return { content: stmts.map(s => s.text).join('\n\n'), fixed }
}
