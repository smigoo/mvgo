import {
  parseImageSize,
  collectLocalImageImports,
  judgeIconSlotSize,
  detectIconSlotIssues,
  healIconSlotSize,
  enforceIconSlotSize,
} from './icon-slot-size-contract.js'

/**
 * 🛡️ 刀 49（2026-10-22 · mc-1792643509867-db2d65f7 实锤）：图标槽位尺寸契约。
 *
 * 事故：`HeaderText2.vue` 的 `<img :src="icon5" class="c-db2d65-icon">` ——
 * `.c-db2d65-icon` 被 `ContentIcon*` 的**容器 div** 共用（`width:100%; flex:1 1 0`），
 * 实测渲染宽度 570px（真值 16），把标题挤到面板最右。
 *
 * 本 spec 覆盖：
 *   ① 真机原文端到端（阳性：三项违约全中，自愈写出 flex:none）
 *   ② 四条阴面对照（已达标 / cover / 字面量 / 真值缺失）
 *   ③ 幂等 + 保留无关内联声明
 *   ④ 图片尺寸解析（PNG/GIF/JPEG）与 flex 判定（grow>0 不算达标）
 */

const SFC = (template, imports) => `<template>
${template}
</template>

<script setup>
${imports}
</script>
`

/** 第八轮真机原文（HeaderText2.vue 的模板骨架） */
const REAL_HEADER2 = SFC(
  `  <div data-section-id="38:3162-tail-text" class="c-db2d65-header-block-quality" v-bind="$attrs">
    <div class="c-db2d65-header-title-row">
      <img :src="icon5" class="c-db2d65-icon" alt="" />
      <span class="c-db2d65-header-title-text">优质厂商</span>
    </div>
  </div>`,
  `import icon5 from '../../resources/images/icon-优质厂商-3164.png'`,
)

const SIZE16 = { width: 16, height: 16 }
const okTruth = () => SIZE16
const okResolve = (p) => (p.endsWith('.png') ? '/fake/' + p.split('/').pop() : null)

