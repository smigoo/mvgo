#!/usr/bin/env node
/**
 * 颜色变量替换脚本
 * 将 .vue / .less 文件中的硬编码颜色替换为 CSS 变量
 *
 * 用法: node scripts/replace-colors.mjs <directory>
 * 仅处理 src/ 下的 .vue 和 .less 文件，排除 workspace/custom-components/ 和 workspace/vue3-components/
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// 排除目录
const EXCLUDE_DIRS = [
  'workspace/custom-components',
  'workspace/vue3-components',
  'node_modules',
  '.workbuddy',
]

// === 替换规则 ===
// 按精度从高到低排列，先匹配长模式再匹配短模式

// hex 颜色替换（不区分大小写）
const HEX_RULES = [
  // 品牌蓝色系
  { pattern: /#2563[eE][bB]/g, replacement: 'var(--brand)' },
  { pattern: /#1[dD]4[eE][dD]8/g, replacement: 'var(--brand-hover)' },
  { pattern: /#1[eE]40[aA][fF]/g, replacement: 'var(--brand-active)' },
  { pattern: /#3[bB]82[fF]6/g, replacement: 'var(--brand-light)' },
  { pattern: /#60[aA]5[fF][aA]/g, replacement: 'var(--brand-light)' },
  { pattern: /#93[cC]5[fF][dD]/g, replacement: 'var(--c-blue-300)' },
  { pattern: /#1[eE]3[aA]8[aA]/g, replacement: 'var(--c-blue-900)' },

  // 文字色
  { pattern: /#0[fF]172[aA]/g, replacement: 'var(--text-primary)' },
  { pattern: /#1[aA]1[aA]1[aA]/g, replacement: 'var(--text-primary)' },
  { pattern: /#1[aA]1[aA]2[eE]/g, replacement: 'var(--text-primary)' },
  { pattern: /#2[bB]2[eE]3[bB]/g, replacement: 'var(--text-primary)' },
  { pattern: /#111827/g, replacement: 'var(--text-primary)' },
  { pattern: /#1d2129/g, replacement: 'var(--text-primary)' },
  { pattern: /#475569/g, replacement: 'var(--text-secondary)' },
  { pattern: /#334155/g, replacement: 'var(--text-secondary)' },
  { pattern: /#64[67]48[bB]/g, replacement: 'var(--text-tertiary)' }, // #64748b
  { pattern: /#6[bB]7280/g, replacement: 'var(--text-tertiary)' },
  { pattern: /#8[cC]8[cC]8[cC]/g, replacement: 'var(--text-tertiary)' },
  { pattern: /#94[aA]3[bB]8/g, replacement: 'var(--text-tertiary)' },
  { pattern: /#9[cC][aA]3[aA][fF]/g, replacement: 'var(--text-tertiary)' },
  // 3-digit hex — use negative lookahead to avoid matching 6-digit hex prefix
  { pattern: /#333(?![0-9a-fA-F])/g, replacement: 'var(--text-primary)' },
  { pattern: /#333333(?![0-9a-fA-F])/g, replacement: 'var(--text-primary)' },
  { pattern: /#999(?![0-9a-fA-F])/g, replacement: 'var(--text-tertiary)' },
  { pattern: /#999999(?![0-9a-fA-F])/g, replacement: 'var(--text-tertiary)' },
  { pattern: /#888(?![0-9a-fA-F])/g, replacement: 'var(--text-tertiary)' },
  { pattern: /#888888(?![0-9a-fA-F])/g, replacement: 'var(--text-tertiary)' },
  { pattern: /#aaa(?![0-9a-fA-F])/g, replacement: 'var(--text-quaternary)' },
  { pattern: /#aaaaaa(?![0-9a-fA-F])/g, replacement: 'var(--text-quaternary)' },
  { pattern: /#bbb(?![0-9a-fA-F])/g, replacement: 'var(--text-quaternary)' },
  { pattern: /#bbbbbb(?![0-9a-fA-F])/g, replacement: 'var(--text-quaternary)' },
  { pattern: /#555(?![0-9a-fA-F])/g, replacement: 'var(--text-secondary)' },
  { pattern: /#555555(?![0-9a-fA-F])/g, replacement: 'var(--text-secondary)' },
  { pattern: /#666(?![0-9a-fA-F])/g, replacement: 'var(--text-secondary)' },
  { pattern: /#666666(?![0-9a-fA-F])/g, replacement: 'var(--text-secondary)' },
  { pattern: /#444(?![0-9a-fA-F])/g, replacement: 'var(--text-secondary)' },
  { pattern: /#444444(?![0-9a-fA-F])/g, replacement: 'var(--text-secondary)' },

  // 边框色
  { pattern: /#[eE]2[eE]8[fF]0/g, replacement: 'var(--border-default)' },
  { pattern: /#[eE]8[eE]8[eE]8/g, replacement: 'var(--border-default)' },
  { pattern: /#f0f0f0/g, replacement: 'var(--border-light)' },
  { pattern: /#[eE]5[eE]7[eE][bB]/g, replacement: 'var(--border-default)' },
  { pattern: /#[eE]0[eE]0[eE]0/g, replacement: 'var(--border-default)' },
  { pattern: /#d9d9d9/g, replacement: 'var(--border-strong)' },
  { pattern: /#d1d5db/g, replacement: 'var(--border-strong)' },
  { pattern: /#ccc(?![0-9a-fA-F])/g, replacement: 'var(--border-strong)' },
  { pattern: /#cccccc(?![0-9a-fA-F])/g, replacement: 'var(--border-strong)' },
  { pattern: /#ddd(?![0-9a-fA-F])/g, replacement: 'var(--border-default)' },
  { pattern: /#dddddd(?![0-9a-fA-F])/g, replacement: 'var(--border-default)' },
  { pattern: /#eee(?![0-9a-fA-F])/g, replacement: 'var(--border-light)' },
  { pattern: /#eeeeee(?![0-9a-fA-F])/g, replacement: 'var(--border-light)' },

  // 背景色
  { pattern: /#f8fafc/g, replacement: 'var(--bg-page)' },
  { pattern: /#f0f4fa/g, replacement: 'var(--bg-page)' },
  { pattern: /#f1f5f9/g, replacement: 'var(--bg-alt)' },
  { pattern: /#f5f5f5/g, replacement: 'var(--bg-alt)' },
  { pattern: /#fafafa/g, replacement: 'var(--bg-hover)' },
  { pattern: /#f9fafb/g, replacement: 'var(--bg-hover)' },

  // 状态色 — 绿色
  { pattern: /#52c41a/g, replacement: 'var(--success)' },
  { pattern: /#16a34a/g, replacement: 'var(--success)' },
  { pattern: /#22c55e/g, replacement: 'var(--success-light)' },
  { pattern: /#15803d/g, replacement: 'var(--success)' },
  { pattern: /#dcfce7/g, replacement: 'var(--success-bg)' },
  { pattern: /#f6ffed/g, replacement: 'var(--success-bg)' },
  { pattern: /#f0fdf4/g, replacement: 'var(--success-bg)' },
  { pattern: /#b7eb8f/g, replacement: 'var(--success-border)' },
  { pattern: /#389e0d/g, replacement: 'var(--success)' },

  // 状态色 — 红色
  { pattern: /#ff4d4f/g, replacement: 'var(--error)' },
  { pattern: /#ef4444/g, replacement: 'var(--error)' },
  { pattern: /#dc2626/g, replacement: 'var(--error-text)' },
  { pattern: /#fee2e2/g, replacement: 'var(--error-bg)' },
  { pattern: /#fff1f0/g, replacement: 'var(--error-bg)' },
  { pattern: /#fff2f0/g, replacement: 'var(--error-bg)' },
  { pattern: /#fef2f2/g, replacement: 'var(--error-bg)' },
  { pattern: /#ffccc7/g, replacement: 'var(--error-border)' },
  { pattern: /#ff7875/g, replacement: 'var(--error-light)' },
  { pattern: /#ffa39e/g, replacement: 'var(--error-light)' },
  { pattern: /#fecaca/g, replacement: 'var(--error-border)' },
  { pattern: /#b91c1c/g, replacement: 'var(--error-text)' },

  // 状态色 — 橙/黄
  { pattern: /#fa8c16/g, replacement: 'var(--warning)' },
  { pattern: /#f59e0b/g, replacement: 'var(--warning-light)' },
  { pattern: /#FFF7ED/gi, replacement: 'var(--warning-bg)' },
  { pattern: /#fff7e6/g, replacement: 'var(--warning-bg)' },
  { pattern: /#fef3c7/g, replacement: 'var(--warning-bg)' },
  { pattern: /#faad14/g, replacement: 'var(--warning)' },
  { pattern: /#FF9800/gi, replacement: 'var(--warning-light)' },
  { pattern: /#d97706/gi, replacement: 'var(--warning)' },
  { pattern: /#8C6900/gi, replacement: 'var(--warning-text)' },

  // 状态色 — 紫色
  { pattern: /#7C3AED/gi, replacement: 'var(--feature)' },
  { pattern: /#722ed1/g, replacement: 'var(--feature)' },
  { pattern: /#8b5cf6/g, replacement: 'var(--c-purple-500)' },
  { pattern: /#e0e7ff/g, replacement: 'var(--feature-bg)' },
  { pattern: /#ede9fe/g, replacement: 'var(--feature-bg)' },

  // 青色
  { pattern: /#13c2c2/g, replacement: 'var(--c-cyan-500)' },

  // 页脚背景
  { pattern: /#050810/g, replacement: 'var(--bg-footer)' },
  { pattern: /#0b1120/g, replacement: 'var(--bg-page)' },

  // 滚动条
  { pattern: /#b7b8b9/g, replacement: 'var(--scrollbar-thumb)' },
  { pattern: /#bfbfbf/g, replacement: 'var(--scrollbar-thumb)' },
]

// rgba 颜色替换
const RGBA_RULES = [
  // 品牌蓝 rgba
  { pattern: /rgba\(\s*37\s*,\s*99\s*,\s*235\s*,\s*0?\.?04\s*\)/g, replacement: 'var(--brand-bg-hover)' },
  { pattern: /rgba\(\s*37\s*,\s*99\s*,\s*235\s*,\s*0?\.?06\s*\)/g, replacement: 'var(--brand-bg-hover)' },
  { pattern: /rgba\(\s*37\s*,\s*99\s*,\s*235\s*,\s*0?\.?08\s*\)/g, replacement: 'var(--brand-bg-active)' },
  { pattern: /rgba\(\s*37\s*,\s*99\s*,\s*235\s*,\s*0?\.?1(?:0)?\s*\)/g, replacement: 'var(--brand-bg)' },
  { pattern: /rgba\(\s*37\s*,\s*99\s*,\s*235\s*,\s*0?\.?12\s*\)/g, replacement: 'var(--brand-bg-active)' },
  { pattern: /rgba\(\s*37\s*,\s*99\s*,\s*235\s*,\s*0?\.?15\s*\)/g, replacement: 'var(--brand-border)' },
  { pattern: /rgba\(\s*37\s*,\s*99\s*,\s*235\s*,\s*0?\.?2(?:0)?\s*\)/g, replacement: 'var(--brand-border)' },

  // 阴影
  { pattern: /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.?04\s*\)/g, replacement: 'var(--shadow-sm)' },
  { pattern: /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.?06\s*\)/g, replacement: 'var(--shadow-sm)' },
  { pattern: /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.?1(?:0)?\s*\)/g, replacement: 'var(--shadow-dropdown)' },
  { pattern: /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.?15\s*\)/g, replacement: 'var(--shadow-md)' },

  // 错误色 rgba
  { pattern: /rgba\(\s*239\s*,\s*68\s*,\s*68\s*,\s*0?\.?04\s*\)/g, replacement: 'var(--error-bg)' },
  { pattern: /rgba\(\s*239\s*,\s*68\s*,\s*68\s*,\s*0?\.?08\s*\)/g, replacement: 'var(--error-bg)' },
]

// 需要跳过的行（已有 var() 引用的行不重复处理）
const SKIP_LINE_PATTERNS = [
  /var\(--/,
]

function shouldSkipLine(line) {
  // 如果行已经有 var(--xxx) 并且不包含硬编码颜色，跳过
  // 但如果行同时包含 var() 和硬编码颜色，仍需处理
  return false
}

function processContent(content) {
  let result = content
  let changes = 0

  // 先处理 rgba 规则（因为它们更长更具体）
  for (const rule of RGBA_RULES) {
    const matches = result.match(rule.pattern)
    if (matches) {
      result = result.replace(rule.pattern, rule.replacement)
      changes += matches.length
    }
  }

  // 再处理 hex 规则
  for (const rule of HEX_RULES) {
    const matches = result.match(rule.pattern)
    if (matches) {
      result = result.replace(rule.pattern, rule.replacement)
      changes += matches.length
    }
  }

  return { content: result, changes }
}

function walkDir(dir, exts, base) {
  const results = []
  const items = fs.readdirSync(dir, { withFileTypes: true })

  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    const relPath = path.relative(base, fullPath)

    // 检查是否在排除目录中
    if (item.isDirectory()) {
      if (EXCLUDE_DIRS.some(ex => relPath.replace(/\\/g, '/').startsWith(ex))) continue
      if (item.name === 'node_modules' || item.name === '.git') continue
      results.push(...walkDir(fullPath, exts, base))
    } else if (exts.some(ext => item.name.endsWith(ext))) {
      results.push(fullPath)
    }
  }

  return results
}

function main() {
  const srcDir = path.join(ROOT, 'src')
  const files = walkDir(srcDir, ['.vue', '.less'], srcDir)

  console.log(`Found ${files.length} files to process`)

  let totalChanges = 0
  let filesChanged = 0
  const report = []

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf-8')
    const { content: processed, changes } = processContent(original)

    if (changes > 0) {
      fs.writeFileSync(file, processed, 'utf-8')
      totalChanges += changes
      filesChanged++
      const relPath = path.relative(ROOT, file)
      report.push({ file: relPath, changes })
    }
  }

  // 按替换数量排序
  report.sort((a, b) => b.changes - a.changes)

  console.log(`\nDone! ${totalChanges} replacements in ${filesChanged} files\n`)
  console.log('Top 20 files by changes:')
  report.slice(0, 20).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.file}: ${r.changes} replacements`)
  })

  if (report.length > 20) {
    console.log(`  ... and ${report.length - 20} more files`)
  }

  // 写入报告
  const reportPath = path.join(ROOT, '..', 'color-replacement-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\nFull report saved to: ${reportPath}`)
}

main()
