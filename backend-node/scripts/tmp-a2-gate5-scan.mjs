#!/usr/bin/env node
/**
 * A2 判据重定 · 全语料验证（一次性，不入库）
 *
 * 假设：R23 文档注释写的适用前提是「原生 children **不含**内容文本 ⇒ 判定输入不完整」，
 *      但原实现只做了三道闸（e1Derived / 真 AutoLayout / 集合相同），**从未检查这个前提**。
 *      若把该前提实装为闸 ⑤（原生已含 TEXT ⇒ 不复算），是否能：
 *        ① 修好 801:3（原生 7 TEXT ⇒ 不复算 ⇒ 保持 column）
 *        ② 不误伤 807:2（原生含 TEXT ⇒ 不复算 ⇒ 保持 vertical）
 *        ③ 保留 R23 原案 38:3260（原生仅 bg VECTOR + icon ⇒ 无 TEXT ⇒ 仍复算 ⇒ row）
 *
 * 输出：每个含伪 id 的 section 的「原生 TEXT 数 / 派生真 id 数 / 伪 id 数 / 当前 layout / 闸⑤判定」
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', 'workspace', 'custom-components')
const FIGMA_ID_RE = /^\d+:\d+$/
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
const isText = (n) => String(n?.type || '').toUpperCase() === 'TEXT'

const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, d.name))
  .filter((d) => fs.existsSync(path.join(d, '.checkpoint')))

const rows = []
const all = []
for (const dir of dirs) {
  const name = path.basename(dir)
  const ck = path.join(dir, '.checkpoint')
  const analysis = readJson(path.join(ck, 'analysis.json'))
  const visual = readJson(path.join(ck, 'visual.json'))
  const figmaFile = readJson(path.join(ck, 'figma.json'))
    || readJson(path.join(dir, '.mc-gen', 'cache', 'figma-node-data.json'))
  const sections = analysis?.subComponentPlan?.effectiveSections
  if (!Array.isArray(sections) || sections.length === 0) continue
  const idx = buildIndex(figmaFile || visual?.figmaNodeData || null)
  if (idx.size === 0) continue

  for (const sec of sections) {
    const rawNode = idx.get(String(sec.id))
    if (!rawNode) continue
    const rawKidsNodes = (Array.isArray(rawNode.children) ? rawNode.children : [])
      .filter((c) => FIGMA_ID_RE.test(String(c?.id ?? '')))
    const rawTexts = rawKidsNodes.filter(isText).length
    const rawTypes = [...new Set(rawKidsNodes.map((c) => String(c?.type || '?')))].sort().join('|')

    const kids = Array.isArray(sec.children) ? sec.children : []
    const derivedReal = kids.map((c) => String(c?.id ?? '')).filter((id) => FIGMA_ID_RE.test(id))
    const pseudo = kids.filter((c) => !FIGMA_ID_RE.test(String(c?.id ?? '')))
    const rec = {
      name, sectionId: String(sec.id), cur: sec.layout ?? null,
      rawKids: rawKidsNodes.length, rawTexts, rawTypes,
      derivedAll: kids.length, derivedReal: derivedReal.length, pseudo: pseudo.length,
    }
    all.push(rec)
    if (pseudo.length > 0) rows.push(rec)
  }
}

const pad = (s, n) => String(s ?? '').padEnd(n)
console.log('=== 闸⑤（原生含 TEXT ⇒ 不复算）判定面 · 含伪 id 的 section ===\n')
console.log(pad('组件', 22) + pad('sec', 10) + pad('原生子', 7) + pad('原生TEXT', 9) + pad('派生真id', 10) + pad('伪', 4) + pad('当前', 11) + '闸⑤')
for (const r of rows) {
  const gate5 = r.rawTexts > 0 ? '拦住(不复算)' : '放行(复算)'
  console.log(pad(r.name, 22) + pad(r.sectionId, 10) + pad(r.rawKids, 7) + pad(r.rawTexts, 9)
    + pad(r.derivedReal, 10) + pad(r.pseudo, 4) + pad(r.cur, 11) + gate5)
}

console.log(`\n合计 ${rows.length} 个含伪 id 的 section`)
console.log(`  闸⑤会拦住（原生含 TEXT，保持既有方向）：${rows.filter((r) => r.rawTexts > 0).length}`)
console.log(`  闸⑤会放行（原生无 TEXT，保留 R23 复算）：${rows.filter((r) => r.rawTexts === 0).length}`)
for (const r of rows.filter((x) => x.rawTexts === 0)) {
  console.log(`    → ${r.name}/${r.sectionId} 原生类型=[${r.rawTypes}] 原生${r.rawKids}子 派生真id=${r.derivedReal} 伪=${r.pseudo} 当前=${r.cur}`)
}

// 全场统计：原生无 TEXT 且派生集合 != 原生集合 的 section（R23 真正适用面）
const r23Real = all.filter((r) => r.rawTexts === 0 && r.derivedReal >= 2
  && !(r.derivedReal === r.rawKids && r.derivedAll === r.rawKids))
console.log(`\n=== R23 真实适用面（原生无 TEXT 且归并发生）共 ${r23Real.length} 条 ===`)
for (const r of r23Real.slice(0, 40)) {
  console.log(`  ${r.name}/${r.sectionId} 原生[${r.rawTypes}]×${r.rawKids} → 派生真id=${r.derivedReal} 伪=${r.pseudo} 当前=${r.cur}`)
}