describe('刀 49 · 图标槽位尺寸契约', () => {
  // ── ① 真机原文端到端 ────────────────────────────────────────────────
  it('① 阳性（第八轮真机 HeaderText2）：三项违约全中并写成内联契约', () => {
    const det = detectIconSlotIssues(REAL_HEADER2, { resolveAbs: okResolve, sizeOf: okTruth })
    expect(det.stats.bound).toBe(1)
    expect(det.issues).toHaveLength(1)
    expect(det.issues[0].varName).toBe('icon5')
    expect(det.issues[0].violations.map((v) => v.code).sort()).toEqual(['flex', 'height', 'width'])

    const healed = healIconSlotSize(REAL_HEADER2, det.issues)
    expect(healed.changed).toBe(true)
    expect(healed.code).toContain(
      'style="width:16px;height:16px;object-fit:contain;flex:none"',
    )
    // 原 class 必须原样保留（铁律：共享 class 绝不改写）
    expect(healed.code).toContain('class="c-db2d65-icon"')
  })

  // ── ② 阴面对照 ──────────────────────────────────────────────────────
  it('② 阴性：已写齐 width/height/flex:none ⇒ 零 issue（幂等基线）', () => {
    const src = SFC(
      `  <img :src="icon5" class="c-db2d65-icon" style="width:16px;height:16px;object-fit:contain;flex:none" alt="" />`,
      `import icon5 from '../../resources/images/a.png'`,
    )
    const det = detectIconSlotIssues(src, { resolveAbs: okResolve, sizeOf: okTruth })
    expect(det.issues).toHaveLength(0)
  })

  it('③ 阴性：object-fit:cover ⇒ 视为有意裁剪铺满，不判', () => {
    const src = SFC(
      `  <img :src="icon5" class="x" style="width:100%;height:100%;object-fit:cover" alt="" />`,
      `import icon5 from '../../resources/images/a.png'`,
    )
    const det = detectIconSlotIssues(src, { resolveAbs: okResolve, sizeOf: okTruth })
    expect(det.issues).toHaveLength(0)
  })

  it('④ 阴性：src 是字面量（非 import 变量）⇒ 不判', () => {
    const src = SFC(
      `  <img src="/static/a.png" class="x" alt="" />`,
      `import icon5 from '../../resources/images/a.png'`,
    )
    const det = detectIconSlotIssues(src, { resolveAbs: okResolve, sizeOf: okTruth })
    expect(det.issues).toHaveLength(0)
    expect(det.stats.skippedLiteral).toBe(1)
  })

  it('⑤ 阴性：图片文件读不到 ⇒ 不判（fail-open，绝不猜尺寸）', () => {
    const det = detectIconSlotIssues(REAL_HEADER2, { resolveAbs: () => null, sizeOf: okTruth })
    expect(det.issues).toHaveLength(0)
    expect(det.stats.skippedUnresolved).toBe(1)
  })

  it('⑤b 阴性：能解析路径但读不出尺寸 ⇒ 不判', () => {
    const det = detectIconSlotIssues(REAL_HEADER2, { resolveAbs: okResolve, sizeOf: () => null })
    expect(det.issues).toHaveLength(0)
    expect(det.stats.skippedNoTruth).toBe(1)
  })

  // ── ③ 幂等 + 保留无关声明 ──────────────────────────────────────────
  it('⑥ 幂等：自愈后再检出必须为 0', () => {
    const det = detectIconSlotIssues(REAL_HEADER2, { resolveAbs: okResolve, sizeOf: okTruth })
    const healed = healIconSlotSize(REAL_HEADER2, det.issues)
    const again = detectIconSlotIssues(healed.code, { resolveAbs: okResolve, sizeOf: okTruth })
    expect(again.issues).toHaveLength(0)
  })

  it('⑦ 自愈只替换尺寸类声明，保留 margin / border-radius 等无关内联', () => {
    const src = SFC(
      `  <img :src="icon5" class="x" style="margin-left:4px;width:100%;border-radius:2px" alt="" />`,
      `import icon5 from '../../resources/images/a.png'`,
    )
    const det = detectIconSlotIssues(src, { resolveAbs: okResolve, sizeOf: okTruth })
    const healed = healIconSlotSize(src, det.issues)
    expect(healed.code).toContain('margin-left:4px')
    expect(healed.code).toContain('border-radius:2px')
    expect(healed.code).toContain('width:16px')
    expect(healed.code).not.toContain('width:100%')
  })

  // ── ④ 图片尺寸解析 ─────────────────────────────────────────────────
  it('⑧ parseImageSize：PNG 头（真实 16×16 字节形态）', () => {
    const buf = Buffer.alloc(32)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
    buf.writeUInt32BE(16, 16)
    buf.writeUInt32BE(16, 20)
    expect(parseImageSize(buf)).toEqual({ width: 16, height: 16 })
  })

  it('⑨ parseImageSize：GIF 头（小端）', () => {
    const buf = Buffer.alloc(16)
    Buffer.from('GIF89a', 'ascii').copy(buf, 0)
    buf.writeUInt16LE(53, 6)
    buf.writeUInt16LE(56, 8)
    expect(parseImageSize(buf)).toEqual({ width: 53, height: 56 })
  })

  it('⑩ parseImageSize：非图片 / 过短 ⇒ null', () => {
    expect(parseImageSize(Buffer.from('hello'))).toBeNull()
    expect(parseImageSize(null)).toBeNull()
  })

  // ── flex 判定 ───────────────────────────────────────────────────────
  it('⑪ flex:1 1 0 不算达标（grow>0 会让 width 失效），flex:0 0 auto 算', () => {
    const bad = `<img :src="i" style="width:16px;height:16px;flex:1 1 0">`
    expect(judgeIconSlotSize(bad, SIZE16).map((v) => v.code)).toEqual(['flex'])
    const good = `<img :src="i" style="width:16px;height:16px;flex:0 0 auto">`
    expect(judgeIconSlotSize(good, SIZE16)).toHaveLength(0)
  })

  // ── import 解析 ────────────────────────────────────────────────────
  it('⑫ collectLocalImageImports：只认静态图片路径，跳过包名/动态', () => {
    const m = collectLocalImageImports(
      `import a from '../x/a.png'\nimport b from 'lodash'\nimport c from someVar\nimport d from "../y/d.JPG"`,
    )
    expect([...m.keys()]).toEqual(['a', 'd'])
  })

  // ── 便捷入口 ───────────────────────────────────────────────────────
  it('⑬ enforceIconSlotSize：一步到位并带回 stats', () => {
    const r = enforceIconSlotSize(REAL_HEADER2, { resolveAbs: okResolve, sizeOf: okTruth })
    expect(r.changed).toBe(true)
    expect(r.healed[0].size).toBe('16x16')
    expect(r.stats.judged).toBe(1)
  })
})
