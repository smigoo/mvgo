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
import { buildChunkMiddle, buildTemplateChunkMiddle, buildScriptChunkMiddle, buildScriptChunkMiddlePart, buildRetryPrompt, resolvePlanSections } from './prompt-builder.js';
import { parseCodeOutput, detectFileTruncation } from './code-parser.js';
import { invokeWithTimeout } from '../../utils/llm-timeout.js';
import { getMaxTokens, coerceLLMText, resolveModelCapability } from '../../utils/model-config.js';
import { enforceInputBudget } from '../../utils/input-budget.js';
import { getIndexVueChunkBudgets } from './chunk-budget.js';
import { getProviderPool } from '../../utils/provider-pool.js';
import {
  extractResourceVarNames,
  resolveResourceDomMapping,
} from '../../utils/resource-import-guard.js';
import { collectLeafSections, assignSectionComponentNames } from '../../utils/section-tree.js';
import { detectContentRootClass } from '../../utils/root-container-normalizer.js';

function defaultNormalizeComponentId(name = '') {
  const raw = String(name || '').trim();
  const cleaned = raw
    .replace(/^mc-(max-)?\d{13}-/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return cleaned.startsWith('c-') ? cleaned : 'c-' + (cleaned || 'component');
}

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
      const sm = scr.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (sm) {
        scr = scr.replace(
          sm[1],
          '\n' + dedupeMcComponentBuilder(dedupeScriptDeclarations(sm[1])).trim() + '\n',
        );
      } else {
        scr = dedupeMcComponentBuilder(dedupeScriptDeclarations(scr));
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

    // 🛡️ Phase 2 后处理兜底（TDD: T02/T03/T04）
    assembled = postProcessIndexVue(assembled, input, options);

    return assembled;
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
 * @returns {{ template: string, rootContainerClass: string|null, sectionRoots: Array<{id, component, type}> }|null}
 *   无计划子组件时返回 null（回退 LLM 生成）
 */
export function buildDeterministicIndexTemplate(input, options = {}) {
  const treeSections = resolvePlanSections(input);
  const leaves = collectLeafSections(treeSections);
  if (!leaves.length) return null;

  const nameOf = assignSectionComponentNames(treeSections);
  const panelType = input.panelType || 'default-panel';
  // input.componentName 已是 _deriveClassPrefix 的干净语义名（如 device-monitor / env-monitor）
  const semantic = String(input.componentName || '')
    .replace(/^c-/, '')
    .toLowerCase() || 'component';

  const headerLeaves = leaves.filter((s) => s.type === 'header');
  const bodyLeaves = leaves.filter((s) => s.type !== 'header');

  // 🛡️ 刀 5c（2026-09-13）：header-right 归属单一事实源 = headerSlots 契约，而非 type==='header' 词猜。
  // 旧实现按 type 二分把内容区「小标题」误判进 header-right，与真正标题行 tabs（type=tabs 进 body）
  // 双轨/过拆（vehicle 小标题 vs tabs、traffic 三个 header 叶实锤）。治本：收集 headerSlots 契约的
  // figmaNodeId 集合，凡叶子 sourceNodeIds 与之相交 → 进 header-right；body 排除同 node（只落一次）。
  // 匹配不到（vision 未产出契约 / node 对不上）→ 回退 type==='header' 二分，保持旧行为零回归。
  const headerSlotNodeIds = new Set();
  const slotList = Array.isArray(input?.headerSlots) ? input.headerSlots : [];
  for (const slot of slotList) {
    const st = String(slot?.slotType || '').toLowerCase();
    if (st === 'header-right' || st === 'title-right') {
      const nid = slot?.figmaNodeId || slot?.id;
      if (nid) headerSlotNodeIds.add(String(nid));
    }
  }
  let headerLeavesFinal = headerLeaves;
  let bodyLeavesFinal = bodyLeaves;
  if (headerSlotNodeIds.size > 0) {
    headerLeavesFinal = leaves.filter((s) => {
      const ids = Array.isArray(s?.sourceNodeIds)
        ? s.sourceNodeIds.map((v) => String(v))
        : [];
      return ids.some((id) => headerSlotNodeIds.has(id));
    });
    const headerSet = new Set(headerLeavesFinal);
    bodyLeavesFinal = leaves.filter((s) => !headerSet.has(s));
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
    lines.push(`    <div class="${rootContainerClass}">`);
    for (const b of bodyLeavesFinal) {
      lines.push(`      <${tagFor(b, 'ContentSection')} />`);
    }
    lines.push(`    </div>`);
  }
  lines.push(`  </base-panel>`);
  lines.push(`</template>`);
  return { template: lines.join('\n'), rootContainerClass, sectionRoots };
}

export async function generateIndexVue(runChunk, input, { splitDecision, allFiles }, options = {}) {
    const scriptSplit = !!splitDecision.scriptSplit;
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
      const _genPlanForCharts = input.generationInput?.componentPlan;
      const _subPlanForCharts =
        _genPlanForCharts && typeof _genPlanForCharts === 'object'
          ? _genPlanForCharts
          : input.subComponentPlan;
      const _leafForCharts = collectLeafSections(
        _subPlanForCharts?.effectiveSections || [],
      );
      const _forcedSplit =
        _subPlanForCharts?.isForced === true && _leafForCharts.length > 0;

      // 🛡️ 优雅降级：图表段失败降级为空（组件无图表仍可渲染，不 fail-closed）
      let scriptCharts = '';
      if (_forcedSplit) {
        options.logger?.info?.(
          '🧩 强制子组件拆分：主组件跳过 charts 段（图表逻辑归子组件）',
          {
            componentName: input.componentName,
            sectionCount: _leafForCharts.length,
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
      // 🛡️ 截断 </script> 之后的尾部内容（LLM 常在 script 闭合后输出自检清单/markdown，
      // 导致 replace(/<\/script>\s*$/i) 匹配不到末尾 </script>，进而把 markdown 包进 script → SFC Invalid end tag）
      const _scIdx = x.lastIndexOf('</script>');
      if (_scIdx >= 0) x = x.slice(0, _scIdx + '</script>'.length);
      // 🛡️ 剥 <script setup> 开标签和 </script> 闭标签
      x = x
        .replace(/^\s*<script\s+setup>\s*/i, '')
        .replace(/\s*<\/script>\s*$/i, '');
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
    // 仅一段有内容：原样返回该段（保留模型输出，不强制包裹重复标签）
    if (nonEmptyIdx.length === 1) return (parts[nonEmptyIdx[0]] || '').trim();
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
  const normalizeComponentId =
    options.normalizeComponentId || defaultNormalizeComponentId;
  const baseComponentId = normalizeComponentId(input?.componentName || '');
  const sessionId = String(
    input?.sessionId || input?.ctx?.sessionId || options.sessionId || '',
  ).trim();
  // 仅接受「以 hex 结尾」的 sessionId（规范形态 mc-<ts>-<8hex>）——
  // 若上游给的身份串尾段非 hex，宁可不加尾段，避免污染可剥离性契约。
  const tail = sessionId.slice(-8);
  const sessionIdSuffix = /^[0-9a-f]{8}$/.test(tail) ? tail : '';
  return {
    componentId: sessionIdSuffix
      ? `${baseComponentId}-${sessionIdSuffix}`
      : baseComponentId,
    baseComponentId,
    sessionIdSuffix,
  };
}

export async function safeGenerateDeclareJson(runChunk, input, chunkD, options = {}) {
    // 🛡️ P2 修复：componentId 必须带 "c-" 前缀（declare-json.md 规范），
    // 仅清洗 kebab-case 会导致 e2emodalp2 这类无前缀 ID 被校验器打 BLOCK。
    // 🛡️ 2026-09-04 修复截图串图：componentId 必须带 sessionId 后缀保证唯一性
    // 不同任务可能生成相同组件名（如"设备监测"→c-monitor），导致截图 URL 冲突
    // 🛡️ 刀 8a（2026-09-13）：装配逻辑抽为纯函数 resolveDeclareComponentId，见其 JSDoc。
    const { componentId } = resolveDeclareComponentId(input, options);


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

    // componentName：LLM 输出优先
    if (fragment.componentName && typeof fragment.componentName === 'string') {
      merged.componentName = fragment.componentName;
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
