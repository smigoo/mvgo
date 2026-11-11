#!/usr/bin/env node
/**
 * 🛡️ 2026-11-11 · 存量产物 LESS 坏点批量修复 / 体检
 *
 * 背景：Lite / Max 两条生成线都可能落下「语法坏但结构门看不见」的样式文件
 * （横幅残片 `}====`、混入 `</style>`、被截断的悬空声明 `color:`、根级裸属性、
 * 值内嵌套声明、模型回答正文被追加到文件尾）。这类产物在预览里表现为：
 *   「组件样式 (LESS) 渲染失败 … Unrecognised input」，而任务卡片仍显示「完整 100%」。
 *
 * 本脚本用**与线上门禁同一实现**（`repairLessDirectory`：确定性 healer + 以 less 报错
 * 行号为 oracle 的定点手术）逐个组件真编译 + 修复：
 *   · 能确定性修好的 → 写回磁盘（`--write`），并再次编译验证；
 *   · 修不好的 → 如实列出「文件:行:列 + 报错」，**不做破坏性删除**；
 *   · `--dry-run`（默认）只报告，不动磁盘。
 *
 * 🆕 发布前门禁标记（`.less-gate.json`）也纳入体检：`selfHealLessBeforePublish` 遇到
 * 「不可确定性修复」的产物会写该标记且**不阻断发布**，标记随 buildStagingCopy 一起复制到
 * workspace。此前没有任何消费方 ⇒ 信号静默放行。本脚本现在逐个扫到并显式汇总告警，
 * 只读模式只要「坏产物 > 0」或「门禁 BLOCK 标记 > 0」即 `exit 2`，可直接挂到发布前/CI。
 *
 * 用法：
 *   node scripts/repair-less-artifacts.mjs                       # 体检 backend workspace
 *   node scripts/repair-less-artifacts.mjs --write               # 修复并写回
 *   node scripts/repair-less-artifacts.mjs --write --root <dir>  # 指定产物根目录（可重复）
 *   npm run verify:less-gate                                    # 前后端两处 workspace 发布前体检
 */
import { existsSync, readFileSync, readdirSync, cpSync } from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
import less from 'less'
import { repairLessDirectory } from '../src/ai-engine/validators/less-compile-gate.js'

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const roots = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) roots.push(args[++i])
}
if (!roots.length) {
  // ⚠️ 必须用 fileURLToPath：仓库路径含中文，URL.pathname 会 percent-encode（%E5%B7%A5…）
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
  roots.push(join(repoRoot, 'workspace', 'custom-components'))
}

const compile = async (dir) => {
  const styleDir = join(dir, 'resources/styles')
  const entry = join(styleDir, 'index.less')
  if (!existsSync(entry)) return { skipped: true }
  try {
    await less.render(readFileSync(entry, 'utf-8'), {
      filename: entry,
      paths: [styleDir, dir],
      javascriptEnabled: true,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e }
  }
}

// 只备份样式目录（含 themes/），体积小、回滚精准；不复制图片资源
const backup = (dir) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(dir, `.less-heal-backup-${stamp}`)
  cpSync(join(dir, 'resources', 'styles'), dest, { recursive: true })
  return dest
}

const LESS_GATE_MARKER = '.less-gate.json'
let healthy = 0
let broken = 0
let fixed = 0
let unfixable = 0
let blockedMarkers = 0
const markerDetails = []

for (const root of roots) {
  if (!existsSync(root)) {
    console.warn(`⚠️ 跳过不存在的根目录：${root}`)
    continue
  }
  console.log(`\n=== 体检 ${root}`)
  const names = readdirSync(root).filter(
    (n) => !n.startsWith('.') && !n.includes('.quality-') && !n.includes('.lessbak-') && n !== 'node_modules',
  )

  for (const name of names) {
    const dir = join(root, name)

    // 🛡️ 发布前门禁 BLOCK 标记（不可确定性修复类）。必须放在 index.less 存在性 continue
    //    **之前**：Vue3/页面产物可能没有 resources/styles/index.less，但照样可能带标记。
    const markerPath = join(dir, LESS_GATE_MARKER)
    if (existsSync(markerPath)) {
      try {
        const marker = JSON.parse(readFileSync(markerPath, 'utf-8'))
        if (marker?.pass === false) {
          blockedMarkers++
          markerDetails.push({
            root,
            name,
            blockCount: marker.blockCount,
            checkedAt: marker.checkedAt,
            first: Array.isArray(marker.diagnostics) ? marker.diagnostics[0] : null,
            hint: marker.hint,
          })
        }
      } catch (e) {
        // 标记文件损坏本身也是异常信号，绝不当「没有标记」静默跳过
        blockedMarkers++
        markerDetails.push({ root, name, parseError: String(e?.message || e) })
      }
    }

    if (!existsSync(join(dir, 'resources/styles/index.less'))) continue
    const before = await compile(dir)
    if (before.skipped) continue

    if (before.ok) {
      healthy++
      continue
    }

    broken++
    const e = before.error
    console.log(`\n❌ ${name}`)
    console.log(`   ${String(e.filename || 'index.less').split('/custom-components/').pop()}:${e.line}:${e.column} ${String(e.message).split('\n')[0]}`)

    if (!WRITE) continue

    const bak = backup(dir)
    const repair = await repairLessDirectory(dir)
    const after = await compile(dir)
    if (after.ok) {
      fixed++
      console.log(`   ✅ 已修复（${repair.applied.length} 处），备份：${basename(bak)}`)
      repair.applied.slice(0, 6).forEach((a) => console.log(`      · ${a}`))
    } else {
      unfixable++
      console.log(`   ⛔ 仍失败：${after.error?.line}:${after.error?.column} ${String(after.error?.message).split('\n')[0]}`)
      repair.applied.slice(0, 4).forEach((a) => console.log(`      · ${a}`))
      console.log('   ℹ️ 样式目录已从备份还原，避免留下半修复状态')
      cpSync(bak, join(dir, 'resources', 'styles'), { recursive: true, force: true })
    }
  }
}

if (markerDetails.length) {
  console.log(`\n=== ⛔ 发布前门禁 BLOCK 标记 ${blockedMarkers} 个（不可确定性修复：需重新生成或人工修样式）`)
  for (const d of markerDetails) {
    if (d.parseError) {
      console.log(`   ${d.name} (${d.root}) · 标记文件解析失败：${d.parseError}`)
      continue
    }
    const f = d.first
    const at = f ? `${f.file || '?'}:${f.line ?? '?'}:${f.column ?? '?'} ${String(f.message || '').split('\n')[0]}` : '无诊断明细'
    console.log(`   ${d.name} (${d.root}) · block=${d.blockCount ?? '?'} · ${at} · ${d.checkedAt || ''}`)
    if (d.hint) console.log(`      ℹ️ ${d.hint}`)
  }
}

console.log(
  `\n合计：健康 ${healthy} · 坏 ${broken} · 门禁 BLOCK ${blockedMarkers}` +
    (WRITE ? ` · 已修复 ${fixed} · 仍失败 ${unfixable}` : '（只读体检，加 --write 才写回）'),
)
// 发布前/CI 判据：只读体检发现坏产物或 BLOCK 标记即失败，绝不静默放行
if (!WRITE && (broken > 0 || blockedMarkers > 0)) process.exitCode = 2
