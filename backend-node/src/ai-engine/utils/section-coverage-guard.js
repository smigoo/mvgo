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

import { collectLeafSections, assignSectionComponentNames, dedupeDuplicateSections } from './section-tree.js';
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

/**
 * 🛡️ 命名单一事实源（2026-09-13 治本，事故 mc-1789308308127-356073d1）。
 *
 * 缺陷：本模块此前**自造**组件名 —— `kebabToPascal(normalizeSectionId(section.id))`，
 * 而产物命名早已改由层① `buildDeterministicIndexTemplate` → `assignSectionComponentNames`
 * 决定（按 section.type 稳定映射）。两套命名口径并存 → 门禁按「id 猜名」永远匹配不上
 * 真实产物名 → **不可达成的 BLOCK**：
 *   - id `@antd/tab`（type=tabs，真实产物 `TabsSection.vue`）→ 猜出 `@antd/tab`，恒不命中；
 *   - id `主内容区`（type=body，真实产物 `MainSection.vue`）→ 猜出 `主内容区`，恒不命中；
 *   - id `switch`（type=switch，真实产物 `SwitchSection.vue`）→ 猜出 `Switch`，恒不命中。
 * 实锤：componentPlan 4 个 section、index.vue **已组装全部 3 个**子组件，门禁仍报
 * 「未组装 3 个（switch、@antd/tab、主内容区）」→ COMP-001 BLOCK ×3 轮不收敛（软失败，
 * 带瑕疵发布，主内容区整块消失）。
 *
 * 治本：名字候选**取并集** —— ① 确定性命名（与产物同源）；② 旧 kebab 形态（兼容
 * 事故 mc-max-1788306635802 时代 LLM 自由命名的产物）。任一命中即视为已落地/已组装，
 * 只会**减少误报**，不会新增阻断。
 *
 * @param {object} componentPlan
 * @returns {Map<string, string[]>} section.id → 组件名候选（按优先级，去重）
 */
function sectionNameCandidates(componentPlan) {
  const plan =
    componentPlan && Array.isArray(componentPlan.effectiveSections)
      ? componentPlan
      : componentPlan?.generationInput?.componentPlan;
  const tree = dedupeDuplicateSections(plan?.effectiveSections);
  let deterministic = new Map();
  try {
    deterministic = assignSectionComponentNames(tree) || new Map();
  } catch (_) {
    // 确定性命名异常 → 退化为仅 kebab 候选（fail-open，不因命名失败误报）
    deterministic = new Map();
  }
  const out = new Map();
  for (const sec of collectLeafSections(tree)) {
    const id = String(sec?.id || '');
    if (!id || out.has(id)) continue;
    const cands = [];
    const det = deterministic.get(id);
    if (det) cands.push(String(det));
    const kebab = kebabToPascal(normalizeSectionId(id));
    if (kebab && !cands.includes(kebab)) cands.push(kebab);
    out.set(id, cands);
  }
  return out;
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
 * 组装覆盖分析（`detectMissingSections` / `detectUnmaterializedSections` 的共同内核）。
 *
 * @param {Array<{path:string, content:string}>} files
 * @param {object} componentPlan
 * @returns {{ missing: Array<{id:string,title:string,expected:string,hasFile:boolean}> }}
 *   `missing` = 规划了但 index.vue 未组装的 section，逐项带 `hasFile`：
 *   - `hasFile=true`  → **可修**（补 import + 标签即解决）→ 消费方 BLOCK / 确定性注入；
 *   - `hasFile=false` → **不可修**（组件文件不存在，LLM 无法「组装」它；重试只会重放
 *     同一份源码）→ 消费方降级为 WARN，指向降级/物化链路，不烧重试预算。
 */
function analyzeSectionCoverage(files, componentPlan) {
  const empty = { missing: [] };
  // 🛡️ A′ Phase 5：只校验叶子 section。布局容器不占 .vue，不能当缺失模块。
  const plan =
    componentPlan && Array.isArray(componentPlan.effectiveSections)
      ? componentPlan
      : componentPlan?.generationInput?.componentPlan;
  const sections = collectLeafSections(plan?.effectiveSections);
  if (!componentPlan?.isForced || sections.length < 2) {
    return empty;
  }

  const fileByPath = new Map();
  for (const f of files || []) {
    if (f && f.path) fileByPath.set(String(f.path), String(f.content || ''));
  }
  const indexContent = fileByPath.get('package/index.vue');
  if (!indexContent) return empty;

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
  const assembled = (name) => usedTags.has(name) || importedNames.has(name);

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
    if (compFileNames.every((n) => assembled(n))) return empty;
  }

  const candidates = sectionNameCandidates(componentPlan);
  const missing = [];
  for (const sec of sections) {
    const id = String(sec?.id || '');
    const title = String(sec?.title || '').trim();
    const cands = candidates.get(id) || [];
    const expected = cands[0] || kebabToPascal(normalizeSectionId(id));
    const viaComponent = cands.some((n) => n && assembled(n));
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
    if (viaComponent || viaTitle || viaListTemplate) continue;
    const hasFile = cands.some((n) => n && fileByPath.has(`package/components/${n}.vue`));
    missing.push({ id, title: title || id, expected, hasFile });
  }
  return { missing };
}

