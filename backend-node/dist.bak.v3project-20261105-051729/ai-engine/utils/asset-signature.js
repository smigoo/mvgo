/**
 * asset-signature.js — 容器节点子树结构签名（资源下载去重）
 *
 * 背景（2026-09-02，mc-max-1788280167414-49dfbe7d 实锤）：
 * figma-connector 的 `_generateAssetSignature` 只认节点**自有 fills**，
 * 而列表项共享背景这类资源是 **GROUP 容器**（fills 为空，内容在 VECTOR 子节点）→
 * 签名返回 null → 不参与 sigGroups 去重 → 同一张图按节点数重复渲染/下载/落盘
 * （实锤：12 个 bg GROUP 产出 12 份 MD5 完全相同的 bg-*.png）。
 *
 * 本模块提供容器节点的兜底签名：递归子树的「视觉事实」——
 * type / name / 相对几何（相对容器原点、取整，免疫绝对坐标与浮点噪声）/
 * 可见 fills 色值 / strokes / effects / 文本内容 / 圆角 / 透明度。
 *
 * 设计取舍：
 * - **包含 name**：渲染不依赖 name，但同名是「同一设计元素复制」的强信号，
 *   可显著降低「同尺寸同色的不同图形」误去重风险（正确性优先于覆盖率）。
 * - **包含子节点顺序**：children 顺序即 z-index，影响渲染结果。
 * - **几何取整**：Figma 绝对坐标带浮点噪声（1517.999998 vs 1518.000001），
 *   且列表项仅 y 偏移不同——归一化为相对偏移并取整后签名一致。
 * - 原始 API 数据与 pruneRedundantFields 裁剪后的缓存数据均可签名
 *   （只用两边都保留的字段；裁剪树缺 imageRef 由 prune 侧补保留兜底）。
 */

function rgbaKey(color, opacity = 1) {
  if (!color) return '#000000';
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  if (opacity < 1) {
    return hex + Math.round(opacity * 255).toString(16).padStart(2, '0');
  }
  return hex;
}

function fillKey(f) {
  if (!f || f.visible === false) return null;
  if (f.type === 'SOLID' && f.color) {
    return `S:${rgbaKey(f.color, f.opacity ?? 1)}`;
  }
  if (f.type === 'IMAGE') {
    // imageRef 在原始 API 数据中存在；prune 裁剪树自 2026-09-02 起保留，
    // 旧缓存条目（TTL 24h，自愈）缺失时退化为 '?' 标记
    return `IMG:${f.imageRef || '?'}`;
  }
  if (
    typeof f.type === 'string' &&
    f.type.startsWith('GRADIENT_') &&
    Array.isArray(f.gradientStops)
  ) {
    const stops = [...f.gradientStops]
      .sort((a, b) => a.position - b.position)
      .map((s) => `${rgbaKey(s.color, s.opacity ?? 1)}@${Number((s.position ?? 0).toFixed(3))}`)
      .join('|');
    return `${f.type}:${stops}`;
  }
  return f.type || '?';
}

function effectsKey(effects) {
  if (!Array.isArray(effects) || effects.length === 0) return '';
  return effects
    .filter((e) => e && e.visible !== false)
    .map((e) => {
      const off = e.offset ? `${Math.round(e.offset.x ?? 0)},${Math.round(e.offset.y ?? 0)}` : '-';
      const col = e.color ? rgbaKey(e.color, e.opacity ?? 1) : '-';
      return `${e.type}:${Math.round(e.radius ?? 0)}:${off}:${col}`;
    })
    .join('&');
}

const MAX_DEPTH = 20;

function nodeKey(n, originX, originY, depth) {
  if (!n || typeof n !== 'object') return '';
  if (depth > MAX_DEPTH) return '(…)';
  const b = n.absoluteBoundingBox;
  const rel = b
    ? `${Math.round(b.x - originX)},${Math.round(b.y - originY)},${Math.round(b.width)}x${Math.round(b.height)}`
    : '-';
  const parts = [n.type || '?', n.name || '', rel];
  if (typeof n.opacity === 'number' && n.opacity !== 1) {
    parts.push(`op:${Number(n.opacity.toFixed(3))}`);
  }
  if (typeof n.cornerRadius === 'number' && n.cornerRadius > 0) {
    parts.push(`cr:${n.cornerRadius}`);
  }
  if (Array.isArray(n.fills)) {
    const fk = n.fills.map(fillKey).filter(Boolean).join('&');
    if (fk) parts.push(`f:${fk}`);
  }
  if (Array.isArray(n.strokes) && n.strokes.length > 0) {
    const sk = n.strokes
      .filter((s) => s && s.visible !== false)
      .map((s) => `${s.type}:${s.color ? rgbaKey(s.color) : '-'}`)
      .join('&');
    if (sk) {
      parts.push(`s:${sk}`);
      if (typeof n.strokeWeight === 'number') parts.push(`sw:${n.strokeWeight}`);
    }
  }
  const ek = effectsKey(n.effects);
  if (ek) parts.push(`e:${ek}`);
  if (typeof n.characters === 'string' && n.characters) {
    parts.push(`t:${n.characters}`);
  }
  const children = Array.isArray(n.children) ? n.children : [];
  const childKeys = children.map((c) => nodeKey(c, originX, originY, depth + 1));
  return `(${parts.join(',')}${childKeys.length ? `[${childKeys.join('')}]` : ''})`;
}

/**
 * 生成容器节点的子树结构签名。
 * @param {object} node Figma 节点（原始 API 数据或 prune 裁剪树均可）
 * @returns {string|null} 签名；无效输入返回 null
 */
export function generateContainerSignature(node) {
  if (!node || typeof node !== 'object') return null;
  const b = node.absoluteBoundingBox;
  const originX = b ? b.x : 0;
  const originY = b ? b.y : 0;
  return `SUBTREE:${nodeKey(node, originX, originY, 0)}`;
}
