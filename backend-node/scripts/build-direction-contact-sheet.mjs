#!/usr/bin/env node
/**
 * 把方向真值 case 的裁剪图拼成一张「对照图」，供视觉裁判一次性判读。
 * 输出：`.workbuddy/reports/<date>-direction-truth-contact-sheet.png`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORTS = path.resolve(HERE, '..', '..', '.workbuddy', 'reports')
const TODAY = new Date().toISOString().slice(0, 10)
const SRC = path.join(REPORTS, `${TODAY}-direction-truth-crops`)
const OUT = path.join(REPORTS, `${TODAY}-direction-truth-contact-sheet.png`)

const CELL_W = 420
const CELL_H = 300
const COLS = 4
const fileRxs = fs.readdirSync(SRC).filter((f) => f.endsWith('.png')).sort()

const label = (f) => f.replace(/\.png$/, '').replace(/^(\d+)-/, '$1  ').replace(/-/g, ':')

const rows = Math.ceil(fileRxs.length / COLS)
const canvasW = CELL_W * COLS
const canvasH = CELL_H * rows

const composites = []
for (let i = 0; i < fileRxs.length; i++) {
  const f = fileRxs[i]
  const col = i % COLS
  const row = Math.floor(i / COLS)
  const cellX = col * CELL_W
  const cellY = row * CELL_H

  // 单元格背景 + 序号标签
  const head = `<svg width="${CELL_W}" height="26" xmlns="http://www.w3.org/2000/svg">
    <rect width="${CELL_W}" height="26" fill="#fff"/>
    <text x="8" y="18" font-family="Menlo,monospace" font-size="14" fill="#111">${label(f)}</text>
  </svg>`
  composites.push({ input: Buffer.from(head), left: cellX, top: cellY })

  // 内容按 contain 缩放进剩余区域（保留原比例，不裁切）
  const box = { w: CELL_W - 16, h: CELL_H - 26 - 10 }
  const buf = await sharp(path.join(SRC, f))
    .resize({ width: box.w, height: box.h, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  const meta = await sharp(buf).metadata()
  composites.push({
    input: buf,
    left: cellX + Math.round((CELL_W - meta.width) / 2),
    top: cellY + 26 + Math.round((box.h - meta.height) / 2),
  })

  // 分隔线
  const line = `<svg width="${CELL_W}" height="${CELL_H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="#d0d0d0" stroke-width="1"/>
  </svg>`
  composites.push({ input: Buffer.from(line), left: cellX, top: cellY })
}

await sharp({
  create: { width: canvasW, height: canvasH, channels: 3, background: '#f4f6f9' },
})
  .composite(composites)
  .png()
  .toFile(OUT)

console.log(JSON.stringify({ out: OUT, cells: fileRxs.length, grid: `${COLS}x${rows}`, size: `${canvasW}x${canvasH}` }, null, 2))
