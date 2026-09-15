/**
 * 离线重放校验 dropHallucinatedSections（不调 LLM）：
 * 用真机 vision 缓存 + figma-node-data 直接跑函数，断言：
 *   ① 真阳性样本（badge-indicator）被剔除；
 *   ② 另外 3 个「自称节点身份」的真 section 全部保留；
 *   ③ 剔除后 sections 的 id 序列 == [89:42, chart-section]。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { dropHallucinatedSections } from '../src/ai-engine/utils/section-tree.js'

const ROOT = join(process.cwd(), '..', 'temp-components')

function walkVisionCaches(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkVisionCaches(p, out)
    else if (e.name.endsWith('.json') && basename(dir) === 'vision-cache') out.push(p)
  }
  return out
}

const sectionsOf = (v) => {
  const lay = v.layoutStructure || {}
  return (lay.layout || {}).sections || lay.sections || (v.layout || {}).sections || []
}

let samples = 0
let droppedTotal = 0
const dropped = []
const keptClaimants = []

for (const f of walkVisionCaches(ROOT)) {
  const figmaPath = join(dirname(dirname(f)), 'figma-node-data.json')
  if (!existsSync(figmaPath)) continue
  let v, fx
  try {
    v = JSON.parse(readFileSync(f, 'utf-8'))
    fx = JSON.parse(readFileSync(figmaPath, 'utf-8'))
  } catch {
    continue
  }
  const secs = sectionsOf(v)
  if (!Array.isArray(secs) || secs.length === 0) continue
  samples += 1

  const after = dropHallucinatedSections(secs, fx)
  const beforeIds = secs.map((s) => s?.id)
  const afterIds = after.map((s) => s?.id)
  const removed = beforeIds.filter((id) => !afterIds.includes(id))
  if (removed.length > 0) {
    droppedTotal += removed.length
    dropped.push({ file: basename(dirname(dirname(dirname(f)))), beforeIds, afterIds })
  }
  // 声称节点身份者必须全部保留
  for (const s of secs) {
    const own = [s?.figmaNodeId, s?.figmaNode, ...(s?.sourceNodeIds || [])].filter(Boolean)
    const strict = /^\d+:\d+$/.test(String(s?.id ?? '').trim())
    if ((own.length > 0 || strict) && !afterIds.includes(s?.id)) {
      keptClaimants.push({ file: basename(dirname(dirname(dirname(f)))), id: s?.id, name: s?.name })
    }
  }
}

console.log('样本数:', samples)
console.log('被剔除的 section 总数:', droppedTotal)
for (const d of dropped) {
  console.log('  ', d.file, '|', JSON.stringify(d.beforeIds), '→', JSON.stringify(d.afterIds))
}
console.log('误伤（声称节点身份却被剔除）:', keptClaimants.length)
for (const k of keptClaimants) console.log('  ', k)

// 关键样本硬断言：环境监测任务
const key = dropped.find((d) => d.beforeIds.includes('badge-indicator'))
if (!key) {
  console.error('❌ 未命中真阳性样本 badge-indicator')
  process.exitCode = 1
} else {
  const ok = JSON.stringify(key.afterIds) === JSON.stringify(['89:42', 'chart-section'])
  console.log(ok ? '✅ 真阳性样本剔除后 sections == [89:42, chart-section]' : `❌ 断言失败: ${JSON.stringify(key.afterIds)}`)
  if (!ok) process.exitCode = 1
}
if (keptClaimants.length > 0) process.exitCode = 1
