#!/usr/bin/env node
/**
 * 闸⑤（事实优先闸）**新鲜运行**验证（一次性，不入库）
 *
 * 上一轮 e2e 只证「幂等」——checkpoint 里 sec.layout 已是 R23 跑过的终态。
 * 本脚本把 layout **重置为 A 类事实初值**（= section-tree#deriveChildLayout 的下发口径，
 * 由 buildNodeLayoutFacts 产出）后跑**真代码** refineDerivedContainerLayout，
 * 得到「新一次生成」下该 section 的终值，再三方对比：初值 / 现网终态 / 改后终态。
 *
 * 纪律：不复刻判据，判据全部来自源码导出函数。
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildNodeLayoutFacts } from '../src/ai-engine/utils/figma-node-layout-facts.js'
import { indexFigmaNodes } from '../src/ai-engine/utils/section-tree.js'
import { refineDerivedContainerLayout } from '../src/ai-engine/roles/subcomponent-planner.js'

const ROOT = path.resolve(import.meta.dirname, '..', 'workspace', 'custom-components')
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }
const layoutOf = (fact) => {
  if (!fact) return null
  if (fact.display === 'grid') return 'grid'
  if (fact.flexDirection === 'row') return 'horizontal'
  if (fact.flexDirection === 'column') return 'vertical'
  return null
}

const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, d.name))
  .filter((d) => fs.existsSync(path.join(d, '.checkpoint')))

const rows = []
let comps = 0
let containers = 0

for (const dir of dirs) {
  const comp = path.basename(dir)
  const ck = path.join(dir, '.checkpoint')
  const analysis = readJson(path.join(ck, 'analysis.json'))
  const visual = readJson(path.join(ck, 'visual.json'))
  const figmaFile = readJson(path.join(ck, 'figma.json'))
    || readJson(path.join(dir, '.mc-gen', 'cache', 'figma-node-data.json'))
  const sections = analysis?.subComponentPlan?.effectiveSections
  if (!Array.isArray(sections) || sections.length === 0) continue
  const tree = figmaFile || visual?.figmaNodeData || null
  if (!tree) continue
  let figmaIndex, facts
  try {
    figmaIndex = indexFigmaNodes(tree)
    facts = buildNodeLayoutFacts(tree)
  } catch { continue }
  if (!figmaIndex || figmaIndex.size === 0) continue
  comps++

  const walkSec = (s) => {
    if (!s || typeof s !== 'object') return
    if (s.isLayoutContainer || s.isLayoutContainerSection) {
      containers++
      const sid = String(s.id || '')
      const fact = facts[sid] || null
      const baseline = layoutOf(fact)
      const stored = s.layout ?? null
      // 新鲜运行：把 layout 重置为 A 类事实初值
      const clone = JSON.parse(JSON.stringify(s))
      clone.layout = baseline
      try {
        refineDerivedContainerLayout(clone, { e1Derived: true, figmaIndex })
      } catch (e) {
        rows.push({ comp, sid, baseline, stored, fresh: `ERR:${e.message}` })
        return
      }
      const fresh = clone.layout ?? null
      if (fresh !== baseline || fresh !== stored) {
        rows.push({
          comp, sid, baseline, stored, fresh,
          factConf: fact?.confidence ?? null,
          factRatio: fact?.ratio ?? null,
          freshChanged: fresh !== baseline,
          vsStored: fresh !== stored,
        })
      }
    }
    for (const c of s.children || []) walkSec(c)
  }
  for (const s of sections) walkSec(s)
}

console.log(`\ncheckpoint 参与: ${comps} 个组件；容器 section: ${containers} 个`)
console.log(`有变化或有疑点的行: ${rows.length}\n`)
if (rows.length) {
  console.log('comp'.padEnd(34), 'sid'.padEnd(10), 'baseline'.padEnd(11), 'stored'.padEnd(11), 'fresh'.padEnd(11), 'factConf/ratio'.padEnd(18), 'R23仍改?'.padEnd(9), '与现网不同?')
  console.log('-'.repeat(140))
  for (const r of rows.sort((a, b) => String(a.sid).localeCompare(String(b.sid)) || a.comp.localeCompare(b.comp))) {
    console.log(
      r.comp.padEnd(34), String(r.sid).padEnd(10),
      String(r.baseline).padEnd(11), String(r.stored).padEnd(11), String(r.fresh).padEnd(11),
      `${r.factConf ?? '-'}/${r.factRatio != null ? r.factRatio.toFixed(3) : '-'}`.padEnd(18),
      (r.freshChanged ? 'YES' : 'no').padEnd(9),
      r.vsStored ? 'DIFF' : 'same',
    )
  }
}

// 汇总
const bySid = new Map()
for (const r of rows) {
  const k = r.sid
  at(k)
}
function at(k) {
  if (!bySid.has(k)) bySid.set(k, [])
  return bySid.get(k)
}
for (const r of rows) bySid.get(r.sid).push(r)
console.log('\n按 section 汇总（改后终值 fresh 分布）：')
for (const [sid, list] of [...bySid.entries()].sort()) {
  const freshSet = [...new Set(list.map((r) => r.fresh))]
  const baseSet = [...new Set(list.map((r) => r.baseline))]
  const storedSet = [...new Set(list.map((r) => r.stored))]
  console.log(`  ${sid.padEnd(10)} n=${String(list.length).padEnd(3)} baseline=${baseSet.join('|').padEnd(14)} stored=${storedSet.join('|').padEnd(14)} fresh=${freshSet.join('|')}`)
}
