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

/**
 * 🛡️ 2026-11-05 治本（背景自适应 · c-traffic-monitor-de627a9d 实锤）：
 * Figma `scaleMode` → CSS 四件套的**唯一权威映射**。
 *
 * 此前 `scaleMode` 从未进入真值（figma-connector 重建 fill 时丢弃），
 * 只能靠几何覆盖比推断 ⇒ 无法表达「保形填充」：
 *   - Figma FILL（保持比例填满、溢出裁切）≈ CSS `cover`（容器变化**自适应且不变形**）
 *   - Figma FIT（完整装入）≈ `contain`
 *   - Figma STRETCH ≈ `100% 100%`（会变形，仅设计本意如此时才对）
 *   - Figma TILE ≈ `repeat` + 原图尺寸
 *
 * ⚠️ **STRETCH 的返回值只是「默认倾向」，不是终裁**（2026-11-05 D2 治本）：
 *   STRETCH 描述的是「图在**自己的框内**拉伸填满」，不等于「铺满挂载它的容器」。
 *   本函数不掌握 figmaBox/parentBox 几何，故返回 `100% 100%` 作为基准；
 *   `inferBackgroundSize` 会在 `coverage < COVER_RATIO`（图只是容器的局部区域）时
 *   覆盖为 `figmaBox` 实际尺寸，避免局部装饰带被拉满容器（`09636315` 实锤）。
 *   ⇒ 调用方**不要**直接用 `sizeFromScaleMode().size` 当最终 size。
 *
 * 缺失/未知返回 null ⇒ 调用方回落几何推断（保持旧行为，零回归）。
 *
 * @returns {{size:string, repeat:string, inferredBy:'scaleMode'}|null}
 */
export function sizeFromScaleMode(mapping) {
  const sm = String((mapping && mapping.imageScaleMode) || '').toUpperCase();
  switch (sm) {
    case 'FILL':
    case 'CROP':
      return { size: 'cover', repeat: 'no-repeat', inferredBy: 'scaleMode' };
    case 'FIT':
      return { size: 'contain', repeat: 'no-repeat', inferredBy: 'scaleMode' };
    case 'STRETCH':
      return { size: '100% 100%', repeat: 'no-repeat', inferredBy: 'scaleMode' };
    case 'TILE':
      return { size: 'auto', repeat: 'repeat', inferredBy: 'scaleMode' };
    default:
      return null;
  }
}

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
  const m = mapping || {};
  const coverage = coverageRatio(m.figmaBox, m.parentBox);
  // 🛡️ 2026-11-05：真值优先（scaleMode 权威），缺失才回落几何推断
  const authoritative = sizeFromScaleMode(m);
  if (authoritative) {
    // 🔴 2026-11-05 D2 治本（c-aiot-dpjh-bsjd-09636315 实锤）：
    //   `STRETCH → 100% 100%` 隐含「图节点 == 挂载容器」的假设，但 Figma 的 STRETCH
    //   只描述「图在**自己的框内**如何缩放」，不改变「框相对父容器的几何」。
    //   当图节点只是容器的一块局部区域时（coverage < COVER_RATIO），无条件 100% 100%
    //   会把局部装饰带拉满整个容器：
    //     卡 470×72，其顶部装饰带 `image 313` 为 459×29 @ 相对 y=0（coverage=0.393）
    //     ⇒ 被拉伸 2.48 倍铺满整卡，激活卡 `#a6ceff` 与非激活卡 `rgba(255,255,255,0.43)`
    //       的底色差异被完全盖住 ⇒ 用户「每个 list 都出现 image_313-5800、应该激活才有」。
    //   此处**仅**对 STRETCH 用几何裁决 size：FILL/CROP→cover、FIT→contain、TILE→auto+repeat
    //   都是**保形语义**（与容器尺寸无关），不受影响。
    //   `inferredBy` 仍记 'scaleMode'：该资源的 size 裁决确实源自 Figma scaleMode 真值，
    //   不得降级为 'geometry'（否则 `pickStyleTruthAudit` 的来源分布失真）。
    //   图节点≈父容器（coverage ≥ COVER_RATIO）时几何裁决结果仍是 100% 100%，零行为变化。
    let size = authoritative.size;
    if (size === '100% 100%' && coverage !== null && coverage < COVER_RATIO) {
      const { width: fw, height: fh } = backgroundBoxSize(m);
      if (fw > 0 && fh > 0) size = `${fw}px ${fh}px`;
    }
    return { size, cover: size === '100% 100%', coverage, inferredBy: 'scaleMode' };
  }
  const { width: fw, height: fh } = backgroundBoxSize(m);
  if (fw > 0 && fh > 0) {
    const cover = isCoveringBackground(m);
    return {
      size: cover ? '100% 100%' : `${fw}px ${fh}px`,
      cover,
      coverage,
      inferredBy: 'geometry',
    };
  }
  // 无尺寸真值 → 兜底铺满（与旧行为一致）
  return { size: '100% 100%', cover: false, coverage, inferredBy: 'geometry' };
}

