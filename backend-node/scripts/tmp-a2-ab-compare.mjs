#!/usr/bin/env node
/**
 * A2 前后对比复算（一次性，不入库）
 * 直接 import 源码的 decideLayoutForBoxes（不复制判据，避免假绿闭环），
 * 对「含派生伪 id」的 section 做两态对比：
 *   修复前 = 只用真 id 节点（FIGMA_ID_RE 过滤后的形态，即现状）
 *   修复后 = 真 id + 伪 id 的 sourceNodeIds 并集框（A2 补证据）
 * 并列出 layout 是否发生翻转。
 */
import fs from 'node:fs'
import path from 'node:path'
import { decideLayoutForBoxes } from '../src/ai-engine/utils/figma-node-layout-facts.js'

const ROOT = path.resolve(import.meta.dirname, '..', 'workspace', 'custom-components')
const FIGMA_ID_RE = /^\d+:\d+$/

const boxOfNode = (node) => {
  const b = node && (node.absoluteBoundingBox || node.bbox)
  if (!b) return null
  const { x, y, width, height } = b
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }
const buildIndex = (rootNode) => {
  const idx = new Map()
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.id != null) idx.set(String(n.id), n)
    if (Array.isArray(n.children)) for (const c of n.children) walk(c)
  }
  if (rootNode) walk(rootNode.document ?? rootNode)
  return idx
}
const unionBox = (ids, idx, exclude) => {
  const boxes = []; const seen = new Set()
  for (const raw of ids) {
    const id = String(raw)
    if (!FIGMA_ID_RE.test(id)) continue
    if (exclude && exclude.has(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    const b = boxOfNode(idx.get(id))
    if (b) boxes.push(b)
  }
  if (boxes.length === 0) return null
  if (boxes.length === 1) return boxes[0]
  return {
    x: Math.min(...boxes.map((b) => b.x)),
    y: Math.min(...boxes.map((b) => b.y)),
    width: Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x)),
    height: Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y)),
  }
}
const toLayout = (d) => (d ? (d.display === 'grid' ? 'grid' : d.flexDirection === 'row' ? 'horizontal' : 'vertical') : null)
const fmt = (d) => (d ? `${d.display}${d.flexDirection ? '/' + d.flexDirection : ''} ratio=${d.ratio} conf=${d.confidence}` : 'null')

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
  const idx = buildIndex(tree)
  if (idx.size === 0) continue

  for (const sec of sections) {
    const kids = Array.isArray(sec.children) ? sec.children : []
    const derivedReal = kids.map((c) => String(c?.id ?? '')).filter((id) => FIGMA_ID_RE.test(id))
    if (derivedReal.length < 2) continue
    const pseudo = kids.filter((c) => !FIGMA_ID_RE.test(String(c?.id ?? '')))
    if (pseudo.length === 0) continue

    const rawNode = idx.get(String(sec.id))
    const parentBox = rawNode ? boxOfNode(rawNode) : null
    const claimed = new Set(derivedReal)

    // 修复前：只喂真 id 节点
    const beforeNodes = derivedReal.map((id) => idx.get(id)).filter((n) => n && boxOfNode(n))
    // 修复后：真 id + 伪 id（自带框 或 sourceNodeIds 并集）
    const afterNodes = [...beforeNodes]
    let pseudoResolved = 0
    for (const p of pseudo) {
      const selfBox = boxOfNode(p)
      if (selfBox) { afterNodes.push({ id: String(p.id), type: 'TEXT', absoluteBoundingBox: selfBox }); pseudoResolved++; continue }
      const src = Array.isArray(p?.sourceNodeIds) ? p.sourceNodeIds : []
      const box = unionBox(src, idx, claimed)
      if (box) { afterNodes.push({ id: String(p.id), type: 'TEXT', absoluteBoundingBox: box }); pseudoResolved++ }
    }

    const before = decideLayoutForBoxes(beforeNodes, parentBox)
    const after = decideLayoutForBoxes(afterNodes, parentBox)
    const cur = sec.layout ?? null
    rows.push({
      name, sectionId: String(sec.id), pseudo: pseudo.length, resolved: pseudoResolved,
      curLayout: cur, before: toLayout(before), after: toLayout(after),
      beforeRaw: fmt(before), afterRaw: fmt(after),
      flip: toLayout(before) !== toLayout(after),
      afterMatchesCur: toLayout(after) === cur,
    })
  }
}

console.log('=== A2 前后对比（同一 decideLayoutForBoxes 实现，副本纪律）===\n')
const pad = (s, n) => String(s ?? '').padEnd(n)
console.log(pad('组件', 22) + pad('sec', 10) + pad('伪', 4) + pad('解出', 5) + pad('当前', 11) + pad('修复前', 11) + pad('修复后', 11) + '翻转')
for (const r of rows) {
  console.log(pad(r.name, 22) + pad(r.sectionId, 10) + pad(r.pseudo, 4) + pad(r.resolved, 5)
    + pad(r.curLayout, 11) + pad(r.before, 11) + pad(r.after, 11) + (r.flip ? 'YES' : '-'))
}

const flips = rows.filter((r) => r.flip)
const changed = rows.filter((r) => r.after !== r.curLayout)
console.log(`\n合计 ${rows.length} 个 section；修复前/修复后方向翻转 ${flips.length} 个；修复后与当前产物声明不一致 ${changed.length} 个`)
console.log('\n--- 详细判据（ratio/confidence）---')
for (const r of rows) {
  console.log(`${r.name}/${r.sectionId}: 当前=${r.curLayout}  前=[${r.beforeRaw}]  后=[${r.afterRaw}]`)
}
