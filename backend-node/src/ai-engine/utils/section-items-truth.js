/**
 * 🛡️ P0-6（2026-11-15 · mc-max-1794719857954-049e54f6「当日总流量」实锤）：段内容项节点真实性校准。
 *
 * ── 病灶（真机证据） ────────────────────────────────────────────────────────
 * 段 `2:3660`（FRAME `1统计` 425.8×91.4）真值子树只有两个子节点：
 *   `88:34 bg-[m]`  425.8×91.4（矢量背景：两张白卡形状 + 玻璃球，**无纯色 fill`**）
 *   `1744:126 cards` 359×52（真内容容器）
 *       ├ `2:3683` 128×52 → TEXT `2:3685`「江阴靖江长江隧道」#333333 16/500
 *       │                  TEXT `2:3684`「34,620」#006fe3 24/900
 *       └ `2:3680` 131×52 → TEXT `2:3681`「江阴大桥」#333333 16/500
 *                          TEXT `2:3682`「82,379」#0c9dbe 24/900
 *
 * 而 vision 的 `body.items` 声明的是 `2:3560` / `2:3562`：
 *   `2:3560` 实际是**段外的标题文字**「当日总流量」（80×24.3 TEXT，父链 `2:3559→88:32`）；
 *   `2:3562` 是 18×18 的图标方块。**两者都不在 `2:3660` 子树内**。
 * 后果（全部实测）：
 *   ① 卡底 `repeatedFill:"#0d2a4a"` 在**整棵 Figma 树里零命中** ⇒ 深蓝底纯属臆造
 *      （真值卡形来自背景矢量图层，卡片自身无 fill）；
 *   ② 标签 `#ffffff` 13px / 数值 `#3fa9ff` 26 bold，真值是 `#333333` 16/500 与
 *      `#006fe3` 24/900；
 *   ③ 两张同款卡 `figmaHeightPx` 一个 52 一个 21（从文字高度反推的垃圾值）⇒ 第二张卡被压裁；
 *   ④ `body.layout` 写着 `horizontal-2-columns` 却渲染成纵排。
 *
 * ── 为什么不在渲染层补 ──────────────────────────────────────────────────────
 * 渲染层只是忠实执行 vision。错的是「哪两个节点是卡」。判定必须在段内容项进管线之前。
 *
 * ── 判据（几何/结构事实，零命名、零业务词表、零形态窗口） ─────────────────────
 * 「一个段的卡，必须真实存在于这个段的节点子树里」：
 *   V1 声明的 `items[].id` 必须落在 `section.figmaNodeId` 的子树内（不在 ⇒ 非法）；
 *   V2 该节点不能是 TEXT（文本节点装不下"标题 + 数值"两行，不可能是卡）；
 *   V3 `repeatedFill` 必须是该 item 子树内**真实存在的 SOLID fill**（不存在 ⇒ 臆造，清空）。
 *
 * 只要 V1 不成立 ⇒ 用「段子树内的几何重复组」重建（结构无关）：
 *   容器 C 的**直接子节点**恰好 N 个（N = 声明的 items 数），各子节点高度互相在
 *   {@link HEIGHT_TOL} 内、水平区间互不重叠，取「子节点总面积最大」的 C。
 *   逐卡从子树 TEXT 真值取：数值（纯数字串）+ 标签（其余首个），样式只取节点真值
 *   （`style.fontSize` / `style.fontWeight` / `fills` 的 SOLID 色），**绝不生成新色值**。
 *
 * ── fail-open ───────────────────────────────────────────────────────────────
 * 段无 `figmaNodeId` / 节点不在树里 / 找不到合法重复组 ⇒ 原样返回（不清空、不臆造），
 * 只累计 `unresolved`。计数行由调用方打，保证「没生效」与「没跑」可区分。
 *
 * 纯函数、无 import.meta、不修改入参结构以外的字段（仅改写 `body.items` / `body.layout`）。
 */

/** 判定「同款卡」的高度容差 */
const HEIGHT_TOL = 0.03
/** 判定「同一行并排」的 y 容差（px） */
const SAME_ROW_TOL = 2
/** 纯数字串（含千分位/小数/百分号/单位前的数字） */
const NUMBER_RE = /^[-+]?\d[\d\s,.]*%?$/

