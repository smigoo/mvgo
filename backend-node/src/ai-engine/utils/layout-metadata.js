/**
 * 🎯 布局元数据事实编译（`layoutMetadata`）—— **单一事实源**。
 *
 * 🛡️ 2026-11-11 根因 D 治理（`docs/2026-11-11-组件生成根因治理改动清单.md` §1.4③）：
 *   本函数原为 `roles/subcomponent-planner.js` 内部私有函数，只有 planner 主路径
 *   （`buildEffectiveSection` L2020 / L2075）会在**段构建那一刻**注入 `layoutMetadata`。
 *   而「过粗段局部展开」（`utils/over-coarse-section-expander.js`）发生在
 *   `applyOverCoarseExpansion`（planner L3286）—— **在段构建之后**
 *   ⇒ 展开产出的子段**必然**没有 `layoutMetadata`，于是：
 *     · `applyFigmaHeightGrow`（planner L2455 `if (!meta) continue`）写不回比例 ⇒ `flexGrow` 恒 0；
 *     · prompt 的 `if (meta.gap > 0)`、`meta.height`、`meta.direction` 三通道全部空转。
 *   治本不是「在展开器里再写一套」，而是把本函数提为**共享模块**，让产生侧（planner）
 *   与补写侧（expander）调**同一个**函数 —— 一份判据，两个调用点。
 *   ⚠️ 禁止任何模块另写第二份 `layoutMetadata` 构造逻辑（判据漂移 = 同类问题在别的组件复发）。
 *
 * ── direction 语义（2026-09-30 复审 §8.8 ③-b 合并轮）────────────────────────
 *   `direction` 为**真值通道 + 三态**：
 *     · **字符串形态**（真实语料）：`horizontal`/`row` → `'row'`；`vertical`/`column` → `'column'`；
 *     · **对象形态**（既有测试与旧数据）：读 `layoutMode`/`direction` 键（`'HORIZONTAL'`/`'VERTICAL'`），逐字不变；
 *     · **无事实 / `grid` / 未知取值 → `null`**（「无事实不臆造」）。`grid` 的方向事实由
 *       `gridColumns` 通道承载，**不得**写成 `flex-direction: grid`（非法 CSS）。
 *   旧实现只认对象键，而本仓真实语料 `layout`/`body.layout` 对象 **0 例**（6630 个 section 实测）
 *   ⇒ `direction` 在生产语料上恒 `'column'`（横向 section 亦然），live 口径 864 容器 + 1774 叶子 100% 失真。
 *
 *   ⚠️ 同批已同步的下游口径（缺一即造出 `flex-direction: null` 文案）：
 *     · `microcode-engineer.js` 布局协调提示已加 `if (meta.direction)` 三态护栏
 *       （该行原为无条件强指令，覆盖 1774/1774 叶子、其中 1116 条与真实 layout 相反）；
 *     · `generation-context-assembler.js:25` 本就 `|| null`；
 *     · `section-content-guard.js:775` 的 `||` 兜底从此真正可达（该字段不参与门禁判定）；
 *     · `subcomponent-planner.js` R2 豁免 OR 前项已覆盖 `horizontal|grid|row` ⇒ 冗余无害。
 *
 * ── 键契约（调用方必须按此消费，缺键即视为未实现）──────────────────────────
 *   `{ direction, alignItems, justifyContent, gap, [gapSequence], height, flexGrow, padding }`
 *   验收口径：凡 `layoutMetadata` 非 null 的段，`.height > 0` 且 `.direction` 为
 *   `'row' | 'column' | null` 三态之一（详见改动清单 §1.5 回归锁）。
 */
import { deriveGapFromBoxes, deriveGapSequence } from './row-metrics.js'

/**
 * 从 section（或其 `body.layout`）提取 Auto Layout 元数据。
 *
 * @param {object} section 段对象；读 `layout` / `body.layout` / `children[].absoluteBoundingBox`
 *                         / `absoluteBoundingBox` / `size.height` / `height` / `styles.flexGrow`
 * @returns {{
 *   direction: 'row'|'column'|null,
 *   alignItems: string,
 *   justifyContent: string,
 *   gap: number,
 *   gapSequence?: number[],
 *   height: number,
 *   flexGrow: number,
 *   padding: { top:number, right:number, bottom:number, left:number },
 * }}
 */