/**
 * 检测 componentPlan 中「规划了但未被 index.vue 组装」的 section。
 *
 * @param {Array<{path:string, content:string}>} files 生成产物文件数组
 * @param {object} componentPlan { effectiveSections: [{id,title,...}], isForced, ... }
 * @returns {Array<{id:string, title:string, expected:string, hasFile:boolean}>}
 *   缺失（未组装）的 section 列表；无法判定/无缺失返回 []。
 *   `hasFile` 区分两种消费语义：true → 可 BLOCK / 可确定性注入；false → 只能 WARN。
 */
export function detectMissingSections(files, componentPlan) {
  return analyzeSectionCoverage(files, componentPlan).missing;
}

/**
 * 检测「连子组件文件都不存在」的未组装 section（物化失败 / 被 P1-4 隔离降级）。
 *
 * **不可修**形态：LLM 无法「组装」一个不存在的组件，重试只会重放同一份源码
 * （R12 已完成分块从缓存恢复）→ 若对此 BLOCK 即「规则要求了不可达成的条件」，
 * 重试预算耗尽后软失败发布。故消费方只发 WARN，并指向 degradedFiles / 重生成链路。
 *
 * @param {Array<{path:string, content:string}>} files
 * @param {object} componentPlan
 * @returns {Array<{id:string, title:string, expected:string}>}
 */
export function detectUnmaterializedSections(files, componentPlan) {
  return analyzeSectionCoverage(files, componentPlan)
    .missing.filter((m) => !m.hasFile)
    .map(({ id, title, expected }) => ({ id, title, expected }));
}

/**
 * 🛡️ COMP-001-DANGLING（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：
 * **递归悬空引用检测** —— 治 analyzeSectionCoverage「命名漂移豁免」的盲区。
 *
 * 实锤链路：2290591b 规划 8 个 section，LLM 生成了 8 个 .vue；index.vue 确实组装了全部
 * 8 个（无孤儿）→ 命中信号3 豁免分支 `return empty`，判定「模块全部落地」。**但**
 * `ContentSection.vue` 内部又引用了 7 个**从未生成**的子组件
 * （SubHeaderSection / StatGroupSection / VehicleDistSection / ForecastHeaderSection /
 * HourlyChartJinjiangSection / HourlyChartBridgeSection / ForecastChartSection）——
 * 运行时 `找不到文件: package/components/SubHeaderSection.vue`，内容大片空白。
 *
 * 原检测只看「index.vue 一层组装」，对「叶子内部再套语法引用」完全不可见。本函数独立
 * 补这一层：对**所有** .vue 文件做引用完整性扫描，凡 `import ... from './X.vue'` /
 * `defineAsyncComponent(() => import('./X.vue'))` / `require('./X.vue')` 指向的
 * 同目录相对路径 .vue 文件在产物中不存在 → 收集为悬空引用。
 *
 * 消费语义：**WARN（非阻断）**。理由同 COMP-001-UNMATERIALIZED —— 文件不存在时 LLM
 * 无法通过「组装」修复，重试只会重放同一份源码 → BLOCK 必然重试耗尽。故只发 WARN，
 * 指向 degradedFiles / 子组件重生成链路，保留可观测性而不烧重试预算。
 *
 * 纯函数、无 import.meta、fail-open（异常返回 []）。
 *
 * @param {Array<{path:string, content:string}>|Object<string,string>} files
 * @returns {Array<{file:string, ref:string, expected:string}>}
 *   `file` = 发起引用的 .vue（相对产物根）；`ref` = 引用的绑定名/原始 specifier；
 *   `expected` = 期望存在的相对路径（如 package/components/SubHeaderSection.vue）
 */