function hexOf(color) {
  if (!color || typeof color !== 'object') return null
  const ch = (v) => {
    const n = Math.round(Number(v) * 255)
    return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 0
  }
  return (
    '#' +
    [ch(color.r), ch(color.g), ch(color.b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  )
}

/** 索引：id → { node, parentId, box, kids } */
function indexFigma(figmaData) {
  const root = figmaData?.document ?? figmaData
  const byId = new Map()
  if (!root || typeof root !== 'object') return byId
  const walk = (n, parentId) => {
    if (!n || typeof n !== 'object') return
    if (n.id != null) {
      const bb = n.absoluteBoundingBox || {}
      const box =
        Number(bb.width) > 0 && Number(bb.height) > 0
          ? { x: bb.x, y: bb.y, w: bb.width, h: bb.height, bottom: bb.y + bb.height }
          : null
      byId.set(String(n.id), {
        node: n,
        parentId: parentId == null ? null : String(parentId),
        box,
        kids: Array.isArray(n.children) ? n.children : [],
      })
    }
    for (const c of Array.isArray(n.children) ? n.children : []) walk(c, n.id)
  }
  walk(root, null)
  return byId
}

/** 子树 id 集合（含自身） */
function subtreeIds(rootId, byId, memo) {
  const key = String(rootId)
  if (memo.has(key)) return memo.get(key)
  const out = new Set()
  const stack = [key]
  while (stack.length) {
    const cur = stack.pop()
    if (out.has(cur)) continue
    out.add(cur)
    const rec = byId.get(cur)
    if (!rec) continue
    for (const k of rec.kids) {
      if (k && k.id != null) stack.push(String(k.id))
    }
  }
  memo.set(key, out)
  return out
}

/** 节点自身最上层可见 SOLID fill 的 hex */
function solidFillHex(node) {
  const fills = Array.isArray(node?.fills) ? node.fills : []
  for (const f of fills) {
    if (!f || f.visible === false) continue
    if (String(f.type || '').toUpperCase() !== 'SOLID') continue
    const hex = hexOf(f.color)
    if (hex) return hex
  }
  return null
}

/** 收集子树内 TEXT 节点（树序 → 按 y 再 x 排序 = 阅读序） */
function collectTexts(rootId, byId) {
  const out = []
  const stack = [String(rootId)]
  while (stack.length) {
    const cur = stack.pop()
    const rec = byId.get(cur)
    if (!rec) continue
    const n = rec.node
    const txt = typeof n.characters === 'string' ? n.characters.trim() : ''
    if (txt && String(n.type || '').toUpperCase() === 'TEXT') {
      const st = n.style || {}
      out.push({
        text: txt,
        fontSize: Number.isFinite(Number(st.fontSize)) ? Number(st.fontSize) : null,
        fontWeight: st.fontWeight == null ? null : String(st.fontWeight),
        color: solidFillHex(n),
        box: rec.box,
      })
    }
    for (const k of rec.kids) {
      if (k && k.id != null) stack.push(String(k.id))
    }
  }
  out.sort((a, b) => {
    const ay = a.box ? a.box.y : 0
    const by = b.box ? b.box.y : 0
    if (Math.abs(ay - by) > SAME_ROW_TOL) return ay - by
    return (a.box ? a.box.x : 0) - (b.box ? b.box.x : 0)
  })
  return out
}

/**
 * 在段子树内找「几何重复组」：直接子节点恰好 n 个、高度互相接近、x 区间互不重叠。
 * @returns {{ containerId:string, kids:Array<{id:string,box:object}>, horizontal:boolean }|null}
 */
function findRepeatedGroup(sectionId, n, byId, subIds) {
  let best = null
  for (const cid of subIds) {
    if (cid === String(sectionId)) continue
    const rec = byId.get(cid)
    if (!rec || rec.kids.length !== n) continue
    const kids = []
    for (const k of rec.kids) {
      const kid = k && k.id != null ? byId.get(String(k.id)) : null
      if (!kid || !kid.box) {
        kids.length = 0
        break
      }
      kids.push({ id: String(k.id), box: kid.box, node: kid.node })
    }
    if (kids.length !== n) continue
    // 高度接近
    const hs = kids.map((k) => k.box.h)
    const hMin = Math.min(...hs)
    const hMax = Math.max(...hs)
    if (hMin <= 0 || (hMax - hMin) / hMin > HEIGHT_TOL) continue
    // x 区间互不重叠 且 y 区间互不重叠（同一行的并排卡 / 同一列的纵排卡）
    const sorted = [...kids].sort((a, b) => a.box.x - b.box.x)
    let disjoint = true
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].box.x < sorted[i - 1].box.x + sorted[i - 1].box.w - 0.5) {
        disjoint = false
        break
      }
    }
    if (!disjoint) continue
    const area = kids.reduce((s, k) => s + k.box.w * k.box.h, 0)
    const ys = kids.map((k) => k.box.y)
    const horizontal = Math.max(...ys) - Math.min(...ys) <= SAME_ROW_TOL
    if (!best || area > best.area) {
      best = { containerId: cid, kids, area, horizontal }
    }
  }
  return best
}