export function extractLayoutMetadata(section) {
  // 保持与旧实现一致的「假值回退」语义：`section.layout` 为空串时仍回退 body.layout
  const rawLayout = section?.layout || section?.body?.layout;
  // 对象形态取键；字符串形态直接取值（本仓真实语料）。
  const layoutMode = String(
    (rawLayout && typeof rawLayout === 'object'
      ? rawLayout.layoutMode || rawLayout.direction
      : rawLayout) || '',
  ).toUpperCase();
  // 三态：'row' | 'column' | null（无事实不臆造）。
  //   ⚠️ 用**前缀**匹配而非全等：真实语料里还有 `horizontal-2-columns` / `horizontal-3-items`
  //   （live 口径 5 例），而本仓既有口径都是「含 horizontal 即横向」——
  //   planner 的 `/horizontal|grid|row/i`、`prompt-builder.js:1717` 的 `/2-?col/i` 皆然。
  //   此处对齐，避免同一份 `layout` 在两处判出不同方向。
  const direction =
    layoutMode === 'ROW' || layoutMode.startsWith('HORIZONTAL')
      ? 'row'
      : layoutMode === 'COLUMN' || layoutMode.startsWith('VERTICAL')
        ? 'column'
        : null;
  // 非对象形态（字符串/缺失）时按空对象处理 —— 与原实现「取不到属性即走默认」等价
  const layout = rawLayout && typeof rawLayout === 'object' ? rawLayout : {};

  // 🛡️ L3-b（2026-10-21 · c-c8d-195c8d0e 实锤 33/20/20 全部丢失）：`itemSpacing` 只在
  //   `section.layout` 是**对象**形态时存在；真实语料 layout 是字符串（'vertical'）⇒ 取不到
  //   ⇒ `gap` 恒 0 ⇒ prompt 的 `if (meta.gap > 0)` 永不成立，整条「间距下发」通道空转。
  //   兜底：按子项 bbox 沿主轴反推（相邻间隙须一致，否则不猜）。
  const explicitGap = Number(
    (layout.itemSpacing ?? layout.gap) || 0,
  );
  const childBoxes = (Array.isArray(section?.children) ? section.children : []).map(
    (c) => c && c.absoluteBoundingBox,
  );
  const geometricGap =
    explicitGap > 0
      ? explicitGap
      : deriveGapFromBoxes(childBoxes, direction, { mode: 'dominant' });
  // 不等距（33/20/20 这类）时把完整序列一并下发，避免「只有一个众数」丢真值
  const gapSequence = explicitGap > 0 ? [] : deriveGapSequence(childBoxes, direction);
  const hasMixedGaps =
    gapSequence.length > 1 && new Set(gapSequence).size > 1;

  return {
    direction,
    alignItems:
      layout.primaryAxisAlignItems || layout.alignItems || 'flex-start',
    justifyContent:
      layout.counterAxisAlignItems || layout.justifyContent || 'flex-start',
    gap: geometricGap,
    ...(hasMixedGaps ? { gapSequence } : {}),
    // A（2026-08-29）：补区块像素高度，供「子区块高度按比例分配」规则使用。
    // 约束 ai-generation-constraints.md 要求 `flex: <Figma高度px> 1 0`，但此前 layoutMetadata
    // 完全没有 height 字段，导致 prompt 永远拿不到 px 数值、LLM 只能回退 height:100%（多区块溢出根因）。
    height:
      section?.absoluteBoundingBox?.height ||
      section?.size?.height ||
      section?.height ||
      0,
    // 🎯 2026-09-07（0907 审计 L1）：透传 vision 归一化 flexGrow 系数（平均值=1，
    // 比例 = 设计稿高度比）。统一 flex 事实源：内容区块 grow 用系数，
    // 禁止把像素高度写进 grow（root-container.md/chart-standards.md/constraints.md 已同步）。
    // 缺失时为 0，由 planner 在全部 section 提取后按高度归一化兜底补齐。
    flexGrow: Number(section?.styles?.flexGrow) || 0,
    padding: {
      top: layout.paddingTop || 0,
      right: layout.paddingRight || 0,
      bottom: layout.paddingBottom || 0,
      left: layout.paddingLeft || 0,
    },
  };
}

export default extractLayoutMetadata
