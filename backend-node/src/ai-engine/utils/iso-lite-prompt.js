/**
 * 🧬 刀 66-P3（2026-11-12 · 四象限同步）：Lite 侧同构区块规则块 —— **vue3/lite 与 mc/lite 唯一来源**。
 *
 * ## 为什么 lite 不能用 max 那套「单模板 + 薄包装」
 * Lite 是 VisionAgent 单 agent 直接出**单文件 SFC**，没有 subcomponent-planner、没有分块池、
 * 没有 index.vue 段级改写，也没有 L0 的 `isoSectionTruth`（那是 VisualParser 后处理注入的）。
 * 硬套刀 66 会让单文件产物多出无法装配的薄包装 ⇒ 必须换机制、**同一语义**：
 *   在 prompt 里把「结构相同的 N 个区块只写一份模板 + v-for，配色/数据用变量」定成铁律。
 * 这是**语义同步**，不是代码复制；不强制收敛、不改产物结构、不新增文件。
 *
 * ## 纪律
 * - 规则块无条件注入两分支（不依赖 brief 里有没有同构声明）⇒ 接线不会空转；
 * - 若有结构化同构事实（brief.isomorphicSectionGroups / isoSectionTruth），追加**事实段**；
 * - 永不臆造配色/段 id：取不到就不写事实段，只留通用规则；
 * - 日志计数行 0 命中也打（formatLiteIsoLog），四象限可归因。
 */

/** 通用铁律：单文件组件内的跨区块复用，不要求拆文件、不改变区块数。 */
export const LITE_ISO_RULE = `【同构区块一致性铁律（跨区块复用，单文件内生效）】
- 若画面里出现 N 个**结构相同**的区块（同样的「标题行 + 多列重复条目」，仅标题 / 条目数 / 配色不同），**只允许写一份模板 + 一个 v-for 数据数组**：DOM 结构、class、CSS 规则各写一次，逐区块差异（title、items、配色）全部放进数组对象，用 :style / CSS 变量（如 --iso-bg / --iso-accent / --iso-zero）下发。
- **禁止**为每个区块各写一套 DOM / class / 样式规则；**禁止**把任一段的配色硬编码进共用样式（否则 N 段会被刷成同一套色，或 N 套样式互相打架）。
- 这是单文件组件内的复用，**不要求拆成多个 .vue 文件**，也不改变区块数量、顺序与可见内容。
- 若区块结构其实不同（列数不同、含图表/媒体、层级不同、条目形态不同），按各自结构独立实现，**不要强行合并**——误合并比样式差异更糟。
`;

/** 从结构化拆解里取同构事实（只读、容错；取不到返回 []）。 */
export function collectLiteIsoGroups(brief) {
  const b = brief && typeof brief === 'object' ? brief : {};
  const raw =
    b.isomorphicSectionGroups ||
    b.isoSectionTruth?.declaredGroups ||
    b.layout?.isomorphicSectionGroups ||
    [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g) => g && Array.isArray(g.sectionIds) && g.sectionIds.length >= 2)
    .map((g) => ({
      groupId: String(g.groupId || ''),
      sectionIds: g.sectionIds.map(String),
      representativeId: g.representativeId ? String(g.representativeId) : '',
    }));
}

/** 每段配色真值（来自 isoSectionTruth.sections；不含则不带 theme，绝不臆造）。 */
function liteThemeFacts(brief) {
  const b = brief && typeof brief === 'object' ? brief : {};
  const sections = Array.isArray(b.isoSectionTruth?.sections) ? b.isoSectionTruth.sections : [];
  const out = [];
  for (const s of sections) {
    const t = s?.theme;
    if (!t || typeof t !== 'object') continue;
    const parts = ['bg', 'accent', 'zeroColor']
      .filter((k) => typeof t[k] === 'string' && t[k])
      .map((k) => `${k}=${t[k]}`);
    if (parts.length) out.push(`  - ${String(s.id)}: ${parts.join(', ')}`);
  }
  return out;
}

/**
 * 生成注入块 + 统计（两分支共用）。
 * @returns {{block: string, declared: number, withTheme: number, injected: number}}
 */
export function buildLiteIsoPromptBlock(brief) {
  const groups = collectLiteIsoGroups(brief);
  const themes = liteThemeFacts(brief);
  let block = LITE_ISO_RULE;
  if (groups.length) {
    block += `\n【同构段候选（系统给出，仅供参考；仍需按上面的结构判据自行确认）】\n`;
    for (const g of groups) {
      block += `  - ${g.groupId || 'iso'}: ${g.sectionIds.join(', ')}${g.representativeId ? `（代表段 ${g.representativeId}）` : ''}\n`;
    }
    if (themes.length) {
      block += `  各段配色真值（Figma 填充，不是猜的）：\n${themes.join('\n')}\n`;
    }
  }
  return {
    block,
    declared: groups.length,
    withTheme: themes.length,
    injected: 1,
  };
}

/** 真机计数行（0 命中也恒打）。 */
export function formatLiteIsoLog(quadrant, stats = {}) {
  return `🧬 LITE-ISO quadrant=${quadrant} declared=${stats.declared || 0} withTheme=${stats.withTheme || 0} injected=${stats.injected || 0} branches=vue3,microcode`;
}