/**
 * 策略 2：**跨容器等高聚类**。
 *
 * 策略 1 要求「同一个容器的直接子节点恰好 N 个」，但真机常见两种包装：
 *   ② 网格被拆成多行容器（`38:3137` 的 6 张卡 = `38:3140` 的 4 张 + `38:3153` 的 2 张，
 *      全部 126×30 等高）⇒ 没有任何单容器有 6 个直接子节点。
 *   ③ 中间夹了标题/图标/DECORATION 等非卡节点。
 * 判据（与策略 1 同源，仅去掉「同一父」这一条）：
 *   把段子树内所有**非 TEXT、有盒、子树含 ≥1 TEXT** 的节点按高度聚类（{@link HEIGHT_TOL}），
 *   取「簇内可选出恰好 N 个两两不相交节点」的簇；多簇命中时取**单节点面积最小**的一簇
 *   （行容器与卡片同高时，行容器个数通常 ≠ N 且面积更大 ⇒ 自然被排除）。
 *
 * @returns {{ kids:Array<{id:string,box:object}>, horizontal:boolean }|null}
 */
function findCardsByHeightCluster(sectionId, n, byId, subIds) {
  const cands = []
  for (const id of subIds) {
    if (id === String(sectionId)) continue
    const rec = byId.get(id)
    if (!rec || !rec.box) continue
    if (String(rec.node?.type || '').toUpperCase() === 'TEXT') continue
    if (collectTexts(id, byId).length === 0) continue
    cands.push({ id, box: rec.box, node: rec.node })
  }
  if (cands.length < n) return null

  // 只保留「最细粒度」候选：若某候选盒内还包着另一个候选（面积 ≤ 其 70%），
  // 说明它只是行/网格容器，卡才是子节点 —— 否则行容器会先被贪心选中，
  // 与「同高的行容器个数 ≠ N」冲突后整簇作废（真机 `38:3137` 6 卡跨 2 行即此形）。
  const isContained = (outer, inner) =>
    inner.box.x >= outer.box.x - 0.5 &&
    inner.box.y >= outer.box.y - 0.5 &&
    inner.box.x + inner.box.w <= outer.box.x + outer.box.w + 0.5 &&
    inner.box.y + inner.box.h <= outer.box.y + outer.box.h + 0.5
  const minimal = cands.filter(
    (c) =>
      !cands.some(
        (d) => d !== c && d.box.w * d.box.h <= c.box.w * c.box.h * 0.7 && isContained(c, d),
      ),
  )
  if (minimal.length < n) return null

  cands.length = 0
  cands.push(...minimal)
  cands.sort((a, b) => a.box.h - b.box.h)

  let best = null
  for (let i = 0; i < cands.length; i += 1) {
    const h0 = cands[i].box.h
    if (!(h0 > 0)) continue
    const cluster = cands.filter((c) => Math.abs(c.box.h - h0) / h0 <= HEIGHT_TOL)
    if (cluster.length < n) continue
    // 面积降序贪心取两两不相交的 N 个
    const picked = []
    for (const c of [...cluster].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)) {
      const overlap = picked.some(
        (p) =>
          c.box.x < p.box.x + p.box.w - 0.5 &&
          p.box.x < c.box.x + c.box.w - 0.5 &&
          c.box.y < p.box.y + p.box.h - 0.5 &&
          p.box.y < c.box.y + c.box.h - 0.5,
      )
      if (overlap) continue
      picked.push(c)
      if (picked.length === n) break
    }
    if (picked.length !== n) continue
    const medianArea = picked.reduce((s, c) => s + c.box.w * c.box.h, 0) / n
    if (!best || medianArea < best.medianArea) {
      best = { picked, medianArea }
    }
  }
  if (!best) return null
  const kids = [...best.picked].sort((a, b) => {
    if (Math.abs(a.box.y - b.box.y) > SAME_ROW_TOL) return a.box.y - b.box.y
    return a.box.x - b.box.x
  })
  const ys = kids.map((k) => k.box.y)
  const horizontal = Math.max(...ys) - Math.min(...ys) <= SAME_ROW_TOL
  return { kids, horizontal }
}

