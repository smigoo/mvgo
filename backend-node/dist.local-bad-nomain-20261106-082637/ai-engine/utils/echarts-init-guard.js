/**
 * echarts.init 时序结构分析（AST，非正则写法枚举）。
 *
 * 背景：CODE-011 最初用「白名单正则」枚举延迟写法（await nextTick / nextTick(cb) /
 * rAF / setTimeout / 尺寸守卫），模型每多一种等价正确写法就要硬编码一个分支，永远补不完。
 * 2026-08-16 一天内两次误杀（nextTick 回调形式、尺寸守卫 + ResizeObserver）都源于此。
 *
 * 本模块改为结构分析：用 @babel/parser 解析 <script setup> 为 AST，找到所有
 * echarts.init(...) 调用点，判断每个调用点的「执行时机」是否已延迟到 DOM 尺寸 settle 后，
 * 而非枚举具体 API 写法。判定分两层：
 *
 *   1. 词法层：echarts.init 直接处于延迟上下文（nextTick/rAF/setTimeout/ResizeObserver/
 *      watch 回调、尺寸守卫条件块、await 之后）；
 *   2. 跨函数层：echarts.init 被抽到命名函数（如 initChart），而该函数的【所有调用点】
 *      都处于延迟上下文（如 nextTick(() => initChart())）——模型最常见的包装写法。
 *
 * 兜底策略（宁漏勿杀）：解析失败 / 遍历异常时返回「无同步 init」，交由 sfc-syntax
 * 门禁处理语法错误，本模块只做时序判断，绝不因自身解析问题误杀组件。
 */

import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'

// @babel/traverse 是 CJS（module.exports = { default: traverse, ... }），
// 兼容 ESM（.default 指向函数）与 ts-jest CJS（可能直接是函数）两种环境。
const traverse = _traverse.default || _traverse

/** 标准异步延迟 API（语义标识，非写法枚举——这些是 Vue/浏览器的有限标准 API） */
const DEFERRED_APIS = new Set([
  'nextTick',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'ResizeObserver',
  'watch',
  'watchEffect',
])

/** 尺寸标识属性名（DOM 尺寸就绪的语义信号） */
const SIZE_PROPS = new Set(['clientWidth', 'clientHeight'])

/** 判断节点是否为 echarts.init(...) 调用 */
function isEchartsInitCall(node) {
  const callee = node?.callee
  return (
    node?.type === 'CallExpression' &&
    callee?.type === 'MemberExpression' &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'echarts' &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'init'
  )
}

/**
 * 判断节点是否为延迟 API 调用/构造（如 nextTick(...) / window.setTimeout(...) /
 * new ResizeObserver(...)）。注意 ResizeObserver 是 NewExpression 而非 CallExpression。
 */
function isDeferredApiNode(node) {
  if (!node) return false
  if (node.type === 'CallExpression' || node.type === 'NewExpression') {
    const callee = node.callee
    if (callee?.type === 'Identifier') return DEFERRED_APIS.has(callee.name)
    if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
      return DEFERRED_APIS.has(callee.property.name)
    }
  }
  return false
}

/**
 * 判断 IfStatement 的 test 是否含尺寸守卫（clientWidth/clientHeight 的数值比较）。
 */
function isSizeGuardTest(node) {
  if (!node) return false
  let found = false
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return
    if (n.type === 'BinaryExpression' && ['>', '>=', '<', '<='].includes(n.operator)) {
      const left = n.left?.type === 'MemberExpression' ? n.left.property?.name : n.left?.name
      const right = n.right?.type === 'MemberExpression' ? n.right.property?.name : n.right?.name
      if (SIZE_PROPS.has(left) || SIZE_PROPS.has(right)) {
        found = true
        return
      }
    }
    for (const key of Object.keys(n)) {
      if (['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments'].includes(key)) continue
      const child = n[key]
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object') visit(child)
    }
  }
  visit(node)
  return found
}

/**
 * 判断某个 path 的词法祖先链上是否存在延迟边界（回调内延迟 / 尺寸守卫 / await）。
 */
function hasDeferredAncestor(path) {
  let p = path
  while (p) {
    const node = p.node
    if ((node.type === 'CallExpression' || node.type === 'NewExpression') && isDeferredApiNode(node)) return true
    if (node.type === 'IfStatement' && isSizeGuardTest(node.test)) return true
    if (node.type === 'AwaitExpression') return true
    p = p.parentPath
  }
  return false
}

