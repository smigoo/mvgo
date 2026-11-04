/**
 * 🚧 段级数据归属守卫（2026-11-03 · mc-doc-1793641565716-337f2bf2 P0 双渲染治本）
 *
 * ## 病灶（真机 337f2bf2 截图 + 产物审计实锤）
 *   S8 需求文档设计块（prompt-builder#buildDocDesignBlock）经 appendGlobalGuidance
 *   **无差别追加进每个分块 prompt**——含「数据对接字段映射表」
 *   （`hazardousCount` → 危化品车数量（数字卡片）等）。纯标题段 136:122「今日累计」的
 *   component chunk 也看到三卡字段映射 ⇒ LLM 越界渲染整套统计卡；而折叠轨
 *   136:127-list（ListSection）同时承载同一批卡 ⇒ 同一数据渲染两遍、上下重叠。
 *   vision 真值：136:122 body 只有标题+菱形图标，无任何卡片。
 *
 * ## 治本思路
 *   不动 S8 块本身（declare/index 块仍需全局 api 上下文做统一轮询），而是给
 *   **component 分块**追加「段级数据归属守卫」：用既有单一事实源
 *   `chunk.scopedInput._sectionScope.truthTexts`（本段真值文案并集，Phase I-1/2
 *   契约载荷，`byMapper` 命中才存在）判定文档字段归属——
 *   本段真值不包含的文档字段 ⇒ 下发禁令，禁止本段渲染其卡片/列表/数值。
 *
 * ## 安全边界（false-positive 防护）
 *   - `_sectionScope` 不存在（未匹配段 / 整稿块 / 旧任务）⇒ **不下发守卫**（fail-open，
 *     与 buildSubcomponentScopedInput 的「零漂移」哲学一致）；
 *   - 字段全部归属本段 ⇒ 不下发（ListSection 折叠段：truthTexts 含三卡名 ⇒ 零守卫）；
 *   - 部分归属 ⇒ 只禁未归属字段；
 *   - 守卫措辞**只约束文档字段的越界渲染**，显式声明不限制本段设计稿内容、
 *     交互事件（tab 切换/点击/轮播）与接口对接——tab 切换事故
 *     （mc-max-1793601934772-3c973404）殷鉴，绝不能误禁交互。
 *
 * ## 判据单一来源
 *   元素名归一复用 doc-homogeneity-hints#normalizeDocElementName
 *   （危化品车数量→危化品车），不造第二份归一口径。
 */
import { normalizeDocElementName } from './doc-homogeneity-hints.js';

/**
 * 判定一个文档字段是否归属本段。
 * 归属判据（任一命中即归属）：本段真值文案/标题（包含关系）容纳归一后的元素名。
 * @param {string} element 文档字段映射的 UI 元素名（如「危化品车数量」）
 * @param {{title?:string, truthTexts?:string[]}} scope 本段身份契约载荷
 */
export function docFieldOwnedBySection(element, scope) {
  if (!scope || typeof scope !== 'object') return false;
  const norm = normalizeDocElementName(String(element || ''));
  if (!norm) return false;
  const haystacks = [String(scope.title || ''), ...(Array.isArray(scope.truthTexts) ? scope.truthTexts : [])]
    .map((t) => normalizeDocElementName(String(t || '')))
    .filter(Boolean);
  return haystacks.some((h) => h.includes(norm));
}

/**
 * 过滤出「非本段承载」的文档字段映射（单一归属口径，守卫构建与真机计数共用）。
 * @returns {Array<object>} 非归属字段映射子集
 */
export function filterForeignMappings(sectionScope, fieldMappings) {
  if (!sectionScope || typeof sectionScope !== 'object') return [];
  if (!Array.isArray(fieldMappings)) return [];
  return fieldMappings.filter((fm) => {
    if (!fm || typeof fm !== 'object') return false;
    return !docFieldOwnedBySection(fm.element || fm.field, sectionScope);
  });
}

/**
 * 构建段级数据归属守卫 prompt 片段。
 * @param {object|null} sectionScope chunk.scopedInput._sectionScope
 *   （`{id,title,componentName,truthTexts}`；null/缺 ⇒ 返回 ''，fail-open 不守卫）
 * @param {Array<{field:string,element?:string,control?:string}>} fieldMappings
 *   docAnalysis.dataBinding.fieldMappings
 * @returns {string} ''（不下发）或守卫片段（以 \n\n 开头）
 */
export function buildDocScopeGuard(sectionScope, fieldMappings) {
  if (!sectionScope || typeof sectionScope !== 'object') return '';
  if (!Array.isArray(fieldMappings) || fieldMappings.length === 0) return '';
  const foreign = filterForeignMappings(sectionScope, fieldMappings);
  if (foreign.length === 0) return ''; // 字段全部归属本段 ⇒ 不守卫
  // 全部字段都「外来」且本段无任何真值信号（无标题、无 truthTexts）⇒ 归属判据
  // 不可信（scope 残缺，可能是空壳段）⇒ fail-open 不守卫，避免整段误禁。
  const hasTruthSignal =
    String(sectionScope.title || '').trim().length > 0 ||
    (Array.isArray(sectionScope.truthTexts) && sectionScope.truthTexts.length > 0);
  if (foreign.length === fieldMappings.length && !hasTruthSignal) return '';

  const name = String(sectionScope.componentName || sectionScope.title || '本段');
  let g = '\n\n# 🚧 段级数据归属守卫（防越界渲染）\n\n';
  g += `本段（${name}，Figma 段 ${sectionScope.id || 'n/a'}「${sectionScope.title || '无标题'}」）的 Figma 真值内容**不包含**以下文档数据字段，`
    + '**禁止在本段渲染它们的卡片/列表/统计数值**（这些字段由组件的其他段承载，重复渲染 = 双份重叠缺陷）：\n\n';
  for (const fm of foreign) {
    g += `- \`${fm.field}\` → ${fm.element || ''}${fm.control ? `（${fm.control}）` : ''}\n`;
  }
  g += '\n本守卫**仅约束上述文档字段的越界渲染**：本段按设计稿渲染自身内容、'
    + '交互事件（tab 切换/点击联动/轮播/折叠展开等）、业务事件与接口对接均不受影响，照常实现。\n';
  return g;
}