/** 由重复组重建 items（形状与 vision 同构，供 section-semantics#canonicalListItem 消费） */
function buildItemsFromGroup(group, byId, stats) {
  const hs = group.kids.map((k) => k.box.h)
  const avgH = hs.reduce((a, b) => a + b, 0) / (hs.length || 1)
  return group.kids.map((kid) => {
    const texts = collectTexts(kid.id, byId)
    const numIdx = texts.findIndex((t) => NUMBER_RE.test(t.text.replace(/\s+/g, ' ').trim()))
    const num = numIdx >= 0 ? texts[numIdx] : null
    const label = texts.find((t, i) => i !== numIdx) || null
    const fill = solidFillHex(kid.node)
    if (fill) stats && (stats.truthFillApplied = (stats.truthFillApplied || 0) + 1)
    const contentElements = []
    if (label) {
      contentElements.push({
        type: 'label',
        text: label.text,
        position: 'top',
        styles: {
          fontSize: label.fontSize,
          fontWeight: label.fontWeight,
          color: label.color,
        },
      })
    }
    if (num) {
      contentElements.push({
        type: 'value',
        position: 'bottom',
        parts: [
          {
            text: num.text,
            type: 'number',
            styles: {
              fontSize: num.fontSize,
              fontWeight: num.fontWeight,
              color: num.color,
            },
          },
        ],
      })
    }
    return {
      id: kid.id,
      name: label ? label.text : num ? num.text : '',
      role: 'stat-card',
      layout: 'horizontal',
      repeatedFill: fill,
      content: {
        layout: 'vertical',
        position: 'right',
        elements: contentElements,
      },
      texts: label
        ? [
            {
              text: label.text,
              styles: {
                fontSize: label.fontSize,
                fontWeight: label.fontWeight,
                color: label.color,
              },
            },
          ]
        : [],
      stats: num
        ? [
            {
              value: num.text,
              unit: '',
              styles: {
                fontSize: num.fontSize,
                fontWeight: num.fontWeight,
                color: num.color,
              },
            },
          ]
        : [],
      styles: {
        flexGrow: avgH > 0 ? Number((kid.box.h / avgH).toFixed(3)) : 1,
        flexShrink: 1,
        flexBasis: 0,
        figmaHeightPx: kid.box.h,
      },
    }
  })
}

function sectionsOf(parsedLike) {
  // 与 visual-parser#_overrideVisionDimensionsWithFigma 同一双形态兜底：
  // analyze() 内 post-process 阶段 parsed 是扁平 layout（无 layoutStructure 壳），
  // 只认 layoutStructure.layout 会让 v3 管线恒 0 静默空转。
  const layout = parsedLike?.layoutStructure?.layout || parsedLike?.layout
  const sections = layout?.sections || parsedLike?.layoutStructure?.sections || parsedLike?.sections
  return Array.isArray(sections) ? sections : null
}

/**
 * 只诊断不修复：返回每个段的 items 真实性判定。
 * @param {object} parsedLike vision 结果（含 layoutStructure 或扁平 layout）
 * @param {object} figmaData Figma 节点树
 */
