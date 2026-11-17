/**
 * 🛡️ P0-R（2026-11-17 · mc-max-1794878113452-ebc85839 实锤）：plan 段资源字段**事实源校正**。
 *
 * 病灶链（监测预警 73:3）：plan 阶段 LLM 在切段输出里**自己填** `body.children[].resourceFile`
 *   ——1:477（`icon-statistics` FRAME，24×24，tab 行右端统计入口小图标）被填成
 *   `icon-1-385.png`（1:385 桥图标）+ `resourceVarName: icon1`。LLM 只是照抄 plan ⇒
 *   桥图标脱离告警行渲染在页面中部（用户实拍「icon 跑到别处」），而正确资源
 *   `icon-statistics-477.png` 零消费（E2-v3 报 WARN 后走可降级通道放行）。
 *
 * 事实源：`resource-dom-mapping` 的 `figmaNodeId` 精确匹配（`matchResourceMapping`
 *   第 1 档——「唯一事实源」口径）。mapping 由 figma-connector 下载时逐节点登记，
 *   `figmaNodeId → resourceFile` 是确定性关系，不经过任何 LLM。
 *
 * 判据（唯一可辩驳口径）：
 *   遍历 effectiveSections 的 body.children，凡 `figmaNode`/`id` 能在 mapping 里
 *   **精确命中** `figmaNodeId`、且条目 `downloadStatus === 'success'`、而 plan 写的
 *   `resourceFile` 基名 ≠ mapping 的 `resourceFile` 基名 ⇒ 改写为 mapping 值
 *   （`resourceVarName` 同步）。**同名复用合法**（1:397 复用 icon-1-385.png——
 *   mapping 里 1:397 条目的 resourceFile 本身就是 icon-1-385.png ⇒ 基名相等 ⇒ 不动）。
 *
 * 为什么放 engineer 侧而不是 planner 出口：mapping 在 engineer 侧
 *   `resolveResourceDomMapping(input.resourceDomMapping)` 处已可用，而 planner
 *   节点拿不到 mapping（数据流隔离）。放在 plan 消费点（G14b 去重之后）⇒
 *   下游（prompt/分块/验收）全部吃到校正后的 plan。
 *
 * 纯函数（就地改写 + 返回计数），幂等，fail-open（无 mapping/无命中 ⇒ 零计数）。
 */

/**
 * @param {Array} sections effectiveSections（plan 段数组，就地改写）
 * @param {Array} resourceMapping resource-dom-mapping 条目数组
 * @returns {{evaluated:number, corrected:number, correctedItems:Array<{id:string,field:string,from:string,to:string}>}}
 */
export function correctPlanResourceFiles(sections, resourceMapping) {
  const stats = { evaluated: 0, corrected: 0, correctedItems: [] };
  if (!Array.isArray(sections) || !Array.isArray(resourceMapping) || resourceMapping.length === 0) {
    return stats;
  }
  const byNodeId = new Map();
  for (const m of resourceMapping) {
    if (m && m.figmaNodeId != null && m.downloadStatus === 'success') {
      byNodeId.set(String(m.figmaNodeId), m);
    }
  }
  const baseName = (p) => String(p || '').split('/').pop() || '';

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.children)) {
      for (const c of node.children) {
        stats.evaluated += 1;
        const nid = c && (c.figmaNode ?? c.id) != null ? String(c.figmaNode ?? c.id) : '';
        const hit = nid ? byNodeId.get(nid) : null;
        if (hit) {
          const truthBase = baseName(hit.resourceFile);
          const planBase = baseName(c.resourceFile);
          if (truthBase && planBase && truthBase !== planBase) {
            const from = c.resourceFile;
            c.resourceFile = hit.resourceFile;
            if (hit.semanticVarName) c.resourceVarName = hit.semanticVarName;
            stats.corrected += 1;
            if (stats.correctedItems.length < 12) {
              stats.correctedItems.push({
                id: nid,
                field: 'resourceFile',
                from: baseName(from),
                to: truthBase,
              });
            }
          }
        }
        walk(c);
      }
    }
  };
  for (const sec of sections) {
    const body = sec && typeof sec === 'object' ? sec.body : null;
    if (body && typeof body === 'object') walk(body);
    // header.controls 等分支不承载 resourceFile（既有口径），不扫
  }
  return stats;
}
