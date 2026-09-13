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

// 从 section.id / name 推断 type 的关键词表（英文 id 片段 + 中文 name 片段）
// 注意：顺序敏感！复合词（如 header-stats）要排在单一词（如 header）之前，
// 否则 "header-stats" 会先命中 "header" 导致类型误判（2026-09-04 实锤）。
export const TYPE_KEYWORDS = [
  ['stats', ['header-stats', 'stat', 'metric', 'summary', 'overview', '统计', '概览', '指标']],
  ['header', ['header', 'titlebar', '标题栏', '页头']],
  ['footer', ['footer', 'bottom', '底部', '页脚']],
  ['tabs', ['tab', '标签', '切换']],
  ['chart', ['chart', 'graph', 'trend', '图表', '趋势', '曲线']],
  ['grid', ['grid', '网格']],
  ['list', ['list', '列表', '清单']],
  ['card', ['card', '卡片']],
  ['sidebar', ['sidebar', 'aside', '侧边']],
  [
    'nav',
    [
      'nav',
      'navigation',
      '导航',
      '菜单',
      '侧边',
      '菜单栏',
      '纵向导航',
      '竖向导航',
    ],
  ],
  ['toolbar', ['toolbar', 'action', '工具栏', '操作栏']],
  ['body', ['body', 'content', 'main', '主体', '内容']],
];

// 内容区「小标题」负向表（刀 5a）：这些是业务区块内标题行，不是 base-panel 标题栏，
// 命中即不作为 header（回落 content/stats，或继续匹配其他业务类型）。
const INLINE_HEADING_RE =
  /(sub[-_ ]?header|小标题|副标题|子标题|分组标题|section[-_ ]?title)/;

/**
 * 推断 section 语义类型。
 * 真实 visual-parser 产物不带 `type` 字段，语义藏在 `id` 与中文 `name` 里。
 * @param {Object} sec section（含 id/name/type/header.title）
 * @returns {string} 小写 type（'' 表示未知）
 */
export function deriveSectionType(sec) {
  const explicit = sec?.type || sec?.header?.type;
  if (explicit) return String(explicit).toLowerCase();

  const idPart = String(sec?.id || '').replace(/^section[-_]?/i, '');
  const haystack =
    `${idPart} ${sec?.name || ''} ${sec?.header?.title || ''}`.toLowerCase();
  if (!haystack.trim()) return '';

  // 🛡️ 刀 5a：内容区小标题不作为 header（避免进 #header-right 双轨/过拆）。
  const isInlineHeading = INLINE_HEADING_RE.test(haystack);
  for (const [type, keywords] of TYPE_KEYWORDS) {
    if (type === 'header' && isInlineHeading) continue;
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return '';
}
