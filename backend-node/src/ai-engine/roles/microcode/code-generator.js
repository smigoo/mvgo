/**
 * 代码生成编排模块（Code Generator）
 *
 * 职责：index.vue 分块拼装、script 分段合并、declare 模板先行合并、
 *       单个分块 LLM 调用（含截断/语义门禁/降级重试）等生成编排逻辑。
 */

import { generateDeclareJson as templateDeclareJson } from '../../templates/component-template.js';
import {
  dedupeScriptImports,
  dedupeScriptDeclarations,
  dedupeMcComponentBuilder,
  dedupeLifecycleHooks,
  validateVueScriptSemantics,
  findTdzReferences,
  autoFixTdzReferences,
  extractComponentTagNames,
  VUE_BUILTIN_COMPONENTS,
} from '../../utils/sfc-semantics.js';
import { ensureSubComponentImport, pruneDeadSubComponentImports, postProcessIndexVue } from './resource-mounter.js';
import { buildChunkMiddle, buildTemplateChunkMiddle, buildScriptChunkMiddle, buildScriptChunkMiddlePart, buildRetryPrompt, resolvePlanSections, templateHasNoRefMount } from './prompt-builder.js';
import { parseCodeOutput, detectFileTruncation } from './code-parser.js';
import { invokeWithTimeout } from '../../utils/llm-timeout.js';
import { getMaxTokens, coerceLLMText, resolveModelCapability } from '../../utils/model-config.js';
import { enforceInputBudget } from '../../utils/input-budget.js';
import { getIndexVueChunkBudgets } from './chunk-budget.js';
import { getProviderPool } from '../../utils/provider-pool.js';
import { safeLogger } from '../../logger/safe-logger.js';
// 🛡️ G04：图表父壳挂载判据的 plan 事实源（planner 全保真原形优先）
import { resolvePlanSourceFromInput } from '../../utils/resolve-plan-source.js';
import {
  extractResourceVarNames,
  resolveResourceDomMapping,
} from '../../utils/resource-import-guard.js';
import { collectLeafSections, assignSectionComponentNames, isLayoutContainerSection, indexFigmaNodes, figmaSectionBox, isHorizontalCardGroup } from '../../utils/section-tree.js';
import { resolveSectionSize, resolveSectionBox, resolveIntrinsicLayout, buildIntrinsicContainerStyle, buildIntrinsicChildStyle } from '../../utils/section-intrinsic-layout.js';
import { planRowBands, planColumnGroups, crossAxisCenterStyle } from '../../utils/row-band-cluster.js';
import { resolveAbsorbedBgLayers, buildAbsorbedBgLayerStyle, claimCollapsedLeafContainedIds, expandCandidateIdsWithDirectChildren } from '../../utils/container-absorbed-bg.js';
import { detectContentRootClass } from '../../utils/root-container-normalizer.js';
// 🛡️ P1-B（2026-10-26）：装配层需要知道「哪些成员被刀 53 两阶段决策抑制」，
//   才能把它们从 flex 归一化分母里剔除。判据单一来源 = 接管器本身（不在本文件重判）。
import { collectFoldedGridTakeover } from '../../utils/folded-grid-section-takeover.js';
import { sanitizeComponentId, tailHexOf, normalizeUserComponentId } from '../../utils/component-naming.js';
import { buildSectionStructureContract } from '../../utils/section-structure-contract.js';

