/**
 * 🧱 段内结构事实 → prompt 行（2026-11-08 · mc-1794126061219-cbcac19a 实锤）。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────────
 * 段 `2:8787` 在 Figma 里是 `89:38 switch`（396.4×64.8）下**两张并排的**
 * 193.4×64.8 卡（`2:8787 active` / `2:8806 default`），但段声明里
 * `body.children=[]`、`internalSubcomponents=[]`、`responsibility` 只有一句「切换面板」
 * ⇒ prompt 里没有任何事实说「这里有两块」⇒ LLM 画一张卡铺满整段，
 * 底图（带箭头的 active 层）被 2 倍拉伸变形，卡内 4 组数据挤成一行溢出。
 *
 * ── 判据（零命名/零业务值） ─────────────────────────────────────────────────
 * `internalGeometry`（planner P-4 采集的锚点子树顶层元素几何）中存在
 * **≥2 个几何同构项**（同宽同高）⇒ 该段真值是「并列块集合」。
 *
 * ── 作用域收窄（只补空白，不改已声明） ──────────────────────────────────────
 * 仅当段**没有** `internalSubcomponents` 且 **没有** `children` 时才输出 ——
 * 已由 internalSubcomponents 描述清楚的段（如 12 卡网格）不受影响，
 * 避免二次提示导致过度拆分。
 *
 * 纯函数、零依赖（不 import logger / prompt-loader），可独立单测。
 */

/** prompt 中最多列出的块数（防 12 卡网格之类把 prompt 撑爆） */
const MAX_LISTED_BLOCKS = 8

/**
 * @param {object} sec 叶子 section（assembler 归一化后，含 internalGeometry）
 * @returns {string} prompt 片段（无事实时返回空串）
 */
export function formatInternalStructureFact(sec) {
  const geo = Array.isArray(sec?.internalGeometry) ? sec.internalGeometry : []
  if (geo.length < 2) return ''
  if (Array.isArray(sec?.internalSubcomponents) && sec.internalSubcomponents.length > 0) return ''
  if (Array.isArray(sec?.children) && sec.children.length > 0) return ''

  const groups = new Map()
  for (const g of geo) {
    const w = Number(g?.w)
    const h = Number(g?.h)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue
    const key = `${Math.round(w)}x${Math.round(h)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(g)
  }
  let best = null
  for (const [key, list] of groups) {
    if (!best || list.length > best.list.length) best = { key, list }
  }
  if (!best || best.list.length < 2) return ''

  const [w, h] = best.key.split('x')
  const n = best.list.length
  let p =
    `   - 🧱 段内结构事实（Figma 实测，**必须还原**）：该段由 **${n} 个并列同构块**组成` +
    `（各 ${w}×${h}），必须在段内分别渲染 ${n} 个独立 DOM 块、每块各自承载自己的内容；` +
    `**禁止合并成 1 块**，禁止把单块拉伸铺满整段\n`
  best.list.slice(0, MAX_LISTED_BLOCKS).forEach((g, i) => {
    const t = typeof g?.text === 'string' ? g.text.trim() : ''
    p += `     - 块${i + 1}：${t ? `文本「${t}」` : '（无直接文本，按图形/资源还原）'}\n`
  })
  return p
}

export default formatInternalStructureFact
