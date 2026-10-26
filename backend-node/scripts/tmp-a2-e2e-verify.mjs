#!/usr/bin/env node
/**
 * 闸⑤ 端到端验证（一次性，不入库）
 * 用**真 checkpoint 数据** + **真代码** `refineDerivedContainerLayout` + 真 `indexFigmaNodes`
 * 跑一遍全语料，对比「加闸⑤ 前（当前 sec.layout 即历史留痕）/ 加闸⑤ 后」。
 *
 * 这里刻意不在脚本里复刻任何判据（避免「改的人和验的人用同一正则」的假绿闭环），
 * 只调源码导出函数。
 */
import fs from 'node:fs'
import path from 'node:path'
import { refineDerivedContainerLayout } from '../src/ai-engine/roles/subcomponent-planner.js'
import { indexFigmaNodes } from '../src/ai-engine/utils/section-tree.js'

const ROOT = path.resolve(import.meta.dirname, '..', 'workspace', 'custom-components')
const FIGMA_ID_RE = /^\d+:\d+$/
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }

const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, d.name))
  .filter((d) => fs.existsSync(path.join(d, '.checkpoint')))

const rows = []
for (const dir of dirs) {
  const name = path.basename(dir)
  const ck = path.join(dir, '.checkpoint')
  const analysis = readJson(path.join(ck, 'analysis.json'))
  const visual = readJson(path.join(ck, 'visual.json'))
  const figmaFile = readJson(path.join(ck, 'figma.json'))
    || readJson(path.join(dir, '.mc-gen', 'cache', 'figma-node-data.json'))
  const sections = analysis?.subComponentPlan?.effectiveSections
  if (!Array.isArray(sections) || sections.length === 0) continue
  const tree = figmaFile || visual?.figmaNodeData || null
  if (!tree) continue
  let figmaIndex
  try { figmaIndex = indexFigmaNodes(tree) } catch { continue }
  if (!figmaIndex || figmaIndex.size === 0) continue

  for (const sec of sections) {
    const kids = Array.isArray(sec.children) ? sec.children : []
    const pseudo = kids.filter((c) => !FIGMA_ID_RE.test(String(c?.id ?? '')))
    if (pseudo.length === 0) continue
    const before = sec.layout ?? null
    // 深拷贝，避免污染后续读取（虽然每轮都重新读文件）
    const probe = JSON.parse(JSON.stringify(sec))
    try {
      refineDerivedContainerLayout(probe, { e1Derived: true, figmaIndex })
    } catch (e) {
      rows.push({ name, sectionId: String(sec.id), before, after: 'THROW:' + e.message, pseudo: pseudo.length, err: true })
      continue
    }
    rows.push({ name, sectionId: String(sec.id), before, after: probe.layout ?? null, pseudo: pseudo.length })
  }
}

const pad = (s, n) => String(s ?? '').padEnd(n)
console.log('=== 闸⑤ 端到端验证（真数据 + 真代码 refineDerivedContainerLayout）===\n')
console.log(pad('组件', 22) + pad('sec', 10) + pad('伪', 4) + pad('跑前(真机留痕)', 16) + pad('跑后', 12) + '变化')
let changed = 0
for (const r of rows) {
  const diff = r.before !== r.after
  if (diff) changed++
  console.log(pad(r.name, 22) + pad(r.sectionId, 10) + pad(r.pseudo, 4) + pad(r.before, 16) + pad(r.after, 12) + (diff ? 'CHANGED' : '-'))
}
console.log(`\n合计 ${rows.length} 个含伪 id 的 section；方向被改变 ${changed} 个`)
const errs = rows.filter((r) => r.err)
console.log(`异常 ${errs.length} 个`)
for (const e of errs) console.log('  !', e.name, e.sectionId, e.after)
