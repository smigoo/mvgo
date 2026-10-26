#!/usr/bin/env node
/**
 * A2 影响面只读扫描（一次性，不入库）
 * 目的：在 208 个真机 checkpoint 上量化「R23 输入完整性闸」的触发面，
 *      而不是只靠单个 801:3 样本 + spec 阳性对照。
 *
 * 对每个 checkpoint：
 *   raw        = figma-node-data.json（或 visual.json）里的节点树
 *   sections   = .checkpoint/analysis.json → subComponentPlan.effectiveSections
 *   idx        = id -> rawNode 索引（含 .document 遍历）
 *
 * 对每个 section 判定三个量：
 *   rawKids      = raw.children 中过 FIGMA_ID_RE 的 id 数
 *   derivedAll   = sec.children.length
 *   derivedReal  = sec.children 中过 FIGMA_ID_RE 的 id 数
 *   pseudo       = derivedAll - derivedReal（孤儿带伪 id）
 *   resolved     = 伪 id 中能用「自带 bbox」或「sourceNodeIds 并集」解出几何的个数
 *   blocked      = 伪 id 中解不出几何的个数（>0 ⇒ A2 新闸会跳过，不用子集复算）
 *
 * 输出：总体统计 + 被新闸拦下的 section 清单（前 30 条）+ 会被新闸放行参与复算的清单。
 */
import fs from 'node:fs'
import path from 'node:path'

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

const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null }
}

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
  const boxes = []
  const seen = new Set()
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

const dirs = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, d.name))
  .filter((d) => fs.existsSync(path.join(d, '.checkpoint')))

const stat = {
  components: 0, withPlan: 0, sections: 0,
  multiKidSections: 0,          // derivedReal >= 2 且与 raw 不同（R23 会进）
  sectionsWithPseudo: 0,        // 派生 child 里有伪 id
  pseudoTotal: 0,
  pseudoResolvedSelf: 0,
  pseudoResolvedUnion: 0,
  pseudoUnresolved: 0,
  blockedSections: [],          // A2 新闸会跳过
  passSections: [],             // A2 新闸放行，带伪 id 参与复算
}

for (const dir of dirs) {
  const name = path.basename(dir)
  const ck = path.join(dir, '.checkpoint')
  const analysis = readJson(path.join(ck, 'analysis.json'))
  const visual = readJson(path.join(ck, 'visual.json'))
  const figmaFile = readJson(path.join(ck, 'figma.json'))
    || readJson(path.join(dir, '.mc-gen', 'cache', 'figma-node-data.json'))
    || readJson(path.join(dir, '.mc-gen', 'figma-node-data.json'))
  stat.components++

  const sections = analysis?.subComponentPlan?.effectiveSections
  if (!Array.isArray(sections) || sections.length === 0) continue
  stat.withPlan++

  const tree = figmaFile || visual?.figmaNodeData || visual?.rawFigma || null
  const idx = buildIndex(tree)
  if (idx.size === 0) continue

  for (const sec of sections) {
    stat.sections++
    const rawNode = idx.get(String(sec.id))
    const rawKids = (Array.isArray(rawNode?.children) ? rawNode.children : [])
      .map((c) => String(c?.id ?? '')).filter((id) => FIGMA_ID_RE.test(id))
    const kids = Array.isArray(sec.children) ? sec.children : []
    const derivedReal = kids.map((c) => String(c?.id ?? '')).filter((id) => FIGMA_ID_RE.test(id))
    if (derivedReal.length < 2) continue
    const sameSet = derivedReal.length === rawKids.length && derivedReal.every((id) => rawKids.includes(id))
    if (sameSet) continue
    stat.multiKidSections++

    const claimed = new Set(derivedReal)
    const pseudo = kids.filter((c) => !FIGMA_ID_RE.test(String(c?.id ?? '')))
    if (pseudo.length === 0) continue
    stat.sectionsWithPseudo++
    stat.pseudoTotal += pseudo.length

    let unresolved = 0
    for (const p of pseudo) {
      const selfBox = boxOfNode(p)
      if (selfBox) { stat.pseudoResolvedSelf++; continue }
      const src = Array.isArray(p?.sourceNodeIds) ? p.sourceNodeIds : []
      const box = unionBox(src, idx, claimed)
      if (box) stat.pseudoResolvedUnion++
      else unresolved++
    }
    stat.pseudoUnresolved += unresolved
    if (unresolved > 0) stat.blockedSections.push({ name, sectionId: String(sec.id), unresolved, pseudo: pseudo.length })
    else stat.passSections.push({ name, sectionId: String(sec.id), pseudo: pseudo.length, layout: sec.layout ?? null })
  }
}

console.log('=== A2 影响面扫描（真机 checkpoint 全语料）===')
console.log(JSON.stringify({
  components: stat.components,
  withPlan: stat.withPlan,
  sections: stat.sections,
  r23CandidateSections: stat.multiKidSections,
  sectionsWithPseudo: stat.sectionsWithPseudo,
  pseudoTotal: stat.pseudoTotal,
  pseudoResolvedSelf: stat.pseudoResolvedSelf,
  pseudoResolvedUnion: stat.pseudoResolvedUnion,
  pseudoUnresolved: stat.pseudoUnresolved,
  blockedByInputIntegrity: stat.blockedSections.length,
  passedWithPseudo: stat.passSections.length,
}, null, 2))

console.log('\n--- 被「输入完整性闸」跳过的 section（新闸生效面）---')
for (const b of stat.blockedSections.slice(0, 30)) console.log(`  ${b.name}  sec=${b.sectionId}  pseudo=${b.pseudo} unresolved=${b.unresolved}`)
console.log(`  ... 共 ${stat.blockedSections.length} 条`)

console.log('\n--- 含伪 id 但几何可解（新闸放行，参与复算）---')
for (const p of stat.passSections.slice(0, 30)) console.log(`  ${p.name}  sec=${p.sectionId}  pseudo=${p.pseudo} layout=${p.layout}`)
console.log(`  ... 共 ${stat.passSections.length} 条`)
