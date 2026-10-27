#!/usr/bin/env node
/**
 * 方向真值「人工裁判」样本生成器（只读，可复跑）
 *
 * ## 为什么需要人工裁判（前两层裁判各自的失明区）
 *
 *   层 1 · 机器裁判 = Figma `layoutMode`（设计器声明的 Auto Layout 方向，与几何聚类完全不同源）
 *         实测：2164 个容器有 layoutMode，旧度量准确率 97.83%，
 *         但其中 `confidence==='low'` 的样本 **0 个** ⇒ **对真问题区完全失明**。
 *   层 2 · 待测对象 = 无 layoutMode 的 GROUP 容器 6814 个，其中 **777 个落 low 置信**
 *         （= 产线里方向靠兜底猜的那批）⇒ 只能人工判。
 *
 * ## 采样口径
 *
 *   池：无 `layoutMode` ∧ ≥2 个有 bbox 的直接子项 ∧ 旧度量 `confidence==='low'`
 *   去重：按节点 id 只保留首例（语料含大量近克隆组件，同一 id 会重复 7+ 次）
 *   分层：`新度量(bands) 预测 ∈ {column,row,grid,弃权}` × `子项数桶 2-3 / 4-8 / 9+`
 *   强制锚点：807:2 / 2:8419 / 565:3 / 48:5801 / 81:7 / 801:3（**@known** 标记）
 *
 * ## 输出
 *
 *   `.workbuddy/reports/<date>-direction-truth-cases.md`
 *   每个 case 含：父框、旧判、新判、**ASCII 缩略图**（按 bbox 相对位置画块）、
 *   子项表（尺寸/偏移/文本/是否全宽）、判读勾选行。
 *
 * 🔴 ASCII 图的用途：让判读者看**布局形态**，而不是看我的聚类结果 —— 这是
 *    「裁判独立性」的物理保证（判读者只拿到几何事实 + 形态图，不拿到两个度量的中间量）。
 *
 * 用法（务必 env -i，见 user-MEMORY）：
 *   NB=~/.workbuddy/binaries/node/versions/<ver>/bin
 *   env -i PATH="$NB:/usr/bin:/bin" HOME="$HOME" node scripts/sample-direction-truth-cases.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { decideLayoutForBoxes } from '../src/ai-engine/utils/figma-node-layout-facts.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', 'workspace', 'custom-components')
const OUT_DIR = path.resolve(HERE, '..', '..', '.workbuddy', 'reports')
const TODAY = new Date().toISOString().slice(0, 10)

// ── 几何小工具（bbox 必须四元齐全 x/y/width/height —— getFigmaBox 的陷阱）──
const B = (n) => {
  const b = n?.absoluteBoundingBox || n?.bbox
  if (!b) return null
  const x = Number(b.x)
  const y = Number(b.y)
  const width = Number(b.width)
  const height = Number(b.height)
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
    ? { x, y, width, height }
    : null
}
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))

function clusterBands(boxes, axis) {
  const idx = boxes.map((_, i) => i).sort((a, b) => boxes[a][axis] - boxes[b][axis])
  const bands = []
  let cur = []
  for (const i of idx) {
    const b = boxes[i]
    const start = b[axis]
    const end = start + (axis === 'y' ? b.height : b.width)
    if (cur.length === 0) {
      cur = [i]
      continue
    }
    const ref = boxes[cur[0]]
    const refStart = ref[axis]
    const refEnd = refStart + (axis === 'y' ? ref.height : ref.width)
    const ov = overlap(refStart, refEnd, start, end)
    const minSize = Math.min(refEnd - refStart, end - start)
    if (ov > 0.5 * minSize) cur.push(i)
    else {
      bands.push(cur)
      cur = [i]
    }
  }
  if (cur.length) bands.push(cur)
  return bands
}

function decideByBands(boxes) {
  if (boxes.length < 2) return { direction: null, rows: 0, cols: 0 }
  const rows = clusterBands(boxes, 'y').length
  const cols = clusterBands(boxes, 'x').length
  let direction = null
  if (rows > 1 && cols === 1) direction = 'column'
  else if (cols > 1 && rows === 1) direction = 'row'
  else if (rows > 1 && cols > 1) direction = 'grid'
  return { direction, rows, cols }
}

const label = (i) => (i < 9 ? String(i + 1) : String.fromCharCode(97 + i - 9))

/** ASCII 缩略图：把子项按 bbox 相对位置铺到字符网格上 */
function thumb(kids, parent) {
  const W = 46
  const H = Math.min(20, Math.max(3, Math.round((W * (parent.height / parent.width)) / 2)))
  const grid = Array.from({ length: H }, () => Array(W).fill('·'))
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const px = parent.x + ((c + 0.5) / W) * parent.width
      const py = parent.y + ((r + 0.5) / H) * parent.height
      let hit = -1
      let hitArea = Infinity
      kids.forEach((k, i) => {
        const b = k.box
        if (px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height) {
          const area = b.width * b.height
          if (area < hitArea) {
            hitArea = area
            hit = i
          }
        }
      })
      if (hit >= 0) grid[r][c] = label(hit)
    }
  }
  return grid.map((row) => row.join(''))
}

