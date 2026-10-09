#!/usr/bin/env node
/**
 * verify-theme-common-migrate — 离线验证「`.common()` 颜色变量迁出」是否生效（零 LLM 额度、只读真产物）。
 *
 * 治本三件里有两件**不必真机生成**就能验证：
 *   ① 生成器 `style-tokens#renderMicrocodeThemeVarsLess` —— 拿真实产物的 theme-vars.less 当 prior 重放；
 *   ② 自愈器 `less-variable-checker#healCommonColorVars` —— 在**临时副本**上演练。
 * 判据一律用仓内权威门禁 `theme-color-guard#detectThemeColorViolations`，不写副本。
 *
 * 🔒 **安全保证**：真产物**只读**。自愈器演练写到 `os.tmpdir()` 下的副本，跑完即删；
 *    脚本结尾会重算真实文件哈希并断言未变（变了直接 exit 2）。
 *
 * 用法（cwd 必须是 backend-node）：
 *   node scripts/verify-theme-common-migrate.mjs                 # 自动挑最新的 5 个脏产物
 *   node scripts/verify-theme-common-migrate.mjs --limit 10
 *   node scripts/verify-theme-common-migrate.mjs --all           # 全部命中产物
 *   node scripts/verify-theme-common-migrate.mjs --dir <组件目录>  # 指定单个组件
 *   node scripts/verify-theme-common-migrate.mjs --theme light   # 指定设计主题（默认 dark）
 *
 * ⚠️ WorkBuddy/sandbox Bash 里请加 env -i + NODE_OPTIONS（否则 Exit 137 SIGTERM）：
 *   env -i PATH=... HOME=... NODE_OPTIONS="--max-old-space-size=2048" node scripts/verify-theme-common-migrate.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BE_DIR = path.resolve(__dirname, '..')

const { detectThemeColorViolations } = await import(
  path.join(BE_DIR, 'src/ai-engine/utils/theme-color-guard.js')
)
const { renderMicrocodeThemeVarsLess } = await import(
  path.join(BE_DIR, 'src/ai-engine/utils/style-tokens.js')
)
const { LessVariableChecker } = await import(
  path.join(BE_DIR, 'src/ai-engine/validators/less-variable-checker.js')
)

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const valOf = (f, d) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}
const LIMIT = has('--all') ? Infinity : Number(valOf('--limit', 5)) || 5
const DIR_ARG = valOf('--dir', null)
const THEME = valOf('--theme', 'dark')

const COMPONENTS_DIR = path.resolve(BE_DIR, '../frontend/src/workspace/custom-components')

const TV_REL = 'resources/styles/themes/theme-vars.less'
const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12)

const blockOf = (less, name) =>
  (name === 'common'
    ? String(less).match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
    : String(less).match(new RegExp(`\\.${name}\\s*\\(\\s*\\)\\s*\\{([^}]*)\\}`))
  )?.[1] ?? ''

/** .common() 内的字面量色值行（展示用；判据本身走门禁） */
const literalColorLines = (blk) =>
  blk
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^@[a-zA-Z0-9_-]*?color[a-zA-Z0-9_-]*\s*:\s*[^;]+;/i.test(l) ||
                   /^@[a-zA-Z0-9_-]+\s*:\s*(#|rgba?\(|hsla?\()/i.test(l))

const hasVar = (blk, name) => new RegExp(`@${name}\\s*:`).test(blk)

/** 与门禁扫描口径一致：resources/{styles,config} 递归 + package/*.vue */
function gatherFiles(dir) {
  const files = []
  const walk = (p, rel) => {
    let es = []
    try {
      es = fs.readdirSync(p, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of es) {
      const fp = path.join(p, e.name)
      const r = `${rel}/${e.name}`
      if (e.isDirectory()) walk(fp, r)
      else if (/\.(less|css|vue|js|json)$/.test(e.name)) {
        try {
          files.push({ path: r, content: fs.readFileSync(fp, 'utf8') })
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(path.join(dir, 'resources/styles'), 'resources/styles')
  walk(path.join(dir, 'resources/config'), 'resources/config')
  const pkg = path.join(dir, 'package')
  try {
    for (const f of fs.readdirSync(pkg)) {
      if (f.endsWith('.vue')) files.push({ path: `package/${f}`, content: fs.readFileSync(path.join(pkg, f), 'utf8') })
    }
  } catch {
    /* ignore */
  }
  return files
}

const gateOn = (files) =>
  detectThemeColorViolations(files).find((v) => v.id === 'THEME-COMMON-COLOR-VAR') || null

const sevLabel = (hit) => (hit ? `${hit.severity}` : '无 ✅')

// ── 选目标 ───────────────────────────────────────────────────────────────────
let targets = []
if (DIR_ARG) {
  targets = [path.resolve(DIR_ARG)]
} else {
  let names = []
  try {
    names = fs.readdirSync(COMPONENTS_DIR)
  } catch {
    console.error(`[err] 找不到组件目录: ${COMPONENTS_DIR}`)
    process.exit(1)
  }
  const dirty = []
  for (const n of names) {
    const dir = path.join(COMPONENTS_DIR, n)
    const tv = path.join(dir, TV_REL)
    if (!fs.existsSync(tv)) continue
    if (!gateOn(gatherFiles(dir))) continue
    dirty.push({ dir, mtimeMs: fs.statSync(tv).mtimeMs })
  }
  dirty.sort((a, b) => b.mtimeMs - a.mtimeMs)
  targets = dirty.slice(0, LIMIT).map((d) => d.dir)
}

if (!targets.length) {
  console.log('✅ 未找到命中 THEME-COMMON-COLOR-VAR 的产物 —— 存量已收口。')
  process.exit(0)
}

console.log(`离线重放 ${targets.length} 个产物（设计主题=${THEME}，判据=theme-color-guard 门禁）\n`)

// ── 真实文件完整性护栏 ────────────────────────────────────────────────────────
const before = new Map()
for (const dir of targets) {
  const tv = path.join(dir, TV_REL)
  if (fs.existsSync(tv)) before.set(tv, sha(tv))
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mvgo-migrate-verify-'))
let pass = 0
let fail = 0

for (const dir of targets) {
  const name = path.basename(dir)
  const tvPath = path.join(dir, TV_REL)
  const prior = fs.readFileSync(tvPath, 'utf8')
  console.log(`══ ${name}`)

  // ── A. 生成器重放 ──────────────────────────────────────────────────────────
  const rendered = renderMicrocodeThemeVarsLess(
    { defaultTheme: THEME === 'light' ? 'light' : 'dark' },
    prior,
  )
  const beforeHit = gateOn([{ path: TV_REL, content: prior }])
  const afterHit = gateOn([{ path: TV_REL, content: rendered }])
  const cBefore = blockOf(prior, 'common')
  const cAfter = blockOf(rendered, 'common')
  const moved = literalColorLines(cBefore).map((l) => l.match(/^@([a-zA-Z0-9_-]+)/)[1])

  console.log(`  [A 生成器重放] .common() 字面量色值行 ${literalColorLines(cBefore).length} → ${literalColorLines(cAfter).length}`)
  console.log(`                 门禁 THEME-COMMON-COLOR-VAR: ${sevLabel(beforeHit)} → ${sevLabel(afterHit)}`)
  if (moved.length) {
    const both = moved.every(
      (k) => hasVar(blockOf(rendered, 'theme-light'), k) && hasVar(blockOf(rendered, 'theme-dark'), k),
    )
    console.log(`                 迁出槽位两侧都有定义: ${both ? '✅' : '❌'}  (${moved.map((k) => '@' + k).join(', ')})`)
  }
  const okA = !afterHit && literalColorLines(cAfter).length === 0 && moved.every((k) =>
    hasVar(blockOf(rendered, 'theme-light'), k) && hasVar(blockOf(rendered, 'theme-dark'), k))

  // ── B. 自愈器演练（临时副本，绝不碰真产物）──────────────────────────────────
  const tmpDir = fs.mkdtempSync(path.join(tmpRoot, 'c-'))
  const tmpTv = path.join(tmpDir, 'theme-vars.less')
  fs.writeFileSync(tmpTv, prior, 'utf8')
  const heal = LessVariableChecker.healCommonColorVars(tmpTv)
  const healedContent = fs.readFileSync(tmpTv, 'utf8')
  const bAfterHit = gateOn([{ path: TV_REL, content: healedContent }])
  console.log(`  [B 自愈器演练] removed=${heal.removed}  names=[${heal.names.join(', ')}]`)
  console.log(`                 injected=[${heal.injected.join(', ')}]`)
  console.log(`                 门禁: ${sevLabel(beforeHit)} → ${sevLabel(bAfterHit)}`)
  const cHealed = blockOf(healedContent, 'common')
  const okB = literalColorLines(cHealed).length === 0 && (heal.names.length === 0 || heal.removed > 0)

  const ok = okA && okB
  console.log(`  ⇒ ${ok ? '✅ PASS' : '❌ FAIL'}\n`)
  if (ok) pass++
  else fail++

  fs.rmSync(tmpDir, { recursive: true, force: true })
}

fs.rmSync(tmpRoot, { recursive: true, force: true })

// ── 真产物未被改动断言 ────────────────────────────────────────────────────────
let mutated = []
for (const [tv, h] of before) {
  if (!fs.existsSync(tv) || sha(tv) !== h) mutated.push(tv)
}

console.log(`结果: ${pass} PASS / ${fail} FAIL`)
if (mutated.length) {
  console.error(`❌ 真产物被改动（这是脚本 bug）: ${mutated.join(', ')}`)
  process.exit(2)
}
console.log('🔒 真产物哈希未变 —— 全程只读 ✅')
process.exit(fail > 0 ? 1 : 0)