/**
 * 判断某个 path 所在语句块内、其前序语句是否含 await（await nextTick(); init()）。
 */
function hasAwaitBefore(path) {
  try {
    const stmt = path.getStatementParent()
    if (!stmt) return false
    const parent = stmt.parentPath
    if (!parent || !parent.isBlockStatement?.()) return false
    const body = parent.node.body || []
    const idx = body.indexOf(stmt.node)
    if (idx <= 0) return false
    for (let i = 0; i < idx; i++) {
      const s = body[i]
      if (s?.type === 'ExpressionStatement' && s.expression?.type === 'AwaitExpression') return true
    }
  } catch {
    return false
  }
  return false
}

/**
 * 判断 echarts.init 是否处于「惰性初始化守卫」内（如 `if (!chart) chart = echarts.init(...)`）。
 * 返回守卫变量名（如 `chart`），否则返回 null。
 *
 * 惰性守卫保证 init 只在实例为空时执行一次；首次执行的时机由所在函数的调用点决定。
 * 因此只要存在至少一个「延迟调用点」（如 onMounted 内 await nextTick() 后调用），
 * 首次 init 就是延迟的，后续同步调用点（如 refresh 回调）会因实例已存在而跳过 init。
 */
function hasLazyInitGuard(path) {
  let p = path
  while (p) {
    const node = p.node
    if (node.type === 'IfStatement') {
      const test = node.test
      // if (!chart) {...}
      if (test?.type === 'UnaryExpression' && test.operator === '!' && test.argument?.type === 'Identifier') {
        return test.argument.name
      }
      // if (!chart && width > 0) {...} → 左侧为 !chart
      if (test?.type === 'LogicalExpression' && test.operator === '&&') {
        const left = test.left
        if (left?.type === 'UnaryExpression' && left.operator === '!' && left.argument?.type === 'Identifier') {
          return left.argument.name
        }
      }
      return null // 遇到 IfStatement 但非惰性守卫，停止向上
    }
    p = p.parentPath
  }
  return null
}

/**
 * 获取 path 最近命名函数名（const initChart = () => {...} → 'initChart'）。
 * 若 echarts.init 不处于任何命名函数内，返回 null。
 */
function getEnclosingFunctionName(path) {
  const fn = path.getFunctionParent()
  if (!fn) return null
  const parent = fn.parentPath
  if (!parent) return null
  // const initChart = () => {...} / function initChart() {...}
  if (parent.isVariableDeclarator?.()) {
    const id = parent.node.id
    if (id?.type === 'Identifier') return id.name
  }
  if (parent.isFunctionDeclaration?.()) {
    const id = parent.node.id
    if (id?.type === 'Identifier') return id.name
  }
  return null
}

/**
 * 检测 echarts.init 是否有「同步 init」（未等待 DOM 尺寸 settle 即执行）。
 * @param {string} scriptContent - <script setup> 内容
 * @returns {{ hasSyncInit: boolean, syncInitCount: number, syncInits: Array<{line:number}>, reason?: string }}
 */
