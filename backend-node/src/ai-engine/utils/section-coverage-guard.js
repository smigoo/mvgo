/**
 * 🛡️ 模块组装覆盖保真（COMP-001，2026-09-02）
 *
 * 事故实证 mc-max-1788306635802-e7258c1f（流量监测）：
 *   vision 捕获 5 个 section（覆盖率 88%，trusted），subcomponentPlanner 强制拆分
 *   effectiveSections=5（isForced=true, minFiles=7），LLM 也生成了 5 个子组件文件——
 *   但 index.vue 只内联了 1 个 section（tunnel-flow-chart），其余 4 个
 *   （daily-total / bridge-flow-chart / vehicle-type-distribution / flow-prediction）
 *   零 import、零引用 → 预览里 4/5 模块整块消失，只剩一个柱状图。
 *
 * 既有机制全部漏检：
 *   - ensureSubComponentImport 只为「模板里已出现的 tag」补 import，无法凭空补「缺失的 tag」；
 *   - pruneOrphanSubComponents 把孤儿文件删掉（方向相反）；
 *   - L0-B 各 CODE 规则只查资源/硬编码/flex，没有「规划 section 数 vs 实际组装数」这一项。
 *
 * 本模块是「section 组装覆盖」的**唯一真相源**：
 *   ① code-structure-validator COMP-001 BLOCK（detectMissingSections，fail-closed 兜底）
 *   ② spec 回归测试
 *
 * 判定逻辑（三信号，任一成立即视为「已组装」，避免误伤）：
 *   信号1 组件引用：section.id 的 PascalCase 组件名在 index.vue 模板 tag 或 script import 中出现；
 *   信号2 标题内联：section.title（≥2 字）出现在「可达内容」——index.vue 全文 + 被 index.vue
 *          import 的子组件文件内容（覆盖「子组件名与 section.id 不一致但确实渲染了该模块」）；
 *   信号3 命名漂移豁免：已生成子组件文件全部被 index.vue 组装（无孤儿）且数量覆盖规划
 *          section 数 → 整体不判缺失（覆盖「LLM 重命名组件导致信号1/2 双 miss」的误报）。
 *
 * 防误伤约束（宁可漏报，不可误伤）：
 *   - 仅在 isForced=true 且 sections ≥ 2 时启用（非强制拆分/单 section 无组装问题）；
 *   - index.vue 缺失时不判定（交由 EMPTY_ARTIFACT 处理）；
 *   - 标题匹配要求 ≥2 字，避开通用单字误命中；
 *   - 检测器自身异常走 fail-open（WARN，不阻断），交由下游门禁与人工复核。
 */

import { collectLeafSections } from './section-tree.js';
import { extractSfcTemplate } from './sfc-template-extractor.js';

/**
 * kebab-case / snake_case → PascalCase
 *   'daily-total' → 'DailyTotal'；'vehicle_type_distribution' → 'VehicleTypeDistribution'
 */
