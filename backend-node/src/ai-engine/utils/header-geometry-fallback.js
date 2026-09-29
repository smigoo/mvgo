/**
 * 🛡️ header 几何兜底（2026-09-29 · mc-max-1790693732608-b6e018d6 拍板方案）：
 *   命名无关的 header 类型事实补全——section 树顶层、位于顶部 15% 区域
 *   （Figma absoluteBoundingBox 事实，与 inline-header-slot-inferrer#isInTopRegion
 *   同款判据）且自身是薄条（高 ≤ 内容域 30%，防整块上卡被误标）的 section，
 *   在全树无任何 header 类型事实时强制标记 type='header'。
 *
 *   背景：header 事实此前只来自两条命名运气——① Figma 节点名 /header/i（E1）、
 *   ② vision 的 type 语义回填。两条都靠 LLM/设计稿命名，一旦顶部条不叫 header，
 *   装配器 code-generator#headerLeaves 就是空集 ⇒ #header-right 不生成、
 *   上月/本年等头部控件全落内容区。几何事实不可辩驳：顶部横条内的按钮就是头部控件。
 *
 *   纯函数、零依赖（不 import logger —— 日志由调用方按返回值打），
 *   供 subcomponent-planner 消费、单测直测。
 *
 *   fail-open：已有 header 事实 / bbox 缺失 / 判据不满足 → 原样返回零影响。
 *
 * @param {Array} sections - 顶层 section 列表（原地修改：命中项补 type/header 字段）
 * @returns {{id: string, name: string, relYRatio: number, hRatio: number}|null} 命中信息（未命中 null）
 */
export function applyHeaderGeometryFallback(sections) {
  if (!Array.isArray(sections) || sections.length < 2) return null;
  // 已有 header 事实（含嵌套，容器内 sub-header 也算）→ 不干预
  const hasHeaderFact = (list) => {
    for (const s of list || []) {
      if (!s || typeof s !== 'object') continue;
      if (s.type === 'header') return true;
      if (hasHeaderFact(s.children)) return true;
    }
    return false;
  };
  if (hasHeaderFact(sections)) return null;

  // 内容域几何（顶层 section bbox 事实；y 为 Figma 绝对坐标，用相对偏移判定）
  const withBox = sections.filter(
    (s) =>
      s &&
      typeof s === 'object' &&
      s.absoluteBoundingBox &&
      Number.isFinite(s.absoluteBoundingBox.y) &&
      Number.isFinite(s.absoluteBoundingBox.height) &&
      s.absoluteBoundingBox.height > 0,
  );
  if (withBox.length < 2) return null;
  const minY = Math.min(...withBox.map((s) => s.absoluteBoundingBox.y));
  const maxBottom = Math.max(
    ...withBox.map((s) => s.absoluteBoundingBox.y + s.absoluteBoundingBox.height),
  );
  const rootH = maxBottom - minY;
  if (!Number.isFinite(rootH) || rootH <= 0) return null;

  // 最顶的顶层薄条 section → header（只标 1 个；与 code-generator 的 header 槽
  // 唯一化契约一致：一个槽名只能出现一次）
  const top = [...withBox].sort(
    (a, b) => a.absoluteBoundingBox.y - b.absoluteBoundingBox.y,
  )[0];
  const b = top.absoluteBoundingBox;
  const relY = b.y - minY;
  const h = b.height;
  if (relY < rootH * 0.15 && h <= rootH * 0.3) {
    top.type = 'header';
    if (!top.header) top.header = { title: top.name || '' };
    return {
      id: top.id,
      name: top.name,
      relYRatio: Math.round((relY / rootH) * 1000) / 10,
      hRatio: Math.round((h / rootH) * 1000) / 10,
    };
  }
  return null;
}
