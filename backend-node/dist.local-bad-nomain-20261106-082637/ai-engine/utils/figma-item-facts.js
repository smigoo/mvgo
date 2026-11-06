/**
 * 🛡️ H item-level DOM contract · 第一步（2026-09-22 · mc-1790048059931 实锤）
 *
 * 病灶：collapsed 卡（v-for item）内部的兄弟 TEXT 排列没有任何确定性事实——
 *   Figma 里「摄像机 (2/484)」两个 TEXT 是卡 GROUP 的直接子节点（无中间容器），
 *   buildNodeLayoutFacts 只对「有 children 的容器」发 facts（TEXT 叶子无 facts）
 *   → LLM 自己包 .cons-text div 方向自由发挥（写成 row，真值是纵排列）→ 全链路无人纠正。
 *
 * 治本第一步：兄弟节点几何分组检测，产出 item 级事实（nodeId → fact）：
 *   1) textStack：同父下 ≥2 个 TEXT，x 对齐（±xTol）且 y 严格递增 → 纵排列
 *      fact = { kind:'textStack', flexDirection:'column', texts:[{id,characters,box}], gapPx }
 *   2) textRow：x 严格递增且 y 对齐 → 横排行（对照 ContentActive「总数: 56302」）
 *   3) siblingAsset：同父下的 icon/图片类 GROUP（子树全 VECTOR/ELLIPSE 无 TEXT）→ 实测尺寸
 *      fact = { kind:'siblingAsset', widthPx, heightPx }
 *   4) itemAxis：卡容器的直接子节点 = [asset, textStack/独立TEXT…] → row（icon 左文本右）
 *
 * 事实挂在「文本组的父节点」上：map[parentNodeNodeId] = { textStack, siblingAssets }
 * （父节点是卡 GROUP——它已有 row facts；本模块补充卡内 item 级细节，字段名空间独立不冲突）
 *
 * ⚠️ 职责边界（2026-09-22 治本后定，防止对冲式治理回归）：
 *   - 本模块只产出「item 内部」事实：文本子组方向（textStack/textRow）+ icon 实测尺寸。
 *   - 「容器级」方向（flex row/column、grid 列数）归 figma-node-layout-facts.js（单一事实源）。
 *   - textStack.flexDirection 是「卡内 TEXT 子组之间」的排列方向，与 nodeLayoutFacts 对
 *     同一 nodeId 给出的「容器整体」方向（如卡容器 row）语义不同、互不冲突、禁止互相纠正。
 *   - grid 列数**不归本模块**——已在 nodeLayoutFacts.decideGeometricLayout 几何聚类接管
 *     （G1，见 docs/确定性收回清单）。本模块禁止再产出 gridColumns。
 *
 * 消费方：
 *   - 短期：L0-B 注入器（item-facts-injector）对产物包裹容器注入方向 + icon 尺寸
 *   - 中期：H DOM contract 生成确定性卡内骨架（本模块产出即契约输入格式）
 *
 * 纯函数、zero-dep、fail-open（任何异常返回空 map，不阻断管线）。
 */

const X_ALIGN_TOL = 2; // px：x 对齐容差
const Y_ALIGN_TOL = 2; // px：y 对齐容差

function boxOf(n) {
  const b = n?.absoluteBoundingBox;
  if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') return null;
  return b;
}

/** 子树是否「纯装饰资产」（VECTOR/ELLIPSE 等图元或其嵌套 GROUP/FRAME，整树无有效 TEXT）。 */
function isPureAssetGroup(n) {
  if (!n || typeof n !== 'object') return false;
  const t = String(n.type || '').toUpperCase();
  if (t === 'TEXT') {
    // 空字符串 TEXT（0 宽装饰占位）视同图元——icon 组内常见（实锤 2:8457/2:8458）
    return !String(n.characters || '').trim();
  }
  if (['VECTOR', 'ELLIPSE', 'RECTANGLE', 'LINE', 'BOOLEAN_OPERATION', 'STAR', 'REGULAR_POLYGON'].includes(t)) return true;
  // GROUP/FRAME/INSTANCE/COMPONENT 递归判子树全图元（icon 常见形态：GROUP>FRAME>VECTOR）
  if (!['GROUP', 'FRAME', 'INSTANCE', 'COMPONENT'].includes(t)) return false;
  const kids = Array.isArray(n.children) ? n.children : [];
  if (kids.length === 0) return false; // 空 GROUP 不算
  return kids.every(isPureAssetGroup);
}

/**
 * 主入口：遍历 Figma 树，产出 item 级几何分组事实。
 *
 * @param {Object} figmaNodeData Figma 节点树（接受 {document} 包裹或直接根节点）
 * @returns {Record<string, {textStack?: object, textRow?: object, siblingAssets?: Array}>}
 *   key = 文本组的父节点 id（通常是卡 GROUP）
 */