/**
 * 推断 background-repeat。
 * 双重约束（两维都远小于 + 面积比够小）才判 repeat，其余一律 no-repeat。
 */
export function inferBackgroundRepeat(mapping) {
  // 🛡️ 2026-11-05：TILE 语义权威（其余 scaleMode 一律 no-repeat）
  const authoritative = sizeFromScaleMode(mapping);
  if (authoritative) return authoritative.repeat;
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
  const { size, cover, coverage, inferredBy } = inferBackgroundSize(mapping);
  // 🛡️ 2026-11-05 样式还原真值依据治理 · P1 接线（docs/2026-11-05-样式还原真值依据治理方案.md §3.5）：
  //   此前 `inferredBy` 只是本函数的返回字段，全 src 零外部消费 ⇒ 产物里出现了
  //   `background-size` 却看不出它来自 Figma scaleMode 直读还是几何兜底推断（静默写死）。
  //   这里把来源写回调用方持有的 mapping 同一对象引用：resource-dom-mapping.json
  //   是既有 checkpoint，来源天然落盘，零新增数据通道、零调用签名改动；
  //   四个消费点（microcode resource-mounter ×2 / microcode-engineer._buildBackgroundStyle /
  //   vue3-engineer）自动同口径覆盖，不会双端分叉。任务级「0 也打」计数由
  //   reject-summary#pickStyleTruthAudit 承担。只读/冻结入参不写，避免污染外部常量。
  if (mapping && typeof mapping === 'object' && !Object.isFrozen(mapping)) {
    mapping.backgroundInferredBy = inferredBy;
  }
  return {
    size,
    position: inferBackgroundPosition(mapping, cover),
    repeat: inferBackgroundRepeat(mapping),
    cover,
    coverage,
    inferredBy,
  };
}

