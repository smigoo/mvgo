#!/usr/bin/env node
/** 807:2 / 801:3 几何真相 dump（一次性，不入库） */
import fs from 'node:fs'
import path from 'node:path'
import { buildNodeLayoutFacts, decideLayoutForBoxes } from '../src/ai-engine/utils/figma-node-layout-facts.js'

const ROOT = path.resolve(import.meta.dirname, '..', 'workspace', 'custom-components')
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }
const COMP = process.argv[2] || 'c-device-ab7bb76c'
const SID = process.argv[3] || '807:2'
const dir = path.join(ROOT, COMP)
const ck = path.join(dir, '.checkpoint')
const tree = readJson(path.join(ck, 'figma.json'))
  || readJson(path.join(dir, '.mc-gen', 'cache', 'figma-node-data.json'))
const analysis = readJson(path.join(ck, 'analysis.json'))
const root = tree?.document ?? tree
const facts = buildNodeLayoutFacts(tree)

const find = (n, id) => {
  if (!n || typeof n !== 'object') return null
  if (String(n.id) === id) return n
  for (const c of n.children || []) { const r = find(c, id); if (r) return r }
  return null
}
const node = find(root, SID)
if (!node) { console.log('未找到节点', SID); process.exit(0) }

const fmt = (b) => b ? `x=${b.x} y=${b.y} w=${b.width} h=${b.height}` : 'no-bbox'
console.log(`\n=== ${COMP} / ${SID} "${node.name}" type=${node.type} layoutMode=${node.layoutMode} ===`)
console.log(`self ${fmt(node.absoluteBoundingBox || node.bbox)}  children=${(node.children || []).length}`)
console.log('A 类事实:', JSON.stringify(facts[SID]))
console.log('\n-- 原生 children --')
for (const c of node.children || []) {
  console.log(`  ${String(c.id).padEnd(10)} ${String(c.type).padEnd(10)} ${String(c.name || '').slice(0, 22).padEnd(24)} ${fmt(c.absoluteBoundingBox || c.bbox)}`)
}

// 派生 children（E1 归并后的真实结构）
const secs = analysis?.subComponentPlan?.effectiveSections || []
const flat = []
const walkSec = (s) => { flat.push(s); for (const c of s.children || []) walkSec(c) }
for (const s of secs) walkSec(s)
const target = flat.find((s) => String(s.id) === SID)
if (target) {
  console.log(`\n-- 派生 children（checkpoint effectiveSections，sec.layout=${target.layout}） --`)
  for (const c of target.children || []) {
    console.log(`  ${String(c.id).padEnd(26)} eC=${String(c.elementCount).padEnd(4)} src=[${(c.sourceNodeIds || []).join(',')}]`)
  }
  // 用派生 children 的锚点回查图节点几何，复算
  const boxes = []
  for (const c of target.children || []) {
    const anchor = String(c.figmaNodeId || c.id || '')
    const n = find(root, anchor)
    if (n) boxes.push(n)
  }
  console.log(`\n派生 children 能回查到几何的: ${boxes.length}/${(target.children || []).length}`)
  console.log('复算（派生真 id 集合）:', JSON.stringify(decideLayoutForBoxes(boxes, node.absoluteBoundingBox || node.bbox)))
}