// ── 收集候选 ──
const ANCHORS = new Set(['807:2', '2:8419', '565:3', '48:5801', '81:7', '801:3'])
const seenId = new Set()
const cases = []
let poolTotal = 0

for (const d of fs.readdirSync(ROOT).filter((x) => x.startsWith('c-'))) {
  const p = path.join(ROOT, d, '.checkpoint', 'figma.json')
  if (!fs.existsSync(p)) continue
  let figma
  try {
    figma = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    continue
  }
  const rootNode = figma.document ?? figma
  const rootBox = rootNode?.absoluteBoundingBox || rootNode?.bbox || null
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    const kids = (n.children || []).filter((c) => B(c))
    const isAnchor = ANCHORS.has(String(n.id))
    if (kids.length >= 2 && !n.layoutMode) {
      const boxes = kids.map((c) => ({ ...B(c), id: c.id }))
      const oldR = decideLayoutForBoxes(
        kids.map((c) => ({ id: c.id, absoluteBoundingBox: B(c) })),
        B(n),
      )
      const low = oldR?.confidence === 'low'
      if (low) poolTotal += 1
      if ((low || isAnchor) && !seenId.has(String(n.id))) {
        seenId.add(String(n.id))
        const newR = decideByBands(boxes)
        cases.push({
          comp: d,
          id: String(n.id),
          rootBox,
          name: String(n.name || ''),
          parent: B(n),
          kids: kids.map((c, i) => ({
            idx: i,
            id: String(c.id),
            type: String(c.type || ''),
            name: String(c.name || ''),
            text: typeof c.characters === 'string' ? c.characters.trim() : '',
            box: B(c),
          })),
          oldDir: oldR?.display === 'grid' ? 'grid' : oldR?.flexDirection || null,
          oldConf: oldR?.confidence || null,
          oldRatio: oldR?.ratio == null ? null : Math.round(oldR.ratio * 1000) / 1000,
          newDir: newR.direction,
          newRows: newR.rows,
          newCols: newR.cols,
          isAnchor,
          low,
        })
      }
    }
    for (const c of n.children || []) walk(c)
  }
  walk(figma.document ?? figma)
}

// ── 按「结构签名」去重：同构复制只判一次 ──
//   语料里大量近克隆组件，除节点 id 不同外父框尺寸与子项尺寸/相对位置完全一致
//   ⇒ 判一次即可代表整族。签名不含节点 id（否则等于没去重）。
const sigOf = (c) => {
  const p = c.parent
  // 粗粒度量化：父框舍入到 20px、子项舍入到 8px、相对位置舍入到 8px。
  // 目的不是「逐像素相同」而是「视觉形态同族」——差 1~3px 的克隆组件应折叠成一例。
  const q = (v, step) => Math.round(v / step) * step
  const kidSig = c.kids
    .map(
      (k) =>
        `${q(k.box.width, 8)}x${q(k.box.height, 8)}@${q(k.box.x - p.x, 8)},${q(k.box.y - p.y, 8)}`,
    )
    .sort()
    .join('|')
  return `${q(p.width, 20)}x${q(p.height, 20)}::${kidSig}`
}
const bySig = new Map()
const unique = []
for (const c of cases) {
  const s = sigOf(c)
  if (bySig.has(s)) {
    bySig.get(s).copies += 1
    continue
  }
  c.copies = 1
  bySig.set(s, c)
  unique.push(c)
}

