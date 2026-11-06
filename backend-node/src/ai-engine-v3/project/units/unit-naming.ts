/**
 * 单元命名与归属 —— figma / html 两个拆分器**共用**的单一来源。
 *
 * 抽出来只为消除重复实现，**行为必须与抽取前的 figma 拆分器逐字一致**：
 *   当时这两个函数是 `figma-unit-splitter.ts` 的私有函数，只服务 Figma 分支；
 *   现在 HTML 分支也要「同名的 name→slug」「同口径的功能点归属」，
 *   若各留一份，两边迟早漂移成「同一个功能点，figma 单元归属得上、html 单元归属不上」。
 *
 * 🔴 `idSlug`（nodeId → slug）**不在本文件**：它是 Figma 专用的 id 派生，
 *    与这里的通用归一不是一回事，留在 `figma-unit-splitter.ts`。
 */

/**
 * 把任意字符串压成稳定 slug：只留 [a-z0-9-]，中文/符号一律折叠为 '-'。
 * 这是**底层归一函数**，被 figma / html 两个拆分器共用，是命名与归属的单一来源。
 *
 * ⚠️ 注意它的**局限**：只保留 `[a-z0-9]`，故纯中文串会塌成同一段（如 `云资源监测`
 *    与 `数据安全审计` 都只剩数字残留）。因此**不能**拿它的结果单独当 id ——
 *    详见 `html-unit-splitter.ts#pageSlug`（在 ascii 段后拼内容哈希）。
 */
export function slug(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * 功能点归属（确定性，无 LLM）。
 *
 * 判据刻意保守：宁可 `feature=null`（stats.unmatched 会把它数出来、让人看见），
 * 也不硬凑一个「大概相关」的功能点 —— 归属错了会让「按功能点生成」生成错东西。
 */
export function attributeFeature(unitName: string, folderName: string, features: string[]): string | null {
  const n = String(unitName || '').toLowerCase().trim();
  const f = String(folderName || '').replace(/^c-/, '').toLowerCase().trim();
  const fJoined = f.replace(/-/g, '');
  for (const feat of features) {
    const x = String(feat || '').toLowerCase().trim();
    if (!x) continue;
    if (!n && !f) continue;
    if (n && (n.includes(x) || (x.length >= 2 && x.includes(n)))) return feat;
    if (f && (f.includes(x) || (x.length >= 2 && x.includes(f)))) return feat;
    if (fJoined && (fJoined.includes(x) || x.includes(fJoined))) return feat;
  }
  return null;
}
