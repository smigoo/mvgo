/**
 * 🛡️ 视觉序编号（刀 4，2026-09-13）：为 success 资源按「视觉位置」固化 assignedVarName。
 *
 * 根因：vehicle 三卡背景文档序 3→2→1（右→左），旧实现按 mapping 遍历序 roleIndex[role]++
 * → bg1 落在最右卡，LLM「bg1=第一张卡从左往右」装配 → DOM 右→左颠倒。
 *
 * 治本：同 role 内先按 figmaBox.y（行间，取整抗 1px 抖动）再按 x（行内）升序编号，
 * 使 bg1 = 视觉最左/最上。不推翻「单一事实源、下游只读 assignedVarName」——
 * 只把编号键从「文档序」改为「视觉序」。同 role 分组 + 桶内排序，编号语义不变。
 *
 * ⚠️ 本模块刻意**不** import config/backend-root.js（其含 import.meta，jest CJS 下语法错误）。
 * 保持零传递依赖，供 figma-connector 与 jest 单测共同 import。
 *
 * @param {Array<{m:Object, role:string}>} successMappings 收集的 success 资源（m 含 figmaBox）
 * @returns {Array} 原数组引用（就地改写 m.assignedVarName）
 */
export function assignVisualOrderVarNames(successMappings = []) {
  const list = Array.isArray(successMappings) ? successMappings : [];
  const roleBuckets = { bg: [], icon: [], img: [] };
  for (const { m, role } of list) {
    if (m && Object.prototype.hasOwnProperty.call(roleBuckets, role)) {
      roleBuckets[role].push(m);
    }
  }
  for (const role of Object.keys(roleBuckets)) {
    const bucket = roleBuckets[role];
    if (bucket.length === 0) continue;
    bucket.sort((a, b) => {
      const ay = Math.round(a.figmaBox?.y || 0);
      const by = Math.round(b.figmaBox?.y || 0);
      if (ay !== by) return ay - by;
      return (a.figmaBox?.x || 0) - (b.figmaBox?.x || 0);
    });
    let n = 0;
    for (const m of bucket) {
      n += 1;
      m.assignedVarName = `${role}${n}`;
    }
  }
  return list;
}