export function assembleIndexVue(templateContent, scriptContent, input, options = {}) {
    let tpl = (templateContent || '').trim();
    let scr = (scriptContent || '').trim();

    // 容错：去除 LLM 可能残留的文件分隔符前缀
    tpl = tpl.replace(/^\/\/\s*===\s*package\/index\.vue\s*===\s*\n?/i, '');
    scr = scr.replace(/^\/\/\s*===\s*package\/index\.vue\s*===\s*\n?/i, '');

    // 🛡️ 剥离 template 里混入的 <script>/<style> 块（防御 LLM 分块输出误抄入，
    // template chunk 可能吐出完整 <script setup>...<\/script> → 拼装后出现两个 script 块 → vue/compiler-sfc 报错）
    tpl = stripNonTemplateBlocks(tpl);

    // 🛡️ 剥离 script 里混入的 <template>/<style> 块（防御 LLM 分块输出误抄入，
    // 非 scriptSplit 的整段 script 也可能混入，须在「补闭合标签」判断前剥离，
    // 否则混入的 <template> 会干扰 <script> 闭合检查）
    scr = stripNonScriptBlocks(scr);

    // 容错：若 LLM 漏了闭合标签则补上（拼装后 _detectFileTruncation 才不会误报）
    if (tpl.includes('<template>') && !tpl.includes('</template>')) {
      tpl += '\n</template>';
    }
    if (scr.includes('<script') && !scr.includes('</script>')) {
      scr += '\n</script>';
    }

    // 🛡️ 顶层声明去重（整段 <script> 被重复注入的最终修复点）：
    // scriptSplit 两段都吐完整脚本 → _mergeScriptParts 拼接后整段重复；
    // 此处对脚本内容做声明级去重（保留更完整的后段），保证拼装产物可直接编译。
    // 无重复时 dedupeScriptDeclarations 原样返回，不影响正常组件格式。
    if (scr) {
      const builderImportStats = { mcBuilderModuleImport: 0 };
      const sm = scr.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (sm) {
        scr = scr.replace(
          sm[1],
          '\n' + dedupeMcComponentBuilder(dedupeScriptDeclarations(sm[1]), {
            normalizeModuleImports: true,
            stats: builderImportStats,
          }).trim() + '\n',
        );
      } else {
        scr = dedupeMcComponentBuilder(dedupeScriptDeclarations(scr), {
          normalizeModuleImports: true,
          stats: builderImportStats,
        });
      }
      if (builderImportStats.mcBuilderModuleImport > 0) {
        options.logger?.warn?.(
          `🛡️ 微码宿主 builder 裸 import 归一 mcBuilderModuleImport healed=${builderImportStats.mcBuilderModuleImport}`,
          { file: 'package/index.vue', healed: builderImportStats.mcBuilderModuleImport },
        );
      }
    }

    const parts = [];
    if (tpl) parts.push(tpl);
    if (scr) parts.push(scr);
    // <style> 块为固定模板（样式由后续样式批次生成，此处仅引入入口）
    parts.push(`<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`);

    let assembled = parts.join('\n\n') + '\n';
    // 🛡️ 拼装后兜底：自动补齐 template 引用但 script 漏 import 的子组件（复杂组件常见，防语义门禁 fail-closed）
    assembled = ensureSubComponentImport(assembled);
    // 🛡️ 层①（2026-09-11）：删除死子组件 import（模板未引用），与 ensureSubComponentImport 对称，
    // 杜绝「LLM 脚本 import 错名/多 import」→ CODE-021 死代码门禁 BLOCK。
    assembled = pruneDeadSubComponentImports(assembled, options);
    // 🛡️ 推 A（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：索引层「引用谁」的确定性约束。
    // 规划 section 经分配命名派生的 componentFiles 是 index 层子组件文件集的唯一事实源；
    // LLM 在 script 段臆造的、指向「规划外子组件」的 import（如未生成的 SubHeaderSection.vue）
    // 一律剥离 —— 从构造上消灭索引层悬空引用（与 detectDanglingComponentRefs 事后 WARN 形成双重保险）。
    const allowed = (input?._indexTemplateFacts?.componentFiles || []).filter(Boolean);
    if (allowed.length > 0) {
      assembled = stripUnplannedSubComponentImports(assembled, allowed, options);
    }

    // 🛡️ Phase 2 后处理兜底（TDD: T02/T03/T04）
    assembled = postProcessIndexVue(assembled, input, options);

    // 🛡️ E3-1（2026-09-16 · c-max-1789499487971-12bc3750 实锤）：chartRef 容器位置收口。
    // LLM 自由写 echarts 容器时，常把 <div ref="chartRef"> 写到 </base-panel> 之后（兄弟节点）→
    // 图表脱离 slot-con 的 flex 布局 → 环形图跑最右边/错位。确定性收口：chartRef 容器必须回到
    // base-panel 内（在 </base-panel> 之前），绝不留在外壳外。
    assembled = containChartRefInsidePanel(assembled, options);

    // 🛡️ D3（2026-09-16 · mc-1789501342336-ad390852 实锤）：图例文本确定性去重。
    // LLM 写 echarts option 时，legend.data 和 series[].name 常出现重复文本（同一分类名出现多次）
    // → ECharts 渲染异常（图例重叠/系列错乱）。确定性收口：legend 数组 + series[].name 去重，
    // 保持首次出现顺序，绝不新增/删除分类。
    assembled = dedupeLegendText(assembled, options);

    return assembled;
  }

  /**
   * 🛡️ E3-1（2026-09-16 · c-max-1789499487971-12bc3750 实锤）：chartRef 容器位置收口。
   *
   * 背景：LLM 自由写 echarts 容器时，常把 `<div ref="chartRef">` 写到 `</base-panel>` 之后（兄弟节点），
   * 图表因此脱离 slot-con 的 flex 布局 → 环形图跑到最右边 / 位置错乱。确定性收口：chartRef 容器
   * 必须回到 base-panel 内（slot-con 闭合 `</div>` 之前），绝不留在宿主外壳外。
   *
   * 纯函数、无 import.meta、fail-open（异常/无 chartRef/无 base-panel 原样返回）。
   * 只在「chartRef 确实在 base-panel 外」时移动，base-panel 内的一律不动（零误伤）。
   */
  export function containChartRefInsidePanel(content, options = {}) {
    const logger = safeLogger(options.logger);
    if (!content || typeof content !== 'string') return content;

    // chartRef 容器（含 style 等属性，单行或多行）
    const chartRefRe = /<div\b[^>]*\bref=["']chartRef["'][^>]*>[\s\S]*?<\/div>/i;
    const m = content.match(chartRefRe);
    if (!m) return content;
    const chartRefHtml = m[0];
    const chartRefIdx = m.index;

    const panelClose = content.indexOf('</base-panel>');
    if (panelClose < 0) return content;

    // chartRef 已在 base-panel 内 → 不动（零误伤）
    if (chartRefIdx < panelClose) return content;

    // chartRef 在 base-panel 外 → 先移除，再插回 base-panel 内（slot-con 闭合处）
    let next = content.slice(0, chartRefIdx) + content.slice(chartRefIdx + chartRefHtml.length);
    next = next.slice(0, panelClose) + '\n  ' + chartRefHtml + '\n' + next.slice(panelClose);
    if (logger) {
      logger.warn('🛡️ E3-1 chartRef 位置收口：chartRef 容器已移回 base-panel 内', {});
    }
    return next;
  }

  /**
   * 🛡️ D3（2026-09-16 · mc-1789501342336-ad390852 实锤）：图例文本确定性去重。
   *
   * 背景：LLM 写 echarts option 时，`legend.data` 和 `series[].name` 常出现重复文本
   *（同一分类名出现多次）→ ECharts 渲染异常（图例重叠/系列错乱）。
   *
   * 确定性收口：
   * 1. `legend: { data: [...] }` → 去重，保持首次出现顺序
   * 2. `series: [{ name: 'X', ... }, { name: 'X', ... }]` → 同名系列合并（保留第一个，累加 data）
   * 3. `chartData.value.legend = [...]` / `chartData.value.series = [...]` → 同样去重
   *
   * 纯函数、无 import.meta、fail-open（异常/无匹配原样返回）。
   * 只处理 script 段内的 echarts option 和 chartData 定义，不动模板/样式。
   */
  export function dedupeLegendText(content, options = {}) {
    const logger = safeLogger(options.logger);
    if (!content || typeof content !== 'string') return content;

    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) return content;
    const scriptBody = scriptMatch[1];

    let changed = false;

    // ① legend.data 数组去重：legend: { data: ['A','B','A','C'] } → ['A','B','C']
    // 匹配 legend: { data: [...] } 或 legend: { ..., data: [...] }
    const legendDataRe = /data\s*:\s*\[([^\]]*?)\]/g;
    let newScript = scriptBody.replace(legendDataRe, (match, inner) => {
      // 只处理看起来像字符串数组的（包含引号）
      if (!/['"]/.test(inner)) return match;
      const items = inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
      const seen = new Set();
      const deduped = [];
      for (const item of items) {
        // 提取字符串值用于去重比较
        const val = item.replace(/^['"]|['"]$/g, '');
        if (!seen.has(val)) {
          seen.add(val);
          deduped.push(item);
        } else {
          changed = true;
        }
      }
      if (deduped.length === items.length) return match;
      return `data: [${deduped.join(', ')}]`;
    });

    // ② series 数组去重：同名系列合并（保留第一个，累加 data 数组）
    // 匹配 series: [ { name: 'X', ... }, { name: 'X', ... } ]
    // 简化处理：提取所有 name 值，如果有重复则标记
    const seriesNameRe = /name\s*:\s*['"]([^'"]+)['"]/g;
    const nameCounts = new Map();
    let m;
    while ((m = seriesNameRe.exec(newScript)) !== null) {
      const name = m[1];
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    }
    const dupNames = [...nameCounts.entries()].filter(([_, c]) => c > 1).map(([n]) => n);
    if (dupNames.length > 0) {
      changed = true;
      if (logger) {
        logger.warn('🛡️ D3 图例文本去重：发现重复 series name', { dupNames });
      }
      // 对重复 name 的系列，保留第一个，后续的 name 加后缀区分
      let suffixCount = new Map();
      newScript = newScript.replace(/name\s*:\s*(['"])([^'"]+)\1/g, (match, quote, name) => {
        if (dupNames.includes(name)) {
          const count = suffixCount.get(name) || 0;
          suffixCount.set(name, count + 1);
          if (count > 0) {
            return `name: ${quote}${name}_${count}${quote}`;
          }
        }
        return match;
      });
    }

    if (!changed) return content;

    if (logger) {
      logger.warn('🛡️ D3 图例文本去重：已对 legend/series 做确定性去重', {});
    }
    return content.replace(scriptBody, newScript);
  }

  /**
   * 🛡️ 推 A（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：索引层「引用谁」的确定性约束。
   *
   * 背景：assembleIndexVue 的 import 由「template 标签反推」（ensureSubComponentImport）或
   * LLM script 段自由书写，二者都不受 planner 规划约束。2290591b 中 LLM 在 ContentSection 内
   * 臆造 `import SubHeaderSection from './SubHeaderSection.vue'`（规划外、文件未生成）→ 运行时
   * 「找不到文件」、内容空白。该函数的**索引层**形态同理：若 LLM 在 index.vue 写了规划外 import，
   * 必须剥离，不能让它进入产物。
   *
   * 规则：`buildDeterministicIndexTemplate` 返回的 `componentFiles`（规划 section 经分配命名派生的
   * 确定性子组件文件集）是 index 层「引用谁」的唯一事实源。`allowed` 非空时，凡指向
   * `./components/X.vue` 的相对 import（静态 `import X from` / `defineAsyncComponent(() => import(...))`
   * 内联形式）其 X 不在 `allowed` 中 → 视为「未规划子组件引用」剥离其 import 绑定。
   *
   * **只处理 index.vue**：子组件内部（如 ContentSection.vue）引用未生成文件的场景由
   * section-coverage-guard 的 detectDanglingComponentRefs 事后 WARN 兜底（那里剥离会破坏已正确
   * 工作的内联组件，故此处不递归进子组件）。
   *
   * 纯函数、无 import.meta、fail-open（异常返回原串）。仅删 import 绑定，不删模板标签（避免误删
   * 已规划但 import 被剥离的合法标签——标签由 buildDeterministicIndexTemplate 保证规划内）。
   *
   * @param {string} content 拼装后的 index.vue
   * @param {string[]} allowed 规划内子组件名（不含 .vue）
   * @returns {string} 剥离未规划 import 后的内容
   */
  export function stripUnplannedSubComponentImports(content, allowed, options = {}) {
    const logger = safeLogger(options.logger);
    if (!content || typeof content !== 'string') return content;
    if (!Array.isArray(allowed) || allowed.length === 0) return content;
    const allowSet = new Set(allowed);
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) return content;
    const scriptBody = scriptMatch[1];
    if (!/['"]\.\/components\//.test(scriptBody)) return content;

    const referenced = new Set();
    // 静态 import：import X from './components/X.vue'
    for (const m of scriptBody.matchAll(
      /import\s+[A-Za-z_$][\w$]*\s+from\s*['"]\.\/components\/([\w-]+)\.vue['"]/g,
    )) {
      referenced.add(m[1]);
    }
    // 动态 import：defineAsyncComponent(() => import('./components/X.vue')) / import('./components/X.vue')
    for (const m of scriptBody.matchAll(/import\(\s*['"]\.\/components\/([\w-]+)\.vue['"]\s*\)/g)) {
      referenced.add(m[1]);
    }

    const unplanned = [...referenced].filter((n) => !allowSet.has(n));
    if (unplanned.length === 0) return content;

    let newScript = scriptBody;
    for (const name of unplanned) {
      // 删静态 import 行
      newScript = newScript.replace(
        new RegExp(`import\\s+[A-Za-z_$][\\w$]*\\s+from\\s*['"]\\.\\/components\\/${name}\\.vue['"]\\s*\\n?`, 'g'),
        '',
      );
      // 删动态 import('./components/X.vue')（保留外层的 defineAsyncComponent 包裹，仅去 import 表达式）
      newScript = newScript.replace(
        new RegExp(`import\\(\\s*['"]\\.\\/components\\/${name}\\.vue['"]\\s*\\)`, 'g'),
        `null /* 未规划子组件 ${name} */`,
      );
    }
    if (logger) {
      logger.warn('🔧 已剥离未规划子组件 import（规划外引用）', { unplanned });
    }
    return content.replace(scriptBody, newScript);
  }

/**
 * 🛡️ P2（2026-09-17 · e4709ad0 实锤）：水平 flex 子项按 Figma 宽度比例分配 flex-grow。
 * tabs 46px + cons 367px 不能写成统一 flex:1（50:50 均分）。无宽度时回退 flex:1。
 * @param {number[]} widths
 * @param {number} index
 * @returns {string}
 */
export function flexItemStyleFromWidths(widths, index, denominatorOverride) {
  const nums = (Array.isArray(widths) ? widths : []).map((w) => Number(w) || 0);
  const sumW = nums.reduce((sum, w) => sum + w, 0);
  // 🛡️ S4（2026-11-14）：与 heights 版同口径 —— 分母可覆盖为 `Σ宽 + Σ间距`，
  //   否则 `w/Σw` 之和恒为 1，再叠 `margin-left` 就是「100% + 间距」⇒ 横向溢出。
  const total =
    Number.isFinite(denominatorOverride) && denominatorOverride > 0
      ? Number(denominatorOverride)
      : sumW;
  const w = nums[index] || 0;
  // 🛡️ P6 wrapper 容器化合并（2026-09-17 · 1c98bab9 层次过深实锤）：比例不再由独立
  //   wrapper div 承载，而是直接内联到目标元素（容器 div / 子组件标签）自身的 style。
  //   因此这里只输出「比例 + min 约束」，不再输出 display:flex（那是容器自身的职责）。
  //   传导语义不变：目标元素吃父比例；它是 flex item（父是 flex 容器），
  //   若它自身又是容器则自带 display:flex 对子传导。
  if (total > 0 && w > 0) {
    return `flex:${(w / total).toFixed(3)};min-width:0;`;
  }
  return 'flex:1;min-width:0;';
}

/**
 * 🛡️ 刀16（2026-10-28 · mc-max-1793156075793-6bba7218 实锤）：兄弟间距真值注入。
 *
 * 病灶：确定性装配只传导「尺寸比例」（flexItemStyleFromWidths/Heights），从不产出
 * 兄弟间距——纵流兄弟（统计卡行→黄卡 33px、黄卡→绿卡 20px、绿卡→青卡 20px）与
 * 行带内横向兄弟（两统计卡组 64px）全部贴死。真值间距不均一 ⇒ 不能用父级 gap，
 * 只能逐兄弟按几何差产 margin（与刀50 段内间距同族，刀50 管段内、刀16 管兄弟）。
 *
 * flex 相容性：grow 分配的是「容器 − Σmargins」的剩余空间，真值里 Σ内容+Σ间距=容器
 * ⇒ 保持既有 h/Σh 分母不变 + margin 注入即可 1:1 还原，比例链不受影响。
 *
 * 判据纯几何、命名无关：双 box 合法（x/y/w/h 有限）且 gap ≥ 1px 才产 margin；
 * 重叠/贴合/缺几何 ⇒ ''（零行为变化）。
 *
 * @param {{x,y,w,h}|null} prevBox 前一兄弟 box
 * @param {{x,y,w,h}|null} curBox 当前兄弟 box
 * @param {'vertical'|'horizontal'} axis 主轴方向
 * @param {number} [prevEffectiveSize] 前一兄弟**实际被分配**的尺寸（与 flex 分配同源）
 * @param {{guarded?: number}|null} [guardStats] 🛡️ G1 异常间距守卫计数器（可选，命中时 guarded++）
 * @returns {string} `margin-top:Npx;` / `margin-left:Npx;` / ''
 */
// 🛡️ G1（2026-11-04 · mc-max-1793775843193-5980b8ee 实锤 margin-top:305px）：异常间距守卫。
//   病根：prev/cur 盒被假高段/错误锚推歪时，几何差算出数百 px「间距」——设计稿真值兄弟
//   间距几乎不可能 ≥100px（实测语料 8~64px）。宁缺勿滥：超限不注入（flex grow 自会分配
//   空间，缺 margin 影响远小于注入 305px 巨型空白），guardStats.guarded 计数恒可观测。
const SIBLING_GAP_MAX_PX = 100;

export function siblingGapStyle(prevBox, curBox, axis, prevEffectiveSize = 0, guardStats = null) {
  const px = siblingGapPx(prevBox, curBox, axis, prevEffectiveSize, guardStats);
  if (!(px > 0)) return '';
  return `${axis === 'vertical' ? 'margin-top' : 'margin-left'}:${Math.round(px)}px;`;
}

/**
 * 🛡️ S4（2026-11-14 · 9ed088e3 实锤）：兄弟间距的**数值**版本（单一实现，供分母使用）。
 *
 * 病灶：`flex:<h/Σh>` 之和恒为 1，再叠 `margin-top` ⇒ 子项总高 = 容器 100% + Σgap
 *   ⇒ 必然溢出（真机 101px / 807 画布 = 12.5%，末段被压）。
 * 正解：flex 分母改为 `Σh + Σgap`，把间距份额让出来（Σflex < 1，剩余量正好是 Σmargin）。
 *
 * 与 `siblingGapStyle` 同一判据（含 G1 超限守卫），区别只是返回数字。
 * @returns {number} >0 的间距像素；不合法/贴合/超限 ⇒ 0
 */
export function siblingGapPx(prevBox, curBox, axis, prevEffectiveSize = 0, guardStats = null) {
  const ok = (b) =>
    b &&
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.w) &&
    Number.isFinite(b.h) &&
    b.w > 0 &&
    b.h > 0;
  if (!ok(prevBox) || !ok(curBox)) return 0;
  const vertical = axis === 'vertical';
  // 🔴 刀16b（2026-11-03 · mc-1793686933827-7a07febd 实锤）：间距基准必须与 flex 分配**同源**。
  //   病灶：prev 的段盒常只是**段标题 GROUP**（`2:3559 标题` y=162 h=24），而 flex 分配用的是
  //   段整体高度（A4 `styles.figmaHeightPx` = 556，实测 `2:3559`→`2:3570` 得 margin-top:551px
  //   ≈ 整段高 556 双计；`2:3439`→`2:3571` 得 133px ≈ 段高 142-9）。真间距只有 737−(162+556)=19
  //   / 730−(573+142)=15。**两套高度口径混用 = 把 prev 正文高度再算一遍**。
  //   判据：prev 底 = prevBox.y + max(prevBox.h, prevEffectiveSize)（**只增不减**，与 A4 同规则；
  //   prevEffectiveSize 缺省/为 0/更小 ⇒ 逐字回退旧行为，零变化）。
  const prevExtent =
    Number.isFinite(prevEffectiveSize) && prevEffectiveSize > 0
      ? vertical
        ? Math.max(prevBox.h, prevEffectiveSize)
        : Math.max(prevBox.w, prevEffectiveSize)
      : vertical
        ? prevBox.h
        : prevBox.w;
  const gap = vertical
    ? curBox.y - (prevBox.y + prevExtent)
    : curBox.x - (prevBox.x + prevExtent);
  if (!Number.isFinite(gap) || gap < 1) return 0;
  // 🛡️ G1：异常间距守卫（在刀16b 同源修正之后——仍超限说明盒输入本身被推歪）
  if (gap > SIBLING_GAP_MAX_PX) {
    if (guardStats && typeof guardStats === 'object') guardStats.guarded = (guardStats.guarded || 0) + 1;
    return 0;
  }
  return Math.round(gap);
}

/**
 * 🛡️ P3（2026-09-17 · 8529b7e2 实锤）：垂直 flex 子项按 Figma 高度比例分配 flex-grow。
 * 解决垂直容器子项完全无高度约束 → collapse 到 0 的核心问题。
 * 与 flexItemStyleFromWidths 对称：子项高度比例 = height / totalHeight。
 * 无高度信息时回退 flex:1（保持向后兼容）。
 * @param {number[]} heights
 * @param {number} index
 * @returns {string}
 */
/**
 * 🛡️ P0-10（2026-11-14 · 用户实测「最后的折线图比设计稿明显更高」）：**纵向改 px basis**。
 *
 * 病灶：`flex:<h/Σh>` 是 grow 型比例，flexbox 会把容器**剩余空间按比例分光** ⇒ 只要容器
 *   比设计内容高，每一段都被等比放大，且**绝对偏差与段高成正比**（真机：容器 807 时
 *   折线图 141 → 153.5，+12.5px / +9%；标题 24 → 26，+2px 几乎看不出来）⇒ 视觉上
 *   "越高的段越像错的"。
 *
 * ⚠️ 2026-11-14 用户否决 inline px 方案（`flex:0 1 131px`）：
 *   **DOM 上不允许直接写尺寸** —— 项目靠 `postcss-pxtorem`（vite.config.js:468，
 *   rootValue = config.pxtorem.baseSize）把 less/css 里的 px 转 rem 做适配；inline style
 *   不经过 postcss ⇒ px 永远不转 ⇒ 大屏/rem 适配失效。
 *   故本函数只输出**比例**（无尺寸）；若要段高与设计 1:1，尺寸必须进样式表（less），
 *   由 px2rem 统一转换后以 class 承载（见 docs 里的方案 D 评估）。
 */
const USE_PX_BASIS = () => false;

export function flexItemStyleFromHeights(heights, index, denominatorOverride, forceRatio = false) {
  const nums = (Array.isArray(heights) ? heights : []).map((h) => Number(h) || 0);
  const sumH = nums.reduce((sum, h) => sum + h, 0);
  const px = nums[index] || 0;
  // 🛡️ G10v2：分母可覆盖为 `Σ子项高 + Σ兄弟间距`（= 容器可用高的真实份额）。
  //   否则 `h/Σh` 之和恒为 1，再叠 margin 就是「100% + 间距」⇒ 必然溢出。
  const total =
    Number.isFinite(denominatorOverride) && denominatorOverride > 0
      ? Number(denominatorOverride)
      : sumH;
  const h = nums[index] || 0;
  // 🛡️ P6 wrapper 容器化合并（同 flexItemStyleFromWidths）：只输出比例 + min 约束，
  //   目标元素（容器 div / 子组件标签）自身内联该比例，无需 wrapper 中转。
  if (total > 0 && h > 0) {
    return `flex:${(h / total).toFixed(3)};min-height:0;`;
  }
  return 'flex:1;min-height:0;';
}

/**
 * 🛡️ G10 v2（2026-11-06 · mc-max-1799861321-a9364bd4 实锤）：**竖排容器「比例 + 间距」画布收敛复核**。
 *
 * ## 为什么要第二版
 * v1（a87c2ba5）只比「兄弟盒跨度 vs 容器盒高」，能抓跨坐标系错位；但抓不到本单这种形态：
 * 四段 flex 之和正好 = 1.000（0.223+0.223+0.249+0.305），**再叠 43px 的 margin-top**
 * ⇒ 子项实际总高 = 容器 100% + 43px ⇒ 末段被压 / 溢出，而「盒跨度 ≈ 容器高」照样成立。
 *
 * ## 判据（几何恒等式，零硬编码）
 *   `Σ(子项真值高) + Σ(兄弟间距) ≈ 容器高` —— 超阈值即判「比例不可信」。
 *   注意：flex 值本身是归一化的（Σ=1），所以**只能**用绝对真值高来核，
 *   不能用 flex 之和（恒为 1，永远"收敛"，正是 v1 的盲区）。
 *
 * ## 处置（由调用方执行）
 *   mismatch ⇒ 该容器**不写 flex**（回落自然流 + 保 `min-height:0`）、**不写兄弟间距**，
 *   并计入 `ratioCanvasMismatch`。宁可不拉伸，也不下发一组必然溢出的比例。
 *
 * @param {{containerH:number, childHeights:number[], gaps:number[], threshold?:number}} p
 * @returns {{containerH:number, sumH:number, sumGap:number, total:number, deviance:number, mismatch:boolean}}
 */
export function evaluateColumnCanvasConvergence(p = {}) {
  const threshold = Number.isFinite(p.threshold) ? Number(p.threshold) : 0.15;
  const containerH = Number(p.containerH) || 0;
  const heights = (Array.isArray(p.childHeights) ? p.childHeights : [])
    .map((h) => Number(h) || 0)
    .filter((h) => h > 0);
  const sumH = heights.reduce((a, b) => a + b, 0);
  const sumGap = (Array.isArray(p.gaps) ? p.gaps : [])
    .map((g) => (Number(g) > 0 ? Number(g) : 0))
    .reduce((a, b) => a + b, 0);
  const total = sumH + sumGap;
  const out = { containerH, sumH, sumGap, total, deviance: 0, mismatch: false };
  if (!(containerH > 0) || sumH <= 0) return out; // 无容器高 / 无子项真值 ⇒ 不可证，不下结论
  out.deviance = Math.abs(total - containerH) / containerH;
  out.mismatch = out.deviance > threshold;
  return out;
}

/**
 * 🛡️ P4（2026-09-17 · mc-max-1789624984895-d70a19bf 实锤）：装配层按 Figma bbox 回查子项尺寸。
 *
 * 根因：planner enrich 之后的 effectiveSections 常**丢掉 absoluteBoundingBox**
 *   （图例分列把 `287:5` 拆成 `287:5-left` / `287:5-right` 两个合成 id；中间图表被标成
 *   isLayoutContainer 且 sourceNodeIds=[]）→ 装配层只读 `c.absoluteBoundingBox` 全为 0
 *   → flexItemStyleFromWidths/Heights 一律回退 `flex:1` → 三栏被 1:1:1 均分（设计为 220/207/220）。
 *
 * 这是**数据使用问题**，不是「没记 Figma 数据」：Figma 真值一直存在，只是装配层没有回查。
 * 治本：树上有 bbox 直接用；没有则依次按 `figmaNodeId` → `id` → `sourceNodeIds` 回查
 * indexFigmaNodes 索引。全部落空才返回 0（下游回退 flex:1，保持向后兼容）。
 *
 * 纯函数、无 import.meta、不修改入参。
 *
 * @param {Object} sec effectiveSections 叶子/容器节点
 * @param {Map} figmaIndex indexFigmaNodes(figmaRoot) 的产物（可为 null）
 * @param {'width'|'height'} axis 取哪一维
 * @returns {number} 该维尺寸（px）；无法确定时为 0
 */
export function resolveSectionFlexSize(sec, figmaIndex, axis = 'width') {
  // 🔴 2026-10-22 单一来源收敛：几何解析一律走 `section-intrinsic-layout#resolveSectionSize`
  //   （与 `resolveSectionBox` 同一条优先级链），本函数只保留最后的 `figmaSectionBox` 兜底。
  //   此前的本地实现按 `sourceNodeIds` **首个命中**取尺寸 —— 对合成节点
  //   （`38:3167-list` 覆盖 3 行 / `287:5-left` 覆盖整列）只能拿到**首行/首列**的尺寸，
  //   是「优质厂商 list 高度真值 130 却按 30 分配」的直接错源。并集口径才能拿到整段尺寸。
  const size = resolveSectionSize(sec, figmaIndex, axis);
  if (size > 0) return size;

  if (!figmaIndex || typeof figmaIndex.get !== 'function') return 0;

  // ④ 容器节点无自身归属时，回退到其子树最上节点的 box（figmaSectionBox 同源口径）
  const pick = (b) => {
    if (!b || typeof b !== 'object') return 0;
    const raw = axis === 'height' ? (b.height ?? b.h) : (b.width ?? b.w);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const viaBox = pick(figmaSectionBox(sec, figmaIndex));
  if (viaBox > 0) return viaBox;

  return 0;
}

/**
 * 🛡️ 层①（2026-09-11）：确定性 index.vue 模板装配 —— 治 COMP-001 / CODE-021 / 语义门禁。
 *
 * 背景：index.vue 的 <template> 原本由 LLM 分块手写（buildTemplateChunkMiddle 只给「强制命名 +
 * 禁止内联」软约束）。LLM 跨 chunk 各写各的 → 同一份 section 契约被多次解释，出现
 * 「componentPlan 规划 4 个 section 但 index.vue 只组装 1 个（COMP-001）」「import 了子组件但
 * 模板 0 处引用（CODE-021）」「模板引用 script 未声明的变量（语义门禁）」——三者同源，都是
 * 「装配」这一步没有单一事实源。
 *
 * 方案：系统从 planner 的 effectiveSections 树（R1 单一事实源）+ 确定性命名（R2 assignSectionComponentNames）
 * 直接产出 <template> 骨架（base-panel 包裹 + header 插槽 + 子组件标签顺序）。子组件文件由下游
 * _detectSubComponents 从 index.vue 的 import 反推生成，脚本段由 ensureSubComponentImport 补齐 import。
 * LLM 只负责每个子组件内部的 DOM，不再写装配。
 *
 * 🛡️ R1-2（2026-09-11）布局事实数据流化：返回值从 string 扩展为 facts 对象
 * `{ template, rootContainerClass, sectionRoots }`，供下游 rootLayoutFacts 消费，
 * 消灭「下游靠命名枚举猜根容器」的两连复发机制。
 *
 * @returns {{ template: string, rootContainerClass: string|null, sectionRoots: Array<{id, component, type}>, componentFiles: string[] }|null}
 *   无计划子组件时返回 null（回退 LLM 生成）。
 *   `componentFiles` = 规划 section 经确定性命名派生的**子组件文件集**（PascalCase 名，不含 .vue），
 *   是 index 层「引用谁」的唯一事实源；assembleIndexVue 据此约束 import，从构造上消灭索引层悬空引用。
 */
export function buildDeterministicIndexTemplate(input, options = {}) {
  const treeSections = resolvePlanSections(input);
  const leaves = collectLeafSections(treeSections);
  // 🛡️ P0 生效自检计数（2026-09-28）：B′ 判据的评估/命中数，供函数收尾统一落日志。
  let __eqEvaluated = 0;
  let __eqHits = 0;
  // 🛡️ 刀 50 生效自检计数（2026-10-22）：0 命中时必须能区分「没跑 / 跑了没判据成立」。
  let __intrinsicEvaluated = 0;
  let __intrinsicHits = 0;
  // 🛡️ 刀 7（2026-10-27 · 8bbcf027 `36:1695` 实锤）：容器吸收背景层计数。
  let __absorbedBgCandidates = 0;
  let __absorbedBgLayers = 0;
  let __absorbedBgScrollbarExempted = 0;
  // 🛡️ 刀 7c（2026-11-03 · `807:2`/`43:5688` 实锤）：根级宿主吸收背景层计数。
  //   顶层非容器叶子段的盒 ≡ 图根盒时，其吸收层注入根 slot-con div。
  let __absorbedBgRootHostCandidates = 0;
  let __absorbedBgRootHostLayers = 0;
  let __absorbedBgRootHostDeferred = 0;
  // 🛡️ 刀 12（2026-10-27 · ad8939a5 `801:3` 实锤）：2D 行簇重建计数。
  let __rowBandEvaluated = 0;
  let __rowBandHits = 0;
  let __gapApplied = 0;
  // 🛡️ S4：分母已含 Σgap 的容器数（0 也打，便于辨「没命中」与「没生效」）
  let __gapDenominatorApplied = 0;
  // 🛡️ px basis 因覆盖率不足退回比例填满的容器数（0 也打）
  let __pxBasisFallback = 0;
  // 🛡️ 方案 E：段高 class 规则收集（less 片段，px 由 px2rem 转 rem）
  const __secHeightRules = [];
  let __pxHeightSkipped = 0; // 刀16 兄弟间距真值注入计数
  let __gapRebased = 0; // 刀16b 间距基准被上移到「与 flex 同源高度」的注入数（修双计）
  let __canvasMismatchCount = 0; // G10 v1 画布收敛复核拦停数（兄弟盒跨度 vs 容器高偏差>15%）
  let __ratioCanvasGroups = 0; // G10 v2 进入「Σ子项高+Σ间距 vs 容器高」复核的竖排容器数
  let __ratioCanvasMismatch = 0; // G10 v2 判不收敛 ⇒ 弃用 flex 的容器数（0 也打）
  const __gapGuardStats = { guarded: 0 }; // 🛡️ G1 异常间距守卫计数（≥100px 不注入）
  if (!leaves.length) return null;

  const nameOf = assignSectionComponentNames(treeSections);
  const panelType = input.panelType || 'default-panel';
  // input.componentName 已是 _deriveClassPrefix 的干净语义名（如 device-monitor / env-monitor）
  const semantic = String(input.componentName || '')
    .replace(/^c-/, '')
    .toLowerCase() || 'component';

  // 🛡️ 推 A（2026-09-14）：确定性子组件文件集 —— index 层「引用谁」的唯一事实源。
  // 来自 nameOf（与 template 标签、子组件文件名同一份映射），assembleIndexVue 据此约束 import。
  const componentFiles = [...new Set([...nameOf.values()])];

  // 🛡️ P4（2026-09-17 · d70a19bf 实锤）：装配层回查 Figma bbox 的索引。
  // planner 拆列合成 id（287:5-left）在 effectiveSections 里没有 absoluteBoundingBox，
  // 必须按 sourceNodeIds 回查真实 Figma 节点尺寸，否则三栏被 flex:1 均分。
  // 单一事实源：与 anchorPhantomSections / sortSectionsByFigmaY 共用 indexFigmaNodes。
  const figmaIndex = indexFigmaNodes(
    input?.figmaNodeData?.document || input?.figmaNodeData || null,
  );

  // 🛡️ 刀 7（2026-10-27）：叶子认领集 —— 容器 sourceNodeIds 里「未被任何叶子认领」
  //   的可见 SOLID 矩形 = 被吸收的背景层（无载体 ⇒ 产物丢色，实锤 `36:1695` #E1EBFF）。
  //   判据单一来源：`container-absorbed-bg.js#resolveAbsorbedBgLayers`（纯函数、逐事实 fail-open）。
  const claimedNodeIds = new Set();
  for (const l of leaves) {
    if (!l) continue;
    claimedNodeIds.add(String(l.id ?? ''));
    for (const id of Array.isArray(l.sourceNodeIds) ? l.sourceNodeIds : []) {
      claimedNodeIds.add(String(id));
    }
  }
  // 🛡️ 刀 29c（mc-max-1793255115028-7ec263c9 实锤）：collapsed/v-for 列表叶按
  //   **几何包含**认领其渲染盒内的全部 figma 节点（vision item id 幻觉为卡内层
  //   GROUP 时，sourceNodeIds 闭包拿不到兄弟卡真实面 rect ⇒ 刀7 absorbed-bg
  //   空壳色带）。判据实现单一来源：container-absorbed-bg.js
  //   #claimCollapsedLeafContainedIds（纯几何 containment，与本文件刀 7 越出
  //   检查同一坐标系）。
  claimCollapsedLeafContainedIds(claimedNodeIds, leaves, figmaIndex, resolveSectionBox);
  // 🛡️ 刀 7 归属唯一化（2026-10-27 · c-a0f93b-a0f93b25 实锤）：同一矩形可能被**嵌套容器**
  //   的 sourceNodeIds 重复吸收（外层 `796:3` 与内层 `38:3137` 都含 `38:3138`）⇒ 逐容器
  //   各出一层 = 双层叠加。规则：**plan 树上最近的容器**（deepest）独占该层。
  //   故自底向上预分配（子容器先判），渲染时只消费自己名下的层。
  const bgLayersByContainer = new Map();
  // 🛡️ 刀 7c：根级宿主的吸收层（注入根 slot-con div），以及几何不自洽的 deferred 段 id。
  let rootHostSection = null;
  let rootHostLayers = [];
  const rootHostDeferredSectionIds = [];
  {
    const consumedBgIds = new Set();
    const assignBg = (list) => {
      for (const s of list || []) {
        if (!s || !isLayoutContainerSection(s)) continue;
        assignBg(s.children); // 子容器优先（deepest wins）
        const r = resolveAbsorbedBgLayers(s, figmaIndex, claimedNodeIds);
        __absorbedBgCandidates += r.evaluated;
        __absorbedBgScrollbarExempted += r.scrollbarExempted;
        const owned = r.layers.filter((layer) => !consumedBgIds.has(layer.id));
        for (const layer of owned) consumedBgIds.add(layer.id);
        __absorbedBgLayers += owned.length;
        if (owned.length) bgLayersByContainer.set(String(s.id), owned);
      }
    };
    assignBg(treeSections);

    // 🛡️ 刀 7c（2026-11-03 · `c-slot-con-*` ×12 实锤）：**根级宿主吸收背景层**。
    //
    //   ## 病灶（真值，非推理）
    //   顶层**非容器叶子段** `807:2`（GROUP name='slot-con'，盒 `{29636,51637,483,515}`
    //   ≡ Figma 图根盒）的 `sourceNodeIds` **只有自身** ⇒ 7 个直系子
    //   （`43:4784/4869/4875/4878/4892/4911/5688`）全不在闭包 ⇒ 刀 7 候选集为空 ⇒
    //   装饰条 `43:5688`（6×218 r3 `rgba(20,105,169,.37)`，右缘精确贴宿主边）**永不出层**，
    //   产物 `.vue/.less` 中该色值 0 次出现（真缺陷，非假阳性）。
    //   判据层早已具备能力（见 utils/__tests__/container-absorbed-bg.spec.ts 刀20c-R 用例，
    //   其 sec.sourceNodeIds 含 '43:5688' ⇒ 正确出层）⇒ 缺口纯在**候选集**。
    //
    //   ## 治本
    //   候选集扩充「Figma 直系子」（`expandCandidateIdsWithDirectChildren`，**纯枚举**，
    //   类型/fill/认领/越出/滚动条豁免仍全由 `resolveAbsorbedBgLayers` 单点裁决）。
    //
    //   ## 几何护栏（必需）
    //   层注入**根 `c-{semantic}-slot-con` div**（叶子分支只输出 `<XxxSection/>`，无 div 无锚；
    //   给叶子加 wrapper 会破坏 P6「一层承载全部职责」契约并把 flex 比例/方向链多推一层）。
    //   根 div 只有在该段盒 ≡ 图根盒（±2px）时才与段几何同源 ⇒ 否则坐标基准错位。
    //   全语料反证：39 段/18 目录的非容器段盒 ≠ 图根盒（如 `801:3` 内缩 28/35px、
    //   `38:3137` 高度差 707px、`c-aiot-…-3a548c26` 6 段 470×72 vs 根 510×665）
    //   ⇒ 一律 fail-open 并入 `deferred`（计数行 + 段 id），不注入、不猜。
    //
    //   ## 为什么枚举只对非容器段启用
    //   容器段沿用 `sourceNodeIds` ⇒ 「容器零变化」是**构造保证**，而非「实测 0」的巧合：
    //   全语料 399 个容器段里有 23 段 `sourceNodeIds` 本就不含全部直系子，一旦未来变全，
    //   若判据层无条件枚举会**静默改变容器行为**。
    const rootNode = input?.figmaNodeData?.document || input?.figmaNodeData || null;
    const rootBBox = rootNode?.absoluteBoundingBox || rootNode?.bbox || null;
    const rootBox =
      rootBBox &&
      [rootBBox.x, rootBBox.y, rootBBox.width, rootBBox.height].every(Number.isFinite)
        ? { x: rootBBox.x, y: rootBBox.y, w: rootBBox.width, h: rootBBox.height }
        : null;
    if (rootBox) {
      const ROOT_HOST_TOLERANCE_PX = 2;
      const boxEq = (a, b) =>
        !!a &&
        Math.abs(a.x - b.x) <= ROOT_HOST_TOLERANCE_PX &&
        Math.abs(a.y - b.y) <= ROOT_HOST_TOLERANCE_PX &&
        Math.abs(a.w - b.w) <= ROOT_HOST_TOLERANCE_PX &&
        Math.abs(a.h - b.h) <= ROOT_HOST_TOLERANCE_PX;
      // 计划序 DFS：先父后子，故「盒 ≡ 图根盒」的最外层段天然优先（不再额外排序）。
      const nonContainers = [];
      const collectNonContainers = (list) => {
        for (const s of list || []) {
          if (!s) continue;
          if (!isLayoutContainerSection(s)) nonContainers.push(s);
          collectNonContainers(s.children);
        }
      };
      collectNonContainers(treeSections);
      const guarded = [];
      for (const s of nonContainers) {
        const eff = expandCandidateIdsWithDirectChildren(s, figmaIndex);
        const declared = Array.isArray(s.sourceNodeIds) ? s.sourceNodeIds.length : 0;
        // 无直系子可加 ⇒ 与旧行为逐字等价，不必评估（保住「零变化」的可读性）。
        if (eff.length <= declared) continue;
        const r = resolveAbsorbedBgLayers({ ...s, sourceNodeIds: eff }, figmaIndex, claimedNodeIds);
        __absorbedBgRootHostCandidates += r.evaluated;
        const owned = r.layers.filter((layer) => !consumedBgIds.has(layer.id));
        if (!owned.length) continue;
        const sb = resolveSectionBox(s, figmaIndex);
        if (boxEq(sb, rootBox)) guarded.push({ sec: s, layers: owned });
        else {
          rootHostDeferredSectionIds.push(String(s.id));
          __absorbedBgRootHostDeferred += owned.length;
        }
      }
      // 归属必须唯一：0 个 ⇒ 无根宿主（正常）；≥2 个 ⇒ 无法确定主语，一律 deferred。
      if (guarded.length === 1) {
        rootHostSection = guarded[0].sec;
        rootHostLayers = guarded[0].layers;
        for (const layer of rootHostLayers) consumedBgIds.add(layer.id);
        __absorbedBgRootHostLayers += rootHostLayers.length;
      } else if (guarded.length > 1) {
        for (const g of guarded) {
          rootHostDeferredSectionIds.push(String(g.sec.id));
          __absorbedBgRootHostDeferred += g.layers.length;
        }
      }

      // 🛡️ 刀 7d（2026-11-12 · mc-1794420031803-a2a0df58 实锤）：**根直系壳层直采**。
      //
      //   ## 缺口（刀 7c 通路对「壳=根直系子」形态失明）
      //   弹窗画板的壳背景是根节点（36:1693）的直系 RECTANGLE 子（36:1694 name='bg'，
      //   603×555 r4 GRADIENT_LINEAR），而规划层段树从根的 children 开始建段 ⇒ 根/壳
      //   都不在 treeSections ⇒ 刀 7c「顶层非容器段」枚举零候选可认领壳节点 ⇒
      //   刀 7 常规通路（段 sourceNodeIds）也无主语 ⇒ 渐变壳永不落（46ef66fa/a2a0df58
      //   用户对比设计图报「退化」）。
      //
      //   ## 判据（纯几何+真值，零语义猜测，仅当 7c 未命中时启用）
      //   ① 根节点直系子中存在 RECTANGLE，且其 bbox ≡ 根 bbox（±2px，同 boxEq）；
      //   ② 该子未被任何段认领（claimedNodeIds ∩ 自身 id 为空）且不在 consumedBgIds；
      //   ③ fill 可 CSS 化（resolveAbsorbedBgLayers 同一裁决：SOLID 或 ≥2 stops 渐变）。
      //   命中 ⇒ 构造 absolute 全覆盖层注入根 slot-con div（z-index:-1 沉底），
      //   与刀 7c 注入同构（同 buildAbsorbedBgLayerStyle，禁第二份样式拼装）。
      //   不命中枚举：7c 已命中（rootHostLayers 非空）跳过；壳尺寸 ≠ 根尺寸（部分宽
      //   条/装饰条）不属「壳」，走段级通路；SOLID/渐变都不可 CSS 化跳过（fail-open）；
      //   IMAGE fill 跳过（位图走 E3-v4 资源通路）。
      if (!rootHostLayers.length && figmaIndex && typeof figmaIndex.get === 'function') {
        const rootChildren = Array.isArray(rootNode?.children) ? rootNode.children : [];
        const shellNode = rootChildren.find((c) => {
          if (!c || String(c.type || '').toUpperCase() !== 'RECTANGLE') return false;
          const cb = c.absoluteBoundingBox;
          if (!cb) return false;
          const eq =
            Math.abs(cb.x - rootBox.x) <= 2 &&
            Math.abs(cb.y - rootBox.y) <= 2 &&
            Math.abs(cb.width - rootBox.w) <= 2 &&
            Math.abs(cb.height - rootBox.h) <= 2;
          if (!eq) return false;
          if (claimedNodeIds.has(String(c.id))) return false;
          if (consumedBgIds.has(String(c.id))) return false;
          return true;
        });
        if (shellNode) {
          const shellId = String(shellNode.id);
          // 容器=根节点（resolveAbsorbedBgLayers 需 figmaIndex.get(sec.id) 取 cBox；
          // 且 sourceNodeIds 不得含 sec.id 自身 ⇒ 必须以根为主语、壳为子）
          const r = resolveAbsorbedBgLayers(
            { id: String(rootNode?.id ?? 'root'), sourceNodeIds: [shellId] },
            figmaIndex,
            new Set(),
          );
          if (r.layers.length > 0) {
            // 壳层全覆盖根容器：edgeCss 全 0（left/top/right/bottom 全贴），直接构造
            for (const layer of r.layers) {
              rootHostLayers.push({
                ...layer,
                edgeCss: 'left:0;top:0;right:0;bottom:0;',
              });
            }
            consumedBgIds.add(shellId);
            rootHostSection = { id: 'root', name: 'root-shell' };
            __absorbedBgRootHostLayers += r.layers.length;
          }
        }
      }
    }
  }

  // 🛡️ P1-B 治本（2026-10-26 · mc-max-1792934367321-ab7bb76c 实锤）：刀 53 抑制成员的
  //   宽/高必须从 **flex 归一化分母** 里剔除。
  //
  //   ## 病灶（真渲染实测，非推理）
  //   该单 `43:4784` 是 flex row，两列真值宽 179 / 291 ⇒ `flex:0.380` / `flex:0.620`；
  //   `43:4812-list`（CardGrid）被表格两阶段决策抑制，整段渲染为 `display:none` 空壳。
  //   实测（puppeteer 三组对照）：
  //     · `display:none` 兄弟 **不占位**（rect 0×0），但幸存者也不因此变宽（177.83px）；
  //     · 把它从 DOM **物理删除** ⇒ 幸存者宽度**逐像素不变**（同为 177.83px）；
  //     · 只有把幸存者 flex 因子**重归一化**（0.380 → 1.000）才真吃满（177.83 → 468px）。
  //   根因不是「占位」，而是 CSS Flexbox 的 `<1` 特例：因子总和 <1 时浏览器把可用空间
  //   乘以该总和再分配 ⇒ 少一个兄弟 ≠ 幸存者变大，**必须让幸存者之和回到 1.0**。
  //   ⇒ 对抑制成员填 0（不贡献 total），幸存者 `w/total` 自动归一化到 1.000。
  //
  //   ## 单一事实源纪律
  //   `suppressed` 由 `collectFoldedGridTakeover`（刀 53 唯一判据源）给出，本文件只消费、
  //   不重判。取 `sectionId` 作键（各 detector 均返回 `String(sec.id)`，与命名无关）；
  //   **同一棵树**：这里传的 `treeSections` 与下游 `nameOf` 完全一致 —— 若改用原始
  //   `effectiveSections`，`dedupeDuplicateSections` 造成的叶子增删会让 tag/id 错位
  //   （本单实测：原始树 `ContentSection`=43:4898，dedupe 后 `ContentSection`=43:4785）⇒ 归零到错误的子项。
  //
  //   fail-open：任何异常 ⇒ 空集 ⇒ 走既有比例行为（零回归）。
  //   不传 logger：接管器自己的计数行由上游（microcode-engineer）落，避免重复留痕。
  const suppressedSectionIds = new Set();
  const takeoverHeightBySectionId = new Map();
  let __p1bTakeoverLeaves = 0;
  let __takeoverHeightFallbacks = 0;
  try {
    const __tk = collectFoldedGridTakeover({
      treeSections,
      figmaNodeData: input?.figmaNodeData || null,
      resourceMapping: input?.resourceDomMapping || [],
      componentName: input?.componentName || '',
    });
    __p1bTakeoverLeaves = __tk.map.size;
    for (const tr of __tk.map.values()) {
      if (tr && tr.suppressed === true && tr.sectionId != null) {
        suppressedSectionIds.add(String(tr.sectionId));
      }
      if (tr?.sectionId != null && Number.isFinite(Number(tr.height)) && Number(tr.height) > 0) {
        takeoverHeightBySectionId.set(String(tr.sectionId), Number(tr.height));
      }
    }
  } catch {
    // fail-open：判据不可用 ⇒ 不做分母剔除
  }
  const isSizeExcluded = (sec) =>
    suppressedSectionIds.size > 0 && suppressedSectionIds.has(String(sec?.id ?? ''));
  // 无锚点文本段等 planner 无法给高的叶子，可复用接管器已唯一回查到的 Figma 高度。
  // 只在原尺寸链返回 0 时补事实，不覆盖已有几何，也不给无真值段猜高度。
  const resolveHeightWithTakeover = (sec) => {
    const original = resolveSectionFlexSize(sec, figmaIndex, 'height');
    if (original > 0) return original;
    const height = takeoverHeightBySectionId.get(String(sec?.id ?? '')) || 0;
    if (height > 0) __takeoverHeightFallbacks += 1;
    return height;
  };

  // 唯一结构契约：placement 与 type 解耦；插槽、bodyLeaves、bodyRoots、递归 body 全部同源。
  const structureContract = buildSectionStructureContract(treeSections, {
    headerSlots: input?.headerSlots,
  });
  const headerLeavesFinal = structureContract.headerLeaves;
  const bodyLeavesFinal = structureContract.bodyLeaves;
  if (options?.logger?.info) {
    options.logger.info('🛡️ section 结构契约·已评估', {
      ...structureContract.stats,
      dropped: structureContract.droppedHeaderLeaves.map((s) => String(s?.id)),
    });
  }

  const tagFor = (sec, fallback) => nameOf.get(String(sec.id)) || fallback;

  const rootContainerClass = bodyLeavesFinal.length > 0 ? `c-${semantic}-slot-con` : null;
  const sectionRoots = leaves.map((s) => ({
    id: String(s.id),
    component: tagFor(s, s.type === 'header' ? 'HeaderSection' : 'ContentSection'),
    type: s.type || 'content',
  }));

  const lines = ['<template>'];
  lines.push(`  <base-panel panelKey="${panelType}">`);
  for (const h of headerLeavesFinal) {
    lines.push(`    <template #header-right>`);
    lines.push(`      <${tagFor(h, 'HeaderSection')} />`);
    lines.push(`    </template>`);
  }
  if (bodyLeavesFinal.length > 0) {
    // 🛡️ P5 高度传导（2026-09-17 · e0cdf905 实锤）：slot-con 确定化为 flex column 容器。
    //   此前它是 block（display 由 LLM 的 less 决定），顶层容器/叶子失去 flex item 身份，
    //   高度只能靠 less 里的 height:100%（LLM 写了才有）。确定化后整条链从 pannel-content
    //   → slot-con → 容器 → wrapper → 子项 全程 flex 传导，不再依赖 LLM 样式。
    // 🛡️ 刀 7c（2026-11-03）：根级宿主的吸收层注入根 div —— 与刀 7b 对容器所做的事**同构**
    //   （`position:relative;isolation:isolate;` 把 `z-index:-1` 层圈进本层叠上下文，
    //   沉到内容之下、根 div 背景之上）。
    //   🔴 样式**必须条件注入**：`code-generator.deterministic-template.spec.ts:80` 逐字断言
    //   无层时根 div 为 `class="c-…-slot-con" style="display:flex;flex-direction:column;"`；
    //   其 fixture（makeInput）不含 figmaNodeData ⇒ indexFigmaNodes 空 Map ⇒ 恒 0 层 ⇒ 逐字不变。
    //   🔴 宿主锚点用专用属性 `data-absorbed-host`，**绝不复用 `data-section-id`**：产物叶子组件
    //   根元素已带 `data-section-id="<该段id>"`（如 ContentFooter.vue 带 807:2），而
    //   `figma-connector.js:2580` 生成的 `[data-section-id="<id>"]` 是资源挂载锚 / 评分选择器
    //   ⇒ 同名会让该选择器在同页**双命中**（背景错挂 + mount-target-scoring 派分污染）。
    const rootHostAttr =
      rootHostLayers.length && rootHostSection
        ? ` data-absorbed-host="${rootHostSection.id}"`
        : '';
    const rootHostStyle = rootHostLayers.length ? 'position:relative;isolation:isolate;' : '';
    // 🛡️ 弹窗画板尺寸契约（2026-11-12 · mc-max-1794418321523-46ef66fa 实锤）：
    //   大屏画板根（如 2:7952 420×147）预览时应横向铺满（宽高比悬殊、卡片流）；
    //   弹窗/面板类画板根（如 36:1693 603×555，宽高比 ≈1）被 `height:100%` 拉满
    //   预览全屏 ⇒ 观感「退化」（壳撑满、内容稀疏）。判据（确定性、真值优先）：
    //   根真值 max(w,h)/min(w,h) ≤ 1.5 且 max ≤ 800px ⇒ 弹窗类，slot-con 根容器
    //   内联 width/height 钉真值尺寸 + margin:auto 居中（不依赖 LLM/共享样式表）；
    //   其余（大屏/横幅）保持 height:100% 铺满逐字不变。
    //   🛡️ 去重修正（2026-11-12 · mc-max-1794422523731-d7c469a9 实锤）：弹窗类画板下
    //   模板串曾产出 `height:100%;…;height:555px`（同一属性重复）。标准 CSS 后者胜出，
    //   但预览运行时（vue3-sfc-loader 沙箱的内联 style 解析）按首个键值生效 ⇒
    //   height:100% 复活 ⇒ 弹窗壳被拉满全屏（用户报「为什么这样」）。修：弹窗类时
    //   底串不再输出 height:100%（由 rootHeightStyle 单点提供），根 div 高度唯一来源。
    let rootSizeStyle = '';
    let rootHeightStyle = 'height:100%;'; // 大屏/横幅：保持铺满（逐字不变）
    {
      const _rootBb =
        input?.figmaNodeData?.document?.absoluteBoundingBox ||
        input?.figmaNodeData?.absoluteBoundingBox ||
        null;
      const rw = _rootBb ? Number(_rootBb.width) : NaN;
      const rh = _rootBb ? Number(_rootBb.height) : NaN;
      if (Number.isFinite(rw) && Number.isFinite(rh) && rw > 0 && rh > 0) {
        const mx = Math.max(rw, rh);
        const mn = Math.min(rw, rh);
        const isDialogLike = mx / mn <= 1.5 && mx <= 800;
        if (isDialogLike) {
          rootSizeStyle = `width:${Math.round(rw)}px;height:${Math.round(rh)}px;margin-left:auto;margin-right:auto;`;
          rootHeightStyle = ''; // 弹窗类：height 由 rootSizeStyle 唯一提供
        }
      }
    }
    // 🛡️ F1 根容器高度契约（2026-11-04 · mc-max-1793769058951-9a0133fe 实锤）：
    //   此前根 div 只写 `display:flex;flex-direction:column`，高度**全靠 LLM 在 less 里写
    //   `height:100%`**（见上方 P5 注释「LLM 写了才有」）。一旦 LLM 没写（本例 index.vue 的
    //   `<style>` 只有 @import，共享表里 `.c-…-slot-con` 零规则），根 div 在 block 父层
    //   （`.pannel-content`，定高）里 height:auto，而 A4 给每个段写的都是 `flex:<r> 1 0`
    //   + `min-height:0` ⇒ **列向 flex 容器无定高时子项 hypothetical main size 全为 0**
    //   ⇒ 整棵树高度 0：echarts 已 init（canvas 存在）却被 `overflow:hidden` 裁掉，
    //   真机实测 slot-con 0 / chart 0 / canvas 110 溢出不可见。
    //   治本：把高度契约定在**产生处**（内联样式优先级最高，免疫后续合并/反杀），
    //   与既有正常组件的 `.c-…-slot-con{width:100%;height:100%;min-height:0}` 同口径。
    lines.push(`    <div class="${rootContainerClass}"${rootHostAttr} style="display:flex;flex-direction:column;${rootHeightStyle}min-height:0;${rootSizeStyle}${rootHostStyle}">`);
    for (const layer of rootHostLayers) {
      lines.push(
        `      <div class="c-${semantic}-absorbed-bg" data-absorbed-bg="${layer.id}" style="${buildAbsorbedBgLayerStyle(layer)}"></div>`,
      );
    }
    // 🛡️ E1 治本（2026-09-16）：递归保留容器层级。此前用 bodyLeavesFinal 平铺叶子，
    //   switch/@antd-tab 等中间容器被丢弃 → active/default/tabs/cons 全部平级，
    //   用户指正「switch 没有组成一个元素，而是和下面所有内容全部 flex 了」。
    //   治本：按树递归渲染，容器（isLayoutContainer）生成 wrapper <div class="c-xxx-container">，
    //   叶子生成子组件标签；容器 class 用语义名派生，保证样式侧可精确命中。
    // 🛡️ P6 wrapper 容器化合并（2026-09-17 · 1c98bab9 层次过深实锤）：
    //   P2/P3/P5 曾给每个子项无条件包一层「比例分配 wrapper」空壳 div（flex:0.xxx +
    //   display:flex 传导），再叠 E1 语义容器 div → 模板一半是空壳标签，可读性差。
    //   治本：比例直接内联到目标元素自身 style ——
    //   · 容器 div：吃父比例（parentFlexStyle）+ 对子方向（display:flex;flex-direction）
    //   · 叶子子组件标签：吃父比例（parentFlexStyle，Vue attrs 继承透传到子组件根元素）
    //   一层承载全部职责，wrapper 整体消失。传导链不变：
    //   pannel-content → slot-con → 容器(比例+方向) → 子元素(比例) 全程 flex。
    const renderBodyNode = (sec, indent, parentFlexStyle = '', extraClass = '') => {
      // 入槽叶在任意嵌套深度都不得再由 body 渲染；归属只读结构契约。
      if (structureContract.byId.get(String(sec?.id ?? ''))?.placement === 'header-right') return;
      const pad = '      ' + '  '.repeat(indent);
      // 🛡️ P1-B 收尾：suppressed 叶已被首个同组成员整行/整表接管，最终只保留其
      // display:none 子组件身份，不再参与空间分配。仅在尺寸数组里填 0 不够——
      // flexItemStyleFromHeights/Widths 对「当前项=0」会回退 flex:1，重新造出空白槽。
      // 在这里统一终裁，同时覆盖顶层/嵌套/单子项路径；原始 section 不删除、不重排。
      const consumedLayoutStyle = isSizeExcluded(sec)
        ? `flex:0;${parentFlexStyle.includes('min-width:0') ? 'min-width:0' : 'min-height:0'};`
        : '';
      if (isLayoutContainerSection(sec)) {
        // 🛡️ 容器 class 语义化：中文容器名（中间图表/统计数据）映射为英文 class，
        //   否则 [^a-zA-Z0-9-] 会把中文全删光 → 退化成无语义的 c-xxx-container。
        const containerClassFor = (raw) => {
          const zh = String(raw || '');
          const MAP = {
            中间图表: 'chart',
            图表: 'chart',
            统计数据: 'stats',
            统计: 'stats',
            数据: 'data',
            列表: 'list',
            网格: 'grid',
            卡片: 'card',
            内容: 'content',
            主体: 'main',
            正文: 'body',
            侧边: 'sidebar',
            导航: 'nav',
            工具栏: 'toolbar',
            底部: 'footer',
            顶部: 'header',
          };
          for (const [k, v] of Object.entries(MAP)) {
            if (zh.includes(k)) return v;
          }
          const ascii = zh
            .replace(/^slot-?/i, '')
            .replace(/[^a-zA-Z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase();
          return ascii || null;
        };
        const containerName = containerClassFor(sec.name || sec.title || sec.id);
        const cls = containerName ? `c-${semantic}-${containerName}-con` : `c-${semantic}-container`;
        // 🛡️ 布局方向事实（2026-09-16 治本）：容器 flex 方向由 planner 的 layout 确定性给出
        //   （switch=horizontal 两 tab 一行、tabs=vertical 竖排）。直接内联到容器 div，
        //   不依赖 LLM 给容器类写样式（此前 switch-con 在 common.less 里 0 定义 → 方向丢失）。
        //
        // 🛡️ 2026-09-30 复审 P0-1：`section.layout` 取值域已扩到 **{horizontal, vertical, grid, null}**
        //   （`section-tree.js#deriveChildLayout` 只认 A 类布局事实），而这里原来是**二值三元**
        //   ⇒ `grid` 与 `null` 一律被写成 `column`。内联样式优先级高于 class 规则 ⇒ 即便
        //   `resource-mounter` 为同一 class 写了 `display:grid`，也会被内联 `display:flex;flex-direction:column`
        //   压过（「无事实不臆造」在写产物层被抵消）。
        //   四分支：horizontal→row；vertical→column；**grid→display:grid（有列数才写 repeat(N,1fr)）**；
        //           **null/未知→不内联 display 与方向**（交给 common.less / 2.11 LAYOUT-FACTS-INJECT）。
        //   ⚠️ 本分支只在**容器**（`isLayoutContainerSection`）路径生效 —— 叶子分支（见 `renderBodyNode`
        //      末尾）只输出子组件标签、不写方向，故本改动对叶子零影响。离线定量（§6-1）：真实语料
        //      容器侧 `grid=0 / null=0` ⇒ 本改动**当前零行为变化**，属堵未来。
        const rawLayout = String(sec.layout ?? '').toLowerCase();
        const layoutKind =
          rawLayout === 'horizontal' || rawLayout === 'vertical' || rawLayout === 'grid'
            ? rawLayout
            : null; // 无事实 / 未知取值 ⇒ 断言「无事实」，不臆造方向
        const isHorizontal = layoutKind === 'horizontal';
        // 列数来自 A 类事实（`section-tree#deriveChildGridColumns` 只对容器下发，见其注释）
        const gridCols = Number(sec.gridColumns);
        const displayStyle =
          layoutKind === 'grid'
            ? `display:grid;${Number.isFinite(gridCols) && gridCols > 1 ? `grid-template-columns:repeat(${gridCols},1fr);` : ''}`
            : layoutKind
              ? `display:flex;flex-direction:${isHorizontal ? 'row' : 'column'};`
              : '';
        const alignStyle = isHorizontal ? 'align-items:stretch;' : '';
        // 🛡️ P1 修复（2026-09-17）：容器 div 添加 data-section-id，让 resource-mounter 能精确匹配
        //   到递归渲染后的 DOM 层级（此前无此属性 → targetDomSelector 匹配失败 → 资源挂载丢失）。
        const sectionIdAttr = sec.id ? ` data-section-id="${sec.id}"` : '';
        // 🛡️ P5 高度传导（2026-09-17 · e0cdf905 实锤）：容器 div 必须内联 flex:1;min-height:0 ——
        //   它处于父 flex 容器内部，不内联则高度退回内容流 auto → 塌陷。
        //   🛡️ P6 合并：容器自身的 flex 比例优先用父分配的 parentFlexStyle（无分配时回退 flex:1），
        //   min 约束对齐父容器主轴（水平父→min-width:0 / 垂直父→min-height:0）。
        //   align-items:stretch 保留（水平容器交叉轴撑满高度）。
        const parentIsHorizontal = parentFlexStyle.includes('min-width:0');
        const ownFlex = consumedLayoutStyle || parentFlexStyle || `flex:1;${parentIsHorizontal ? 'min-width:0' : 'min-height:0'};`;
        // 🛡️ 刀 50（2026-10-22）：段内固有几何契约优先级最高。
        //   病灶：垂直段（面板）把**整段高度**按子项 Figma 高度比例分给子项 ⇒ 段的 padding
        //   （上留白 25 / 左留白 20）、子项间距（16/20）、底部剩余留白全部被摊进比例里，
        //   三段 161/212/265 各自摊成不同结果，实测 header 高 36/77/97（真值 41）。
        //   判据纯几何 + 命名无关，详 src/ai-engine/utils/section-intrinsic-layout.js。
        //   fail-open：任何几何事实缺失/溢出/重叠 ⇒ ok:false ⇒ 走下方既有比例行为（零行为变化）。
        const intrinsic = resolveIntrinsicLayout(sec, figmaIndex);
        __intrinsicEvaluated += 1;
        if (intrinsic.ok) __intrinsicHits += 1;
        const intrinsicPad = buildIntrinsicContainerStyle(intrinsic);
        // 🛡️ 刀 7（2026-10-27 · 8bbcf027 `36:1695` 实锤）：容器 sourceNodeIds 里未被
        //   叶子认领的可见 SOLID 底卡 ⇒ 渲染为绝对定位背景层（边锚定 + z-index:-1 沉底）。
        //   归属已在上方自底向上预分配（最近容器独占），此处只消费自己名下的层。
        //   容器需 position:relative 作定位参照；无层 ⇒ 产物逐字不变（零回归）。
        // 🛡️ 刀 7b（2026-10-27 · ad8939a5 真机实锤）：z-index:-1 的层在**未形成层叠上下文**
        //   的 relative 容器里会参与最近祖先层叠上下文 ⇒ 沉到 base-panel 面板底之下 = 不可见
        //   （CSS 涂序：负 z-index 涂在「同一层叠上下文」祖先背景之后）。isolation:isolate
        //   让容器自成层叠上下文，把 -1 层圈在容器内（高于祖先背景、低于容器内容）。
        const absorbedLayers = bgLayersByContainer.get(String(sec.id)) || [];
        const relativeStyle = absorbedLayers.length > 0 ? 'position:relative;isolation:isolate;' : '';
        lines.push(`${pad}<div class="${cls}"${sectionIdAttr} style="${ownFlex}${displayStyle}${alignStyle}${intrinsicPad}${relativeStyle}">`);
        for (const layer of absorbedLayers) {
          lines.push(
            `${pad}  <div class="c-${semantic}-absorbed-bg" data-absorbed-bg="${layer.id}" style="${buildAbsorbedBgLayerStyle(layer)}"></div>`,
          );
        }
        // 🛡️ P2 修复（2026-09-17）：水平 flex 子项按 Figma 实际宽度比例分配 flex-grow，
        //   替代旧版统一 flex:1 均分（此前 tabs 46px 和 cons 367px 被 50:50 均分，严重失真）。
        //   计算逻辑：收集所有子节点宽度 → 求和 → 每个子项 flex-grow = width / totalWidth。
        //   无宽度信息时回退 flex:1（保持向后兼容）。
        // 🛡️ P2/P3 修复（2026-09-17）：水平容器按宽度比例、垂直容器按高度比例分配 flex-grow。
        //   此前垂直容器完全没有高度约束 → 子项 collapse 到 0（8529b7e2 echarts-bar-con 高度为 0 实锤）。
        const childWidths = isHorizontal
          ? (sec.children || []).map((c) =>
              isSizeExcluded(c) ? 0 : resolveSectionFlexSize(c, figmaIndex, 'width'),
            )
          : [];
        const childHeights = !isHorizontal
          ? (sec.children || []).map((c) =>
              isSizeExcluded(c) ? 0 : resolveHeightWithTakeover(c),
            )
          : [];
        
        // 🛡️ B′（2026-09-28 · 命名无关）：命中「横向并列的同构卡片单元」判据时**等分**，
        //   而不是按各成员宽度比例分配。事故 mc-max-1790583597309-cf26267d：两个「标题+数值」
        //   单元被按文字组宽度 128/77 拉伸成 0.376/0.624 ⇒ 视觉完全失真（用户期望"两边各一张卡"）。
        //   判据见 section-tree#isHorizontalCardGroup（全语料审计：宽松版 289 命中里 0 真卡片；
        //   加固后 6/45 命中且全是同一目标行、零误伤）。任何数据缺失 ⇒ false（保持既有行为）。
        let equalizeMembers = false;
        if (isHorizontal && sec.id && figmaIndex) {
          try {
            const parentNode = figmaIndex.get(String(sec.id));
            const memberNodes = (sec.children || [])
              .map((c) =>
                figmaIndex.get(String(c?.id || c?.figmaNode || c?.figmaNodeId || '')),
              )
              .filter(Boolean);
            equalizeMembers = isHorizontalCardGroup(parentNode, memberNodes);
            __eqEvaluated += 1;
            if (equalizeMembers) __eqHits += 1;
            // 🛡️ 2026-09-29 哑火自检：B′ 实测 equalized:0，需看出「节点解析/判据」断点。
            options?.logger?.info?.('🧩 [B′] 横向卡片等分自检', {
              sectionId: sec.id,
              childrenPlan: (sec.children || []).length,
              memberResolved: memberNodes.length,
              parentResolved: !!parentNode,
              memberWidths: memberNodes.map((m) => Math.round(m?.bbox?.width || m?.absoluteBoundingBox?.width || 0)),
              equalize: equalizeMembers,
            });
          } catch {
            equalizeMembers = false;
          }
          if (equalizeMembers) {
            options?.logger?.info?.('🛡️ B′ 横向同构卡片单元 → 等分 flex', {
              sectionId: sec.id,
              children: (sec.children || []).length,
            });
          }
        }
        // 🛡️ 刀 12：垂直容器先评 2D 行簇（planRowBands：y 聚带先行）。
        // 🛡️ 刀 17a（2026-10-28 · 6bba7218 `38:3260` 实锤）：horizontal 容器对称评估
        //   planColumnGroups（x 聚组先行）——横排内含纵排组（icon ｜ 纵排文本块）
        //   此前被平铺横排（标题与数字应上下纵排）。
        //   任一子项几何不可解析 / 被 P1-B 剔除 ⇒ fail-open null ⇒ 走既有逐子项比例。
        let bandTree = null;
        if (!intrinsic.ok && (layoutKind === 'vertical' || isHorizontal) && (sec.children || []).length >= 3) {
          __rowBandEvaluated += 1;
          const entries = [];
          let bandOk = true;
          for (const c of sec.children) {
            if (isSizeExcluded(c)) { bandOk = false; break; }
            const b = resolveSectionBox(c, figmaIndex);
            if (!b) { bandOk = false; break; }
            entries.push({ ref: c, box: b });
          }
          if (bandOk) {
            bandTree = isHorizontal ? planColumnGroups(entries) : planRowBands(entries);
            if (bandTree) {
              __rowBandHits += 1;
              options?.logger?.info?.(
                isHorizontal
                  ? '🛡️ 刀 17a 2D 列簇命中：横向容器内含纵排组'
                  : '🛡️ 刀 12 2D 行簇命中：垂直容器内含横向带',
                {
                  sectionId: sec.id,
                  bands: bandTree.children.length,
                  children: (sec.children || []).length,
                },
              );
            }
          }
        }
        if (bandTree) {
          // 根方向决定兄弟轴：刀12 根=column（带间纵排按高度）、刀17a 根=row（组间横排按宽度）
          const rootIsRow = bandTree.direction === 'row';
          const bandSizes = bandTree.children.map((n) => (rootIsRow ? n.box.w : n.box.h));
          // 🛡️ 刀 17b：横排根（统计卡「icon｜纵排文本块」类）交叉轴居中判据
          //   （真值内容块中心 ≈ 容器中心 ⇒ center；填满/偏移大 ⇒ 保持 stretch 零变化）。
          //   根 group 无 wrapper ⇒ 以 align-self 落到每个直接子项（等效 align-items:center）。
          const rootCenter = rootIsRow
            ? crossAxisCenterStyle(
                bandTree.children.map((n) => n.box),
                resolveSectionBox(sec, figmaIndex),
                true,
              )
            : '';
          for (let i = 0; i < bandTree.children.length; i++) {
            // 🛡️ 刀16：带/组间兄弟间距（真值主轴差）
            const bandGap =
              i > 0
                ? siblingGapStyle(
                    bandTree.children[i - 1].box,
                    bandTree.children[i].box,
                    rootIsRow ? 'horizontal' : 'vertical',
                    0,
                    __gapGuardStats,
                  )
                : '';
            if (bandGap) __gapApplied += 1;
            renderBandNode(
              bandTree.children[i],
              indent + 1,
              (rootIsRow
                ? flexItemStyleFromWidths(bandSizes, i)
                : flexItemStyleFromHeights(bandSizes, i)) + bandGap,
              rootCenter,
            );
          }
        }
        // 🛡️ G10（2026-11-04 · a87c2ba5 实锤）：段高比例/间距**画布收敛复核**。
        //   病灶：三段 flex 0.411/2.314/0.274 + margin-top 92/59px，Σ折算 ≈708 > 画布 557
        //   不收敛 ⇒ 段盒与间距不同坐标系（段锚层级错位/跨画布取盒），反向比例+巨 margin。
        //   判据（几何恒等式）：兄弟盒真值同坐标系时 `Σ(盒高)+Σ(盒差间距) ≡ 盒跨度`，
        //   故复核等价于 `兄弟盒跨度 vs 容器盒高`；偏差 >15% ⇒ 跨坐标系错位确诊。
        //   处置：本容器**兄弟间距全部弃用**（绝对 margin 是错位最直接放大器，弃用回落
        //   自然流），flex 相对比例保留（内部自洽）；计数 ratioCanvasMismatch 恒打。
        //   根治段锚层级归位属 G3/上游锚审计，本刀只做错位拦截。
        let __canvasMismatch = false;
        let __ratioMismatch = false; // G10v2：本容器比例不可信 ⇒ 不写 flex / 不写间距
        let __columnDenominator = 0; // G10v2：flex 分母 = Σ子项高 + Σ兄弟间距（让出 margin 份额）
        if (!intrinsic.ok && !isHorizontal && (sec.children || []).length >= 2) {
          const __cbox = resolveSectionBox(sec, figmaIndex);
          const __cboxes = sec.children.map((c) => resolveSectionBox(c, figmaIndex));
          if (__cbox && Number.isFinite(__cbox.h) && __cbox.h > 0 && __cboxes.every(Boolean)) {
            const __minY = Math.min(...__cboxes.map((b) => b.y));
            const __maxEnd = Math.max(...__cboxes.map((b) => b.y + b.h));
            const __span = __maxEnd - __minY;
            if (Number.isFinite(__span) && Math.abs(__span - __cbox.h) / __cbox.h > 0.15) {
              __canvasMismatch = true;
              __canvasMismatchCount += 1;
              options?.logger?.warn?.('🛡️ G10 画布收敛复核拦停：兄弟盒跨度与容器盒高偏差超阈，段间距弃用', {
                sectionId: sec.id,
                span: Math.round(__span),
                containerH: Math.round(__cbox.h),
                deviance: `${Math.round(Math.abs(__span - __cbox.h) / __cbox.h * 100)}%`,
              });
            }
            // 🛡️ G10 v2：Σ(子项真值高 + 兄弟间距) vs 容器高 —— 抓 v1 盲区
            //   （flex 归一化后 Σ=1 永远"收敛"，但再叠 margin 就溢出容器）。
            const __gapsNumeric = [];
            for (let gi = 1; gi < sec.children.length; gi += 1) {
              const pb = resolveSectionBox(sec.children[gi - 1], figmaIndex);
              const cb = resolveSectionBox(sec.children[gi], figmaIndex);
              if (!pb || !cb) continue;
              const prevExtent = Math.max(pb.h, childHeights[gi - 1] || 0);
              const gapPx = cb.y - (pb.y + prevExtent);
              if (Number.isFinite(gapPx) && gapPx > 0) __gapsNumeric.push(Math.round(gapPx));
            }
            __ratioCanvasGroups += 1;
            __columnDenominator =
              childHeights.reduce((a, h) => a + (Number(h) || 0), 0) +
              __gapsNumeric.reduce((a, g) => a + g, 0);
            const __conv = evaluateColumnCanvasConvergence({
              containerH: __cbox.h,
              childHeights,
              gaps: __gapsNumeric,
            });
            if (__conv.mismatch) {
              __ratioMismatch = true;
              __ratioCanvasMismatch += 1;
              options?.logger?.warn?.(
                '🛡️ G10v2 比例不收敛：Σ子项高+Σ间距 与容器高偏差超阈 ⇒ 弃用 flex 与间距（回落自然流）',
                {
                  sectionId: String(sec.id ?? ''),
                  sumH: Math.round(__conv.sumH),
                  sumGap: Math.round(__conv.sumGap),
                  containerH: Math.round(__conv.containerH),
                  deviance: `${Math.round(__conv.deviance * 100)}%`,
                },
              );
            }
          }
        }
        for (let i = 0; !bandTree && i < (sec.children || []).length; i++) {
          const child = sec.children[i];
          // 🛡️ P0/P2/P3（2026-09-17）：子项按 Figma 宽度/高度比例分配 flex-grow，
          //   解决「统一 flex:1 均分失真」与「无约束 collapse 到 0」。
          //   🛡️ P6 合并：比例不再包 wrapper，直接传给子节点内联到其自身标签。
          // 🛡️ 刀 50：固有几何命中时用「固定高度 + 间距」，比例分配在此分支被完全取代
          //   （两者表达的是互斥的世界观：比例 = 拉伸填满，固定 = 真值 + 剩余留白）。
          if (intrinsic.ok) {
            renderBodyNode(child, indent + 1, buildIntrinsicChildStyle(intrinsic, i));
          } else if (isHorizontal) {
            const flexStyle = equalizeMembers
              ? 'flex:1;min-width:0;'
              : flexItemStyleFromWidths(childWidths, i);
            // 🛡️ 刀16：横向兄弟间距（真值 x 差）
            //   🔴 刀16b：prev 基准与 flex 同源（childWidths = resolveSectionFlexSize 口径）
            const prevBox = i > 0 ? resolveSectionBox(sec.children[i - 1], figmaIndex) : null;
            const g =
              i > 0
                ? siblingGapStyle(prevBox, resolveSectionBox(child, figmaIndex), 'horizontal', childWidths[i - 1], __gapGuardStats)
                : '';
            if (g) __gapApplied += 1;
            if (g && prevBox && childWidths[i - 1] > prevBox.w) __gapRebased += 1;
            renderBodyNode(child, indent + 1, flexStyle + g);
          } else {
            // 🛡️ G10v2：① 不收敛 ⇒ 不写 flex（回落自然流，保 min-height:0）；
            //   ② 收敛时分母用「Σ子项高 + Σ兄弟间距」⇒ flex 之和 < 1，剩余份额正好留给 margin，
            //   不再出现「比例 100% + 43px 间距」的必然溢出。
            const flexStyle = __ratioMismatch
              ? 'min-height:0;'
              : flexItemStyleFromHeights(childHeights, i, __columnDenominator > 0 ? __columnDenominator : undefined);
            // 🛡️ 刀16：纵向兄弟间距（真值 y 差）
            //   🔴 刀16b：prev 基准与 flex 同源（childHeights = figmaHeightPx > 段盒高度时取前者）
            //   🔴 G10：画布不收敛（跨坐标系错位）⇒ 间距弃用（绝对 margin 是错位最大放大器）
            const prevBox = i > 0 ? resolveSectionBox(sec.children[i - 1], figmaIndex) : null;
            const g =
              i > 0 && !__canvasMismatch && !__ratioMismatch
                ? siblingGapStyle(prevBox, resolveSectionBox(child, figmaIndex), 'vertical', childHeights[i - 1], __gapGuardStats)
                : '';
            if (g) __gapApplied += 1;
            if (g && prevBox && childHeights[i - 1] > prevBox.h) __gapRebased += 1;
            renderBodyNode(child, indent + 1, flexStyle + g);
          }
        }
        lines.push(`${pad}</div>`);
      } else if (sec) {
        // 🛡️ P6 合并：叶子子组件标签直接内联父分配的比例（parentFlexStyle）。
        //   Vue3 组件标签上的 style 经 attrs 继承透传到子组件根元素，子组件根
        //   自身就是 flex item，无需 wrapper 中转。无分配时回退 flex:1;min-height:0
        //   （顶层叶子直挂 slot-con 的兜底，slot-con 是 column 容器）。
        const leafStyle = consumedLayoutStyle || parentFlexStyle || 'flex:1;min-height:0;';
        // 🛡️ 方案 E（2026-11-14 用户硬约束）：段高**不进 inline**（px2rem 不处理 inline style），
        //   改由 `class="c-…-sech-i"` 承载，规则写进 index.vue 的 `<style lang="less" scoped>`
        //   （less 里的 px 会被 postcss-pxtorem 转 rem，大屏适配才成立）。
        //   inline 仍保留比例（无尺寸，合规），class 规则用 !important 覆盖它。
        const _clsAttr = extraClass ? ` class="${extraClass}"` : '';
        lines.push(`${pad}<${tagFor(sec, 'ContentSection')}${_clsAttr} style="${leafStyle}" />`);
      }
    };
    // 🛡️ 刀 12（2026-10-27 · ad8939a5 `801:3` 实锤）：2D 行簇渲染。
    //   病灶：垂直容器把「左图右文」横向带与纵流子段**一起纵切**（img 拉通栏、
    //   FIXED 72×22 的 pill `36:1722` 被拉成 100% 宽条）。真值是 2D 复合：
    //   纵流的某些带内部是横向排列。判据单一来源 `utils/row-band-cluster.js`
    //   （纯几何 XY-cut，fail-open null ⇒ 走既有比例路径，零行为变化）。
    //   带/组用匿名 wrapper div（无 data-section-id）：section 身份不变，
    //   覆盖率/接管/资源挂载等全部守卫零影响；叶子的渲染仍走 renderBodyNode。
    //   🛡️ 刀 17b：alignSelf（如 'align-self:center;'）逐子项透传——根 group 无 wrapper
    //   （根方向与容器 div 主轴一致、由容器承载），交叉轴居中只能落在各直接子项上
    //   （align-self 覆盖容器 stretch，逐项 = 等效 align-items）。
    const renderBandNode = (node, indent, flexStyle, alignSelf = '') => {
      const pad = '      ' + '  '.repeat(indent);
      if (!node || !Array.isArray(node.children)) {
        renderBodyNode(node && node.ref, indent, flexStyle + alignSelf);
        return;
      }
      const isRowBand = node.direction === 'row';
      const sizes = node.children.map((ch) => (isRowBand ? ch.box.w : ch.box.h));
      lines.push(
        `${pad}<div class="c-${semantic}-band" style="${flexStyle}${alignSelf}display:flex;flex-direction:${node.direction};${isRowBand ? 'align-items:stretch;' : ''}">`,
      );
      // 🛡️ S4：带内兄弟同样先把间距算进分母（否则 row 带横向溢出、column 组纵向溢出）
      const __bandGaps = node.children.map((_, i) =>
        i > 0
          ? siblingGapPx(
              node.children[i - 1].box,
              node.children[i].box,
              isRowBand ? 'horizontal' : 'vertical',
              0,
              __gapGuardStats,
            )
          : 0,
      );
      const __bandGapSum = __bandGaps.reduce((a, g) => a + (Number(g) || 0), 0);
      const __bandDen = sizes.reduce((a, v) => a + (Number(v) || 0), 0) + __bandGapSum;
      if (__bandGapSum > 0) __gapDenominatorApplied += 1;
      for (let i = 0; i < node.children.length; i++) {
        // 🛡️ 刀16：带内兄弟间距（row 带看 x 差、column 组看 y 差）
        const __gpx2 = __bandGaps[i] || 0;
        const innerGap = __gpx2 > 0 ? `${isRowBand ? 'margin-left' : 'margin-top'}:${Math.round(__gpx2)}px;` : '';
        if (innerGap) __gapApplied += 1;
        renderBandNode(
          node.children[i],
          indent + 1,
          (isRowBand
            ? flexItemStyleFromWidths(sizes, i, __bandDen > 0 ? __bandDen : undefined)
            : flexItemStyleFromHeights(sizes, i, __bandDen > 0 ? __bandDen : undefined)) + innerGap,
          // 居中只作用根的直接子项（嵌套组不再继承——组内对齐由组自身判据决定）
          '',
        );
      }
      lines.push(`${pad}</div>`);
    };
    // 🛡️ 顶层 section 高度比例（2026-09-28 · c-traffic-monitor-afd08494 实锤）：
    //   此前 `renderBodyNode(root, 0)` **不传 parentFlexStyle** → 顶层节点一律走
    //   `ownFlex = 'flex:1;...'` 兜底 → **多个顶层 section 被等分**。实测 slot-当日总流量/
    //   slot-车型分布/slot-流量预测 设计高 556/142/174（≈0.636/0.163/0.199），产物三个都 flex:1。
    //   与容器内子项**同口径**：按 Figma 高度（几何事实，非硬编码）归一化分配 flex-grow。
    //   ⚠️ 安全性：`flexItemStyleFromHeights` 在「取不到高度」时返回 `flex:1`（与旧行为逐字相同），
    //   故无几何事实的组件零变化；仅当高度可解析时才产生比例。
    // 顶层容器只要仍含 body 后代就保留；入槽叶由 renderBodyNode 按同一契约跳过。
    const topBodyRoots = structureContract.bodyRoots;
    if (topBodyRoots.length > 1) {
      const topHeights = topBodyRoots.map((s) =>
        isSizeExcluded(s) ? 0 : resolveHeightWithTakeover(s),
      );
      // 🛡️ S4（2026-11-14）：先算兄弟间距，再定 flex 分母。
      //   病灶：`flex:<h/Σh>` 之和恒为 1，再叠 `margin-top` ⇒ 总高 = 容器 + Σgap ⇒ 溢出
      //   （真机 101px/807）。分母改为 `Σh + Σgap`：Σflex < 1，剩余份额正好容纳 margin。
      const __topGaps = topBodyRoots.map((_, i) => {
        if (i === 0) return 0;
        const prevB = resolveSectionBox(topBodyRoots[i - 1], figmaIndex);
        const curB = resolveSectionBox(topBodyRoots[i], figmaIndex);
        return siblingGapPx(prevB, curB, 'vertical', topHeights[i - 1], __gapGuardStats);
      });
      const __topGapSum = __topGaps.reduce((a, g) => a + (Number(g) || 0), 0);
      const __topDen =
        topHeights.reduce((a, h) => a + (Number(h) || 0), 0) + __topGapSum;
      if (__topGapSum > 0) __gapDenominatorApplied += 1;
      // 🛡️ px basis 护栏：Σ(真值高+间距) 占设计容器高的比例太低 ⇒ 说明分段退化/内容缺失，
      //   这时用 basis 会留下大片空白，退回比例填满更稳；同时计数便于发现「分段退化」样本。
      // 设计容器高用「子项盒跨度」近似（不依赖根节点 id）：span = max(bottom) − min(top)。
      const __topBoxes = topBodyRoots
        .map((s) => resolveSectionBox(s, figmaIndex))
        .filter(Boolean);
      const __designH = __topBoxes.length
        ? Math.max(...__topBoxes.map((b) => b.y + b.h)) - Math.min(...__topBoxes.map((b) => b.y))
        : 0;
      const __basisRatio =
        __designH > 0
          ? (topHeights.reduce((a, h) => a + (Number(h) || 0), 0) + __topGapSum) / __designH
          : 1;
      const __basisOk = __basisRatio >= 0.85;
      if (!__basisOk) __pxBasisFallback += 1;
      for (let i = 0; i < topBodyRoots.length; i++) {
        // 🛡️ 刀16：顶层兄弟纵向间距（真值 y 差）
        //   🔴 刀16b：prev 基准与 flex 同源 —— topHeights[i-1] 就是该兄弟拿到的分配高度
        //   （`resolveSectionFlexSize` 优先 figmaHeightPx）。实测 `2:3559`(标题 h=24 / 段高 556)
        //   → `2:3570`：旧算法 737−(162+24)=551（把 556 正文又算一遍），修正后 737−(162+556)=19。
        const prevTopBox =
          i > 0 ? resolveSectionBox(topBodyRoots[i - 1], figmaIndex) : null;
        const __gpx = __topGaps[i] || 0;
        const topGap = __gpx > 0 ? `margin-top:${Math.round(__gpx)}px;` : '';
        if (topGap) __gapApplied += 1;
        if (topGap && prevTopBox && topHeights[i - 1] > prevTopBox.h) __gapRebased += 1;
        // 🛡️ 方案 E：真值高写进 class 规则（less ⇒ px2rem 转换），模板只挂 class。
        //   仅叶子段参与（容器段要改结构，风险大），非叶子计 `pxHeightSkipped`。
        let _secCls = '';
        const _h = Number(topHeights[i]) || 0;
        if (_h > 0 && !isLayoutContainerSection(topBodyRoots[i])) {
          _secCls = `c-${semantic}-sech-${i + 1}`;
          __secHeightRules.push({
            cls: _secCls,
            h: Math.round(_h),
            gap: Math.round(__topGaps[i] || 0),
          });
        } else if (_h > 0) {
          __pxHeightSkipped += 1;
        }
        renderBodyNode(
          topBodyRoots[i],
          0,
          flexItemStyleFromHeights(
            topHeights,
            i,
            __topDen > 0 ? __topDen : undefined,
            !__basisOk,
          ) + topGap,
          _secCls,
        );
      }
    } else {
      for (const root of topBodyRoots) renderBodyNode(root, 0);
    }
    lines.push(`    </div>`);
  }
  lines.push(`  </base-panel>`);
  lines.push(`</template>`);
  // 🛡️ P0 生效自检（2026-09-28）：B′ 此前只在命中时落日志 ⇒ 0 命中时无法区分「没跑/跑了没命中」。
  //   这里在确定性装配收尾统一落一行「已评估」（计数：横向容器数 + 命中等分数）。
  if (options?.logger?.info) {
    options.logger.info('🛡️ B′ 横向同构卡片单元·已评估', {
      horizontalContainers: __eqEvaluated,
      equalized: __eqHits,
    });
    // 🛡️ 刀 50 生效自检：`evaluated` 是「进入容器分支的段数」（本实现里含叶子前的所有容器
    //   都会评估，含 horizontal/grid/单子项等 fail-open 情形），`applied` 才是真正改写段内几何的段数。
    // 🛡️ G10v2 生效自检（0 也打）：`groups` = 进入「Σ子项高+Σ间距 vs 容器高」复核的竖排容器数；
    //   `mismatch` = 判比例不可信并弃用 flex 的容器数（>0 = 真有容器被拦下，
    //   与「没跑」用 groups 区分）。本刀只拦不修：段锚归位属 G3/上游。
    // 🛡️ S4：间距已计入 flex 分母的容器数（0 也打）
    options.logger.info('🛡️ S4 间距计入 flex 分母·已评估', {
      gapDenominatorApplied: __gapDenominatorApplied,
      gapApplied: __gapApplied,
    });
    // 🛡️ P0-10：px basis 生效/退避计数（0 也打 —— 辨「没命中」与「没生效」）
    options.logger.info('🛡️ P0-10 段高 px basis·已评估', {
      pxBasisFallback: __pxBasisFallback,
      pxBasisEnabled: USE_PX_BASIS(),
    });
    options.logger.info('🛡️ G10v2 段高比例画布收敛·已评估', {
      groups: __ratioCanvasGroups,
      mismatch: __ratioCanvasMismatch,
      canvasMismatchV1: __canvasMismatchCount,
    });
    options.logger.info('🛡️ 刀 50 段内固有几何·已评估', {
      evaluated: __intrinsicEvaluated,
      applied: __intrinsicHits,
    });
    // 🛡️ 刀 7 生效自检：`candidates` = 容器里「未认领且类型为 RECTANGLE」的节点数，
    //   `layers` = 真正出层的背景数（其余被 fill/bbox/越界判掉）。0/0 也要落行。
    //   `scrollbarExempted`（刀 20c-R）= 因「形态条状 + 名确指滚动条」被豁免的吸收数；
    //   0 = 无滚动条真值（正常），与「跑没跑」用 candidates 区分。
    options.logger.info('🛡️ 刀 7 容器吸收背景层·已评估', {
      candidates: __absorbedBgCandidates,
      layers: __absorbedBgLayers,
      scrollbarExempted: __absorbedBgScrollbarExempted,
    });
    // 🛡️ 刀 7c 生效自检（2026-11-03）：`candidates` = 非容器段经「直系子枚举」后
    //   「未认领且 type=RECTANGLE」的节点数（0 = 无直系子可枚举 / 全被认领）；
    //   `rootHostSections` = 通过几何护栏（盒 ≡ 图根盒 ±2px）并注入根 div 的段数（0/1，
    //   ≥2 已 fail-open 降级到 deferred）；`layers` = 注入的层数；
    //   `deferred` / `deferredSections` = 几何不自洽而未注入的层数与段 id
    //   （**>0 = 有已知挂账，可诊断，非静默放水**）。0/0/0/[] 也要落行。
    options.logger.info('🛡️ 刀 7c 根级宿主吸收背景层·已评估', {
      candidates: __absorbedBgRootHostCandidates,
      rootHostSections: rootHostLayers.length ? 1 : 0,
      layers: __absorbedBgRootHostLayers,
      deferred: __absorbedBgRootHostDeferred,
      deferredSections: rootHostDeferredSectionIds,
    });
    // 🛡️ 刀 12 生效自检：`evaluated` = 进入评估的垂直容器数（≥3 子项才评），
    //   `applied` = 真判出 2D 行簇并改写的容器数。0/0 也要落行。
    options.logger.info('🛡️ 刀 12 2D 行簇重建·已评估', {
      evaluated: __rowBandEvaluated,
      applied: __rowBandHits,
    });
    // 🛡️ 刀 16 生效自检：`applied` = 真正注入兄弟 margin 的位置数（0 = 全贴合/缺几何）；
    //   `rebased` = 其中「prev 基准从段盒上移到 flex 同源高度」的数量（刀16b 修双计；0 也打）。
    options.logger.info('🛡️ 刀 16 兄弟间距真值注入·已评估', {
      applied: __gapApplied,
      rebased: __gapRebased,
      // 🛡️ G1：异常间距守卫（≥100px 不注入）——0 也要落行，验收判据「异常 margin 归零」由此观测
      guarded: __gapGuardStats.guarded,
      // 🛡️ G10：画布收敛复核拦停数（0 也打；>0 ⇒ 有容器段盒跨坐标系错位被拦，段锚审计输入）
      ratioCanvasMismatch: __canvasMismatchCount,
    });
    // 🛡️ P1-B 生效自检：`takeoverLeaves` = 接管器评估到的叶数（0 ⇒ 判据没跑或无可接管段，
    //   与「跑了但无抑制成员」区分）；`excluded` = 真正从 flex 分母剔除的成员数。
    options.logger.info('🛡️ P1-B 抑制成员 flex 分母剔除·已评估', {
      takeoverLeaves: __p1bTakeoverLeaves,
      excluded: suppressedSectionIds.size,
      ids: [...suppressedSectionIds],
    });
    options.logger.info('🛡️ 接管高度回填·已评估', {
      candidates: takeoverHeightBySectionId.size,
      applied: __takeoverHeightFallbacks,
    });
  }
  // 🛡️ 方案 E：段高样式片段（less 语法，px 由 postcss-pxtorem 转 rem）。
  //   !important 用于压过模板上的比例内联样式（内联无尺寸，只承载比例与方向）。
  const layoutStyle = __secHeightRules
    .map(
      (r) =>
        `  .${r.cls} { flex: 0 1 ${r.h}px !important; min-height: 0${r.gap > 0 ? `; margin-top: ${r.gap}px !important` : ''}; }`,
    )
    .join('\n');
  return { template: lines.join('\n'), rootContainerClass, sectionRoots, componentFiles, layoutStyle, pxHeightSkipped: __pxHeightSkipped };
}

/**
 * 刀14（2026-10-27 · mc-3538d75b 实锤）：根 <template> 块嵌套计数配对定位。
 *
 * 病灶：旧实现用非贪婪正则 /<template\b[^>]*>[\s\S]*?<\/template>/i 定位根模板块，
 * LLM 的 index.vue 模板内含 base-panel 插槽（`<template #header_right>…</template>`）时，
 * 正则截断在**插槽的 `</template>`** 处（实锤产物第 8 行），只替换了第 1–8 行；
 * 原模板剩余部分（`</div>`×3、`</base-panel>`、收尾 `</template>`）整段残留在确定性骨架之后，
 * `stripSurplusBlockClosers` 只剔 `</template>` 不管 `</div>` ⇒ SFC 47:8/48:6/49:4
 * Invalid end tag，重试 2/2 耗尽 fail-closed（同结构三次复现）。
 *
 * 修法：从第一个顶层 `<template>` 起按 `<template\b…>` / `</template>` 计数配对，
 * 深度归 0 处才是根块真正边界；配对不上（模板本身残缺）→ 返回 null，调用方 fail-open。
 * 自闭合 `<template … />` 不占深度。
 *
 * @param {string} src Vue SFC 全文
 * @returns {{start:number, end:number}|null} 根 <template>…</template> 的字符区间
 */
export function findRootTemplateBlock(src) {
  const openRx = /<template\b[^>]*>/i;
  const m = openRx.exec(src);
  if (!m) return null;
  const tokenRx = /<template\b[^>]*>|<\/template\s*>/gi;
  tokenRx.lastIndex = m.index;
  let depth = 0;
  let t;
  while ((t = tokenRx.exec(src)) !== null) {
    if (t[0].charAt(1) === '/') {
      depth--;
      if (depth === 0) return { start: m.index, end: tokenRx.lastIndex };
    } else if (!/\/\s*>$/.test(t[0])) {
      depth++;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ #19（2026-11-12 · mc-max-1794456460380-1efe65a2 实锤）：装配层「同段交互接管」
//
// 病灶（真机，非推理）：
//   ① LLM 生成 index.vue 时按自己的命名产出段组件 —— `#header_right` slot 装 `TabSwitchBar`
//      （带 @click 切换态）、内容区装 `TodaySummary` / `StatsCardRow`，并把三个文件写盘；
//   ② `applyDeterministicIndexTemplate` 把 `<template>` 段整体换成 effectiveSections 派生的
//      确定性骨架，段组件改用 `assignSectionComponentNames` 的命名（HeaderSection /
//      ContentSection / StatsSection），而骨架只做**静态渲染**（`2:7954` 渲成 fg-grid 静态 pill 组）；
//   ③ LLM 那三个组件随即成为「规划外引用」被 prune，文件被清理 ⇒ 产物零 `@click`
//      ⇒ 面板无任何交互（用户可见症状「依旧没有交互」）。
//
// 判据（可辩驳、单一事实源；本函数只出决策，不改产物）：
//   某 LLM 组件 `X` 满足全部条件时，判定「应与骨架段组件 `Y` 互换」：
//     a) `data-section-id` ∈ X 的段 id 集，且与某 sectionRoot.id 相等（**同段**，非语义猜测）；
//     b) X 的文件已落在 `package/components/X.vue`（真实产物，非臆造引用）；
//     c) X 含交互语义（`@click` / `v-model` / `@change` …）；
//     d) 骨架该 sectionRoot 的段组件 `Y` 未含交互语义（内容未知 ⇒ 视为无交互）；
//     e) `Y` 在骨架 template 里被真实引用（否则无可替换主语）。
//   任一不满足 ⇒ 不接管（**零行为变更**）。同段仅允许一个接管（首个命中胜）。
//
// ⚠️ 边界：只在「LLM 有交互、骨架无交互」时接管 ⇒ 视觉精确的确定性渲染默认保留；
//    接管后几何/样式来自 LLM 组件，存在**视觉与真值偏差**风险（运行期日志落痕，可回滚）。
//
// ⚠️ 与刀 53（折叠网格确定性接管）/ 刀 66（同构段收敛）的关系（**无需额外互斥代码**，勿再补守卫）：
//   两者都以「装配后 index.vue 派生的 `subComps`」为唯一门（`subComps.includes(subPath)`，
//   microcode-engineer.js:2345 / :2440 / :2449）。本函数把骨架 template 的标签名 From 换成 To 后，
//   `_detectSubComponents` + `pruneDeadSubComponentImports`（本函数内已跑完）使 From 不再被引用
//   ⇒ From 不进 subComps ⇒ 刀 53 不再写 `From.vue`、刀 66 不再包 `From.vue`。
//   「一段只物化一个组件」由 subComps 这一份事实源自动成立，无需第二处判据（否则判据两份必漂移）。
//
// ⚠️ 不变式：判据 c 已要求「`package/components/<To>.vue` 存在且非空」，而 applier 读的是**同一个**
//   `componentContents` 对象 ⇒ 「判据命中但取不到内容」不可达。故 applier 不设「整体放弃」分支
//   （死分支当作防线 = 假绿），只做逐条过滤并**只返回已生效的接管**。
// ─────────────────────────────────────────────────────────────────────────────

/** 交互语义探测（v-on / v-model / 常用事件绑定）。 */
const INTERACTION_RE =
  /@click|@change|@input|@keyup|@keydown|@select\b|@update:|@mouseenter|@mouseleave|@touchstart|v-model|v-on:/;

/** 该 SFC 全文/片段是否含交互语义。 */
export function hasInteractionSemantics(content) {
  return INTERACTION_RE.test(String(content || ''));
}

/** 提取内容里全部**静态** `data-section-id`（字符串化）。
 *  🔴 只认属性名前一字符为空白/引号/`/`/`>` 的形态 ⇒ `:data-section-id="card.sectionId"`
 *     （动态绑定，真机 StatsCardRow.vue 即有此写法）**不算**段归属声明，否则会把表达式文本
 *     当成段 id 混进集合（判据假阳性的来源）。 */
export function extractSectionIds(content) {
  const ids = new Set();
  for (const m of String(content || '').matchAll(/(?:^|[\s"'/>])data-section-id=["']([^"']+)["']/g)) {
    ids.add(String(m[1]));
  }
  return ids;
}

/**
 * 采集模板里引用的子组件名（PascalCase 标签 + `:is="X"`）。
 * 与 `resource-mounter#pruneDeadSubComponentImports` 的 used 采集同口径（单一来源精神）。
 */
export function collectTemplateSubComponentRefs(template) {
  const tpl = typeof template === 'string' ? template : '';
  const refs = new Set();
  for (const m of tpl.matchAll(/<([A-Z][\w]*)\b/g)) refs.add(m[1]);
  for (const m of tpl.matchAll(/:is\s*=\s*["']([A-Za-z_$][\w$]*)["']/g)) refs.add(m[1]);
  return refs;
}

/** 取 SFC 全文中根 `<template>` 块（无则空串）。 */
function templateBlockOf(src) {
  const b = findRootTemplateBlock(src);
  return b ? src.slice(b.start, b.end) : '';
}

/**
 * 同段交互接管决策（纯函数：只读入参，不读盘、不改入参）。
 * @param {{ llmTemplate?: string, planTemplate?: string,
 *           sectionRoots?: Array<{id:string|number, component:string}>,
 *           componentContents?: Object }} input
 *   llmTemplate:  LLM 生成的 index.vue 全文（覆盖前）
 *   planTemplate: 确定性骨架 template 段
 *   sectionRoots: 骨架透出的段 ↔ 组件映射（`[{id, component, type}]`）
 *   componentContents: 写盘文件表（读 `package/components/<X>.vue`）
 * @returns {Array<{sectionId:string, from:string, to:string}>}
 */
export function pickSameSectionInteractiveTakeovers({
  llmTemplate,
  planTemplate,
  sectionRoots,
  componentContents,
} = {}) {
  const contents =
    componentContents && typeof componentContents === 'object' ? componentContents : {};
  const readComp = (name) => {
    const v = contents[`package/components/${name}.vue`];
    return typeof v === 'string' ? v : '';
  };
  const planRefs = collectTemplateSubComponentRefs(planTemplate || '');
  const llmRefs = collectTemplateSubComponentRefs(templateBlockOf(llmTemplate || ''));
  const out = [];
  const used = new Set();
  for (const root of Array.isArray(sectionRoots) ? sectionRoots : []) {
    if (!root || !root.component || root.id == null) continue;
    const from = String(root.component);
    // e) 骨架必须真实引用该段组件
    if (!planRefs.has(from)) continue;
    // d) 骨架段组件已带交互 ⇒ 不接管（不拿另一个交互组件去换）
    if (hasInteractionSemantics(readComp(from))) continue;
    const sectionId = String(root.id);
    // a/b/c) LLM 侧候选：非骨架引用、文件存在、同段、带交互
    const to = [...llmRefs].find((name) => {
      if (planRefs.has(name) || used.has(name)) return false;
      const c = readComp(name);
      if (!c || !hasInteractionSemantics(c)) return false;
      return extractSectionIds(c).has(sectionId);
    });
    if (!to) continue;
    used.add(to);
    out.push({ sectionId, from, to });
  }
  return out;
}

/**
 * 按接管决策替换骨架 template 中的段组件标签（`<From … />` / `</From>` → `<To … />`）。
 * 只替换**标签名**，属性/顺序/层级一律不动（几何锚点由骨架保持）。
 */
export function applySectionTakeovers(template, takeovers) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = String(template || '');
  for (const t of Array.isArray(takeovers) ? takeovers : []) {
    if (!t || !t.from || !t.to || t.from === t.to) continue;
    out = out.replace(new RegExp(`<${esc(t.from)}(?=[\\s/>])`, 'g'), `<${t.to}`);
    out = out.replace(new RegExp(`</${esc(t.from)}\\s*>`, 'g'), `</${t.to}>`);
  }
  return out;
}

/**
 * 🛡️ B（#719 主线 · 2026-09-26 · mc-max-1790420477334-6e065bd7 实锤）
 *
 * 病灶：deterministic 模板装配只挂在 **complex** 分支（`generateIndexVue`）。simple/medium
 * 分支的 `package/index.vue` 由 LLM 通过 `_buildChunkMiddle` **整文件**生成 → 完全不经过
 * `buildDeterministicIndexTemplate` → 模板子元素顺序/层级由模型即兴决定，与 planner 的
 * `effectiveSections` 顺序脱钩。
 * 实锤：facts 顺序为 `tabs(89:42) → chart-section`，产物写成 `<EnvMonitorChart/> → <EnvMonitorTabs/>`
 * （tabs 被挪到末尾、且丢失 tabs 自身容器层级），与该任务 checkpoint 离线重放出的确定性骨架
 * （`TabsSection → ContentSection → ChartSection`）完全不一致。
 *
 * 治本：**「装配」与「填值」分离** —— 保留 LLM 的 `<script>`（业务逻辑仍需模型填），
 * 仅把 `<template>` 段整体替换为 `effectiveSections` 派生的确定性骨架，与 complex 分支同源同构。
 * 替换后按模板标签补齐子组件 import，并清掉因此变死的旧 import（ensure/prune 对称）。
 *
 * 纯函数（不读盘、不改入参），失败一律保留 LLM 原样并给出 reason，绝不 fail-closed。
 *
 * @param {string} content LLM 生成的 index.vue 全文
 * @param {Object} input 生成上下文（含 generationInput.componentPlan / subComponentPlan）
 * @param {Object} [options] { logger, componentContents }
 *   componentContents: 写盘文件表（`package/components/<X>.vue`）—— #19 同段交互接管的唯一事实源。
 * @returns {{content: string, applied: boolean, facts: Object|null, reason?: string,
 *            takeovers: Array<{sectionId:string,from:string,to:string}>,
 *            takeoverFiles: Object<string,string>}}
 *   takeovers/takeoverFiles：本次**已生效**的同段交互接管决策（两者条目一一对应）与「必须保产物」的
 *   LLM 组件内容（调用方须**跳过**这些子组件的 LLM 重新生成，否则会被覆盖 ⇒ 交互丢失）。
 *   未生效（判据未命中 / 取不到内容）的接管**不出现**在返回值里 ⇒ 调用方据此判定 0 命中即零行为变更。
 */

/**
 * 🛡️ 方案 E（2026-11-14 · 用户硬约束「DOM 上不允许直接写尺寸」）：把段高 less 规则注入 index.vue。
 *
 * 为什么不能 inline：项目用 `postcss-pxtorem`（vite.config.js）把 **less/css 里的 px → rem**，
 *   inline style 不经过 postcss ⇒ px 永不转换 ⇒ 大屏适配失效。
 * 注入位置：已有的 `<style lang="less" scoped>` 块末尾（没有则追加一个），与既有 `@import` 并存。
 *
 * @param {string} content index.vue 内容
 * @param {string} rules less 规则片段（可多行，已缩进）
 * @returns {string}
 */
export function injectLayoutStyle(content, rules) {
  if (typeof content !== 'string' || !content || !rules || !String(rules).trim()) return content;
  // 已在末尾则不重复注入（幂等：apply 可能被多轮调用）
  if (content.includes('mvgo-layout-truth')) return content;
  const payload = `\n  /* mvgo-layout-truth：段高真值（px 由 postcss-pxtorem 转 rem，勿改为 inline） */\n${rules}\n`;
  const styleRe = /<style\b[^>]*lang=["']less["'][^>]*>([\s\S]*?)<\/style>/i;
  const m = content.match(styleRe);
  if (m) {
    const body = m[1].replace(/\s*$/, '\n');
    const replaced = `<style lang="less" scoped>${body}${payload}</style>`;
    return content.replace(styleRe, replaced);
  }
  // 无 less style 块 ⇒ 追加一个（scoped：段 class 只作用于本组件模板元素）
  return `${content.replace(/\s*$/, '')}\n\n<style lang="less" scoped>${payload}</style>\n`;
}

export function applyDeterministicIndexTemplate(content, input, options = {}) {
  const src = typeof content === 'string' ? content : '';
  if (!src) return { content: src, applied: false, facts: null, reason: 'empty-content' };

  const block = findRootTemplateBlock(src);
  if (!block) {
    const hasOpen = /<template\b[^>]*>/i.test(src);
    return {
      content: src,
      applied: false,
      facts: null,
      reason: hasOpen ? 'template-unbalanced' : 'no-template-block',
    };
  }

  let det = null;
  try {
    det = buildDeterministicIndexTemplate(input, options);
  } catch (e) {
    options.logger?.warn?.('🛡️ 确定性模板装配异常，保留 LLM 模板', { error: e?.message });
    return { content: src, applied: false, facts: null, reason: 'build-failed' };
  }
  if (!det || !det.template) {
    return { content: src, applied: false, facts: null, reason: 'no-plan-sections' };
  }

  // 🛡️ #19（2026-11-12 · mc-max-1794456460380-1efe65a2 实锤）：同段交互接管。
  //   覆盖前先算「LLM 交互段组件 ↔ 骨架同段静态组件」互换（判据见
  //   `pickSameSectionInteractiveTakeovers` 头注释）。未命中 ⇒ 逐字走旧路径（零行为变更）。
  //   实际接管需要该 LLM 组件的**内容**（写盘/保产物都要用）⇒ 内容缺失则整体放弃，
  //   绝不改出悬空标签（fail-open 保确定性骨架）。
  const takeovers = pickSameSectionInteractiveTakeovers({
    llmTemplate: src,
    planTemplate: det.template,
    sectionRoots: det.sectionRoots,
    componentContents: options.componentContents,
  });
  const _contents =
    options.componentContents && typeof options.componentContents === 'object'
      ? options.componentContents
      : {};
  const takeoverFiles = {};
  const appliedTakeovers = [];
  for (const t of takeovers) {
    const p = `package/components/${t.to}.vue`;
    const c = _contents[p];
    // 不变式兜底（判据 c 已保证存在；此处逐条过滤而非整体放弃，避免一个坏条目拖垮其余接管）
    if (typeof c !== 'string' || !c) continue;
    takeoverFiles[p] = c;
    appliedTakeovers.push(t);
  }
  let planTemplate = det.template;
  if (appliedTakeovers.length > 0) {
    planTemplate = applySectionTakeovers(det.template, appliedTakeovers);
    options.logger?.info?.(
      '🔗 #19 同段交互接管（骨架静态段组件 → LLM 交互段组件）',
      { takeovers: appliedTakeovers.map((t) => `${t.sectionId}:${t.from}→${t.to}`) },
    );
  }

  let out = src.slice(0, block.start) + planTemplate + src.slice(block.end);
  // 🛡️ 方案 E（2026-11-14）：把段高规则注入 `<style lang="less" scoped>`。
  //   为什么必须走样式表：inline style 不经过 postcss ⇒ px2rem 不转换 ⇒ 大屏/rem 适配失效。
  //   为什么加 !important：模板上仍内联着比例（`flex:0.176`，只为方向/兜底，无尺寸），
  //   类规则的优先级低于 inline，必须 !important 才能让"真值 px"最终生效。
  if (det.layoutStyle) {
    out = injectLayoutStyle(out, det.layoutStyle);
  }
  out = ensureSubComponentImport(out, options);
  out = pruneDeadSubComponentImports(out, options);

  return {
    content: out,
    applied: true,
    facts: {
      rootContainerClass: det.rootContainerClass,
      sectionRoots: det.sectionRoots,
      componentFiles: det.componentFiles || [],
      source: 'deterministic-template',
    },
    takeovers: appliedTakeovers,
    takeoverFiles,
  };
}

export async function generateIndexVue(runChunk, input, { splitDecision, allFiles }, options = {}) {    const scriptSplit = !!splitDecision.scriptSplit;
    const declContent = allFiles['declare.json'] || '';

    // 🛡️ 动态 maxTokens：预算必须复用容量门禁的真实 chunk 预算。
    // `total: 5/7` 仅用于进度展示，不代表等权 token 分母。
    const chunkBudgets = getIndexVueChunkBudgets(splitDecision);
    const estTemplate = chunkBudgets[0]?.estTokens || 0;
    const estScript = chunkBudgets.find((chunk) => chunk.segmentType === 'script')?.estTokens || 0;

    // 批: index.vue <template>
    const chunkT = {
      title: 'index.vue 模板',
      files: ['package/index.vue'],
      segmentType: 'template',
      index: 2,
      total: scriptSplit ? 7 : 5,
      estTokens: estTemplate,
      contextFiles: [{ path: 'declare.json', content: declContent }],
    };
    // 🛡️ 层①（2026-09-11）：有计划子组件时，模板骨架由系统确定性生成（不再让 LLM 写装配），
    // 从机制上消灭 COMP-001（section 漏组装）/ CODE-021（死 import）/ 语义门禁（模板引用未声明）。
    let templateContent;
    const _detTemplate = buildDeterministicIndexTemplate(input, options);
    if (_detTemplate) {
      options.logger?.info?.(
        '🧩 确定性模板装配：跳过 LLM template 段（系统从 effectiveSections 生成骨架）',
        {
          componentName: input.componentName,
          sectionCount: collectLeafSections(resolvePlanSections(input)).length,
        },
      );
      templateContent = _detTemplate.template;
      // 🛡️ R1-2：布局事实（确定性模板单一事实源）挂到 input，由 generateCode 返回
      // indexTemplateFacts → execute.rootLayoutFacts → 下游归一器/规则②改读事实、不再猜命名。
      input._indexTemplateFacts = {
        rootContainerClass: _detTemplate.rootContainerClass,
        sectionRoots: _detTemplate.sectionRoots,
        componentFiles: _detTemplate.componentFiles || [],
        source: 'deterministic-template',
      };
    } else {
      const resT = await runChunk(chunkT, buildTemplateChunkMiddle);
      // 🛡️ P0 防护：runChunk 异常路径可能返回 undefined/不完整对象
      const safeResT = resT && typeof resT === 'object' ? resT : { files: {}, debug: {} };
      templateContent = (safeResT.files?.['package/index.vue'] || '').trim();
      // 🛡️ R1-2：LLM 模板回退路径 —— 落盘前从 template 提取一次内容根类写入 facts，
      // 供下游归一器消费（词尾猜测在这里发生一次、固化，下游不再各自猜）。
      const _detCls = detectContentRootClass(templateContent);
      if (_detCls) {
        input._indexTemplateFacts = {
          rootContainerClass: _detCls,
          sectionRoots: [],
          source: 'detected-llm-template',
        };
      }
    }

    let scriptContent = '';
    if (scriptSplit) {
      options.logger?.info?.(
        '🧩 超大组件：script 拆为 状态/生命周期/图表 三段（#9a 加深，避免单段超 16k 输出上限被截断）',
        {
          componentName: input.componentName,
          estTokens: splitDecision.estTokens,
          sizeTier: splitDecision.sizeTier,
        },
      );
      const scriptCtx = [
        { path: 'declare.json', content: declContent },
        { path: 'package/index.vue (template)', content: templateContent },
      ];
      const chunkS1 = {
        title: 'index.vue 脚本(状态)',
        files: ['package/index.vue'],
        segmentType: 'script',
        scriptPart: 'state',
        index: 3,
        total: 7,
        estTokens: estScript,
        contextFiles: scriptCtx,
      };
      // 🛡️ 优雅降级：状态段失败用最小骨架兜底（import + $mcComponentBuilder 解构），
      // 保证 index.vue 能拼装写盘、可进 PG 抢救（而非整个任务 fail-closed 无产物）。
      let scriptState = '';
      try {
        const resS1 = await runChunk(chunkS1, buildScriptChunkMiddlePart);
        // 🛡️ P0 防护：runChunk 异常路径可能返回 undefined/不完整对象
        const safeResS1 = resS1 && typeof resS1 === 'object' ? resS1 : { files: {}, debug: {} };
        scriptState = (safeResS1.files?.['package/index.vue'] || '').trim();
      } catch (e) {
        options.logger?.warn?.(
          '⚠️ 状态段生成失败，降级为最小状态骨架（组件可打开，需手动补全状态定义）',
          { componentName: input.componentName, error: e.message },
        );
        scriptState = `import { ref, computed } from 'vue'\nconst { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()`;
        markDegraded(input, 'state');
      }

      const chunkS2 = {
        title: 'index.vue 脚本(生命周期)',
        files: ['package/index.vue'],
        segmentType: 'script',
        scriptPart: 'lifecycle',
        index: 4,
        total: 7,
        estTokens: estScript,
        contextFiles: [
          { path: 'package/index.vue (template)', content: templateContent },
        ],
      };
      // 🛡️ 优雅降级：生命周期段失败不再 fail-closed，用最小 onMounted 兜底（组件仍可渲染）
      let scriptLifecycle = '';
      try {
        const resS2 = await runChunk(chunkS2, buildScriptChunkMiddlePart);
        // 🛡️ P0 防护：runChunk 异常路径可能返回 undefined/不完整对象
        const safeResS2 = resS2 && typeof resS2 === 'object' ? resS2 : { files: {}, debug: {} };
        scriptLifecycle = (safeResS2.files?.['package/index.vue'] || '').trim();
      } catch (e) {
        options.logger?.warn?.(
          '⚠️ 生命周期段生成失败，降级为最小 onMounted 兜底（组件仍可打开）',
          { componentName: input.componentName, error: e.message },
        );
        scriptLifecycle = `import { onMounted } from 'vue'\nonMounted(() => { try { runtimeBuilder.publishEvent('${input.componentName}-onload', { componentId: '${input.componentName}', timestamp: Date.now() }) } catch (_) {} })`;
        markDegraded(input, 'lifecycle');
      }

      const chunkS3 = {
        title: 'index.vue 脚本(图表)',
        files: ['package/index.vue'],
        segmentType: 'script',
        scriptPart: 'charts',
        index: 5,
        total: 7,
        estTokens: estScript,
        contextFiles: [
          { path: 'package/index.vue (template)', content: templateContent },
        ],
      };
      // 🛡️ 方案2 深化（scriptStrategy）：强制子组件拆分时，图表逻辑归子组件，主组件跳过 charts 段。
      // 根因（mc-max-1787708996212 实锤）：5 section 强制拆分后，主组件 charts 段 prompt 仍要求「生成 initCharts
      // 完整实现」，模型为子组件 section 臆造 chartRef/legendState 等变量 → 语义门禁自由变量拦截。
      // 强制拆分（isForced && effectiveSections 非空）意味着所有 section（含图表）都已拆为子组件，
      // 主组件 script 只负责 import 子组件 + 组合，图表逻辑由子组件各自生成 → 跳过 charts 段（省一次 LLM + 彻底避免臆造）。
      // 🛡️ 2026-11-04 治本（mc-max-1793767891707-10c19d61 实锤）·续接本口径：isForced 只覆盖强拆场景，
      //   **自然拆分**（planner 常规出子组件 + 确定性父壳模板）漏网 ⇒ 父壳模板无任何 ref 挂载
      //   ⇒ charts 段写出的 echarts.init(chartRef) 必然孤儿 ⇒ DO-NOT-INVENT-CHART-MOUNT-MISSING
      //   终态拦截（iteration 8 无回环，任务失败）。判据扩为：isForced || 父模板无挂载锚
      //   （templateHasNoRefMount，prompt-builder 单一来源，与门禁同源思想；模板有锚 → false 零行为变化）。
      // 🛡️ G04（2026-11-14）：原实现优先读归一化口 ⇒ 图表父壳挂载判据吃残缺 plan。
      //   收口到单一解析器；入参结构与下游消费（isForced / collectLeafSections）零改动。
      const _subPlanForCharts = resolvePlanSourceFromInput(input).plan;
      const _leafForCharts = collectLeafSections(
        _subPlanForCharts?.effectiveSections || [],
      );
      const _forcedSplit =
        _subPlanForCharts?.isForced === true && _leafForCharts.length > 0;
      const _parentNoMount = templateHasNoRefMount(templateContent);
      const _skipParentCharts = _forcedSplit || _parentNoMount;

      // 🛡️ 优雅降级：图表段失败降级为空（组件无图表仍可渲染，不 fail-closed）
      let scriptCharts = '';
      if (_skipParentCharts) {
        options.logger?.info?.(
          _parentNoMount && !_forcedSplit
            ? '🧩 父模板无 ref 挂载锚：跳过 charts 段（图表已由子组件承载，父级图表实现必然成孤儿死代码）'
            : '🧩 强制子组件拆分：主组件跳过 charts 段（图表逻辑归子组件）',
          {
            componentName: input.componentName,
            sectionCount: _leafForCharts.length,
            parentNoMount: _parentNoMount,
          },
        );
      } else {
        try {
          const resS3 = await runChunk(
            chunkS3,
            buildScriptChunkMiddlePart,
          );
          // 🛡️ P0 防护：runChunk 异常路径可能返回 undefined/不完整对象
          const safeResS3 = resS3 && typeof resS3 === 'object' ? resS3 : { files: {}, debug: {} };
          scriptCharts = (safeResS3.files?.['package/index.vue'] || '').trim();
        } catch (e) {
          options.logger?.warn?.(
            '⚠️ 图表段生成失败，降级为空（组件无图表仍可渲染）',
            { componentName: input.componentName, error: e.message },
          );
          scriptCharts = '';
          markDegraded(input, 'charts');
        }
      }

      scriptContent = mergeScriptParts(
        scriptState,
        scriptLifecycle,
        scriptCharts,
      );
    } else {
      const chunkS = {
        title: 'index.vue 脚本',
        files: ['package/index.vue'],
        segmentType: 'script',
        index: 3,
        total: 5,
        estTokens: estScript,
        contextFiles: [
          { path: 'package/index.vue (template)', content: templateContent },
        ],
      };
      const resS = await runChunk(chunkS, buildScriptChunkMiddle);
      // 🛡️ P0 防护：runChunk 异常路径可能返回 undefined/不完整对象
      const safeResS = resS && typeof resS === 'object' ? resS : { files: {}, debug: {} };
      scriptContent = (safeResS.files?.['package/index.vue'] || '').trim();
    }

    //  部分修订且 index.vue 非目标文件时 runChunk 已跳过并从磁盘保留，templateContent/scriptContent 为空 → 不覆盖
    if (templateContent || scriptContent) {
      const assembled = assembleIndexVue(templateContent, scriptContent, input, options);
      options.logger?.info?.('✅ index.vue 拼装完成', {
        length: assembled.length,
        scriptSplit,
      });
      return assembled;
    }
    return '';
  }

export function markDegraded(input, part) {
    if (!input) return;
    if (!Array.isArray(input._degradedScriptParts))
      input._degradedScriptParts = [];
    if (!input._degradedScriptParts.includes(part))
      input._degradedScriptParts.push(part);
  }

export function stripNonScriptBlocks(s) {
    if (!s) return s;
    let x = String(s);
    // 完整 <template ...> ... </template> 块
    x = x.replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, '');
    // 完整 <style ...> ... </style> 块
    x = x.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
    // 孤立开标签（含自闭合 <template/> / <style/>）
    x = x.replace(/<template\b[^>]*\/?>/gi, '');
    x = x.replace(/<style\b[^>]*\/?>/gi, '');
    // 孤立闭合标签
    x = x.replace(/<\/template\s*>/gi, '');
    x = x.replace(/<\/style\s*>/gi, '');
    return x;
  }

export function stripNonTemplateBlocks(s) {
    if (!s) return s;
    let x = String(s);
    // 完整 <script ...> ... </script> 块（含 <script setup>）
    x = x.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
    // 完整 <style ...> ... </style> 块
    x = x.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
    // 孤立开标签（含自闭合 <script/> / <style/>）
    x = x.replace(/<script\b[^>]*\/?>/gi, '');
    x = x.replace(/<style\b[^>]*\/?>/gi, '');
    // 孤立闭合标签
    x = x.replace(/<\/script\s*>/gi, '');
    x = x.replace(/<\/style\s*>/gi, '');
    return x;
  }

export function mergeScriptParts(...parts) {
    const clean = (s) => {
      if (!s) return '';
      let x = s.trim();
      x = x.replace(/^\/\/\s*===\s*package\/index\.vue\s*===\s*\n?/i, '');
      // 🛡️ 先剥 markdown 代码围栏（模型可能用 ```vue ... ``` 包裹输出；尾围栏不是空白，
      // 会让下面的 /<\/script>\s*$/ 剥不掉 </script>，进而把 ``` 包进 <script setup> 内部 → SFC Invalid end tag）
      x = x.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
      // 🛡️ 截断 </script> 之后的一切（LLM 常在 script 闭合后输出自检清单/markdown，
      // 导致 replace(/<\/script>\s*$/i) 匹配不到末尾 </script>，进而把 markdown 包进 script → SFC Invalid end tag）
      //
      // 🔴 2026-09-30 治本（c-bb771-8bb771e4 实锤）：`lastIndexOf` 会把**段内多余的闭合标签**留下。
      //   scriptSplit 的每段各自带一次 `<script setup>…</script>` 包裹；某段实测为
      //   `<script setup>\n…\n</script>\n</script>`（**双闭合**），旧实现截到最后一个 `</script>`
      //   就把中间那个留了下来，而紧随其后的清理只剥「末尾」一个 ⇒ **中间那个泄漏**。
      //   多段合并（state/lifecycle/charts）后，泄漏的 `</script>` 把后续段**切到 <script> 块之外**
      //   （实测：chunk4 lifecycle + chunk5 import 共 469 字符落在 `</script>` 与 `<style>` 之间）
      //   ⇒ SFC 只解析第一个 script 块 ⇒ `onMounted` 落在块外 ⇒ **onload 事件永不发布**。
      //
      //   ⚠️ 正确口径是「**删标签、保内容**」，不能改写成「截断到第一个 `</script>`」——
      //   同一段里可能存在**多对**包裹（多脚本块），截断会把后面的脚本整块丢掉
      //   （实测 480 个真机分段里有段落下 784 字符）。故：只截掉最后一个闭合**之后**的
      //   markdown 尾巴，再把所有包裹标签**删除**（内容逐字保留）。
      const _scIdx = x.lastIndexOf('</script>');
      if (_scIdx >= 0) x = x.slice(0, _scIdx);
      // 独占一行的包裹标签（模型输出的段首/段尾包裹总是独占行）
      x = x.replace(/^[ \t]*<\/script\s*>[ \t]*\r?\n?/gm, '');
      x = x.replace(/^[ \t]*<script\b[^>]*>[ \t]*\r?\n?/gm, '');
      // 兜底：行内残留的闭合标签 / 字符串开头的开标签
      x = x.replace(/<\/script\s*>/gi, '');
      x = x.replace(/^\s*<script\b[^>]*>\s*/i, '');
      x = x.trim();
      // 🛡️ 只剥混入的 <template>/<style> 块（注意：不用 stripNonScriptBlocks，
      // 它会把完整 <script> 块也剥掉——那是清理 template 用的，这里是清理 script 内容）
      x = x.replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, '');
      x = x.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
      x = x.replace(/<template\b[^>]*\/?>/gi, '');
      x = x.replace(/<style\b[^>]*\/?>/gi, '');
      x = x.replace(/<\/template\s*>/gi, '');
      x = x.replace(/<\/style\s*>/gi, '');
      return x.trim();
    };
    const cleaned = parts.map(clean);
    const nonEmptyIdx = cleaned.reduce((acc, p, i) => {
      if (p) acc.push(i);
      return acc;
    }, []);
    if (nonEmptyIdx.length === 0) return '';
    // 🔴 2026-09-30 治本（同族第二处 · c-max-1789499487971-12bc3750 实锤）：
    //   旧实现 `return (parts[nonEmptyIdx[0]] || '').trim()` 直接回吐**原始 part**，
    //   单段里的**双 `</script>`** 无人清理 ⇒ assembleIndexVue 只解析第一个 script 块 ⇒
    //   后半段落到顶层成为游离文本（onMounted 不执行）。
    //   ⚠️ 这里刻意**只在检测到残留闭合标签时才清理**：正常单段（只有一个 `</script>`）
    //   必须**逐字不变** —— 否则会顺带剥掉模型正文里作为片段的 <template>/<style>，
    //   实测 480 个真机分段里有 243 个内容变短（最大差 3k 字符）⇒ 判定误伤，禁止。
    if (nonEmptyIdx.length === 1) {
      const only = (parts[nonEmptyIdx[0]] || '').trim();
      // ⚠️ 只在检测到残留闭合标签时才动它：正常单段必须**逐字不变**
      // （走完整 clean 会顺带剥掉正文里作为片段的 <template>/<style>，改变既有行为）
      if (!/<\/script\s*>/i.test(only)) return only;
      let y = only
        .replace(/^[ \t]*<\/script\s*>[ \t]*\r?\n?/gm, '')
        .replace(/^[ \t]*<script\b[^>]*>[ \t]*\r?\n?/gm, '')
        .replace(/<\/script\s*>/gi, '')
        .replace(/^\s*<script\b[^>]*>\s*/i, '');
      return `<script setup>\n${y.trim()}\n</script>`;
    }
    // 🛡️ 多段各自可能都带 import（模型常见重复），确定性去重防编译崩
    let merged = dedupeLifecycleHooks(
      dedupeMcComponentBuilder(
        dedupeScriptImports(
          nonEmptyIdx.map((i) => cleaned[i]).join('\n\n'),
        ),
      ),
    );
    // 🛡️ 2026-09-10 治本（env 样本 mc-max-1789019718053-fb0a0de7 实锤）：
    // 分段合并（state/lifecycle/charts）只做 import/Builder/lifecycle 去重，不做声明顺序校验。
    // 若某段把 const 声明放段尾、另一段又先引用它（如 lifecycle 段 `watch(activeTab)` 排在 state 段 `const activeTab` 之前），
    // 合并后产生「引用型 TDZ」→ 运行时 "Cannot access 'x' before initialization" → 渲染崩。
    // 合并后确定性自检：发现引用早于声明即自动上移声明（语义等价），杜绝 TDZ 写盘。
    const tdz = findTdzReferences(merged);
    if (tdz.length > 0) {
      const fix = autoFixTdzReferences(merged);
      if (fix.fixed.length > 0) merged = fix.content;
    }
    return `<script setup>\n${merged}\n</script>`;
  }

/**
 * 🛡️ 刀 8a（2026-09-13）：declare.json componentId 的确定性装配（纯函数，可单测）。
 *
 * 设计契约：componentId = `c-<语义段>-<sessionId 尾 8 hex>`。尾段必须是 **纯 hex**，
 * 因为 classPrefixOf 依赖 `-[0-9a-f]{8}$` 剥离尾段还原 class 前缀语义干。
 *
 * 历史缺陷（本次修复）：旧实现在取不到 sessionId 时用
 * `Math.random().toString(36).slice(2, 10)` 兜底，产出 8 位 **base36** 随机段
 * （如 00g6b7vh，含 g/v/h 等非 hex 字母）：
 *   ① phase2 微码链路 engineer input 顶层无 sessionId（只在 input.ctx 内）→ 恒走随机兜底；
 *   ② 随机段非纯 hex → classPrefixOf 剥离失效 → 随机段滞留进 class 前缀契约；
 *   ③ 与 LLM 自然生成的 `c-<语义>-*` 失配 → CODE-003 全量误判 → autoFix 双前缀叠加
 *      （common.less ~半数规则死样式，CODE-003-HIT-RATE 实测 48%）。
 *
 * 现策略：sessionId 取值链 input.sessionId → input.ctx.sessionId → options.sessionId；
 * 仍取不到时 **不注入任何随机尾段**（componentId 保持 `c-<语义段>`），
 * 宁可牺牲跨任务唯一性，也绝不让不可剥离的随机段污染 class 前缀契约。
 *
 * @param {object} input - engineer input（可含顶层 sessionId 或 ctx.sessionId）
 * @param {object} [options] - 可含 sessionId / normalizeComponentId
 * @returns {{ componentId: string, baseComponentId: string, sessionIdSuffix: string }}
 */
export function resolveDeclareComponentId(input = {}, options = {}) {
  const rawName = String(input?.componentName || '').trim();
  const sessionId = String(
    input?.sessionId || input?.ctx?.sessionId || options.sessionId || '',
  ).trim();
  // 🆕 高级选项 P0（2026-10-09）：用户指定组件 ID 优先——normalizeUserComponentId
  // 已保证 `c-<kebab>` 无随机段形态（可剥离契约：prefix = whole），直接采用，
  // 不追加 sessionId 尾 8hex ⇒ 同名重生成 id 恒定（迭代不漂移的核心）。
  // 前置校验（check-id 接口 + DTO）已拦截非法/保留字，此处双保险兜底。
  const userComponentId = normalizeUserComponentId(input?.userComponentId);
  if (userComponentId) {
    return { componentId: userComponentId, baseComponentId: userComponentId, sessionIdSuffix: '' };
  }
  // 🛡️ S4（2026-09-16）· componentId 收敛到单一事实源 sanitizeComponentId：
  // 旧实现用 defaultNormalizeComponentId（仅剥 mc- 前缀 + kebab），对四段脏 id
  // （c-max-<ts>-<hex>-<hex>）不收敛 → 随机中段滞留 → classPrefixOf 剥离失败 →
  // CODE-003 双前缀复发。统一走 sanitizeComponentId 后，脏 id / 随机中段 /
  // 装饰 slug 全部被确定性收敛为 c-<语义段>-<sessionId 尾 8hex>（可剥离契约）。
  // 语义段优先 componentName（fallbackToken 同源），sessionId 决定唯一尾段。
  const componentId = sanitizeComponentId(rawName, { sessionId, fallbackToken: rawName });
  const tail = tailHexOf(sessionId);
  const baseComponentId = tail
    ? componentId.slice(0, componentId.length - (tail.length + 1))
    : componentId;
  return { componentId, baseComponentId, sessionIdSuffix: tail };
}

export async function safeGenerateDeclareJson(runChunk, input, chunkD, options = {}) {
    // 🛡️ P2 修复：componentId 必须带 "c-" 前缀（declare-json.md 规范），
    // 仅清洗 kebab-case 会导致 e2emodalp2 这类无前缀 ID 被校验器打 BLOCK。
    // 🛡️ 2026-09-04 修复截图串图：componentId 必须带 sessionId 后缀保证唯一性
    // 不同任务可能生成相同组件名（如"设备监测"→c-monitor），导致截图 URL 冲突
    // 🛡️ 刀 8a（2026-09-13）：装配逻辑抽为纯函数 resolveDeclareComponentId，见其 JSDoc。
    const { componentId } = resolveDeclareComponentId(input, options);
    // 🆕 高级选项 P0 留痕：用户指定 ID 是否随 input 到达本函数（真机排障依赖）
    options.logger?.info?.(`🆔 declare componentId 定稿: ${componentId}`, {
      userComponentId: input?.userComponentId || null,
      componentName: input?.componentName || null,
    });


    // 1. 生成完整骨架（结构字段由模板保证）
    const skeleton = templateDeclareJson({
      componentId,
      componentName: input.displayName || input.componentName || '未知组件',
      nodeData: input.layoutStructure || {},
      backgroundBrightness: input.backgroundBrightness || 'dark',
    });

    try {
      // 2. LLM 生成业务字段片段
      const resD = await runChunk(chunkD, buildChunkMiddle);
      // 🛡️ P0 防护：runChunk 异常路径可能返回 undefined/不完整对象
      const safeResD = resD && typeof resD === 'object' ? resD : { files: {}, debug: {} };
      const llmOutput = safeResD.files?.['declare.json'] || '';

      // 3. 解析 LLM 输出
      let fragment = null;
      try {
        fragment = JSON.parse(llmOutput);
      } catch (parseErr) {
        // 尝试提取 JSON 片段
        const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            fragment = JSON.parse(jsonMatch[0]);
          } catch {
            /* ignore */
          }
        }
      }

      // 4. 深度合并（业务字段覆盖骨架）
      if (fragment && typeof fragment === 'object') {
        const merged = mergeDeclareFragment(skeleton, fragment, componentId);
        options.logger?.info?.('✅ declare.json 模板先行 + LLM 业务片段合并成功', {
          componentName: input.componentName,
          businessEventsCount: Object.keys(merged.businessEvents || {}).length,
          hasLayoutConfig: !!merged.layoutConfig,
        });
        return {
          files: { 'declare.json': JSON.stringify(merged, null, 2) },
          debug: { ...(safeResD.debug || {}), merged: true },
        };
      }

      // 5. LLM 输出无法解析 → 降级到纯骨架
      options.logger?.warn?.('declare.json LLM 输出无法解析，降级到纯骨架', {
        componentName: input.componentName,
      });
      return {
        files: { 'declare.json': JSON.stringify(skeleton, null, 2) },
        debug: { ...(safeResD.debug || {}), fallback: 'skeleton-only' },
      };
    } catch (error) {
      options.logger?.error?.('declare.json LLM 生成失败，降级到纯骨架', {
        error: error.message,
        componentName: input.componentName,
      });
      return {
        files: { 'declare.json': JSON.stringify(skeleton, null, 2) },
        debug: {
          attempt: 0,
          files: ['declare.json'],
          fallback: 'skeleton-only',
          error: error.message,
        },
      };
    }
  }

export function mergeDeclareFragment(skeleton, fragment, componentId) {
    const merged = { ...skeleton };

    // componentName：🛡️ P1-2 · 事实源 = Figma 节点名（已在 skeleton 中），LLM 输出只在骨架缺失时使用
    // 避免 LLM 把 Tab 文案（如"实时车流监测"）当成组件名覆盖 Figma 真值
    if (fragment.componentName && typeof fragment.componentName === 'string') {
      // 只有骨架是默认值 '未知组件' 或空时，才允许 LLM 覆盖
      if (!merged.componentName || merged.componentName === '未知组件') {
        merged.componentName = fragment.componentName;
      }
    }

    // panelKey：LLM 输出覆盖
    if (fragment.panelKey !== undefined) {
      merged.panelKey = fragment.panelKey;
    }

    // businessEvents：LLM 输出覆盖（需确保为 object 格式）
    if (
      fragment.businessEvents &&
      typeof fragment.businessEvents === 'object'
    ) {
      if (Array.isArray(fragment.businessEvents)) {
        // 兼容 LLM 仍输出数组的情况
        const obj = {};
        for (const evt of fragment.businessEvents) {
          if (evt && typeof evt === 'object' && evt.eventId) {
            obj[evt.eventId] = evt;
          }
        }
        merged.businessEvents = obj;
      } else {
        merged.businessEvents = fragment.businessEvents;
      }
    }

    // businessStatuses：LLM 输出覆盖
    if (fragment.businessStatuses !== undefined) {
      merged.businessStatuses = fragment.businessStatuses;
    }

    // cssVariableConfig：LLM 输出覆盖
    if (fragment.cssVariableConfig !== undefined) {
      merged.cssVariableConfig = fragment.cssVariableConfig;
    }

    // businessConfig：LLM 输出覆盖
    if (fragment.businessConfig !== undefined) {
      merged.businessConfig = fragment.businessConfig;
    }

    // ⚠️ dataSources/formSources 属于结构字段，强制以骨架为准（LLM 输出忽略）
    // 骨架已按规范置为 null，后续 normalize 阶段再由业务逻辑决定是否需要填充

    // ⚠️ 结构字段强制以骨架为准（LLM 输出忽略）
    // - componentId（强制使用 system-generated）
    // - version/attribute/layoutConfig/themeConfig/dataSources/formSources（结构字段）
    merged.componentId = componentId;

    return merged;
  }

/**
 * 单个分块 LLM 调用（含截断/语义门禁/降级重试）。原 _generateSingleChunk。
 * 依赖经 options 注入：llm/model/name/liteModel/logger。
 * 复用模块内 parseCodeOutput/detectFileTruncation/markDegraded。
 */

export async function generateSingleChunk(prompt, chunk, input, options = {}) {
    //  收紧分块生成的超时与重试预算，避免单块极端长尾（原 600s × 3 = 1800s；
    const CHUNK_TIMEOUT_MS = Math.max(
      60000,
      parseInt(process.env.ENGINEER_CHUNK_TIMEOUT_MS || '180000'),
    );
    const maxAttempts = Math.max(
      1,
      parseInt(process.env.ENGINEER_MAX_ATTEMPTS || '2'),
    );
    const CHUNK_BUDGET_MS = Math.max(
      CHUNK_TIMEOUT_MS,
      parseInt(process.env.ENGINEER_CHUNK_BUDGET_MS || '1200000'),
    );
    let lastErr = null;
    let lastErrType = null; // 'max_tokens' | 'truncation' | 'semantics'
    const chunkBudgetStart = Date.now();
    //模型分级路由：简单块（预估输出小）走轻量模型，复杂块走主模型（省钱）
    const tierProfile = input.ctx?.tierProfile || null;
    const LITE_THRESHOLD =
      tierProfile?.liteTokenThreshold ??
      Math.max(
        500,
        parseInt(process.env.ENGINEER_LITE_TOKEN_THRESHOLD || '4000'),
      );
    const liteModel =
      tierProfile?.liteModel ??
      options.liteModel ??
      process.env.LLM_LITE_MODEL ??
      null;
    // 🛡️ 模型能力自感知：单文件段被 max_tokens 截断时，提高到「模型真实输出上限」再重试一次
    //（不再直接 fail-closed）。modelOutputCap = 模型真实上限；maxTokensEscalated 防止无限提。
    // 🔧 2026-09-04 修复提限空转：旧逻辑 getModelMaxOutputTokens(fallback=16000) 对表外模型
    // 一律返回 16000 → from:16000,to:16000 原地踏步（实锤 TabSection.vue 截断后重试仍 16k）。
    // 现在：① 用 resolveModelCapability（env > 内置表 > 实测缓存）取已知上限；
    //      ② limitKnown=false（未实测到具体上限）时按 32000 提限——提限路径只在
    //        「模型已实际产出 ≥16k 仍被 length 截断」后触发，说明该模型输出能力 ≥16k，
    //        32k 提限对其安全；真 8k 低上限模型走不到这条路径（在 8k 处就截断进入不了 16k 档）。
    const capInfo = resolveModelCapability(options.model, 16000);
    const modelOutputCap = Math.max(
      capInfo.limitKnown ? capInfo.tokens : 32000,
      16000,
    );
    let maxTokensEscalated = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let p;
      if (attempt > 1) {
        if (lastErrType === 'max_tokens') {
          // max_tokens 截断：优先减半文件数；单文件段（script 子段等）无法减半时，
          // 提高到「模型真实输出上限」再重试一次（不再直接 fail-closed）。
          const origFiles = chunk.files || [];
          if (origFiles.length <= 1) {
            if (!maxTokensEscalated) {
              maxTokensEscalated = true;
              (options.logger || console).warn(
                '⚠️ max_tokens 截断（单文件段）：提高到模型输出上限重试',
                {
                  segmentType: chunk.segmentType,
                  scriptPart: chunk.scriptPart,
                  from: getMaxTokens(options.model, 16000),
                  to: modelOutputCap,
                  capSource: capInfo.source,
                  attempt,
                },
              );
              // 本轮继续，用提上限后的 maxTokens 重新生成（不 throw、不 continue）
            } else {
              (options.logger || console).error(
                '❌ max_tokens 截断：已提高到模型输出上限仍截断，无法进一步拆分',
                {
                  fileCount: origFiles.length,
                  files: origFiles,
                  attempt,
                  modelOutputCap,
                },
              );
              throw new Error(
                `输出被截断（max_tokens），已提高到模型输出上限 ${modelOutputCap} 仍截断，且文件数已为 ${origFiles.length} 无法进一步拆分。请简化组件或拆分元素。`,
              );
            }
          } else {
            const halfCount = Math.max(1, Math.floor(origFiles.length / 2));
            const reducedFiles = origFiles.slice(0, halfCount);
            if (reducedFiles.length < origFiles.length) {
              chunk = { ...chunk, files: reducedFiles };
              (options.logger || console).warn('⚠️ max_tokens 截断：将本批文件数减半重试', {
                original: origFiles.length,
                reduced: reducedFiles.length,
                attempt,
                chunkName: chunk.segmentType || 'unknown',
              });
            }
          }
        }
        // 🧹 P0-C：精简重试，只携带目标文件契约 + 错误上下文，避免重发完整 Figma/规范
        // ⚠️ 2026-08-25 修复：empty_output（LLM 空响应/限流）不得精简——
        // 精简 prompt（实测仅 689 字符）不含任何设计事实，换备胎 provider 后 LLM
        // 只能输出通用占位模板（mv-max-1787636708099 / mv-max-1787637830074 两次实锤）。
        // empty_output 时重发完整 prompt（provider 已切换冷却，值得完整重试）；
        // semantics/truncation/max_tokens 属「局部修错」，仍用精简重试。
        if (lastErrType === 'empty_output') {
          p = prompt;
          (options.logger || console).info(
            '🔄 empty_output 重试：携带完整设计上下文重发（provider 已切换）',
            {
              files: chunk.files,
              promptChars: p.length,
            },
          );
        } else {
          p = buildRetryPrompt(chunk, lastErrType, lastErr);
          (options.logger || console).info('🧹 精简重试 Prompt（已丢弃完整规范/截图上下文）', {
            files: chunk.files,
            errType: lastErrType,
            retryChars: p.length,
          });
        }
      } else {
        p = prompt;
      }
      //动态调整 maxTokens：根据预估输出 tokens 预留 20% + 1024 余量
      const estTokens = chunk?.estTokens || 0;
      // 🛡️ 提上限重试：max_tokens 截断单文件段后，本轮 baseMax 用模型真实输出上限
      const baseMax = maxTokensEscalated
        ? modelOutputCap
        : getMaxTokens(options.model, 16000);
      const dynamicMax =
        estTokens > 0 ? Math.ceil(estTokens * 1.2 + 1024) : baseMax;
      // 提上限重试时直接用模型真实上限（不再被 estTokens 估算拖低），否则不超过模型本身上限
      const finalMaxTokens = maxTokensEscalated
        ? baseMax
        : Math.min(dynamicMax, baseMax);

      if (estTokens > 0 || maxTokensEscalated) {
        (options.logger || console).info('🧩 动态调整 maxTokens', {
          estTokens,
          dynamicMax,
          finalMaxTokens,
          baseMax,
          escalated: maxTokensEscalated,
        });
      }

      //模型分级路由：小块（estTokens < 阈值）且配置了 liteModel → 轻量模型
      const useLite =
        liteModel &&
        estTokens > 0 &&
        estTokens < LITE_THRESHOLD &&
        attempt === 1;
      if (useLite) {
        (options.logger || console).info('⚡ 模型分级路由：轻量模型处理小块', {
          estTokens,
          liteModel,
          chunk: chunk.files.join(','),
        });
      }

      // 🛡️ P1-B：输入侧预算硬门禁（默认关闭裁剪；仅当 ENGINEER_MAX_INPUT_TOKENS 为正整数时真实裁剪）
      const maxInputTokens =
        parseInt(process.env.ENGINEER_MAX_INPUT_TOKENS || '0', 10) || Infinity;
      if (Number.isFinite(maxInputTokens)) {
        const _budget = enforceInputBudget(p, maxInputTokens);
        if (_budget.report.trimmed) {
          (options.logger || console).warn('🛡️ P1-B 输入预算裁剪', {
            chunk: (chunk.files || []).join(','),
            attempt,
            report: _budget.report,
          });
          p = _budget.prompt;
        }
      }

      // 📡 心跳上下文注入：把「⏳ 模型处理中...」升级为「⏳ 正在生成【<分块名>】...」，
      // 用户等待时能明确知道当前在生成哪个文件（vue3 路径继承同款行为）。
      const _chunkLabel = chunk?.title || (chunk?.files || []).join('、') || '';
      const _progressWithChunk = input.onProgress
        ? (evt) => {
            if (
              evt &&
              evt.level === 'log' &&
              typeof evt.message === 'string' &&
              evt.message.includes('模型处理中') &&
              _chunkLabel
            ) {
              input.onProgress({
                ...evt,
                message: `⏳ 正在生成【${_chunkLabel}】（已等待 ${evt.elapsedSec}s）`,
              });
            } else {
              input.onProgress(evt);
            }
          }
        : input.onProgress;

      // 🕐 动态超时策略（v2 - 2026-09-07）：
      //   基于 chunk 类型 + 组件复杂度 + 预估 token 数动态计算超时。
      //   基础超时：declare=90s, template/script=180s, style/component=300s
      //   复杂度因子：complex ×1.5, medium ×1.2, simple ×1.0
      //   token 规模因子：estTokens>50k 额外 ×1.3（大上下文需要更长处理时间）
      //   最终超时 = max(基础超时 × 复杂度因子 × token因子, 60s)
      const _segmentType = chunk?.segmentType || 'default';
      const _baseTimeouts = {
        declare: Math.max(60000, parseInt(process.env.DECLARE_CHUNK_TIMEOUT_MS || '90000', 10)),
        template: Math.max(60000, parseInt(process.env.TEMPLATE_CHUNK_TIMEOUT_MS || '180000', 10)),
        script: Math.max(60000, parseInt(process.env.SCRIPT_CHUNK_TIMEOUT_MS || '180000', 10)),
        style: Math.max(60000, parseInt(process.env.STYLE_CHUNK_TIMEOUT_MS || '300000', 10)),
        component: Math.max(60000, parseInt(process.env.SUBCOMPONENT_CHUNK_TIMEOUT_MS || '300000', 10)),
        default: CHUNK_TIMEOUT_MS,
      };
      const _baseTimeout = _baseTimeouts[_segmentType] ?? CHUNK_TIMEOUT_MS;

      // 复杂度因子：从 input.ctx.complexity 读取（complex/medium/simple）
      const _complexity = input.ctx?.complexity || 'simple';
      const _complexityMultipliers = { complex: 1.5, medium: 1.2, simple: 1.0 };
      const _complexityMult = _complexityMultipliers[_complexity] ?? 1.0;

      // token 规模因子：estTokens > 50k 时线性增长，封顶 ×1.3
      const _estTokens = chunk?.estTokens || 0;
      const _tokenMult = _estTokens > 50000
        ? Math.min(1.3, 1.0 + (_estTokens - 50000) / 200000)
        : 1.0;

      const _chunkTimeoutMs = Math.max(
        60000,
        Math.round(_baseTimeout * _complexityMult * _tokenMult),
      );

      const _isBigChunk = _segmentType === 'style' || _segmentType === 'component';

      // 性能监控：记录动态超时的各因子（便于事后分析超时根因）
      if (input.onProgress && _isBigChunk) {
        input.onProgress({
          stage: 'chunk-timeout',
          status: 'info',
          message: `⏱️ 【${chunk.title || _segmentType}】动态超时 ${(_chunkTimeoutMs / 1000).toFixed(0)}s（基础 ${(_baseTimeout / 1000).toFixed(0)}s × 复杂度 ${_complexityMult} × token ${_tokenMult.toFixed(2)}）`,
        });
      }

      // 🆕 方案 3（2026-09-07）：超时重试机制
      // 超时自动重试 1 次，重试时延长超时 ×1.5（给模型更多处理时间）。
      // 超时属于瞬时性问题（provider 负载波动），重试成功率较高。
      // 注意：超时重试与 attempt 循环的正则重试独立——超时重试在 invokeWithTimeout 层，
      // attempt 循环处理空串/截断/语义等产出质量问题。
      const _timeoutRetryMax = Math.max(
        0,
        parseInt(process.env.CHUNK_TIMEOUT_RETRY_MAX || '1', 10),
      );
      const _timeoutRetryMultiplier = parseFloat(
        process.env.CHUNK_TIMEOUT_RETRY_MULTIPLIER || '1.5',
      );
      let response;
      let _timeoutRetries = 0;
      for (let _timeoutAttempt = 0; _timeoutAttempt <= _timeoutRetryMax; _timeoutAttempt++) {
        const _currentTimeout = _timeoutAttempt === 0
          ? _chunkTimeoutMs
          : Math.round(_chunkTimeoutMs * _timeoutRetryMultiplier);

        if (_timeoutAttempt > 0) {
          _timeoutRetries = _timeoutAttempt;
          (options.logger || console).warn(
            `⏰ 超时重试 #${_timeoutAttempt}：延长超时至 ${(_currentTimeout / 1000).toFixed(0)}s`,
            {
              chunk: (chunk.files || []).join(','),
              segmentType: chunk.segmentType,
              originalTimeout: _chunkTimeoutMs,
              retryTimeout: _currentTimeout,
            },
          );
          if (input.onProgress) {
            input.onProgress({
              stage: 'chunk-timeout-retry',
              status: 'warning',
              message: `⏰ 【${chunk.title || _segmentType}】超时，正在重试（${_timeoutAttempt}/${_timeoutRetryMax}），超时延长至 ${(_currentTimeout / 1000).toFixed(0)}s`,
            });
          }
        }

        try {
          response = await invokeWithTimeout(
            options.llm,
            p,
            _currentTimeout,
            options.name || 'microcode-engineer',
            _progressWithChunk,
            {
              signal: input.signal,
              onProgress: _progressWithChunk,
              requestConcurrency: input.requestConcurrency,
              requestQueueTimeoutMs: input.requestQueueTimeoutMs,
              requestTimeoutMs: Math.max(
                Math.min(
                  input.requestTimeoutMs || _currentTimeout,
                  _currentTimeout,
                ),
                _isBigChunk ? _currentTimeout : 0,
              ),
              requestMaxRetries: input.requestMaxRetries,
              model: useLite ? liteModel : options.model,
              provider: 'text-role',
              maxTokens: finalMaxTokens,
              // 🆕 2026-08-27 #273：空串在网关层按失败处理（熔断+冷却+换provider），
              // 避免「成功空串 → 上层 empty_output 再重试」造成同一块双请求并发（292s 僵尸空串实锤）。
              treatEmptyAsFailure: true,
            },
          );
          // 成功则跳出超时重试循环
          break;
        } catch (timeoutErr) {
          const isTimeout = String(timeoutErr?.message || '').includes('timeout');
          if (isTimeout && _timeoutAttempt < _timeoutRetryMax) {
            // 超时且还有重试次数 → 继续循环
            continue;
          }
          // 非超时错误 或 重试耗尽 → 向上抛出
          throw timeoutErr;
        }
      }
      // 🔧 [object AIMessage] 修复：精确提取真实文本。空字符串/缺失 content 不再 fallback 到
      // 整个 response 对象（否则 String(response) 得到 [object AIMessage]）；对象内容块用 '' 拼接；
      // 非字符串/非数组的异常类型用 coerceLLMText 兜底（对对象走 JSON.stringify，不产 [object AIMessage]）。
      let content = response?.content ?? '';
      if (Array.isArray(content)) {
        const parts = [];
        for (const it of content) {
          if (it && typeof it === 'object' && 'text' in it)
            parts.push(it.text || '');
          else if (typeof it === 'string') parts.push(it);
        }
        // ⚠️ 用 '' 拼接而非 '\n'：streaming 模式下 content 是多个 text fragment，
        // 用 \n 会在每个片段间插入换行，打碎分隔符(// === file ===)和 JSON 字符串值，
        // 导致 _parseDelimitedFormat 正则失配 + JSON.parse "Bad control character"。
        content = parts.join('');
      } else if (typeof content !== 'string') {
        content = coerceLLMText(content);
      }
      // 🔀 空串换 provider：LLM 成功返回但内容为空（常因并发触发 provider 限流/服务端故障），
      // 记录该 provider 冷却（复用跨 chunk 超时记忆，冷却期内 pick 排除），外层重试自动切换备用 provider。
      // ⚠️ 2026-08-27 #271 修复：空串只记 60s 冷却（现 180s）不够 —— 若冷却过期且未触发熔断，
      //    坏 provider 会在下一次重试重新入选（日志实证 deepseek 域连续 3 次 290s 空串）。
      //    现同时计入熔断失败：连续 2 次空串 → 熔断 open，冷却期内 pick 直接跳过（_isHealthy=false）。
      const isEmptyOutput =
        typeof content !== 'string' || content.trim() === '';
      if (isEmptyOutput) {
        const emptyPid = response?.__mvgoProviderId;
        if (emptyPid) {
          getProviderPool().recordTimeout(emptyPid);
          try {
            const entry = getProviderPool().get(emptyPid);
            if (entry) entry.breaker.recordFailure();
          } catch {
            /* 熔断记账失败不影响主流程 */
          }
          (options.logger || console).warn(
            '🔀 空串输出，provider 已记入冷却+熔断失败，下次重试将切换',
            { providerId: emptyPid, chunk: (chunk.files || []).join(',') },
          );
        } else {
          (options.logger || console).warn(
            '🔀 空串输出，未取到 providerId（无法排除），仍重试',
            { chunk: (chunk.files || []).join(',') },
          );
        }
        // 🔧 P0 优化：空串输出立即触发重试，不进入解析流程（避免返回空 files 后无法重试）
        lastErrType = 'empty_output';
        lastErr = 'LLM 返回空串';
        (options.logger || console).warn('⚠️ 空串输出，立即重试', {
          chunk: (chunk.files || []).join(','),
          attempt,
        });
        if (
          attempt < maxAttempts &&
          Date.now() - chunkBudgetStart < CHUNK_BUDGET_MS
        )
          continue;
        throw new Error(`空串输出，已重试 ${maxAttempts} 次仍未获得有效内容`);
      }
      // 🛡️ P0（2026-09-01 事故 mc-max-1788272805835-1e2fe5ad）：parseCodeOutput 解析失败
      // （JSON 缺 files 字段 / 非法结构）此前直接向上冒泡 → Phase 2 整体失败，且不重试。
      // 现纳入重试白名单：标记 parse_failure → 精简重试（buildRetryPrompt 已含 JSON 修复提示）
      // → 耗尽后抛准确错误（不再误报"截断/语义不完整"）。
      let parsed;
      try {
        parsed = parseCodeOutput(content, options.logger || console);
      } catch (parseError) {
        lastErrType = 'parse_failure';
        lastErr = parseError?.message || String(parseError);
        (options.logger || console).warn('⚠️ 分块输出解析失败（JSON 缺 files / 非法结构），准备重试', {
          chunk: (chunk.files || []).join(','),
          attempt,
          parseError: lastErr,
        });
        if (
          attempt < maxAttempts &&
          Date.now() - chunkBudgetStart < CHUNK_BUDGET_MS
        ) {
          continue;
        }
        // 重试耗尽：parse_failure 无可用产物（parseCodeOutput 内部已尝试从原始文本恢复失败），
        // 抛准确错误，而非走下方"截断/语义"分支的通用降级。
        throw new Error(
          `分块生成失败（${(chunk.files || []).join('、')}）：LLM 输出无法解析为合规 JSON（${lastErr}），已重试 ${maxAttempts} 次仍无产物。请简化组件或拆分元素。`,
        );
      }
      const files = parsed.files || {};
      const stopReason =
        response?.stop_reason ||
        response?.additional_kwargs?.stop_reason ||
        response?.llmOutput?.stop_reason ||
        response?.response_metadata?.stop_reason;
      const finishReason =
        response?.finish_reason ||
        response?.additional_kwargs?.finish_reason ||
        response?.response_metadata?.finish_reason;
      // 📊 P0-A：模型调用用量观测（兼容多 provider usage 形态，不记录 Prompt 正文）
      const _usage =
        response?.usage ||
        response?.data?.usage ||
        response?.usage_metadata ||
        response?.additional_kwargs?.usage ||
        response?.response_metadata?.usage ||
        {};
      const _inputTokens =
        _usage.input_tokens ??
        _usage.prompt_tokens ??
        _usage.inputTokens ??
        null;
      const _outputTokens =
        _usage.output_tokens ??
        _usage.completion_tokens ??
        _usage.outputTokens ??
        null;
      (options.logger || console).info('📊 LLM 调用用量', {
        chunk: (chunk.files || []).join(','),
        segmentType: chunk.segmentType,
        promptChars: p?.length || 0,
        estInputTokens: Math.ceil((p?.length || 0) / 2.4),
        inputTokens: _inputTokens,
        outputTokens: _outputTokens,
        model: useLite ? liteModel : options.model,
        attempt,
        stopReason,
        finishReason,
      });
      const isMaxTokens =
        stopReason === 'max_tokens' || finishReason === 'length';
      // 分段截断检测：template / script 段有专门的闭合标签检查（比通用 _detectFileTruncation 更精准）
      let truncationIssues;
      if (chunk.segmentType === 'template') {
        truncationIssues =
          content.includes('<template') && !content.includes('</template>')
            ? ['index.vue 模板段: </template> 未闭合（输出被截断）']
            : [];
      } else if (chunk.segmentType === 'script') {
        truncationIssues =
          content.includes('<script') && !content.includes('</script>')
            ? ['index.vue 脚本段: </script> 未闭合（输出被截断）']
            : [];
      } else {
        truncationIssues = detectFileTruncation(files);
      }

      // 🛡️ 第二道防线：<script> 语义完整性（重复 import / 仅 import 无逻辑 / 模板引用未声明变量）
      // 拦截"闭合标签齐全但实际残缺"的产物（如 mc-max-1786024610821 只有 2 行 import 头）
      const semanticIssues = [];
      if (chunk.segmentType === 'script') {
        const scriptStr = (parsed.files['package/index.vue'] || content).trim();
        // 🛡️ #9a 加深：脚本已拆为 状态/生命周期/图表 三段（scriptPart 存在）。
        // 子片段本就只含脚本的一部分，模板引用的"状态变量"在其它片段声明 → 模板跨查必误报。
        // 故子片段跳过模板跨查（step 3），仅保留 重复import/纯头部/重复声明/TDZ 等同片段内部检查；
        // 模板跨查只在「非拆分整段脚本」(无 scriptPart) 上执行。合并后的完整脚本由 SFC 编译器最终把关。
        const isScriptSubPart = !!chunk.scriptPart;
        const tplCtx = isScriptSubPart
          ? null
          : (chunk.contextFiles || []).find((cf) =>
              (cf.path || '').includes('template'),
            );
        // 资源变量（bg1/icon1 等）由系统后处理 injectResourceImports 在拼装阶段注入，
        // 模型按规范禁止手写其声明。门禁若在注入前跑，会误判"模板引用未声明变量"并死循环重试。
        // 故将其视为已声明，与 generateCode 层（注入先于门禁）行为一致。
        const resourceVars = extractResourceVarNames(
          resolveResourceDomMapping(input.resourceDomMapping, input.outputPath),
        );
        // 🛡️ 子组件标签（如 <SectionHeader>）：模板引用、由系统后续自动生成 package/components/*.vue
        // 并接线 import（见 vue3-engineer._wireVue3SubComponentImports）。模型在"三段降级"单独生成脚本段时
        // 常漏写这些 import，若此处按"模板引用未声明组件"判失败会误杀并 fail-closed。
        // 故把模板中的子组件 PascalCase 标签视为"将由系统接线"，放行校验；仅对真正缺失的普通变量仍报错。
        const subCompTags =
          tplCtx?.content && /<template[\s>]/.test(tplCtx.content)
            ? extractComponentTagNames(tplCtx.content)
            : [];
        const sem = validateVueScriptSemantics(scriptStr, 'index.vue 脚本段', {
          templateContent: tplCtx?.content,
          requireLogic: true,
          requireScriptTag: true,
          // 子片段（三段拆分）会引用其它片段才声明的变量，自由变量检测必误报 → 跳过，由合并后完整脚本把关
          skipFreeVariableCheck: isScriptSubPart,
          implicitlyDeclared: [
            ...new Set([
              ...resourceVars,
              ...subCompTags,
              ...VUE_BUILTIN_COMPONENTS,
            ]),
          ],
        });
        semanticIssues.push(
          ...sem.issues.map((i) => i.replace(/^index\.vue 脚本段/, '脚本段')),
        );
      }
      const debug = {
        attempt,
        files: Object.keys(files),
        stopReason,
        finishReason,
        isMaxTokens,
        truncationIssues,
        semanticIssues,
        contentTail: content.slice(-1500),
      };
      if (
        isMaxTokens ||
        truncationIssues.length > 0 ||
        semanticIssues.length > 0
      ) {
        lastErrType = isMaxTokens
          ? 'max_tokens'
          : semanticIssues.length > 0
            ? 'semantics'
            : 'truncation';
        lastErr = isMaxTokens
          ? `stop_reason=${stopReason || finishReason}`
          : semanticIssues.length > 0
            ? semanticIssues.join('；')
            : truncationIssues.join('；');
        (options.logger || console).warn('⚠️ 分块生成被截断/语义不完整，准备重试', {
          chunk: chunk.files.join(','),
          attempt,
          stopReason,
          finishReason,
          truncationIssues,
          semanticIssues,
          errType: lastErrType,
        });
        if (
          attempt < maxAttempts &&
          Date.now() - chunkBudgetStart < CHUNK_BUDGET_MS
        )
          continue;
        // 最后一次失败：template 段用模板兜底，script/style 段保留最后一次产物并降级。
        //
        // 🛡️ P0-1 止血（2026-08-30，mc-max-1788067021808 实锤）：
        // 旧行为对所有非 template 段一律 `continue` → 丢弃最后一次产物 → 循环结束 throw。
        // 后果：某一段被语义门禁卡住时，**其余全部分块的成功成果一起作废**，
        // 最终「生成产物缺少 package/index.vue，无法提供预览」——11 个分块白跑一整轮。
        // 而语义门禁是启发式的：一次误报（如 v-for 循环变量 idx 被当成未声明变量，见 R2）
        // 就足以让一份可用的 script 归零。
        // 现改为与 template 兜底对称：保留产物 + 打 _degraded 标记 → index.vue 仍可拼装、
        // 可预览、可进 Playground 手动补全。宁要「带缺陷可救」，不要「整轮归零」。
        if (chunk.segmentType === 'template') {
          (options.logger || console).warn('⚠️ template 段多次生成均截断，使用最小模板兜底');
          const fallbackTemplate = `<template>\n  <div class="c-${input.componentName || 'component'}-root">\n    <span>组件内容</span>\n  </div>\n</template>\n`;
          return {
            files: { 'package/index.vue': fallbackTemplate },
            debug: { ...debug, fallback: true, _degraded: true },
          };
        }
        if (Object.keys(files).length > 0) {
          // 挂到既有降级清单（供任务状态 / 前端「组件不完整」标签），与三段降级同口径
          markDegraded(input, chunk.segmentType || 'script');
          (options.logger || console).warn(
            '⚠️ 分块多次生成均未通过门禁，保留最后一次产物并降级（可预览 / 可手动补全）',
            {
              chunk: chunk.files.join(','),
              attempts: attempt,
              lastErrType,
              lastErr: String(lastErr || '').slice(0, 300),
            },
          );
          return {
            files,
            debug: {
              ...debug,
              _degraded: true,
              _degradedReason: String(lastErr || ''),
              attempts: attempt,
            },
          };
        }
        continue;
      }
      return { files, debug };
    }
    throw new Error(
      `分块生成失败（${chunk.files.join('、')}）：输出被截断或语义不完整（${lastErr}）。该文件可能超过单次输出上限，建议简化组件或拆分元素。`,
    );
  }
