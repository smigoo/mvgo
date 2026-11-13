/**
 * 🛡️ 根治⑪（2026-11-12 · mc-max-1794484627470-495857b7 实锤）：D2 重叠回灌指导构造器。
 *
 * 病灶：D2 闭环（phase2:6521）自 11-10 上线后，回灌指导只有一句
 *   `「A」与「B」重叠 X%`——修复轮 LLM 拿不到坐标/字号/容器，属于盲修。
 *   495857b7 实测：2 轮回灌后仍 RUNTIME-016（3 对顽固重叠：标题 vs 大数字）
 *   + RUNTIME-007（资源 404 未进指导）→ 达上限 fail-closed。
 *
 * 本模块职责：把运行时门禁 evidence 译成**配方化修复指导**（可照抄代码形态）：
 *   ① RUNTIME-016 重叠对：带双节点 bbox/字号/容器链 + 按形态给确定性修法
 *   ② RUNTIME-007 资源加载失败：带 404 清单 + 修法（import 路径核对/删引用兜底）
 *   ③ 轮次策略递进：round 1 微调 → round 2 重构容器布局 → round 3 降字号保不叠
 *
 * 纪律：
 *   - 判据单一来源：重叠数据来自 screenshot-renderer.js 采集端（唯一事实源），此处只做格式化。
 *   - 向后兼容：老结构 overlap 只有 {a,b,ratio}（无坐标）时退化为旧文案。
 *   - 纯函数、无 IO，可直接 jest。
 */

