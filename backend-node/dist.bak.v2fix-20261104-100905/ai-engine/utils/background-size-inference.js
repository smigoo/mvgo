/**
 * 🛡️ P2-1（2026-08-30）：背景尺寸四件套推断（纯函数，可单测）
 *
 * ## 根因 R11
 * `_buildBackgroundStyle` 用 figmaBox 实际尺寸写 `background-size` 是对的，但覆盖不全：
 * 组件一（mc-max-1788065970150-62e42150）`2:7880 / 7890 / 7891` 全为 VECTOR，
 * fills 全 `GRADIENT_LINEAR`（无 IMAGE）→ 全链路**从未提取过 `scaleMode` / `imageTransform`**
 * （已 grep 确认 src 下零命中），只能靠几何推断。
 *
 * ## 组件一真实数据（resource-dom-mapping.json 实锤）
 * | 资源            | figmaBox      | parentBox  | 覆盖率 | 旧判据(area<0.5) | 正确     |
 * |-----------------|---------------|------------|--------|------------------|----------|
 * | bg-7890         | 295×27        | 295×27     | 1.000  | no-repeat        | 铺满     |
 * | bg-tab-active   | 78×21 @(5,3)  | 295×27     | 0.206  | **repeat ❌**     | no-repeat|
 * | bg num          | 14×14         | 14×14      | 1.000  | —                | 铺满     |
 *
 * `bg-tab-active` 是激活态渐变条，旧逻辑判成 `repeat` 会把它平铺满整条 tabs-list。
 * 这是**真 bug**，不是覆盖不全。
 *
 * ## 推断规则
 *
 * ### size
 * - 有 parentBox 且 `coverage >= COVER_RATIO(0.9)` → `100% 100%`
 *   （响应式铺满，优于写死像素；且避免「元素尺寸变化时背景错位」）
 * - 否则 → `${fw}px ${fh}px`（figmaBox 实际尺寸）
 * - 无 figmaBox 尺寸 → `100% 100%`（兜底）
 *
 * ### repeat（双重收紧，两者都满足才 repeat）
 * - **维度约束**：`fw < pw * 0.5` **且** `fh < ph * 0.5` —— 两维都远小于父容器才可能是纹理
 * - **面积约束**：`fw*fh < pw*ph * 0.25`（原 0.5 → 0.25）
 *
 * 只收面积阈值救不了 `bg-tab-active`（0.206 < 0.25 仍判 repeat）；
 * 叠加维度约束后 `fh/ph = 21/27 = 0.778 > 0.5` → 短路为 no-repeat ✅
 * （判据等价于「宽或高任一方接近父容器 → no-repeat」，只是取「远小于」的正向表述）
 *
 * ### position
 * - 相对 parentBox 的偏移（figmaBox.x - parentBox.x）
 * - ⚠️ **cover=true 时强制归零**：`background-size:100% 100%` 已铺满，再带偏移会露白边
 */

/** figmaBox 覆盖 parentBox 面积比 ≥ 此值 → 判定为「铺满」，size 用 100% 100% */
export const COVER_RATIO = 0.9;
/** 判为 repeat 纹理的面积比上限（旧 0.5 → 0.25，收紧） */
export const REPEAT_AREA_RATIO = 0.25;
/** 判为 repeat 纹理的单维占比上限：宽、高**都**要小于父容器的该比例 */
export const REPEAT_DIM_RATIO = 0.5;

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _box(b) {
  if (!b || typeof b !== 'object') return null;
  const w = _num(b.width);
  const h = _num(b.height);
  if (w <= 0 || h <= 0) return null;
  return { x: _num(b.x), y: _num(b.y), width: w, height: h };
}

/**
 * 两个 box 的交集。任一为 null → 返回 null。
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export function boxIntersection(a, b) {
  const A = _box(a);
  const B = _box(b);
  if (!A || !B) return null;
  const x1 = Math.max(A.x, B.x);
  const y1 = Math.max(A.y, B.y);
  const x2 = Math.min(A.x + A.width, B.x + B.width);
  const y2 = Math.min(A.y + A.height, B.y + B.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * figmaBox 覆盖 parentBox 的面积比（0~1）。
 * 用于判定「背景是否铺满父容器」。
 * @returns {number|null} 无法计算（缺 parentBox / 父容器面积为 0 / 无交集）时返回 null
 */