/**
 * 🛡️ 悬空引用解析的**单一事实源**（detect 与 strip 共用）。
 *
 * 把一条 specifier（如 `./X.vue` / `../Y/X.vue` / `components/X.vue`）解析成文件集内的绝对路径；
 * 解析失败（非 .vue / `../` 越界）返回 null。调用方据此与 present 集合比对：命中 → 存在；
 * null 或未命中 → 悬空。
 *
 * ⚠️ **关键**：引用识别正则的前缀 `(?:\.\/)?` 会**吃掉** `./`，所以捕获组常常是裸名
 * （`'./X.vue'` → `X.vue`），无法靠捕获组区分「裸名」与「同目录相对」。因此本函数**默认按
 * fromFile 所在目录解析**（产物内部 import 一律是「相对本文件」语义），并支持 `..` 逐级出栈；
 * 若按目录解析未命中，再退化为「裸路径直连 present」——覆盖 `package/` 根写成
 * `components/X.vue` 的形态。这样同一套判定同时约束 detect（报告）与 strip（修复），
 * 杜绝「检测用归一化、剥离用 startsWith 却永远 false」的逻辑错位（此前两次事故的根因）。
 *
 * @param {string} fromFile 发起引用的文件（绝对路径，如 package/components/ContentSection.vue）
 * @param {string} rel specifier（去引号后的原始串，可能含 ./ 或 ../）
 * @param {Set<string>} present 文件集路径集合（已存在的文件绝对路径）
 * @returns {string|null} 解析到的绝对路径；不存在/越界/非法 → null
 */
