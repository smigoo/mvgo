/**
 * section-anchor-identity.js —— section「声明锚点」的身份解析（**零依赖纯函数模块**）。
 *
 * 🔴 为什么单独成文件（2026-11-05 · G14a）：
 *   本模块的三项（`FIGMA_ID_RE` / `sectionAnchorCandidates` / `sectionAnchorKey`）原本住在
 *   `section-anchor-truth.js`，但该文件 `:27` 反向 `import { indexFigmaNodes, getFigmaBox }
 *   from './section-tree.js'`（锚点几何审计需要树索引）。而 G14a 需要在 `section-tree.js`
 *   的 `dedupeDuplicateSections` 里判定「交集 id 是否恰好是某一方的自身身份」——
 *   若直接从 `section-anchor-truth.js` 取，就形成 `section-tree ⇄ section-anchor-truth` 环。
 *
 *   解法：把**无任何依赖的三项**下沉到本文件，`section-anchor-truth.js` 改为 re-export
 *   （6 个既有消费方 import 路径一字不改），`section-tree.js` 从本文件引用。
 *   刻意**不在** `section-tree.js` 内联第三份锚点解析 —— 候选优先级必须单一来源。
 *
 * 依赖纪律：本文件**只允许 import 零个模块**。任何新增依赖都会把环重新引回来。
 */

/** Figma 节点 id 形态（`12:345`）—— 只有这种形态才是在「宣称自己是 Figma 节点」 */
export const FIGMA_ID_RE = /^\d+:\d+$/

/**
 * 🔴 section 声明锚点的**候选序列（优先级单一来源）**：
 *   `figmaAnchorId`（上游锚点守卫的修复落点）→ `figmaNodeId` / `figmaNode`（vision 显式声明）→ `id`。
 *
 * 本函数只返回**候选值本身**、不做任何形态校验、不做 trim —— 让消费方各自决定
 * 「要不要校验形态」（如锚点审计只认 `FIGMA_ID_RE` 形态）与「取第几个非空」。
 *
 * 为什么必须是单一来源（2026-10-29 刀33）：这条优先级此前散落在三处
 *   （`section-anchor-truth#auditSectionAnchors` 的 `claimed`、`plan-body-child-id-audit#resolveAnchorId`、
 *   以及 `subcomponent-planner` 的 `String(s.figmaNodeId || s.id)`）。前两处读了
 *   `figmaAnchorId`，第三处**漏读** ⇒ vision 聚合段的语义/高度被错挂到「首卡叶子」上
 *   （mc-max-1793266461373-e7290dc5 实锤：「节点列表」标题 + 6 项 items 落到首卡）。
 *   三处各写一遍就是三条会各自漂移的判据，故统一收敛到本函数。
 *
 * 🔴 R1（2026-11-02 · mc-max-1793597679970-646085b2 撕裂实锤）：候选表追加 `nodeId` 别名
 *   （第 3 位，紧随 `figmaNodeId`）。此前**几何轨**（`sectionAnchorKey`）读 `figmaNodeId`、
 *   **归属/子树轨**（`subcomponent-planner#collectSourceNodeIds`）读 `nodeId` —— 两套字段名
 *   互不一致，锚点守卫每修一次 `figmaAnchorId` 就制造一段「几何来自 A、内容来自 B」的撕裂段
 *   （修复越多撕裂越多）。现在两条轨共用本候选表，别名在此单点维护。
 *   实测 `nodeId` 在 vision schema 与真机产物中 0 出现（防御性别名），入表零现实漂移。
 */
export function sectionAnchorCandidates(section) {
  return [section?.figmaAnchorId, section?.figmaNodeId, section?.nodeId, section?.figmaNode, section?.id]
}

/**
 * section 的**索引键**（供 `visionSemantic` / `heightById` 等 Map 查找使用）：
 * 取候选序列里第一个「非空」值，原样转字符串（等价于旧写法
 * `String(s.figmaNodeId || s.id || '')` 但**多读了 `figmaAnchorId`**）。
 *
 * 🔴 刻意**不做 Figma-id 形态校验**：planner 的索引里既有真实节点 id，也有合成段 id
 *   （`43:4791-list` / `807:2-tail-text`）—— 校验会把合成 id 变成空键，改变既有查找行为
 *   （fail-open 转 fail-closed）。要形态校验请用 `plan-body-child-id-audit#resolveAnchorId`。
 */
export function sectionAnchorKey(section) {
  for (const cand of sectionAnchorCandidates(section)) {
    if (cand == null) continue
    const s = String(cand)
    if (s.length > 0) return s
  }
  return ''
}