export function coverageRatio(box, parent) {
  const P = _box(parent);
  if (!P) return null;
  const inter = boxIntersection(box, parent);
  if (!inter) return 0;
  return (inter.width * inter.height) / (P.width * P.height);
}

/**
 * 从 mapping 里取 figmaBox 尺寸（figmaBox 优先，visualMeta 兜底）。
 * @returns {{width:number,height:number}} 取整后的像素尺寸，取不到为 0
 */
export function backgroundBoxSize(mapping) {
  const m = mapping || {};
  return {
    width: Math.round(_num(m.figmaBox?.width) || _num(m.visualMeta?.width) || 0),
    height: Math.round(_num(m.figmaBox?.height) || _num(m.visualMeta?.height) || 0),
  };
}

/**
 * 判定背景是否铺满父容器。
 * 无 parentBox 时**保守返回 false**（保持旧的「写死像素」行为，避免无依据地放大背景）。
 */
export function isCoveringBackground(mapping) {
  const m = mapping || {};
  if (!m.parentBox || !m.figmaBox) return false;
  const c = coverageRatio(m.figmaBox, m.parentBox);
  return c !== null && c >= COVER_RATIO;
}

/**
 * 推断 background-size。
 * @returns {{size:string, cover:boolean, coverage:number|null}}
 */
export function inferBackgroundSize(mapping) {
  const { width: fw, height: fh } = backgroundBoxSize(mapping);
  const coverage = coverageRatio(mapping?.figmaBox, mapping?.parentBox);
  if (fw > 0 && fh > 0) {
    const cover = isCoveringBackground(mapping);
    return {
      size: cover ? '100% 100%' : `${fw}px ${fh}px`,
      cover,
      coverage,
    };
  }
  // 无尺寸真值 → 兜底铺满（与旧行为一致）
  return { size: '100% 100%', cover: false, coverage };
}

/**
 * 推断 background-repeat。
 * 双重约束（两维都远小于 + 面积比够小）才判 repeat，其余一律 no-repeat。
 */
export function inferBackgroundRepeat(mapping) {
  const m = mapping || {};
  const { width: fw, height: fh } = backgroundBoxSize(m);
  const p = _box(m.parentBox);
  if (!p || fw <= 0 || fh <= 0) return 'no-repeat';
  const pa = p.width * p.height;
  if (pa <= 0) return 'no-repeat';
  // 维度约束：两维都远小于父容器，才可能是平铺纹理
  const dimOk = fw < p.width * REPEAT_DIM_RATIO && fh < p.height * REPEAT_DIM_RATIO;
  // 面积约束：0.5 → 0.25
  const areaOk = fw * fh < pa * REPEAT_AREA_RATIO;
  return dimOk && areaOk ? 'repeat' : 'no-repeat';
}

/**
 * 推断 background-position（相对 parentBox 的偏移，取整）。
 * cover=true 时强制归零：`background-size:100% 100%` 已铺满，再带偏移会露白边。
 */
export function inferBackgroundPosition(mapping, cover = false) {
  const m = mapping || {};
  if (cover) return '0px 0px';
  const p = _box(m.parentBox);
  const b = _box(m.figmaBox);
  if (!p || !b) return '0px 0px';
  return `${Math.round(b.x - p.x)}px ${Math.round(b.y - p.y)}px`;
}

/**
 * 背景四件套推断总入口（纯函数）。
 * @param {Object} mapping resourceDomMapping 条目（含 figmaBox / parentBox / visualMeta）
 * @returns {{size:string, position:string, repeat:string, cover:boolean, coverage:number|null}}
 */
export function inferBackgroundStyle(mapping = {}) {
  const { size, cover, coverage } = inferBackgroundSize(mapping);
  return {
    size,
    position: inferBackgroundPosition(mapping, cover),
    repeat: inferBackgroundRepeat(mapping),
    cover,
    coverage,
  };
}