function kebabToPascal(id) {
  return String(id || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/**
 * 🛡️ section id 前缀归一（2026-09-03，mc-1788395352082 误报实锤）。
 * subcomponent-planner 产出的 section.id 可能带 `section-` 前缀（section-header-stats /
 * section-summary-cards / section-main-content），而 LLM 生成的组件名不带该前缀
 * （HeaderStats / SummaryCards / MainContent）。若直接 kebabToPascal('section-header-stats')
 * → 'SectionHeaderStats'，与模板里的 <HeaderStats> 精确匹配失败 → 信号1 miss → 误判「模块缺失」。
 * 此处统一去掉 `section-` / `section_` 前缀再转 PascalCase。
 */
function normalizeSectionId(id) {
  return String(id || '').replace(/^section[-_]/, '');
}

function isListLikeSection(sec) {
  if (!sec || typeof sec !== 'object') return false;
  if (sec.collapsed === true || sec.renderHint === 'v-for') return true;
  const t = String(sec.type || '').toLowerCase();
  if ((t === 'list' || t === 'grid') && Array.isArray(sec.items) && sec.items.length > 1) {
    return true;
  }
  return Array.isArray(sec.items) && sec.items.length > 1;
}

function sectionCoveredByVFor(tpl, reachable, itemCount) {
  if (!/v-for\s*=/.test(tpl) && !/v-for\s*=/.test(reachable)) return false;
  if (!Number.isFinite(itemCount) || itemCount < 2) return true;
  const n = Math.trunc(itemCount);
  const corpus = `${tpl}\n${reachable}`;
  return (
    corpus.includes(`Array(${n})`) ||
    corpus.includes(`length: ${n}`) ||
    new RegExp(`\\b${n}\\b`).test(corpus)
  );
}

/**
 * 检测 componentPlan 中「规划了但未被 index.vue 组装」的 section。
 *
 * @param {Array<{path:string, content:string}>} files 生成产物文件数组
 * @param {object} componentPlan { effectiveSections: [{id,title,...}], isForced, ... }
 * @returns {Array<{id:string, title:string}>} 缺失（未组装）的 section 列表；无法判定/无缺失返回 []
 */
export function detectMissingSections(files, componentPlan) {
  // 🛡️ A′ Phase 5：只校验叶子 section。布局容器不占 .vue，不能当缺失模块。
  const sections = collectLeafSections(componentPlan?.effectiveSections);
  if (!componentPlan?.isForced || sections.length < 2) {
    return [];
  }

  const fileByPath = new Map();
  for (const f of files || []) {
    if (f && f.path) fileByPath.set(String(f.path), String(f.content || ''));
  }
  const indexContent = fileByPath.get('package/index.vue');
  if (!indexContent) return [];

  // 🛡️ 共享边界法（lazy </template> 会被具名插槽提前截断——0ca84358 家族缺陷）
  const tpl = extractSfcTemplate(indexContent) || '';
  const script =
    (indexContent.match(/<script[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || '';

  // index.vue 模板中实际使用的 PascalCase 组件标签（排除 Vue 内置）
  const VUE_BUILTINS = new Set([
    'RouterView', 'RouterLink', 'KeepAlive', 'Transition', 'TransitionGroup',
    'Suspense', 'Teleport', 'Component', 'Slot',
  ]);
  const usedTags = new Set();
  for (const m of tpl.matchAll(/<([A-Z][\w]*)\b/g)) {
    if (!VUE_BUILTINS.has(m[1])) usedTags.add(m[1]);
  }

  // index.vue 通过 import 引用的子组件绑定名，并累计「可达内容」
  // （index.vue + 被其 import 的子组件文件全文），供标题内联信号使用。
  const importedNames = new Set();
  let reachable = indexContent;
  for (const m of script.matchAll(
    /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]\.\/components\/([\w-]+)\.vue['"]/g,
  )) {
    importedNames.add(m[1]);
    const p = `package/components/${m[2]}.vue`;
    if (fileByPath.has(p)) reachable += '\n' + fileByPath.get(p);
  }

  // 信号3 命名漂移豁免（2026-09-02 事故 mc-max-1788327432319-a6198738 环境监测）：
  // 规划 section.id 与 LLM 实际组件命名不一致时（如 tab-tools→TabTools vs 实际
  // TabsTools、concentration-trend-chart→ConcentrationTrendChart vs 实际
  // ConcentrationChart），信号1 精确名匹配与信号2 中文标题内联双双 miss → 误报
  // 「模块组装缺失」→ 触发不必要的 L0-B 全量重试，第二轮重生成反而把已对齐 UI 的
  // 产物改差（背景图丢失、icon 结构被改）。
  // 真实危害不变量是「生成了子组件文件却零引用（孤儿文件）→ 预览缺模块」（原始事故
  // mc-max-1788306635802：5 个文件仅 1 个被引用）。此处反向使用：若已生成的子组件
  // 文件【全部】被 index.vue 组装（无孤儿），且文件数覆盖规划 section 数，则所有
  // 模块都已落地（只是改了名），不判缺失。
  const compFileNames = [];
  for (const p of fileByPath.keys()) {
    const m = p.match(/^package\/components\/([\w-]+)\.vue$/);
    if (m) compFileNames.push(kebabToPascal(m[1]));
  }
  if (compFileNames.length >= sections.length && compFileNames.length > 0) {
    const allAssembled = compFileNames.every(
      (n) => usedTags.has(n) || importedNames.has(n),
    );
    if (allAssembled) return [];
  }

  const missing = [];
  for (const sec of sections) {
    const id = String(sec?.id || '');
    const title = String(sec?.title || '').trim();
    const pascal = kebabToPascal(normalizeSectionId(id));
    const viaComponent =
      pascal && (usedTags.has(pascal) || importedNames.has(pascal));
    const viaTitle = title.length >= 2 && reachable.includes(title);
    const viaListTemplate =
      isListLikeSection(sec) &&
      (viaComponent ||
        viaTitle ||
        sectionCoveredByVFor(
          tpl,
          reachable,
          Number(sec.itemCount) || (Array.isArray(sec.items) ? sec.items.length : 0),
        ));
    if (!viaComponent && !viaTitle && !viaListTemplate) {
      missing.push({ id, title: title || id });
    }
  }
  return missing;
}

/**
 * 把 files 对象（{ path: content }）转成 detectMissingSections 需要的数组形态。
 */
function filesObjectToArray(files) {
  if (!files || typeof files !== 'object') return [];
  return Object.entries(files)
    .filter(([, c]) => typeof c === 'string')
    .map(([path, content]) => ({ path, content }));
}

/**
 * 🛡️ 自愈：强制组装缺失的 section 子组件（COMP-001 的确定性前置，2026-09-02）。
 *
 * 事故 mc-max-1788306635802（流量监测）：LLM 生成了 5 个子组件文件，但 index.vue
 * 只内联 1 个 section，其余 4 个零引用 → 预览 4/5 模块整块消失。门禁+重试 3 轮不收敛
 * （LLM 修不动组装问题）。此处确定性注入：对每个缺失且「存在对应子组件文件」的 section，
 * 补 `import X from './components/X.vue'` + 在 index.vue 顶层 template 末尾追加 `<X />`
 * （Vue3 多根 fragment 合法），保证所有规划模块至少被渲染，布局由下游 LLM 重试精修。
 *
 * 幂等：已 import 或已引用的组件跳过；找不到对应组件文件（命名不一致）时不动，交由 COMP-001 兜底。
 *
 * @param {Object<string,string>} files 路径 → 内容
 * @param {object} componentPlan { effectiveSections, isForced }
 * @param {object} [logger]
 * @returns {Object<string,string>} 处理后的 files（未变化时返回原对象引用）
 */
export function ensureSectionAssembly(files, componentPlan, logger) {
  const missing = detectMissingSections(filesObjectToArray(files), componentPlan);
  if (missing.length === 0) return files;

  const indexPath = 'package/index.vue';
  const indexContent = files[indexPath];
  if (!indexContent || typeof indexContent !== 'string') return files;

  // 1. 找出缺失且存在对应组件文件的 section（PascalCase(section.id).vue）
  const injectable = [];
  for (const m of missing) {
    const pascal = kebabToPascal(normalizeSectionId(m.id));
    const fp = `package/components/${pascal}.vue`;
    if (typeof files[fp] === 'string') injectable.push({ pascal, fp, title: m.title });
  }
  if (injectable.length === 0) return files;

  // 2. 幂等：已 import / 已引用的跳过
  const toInject = injectable.filter(({ pascal }) => {
    return (
      !new RegExp(`import\\s+${pascal}\\s+from`).test(indexContent) &&
      !new RegExp(`<${pascal}\\b`).test(indexContent)
    );
  });
  if (toInject.length === 0) return files;

  // 3. 注入 import（<script ...> 开标签之后）
  let content = indexContent;
  const importLines = toInject
    .map(({ pascal }) => `import ${pascal} from './components/${pascal}.vue'`)
    .join('\n');
  if (!/import\s+\w+\s+from\s*['"]\.\/components\//.test(content)) {
    // 已有其他子组件 import 则在其后追加，否则插到 <script> 后
    content = content.replace(
      /<script([^>]*)>(\s*)/i,
      (m, attrs, ws) => `<script${attrs}>${ws}${importLines}\n`,
    );
  } else {
    content = content.replace(
      /(import\s+[A-Za-z_$][\w$]*\s+from\s*['"]\.\/components\/[^'"]+['"]\n)/,
      `$1${importLines}\n`,
    );
  }

  // 4. 注入 <X /> 到顶层 template 末尾（最后一个 </template> 之前，多根 fragment）
  const tags = toInject.map(({ pascal }) => `<${pascal} />`).join('\n    ');
  const lastClose = content.lastIndexOf('</template>');
  if (lastClose > 0) {
    content = content.slice(0, lastClose) + '    ' + tags + '\n' + content.slice(lastClose);
  } else {
    // 无 template 闭合（异常），放弃注入交由门禁
    return files;
  }

  if (logger && typeof logger.warn === 'function') {
    logger.warn('🛡️ 确定性组装：补齐缺失的 section 子组件', {
      injected: toInject.map((i) => i.title),
    });
  }

  const out = { ...files };
  out[indexPath] = content;
  return out;
}