export function buildItemLevelFacts(figmaNodeData) {
  const out = {};
  let root;
  try {
    root =
      figmaNodeData && typeof figmaNodeData === 'object'
        ? figmaNodeData.document ?? figmaNodeData
        : null;
    if (!root || typeof root !== 'object') return out;

    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      const kids = Array.isArray(node.children) ? node.children : [];

      // ── 检测同父下的 TEXT 组 ──
      const texts = kids.filter(
        (c) => c && String(c.type || '').toUpperCase() === 'TEXT' && boxOf(c) && String(c.characters || '').trim(),
      );
      const assets = kids.filter((c) => c && isPureAssetGroup(c) && boxOf(c));

      if (texts.length >= 2 && node.id != null) {
        const sortedY = [...texts].sort((a, b) => boxOf(a).y - boxOf(b).y || boxOf(a).x - boxOf(b).x);
        const sortedX = [...texts].sort((a, b) => boxOf(a).x - boxOf(b).x || boxOf(a).y - boxOf(b).y);

        // 纵排列：y 严格递增 且 x 对齐（首尾 x 差 ≤ tol）
        const yStrict = sortedY.every(
          (c, i) => i === 0 || boxOf(c).y > boxOf(sortedY[i - 1]).y,
        );
        const xAlignedY = Math.abs(boxOf(sortedY[0]).x - boxOf(sortedY[sortedY.length - 1]).x) <= X_ALIGN_TOL;
        if (yStrict && xAlignedY) {
          const gaps = [];
          for (let i = 1; i < sortedY.length; i++) {
            gaps.push(boxOf(sortedY[i]).y - (boxOf(sortedY[i - 1]).y + boxOf(sortedY[i - 1]).height));
          }
          out[String(node.id)] = {
            ...(out[String(node.id)] || {}),
            textStack: {
              flexDirection: 'column',
              gapPx: gaps.length ? Math.round(Math.min(...gaps.map(Math.abs)) * 10) / 10 : 0,
              texts: sortedY.map((t) => ({
                id: t.id,
                characters: String(t.characters).trim().slice(0, 40),
                box: {
                  x: Math.round(boxOf(t).x), y: Math.round(boxOf(t).y),
                  width: Math.round(boxOf(t).width), height: Math.round(boxOf(t).height),
                },
              })),
            },
          };
        }

        // 横排行：x 严格递增 且 y 对齐（同高文本）
        const xStrict = sortedX.every(
          (c, i) => i === 0 || boxOf(c).x > boxOf(sortedX[i - 1]).x,
        );
        const yAlignedX = Math.abs(boxOf(sortedX[0]).y - boxOf(sortedX[sortedX.length - 1]).y) <= Y_ALIGN_TOL;
        if (xStrict && yAlignedX && !out[String(node.id)]?.textStack) {
          out[String(node.id)] = {
            ...(out[String(node.id)] || {}),
            textRow: {
              flexDirection: 'row',
              texts: sortedX.map((t) => ({
                id: t.id,
                characters: String(t.characters).trim().slice(0, 40),
              })),
            },
          };
        }
      }

      // ── 兄弟资产（icon）实测尺寸 ──
      if (assets.length > 0 && node.id != null) {
        const parentBox = boxOf(node);
        // 区分 icon 与整卡背景：资产尺寸 < 父容器 60% 才算 icon（bg 会铺满父容器）
        const icons = assets.filter((a) => {
          const b = boxOf(a);
          if (!parentBox) return true;
          return b.width < parentBox.width * 0.6 && b.height < parentBox.height * 0.6;
        });
        // bg 类资产（铺满父容器）单独记 isCardBg: true，供契约区分背景与图标
        const bySize = new Map();
        for (const a of assets) {
          const b = boxOf(a);
          const key = `${Math.round(b.width)}x${Math.round(b.height)}`;
          if (!bySize.has(key)) bySize.set(key, a);
        }
        const entries = [...bySize.values()].map((a) => {
          const b = boxOf(a);
          const isIcon = parentBox
            ? b.width < parentBox.width * 0.6 && b.height < parentBox.height * 0.6
            : true;
          return {
            name: a.name || a.id,
            widthPx: Math.round(b.width),
            heightPx: Math.round(b.height),
            x: Math.round(b.x),
            y: Math.round(b.y),
            isIcon,
          };
        });
        if (entries.length > 0) {
          out[String(node.id)] = {
            ...(out[String(node.id)] || {}),
            siblingAssets: entries,
          };
        }
      }

      for (const child of kids) walk(child);
    };
    walk(root);
    return out;
  } catch {
    return out; // fail-open
  }
}

export default buildItemLevelFacts;
