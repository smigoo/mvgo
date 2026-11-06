/**
 * 🛡️ section 语义类型推导（刀 5a，2026-09-13）：从 section.id / name 推断 type。
 *
 * 从 subcomponent-planner.js 抽离成纯函数模块，消除 logger → backend-root(import.meta)
 * 的传递依赖，使 jest 可直接单测（沿用 visual-order-assign.js 的抽离模式）。
 *
 * 刀 5a 收窄 header：旧关键词 `['header','title','top','顶部','标题','头部']` 过宽，
 * 「小标题 / sub-header / 顶部 / 标题」等**内容区小标题**被误判 `type=header` →
 * 确定性模板把它们塞进 #header-right，与真正的标题行 tabs 双轨 / 过拆
 * （vehicle `2:7959 小标题`、traffic `88:32 sub-header` 实锤）。
 *
 * 治本：header 只认明确的「面板标题栏」词（header/titlebar/标题栏/页头），
 * 内容区小标题（sub-header/小标题/副标题/子标题/分组标题/section-title）负向排除，
 * 让其回落为 content/stats。header-right 的最终归属由 headerSlots 契约决定，不再是词猜。
 */

// 🛡️ Phase B-1（2026-10-31 治理方案）：角色/关键词词表收拢至 vision-facts.js 单一来源。
//   本模块保留 deriveSectionType 的优先级链；TYPE_KEYWORDS / declaredTableHeaders
//   薄壳 re-export（既有 spec/planner/接管器/装配器消费方不改 import 路径）。
import {
  TYPE_KEYWORDS,
  INLINE_HEADING_RE,
  declaredTableHeaders,
} from './vision-facts.js';

export { TYPE_KEYWORDS, declaredTableHeaders };

/**
 * 推断 section 语义类型。
 * 真实 visual-parser 产物不带 `type` 字段，语义藏在 `id` 与中文 `name` 里。
 * @param {Object} sec section（含 id/name/type/header.title）
 * @returns {string} 小写 type（'' 表示未知）
 */
export function deriveSectionType(sec) {
  // vision 已声明的表格契约优先于历史 type 和 id 子串：table-section 含 tab，
  // 且下游旧规划可能已误写 type=tabs；完整 headers 足以确定它是表格而非标签页。
  if (declaredTableHeaders(sec)) return 'table';
  const tableNodes = [sec, ...(Array.isArray(sec?.body?.children) ? sec.body.children : [])];
  if (tableNodes.some((n) => [n?.role, n?.control, n?.type]
    .some((value) => String(value || '').toLowerCase() === 'table'))) {
    return 'table';
  }

  const explicit = sec?.type || sec?.header?.type;
  if (explicit) return String(explicit).toLowerCase();

  const idPart = String(sec?.id || '').replace(/^section[-_]?/i, '');
  const haystack =
    `${idPart} ${sec?.name || ''} ${sec?.header?.title || ''}`.toLowerCase();
  if (!haystack.trim()) return '';

  // 🛡️ a100e890（mc-max-1793429316224 实锤）：vision 语义 id 的 `footer-*` 前缀是
  //   显式结构声明，优先于 stats 关键词子串（`footer-summary` 含 `summary` ⇒
  //   旧实现误判 stats ⇒ planner footer 文本锚高度恢复被跳过 ⇒ 确定性模板
  //   footer flex:1 与列表等分）。与显式表格契约同口径：id 前缀 > 关键词。
  if (/^footer[-_]/.test(idPart)) return 'footer';

  // 🛡️ 刀 5a：内容区小标题不作为 header（避免进 #header-right 双轨/过拆）。
  const isInlineHeading = INLINE_HEADING_RE.test(haystack);
  for (const [type, keywords] of TYPE_KEYWORDS) {
    if (type === 'header' && isInlineHeading) continue;
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return '';
}