/**
 * 🛡️ R3-bg 刀 A（2026-11-05）：`scaleMode → 背景四件套`，供 `visual-parser._calculateBackgroundSizing` 复用。
 *
 * 为什么要单独导出这一层：`_calculateBackgroundSizing` 是**轴向比值**口径（按 `wR/hR` 分档），
 * 完全不认 `imageScaleMode`，与 F3 白名单天然互逆；本文件的 `inferBackgroundSize` 是**面积覆盖比**
 * 口径且真值优先。两套口径对同一资源可以给出不同结论（语料实测 73.5% 分歧）。
 * 把「真值优先」这一层落成唯一实现，两处裁决同源，而不是让调用方各自 handroll 一遍。
 *
 * ⚠️ STRETCH 的 coverage 守卫与 `inferBackgroundSize` **逐字同口径**（`cov < COVER_RATIO` ⇒ `Wpx Hpx`）：
 * 漏掉它等于在视觉解析层把 D2 治本（`09636315` 局部装饰带被拉满整卡）重新造一遍。
 *
 * coverage 取法：mapping 自带 `figmaBox`+`parentBox`（绝对坐标）时用真实交集面积；
 * 缺坐标时退 `min(1, bw/pw) * min(1, bh/ph)` 的轴向比积作代理（对齐摆放时与真实交集等价）。
 *
 * @param {Object|null} mapping resourceDomMapping 条目（读 `imageScaleMode` / `figmaBox` / `parentBox`）
 * @param {Object|null} bgBox 调用方手上的背景节点尺寸（优先于 `mapping.figmaBox`）
 * @param {Object|null} parentDims 调用方手上的容器尺寸（优先于 `mapping.parentBox`）
 * @returns {{backgroundSize:string,backgroundPosition:string,backgroundRepeat:string,needsOverflowHidden:boolean}|null}
 *          无 scaleMode 真值 ⇒ `null`，调用方回落几何推断（保持旧行为，零回归）
 */
export function sizingFromScaleMode(mapping = null, bgBox = null, parentDims = null) {
  const authoritative = sizeFromScaleMode(mapping);
  if (!authoritative) return null;
  const m = mapping || {};
  const bw = _num(bgBox?.width) || _num(m.figmaBox?.width) || _num(m.visualMeta?.width);
  const bh = _num(bgBox?.height) || _num(m.figmaBox?.height) || _num(m.visualMeta?.height);
  const pw = _num(parentDims?.width) || _num(m.parentBox?.width);
  const ph = _num(parentDims?.height) || _num(m.parentBox?.height);

  let size = authoritative.size;
  if (size === '100% 100%' && bw > 0 && bh > 0 && pw > 0 && ph > 0) {
    const cov = _coverageFor(m, bgBox, parentDims, bw, bh, pw, ph);
    if (cov !== null && cov < COVER_RATIO) size = `${Math.round(bw)}px ${Math.round(bh)}px`;
  }

  // position：保形语义（cover / contain）与整框拉伸都按容器中心对齐；TILE 以左上为原点平铺；
  // 像素回退取图相对容器的真实偏移（与 `inferBackgroundPosition` 同口径）。
  let position = 'center center';
  if (size === 'auto') {
    position = '0px 0px';
  } else if (!/^(?:cover|contain|100% 100%)$/.test(size)) {
    position = _offsetFor(m) || '0px 0px';
  }

  return {
    backgroundSize: size,
    backgroundPosition: position,
    backgroundRepeat: authoritative.repeat,
    needsOverflowHidden: size === 'cover',
  };
}

function _coverageFor(m, bgBox, parentDims, bw, bh, pw, ph) {
  // ⚠️ 覆盖比必须与「尺寸来自哪组框」同源：调用方给了自己的尺寸（`visual-parser` 的
  //    `parentDims` 是挂载容器，可能与 `mapping.parentBox` 不同）时，若仍取 mapping 的真实交集，
  //    会出现「尺寸按调用方算、铺满判据按 mapping 算」的混口径 —— 单测实测会给出
  //    `470px 72px`（cover 判据失败）与 `100% 100%`（覆盖比 1）自相矛盾的结果。
  if (!bgBox && !parentDims) {
    const real = coverageRatio(m?.figmaBox, m?.parentBox);
    if (real !== null) return real;
  }
  if (!(pw > 0 && ph > 0)) return null;
  // 轴向比积：图完全落在容器内时与真实交集面积比等价（语料两条实锤均为 0.2536 / 0.3934）
  return Math.min(1, bw / pw) * Math.min(1, bh / ph);
}

function _offsetFor(m) {
  const p = _box(m?.parentBox);
  const b = _box(m?.figmaBox);
  if (!p || !b) return null;
  return `${Math.round(b.x - p.x)}px ${Math.round(b.y - p.y)}px`;
}