export function checkEchartsInitTiming(scriptContent = '') {
  let ast
  try {
    ast = parse(String(scriptContent || ''), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'topLevelAwait', 'importMeta'],
      errorRecovery: false,
    })
  } catch {
    // 解析失败：不 BLOCK（语法错误由 sfc-syntax 门禁处理）
    return { hasSyncInit: false, syncInitCount: 0, syncInits: [], reason: 'parse-failed' }
  }

  try {
    const initPaths = []
    const callSitesByName = new Map() // 函数名 -> 调用点 path 数组

    traverse(ast, {
      CallExpression(path) {
        if (isEchartsInitCall(path.node)) {
          initPaths.push(path)
          return
        }
        // 收集命名函数调用点（用于跨函数层：判断包装函数的调用点是否延迟）
        const callee = path.node.callee
        if (callee?.type === 'Identifier') {
          if (!callSitesByName.has(callee.name)) callSitesByName.set(callee.name, [])
          callSitesByName.get(callee.name).push(path)
        }
      },
    })

    const syncInits = []
    for (const initPath of initPaths) {
      // 1. 词法层：echarts.init 直接处于延迟上下文
      if (hasDeferredAncestor(initPath)) continue
      if (hasAwaitBefore(initPath)) continue

      // 2. 跨函数层：echarts.init 在命名函数 F 内，F 的所有调用点都延迟
      const fnName = getEnclosingFunctionName(initPath)
      if (fnName) {
        const callSites = callSitesByName.get(fnName) || []
        // 有调用点且每个调用点都处于延迟上下文 → 视为已延迟
        if (callSites.length > 0 && callSites.every((cs) => hasDeferredAncestor(cs) || hasAwaitBefore(cs))) {
          continue
        }
      }

      // 3. 惰性初始化守卫（if (!chart) chart = echarts.init(...)）：
      //    init 只在实例为空时执行一次，首次执行时机由函数调用点决定。
      //    只要存在至少一个延迟调用点，首次 init 即延迟（后续同步调用点因实例已存在而跳过 init）。
      if (fnName && hasLazyInitGuard(initPath)) {
        const callSites = callSitesByName.get(fnName) || []
        if (callSites.length > 0 && callSites.some((cs) => hasDeferredAncestor(cs) || hasAwaitBefore(cs))) {
          continue
        }
      }

      syncInits.push({ line: initPath.node.loc?.start?.line ?? 0 })
    }

    return {
      hasSyncInit: syncInits.length > 0,
      syncInitCount: syncInits.length,
      syncInits,
    }
  } catch {
    // 遍历异常：不 BLOCK
    return { hasSyncInit: false, syncInitCount: 0, syncInits: [], reason: 'traverse-error' }
  }
}

/**
 * 检测 echarts 是否挂了 resize 监听（ResizeObserver / window.resize / window.onresize）。
 *
 * 设计原则「漏检不误杀」：识别以下任一 resize 信号即视为「已挂监听」放行；
 * 解析失败 / 遍历异常一律放行（不因自身解析问题误杀组件）。
 *
 * resize 信号（任一）：
 *   1. `.resize()` 调用（MemberExpression.property === 'resize'）
 *   2. `new ResizeObserver(...)` 构造
 *   3. `addEventListener('resize', ...)` 调用
 *   4. `.onresize = ...` 赋值（如 window.onresize = () => chart.resize()）
 *
 * @param {string} scriptContent - <script setup> 内容
 * @returns {{ hasResizeListener: boolean, reason?: string }}
 */
export function checkEchartsResizeListener(scriptContent = '') {
  let ast
  try {
    ast = parse(String(scriptContent || ''), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'topLevelAwait', 'importMeta'],
      errorRecovery: false,
    })
  } catch {
    // 解析失败：放行（宁漏勿杀，语法错误由 sfc-syntax 门禁处理）
    return { hasResizeListener: true, reason: 'parse-failed' }
  }

  let hasResize = false
  try {
    traverse(ast, {
      CallExpression(path) {
        if (hasResize) return
        const callee = path.node.callee
        // 1. `.resize()` 调用（如 chart.resize()）
        if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier' && callee.property.name === 'resize') {
          hasResize = true
          return
        }
        // 3. `addEventListener('resize', ...)`
        if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier' && callee.property.name === 'addEventListener') {
          const firstArg = path.node.arguments?.[0]
          if (firstArg?.type === 'StringLiteral' && firstArg.value === 'resize') {
            hasResize = true
          }
        }
      },
      NewExpression(path) {
        if (hasResize) return
        // 2. `new ResizeObserver(...)`
        if (path.node.callee?.type === 'Identifier' && path.node.callee.name === 'ResizeObserver') {
          hasResize = true
        }
      },
      AssignmentExpression(path) {
        if (hasResize) return
        // 4. `.onresize = ...`（如 window.onresize = ...）
        const left = path.node.left
        if (left?.type === 'MemberExpression' && left.property?.type === 'Identifier' && left.property.name === 'onresize') {
          hasResize = true
        }
      },
    })
  } catch {
    // 遍历异常：放行
    return { hasResizeListener: true, reason: 'traverse-error' }
  }

  return { hasResizeListener: hasResize }
}

export default {
  checkEchartsInitTiming,
  checkEchartsResizeListener,
}