/** 截断辅助：防指导串爆 prompt */
function clip(s, n) {
  const t = String(s ?? '')
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** bbox 数组 → 紧凑描述 `[x,y w×h]` */
function fmtBox(box) {
  if (!Array.isArray(box) || box.length < 4) return null
  return `[${Math.round(box[0])},${Math.round(box[1])} ${Math.round(box[2])}×${Math.round(box[3])}]`
}

/** 两盒在 x 轴投影重叠比例（相对较小宽度） */
function xOverlapRatio(aBox, bBox) {
  if (!Array.isArray(aBox) || !Array.isArray(bBox) || aBox.length < 4 || bBox.length < 4) return 0
  const ox = Math.min(aBox[0] + aBox[2], bBox[0] + bBox[2]) - Math.max(aBox[0], bBox[0])
  if (ox <= 0) return 0
  return ox / Math.max(1, Math.min(aBox[2], bBox[2]))
}

/** 两盒在 y 轴投影重叠比例（相对较小高度） */
function yOverlapRatio(aBox, bBox) {
  if (!Array.isArray(aBox) || !Array.isArray(bBox) || aBox.length < 4 || bBox.length < 4) return 0
  const oy = Math.min(aBox[1] + aBox[3], bBox[1] + bBox[3]) - Math.max(aBox[1], bBox[1])
  if (oy <= 0) return 0
  return oy / Math.max(1, Math.min(aBox[3], bBox[3]))
}

/**
 * 单对重叠 → 形态判定 + 配方化修法。
 * 判据（确定性，可辩驳）：
 *   ① 字号差 ≥1.5 倍 ⇒ 大字数值溢出压小字标签
 *   ② x 投影重叠 >60% 且 y 投影 <60% ⇒ 上下挤压（应为纵向堆叠）
 *   ③ y 投影重叠 >60% 且 x 投影 <60% ⇒ 左右挤压（横向空间不足）
 *   ④ 其余 ⇒ 同容器文本叠放（绝对定位/负 margin/fixed 尺寸嫌疑）
 */
export function suggestOverlapFix(pair) {
  const aFs = Number(pair?.aFs) || 0
  const bFs = Number(pair?.bFs) || 0
  // ① 大字号压小字
  if (aFs > 0 && bFs > 0 && Math.max(aFs, bFs) >= 1.5 * Math.min(aFs, bFs)) {
    const bigText = aFs > bFs ? pair.a : pair.b
    const smallText = aFs > bFs ? pair.b : pair.a
    return (
      `大字号数值「${clip(bigText, 16)}」(字号${Math.max(aFs, bFs)}px) 溢出压住「${clip(smallText, 16)}」` +
      `(字号${Math.min(aFs, bFs)}px)：给大字节点加 max-width + overflow:hidden + text-overflow:ellipsis，` +
      `或缩字号（每级 -2px，最低 12px）`
    )
  }
  const xo = xOverlapRatio(pair?.aBox, pair?.bBox)
  const yo = yOverlapRatio(pair?.aBox, pair?.bBox)
  if (xo > 0.6 && yo <= 0.6) {
    return '上下挤压（x 向对齐、y 向越界）：外层容器改 display:flex;flex-direction:column;gap:8px 让两行纵向堆叠，禁止负 margin'
  }
  if (yo > 0.6 && xo <= 0.6) {
    return '左右挤压（y 向对齐、x 向越界）：横排空间不足 ⇒ 容器改 flex + 子项 min-width:0 + 文本 ellipsis，或缩短文案'
  }
  if (pair?.aAnc && pair?.aAnc === pair?.bAnc) {
    return `同容器「${clip(pair.aAnc, 40)}」内两文本叠放：检查绝对定位/负 margin/fixed 宽高，改流式布局（flex+gap）`
  }
  return '两文本 bbox 相交：检查绝对定位/负 margin/fixed 宽高，改流式布局（flex+gap），确保任意两文本不重叠'
}

/** 单对重叠 → 指导行 */
function formatPair(pair) {
  const pct = Math.round((Number(pair?.ratio) || 0) * 100)
  const aBox = fmtBox(pair?.aBox)
  const bBox = fmtBox(pair?.bBox)
  const aDesc = aBox
    ? `「${clip(pair.a, 16)}」(bbox ${aBox}${pair?.aFs ? `,字号${pair.aFs}px` : ''}${pair?.aAnc ? `,容器:${clip(pair.aAnc, 40)}` : ''})`
    : `「${clip(pair?.a, 16)}」`
  const bDesc = bBox
    ? `「${clip(pair.b, 16)}」(bbox ${bBox}${pair?.bFs ? `,字号${pair.bFs}px` : ''}${pair?.bAnc ? `,容器:${clip(pair.bAnc, 40)}` : ''})`
    : `「${clip(pair?.b, 16)}」`
  return `${aDesc} 与 ${bDesc} 重叠 ${pct}% ⇒ 建议: ${suggestOverlapFix(pair)}`
}

/** 轮次策略（递进：微调 → 重构 → 降级保底） */
const ROUND_POLICY = {
  1: '本轮做最小修复：仅调整间距/换行/溢出省略，不动整体结构',
  2: '上一轮微调未修掉 ⇒ 本轮允许重构相关容器布局（改 flex 方向/gap/宽度分配），仍禁止绝对定位叠放',
  3: '最后轮：允许降字号（每级 -2px，最低 10px）+ ellipsis，优先保证任意两文本 bbox 不相交',
}

/**
 * 构造 D2 回灌指导（RUNTIME-016 + RUNTIME-007 一并覆盖）。
 * @param {object} runtimeGate 运行时门禁结果（issues[].evidence）
 * @param {number} round 回灌轮次（1 起）
 * @returns {string} 指导文本（无命中项返回空串）
 */
export function buildD2Guidance(runtimeGate, round = 1) {
  const issues = Array.isArray(runtimeGate?.issues) ? runtimeGate.issues : []
  const parts = []

  // ① RUNTIME-016 文本重叠（配方化逐对修法）
  const ov = issues.find((i) => i?.id === 'RUNTIME-016')
  const overlaps = Array.isArray(ov?.evidence?.overlaps) ? ov.evidence.overlaps : []
  if (ov && overlaps.length > 0) {
    const policy = ROUND_POLICY[Math.min(3, Math.max(1, round))] || ROUND_POLICY[3]
    parts.push(
      [
        '【D2 文本重叠修复指导（渲染实测命中）】',
        `重叠对（共 ${ov.evidence.overlaps.length} 对，必须逐对消除）：`,
        ...overlaps.slice(0, 8).map((p, i) => `  ${i + 1}. ${formatPair(p)}`),
        `轮次策略：${policy}`,
        '通用禁令：禁止用绝对定位叠放文本；修复后重跑验证。',
      ].join('\n'),
    )
  }

  // ② RUNTIME-007 HTTP 资源加载失败（404 清单 + 修法）
  const http = issues.find((i) => i?.id === 'RUNTIME-007')
  const responses = Array.isArray(http?.evidence?.responses) ? http.evidence.responses : []
  if (http && responses.length > 0) {
    const urls = [...new Set(responses.map((r) => r?.url || '').filter(Boolean))].slice(0, 6)
    parts.push(
      [
        '【HTTP 资源加载失败（RUNTIME-007）】',
        ...urls.map((u) => `  - ${clip(u, 120)}`),
        '修法：资源 import 路径与 assets 清单逐一核对（404 多为路径大小写/扩展名错）；',
        '确认不存在的资源：删掉引用或用容器底色兜底，禁止保留 404 引用。',
      ].join('\n'),
    )
  }

  return parts.join('\n\n')
}