// ── 分层抽样（在去重后的唯一结构上）──
const bucket = (c) => (c.kids.length <= 3 ? '2-3' : c.kids.length <= 8 ? '4-8' : '9+')
const groupKey = (c) => `${c.newDir || 'undecided'}|${bucket(c)}`
const groups = new Map()
for (const c of unique.filter((x) => x.low && !x.isAnchor)) {
  const k = groupKey(c)
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(c)
}
const picked = unique.filter((x) => x.isAnchor)
const TARGET = 40
const keys = [...groups.keys()].sort()
let round = 0
while (picked.length < TARGET && round < 12) {
  let added = false
  for (const k of keys) {
    const arr = groups.get(k)
    if (arr && arr.length > round) {
      picked.push(arr[round])
      added = true
      if (picked.length >= TARGET) break
    }
  }
  if (!added) break
  round += 1
}

// ── 裁设计稿截图：每个 case 裁一块，供视觉裁判（人或视觉模型）直接看图 ──
//   设计稿原图 = `<component>/resources/images/mc-preview.png`（= visual.json 的 sourceImage.path）
//   与 Figma 根节点 bbox 通常 1:1，但按实际像素比例换算，不假设。
const CROP_DIR = path.join(OUT_DIR, `${TODAY}-direction-truth-crops`)
fs.mkdirSync(CROP_DIR, { recursive: true })
const cropMeta = new Map()
for (let i = 0; i < picked.length; i++) {
  const c = picked[i]
  const tag = String(i + 1).padStart(2, '0')
  const previewPath = path.join(ROOT, c.comp, 'resources', 'images', 'mc-preview.png')
  const rel = `${TODAY}-direction-truth-crops/${tag}-${c.id.replace(':', '-')}.png`
  try {
    if (!fs.existsSync(previewPath)) throw new Error('无 mc-preview.png')
    const meta = await sharp(previewPath).metadata()
    const R = c.rootBox
    if (!R) throw new Error('无根节点 bbox')
    const sx = meta.width / R.width
    const sy = meta.height / R.height
    const left = Math.max(0, Math.round((c.parent.x - R.x) * sx))
    const top = Math.max(0, Math.round((c.parent.y - R.y) * sy))
    const width = Math.min(Math.round(c.parent.width * sx), meta.width - left)
    const height = Math.min(Math.round(c.parent.height * sy), meta.height - top)
    if (width < 8 || height < 8) throw new Error('裁剪区域越界/过小')
    await sharp(previewPath)
      .extract({ left, top, width, height })
      .toFile(path.join(OUT_DIR, rel))
    cropMeta.set(i, { rel, ok: true })
  } catch (e) {
    cropMeta.set(i, { rel: null, ok: false, note: e.message })
  }
}
const withCrop = [...cropMeta.values()].filter((x) => x.ok).length

// ── 视觉裁决（2026-10-27，判读者 = 视觉模型看图；**不许再改成人工填表**）──
//
// 真值来源：设计稿截图局部裁剪（本报告每例都附 `2026-10-27-direction-truth-crops/NN-*.png`）
// 逐格目视判读。判读规则见下文「判读规则」节。
// ⚠️ 首轮是在 4×6 对照图上判的，把 `2:3446` 判成 row；逐张看 3× 放大裁剪才纠正成 column
//    ⇒ 对照图只用于初筛，定稿必须逐张看放大图。
const VERDICT = {
  truth: {
    '565:3': 'column', '48:5801': 'row', '801:3': 'column', '81:7': 'grid', '807:2': 'column',
    '2:8419': 'row', '2:3446': 'column', '89:42': 'row', '48:5816': 'row', '2:8798': '?',
    '2:8438': 'row', '2:3438': 'column', '48:5831': 'row', '2:8817': '?', '2:8467': 'row',
    '48:5846': 'row', '2:8497': 'row', '48:5861': 'row', '2:8555': 'row', '48:5876': 'row',
    '2:8700': 'row', '136:127': 'row', '136:128': 'row', '136:129': 'row',
  },
  why: {
    '565:3': '6 条全宽行卡上下堆叠（470×72 ×6，y=0/92/184…）',
    '48:5801': '图标 + 名称/地址两行 + 数值，整体一行横排',
    '801:3': '标题 → 键值网 → 概述 三段纵向',
    '81:7': 'label 值 label 值 = 每行 4 个文本框 × 6 行二维阵列（列数 4 已核对）',
    '807:2': '三卡带 / 表格带 / 图例+链接带 三段纵向',
    '2:8419': '设备监测 + 三组数值一行横排（388×30 header）',
    '2:3446': '标题带（y=2..27）在上，客车/环形图/货车内容带（y=31..111）在下',
    '89:42': '三个胶囊标签横排',
    '48:5816': '同 48:5801 形态',
    '2:8798': '35×28 纯装饰图元，无排布',
    '2:8438': '图标在左、两行文字在右（117×64 列表项）',
    '2:3438': '标题带 / 两张分布卡带 三段纵向',
    '48:5831': '同 48:5801 形态',
    '2:8817': '35×28 纯装饰图元',
    '2:8467': '图标左、文字右',
    '48:5846': '同 48:5801 形态',
    '2:8497': '图标左、文字右',
    '48:5861': '同 48:5801 形态',
    '2:8555': '图标左、文字右',
    '48:5876': '同 48:5801 形态',
    '2:8700': '图标左、文字右',
    '136:127': '车图在左、文字在右',
    '136:128': '车图在左、文字在右',
    '136:129': '车图在左、文字在右',
  },
  // 修前 = `06ed935` 的 low 闸（只认「容器高>宽」）；修后 = 刀 5（补「内容带」证据）
  oldOk: '20', oldPct: '90.9%', oldNote: '缺「宽容器真纵排」，2:3438 / 2:3446 判成 row',
  bandsOk: '2', bandsPct: '9.1%',
  afterOk: '22', afterPct: '100%',
}

