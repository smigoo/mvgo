/**
 * 🛡️ R3-2（2026-11-16）：布局判定的**子项污染源过滤 + Auto Layout 声明定性**（单一判据来源）。
 *
 * ## 为什么必须单独成模块
 * 布局方向有两个判据消费方：
 *   - `utils/layout-geom-facts.js#inferLayoutFacts`（S1 段级五态事实）
 *   - `utils/figma-node-layout-facts.js#buildNodeLayoutFacts`（B' 节点级 display/direction）
 * 两边都要做同一件事：**排除不参与主轴排布的子项**、**判断 `layoutMode` 声明是否可信**。
 * 判据若各写一份，就是第二个真值源（本项目已因「同一问题两个口径」返工多次）。
 *
 * ## 三类污染源（按危害排序）
 * 1. `layoutPositioning === 'ABSOLUTE'`：Auto Layout 容器里的**绝对定位子项不参与主轴排布**，
 *    它的 bbox 是「覆盖/浮层」位置。混进几何判定会直接造出假冲突
 *    —— 声明 `HORIZONTAL`、绝对子项压在兄弟上 ⇒ 判据误认为「AL 说谎」。
 *    本管线自己就会产生这类节点（Figma 整理插件 `frameFallback` 给新建壳写
 *    `layoutPositioning="ABSOLUTE"`，防止被父 AL 当 flow item）⇒ 必须显式剔除。
 * 2. 非容器类型带 `layoutMode`：Figma 里只有 FRAME / COMPONENT / COMPONENT_SET / INSTANCE /
 *    SECTION 能承载 Auto Layout。GROUP / VECTOR / RECTANGLE 等带 `layoutMode` 属脏数据
 *    （导出破损、插件误写），此类声明**一律不采信**。
 * 3. `visible === false`：**本模块不剔除**。既有决策（`figma-connector#pruneRedundantFields`
 *    R5-visible 注释）明确「清 name+characters、**保留 bbox 供布局**」，隐藏节点仍占位参与
 *    几何判定。改这条会波及文本抽取与段高，需单独评估 ⇒ 此处只登记，不实现。
 *
 * ## 与 R3 的关系
 * R3（`docs/2026-11-14-布局真值整治方案.md`）定的是「**几何优先，`layoutMode` 只作交叉验证**」。
 * 本模块只提供「声明是什么 / 可信吗」的事实，**不裁决方向**；裁决在各自的判据层完成，
 * 但两边必须用同一条规则：**声明与几何冲突 ⇒ 几何胜，声明降级留痕**。
 */

export const LAYOUT_CHILD_FILTER_VERSION = 2;

/** Figma 中唯一能承载 Auto Layout 的节点类型（白名单，非黑名单） */
const AUTO_LAYOUT_CONTAINER_TYPES = new Set([
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
]);

/** `layoutMode` 的合法容器取值 */
const VALID_LAYOUT_MODES = new Set(['HORIZONTAL', 'VERTICAL']);

function upper(v) {
  return String(v == null ? '' : v).trim().toUpperCase();
}

/**
 * 绝对定位子项（不参与父容器的 Auto Layout 主轴排布）。
 * @param {object} node Figma 节点
 * @returns {boolean}
 */
export function isAbsolutelyPositioned(node) {
  return upper(node?.layoutPositioning) === 'ABSOLUTE';
}

/**
 * 定性一个节点的 Auto Layout 声明（**只描述事实，不裁决方向**）。
 *
 * @param {object} node Figma 节点
 * @returns {{declared:boolean, dir:'row'|'column'|null, valid:boolean, layoutMode:string|null, reason:string}}
 *   - `declared`：是否声明了 HORIZONTAL / VERTICAL（`NONE`/缺失/非法值 ⇒ false）
 *   - `dir`：声明推出的方向（仅当 declared）
 *   - `valid`：声明是否可采信（非容器类型带 AL ⇒ false）
 *   - `reason`：`ok` | `absent` | `non-container-type:<TYPE>` | `type-unknown`
 */
export function resolveDeclaredAutoLayout(node) {
  const mode = upper(node?.layoutMode);
  const declared = VALID_LAYOUT_MODES.has(mode);
  const layoutMode = mode || null;
  if (!declared) {
    return { declared: false, dir: null, valid: false, layoutMode, reason: 'absent' };
  }
  const dir = mode === 'HORIZONTAL' ? 'row' : 'column';
  const type = upper(node?.type);
  // 类型缺失时不据此否决：旧缓存/裁剪后的树可能没有 type，
  // 此时「有声明就先用」比「一律否决」更安全（否决会让整棵树退回几何猜）。
  if (!type) {
    return { declared: true, dir, valid: true, layoutMode, reason: 'type-unknown' };
  }
  if (!AUTO_LAYOUT_CONTAINER_TYPES.has(type)) {
    return {
      declared: true,
      dir,
      valid: false,
      layoutMode,
      reason: `non-container-type:${type}`,
    };
  }
  return { declared: true, dir, valid: true, layoutMode, reason: 'ok' };
}

/**
 * 取「参与布局判定的子项」。
 *
 * 只做一件事：剔除绝对定位子项。**不过滤 visible / 不改顺序 / 不递归**。
 *
 * @param {object} node 父容器
 * @returns {{children:Array<object>, absoluteSkipped:number}}
 */
export function filterLayoutChildren(node) {
  const children = Array.isArray(node?.children) ? node.children : [];
  const kept = [];
  let absoluteSkipped = 0;
  for (const child of children) {
    if (isAbsolutelyPositioned(child)) {
      absoluteSkipped += 1;
      continue;
    }
    kept.push(child);
  }
  return { children: kept, absoluteSkipped };
}

/** 计数键全集（调用方初始化 stats 时用，保证「0 也打」） */
export const LAYOUT_AL_STAT_KEYS = [
  'alDeclared', // 有 HORIZONTAL/VERTICAL 声明的容器数
  'alAgree', // 声明与几何一致
  'alConflict', // 声明与几何冲突（几何胜）
  'alOnly', // 几何不可判，仅凭声明（降级 confidence）
  'alInvalid', // 非容器类型带声明（不采信）
  'absoluteSkipped', // 被剔除的绝对定位子项数
];

export default {
  LAYOUT_CHILD_FILTER_VERSION,
  isAbsolutelyPositioned,
  resolveDeclaredAutoLayout,
  filterLayoutChildren,
  LAYOUT_AL_STAT_KEYS,
};
