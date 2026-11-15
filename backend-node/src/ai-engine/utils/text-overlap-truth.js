/**
 * @file text-overlap-truth.js — 🛡️ 治本（2026-11-15 · RUNTIME-016 假阳性探针实锤）：
 * 「两个文本节点 bbox 相交」是否等于「排版坍缩」的**单一事实源判据**。
 *
 * ## 病灶（8 例探针实测：5/8 假阳）
 * 旧判据只有**一个几何量**（交面积 / 较小面积 > 0.15 即 BLOCK），缺结构化事实：
 *   A `总数:<span>5</span>` 行内 label + 值 —— 父元素 bbox 天然包含子元素 ⇒ ratio 恒 = 1
 *   B absolute 角标压卡片标题               —— 设计有意叠层
 *   C absolute 背景水印大字 + 前景标题      —— 设计有意叠层
 *   D 描边立体字（同一文本两层完全重合）    —— 设计有意叠层
 *   F `rotate(-45deg)` 轴标签相邻           —— AABB 假交，视觉不叠
 * 假阳的真实危害不止「误 BLOCK」：D2 回灌会拿假坐标让模型改结构，且
 * `overlap-proof-layout#applyOverlapProofHeal` 会在写盘前把正常布局改成 flex column。
 *
 * ## 本法（零枚举、无量纲、两个结构化豁免）
 *   X1 祖先对：a/b 在 DOM 上互为祖先/后代 ⇒ 相交是盒模型必然（父容器盒罩住子盒），
 *      不是文字压字。真坍缩只可能是**同一文本流里的兄弟节点**相交。
 *   X3 同文本重合层：文本内容相同且交比 ≥ 0.9 ⇒ 描边/阴影/描边立体字等**同一文本的复制层**。
 * 两者都不改阈值本身：非祖先兄弟对 + 不同文本，仍按 `ratio > 0.15` BLOCK。
 *
 * 采集侧（浏览器内）只负责产出事实：`i`（自增 id）、`ancestors`（祖先中的文本节点 id 链）。
 * 配对、交比、豁免全部在本模块（Node 侧）完成 ⇒ 判据单源，可单测。
 *
 * @see src/ai-engine/roles/screenshot-renderer.js（preview 路径采集）
 * @see ~/.workbuddy/skills/mvgo-component-acceptance/scripts/static-audit.cjs（skill 侧镜像，同源注释）
 */

/** 交比阈值（交面积 / 较小面积）。非祖先兄弟对超过即视为坍缩。 */
export const TEXT_OVERLAP_RATIO_THRESHOLD = 0.15

/** 同文本复制层的最小交比（描边/阴影层几乎完全重合）。 */
export const SAME_TEXT_LAYER_MIN_RATIO = 0.9

/**
 * 交比：交面积 / 较小面积（无量纲，0~1）。
 * @param {number[]} aBox [x, y, w, h]
 * @param {number[]} bBox [x, y, w, h]
 * @returns {number}
 */
export function overlapRatio(aBox, bBox) {
  const [ax, ay, aw, ah] = aBox || []
  const [bx, by, bw, bh] = bBox || []
  if (![ax, ay, aw, ah, bx, by, bw, bh].every((v) => typeof v === 'number' && Number.isFinite(v))) return 0
  const ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx))
  const iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by))
  const inter = ix * iy
  if (inter <= 0) return 0
  return inter / Math.max(1, Math.min(aw * ah, bw * bh))
}

/**
 * X1：两节点是否互为祖先/后代（依据采集侧记录的 ancestors 链）。
 * @param {{i?:number, ancestors?:number[]}} a
 * @param {{i?:number, ancestors?:number[]}} b
 * @returns {boolean}
 */
export function isAncestorPair(a, b) {
  const ai = a?.i
  const bi = b?.i
  if (typeof ai !== 'number' || typeof bi !== 'number') return false
  const aAnc = Array.isArray(a?.ancestors) ? a.ancestors : []
  const bAnc = Array.isArray(b?.ancestors) ? b.ancestors : []
  return aAnc.includes(bi) || bAnc.includes(ai)
}

/**
 * 结构化解释：该重叠对是否由结构/设计必然产生，而非排版坍缩。
 *
 * 判定顺序（先强证据后弱证据）：
 *   X1 ancestor-pair       —— 盒模型必然（父容器盒罩住子盒）
 *   X2 transformed-geometry —— `getBoundingClientRect` 返回变换后的 AABB，
 *                              `rotate/scale/skew` 文本的 AABB 相交 ≠ 视觉叠字
 *   X3 same-text-layer     —— 同一文本的复制层（描边/阴影）
 *
 * ⚠️ 非 static（absolute/fixed）**不豁免**——绝对定位既可能是设计叠层（角标/水印），
 *    也可能是产物用 absolute 堆出的坍缩，两者几何不可分。当前只做诊断计数
 *    （`summarizePositionFacts`），BLOCK 行为不变，待真实分布回归后再定。
 *
 * @param {{ratio:number, nested?:boolean, transformed?:boolean, a?:string, b?:string}} pair
 * @returns {{skip:boolean, reason:null|'ancestor-pair'|'transformed-geometry'|'same-text-layer'}}
 */
