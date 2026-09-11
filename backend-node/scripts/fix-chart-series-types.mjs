#!/usr/bin/env node
/**
 * 存量收敛：把 workspace 产物里**非法 echarts series.type** 归一为注册名。
 *
 * 背景（2026-09-11，mc-max-1789062564333-f1ff01eb 事故）：
 *   Loop 2.1.E 的旧实现把「未校验的 vision 真值」当回退值，导致
 *   `area-line` / `面积折线图` / `分组柱状图` 这类非法别名被原样写进 series.type，
 *   运行时报 `[ECharts] Unknown series area-line`，**整条 series 被丢弃**（只剩空坐标轴）。
 *   旧正则还无差别替换 series 数组内所有 `type:` 键，把 lineStyle.type / 渐变 type 一起改坏。
 *
 * 本脚本复用**修好的内核**（src/ai-engine/utils/chart-type-guard.js）对存量做确定性收敛：
 *   1) series 元素顶层 type：非法别名 → 注册名（无真值时按别名表/关键词归一）
 *   2) `color: { type: … }` → linear/radial；`lineStyle: { type: … }` → solid/dashed/dotted
 *   3) 括号配平提取完整 series 数组（修掉 lazy 正则漏段落）
 *
 * 用法：
 *   node scripts/fix-chart-series-types.mjs            # dry-run，仅报告
 *   node scripts/fix-chart-series-types.mjs --apply    # 实际写入
 *
 * 注意：不带 vision 真值（history 产物无真值），因此只做「别名 → 注册名」归一，
 * 不改变已是注册名的 type（保守，不做跨类型强改）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSeriesInSource } from '../src/ai-engine/utils/chart-type-guard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')

/**
 * 搜索根（2026-09-11 修订：从「枚举两个副本根」改为「通用发现」）。
 *
 * 🔴 教训：首版只列了 `{backend,frontend}/workspace/custom-components`，
 * 漏掉 **temp-components**（预览回退根，未提升组件也能匿名预览）→ 那里仍有
 * 59 处非法 type 裸露。凡是「产物根」都不该靠枚举，改为扫描根下的 package/ 目录。
 */
const SEARCH_ROOTS = ['backend-node/workspace', 'frontend/workspace', 'temp-components']

/** 组件目录 = 含 `package/` 子目录的目录（workspace/<root>/<id> 与 temp-components/<groupId>/<id> 通吃） */
const MAX_DISCOVERY_DEPTH = 3

const apply = process.argv.includes('--apply')

/** 只扫 package/ 与 package/components/ 两层（.vue 落点） */
function listVueFiles(componentDir) {
  const out = []
  for (const sub of ['', 'components']) {
    const dir = path.join(componentDir, 'package', sub)
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.vue')) out.push(path.join(dir, e.name))
    }
  }
  return out
}

/**
 * 递归发现组件目录（含 package/ 的目录）。跳过 `_` 前缀（`_shared-cache` 等）
 * 与 node_modules；深度上限 MAX_DISCOVERY_DEPTH 防止遍历爆炸。
 */
function discoverComponentDirs(root, depth = 0, acc = []) {
  if (depth > MAX_DISCOVERY_DEPTH) return acc
  let entries
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return acc
  }
  const names = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))
  if (names.has('package')) {
    acc.push(root)
    return acc // 组件目录内部不再下探
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name.startsWith('_') || e.name === 'node_modules' || e.name.startsWith('.')) continue
    discoverComponentDirs(path.join(root, e.name), depth + 1, acc)
  }
  return acc
}

function listComponentDirs(root) {
  if (!fs.existsSync(root)) return []
  return discoverComponentDirs(root)
}

/** 报告里展示「改前 → 改后」的 type 值分布，便于人工复核 */
function diffTypeValues(before, after) {
  const grab = (s) => [...s.matchAll(/type\s*:\s*(['"])([^'"]+)\1/g)].map((m) => m[2])
  const b = grab(before)
  const a = grab(after)
  const changed = []
  for (let i = 0; i < Math.max(b.length, a.length); i += 1) {
    if (b[i] !== a[i]) changed.push(`'${b[i]}' → '${a[i]}'`)
  }
  return changed
}

let totalFiles = 0
let changedFiles = 0
let totalChanged = 0
const unresolved = new Set()

for (const rel of SEARCH_ROOTS) {
  const root = path.join(REPO_ROOT, rel)
  if (!fs.existsSync(root)) continue
  console.log(`\n=== ${rel} ===`)
  for (const componentDir of listComponentDirs(root)) {
    for (const file of listVueFiles(componentDir)) {
      totalFiles += 1
      const before = fs.readFileSync(file, 'utf8')
      if (!before.includes('series')) continue
      const { text, changed } = normalizeSeriesInSource(before, {})
      if (changed === 0) continue
      changedFiles += 1
      totalChanged += changed
      const short = path.relative(REPO_ROOT, file)
      console.log(`  ✏️  ${short}  (${changed} 处)`)
      for (const d of diffTypeValues(before, text)) console.log(`        ${d}`)
      if (apply) fs.writeFileSync(file, text, 'utf8')
    }
  }
}

// 复核：写盘后用**同一内核**重扫（changed > 0 即仍非法）。
// 不用正则/取值黑名单复核 —— 黑名单漏 `'area'`（无中文无连字符）这类隐藏类别，
// 且会误报 MIME `type: 'application/octet-stream'`。内核口径 = 与管线完全一致。
if (apply) {
  console.log('\n=== 复核（内核口径：normalizeSeriesInSource 仍能改动 = 仍非法） ===')
  let stillBad = 0
  for (const rel of SEARCH_ROOTS) {
    const root = path.join(REPO_ROOT, rel)
    if (!fs.existsSync(root)) continue
    for (const componentDir of listComponentDirs(root)) {
      for (const file of listVueFiles(componentDir)) {
        const src = fs.readFileSync(file, 'utf8')
        if (!src.includes('series')) continue
        const { changed } = normalizeSeriesInSource(src, {})
        if (changed > 0) {
          stillBad += 1
          console.log(`  🔴 仍非法  ${path.relative(REPO_ROOT, file)}  (${changed} 处)`)
        }
      }
    }
  }
  if (stillBad === 0) console.log('  ✅ 无残留（全部为 echarts 注册名）')
  else unresolved.add(`(见上，共 ${stillBad} 个文件)`)
}

console.log(
  `\n${apply ? '[已写入]' : '[dry-run]'} 扫描 ${totalFiles} 个 .vue，命中 ${changedFiles} 个文件、共 ${totalChanged} 处收敛`,
)
if (unresolved.size > 0) {
  console.log(`未识别别名（需人工确认）：${[...unresolved].join(', ')}`)
}
if (!apply) console.log('（加 --apply 实际写入）')