export function auditSectionItemsTruth(parsedLike, figmaData) {
  const sections = sectionsOf(parsedLike)
  const byId = indexFigma(figmaData)
  const report = []
  if (!sections || !byId.size) return report
  const memo = new Map()
  for (const s of sections) {
    const sid = s?.figmaNodeId || s?.id
    const items = s?.body?.items
    if (!sid || !Array.isArray(items) || items.length === 0) continue
    if (!byId.has(String(sid))) continue
    const sub = subtreeIds(sid, byId, memo)
    const bad = []
    for (const it of items) {
      const iid = it?.id == null ? '' : String(it.id)
      if (!iid || !sub.has(iid)) {
        bad.push({ id: iid, reason: 'outside-section-subtree' })
        continue
      }
      if (String(byId.get(iid)?.node?.type || '').toUpperCase() === 'TEXT') {
        bad.push({ id: iid, reason: 'item-is-text-node' })
      }
    }
    report.push({ sectionId: String(sid), sectionName: String(s?.name || ''), items: items.length, violations: bad })
  }
  return report
}

/**
 * 修复：V1/V2 不成立 ⇒ 按段子树内几何重复组重建 items；V3 不成立 ⇒ 清空臆造 fill。
 *
 * @param {object} parsedLike vision 结果（会被就地改写 body.items / body.layout）
 * @param {object} figmaData Figma 节点树
 * @param {object} [stats] 计数回传（供真机日志计数行取证）
 * @returns {object} stats
 */
export function repairSectionItemsTruth(parsedLike, figmaData, stats = {}) {
  const out = stats && typeof stats === 'object' ? stats : {}
  const bump = (k, n = 1) => {
    out[k] = (Number(out[k]) || 0) + n
  }
  const sections = sectionsOf(parsedLike)
  const byId = indexFigma(figmaData)
  if (!sections || !byId.size) return out
  const memo = new Map()

  for (const s of sections) {
    const sid = s?.body?.items !== undefined ? s?.figmaNodeId || s?.id : null
    const items = s?.body?.items
    if (!sid || !Array.isArray(items) || items.length === 0) continue
    if (!byId.has(String(sid))) continue
    bump('audited')
    const sub = subtreeIds(sid, byId, memo)

    // 先判 V1/V2
    let violation = null
    for (const it of items) {
      const iid = it?.id == null ? '' : String(it.id)
      if (!iid || !sub.has(iid)) {
        violation = { id: iid, reason: 'outside-section-subtree' }
        break
      }
      if (String(byId.get(iid)?.node?.type || '').toUpperCase() === 'TEXT') {
        violation = { id: iid, reason: 'item-is-text-node' }
        break
      }
    }

    if (violation) {
      bump('violated')
      const group =
        findRepeatedGroup(sid, items.length, byId, sub) ||
        findCardsByHeightCluster(sid, items.length, byId, sub)
      if (!group) {
        bump('unresolved')
        out.lastUnresolved = { sectionId: String(sid), reason: violation.reason, itemId: violation.id }
        continue
      }
      const rebuilt = buildItemsFromGroup(group, byId, out)
      if (!rebuilt.length) {
        bump('unresolved')
        continue
      }
      s.body.items = rebuilt
      s.body.layout = group.horizontal
        ? `horizontal-${rebuilt.length}-columns`
        : 'vertical'
      s.body.itemsSource = 'figma-repeated-group'
      bump('rebuilt')
      bump('itemsRebuilt', rebuilt.length)
      continue
    }

    // V3：repeatedFill 必须是 item 子树内真实存在的 SOLID fill
    for (const it of items) {
      const declared = String(it?.repeatedFill || '').trim().toLowerCase()
      if (!declared) continue
      const iid = String(it.id)
      const itemSub = subtreeIds(iid, byId, memo)
      let found = false
      for (const x of itemSub) {
        const hex = solidFillHex(byId.get(x)?.node)
        if (hex && hex.toLowerCase() === declared) {
          found = true
          break
        }
      }
      if (!found) {
        it.repeatedFill = null
        bump('fillCleared')
      }
    }
  }
  return out
}

export default repairSectionItemsTruth