export function explainStructuralOverlap(pair) {
  if (!pair) return { skip: false, reason: null }
  const ratio = typeof pair.ratio === 'number' ? pair.ratio : 0
  if (pair.nested === true) return { skip: true, reason: 'ancestor-pair' }
  if (pair.transformed === true) return { skip: true, reason: 'transformed-geometry' }
  const ta = String(pair.a ?? '').trim()
  const tb = String(pair.b ?? '').trim()
  if (ta && ta === tb && ratio >= SAME_TEXT_LAYER_MIN_RATIO) {
    return { skip: true, reason: 'same-text-layer' }
  }
  return { skip: false, reason: null }
}

/**
 * 两两构造重叠对（含祖先对标记），不改阈值。
 * @param {Array<{i?:number,text?:string,x:number,y:number,w:number,h:number,fs?:number,anc?:string,ancestors?:number[]}>} nodes
 * @param {{threshold?:number}} [opts]
 * @returns {Array<object>}
 */
export function computeTextOverlaps(nodes, opts = {}) {
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : TEXT_OVERLAP_RATIO_THRESHOLD
  const list = Array.isArray(nodes) ? nodes : []
  const pairs = []
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]
      const b = list[j]
      if (!a || !b) continue
      const ratio = overlapRatio([a.x, a.y, a.w, a.h], [b.x, b.y, b.w, b.h])
      if (!(ratio > threshold)) continue
      pairs.push({
        a: String(a.text ?? '').trim().slice(0, 24),
        b: String(b.text ?? '').trim().slice(0, 24),
        ratio: +ratio.toFixed(2),
        aBox: [a.x, a.y, a.w, a.h],
        bBox: [b.x, b.y, b.w, b.h],
        aFs: a.fs || 0,
        bFs: b.fs || 0,
        aAnc: a.anc || '',
        bAnc: b.anc || '',
        // 内部判定字段（filterStructuralOverlaps 会剥除，不进入 evidence）
        nested: isAncestorPair(a, b),
        transformed: a.tf === true || b.tf === true,
        aPos: a.pos || 'static',
        bPos: b.pos || 'static',
      })
    }
  }
  return pairs
}

/**
 * 剥离结构化豁免对。kept 的字段形态与旧 evidence **逐字一致**（7 字段），
 * 保证 D2 回灌指导 / 锚点提取 / spec 断言零改动。
 * @param {Array<object>} pairs
 * @returns {{kept:Array<object>, skipped:Array<object>}}
 */
export function filterStructuralOverlaps(pairs) {
  const kept = []
  const skipped = []
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const verdict = explainStructuralOverlap(pair)
    if (verdict.skip) {
      skipped.push({ a: pair.a, b: pair.b, ratio: pair.ratio, reason: verdict.reason })
      continue
    }
    const { nested, transformed, aPos, bPos, ...rest } = pair
    kept.push(rest)
  }
  return { kept, skipped }
}

/**
 * 诊断（**不改判据**）：统计重叠对里「显式定位」（position ≠ static）的占比。
 *
 * 目的：absolute/fixed 既可能是设计叠层（角标、水印），也可能是产物用绝对定位堆出的坍缩，
 * 两者几何不可分 ⇒ 当前不豁免，只出计数行供真实分布回归；待数据表明绝大多数
 * 非 static 对确实来自设计叠层，再讨论是否降级为 WARN。
 *
 * @param {Array<object>} pairs computeTextOverlaps 的产物（含内部字段）
 * @returns {{total:number, nonStatic:number, samples:Array<object>}}
 */
export function summarizePositionFacts(pairs) {
  const list = Array.isArray(pairs) ? pairs : []
  const nonStaticPairs = list.filter((p) => (p.aPos && p.aPos !== 'static') || (p.bPos && p.bPos !== 'static'))
  return {
    total: list.length,
    nonStatic: nonStaticPairs.length,
    samples: nonStaticPairs.slice(0, 3).map((p) => ({
      a: p.a, b: p.b, ratio: p.ratio, aPos: p.aPos, bPos: p.bPos,
    })),
  }
}

/**
 * 一步到位：采集事实 ⇒ 重叠对 ⇒ 结构化豁免 ⇒ 定位分布诊断。
 * @param {Array<object>} nodes
 * @param {{threshold?:number}} [opts]
 * @returns {{overlaps:Array<object>, skipped:Array<object>, positionFacts:{total:number,nonStatic:number,samples:Array<object>}}}
 */
export function collectTextOverlaps(nodes, opts = {}) {
  const computed = computeTextOverlaps(nodes, opts)
  const { kept, skipped } = filterStructuralOverlaps(computed)
  // 诊断只针对「最终仍会 BLOCK」的对（已豁免的不再关心定位方式）
  const blocking = computed.filter((p) => !explainStructuralOverlap(p).skip)
  return { overlaps: kept, skipped, positionFacts: summarizePositionFacts(blocking) }
}