export function resolveSpecifierToPath(fromFile, rel, present) {
  const clean = String(rel || '')
    .replace(/['"]/g, '')
    .trim();
  if (!/\.vue$/i.test(clean)) return null;

  // ① 按 fromFile 目录解析（相对语义，支持 ../）
  const stack = fromFile.split('/').slice(0, -1);
  let escaped = false;
  for (const part of clean.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) {
        escaped = true;
        break;
      }
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  if (!escaped) {
    const resolved = stack.join('/');
    if (present.has(resolved)) return resolved;
  }
  // ② 回退：裸路径直连（如 'components/X.vue' 直接命中 present）
  if (present.has(clean)) return clean;
  // ③ 都未命中：返回按目录解析的结果（若越界则 null），供调用方判为悬空
  return escaped ? null : stack.join('/');
}

export function detectDanglingComponentRefs(files) {
  try {
    const list = Array.isArray(files) ? files : filesObjectToArray(files);
    const present = new Set(
      list.filter((f) => f && f.path).map((f) => String(f.path)),
    );
    // 只扫 .vue 产物（含 components/ 下所有层级）
    const vues = list.filter(
      (f) => f && typeof f.content === 'string' && /\.vue$/i.test(String(f.path)),
    );
    const out = [];
    const seen = new Set();
    for (const f of vues) {
      const filePath = String(f.path);
      const content = String(f.content);
      // 引用形态：静态 import / 动态 import() / require()，均要求 specifier 以 .vue 结尾
      const re =
        /(?:import\s+(?:[\w$*{},\s]+\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)['"](?:\.\/)?([\w./-]+\.vue)['"]/g;
      for (const m of content.matchAll(re)) {
        const rel = m[1];
        const resolved = resolveSpecifierToPath(filePath, rel, present);
        if (resolved && present.has(resolved)) continue;
        // 裸 specifier 且未命中时，resolved 为 null，仍记为悬空
        const key = `${filePath}::${rel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          file: filePath,
          ref: rel.replace(/\.vue$/, ''),
          expected: resolved || rel,
        });
      }
    }
    return out;
  } catch (_) {
    // fail-open：检测器异常不阻断生成
    return [];
  }
}

/**
 * 🛡️ 推 A 全 .vue 层（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：
 * **悬空子组件引用剥离（构造保证）** —— detectDanglingComponentRefs 的「修复」对偶。
 *
 * 背景：detectDanglingComponentRefs 只在门禁层**报告**悬空引用（WARN，不拦不修），
 * 而 stripUnplannedSubComponentImports（code-generator）只守 **index.vue 一层**。
 * 2290591b 的真实崩溃点在**子组件层**：`ContentSection.vue` 用 defineAsyncComponent
 * 导入了 7 个从未生成的兄弟 section（SubHeaderSection 等）→ 浏览器加载即 404
 * （RUNTIME-007）+ async 组件加载失败抛错 → 整页 render-error（RUNTIME-004）。
 *
 * 治本：写盘前对**所有** .vue 文件做一次引用完整性收口 —— 凡指向「产物中不存在的
 * 同目录相对 .vue 文件」的 import（静态 / defineAsyncComponent 内联 / require）一律剥离，
 * 并同步移除模板里对应的 `<X />` / `<X></X>` 自闭合标签，避免「标签在、绑定没了」
 * 触发语义门禁「模板引用未声明变量」。剥离后内容自洽：不残留悬空 import，也无孤儿标签。
 *
 * 与 detectDanglingComponentRefs 共用同一套引用识别正则（单一事实源），保证「报告的」
 * 与「能修的」是同一集合。仅处理 `.vue` 产物；只删「指向缺失文件的引用」，对存在的引用
 * 零触碰（fail-open，异常返回原对象引用）。
 *
 * ⚠️ **单一事实源契约**：本函数是「悬空子组件引用」剥离的唯一权威实现，code-healer 的
 * `pruneDanglingSubComponentImports`（2026-08-30 静态 import 专用）已**委派**到此处，
 * 旧实现只认静态 `import X from`，漏掉 `defineAsyncComponent(() => import(...))` 动态形态
 * （即 mc-max-1789376057659-2290591b 的真实崩溃点）。任何「剥悬空 import」诉求都走本函数，
 * 禁止再写第二套正则，否则会重新出现「自检通过、动态形态漏剥」的盲区。
 *
 * 路径解析：支持同目录 `./X.vue`、裸 `components/X.vue`、以及跨目录 `../X.vue`（`..` 逐级出栈），
 * 与归一化后的 `present` 集合比对；解析失败/越界一律视为悬空（保守剥离）。
 *
 * @param {Object<string,string>} files 路径 → 内容（如 { 'package/index.vue': '...' }）
 * @param {Array<{path:string, content:string}>} [fileList] 可选显式文件清单（含内容），
 *   用于「存在性」判定；不传则由 files 自身推导。
 * @param {boolean} [mutate=true] 是否原地修改 files（write choke 用 true；code-healer 委派时
 *   传 false 以保持「非变异、返回新对象」的旧契约）。
 * @returns {{ files: Object<string,string>, stripped: Array<{file:string, refs:string[]}> }}
 *   `stripped` = 每个被改动的文件及其剥离的组件名清单（供日志/观测）；无改动时原样返回。
 */
export function stripDanglingComponentRefs(files, fileList, mutate = true) {
  const result = { files, stripped: [] };
  try {
    if (!files || typeof files !== 'object') return result;
    const list = Array.isArray(fileList)
      ? fileList.filter((f) => f && typeof f.path === 'string')
      : filesObjectToArray(files);
    const present = new Set(list.map((f) => String(f.path)));

    // 非变异模式：在浅拷贝上操作，保持原对象引用不被触碰。
    const target = mutate ? files : { ...files };
    for (const [filePath, content] of Object.entries(files)) {
      if (typeof content !== 'string' || !/\.vue$/i.test(filePath)) continue;
      // 与 detectDanglingComponentRefs 完全一致的引用识别正则（同集合）。
      const re =
        /(?:import\s+(?:[\w$*{},\s]+\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)['"](?:\.\/)?([\w./-]+\.vue)['"]/g;
      const danglingNames = new Set();
      const specs = new Set();
      for (const m of content.matchAll(re)) {
        const rel = m[1];
        // 与 detectDanglingComponentRefs 共用 resolveSpecifierToPath（单一事实源）：
        // 解析到在集路径 → 存在，跳过；解析失败（非 .vue / 越界 ../）→ 悬空；
        // 裸 specifier 未命中文件集 → 悬空。
        const resolved = resolveSpecifierToPath(filePath, rel, present);
        if (resolved && present.has(resolved)) continue;
        danglingNames.add(rel.replace(/\.vue$/, '').split('/').pop());
        specs.add(rel);
      }
      if (danglingNames.size === 0) continue;

      let next = content;
      for (const spec of specs) {
        const name = spec.replace(/\.vue$/, '').split('/').pop();
        const specEsc = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const specAlt = `(?:\\./)?${specEsc}`;
        // ① 整行删除 `const X = defineAsyncComponent(() => import('./X.vue'))`
        //    （含可选 await / 泛型包裹），避免残留 `= null` 死声明喂给 CODE-021 / Vue 警告。
        next = next.replace(
          new RegExp(
            `^[ \\t]*(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*defineAsyncComponent\\(\\s*(?:async\\s*)?\\(?\\s*\\)?\\s*=>\\s*(?:await\\s+)?import\\(\\s*['"]${specAlt}['"]\\s*\\)\\s*\\)\\s*;?[ \\t]*\\n?`,
            'gm',
          ),
          '',
        );
        // ② 整行删除 `const X = () => import('./X.vue')`（无 defineAsyncComponent 包装）
        next = next.replace(
          new RegExp(
            `^[ \\t]*(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(?:async\\s*)?\\(?\\s*\\)?\\s*=>\\s*(?:await\\s+)?import\\(\\s*['"]${specAlt}['"]\\s*\\)\\s*;?[ \\t]*\\n?`,
            'gm',
          ),
          '',
        );
        // ③ 删静态 import 行：import X from './X.vue'（可带 ./ 前缀或裸名）
        next = next.replace(
          new RegExp(
            `^[ \\t]*import\\s+[A-Za-z_$][\\w$]*\\s+from\\s*['"]${specAlt}['"]\\s*;?[ \\t]*\\n?`,
            'gm',
          ),
          '',
        );
        // ④ 兜底：残余裸 import('./X.vue') / require('./X.vue') → null
        //    （规范产物走 ①②③ 整行删除；此处仅兜异常形态，保证不残留悬空 specifier）
        next = next.replace(
          new RegExp(`(?:import|require)\\(\\s*['"]${specAlt}['"]\\s*\\)`, 'g'),
          `null /* 悬空子组件 ${name}（文件未生成） */`,
        );
        // ⑤ 模板自闭合标签 <X /> 或 <X/>
        next = next.replace(
          new RegExp(`<${name}\\b[^>]*?/>`, 'g'),
          '',
        );
        // ⑥ 模板成对标签 <X ...>...</X>
        next = next.replace(
          new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'g'),
          '',
        );
      }
      if (next !== content) {
        target[filePath] = next;
        result.stripped.push({ file: filePath, refs: [...danglingNames] });
      }
    }
    result.files = target;
    return result;
  } catch (_) {
    // fail-open：修复器异常不阻断生成（保留原 files 引用）
    return { files, stripped: [] };
  }
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

  // 1. 找出缺失且存在对应组件文件的 section（候选名取并集，命中哪个用哪个）
  const candidates = sectionNameCandidates(componentPlan);
  const injectable = [];
  for (const m of missing) {
    const cands = candidates.get(String(m.id)) || [];
    const hit = cands.find((n) => n && typeof files[`package/components/${n}.vue`] === 'string');
    if (hit) injectable.push({ pascal: hit, fp: `package/components/${hit}.vue`, title: m.title });
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