/**
 * 🛡️ R3-bg 刀 B2（2026-11-05）：**面积口径的几何裁决**（唯一实现）。
 *
 * 取代 `visual-parser._calculateBackgroundSizing` 里三类轴向比值出口：
 *   ① `0.8 ≤ wR,hR ≤ 1.2`（近等）→ 原写死 `100% 100%`
 *   ② `wR < 0.5 && hR < 0.5`（小图标）→ 原写死 `contain`
 *   ③ `wR,hR > 1.2`（大图）+ 通用兜底 → 原写死 `cover`
 *
 * ## 为什么这三类必须收敛
 * 它们都是**用一维比例猜二维语义**，且输出集里 `contain`/`cover` 的语义是「保形」，
 * 而轴向比值只回答「占了几成」，回答不了「该不该保形」。语料实锤：
 * `27×32` 挂在 `117×64`（wR=0.231、hR **恰好** 0.5，`hR < 0.5` 不成立）⇒ 落到兜底 `cover`
 * ⇒ 27px 图标被放大 4.3 倍并裁切。同类还有 `16×16 / 388×30`（wR=0.041、hR=0.533）⇒ `cover`。
 * 面积口径下这两条 `cov` 分别 0.114 / 0.022，都该写图的实际像素。
 *
 * ## 裁决规则（与 `inferBackgroundSize` 同口径，不另立第三套）
 * - `cov ≥ COVER_RATIO(0.9)` → `100% 100%`（响应式铺满，位置归零 —— 已铺满再带偏移会露白边）
 * - 否则有图尺寸 → `${W}px ${H}px` + **图相对容器的真实偏移**（`inferBackgroundPosition` 同式）
 * - 无图尺寸（真·无几何）→ `cover`：旧行为逐字保留。**不**改成 `100% 100%` ——
 *   未知尺寸时「保形填充」比「拉伸变形」安全，且此处无任何证据支持拉伸。
 *
 * ⚠️ 只裁 size/position，**不裁 repeat**：平铺只有 `TILE` 真值才有资格（刀 B1），
 * 几何永远返回 `no-repeat`。
 *
 * @param {Object|null} bgBox 背景图节点尺寸（优先于 `mapping.figmaBox`）
 * @param {Object|null} parentDims 挂载容器尺寸（优先于 `mapping.parentBox`）
 * @param {Object|null} mapping resourceDomMapping 条目（两者都缺时兜底取值）
 * @returns {{backgroundSize:string,backgroundPosition:string,backgroundRepeat:string,needsOverflowHidden:boolean,coverage:number|null}}
 */
