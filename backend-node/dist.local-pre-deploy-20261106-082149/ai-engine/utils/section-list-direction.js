/**
 * 列表成员方向单一事实源（无环纯函数）。
 *
 * `section.layout` 描述外层容器，`section.body.layout` 可能描述重复成员；
 * 二者冲突时不设置固定字段优先级，而由成员盒的唯一主轴仲裁。缺盒、网格或
 * 乱排均返回 null，并保留旧 sectionDirection，避免把单样本修复扩散成全局翻转。
 */

/** layout 真值归一；由原 layout-direction-guard 下沉，公开返回形态不变。 */
export function resolveTruthLayout(rawLayout) {
  const layoutMode = String(
    (rawLayout && typeof rawLayout === 'object'
      ? rawLayout.layoutMode || rawLayout.direction
      : rawLayout) || '',
  )
    .trim()
    .toUpperCase();
  const direction =
    layoutMode === 'ROW' || layoutMode.startsWith('HORIZONTAL')
      ? 'row'
      : layoutMode === 'COLUMN' || layoutMode.startsWith('VERTICAL')
        ? 'column'
        : null;
  const isGrid = layoutMode === 'GRID' || layoutMode.startsWith('GRID');
  return { direction, isGrid };
}

/** T3 既有的折叠段识别口径；原模块 re-export，保持调用 API 不变。 */
export function isVForListSection(sec) {
  if (!sec || typeof sec !== 'object') return false;
  const id = String(sec.id ?? '');
  if (/-list$/.test(id)) return true;
  if (sec.collapsed === true) return true;
  if (sec.renderHint === 'v-for') return true;
  return false;
}

function toBox(raw) {
  const b = raw?.absoluteBoundingBox || raw?.bbox || raw;
  if (!b || typeof b !== 'object') return null;
  const x = Number(b.x);
  const y = Number(b.y);
  const w = Number(b.width ?? b.w);
  const h = Number(b.height ?? b.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x, y, w, h };
}

function itemNodeId(item) {
  const figmaNode = item?.figmaNode;
  return String(
    item?.figmaNodeId ??
      (figmaNode && typeof figmaNode === 'object' ? figmaNode.id : figmaNode) ??
      item?.id ??
      '',
  );
}

/** 从既有 items + Figma 根收集成员盒；任一缺盒则几何整体不可证。 */
export function collectListMemberBoxes(sec, figmaNodeData) {
  const items = Array.isArray(sec?.items) ? sec.items : [];
  if (items.length < 2) return null;
  const root = figmaNodeData?.document || figmaNodeData || null;
  const byId = new Map();
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.id != null) byId.set(String(node.id), node);
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child);
  };
  walk(root);
  const boxes = items.map((item) => toBox(item) || toBox(byId.get(itemNodeId(item))));
  return boxes.every(Boolean) ? boxes : null;
}

/**
 * 只接受所有成员同 y/x 变化（row）或所有成员同 x/y 变化（column）。
 * 两轴都变化、无变化或盒缺失均不猜。
 */
export function inferListGeometryDirection(cardBoxes) {
  if (!Array.isArray(cardBoxes) || cardBoxes.length < 2) return null;
  const boxes = cardBoxes.map(toBox);
  if (!boxes.every(Boolean)) return null;
  const sameY = boxes.every((b) => Math.round(b.y) === Math.round(boxes[0].y));
  const sameX = boxes.every((b) => Math.round(b.x) === Math.round(boxes[0].x));
  const xVaries = boxes.some((b) => Math.round(b.x) !== Math.round(boxes[0].x));
  const yVaries = boxes.some((b) => Math.round(b.y) !== Math.round(boxes[0].y));
  if (sameY && xVaries && !yVaries) return 'row';
  if (sameX && yVaries && !xVaries) return 'column';
  return null;
}

/**
 * @returns {{direction:'row'|'column', directionSource:'declared'|'geometry-conflict'|'legacy-section-conflict'|'default'|'geometry-overrides-declared'|'geometry-overrides-default', geometryDirection:'row'|'column'|null}}
 */
export function resolveListMemberDirection(sec, evidence = {}) {
  const sectionDirection = resolveTruthLayout(sec?.layout).direction;
  const bodyDirection = resolveTruthLayout(sec?.body?.layout).direction;
  const cardBoxes = Array.isArray(evidence.cardBoxes)
    ? evidence.cardBoxes
    : collectListMemberBoxes(sec, evidence.figmaNodeData);
  const geometryDirection = inferListGeometryDirection(cardBoxes);

  if (sectionDirection && bodyDirection && sectionDirection !== bodyDirection) {
    return {
      direction: geometryDirection || sectionDirection,
      directionSource: geometryDirection ? 'geometry-conflict' : 'legacy-section-conflict',
      geometryDirection,
    };
  }
  const declared = sectionDirection || bodyDirection;
  // 🔴 刀55（2026-11-03 · mc-max-1793668153798-e0bf38e9 实锤）：几何可证 ⇒ Figma 真值
  //   胜过声明/缺省，**不再只在双声明冲突时当仲裁**。病灶：vision 段级 `layout` 描述的是
  //   「标题/内容堆叠轴」（136:122 今日累计 = 标题在上），不是「重复成员轴」；三张统计卡
  //   横排（同 y、x 递增，几何完整可证）却被 `declared||'column'` 判成 column ⇒ 整行变
  //   纵向堆叠。plan 折叠段还常丢 `body.layout` ⇒ 双声明冲突分支根本进不去。
  //   `inferListGeometryDirection` 极保守（任一缺盒/两轴都变/无变化 ⇒ null），非 null
  //   即视觉真值 —— 与 8ee4133「几何兜底方向」同一拍板口径（结构骨架=vision／布局事实=Figma）。
  if (geometryDirection && geometryDirection !== declared) {
    return {
      direction: geometryDirection,
      directionSource: declared ? 'geometry-overrides-declared' : 'geometry-overrides-default',
      geometryDirection,
    };
  }
  return {
    direction: declared || 'column',
    directionSource: declared ? 'declared' : 'default',
    geometryDirection,
  };
}