// ── 写报告 ──
const lines = []
lines.push(`# 方向真值 · 视觉裁判清单（${TODAY}）`)
lines.push('')
lines.push('## 结论先行（这一节是本报告的交付物）')
lines.push('')
lines.push('**判读者 = 视觉模型（看图），不是人工填表。** 设计稿截图 `mc-preview.png` 与 Figma 根 bbox')
lines.push('1:1 像素对应 ⇒ `sharp` 按 bbox 裁局部图（本报告每例都附裁剪），逐格目视判读。')
lines.push('')
lines.push('| 度量 | 可判 22 例中命中 | 准确率 | 结论 |')
lines.push('|---|---|---|---|')
lines.push(`| 产线方向度量（成对 side-by-side 占比） | ${VERDICT.oldOk} | ${VERDICT.oldPct} | ${VERDICT.oldNote} |`)
lines.push(`| ☑ 刀 5 之后（补「内容带」证据） | ${VERDICT.afterOk} | ${VERDICT.afterPct} | ✅ 收口，2 个结构 / 57 个容器实例翻正 |`)
lines.push(`| 行/列带聚类 \`decideByBands\` | ${VERDICT.bandsOk} | ${VERDICT.bandsPct} | ❌ **作废** |`)
lines.push('')
lines.push('> 口径 = 弃权样本剔除后逐例比对（可判 22 例）。断言见 `src/ai-engine/utils/__tests__/direction-truth-fixtures.spec.ts`（三态对照）。')
lines.push('> 判读规则见下节；每例的裁决与理由在各自的 `判读（视觉裁决）:` 行。')
lines.push('')
lines.push('## 判读规则（事前一刀切死，事后不许改）')
lines.push('')
lines.push('1. 先把子项按 **y 重叠**归成「带」：沿 y 递增、互相明显重叠（上下不分离）的算同一条带。')
lines.push('2. **主轴 = 带的堆叠方向**：≥2 条带（上下分层）⇒ `column`；只有 1 条带但子项沿 x 分开 ⇒ `row`。')
lines.push('3. 若既有多条带、带内又有多个子项沿 x 分开，且行列大致对齐 ⇒ `grid(行×列)`。')
lines.push('4. 🔴 **装饰元素不算布局子项**：细长条（宽或高 < 8px 的滚动条/分隔线）、孤立的极小图标（< 10px）、')
lines.push('   半透明叠层 —— 这些不参与带的划分，先剔掉再按 1~3 判。')
lines.push('   （注意：**占满整宽的标题条/整块内容不算装饰**，它是正常的一条带 —— 早期版本写成「全宽元素不参与主轴」，')
lines.push('    那会把 `807:2` 判成 row，是错的，已更正。）')
lines.push('5. 判不准就填 `?` —— **允许弃权**，弃权样本不进 fixture。宁缺勿滥。')
lines.push('')
lines.push(`## 样本概况`)
lines.push('')
lines.push(`- 采样池（无 layoutMode ∧ ≥2 子 ∧ 产线度量 low）：**${poolTotal}** 个（含重复组件）`)
lines.push(`- 按节点 id 去重：**${cases.length}** 个`)
lines.push(`- 再按**结构签名**去重（父框尺寸 + 子项尺寸/相对位置，不含 id）：**${unique.length}** 个唯一结构`)
lines.push(`- 入选：**${picked.length}** 个，其中必含锚点 **${picked.filter((x) => x.isAnchor).length}** 个（标 ★，可能不在 low 池里）`)
lines.push('')
lines.push('> 标 `×N` 的表示「同一结构还有 N-1 个复制品」，判一次即代表整族。')
lines.push(`- 分层键（bands 预测 | 子项数桶，仅作历史留档）：${keys.map((k) => `\`${k}\``).join(' / ')}`)
lines.push('')
lines.push('## 一览表（已裁决）')
lines.push('')
lines.push('「视觉裁决」= 看图判出的真值；「产线」= 现用度量的预测。')
lines.push('')
lines.push('| # | 容器 | 父框 | 子项 | 同构复制 | 视觉裁决 | 产线 | 一致 |')
lines.push('|---|---|---|---|---|---|---|---|')
picked.forEach((c, n) => {
  const t = VERDICT.truth[c.id] || '?'
  const p = c.oldDir || 'null'
  const mark = t === '?' ? '—' : t === p ? '✅' : '❌'
  lines.push(
    `| ${String(n + 1).padStart(2, '0')} | \`${c.id}\`${c.isAnchor ? ' ★' : ''} | ${Math.round(c.parent.width)}×${Math.round(c.parent.height)} | ${c.kids.length} | ${c.copies > 1 ? `×${c.copies}` : '—'} | \`${t}\` | \`${p}\` | ${mark} |`,
  )
})
lines.push('')
lines.push('★ = 强制锚点（前几轮已确证过真值，用来校验整份判读的一致性）')
lines.push('')
lines.push('---')
lines.push('')

