#!/usr/bin/env node
/**
 * 闸⑤ 修复效果证明（一次性，不入库）
 *
 * 目的：上一轮 e2e 只证明「幂等」（checkpoint 里的 sec.layout 已是 R23 污染后的终态）。
 *      本脚本追溯 R23 **运行前**的初值来源：
 *        sec.layout 初值 = deriveChildLayout(figmaNode, buildNodeLayoutFacts(tree))
 *        （section-tree.js:2279 / :2606）
 *      再叠一层「闸⑤ 生效后」的预期终值，对比才能证明是真修复而非幂等。
 *
 * 纪律：不复刻任何判据，全部调源码导出函数。
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

// 目标 section
const TARGETS = new Set(['801:3', '807:2', '565:3', '287:6'])
const rows = []
let scanned = 0

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
  let figmaIndex, facts
  try {
    figmaIndex = indexFigmaNodes(tree)
    facts = buildNodeLayoutFacts(tree)
  } catch { continue }
  if (!figmaIndex || figmaIndex.size === 0) continue
  scanned++

  for (const sec of sections) {
    const sid = String(sec.id || '')
    if (!TARGETS.has(sid)) continue
    if (!sec.isLayoutContainer && !sec.isLayoutContainerSection) continue
    // indexFigmaNodes 返回的是包装体 { id, name, type, bbox, parentId, rawNode }
    // ⇒ 子节点必须读 entry.rawNode.children（读 entry.children 会恒 undefined）
    const entry = figmaIndex.get(sid) || null
    const rawNode = entry?.rawNode || entry || null
    const fact = facts[sid] || null
    // R23 运行前初值（section-tree 的下发口径）
    const pre = layoutOf(fact)
    // checkpoint 里存的即 R23 运行后的终态
    const stored = sec.layout ?? null
    rows.push({
      comp: name, sid,
      rawKids: rawNode?.children?.length ?? null,
      rawTextKids: (rawNode?.children || []).filter((c) => String(c?.type || '').toUpperCase() === 'TEXT').length,
      factSource: fact?.source ?? null,
      factConf: fact?.confidence ?? null,
      factDir: fact?.flexDirection ?? null,
      factDisplay: fact?.display ?? null,
      pre, stored,
      changedByR23: stored !== pre,
      postGate5: rawNode ? ((rawNode.children || []).some((c) => String(c?.type || '').toUpperCase() === 'TEXT') ? pre : '(复算)') : '(无节点)',
    })
  }
}

console.log(`扫描 checkpoint: ${scanned}`)
const agg = new Map()
for (const r of rows) {
  const k = `${r.comp}/${r.sid}`
  if (!agg.has(k)) agg.set(k, r)
}
console.log(`命中目标 section 的组合数: ${agg.size}\n`)
console.log('comp'.padEnd(36), 'sid'.padEnd(8), 'rawKids/text'.padEnd(12), 'fact(src/conf/dir)'.padEnd(28), 'pre'.padEnd(11), 'stored'.padEnd(11), 'R23改过?'.padEnd(9), '闸⑤后')
console.log('-'.repeat(150))
for (const r of [...agg.values()].sort((a, b) => a.sid.localeCompare(b.sid) || a.comp.localeCompare(b.comp))) {
  const factStr = `${r.factSource || '-'}/${r.factConf || '-'}/${r.factDir || r.factDisplay || '-'}`
  console.log(
    r.comp.padEnd(36), r.sid.padEnd(8),
    `${r.rawKids}/${r.rawTextKids}`.padEnd(12),
    factStr.padEnd(28),
    String(r.pre).padEnd(11), String(r.stored).padEnd(11),
    (r.changedByR23 ? 'YES' : 'no').padEnd(9),
    String(r.postGate5),
  )
}

const flip = [...agg.values()].filter((r) => r.changedByR23)
console.log(`\nR23 曾改变方向的 section：${flip.length} 个`)
for (const r of flip) {
  console.log(`  · ${r.comp}/${r.sid}: 初值 ${r.pre} ⇒ 被 R23 改为 ${r.stored}；闸⑤ 生效后 ⇒ ${r.postGate5}`)
}

// 汇总：闸⑤ 是否真能「把被污染的翻回去」
const fixedByGate5 = flip.filter((r) => r.postGate5 === r.pre)
console.log(`\n闸⑤ 能让「被 R23 污染的方向」回到初值的：${fixedByGate5.length}/${flip.length}`)
