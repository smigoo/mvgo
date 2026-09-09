/**
 * JS 构建门禁（2026-08-07 血泪教训落地）
 *
 * 背景：backend-node/package.json 无 "type":"module"，但 ai-engine/** 全是 ESM .js。
 * 原 build 只 tsc(.ts) + tar 拷贝(.js)，从不校验 .js 语法。
 * `node --check` 因模块类型歧义先按 CJS 脚本宽松解析 → 模块级语法错误（未闭合字符串等）
 * 漏判为通过；真实运行 import() 走严格 ESM 编译才炸 compileSourceTextModule，且堆栈无文件名。
 *
 * 本门禁：
 *  1) [阻断] 用 acorn sourceType:'module' 校验所有 src/ai-engine 下的 .js 语法。
 *     模块解析失败且脚本模式也失败 → 真实语法错误 → 退出码 1（阻断构建，防止坏 .js 上线）。
 *     模块解析失败但脚本模式通过 → 视为 CJS 文件，跳过（不误杀）。
 *  2) [WARN 不阻断] acorn-walk AST 扫描「调用了但未定义/漏 import」的标识符。
 *     已知误报：page.evaluate 内的浏览器全局（getComputedStyle 等），故仅告警。
 */
import { parse } from 'acorn'
import { simple as walkSimple } from 'acorn-walk'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname, relative, dirname } from 'path'
import { fileURLToPath } from 'url'

const BACKEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(BACKEND_ROOT, 'src', 'ai-engine')
if (!statSync(TARGET, { optional: true })) {
  console.log(`[js-gate] 跳过：${TARGET} 不存在`)
  process.exit(0)
}

function collectJs(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const s = statSync(p)
    if (s.isDirectory()) collectJs(p, out)
    else if (extname(p) === '.js') out.push(p)
  }
  return out
}

const files = collectJs(TARGET)
let syntaxErrors = 0
let warnUndefined = 0
const PARSE_OPTS = {
  ecmaVersion: 'latest',
  allowReturnOutsideFunction: true,
  allowHashBang: true,
  locations: true,
}

function collectParams(params, set) {
  for (const p of params) {
    if (p.type === 'Identifier') set.add(p.name)
    else if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') set.add(p.left.name)
  }
}

console.log(`[js-gate] 扫描 ${files.length} 个 .js（sourceType:module 校验）...`)

for (const f of files) {
  const rel = relative(process.cwd(), f)
  const code = readFileSync(f, 'utf-8')
  let ast
  try {
    ast = parse(code, { ...PARSE_OPTS, sourceType: 'module' })
  } catch (eModule) {
    try {
      parse(code, { ...PARSE_OPTS, sourceType: 'script' })
      // 脚本模式能过 → 这是 CJS 文件，跳过门禁
      continue
    } catch (eScript) {
      syntaxErrors++
      console.error(`❌ SYNTAX ERROR [${rel}]\n   ${eModule.message}`)
      continue
    }
  }

  // —— 未定义调用扫描（WARN）——
  const bindings = new Set()
  walkSimple(ast, {
    ImportDeclaration(n) { for (const s of n.specifiers) if (s.local) bindings.add(s.local.name) },
    VariableDeclarator(n) { if (n.id?.type === 'Identifier') bindings.add(n.id.name) },
    FunctionDeclaration(n) { if (n.id) bindings.add(n.id.name) },
    ClassDeclaration(n) { if (n.id) bindings.add(n.id.name) },
    FunctionExpression(n) { collectParams(n.params, bindings) },
    ArrowFunctionExpression(n) { collectParams(n.params, bindings) },
    CatchClause(n) { if (n.param?.type === 'Identifier') bindings.add(n.param.name) },
  })
  walkSimple(ast, {
    CallExpression(n) {
      if (n.callee?.type === 'Identifier') {
        const name = n.callee.name
        if (!bindings.has(name) && !(name in globalThis)) {
          warnUndefined++
          console.warn(`⚠️ 未定义调用 ${rel}:${n.loc?.start?.line}  ${name}(...)`)
        }
      }
    },
    NewExpression(n) {
      if (n.callee?.type === 'Identifier') {
        const name = n.callee.name
        if (!bindings.has(name) && !(name in globalThis)) {
          warnUndefined++
          console.warn(`⚠️ 未定义 new ${rel}:${n.loc?.start?.line}  new ${name}(...)`)
        }
      }
    },
  })
}

console.log(`\n[js-gate] 完成：语法错误 ${syntaxErrors} 个，未定义调用告警 ${warnUndefined} 个`)
if (syntaxErrors > 0) {
  console.error('❌ 存在 ESM 语法错误，构建中断（防止坏 .js 上线到运行时才炸）')
  process.exit(1)
}
if (warnUndefined > 0) {
  console.warn('⚠️ 未定义调用为告警（非阻断），请人工复核（可能为 page.evaluate 浏览器全局等误报）')
}
console.log('✅ JS 门禁通过')
process.exit(0)