export function areaBackgroundSizing(bgBox = null, parentDims = null, mapping = null) {
  const m = mapping || {};
  const fb = _box(bgBox) || _box(m.figmaBox);
  const pb = _box(parentDims) || _box(m.parentBox);
  const cov = coverageRatio(fb, pb);
  if (cov !== null && cov >= COVER_RATIO) {
    return {
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat',
      needsOverflowHidden: false,
      coverage: cov,
    };
  }
  const fw = fb ? Math.round(fb.width) : 0;
  const fh = fb ? Math.round(fb.height) : 0;
  if (fw > 0 && fh > 0) {
    const pos = fb && pb
      ? `${Math.round(fb.x - pb.x)}px ${Math.round(fb.y - pb.y)}px`
      : '0px 0px';
    return {
      backgroundSize: `${fw}px ${fh}px`,
      backgroundPosition: pos,
      backgroundRepeat: 'no-repeat',
      needsOverflowHidden: false,
      coverage: cov,
    };
  }
  // 真·无几何：旧行为逐字保留（`cover`），不做无证据的拉伸
  return {
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
    needsOverflowHidden: false,
    coverage: cov,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ F3′ / F3（2026-11-05 · 刀53 三链治本 · 背景真值被中性默认与红线改写推翻）

//
// 产物里的背景 `:style` 由确定性装配写出，值是 `inferBackgroundStyle(mapping)` 的真值。
// 但下游有两处会把真值覆盖掉，且**都只看「当前值长什么样」，不看它是不是真值**：
//   ① S6 自愈（`post-process#ensureBackgroundStyleComplete`）补缺失的四件套时用
//      `inferBackgroundStyle({})` 的中性默认（`100% 100%` / `no-repeat` / `0px 0px`）；
//   ② 精修红线（`layout-style-refiner#_applyRedLineFixes`）把 `cover`/`contain` 改写成
//      `100% 100%`、并删除 `center` / `no-repeat`。
// 真机实锤：`bg-_m-36.png`（191×81 / parent 192×114）真值是 `191px 80px` @ `1px 31px`，
// 产物却是 `100% 100%` @ `0px 0px` ⇒ 小底图被拉满整卡（环形图变巨环）。
//
// 修法：给这两处一个**从声明本身解析真值归属**的确定性锚 —— `url(${bg4})` → 文件内
// `import bg4 from '.../bg-_m-36.png'` → mapping → 真值。不依赖 class 名、不依赖 vision 猜测。
// 下面三个函数是「资源引用 → 真值 mapping」的唯一实现，两个修复点共用，杜绝第二套口径。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 由 `resourceFile` basename 建 resourceDomMapping 索引（含去扩展名的 stem 兜底）。
 * @param {Array|{mappings?:Array}|null} mapping
 * @returns {Map<string, object>}
 */
export function buildBackgroundResourceIndex(mapping) {
  const idx = new Map();
  const list = Array.isArray(mapping)
    ? mapping
    : (Array.isArray(mapping?.mappings) ? mapping.mappings : []);
  for (const m of list) {
    const file = String(m?.resourceFile || '').split('/').pop();
    if (!file) continue;
    if (!idx.has(file)) idx.set(file, m);
    const stem = file.replace(/\.[^.]+$/, '');
    if (stem && !idx.has(stem)) idx.set(stem, m);
  }
  return idx;
}

/**
 * 建立「模块变量 → 资源 basename」映射。
 * 产物统一走 `import bg4 from '../../resources/images/bg-_m-36.png'` + `url(${bg4})`，
 * 这是唯一可靠的**文件内**关联锚。
 * @param {string} content .vue 文件内容
 * @returns {Map<string, string>}
 */
export function buildBgVarToResource(content) {
  const map = new Map();
  const src = String(content || '');
  if (!src) return map;
  const push = (name, p) => {
    if (name && p) map.set(name, String(p).split('/').pop());
  };
  const reImport =
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.(?:png|jpe?g|webp|gif|svg|bmp))['"]/g;
  let m;
  while ((m = reImport.exec(src)) !== null) push(m[1], m[2]);
  const reAssign =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?['"]([^'"]+\.(?:png|jpe?g|webp|gif|svg|bmp))['"]/g;
  while ((m = reAssign.exec(src)) !== null) push(m[1], m[2]);
  return map;
}

/**
 * 从 `backgroundImage` 值原文解析出资源 basename（直接文件名优先，其次文件内 import 变量）。
 * @param {string} rawVal `url(${bg4})` / `url('.../bg-_m-36.png')` / `bg-_m-36.png` 等
 * @param {Map<string,string>} varToRes `buildBgVarToResource` 的结果
 * @returns {string|null}
 */
export function resolveBackgroundResourceRef(rawVal, varToRes) {
  const raw = String(rawVal || '');
  if (!raw) return null;
  const direct = raw.match(/[\w.-]+\.(?:png|jpe?g|webp|gif|svg|bmp)\b/i);
  if (direct) return direct[0].split('/').pop();
  if (!varToRes || typeof varToRes.get !== 'function') return null;
  const tokens = raw.match(/[A-Za-z_$][\w$]*/g) || [];
  for (const t of tokens) {
    if (varToRes.has(t)) return varToRes.get(t);
  }
  return null;
}