picked.forEach((c, n) => {
  const p = c.parent
  const fullW = c.kids.filter((k) => k.box.width >= 0.9 * p.width).map((k) => label(k.idx))
  lines.push(
    `### ${String(n + 1).padStart(2, '0')} · \`${c.id}\`${c.isAnchor ? ' **@known**' : ''} · ${c.comp}`,
  )
  lines.push('')
  lines.push(`- 父框 **${Math.round(p.width)}×${Math.round(p.height)}**，子项 **${c.kids.length}**`)
  lines.push(
    `- 产线度量（当前代码现算）：\`${c.oldDir || 'null'}\` / conf=**${c.oldConf}** / ratio=${c.oldRatio}`,
  )
  lines.push(`- 行/列带聚类（**已作废**，仅留作对照）：\`${c.newDir || '弃权'}\` / rows=${c.newRows} cols=${c.newCols}`)
  lines.push(
    `- 宽度 ≥90% 父宽的子项：${fullW.length ? fullW.join(' / ') : '无'}`,
  )
  lines.push('')
  const crop = cropMeta.get(n)
  if (crop?.ok) {
    lines.push(`**设计稿裁剪（就是这块区域）**`)
    lines.push('')
    lines.push(`![crop](${crop.rel})`)
  } else {
    lines.push(`**设计稿裁剪**：不可用（${crop?.note || '未知'}）⇒ 只能看下面的 ASCII 图`)
  }
  lines.push('')
  lines.push('```')
  lines.push(...thumb(c.kids, p))
  lines.push('```')
  lines.push('')
  lines.push('| # | 节点 | 尺寸 | 相对父框 x,y | 文本 / 名称 |')
  lines.push('|---|---|---|---|---|')
  for (const k of c.kids) {
    const rel = `${Math.round(k.box.x - p.x)},${Math.round(k.box.y - p.y)}`
    const t = (k.text || k.name || '').replace(/\|/g, '/').slice(0, 20)
    lines.push(
      `| ${label(k.idx)} | \`${k.id}\` | ${Math.round(k.box.width)}×${Math.round(k.box.height)} | ${rel} | ${t} |`,
    )
  }
  lines.push('')
  lines.push(`判读（视觉裁决）: \`${VERDICT.truth[c.id] || '?'}\`　理由: ${VERDICT.why[c.id] || '（未裁决）'}`)
  lines.push('')
})

fs.mkdirSync(OUT_DIR, { recursive: true })
const outFile = path.join(OUT_DIR, `${TODAY}-direction-truth-cases.md`)
fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

console.log(
  JSON.stringify(
    { poolTotal, picked: picked.length, anchors: picked.filter((x) => x.isAnchor).length, outFile },
    null,
    2,
  ),
)
