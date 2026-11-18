/**
 * 🛡️ TEXT 自重复折叠（2026-11-18 · 监测预警 1:399 三连实锤）：
 *   Figma 设计稿源数据脏——TEXT 节点 characters/name 由同一子串整重复 N 次构成
 *   （设计师复制粘贴三份文本并入一个 TEXT），视觉上必然溢出换行成重复行，
 *   LLM 忠实转写 ⇒ 产物出现「枫港大桥温度到达55℃枫港大桥温度到达55℃枫港大桥温度到达55℃」。
 *
 * 判据（双条件，缺一不动，可辩驳）：
 *   ① characters 由某子串整重复 ≥2 次构成（unit*count === str，unit 非空非纯空白）；
 *   ② 几何溢出：bbox.width < len(chars) * fontSize（整串在该盒内必然折行）。
 *   折叠目标：宽度恰好容纳的最大整数重复次数 k（unit 串宽 ≤ bbox.width 的最大 k，≥1）。
 *
 * 边界：无 bbox / 无 fontSize / count<2 / 宽度装得下（合法跑马灯类重复文案）⇒ 原样返回。
 * 纯函数：不改入参；幂等（折叠后单份不再命中判据①）。
 */

/**
 * 判定并计算折叠。
 * @param {object} p { characters, name, width, fontSize }
 * @returns {{folded: boolean, characters: string, name: string, count: number, unit: string, reason?: string}}
 */
export function foldTextRepeat({ characters, name, width, fontSize }) {
  const str = String(characters ?? '')
  if (!str.trim()) return { folded: false, characters: str, name, count: 1, reason: 'empty' }
  const fs = Number(fontSize)
  const w = Number(width)
  if (!Number.isFinite(fs) || fs <= 0 || !Number.isFinite(w) || w <= 0) {
    return { folded: false, characters: str, name, count: 1, reason: 'no-geometry' }
  }
  // ① 整重复检测（取最长 unit：从 1..len/2，命中即回）
  //   🛡️ unit ≥4 字符：'xxxxxx' 这类单字符占位串（unit=1）无语义，折叠无收益且易误伤
  let unit = null
  let count = 0
  const half = Math.floor(str.length / 2)
  for (let ul = 4; ul <= half; ul++) {
    const cand = str.slice(0, ul)
    if (cand.repeat(str.length / ul) === str) {
      unit = cand
      count = str.length / ul
      break
    }
  }
  if (!unit || count < 2) return { folded: false, characters: str, name, count: 1, reason: 'no-repeat' }
  // ② 几何溢出检测：整串在该盒内必然折行（估宽：CJK×1.0 / ASCII×0.55 / 空格×0.3）
  const estWidth = [...str].reduce((acc, ch) => {
    if (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF01-\uFF60\u3000-\u303F]/.test(ch)) return acc + fs
    if (ch === ' ') return acc + fs * 0.3
    return acc + fs * 0.55
  }, 0)
  if (estWidth <= w) {
    return { folded: false, characters: str, name, count, reason: 'fits-width' }
  }
  // 折叠目标：宽度容纳的最大整数重复次数 k
  const unitWidth = estWidth / count
  let k = Math.max(1, Math.floor(w / unitWidth))
  if (k < 1) k = 1
  if (k >= count) return { folded: false, characters: str, name, count, reason: 'no-gain' }
  const foldedStr = unit.repeat(k)
  return { folded: true, characters: foldedStr, name: foldedStr, count, unit, keep: k }
}

/**
 * 就地消毒 Figma 树：遍历全部节点，对 TEXT 的 characters/name 应用 foldTextRepeat。
 * @param {object} nodeData Figma 节点树（document 或裸树）
 * @param {object} [meta] 出参 { folded: Array<{id, from, to, count, keep}> }
 * @returns {number} 折叠数
 */
export function sanitizeTextRepeats(nodeData, meta = null) {
  if (!nodeData || typeof nodeData !== 'object') return 0
  let folded = 0
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (String(n.type) === 'TEXT' && typeof n.characters === 'string') {
      const bbox = n.absoluteBoundingBox
      const fs = Number(n.style?.fontSize ?? n.fontSize)
      const r = foldTextRepeat({
        characters: n.characters,
        name: n.name,
        width: bbox?.width,
        fontSize: fs,
      })
      if (r.folded) {
        if (meta && !meta.folded.some((x) => x.id === String(n.id))) {
          meta.folded.push({
            id: String(n.id),
            from: n.characters.slice(0, 60),
            to: r.characters,
            count: r.count,
            keep: r.keep,
          })
        }
        n.characters = r.characters
        if (typeof n.name === 'string') n.name = r.name
        folded += 1
      }
    }
    for (const c of n.children || []) walk(c)
  }
  walk(nodeData.document || nodeData)
  return folded
}
