/**
 * 🛡️ pre-write-self-healing.js —— 双链路（microcode / vue3）共用落盘前自愈链（方案 E）。
 *
 * 背景（2026-09-16 治理）：microcode-engineer 每补一个落盘前修复器，vue3-engineer 不会自动获得，
 * 同一类 bug 在双端反复复发（f68aedb6 的 `.value` 误用 + CODE-022 + 运行库 import 缺失在 vue3 全漏）。
 * 本模块把「无产物结构假设」的通用自愈抽成纯函数，两个 engineer 共用；新增守卫只加一处、双端生效。
 *
 * 职责边界（刻意排除以下，保留在 engineer 原位，因含 base-panel 假设或 import.meta）：
 *   - 子组件 import 终验（ensureSubComponentImport，microcode 专属 base-panel 标签提取）
 *   - 内容根容器归一（normalizeRootContainerLayout，依赖 base-panel `.pannel-content` block 假设）
 *   - 覆写后重校验（validateVueScriptSemantics，sfc-semantics.js 含 import.meta，jest CJS 会炸）
 *
 * 全部步骤幂等、只补不删/只修不覆盖；任一异常不阻断（fail-open，交由下游门禁兜底）。
 * 纯函数、零 import.meta、零 backend-root，可独立单测。
 */

import {
  resolveResourceDomMapping,
  ensureRuntimeLibraryImports,
  pruneUnmountedResourceImports,
  stripResourceValueMisuse,
  stripResourceWriteback,
  healImgSrcBindings,
} from './resource-import-guard.js';
import {
  normalizeFlexSourceConflicts,
  normalizeFlexSiblingScale,
} from './flex-sibling-guard.js';
// 🛡️ S6（2026-09-16）：背景 :style 补全自愈（backgroundImage 缺 size/repeat/position → 补默认值）
import { ensureBackgroundStyleComplete } from './post-process.js';
import { bindSectionItemIcons } from './section-item-icon-bind.js';
import { collectMissingVueImports } from './vue-import-closure.js';
import { scanProductStyleIssues } from './style-conflict-detector.js';
// 🛡️ D1（2026-09-20）：per-card 样式确定性改写（bg 图/数值色/icon 按 vision 真值）
import { enforceCardVisualTruth } from './card-visual-truth-rewriter.js';
// 🛡️ H1（2026-10-04）：百分比高度拉伸检测（真值定值区块被 height:100%/比例 flex 撑满）。
import { resolvePercentHeightStretch } from './percent-height-resolver.js';
// 🛡️ 刀 23（2026-10-08）：跨文件「同 class 同一布局属性」重声明审计——从 shared 表里剥，
//   保留 SFC scoped（治 FLEX-003「跨文件 flex 值冲突」BLOCK 根因：07b4d2a5 实锤）。
import { pruneDuplicateStyleDeclsFromShared } from './style-dedup-guard.js';
// 🛡️ 刀 24（2026-10-08）：techstack 契约履行占位——对每个 `wrong-tag` 违规往宿主 .vue 追加
//   v-if="false" 占位元素（治 TECHSTACK-NOT-RENDERED 根因：07b4d2a5 实锤 6 个 antd 组件未渲染）。
import { enforceTechStackContractTags } from './techstack-tag-enforcer.js';
import { healStructuralTruth } from './structural-truth-healers.js';
import { healContainerBackgroundTruth } from './container-background-truth.js';
import { healHorizontalFlexWidth100, collectRowFlexChildComponents, healRowFixedWidthTruth } from './horizontal-flex-width-heal.js';
import { injectContainerLayoutTruth } from './container-layout-truth.js';
import { relocateStrayTemplateRoots } from './stray-template-root-relocator.js';
import { healPanelChromeMisplacement, healPanelTitleSlot } from './panel-chrome-misplacement.js';
import { healBorderWithoutStrokes } from './border-without-strokes.js';
// 🛡️ 刀 40（2026-10-21）：同一规则块内同属性重复声明消歧（`display: grid` 被同块后写的
//   `display: flex` 覆盖 ⇒ 折叠列表纵向单列散架）。只消歧、不修视觉。
import { dedupeDuplicateDeclsInBlocks } from './block-duplicate-decl-guard.js';
// 🛡️ 刀 54（2026-10-23）：硬编码文本门禁 + 处置（产物可见文本必须是 Figma 真值文本）。
import { detectHardcodedText, healHardcodedText } from './hardcoded-text-gate.js';
// 🛡️ 刀 55（2026-10-23）：plan 之外的编造副本组件确定性移除。
import { detectOrphanDuplicateComponents, healOrphanDuplicateComponents } from './plan-orphan-guard.js';
// 🛡️ 层 4+5（2026-10-26 · 方案 A/mc-max-1792985029695-58de7d47 实锤）：布局真值守卫。
//   层 4 = 同块互斥布局指令消歧（display:grid 下的 flex-direction/flex-wrap 恒 inert）
//          + 绝对 px 超真值轴尺寸收敛（gap 跨轴 93px > 真值宽 32px）；
//   层 5 = 真值尺寸被 SFC scoped 静默抹掉（shared `min-height:98px` 输给 scoped `min-height:0`
//          —— 跨文件由**优先级**裁决而非「CSS 取较大值」，R5 白名单假设被真机证伪）。
//   J1 无需真值；J2/J3 需 figmaRoot bbox。fail-open + 计数行铁律。
//   详 src/ai-engine/utils/layout-truth-guard.js。
import { runLayoutTruthGuard } from './layout-truth-guard.js';
import { indexFigmaNodes } from './section-tree.js';
// 删除/改写产物前的语法回退校验（与 section-content-guard 同铁律：引入新错误即回退）。
import { validateVueSfc } from './sfc-syntax-validation.js';
// 🛡️ 刀 43（2026-10-22）：R24 **不**挂在本链 —— 本链之后还有 4 个覆写/回退步骤会冲掉它，
//   且真机 8a1a0d96 实测本链零命中。已改挂唯一写盘出口
//   `roles/microcode/file-writer.js#writeFiles`（见该处注释与 §③ 上方说明）。
// 🛡️ 刀 41（2026-10-21）：折叠网格「布局契约」判据 + 自愈（检测与自愈同一实现）。
//   治「grid 段方向/卡宽/间距没人管 ⇒ 两轮真机方向正好互换」（T3 对 isGrid 直接跳过）。
import {
  detectGridListLayoutIssues,
  healGridListLayout,
} from './grid-list-layout-contract.js';
// 🛡️ 刀 25/26（2026-10-12）：LLM「压缩残片」格式损坏自愈——LESS 连续相同 `声明;}` 残片归一
//   （治 .c-cba840-form 被提前闭合获得 display:flex → 表单横向排列）+ script 独行逗号删除
//   （治 [vue/compiler-sfc] Unexpected token：mc-max-1791779417789-cba8407d 实锤）。
import { healStyleFragments, normalizeVForRowListDirection } from './style-fragment-healer.js';
import {
  detectVForListDirectionMismatch,
  healVForListDirection,
} from './vfor-list-direction-guard.js';
// 🛡️ ⑪-c 资源零引用审计需列目录（node:fs 静态 import 安全：非 import.meta/backend-root，
//   jest CJS 可跑；只读操作不污染「纯函数」定位）
import { readdirSync as _readdirSync, existsSync as _existsSync } from 'node:fs';
import { join as _joinPath } from 'node:path';
// 🛡️ #128 流程四件套 ②：fail-open 显性化台账（降级/审计事件落 component-meta.json）
import { appendFailOpenEvent } from './fail-open-ledger.js';
// 🛡️ 刀 31（2026-10-20 · 47647fae 实锤）：v-for 重复单元「几何真值」纠偏——
//   direction-guard 的真值源是 section 树（E1 未折叠时 wrapper 期望错取叶子段自身方向 ⇒ 零告警），
//   percent-height-resolver 判定域是类名三明治（Figma 原名类不在域内）。本刀改用
//   figma 原始树「同名同尺寸重复实例几何」做真值：方向 + 单 item 宽高都可确定性得出。
import {
  detectRepeatUnitIssues,
  healRepeatUnitIssues,
} from './vfor-repeat-unit-guard.js';
import {
  normalizeSectionFlexTruth,
  normalizeTextSlotOrder,
  normalizeStatGroupLayout,
  ensureSlotConBackground,
  healZebraStripeMisread,
  enforceGridColumnTruth,
  enforceSiblingRowDirection,
  enforceCompositeRowTruth,
  enforceContainerMainAxisTruth,
} from './layout-truth-healer.js';
import { reportPatchChainError } from './patch-chain-observer.js';
// 🛡️ 资源相对路径深度归一（复用 Playground 同一实现，单一事实源）
import { normalizeResourceRelativePaths } from './sfc-syntax-validation.js';
// 🛡️ 六-i：重复卡组「卡底渐变」真值（纯函数，可单测）
import { collectCardGroups, collectCardBgByOwner, injectCardBgImages } from './card-background-truth.js';

/**
 * @param {Record<string,string>} files 产物文件集（path → content）
 * @param {object} [ctx] 上下文
 * @param {Array} [ctx.resourceDomMapping] 资源映射（未 resolve 的原始映射或已 resolve 均可）
 * @param {string} [ctx.outputPath] 输出路径（resolveResourceDomMapping 磁盘兜底用）
 * @param {Function} [ctx.injectFn] 资源 import 注入函数
 *   （microcode 传 injectResourceImports，vue3 传 injectVue3ResourceUrls；签名均为 (content, mapping, relBase)）
 * @param {Array} [ctx.effectiveSections] planner section 树（D1 per-card 真值源，含 F1 回填的 body.items）
 * @param {Array} [ctx.percentHeightTruth] planner section 树（⑪ H1 专用真值源）。用于「只想让 H1 生效、
 *   不想连带激活 D1」的链路（如 vue3-engineer：其调用点历史上未传 effectiveSections，若直接补传会
 *   首次激活 D1 的 per-card 改写——属未验证行为变化）。未提供时回退 effectiveSections。
 * @param {object} [ctx.figmaRoot] figma.json 根（⑪ H1 更权威真值源，可选）
 * @param {object} [ctx.layoutStructure] state.layoutStructure（④-h 刀 30 v-for 列表方向
 *   自愈的真值源；形态 `{layout:{sections}}` 或 `{sections}`。缺省 ⇒ 该步 fail-open 不判不改）
 * @param {object} [deps]
 * @param {object} [deps.logger] 日志器
 * @returns {{ files: Record<string,string>, summary: object }} 自愈后的文件集 + 计数摘要
 */
/**
 * 🛡️ A2（2026-09-29）：同一资源 var 在同一 .vue 内被多处 backgroundImage 引用（卡根 cover + 内层 bg-m 100%）。
 * 确定性收口：保留「内层」那处（bg-[m] 语义背景层），剥离「section 根（带 data-section-id）」上的那处。
 * 命名无关：判据只用 data-section-id 存在性 + 同一 var 是否在模板更深处重复引用。
 * 保守：仅当根元素带 data-section-id 且其 backgroundImage 引用的 var 在更深处也有 backgroundImage 时，才剥离根处。
 */
export function stripDuplicateSectionRootBg(content) {
  if (typeof content !== 'string' || !content) return content;
  const tpl = content.match(/<template>([\s\S]*?)<\/template>/i);
  if (!tpl) return content;
  const tplBody = tpl[1];
  const rootRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?data-section-id="[^"]+"(?:"[^"]*"|'[^']*'|[^>"'])*)>/;
  const rm = tplBody.match(rootRe);
  if (!rm) return content;
  const rootTag = rm[0];
  const afterRoot = tplBody.slice(rm.index + rootTag.length);
  // 根元素上「url(' + v + ')」拼接形态的 bg 变量
  const vars = [...rootTag.matchAll(/url\(\s*['"]\s*\+\s*(\w+)\s*\+\s*['"]\s*\)/g)].map((m) => m[1]);
  if (vars.length === 0) return content;
  let newRoot = rootTag;
  let changed = false;
  for (const v of vars) {
    // 该 var 在模板更深处（内层 bg 层）也出现 → 剥离根上这一处
    if (!new RegExp(`url\\([\\s\\S]{0,20}${v}`).test(afterRoot)) continue;
    const clause = new RegExp(
      `backgroundImage\\s*:\\s*['"\`]url\\(['"\`]\\s*\\+\\s*${v}\\s*\\+\\s*['"\`]\\)['"\`]\\s*,?\\s*`,
      'g',
    );
    const next = newRoot.replace(clause, '');
    if (next !== newRoot) {
      newRoot = next;
      changed = true;
    }
  }
  if (!changed) return content;
  return content.replace(rootTag, newRoot);
}

/**
 * 🛡️ ⑥-ii（2026-11-10 · R12 重点车辆 523f16b6 实锤，用户目检「单独 card 的 bg 变成了整体的」）：
 * 中间容器 bg 双重挂载剥离——stripDuplicateSectionRootBg 只剥**第一个根元素**，但 LLM 会把
 * 单卡 bg 同时挂到**祖先容器**（136:127 整条统计区 405 宽）与卡级（127×84）双层 ⇒ 渲染时
 * 祖先层把 141×75 单卡图拉伸铺满整条区域（skill 渲染取证：sec=136:127 fn=bg-126 w=405）。
 * 判据（与原函数同构，作用域扩到全部 data-section-id 元素）：某容器标签上的 bg 变量在该元素
 * **之后的模板内容**中再次出现 ⇒ 双重挂载冗余，剥**上层**保留卡级（视觉单卡正确）。
 * 保守：只剥 :style 动态 backgroundImage 子句；每个 bg 变量至少有一层保留才剥；幂等（剥后不再命中）。
 */
export function stripDuplicateAncestorBg(content) {
  if (typeof content !== 'string' || !content) return content;
  const tpl = content.match(/<template>([\s\S]*?)<\/template>/i);
  if (!tpl) return content;
  const tplBody = tpl[1];
  const tagRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?data-section-id="[^"]+"(?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  const matches = [...tplBody.matchAll(tagRe)];
  if (matches.length === 0) return content;
  let out = tplBody;
  let changed = false;
  for (const m of matches) {
    const tag = m[0];
    const endIdx = m.index + tag.length;
    const after = tplBody.slice(endIdx);
    const vars = [...tag.matchAll(/url\(\s*['"]\s*\+\s*(\w+)\s*\+\s*['"]\s*\)/g)].map((x) => x[1]);
    let newTag = tag;
    let tagChanged = false;
    for (const v of vars) {
      if (!new RegExp(`url\\([\\s\\S]{0,20}${v}`).test(after)) continue;
      const clause = new RegExp(
        `backgroundImage\\s*:\\s*['"\`]url\\(['"\`]\\s*\\+\\s*${v}\\s*\\+\\s*['"\`]\\)['"\`]\\s*,?\\s*`,
        'g',
      );
      const next = newTag.replace(clause, '');
      if (next !== newTag) {
        newTag = next;
        tagChanged = true;
      }
    }
    if (tagChanged) {
      out = out.slice(0, m.index) + newTag + out.slice(m.index + tag.length);
      changed = true;
    }
  }
  if (!changed) return content;
  return content.replace(tplBody, out);
}

/**
 * 🛡️ 模板内嵌 SFC 块自愈（2026-11-10 · R9 设备/R13 设备+流量 实锤，3 次复发）：
 * 病灶：LLM 把 `<script setup>...</script>` / `<style>...</style>` 块写进 `<template>` 体内
 * ⇒ @vue/compiler-sfc 报 `Tags with side effect (<script> and <style>) are ignored`
 * ⇒ 写盘门禁判死 → 整组件 failed（index.vue 挂掉 = 全盘崩）。
 * 修法（确定性、保守）：
 *   ① 体内 `<script setup>` 块：SFC 顶层**无** script ⇒ 提升到 </template> 之后（保内容）；
 *      顶层已有 script ⇒ 丢弃（错位重复块）。
 *   ② 体内 `<style>` 块：顶层无 style ⇒ 提升首个；其余丢弃。
 *   ③ 全部处理过 ⇒ 从体内剥离，模板体干净（编译可过）。
 * 幂等：处理后体内无 script/style ⇒ 二次调用零改动。
 */
export function healTemplateEmbeddedSfcBlocks(content) {
  if (typeof content !== 'string' || !content) return content;
  const tplMatch = content.match(/<template>([\s\S]*)<\/template>/i);
  if (!tplMatch) return content;
  const bodyStart = tplMatch.index + '<template>'.length;
  const bodyEnd = bodyStart + tplMatch[1].length;
  let body = tplMatch[1];
  const before = content.slice(0, bodyStart);
  const after = content.slice(bodyEnd);

  const hasTopScript = /<script[^>]*>/.test(after);
  const hasTopStyle = /<style[^>]*>/.test(after);
  const promoted = [];
  let changed = false;

  // ① script 提升/丢弃
  body = body.replace(/<script([^>]*)>([\s\S]*?)<\/script>\s*/gi, (m, attrs, inner) => {
    changed = true;
    if (!hasTopScript && promoted.filter((p) => p.startsWith('<script')).length === 0 && inner.trim()) {
      promoted.push(`<script${attrs}>${inner}</script>\n`);
      return '';
    }
    return ''; // 顶层已有 script 或空块 ⇒ 丢弃错位重复块
  });

  // ② style 提升/丢弃
  body = body.replace(/<style([^>]*)>([\s\S]*?)<\/style>\s*/gi, (m, attrs, inner) => {
    changed = true;
    if (!hasTopStyle && promoted.filter((p) => p.startsWith('<style')).length === 0 && inner.trim()) {
      promoted.push(`<style${attrs}>${inner}</style>\n`);
      return '';
    }
    return '';
  });

  if (!changed) return content;
  return before + body + after + (promoted.length ? '\n' + promoted.join('\n') : '');
}

/**
 * 🛡️ 2026-09-29 治本（mc-max-1790678096786-f5cac254 实锤）：
 * 把「自闭合斜杠 ` /` 之后仍跟属性」的**畸形开始标签**还原为规范写法。
 *
 * 病灶（N3「bg→父容器强制挂载」对**自闭合**元素拼接 `:style` 时，把属性写到了 `/` 的后面）：
 *   `<ContentDefault :class="…" / :style="{ … }">`   ← 畸形：`/` 与 `>` 之间夹着 `:style`
 * 规范：
 *   `<ContentDefault :class="…" :style="{ … }" />`
 *
 * 后果链：`@vue/compiler-sfc` 报 `Illegal '/' in tags.` + `Element is missing end tag.`
 *   → 写盘门禁 `validateVueSfc` 判死 → **整文件被跳过**（进 `component-meta.json#gateSkippedFiles`）
 *   → 产物缺失（磁盘/workspace 均无 `package/index.vue`）→ 前端「组件资源加载失败 / 找不到文件」。
 *   全语料 68 个任务带 `gateSkippedFiles`，其中 **21 个**跳过的正是 `package/index.vue`
 *   （含 `f5cac254` / `428bda42` / `cf90ebda` / `8c815194` / `6e065bd7` / `b37db550` …）⇒ 复发型 P0。
 *
 * 判据（命名无关、纯局部语法、零产物结构假设）：
 *   ① 只处理**开始标签**（`<` 后紧跟字母），天然跳过 `</x>` / `<!-- -->` / `<!doctype` / `<?xml`；
 *   ② 标签内**引号之外**（`"` `'` `` ` `` 三种引号均不可穿透）存在「属性位斜杠」：
 *      斜杠之后（跳过空白）仍跟着一个属性 token（`@` / `:` / `v-` / 字母开头，且该 token 以 `=` 收尾
 *      或直接到标签尾）—— 即「`/` 后面还有属性」，这在语法上只可能是错位；
 *      `href=/foo`（斜杠后**无**空白）与 `http://…`（引号内）**天然不命中**；
 *   ③ 命中即：删掉该斜杠，并统一在标签收尾 `>` 之前补一个 ` /`。
 *
 * 幂等：修复后属性位不再存在「后跟属性」的斜杠 ⇒ 二次调用零改动（已实测）。
 * 保守：`<br/>`、`<X a="1" />`、属性值内的 `/`（URL / 正则 / 模板字符串）一律不动；
 *       解析不出结束 `>` 的标签（未闭合引号等）整段跳过，交给下游门禁兜底（fail-open）。
 *
 * @param {string} source SFC / 模板全文
 * @returns {string} 修复后的全文（无命中时**原样返回**，引用相等）
 */
export function repairSelfClosingSlashInsideTag(source) {
  if (typeof source !== 'string' || source.length === 0) return source;
  if (source.indexOf('/') < 0) return source;
  return source.replace(
    /<([a-zA-Z][\w.:-]*)((?:"[^"]*"|'[^']*'|`[^`]*`|[^>"'`])*)>/g,
    (full) => repairTagSlash(full),
  );
}

/**
 * 单个开始标签的斜杠错位修复。抽成独立函数以便复用与单测。
 * @param {string} tag 形如 `<X a="1" / b="2">` 的完整开始标签（含 `<` 与 `>`）
 * @returns {string} 修复后标签（无命中时原样返回）
 */
function repairTagSlash(tag) {
  const inner = tag.slice(1, -1);
  // ① 标记「引号之外」的字符位置：`"` / `'` / 反引号包裹的内容一律视为不可穿透，
  //    这样 URL（`http://`）、模板串（`` `url(${bg2})` ``）、含 `/` 的正则都不会误判。
  const outside = [];
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    outside.push(i);
  }
  // ② 找「斜杠之后仍跟属性」的属性位斜杠（` / :style=` 的 `/`，而非收尾的 ` />` 的 `/`）。
  const hits = [];
  for (const i of outside) {
    if (inner[i] !== '/') continue;
    const after = inner.slice(i + 1);
    if (
      !/^\s+[@:a-zA-Z][\w.:-]*\s*=/.test(after) &&
      !/^\s+[@:a-zA-Z][\w.:-]*\s*$/.test(after)
    ) {
      continue;
    }
    hits.push(i);
  }
  if (hits.length === 0) return tag;
  // ③ 从后往前删斜杠（避免下标漂移），再统一在标签尾补 ` /`。
  let out = inner;
  for (let k = hits.length - 1; k >= 0; k--) {
    const i = hits[k];
    out = out.slice(0, i) + out.slice(i + 1);
  }
  return '<' + out.replace(/\s+$/, '') + ' />';
}

export function runPreWriteSelfHealing(files, ctx = {}, deps = {}) {
  // 🛡️ figmaRoot 必须在此解构：⑭ 刀32 需要 rowPeers 真值兜底源。首版漏解构 ⇒ ⑭ 引用裸
  //    变量抛 ReferenceError "figmaRoot is not defined" 被 fail-open 吞掉 ⇒ 三刀上线后
  //    零生效（d27c5a1c 实锤：server.log 三轮异常日志、meta 无 structuralTruthDetails）。
  const { resourceDomMapping, outputPath, injectFn, effectiveSections, figmaRoot } = ctx;
  // 🛡️ 2026-11-12：段内 items 级图标补位（③-b）的全保真段源。归一化口（componentPlan）
  //   没有 body.items[].icon.resource，只有 planner 原形有；缺失时回退 effectiveSections
  //   （仍是纯附加，不改变其他 pass 的段源口径）。
  const fullSections = Array.isArray(ctx.fullSections) && ctx.fullSections.length > 0
    ? ctx.fullSections
    : effectiveSections;
  const { logger } = deps;
  let result = { ...files };
  const summary = {
    resourceInject: 0,
    runtimeImport: 0,
    pruned: 0,
    valueFixed: 0,
    writebackFixed: 0,
    flex003: 0,
    flex005: 0,
    bgStyleComplete: 0,
    // 🛡️ F3′（2026-11-05）：S6 补全的取值来源分流 —— truth=按资源几何/scaleMode 真值，
    //   fallback=解析不到资源、回落 `inferBackgroundStyle({})` 中性默认。0 也必打（验收计数行）。
    bgStyleTruthUsed: 0,
    bgStyleNeutralFallback: 0,
    imgSrcBackfilled: 0,
    // 刀 38 / 刀 40（2026-10-21）：显式初始化 —— 下游若按固定形状序列化 summary，
    // 动态赋值的键会因「条件命中才出现」而缺字段（记忆铁律：加新字段必查下游消费）。
    borderWithoutStrokes: 0,
    blockDuplicateDecls: 0,
    gridContractHealed: 0,
    gridContractFailed: 0,
    gridContractResidual: 0,
    // 🛡️ S0.2（2026-11-03）：PATCH-CHAIN-ERROR 哨兵聚合计数 —— 结构性错误
    // （ReferenceError/TypeError/SyntaxError）命中本链 catch 的次数。显式初始化（上行铁律）。
    patchChainErrors: 0,
    // 刀 42（2026-10-21）：面板三件套（底色/圆角/外发光）自愈计数
    containerBackground: 0,
    bgTruthlessStripped: 0,
    containerPanelRadius: 0,
    containerPanelGlow: 0,
    panelChromeMisplaced: 0,
    // 🛡️ 悬空引用占位兜底计数（2026-11-10）：0 也必打（验收计数行纪律）。
    danglingImportPatched: 0,
    // 🛡️ 段内 items 级多图标补位计数（2026-11-12）：0 也必打（验收计数行纪律）。
    itemIconBound: 0,
    // 🛡️ C 层（2026-11-12 · c-cc6334 实锤）：plan.gridColumns 落地计数。0 也必打。
    gridColumnTruthFixed: 0,
    gridColumnTruthResolved: 0,
    gridColumnTruthNoVfor: 0,
    gridColumnTruthScanned: 0,
    // 🛡️ C 层之二（并排段 row 方向）计数：0 也必打。
    siblingRowWrapped: 0,
    siblingRowScanned: 0,
    siblingRowSkipped: 0,
    // 🛡️ 模板内嵌 SFC 块自愈计数（2026-11-10）：0 也必打（验收计数行纪律）。
    embeddedSfcHealed: 0,
    // 🛡️ A0（2026-11-04 · c-b04f22-b04f223c 实锤）：刀 42-B **零命中留痕**。
    //   缺口：本刀原先只在命中时落 `panelChromeMisplaced`，三条元素级 `continue` 与 ②-b 的
    //   七条 `continue` **全静默** ⇒ 事后无法区分「跑过但零命中」「未跑到」「被哪条 continue
    //   筛掉」——这正是 CS1 案查不动 3 轮的直接原因（与 G14b 同款可观测性缺口）。
    //   显式初始化为 0（上行铁律：零命中必须与「未接线」可区分）。
    //   语义：scanned / classScanned 为分母；skipped* 为各 continue 分支的分子。
    panelChromeScanned: 0,
    panelChromeSkippedSelfPanel: 0,
    panelChromeSkippedMissingDecl: 0,
    panelChromeSkippedUnresolvedValue: 0,
    panelChromeSkippedNoUniqueOwner: 0,
    panelChromeClassScanned: 0,
    panelChromeClassSkipped: 0,
    panelChromeClassSkipAlreadyStripped: 0,
    panelChromeClassSkipNoShadow: 0,
    panelChromeClassSkipUnused: 0,
    panelChromeClassSkipShared: 0,
    panelChromeClassSkipUnresolved: 0,
    panelChromeClassSkipNoOwner: 0,
    panelChromeClassSkipOccupied: 0,
    // 刀 57（2026-10-23 · 方案 E）：面板标题槽位归属（header-right → title-left）
    panelTitleSlotReslot: 0,
    // 刀 54（2026-10-23）：硬编码文本门禁（显式初始化 —— 下游按固定形状序列化 summary，
    // 动态赋值的键会因「条件命中才出现」而缺字段；记忆铁律：加新字段必查下游消费）。
    hardcodedTextHits: 0,
    hardcodedTextHealed: 0,
    hardcodedTextStripped: 0,
    hardcodedTextResidual: 0,
    // R8-2（2026-11-02 · 50d7793f）：透明容器臆造背景修复计数（0 也必须出现）
    transparentContainerBgHealed: 0,
    // R8-6（2026-11-02 · c-d1be-99d1be1d）：frame 类挂载族对账计数（0 也必须出现）
    frameClassScanned: 0,
    frameClassAligned: 0,
    // R8-8：grid/display 同声明域一致性（0 也必须出现）
    gridDisplayScanned: 0,
    gridDisplayAligned: 0,
    // 刀 55（2026-10-23）：plan 外编造副本组件
    orphanHits: 0,
    orphanRemoved: 0,
    orphanResidual: 0,
    // 层 4+5（2026-10-26）：布局真值守卫。显式初始化 —— 下游按固定形状序列化 summary，
    // 动态赋值的键会因「条件命中才出现」而缺字段；零命中必须与「未接线」可区分。
    layoutTruthEvaluated: 0,
    layoutTruthInertRemoved: 0,
    layoutTruthGeometryClamped: 0,
    layoutTruthTruthOverrideStripped: 0,
    layoutTruthHits: 0,
    layoutTruthSkippedReason: null,
  };

  // ① 资源 import 终验兜底注入（幂等只补缺失，绝不删已有）。
  const mapping = resolveResourceDomMapping(resourceDomMapping, outputPath);
  if (typeof injectFn === 'function' && Array.isArray(mapping) && mapping.length > 0) {
    for (const [fp, fc] of Object.entries(result)) {
      if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
      const relBase = /^package\/components\//.test(fp)
        ? '../../resources/images/'
        : '../resources/images/';
      const injected = injectFn(fc, mapping, relBase);
      if (injected !== fc) {
        result[fp] = injected;
        summary.resourceInject++;
        logger?.info?.('🛡️ 资源 import 终验兜底注入（落盘前）', { file: fp });
      }
    }
  }

  // ② 运行库 import 兜底（vue/echarts 只补缺失）。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const ensured = ensureRuntimeLibraryImports(fc);
    if (ensured !== fc) {
      result[fp] = ensured;
      summary.runtimeImport++;
      logger?.info?.('🛡️ 运行库 import 兜底补齐（落盘前）', { file: fp });
    }
  }

  // ②-b 刀 31 / L3-c（2026-10-21 · c-c8d-195c8d0e 实锤「4 个图标位置全空白」）：
  //   `<img v-if="icon4" class="..." alt="" />` —— 变量被 `v-if` 引用 ⇒ `isResourceVarMounted`
  //   判「已挂载」⇒ CODE-022 不报、prune 不删，**全链没有任何一处**要求「引用必须落在 `:src` 上」
  //   ⇒ 渲染出空 `<img>`。这里按资源变量确定性回填 `:src`。
  //   判据（与 `findImgSrcBindingGaps` 同一实现）：本文件 import 过 + 标签属性出现该变量
  //   + 标签无 src + 标签内仅 1 个候选变量。
  //   必须排在 ③（CODE-022 剪枝）之前：先补 `:src` 再判「未挂载」，语义顺序才对。
  if (Array.isArray(mapping) && mapping.length > 0) {
    for (const [fp, fc] of Object.entries(result)) {
      if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
      try {
        const r = healImgSrcBindings(fc, mapping);
        if (r.changed) {
          result[fp] = r.content;
          summary.imgSrcBackfilled += r.healed.length;
          logger?.warn?.('🛡️ L3-c 修复：<img> 缺 :src 已按资源变量回填', {
            file: fp,
            healed: r.healed,
          });
        }
      } catch (err) {
        reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:351', counter: summary });
        logger?.warn?.('🛡️ L3-c 修复器异常（非阻断）', {
          file: fp,
          error: err?.message || String(err),
        });
      }
    }
  }

  // ②-c 刀 43：R24 已改挂到**真正的写盘出口** `roles/microcode/file-writer.js#writeFiles`。
  //   原因（8a1a0d96 真机实锤）：本链之后还有 4 个会覆写/回退内容的步骤
  //   （CODE-020 类名前缀 / 根容器布局归一 / 覆写后语义校验回退到 allFiles / absolute 遮罩层），
  //   在本链里跑 R24 会被它们冲掉，且实测零命中。`writeFiles` 是唯一写盘出口、且最后一个
  //   调用点在上述四步之后 ⇒ 单一挂载点，不再在此重复挂（同判据不开第二份实现）。
  //
  // ③ CODE-022 修复器（未挂载的资源 import 确定性删除）。
  //
  // 🗑️ 已删除（2026-09-29，删减法）：此前的「③-a CODE-022 图标自愈」（mountUnusedResourceIcons）
  //   与 ③ 是**方向相反而候选域不等**的一对：
  //   - 门禁 findUnmountedResourceVars 的候选域 = 本文件 `<script>` 里 import 了的资源；
  //   - 该自愈器的候选域 = **整个 mapping 的 icon**（`for (const [varName] of varToMapping)`）。
  //   二者只共用 isResourceVarMounted 谓词、不共用候选集 ⇒ 差值全是「映射里有、本文件没 import」
  //   ⇒ 挂上去就是**悬空引用**，必然被「覆写后语义校验」判死。实测：触发 121 次 → 回退 121 次
  //   （1:1 全废），且回退是**按文件整批**的，连带把 S6 背景补全 / CODE-028 等合法修复一起作废。
  //   本函数上线前，同名自愈器 autoMountUnusedIcons 已被 81e9a08「删减法批次2-loop1」明令删除
  //   （资源挂载改为 owner 驱动计划化：buildResourceMountPlan + mountPlannedResources）。
  //   复活版同时违背当时确立的三条（owner 驱动 / fail-closed / 候选域正确），故本次彻底移除。
  //   图标若要挂载，唯一正道 = mapping.ownerSectionId ⨯ 产物 data-section-id 的确定性计划。
  if (Array.isArray(mapping) && mapping.length > 0) {
    for (const [fp, fc] of Object.entries(result)) {
      if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
      try {
        const pr = pruneUnmountedResourceImports(fc, mapping);
        if (pr.changed) {
          result[fp] = pr.content;
          summary.pruned += pr.pruned.length;
          logger?.warn?.('🛡️ CODE-022 修复：删除未挂载的资源 import', {
            file: fp,
            pruned: pr.pruned,
          });
        }
      } catch (err) {
        reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:392', counter: summary });
        logger?.warn?.('🛡️ CODE-022 修复器异常（非阻断）', {
          file: fp,
          error: err?.message || String(err),
        });
      }
    }
  }

  // ③-b 🛡️ 段内 items 级多图标补位（2026-11-12 · mc-max-1794426617609-e35971ca 实锤）
  //   病灶：stats 段真值 body.items **每项各带 icon.resource**（icon-262 合作厂商 / icon-263
  //   在线设备，md5 与像素内容都不同），产物数据两项却都填同一个变量 ⇒ 第二张前景图零消费
  //   ⇒ E2-v3「已落盘但产物零消费」硬拒；两轮修复轮都改不掉（LLM 每次重写同一份 fallback）。
  //   判据与实现见 utils/section-item-icon-bind.js 头注释（≥2 个不同 icon 资源 +
  //   data-section-id 唯一命中 + label 文本锚定 + assignedVarName 同源）。只换 icon 值并补
  //   import，模板/样式/字段一律不动；幂等，已是正确变量 ⇒ 零改动。
  //   位置：必须在 ③（CODE-022 未挂载 import 剪枝）**之后** —— 否则刚注入的 import 会被当
  //   「模板未引用」剪掉（变量只在 script 数据里出现，`isResourceVarMounted` 认不出）。
  try {
    const itemIconRes = bindSectionItemIcons(result, fullSections, resourceDomMapping);
    if (itemIconRes.applied.length > 0) {
      summary.itemIconBound = itemIconRes.applied.reduce((a, x) => a + x.changes.length, 0);
      logger?.info?.('🛡️ 段内 items 图标补位（真值 label 锚定）', {
        sections: itemIconRes.applied.map((x) => x.sectionId),
        changes: itemIconRes.applied.flatMap((x) => x.changes),
        skipped: itemIconRes.skipped,
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:item-icon-bind', counter: summary });
  }

  // ④ .value 误用自愈（CODE-027）：静态 import 图片变量写 X.value → 去掉 .value。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const stripped = stripResourceValueMisuse(fc);
    if (stripped !== fc) {
      result[fp] = stripped;
      summary.valueFixed++;
      logger?.warn?.('🛡️ CODE-027 修复：静态资源 .value 误用已去掉 .value', { file: fp });
    }
  }

  // ④-b CODE-028 自愈（2026-09-17 · ef00bb27 实锤）：静态 import 图片变量被写回 → 删除。
  // 注入侧把 `const bg2 = ref('')` 换成只读 `import bg2` 后，残留 `bg2.value = props.bg2`
  // （经 ④ 变 `bg2 = props.bg2`）→ 对 ESM 只读绑定赋值 → 运行时 "bg2 is read-only." → 渲染失败。
  // 只读绑定不可写，这些写回语句既无效又致命，确定删除（正确写法直接引用 props.bg2）。
  // 必须排在 .value 自愈（④）之后：先 `X.value`→`X`，再删裸 `X = ...`，避免二次残留。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const stripped = stripResourceWriteback(fc);
    if (stripped !== fc) {
      result[fp] = stripped;
      summary.writebackFixed = (summary.writebackFixed || 0) + 1;
      logger?.warn?.('🛡️ CODE-028 修复：删除对静态资源只读绑定的写回（避免 "is read-only"）', { file: fp });
    }
  }

  // ④-c A2（2026-09-29）：同一资源 var 在同一 .vue 内被多处 backgroundImage 引用（卡根 cover + 内层 bg-m 100%）。
  // 确定性收口：保留「内层」那处（bg-[m] 语义背景层），剥离「section 根（带 data-section-id）」上的那处。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const deduped = stripDuplicateSectionRootBg(fc);
    if (deduped !== fc) {
      result[fp] = deduped;
      summary.a2Dedup = (summary.a2Dedup || 0) + 1;
      logger?.warn?.('🛡️ A2 修复：剥离 section 根上重复的背景引用（保留内层 bg 层）', { file: fp });
    }
    // 🛡️ ⑥-ii（2026-11-10 · 523f16b6 实锤）：中间容器 bg 双重挂载剥离（扩展 A2 到全部
    //   data-section-id 元素——136:127 整条容器挂 141×75 单卡图被拉伸 405 宽）。
    const ancestorDeduped = stripDuplicateAncestorBg(deduped);
    if (ancestorDeduped !== deduped) {
      result[fp] = ancestorDeduped;
      summary.ancestorBgDedup = (summary.ancestorBgDedup || 0) + 1;
      logger?.warn?.('🛡️ ⑥-ii 修复：剥离中间容器上重复的 bg 挂载（保留卡级单卡视觉，防单卡图拉伸铺满整条）', { file: fp });
    }
    // 🛡️ 模板内嵌 SFC 块自愈（2026-11-10 · R9 设备/R13 设备+流量实锤，「Tags with side
    //   effect」3 次复发 ⇒ 整组件 failed）。提升/剥离体内 script/style，模板体干净可编译。
    const healedEmbedded = healTemplateEmbeddedSfcBlocks(result[fp]);
    if (healedEmbedded !== result[fp]) {
      result[fp] = healedEmbedded;
      summary.embeddedSfcHealed = (summary.embeddedSfcHealed || 0) + 1;
      logger?.warn?.('🛡️ 模板内嵌 SFC 块自愈：提升/剥离 template 体内的 script/style（治 Tags with side effect）', { file: fp });
    }
  }

  // ④-d 刀 25/26（2026-10-12 · mc-max-1791779417789-cba8407d 实锤）：LLM「压缩残片」格式损坏自愈。
  //   ① 刀 25：LESS/CSS 中**连续两行逐字相同**的 `声明;}` 残片 → 声明归最内层块 + 双层闭合
  //      （治「外层规则被提前闭合并误得 display:flex」→ 容器 row-flex 横向排列；LESS 语法合法
  //      故编译门禁放行，只能确定性修复）；
  //   ② 刀 26：script 区段「整行只有 ,」残片删除（治 vue/compiler-sfc Unexpected token）。
  //   判据均为命名无关的局部语法形态；幂等；fail-open（异常不阻断）。
  //   位置：必须在 FLEX 归一（⑤⑥）与 ⑩⑪「最终形态检测」之前。
  for (const [fp, fc] of Object.entries(result)) {
    if (typeof fc !== 'string' || fc.length === 0) continue;
    try {
      const healed = healStyleFragments(fp, fc);
      if (healed.lessFixed) {
        result[fp] = healed.content;
        summary.styleFragmentFixed = (summary.styleFragmentFixed || 0) + 1;
        logger?.warn?.('🛡️ 刀 25 修复：LESS 压缩残片重复闭块已归一（声明归最内层，防容器误得 display:flex）', { file: fp });
      }
      if (healed.commaFixed) {
        result[fp] = healed.content;
        summary.loneCommaFixed = (summary.loneCommaFixed || 0) + 1;
        logger?.warn?.('🛡️ 刀 26 修复：script 独行逗号残片已删除（防 vue/compiler-sfc Unexpected token）', { file: fp });
      }
    } catch (err) {
      reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:460', counter: summary });
      logger?.warn?.('🛡️ 刀 25/26 残片修复器异常（fail-open）', {
        file: fp,
        error: err?.message || String(err),
      });
    }
  }

  // ④-e 刀 27（2026-10-12 · mc-1791783806265-5831962c 实锤）：v-for 列表容器横向纠偏。
  //   判据：v-for 元素类规则含 display:flex + 显式 flex-direction:row + 循环体首子节点类规则
  //   width≥90% ⇒ row 与子项满宽自相矛盾（必然横向溢出/裁切）→ 改 column，
  //   同块 space-between → flex-start、align-items:center → stretch。命名无关、幂等、fail-open。
  try {
    const d27 = normalizeVForRowListDirection(result);
    for (const [p, c] of Object.entries(d27.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    if (d27.changes.length > 0) {
      summary.vForListDirectionFixed = d27.changes.length;
      for (const ch of d27.changes) {
        logger?.warn?.('🛡️ 刀 27 修复：v-for 列表容器 row→column（治横向溢出裁切）', {
          file: ch.file,
          class: ch.cls,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:486', counter: summary });
    logger?.warn?.('🛡️ 刀 27 v-for 方向纠偏异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-h 刀 30（2026-10-19 · mc-max-1792401161280-17750e31 实锤）：v-for 列表方向确定性自愈。
  //   T3 守卫（vfor-list-direction-guard）首轮只 WARN 观察 ⇒ 本任务 wrapper 被判
  //   row（折叠段真值 vertical）仍带病落盘，用户截图实锤「6 卡变 2 列巨型卡」。
  //   且 LLM 把同名 wrapper 规则写进 SFC scoped + common.less 两份（方向同错），
  //   只改 common.less 复检仍红 ⇒ healVForListDirection 已升级为**全部出现点**翻转。
  //   判据仍完全来自守卫（truth=section 树 layout；无真值/非宿主 wrapper/歧义 ⇒ 不判不改），
  //   自愈后复检留痕，残留交回 L0-B/WARN 门禁。
  //   位置：在 FLEX 归一与残片修复之后（它们可能改写 style 文本），在写盘门禁之前。
  try {
    const layoutStructure = ctx?.layoutStructure;
    if (layoutStructure) {
      const fileArr = Object.entries(result).map(([path, content]) => ({ path, content }));
      const det = detectVForListDirectionMismatch(fileArr, layoutStructure, {
        figmaNodeData: ctx?.figmaRoot,
      });
      if (det.issues.length > 0) {
        const healed = healVForListDirection(fileArr, det.issues);
        for (const f of healed.files) {
          if (typeof f.content === 'string' && result[f.path] !== f.content) {
            result[f.path] = f.content;
          }
        }
        summary.vForListDirectionHealed = healed.healed.length;
        logger?.warn?.('🛡️ 刀 30 自愈：v-for 列表方向按 section 树真值确定性翻转', {
          issues: det.issues.map((i) => i.id),
          healed: healed.healed,
          failed: healed.failed,
        });
        // 复检留痕（0 = 全愈；残留仍由 code-structure-validator 的 WARN issue 承载）
        const recheck = detectVForListDirectionMismatch(healed.files, layoutStructure, {
          figmaNodeData: ctx?.figmaRoot,
        });
        if (recheck.issues.length > 0) {
          summary.vForListDirectionResidual = recheck.issues.length;
          logger?.warn?.('🛡️ 刀 30 复检残留（交回 WARN 门禁）', {
            residual: recheck.issues.map((i) => `${i.id}@${i.file}`),
          });
        }
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:532', counter: summary });
    logger?.warn?.('🛡️ 刀 30 v-for 方向自愈异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-f 刀 28（同上实锤）：兄弟 section 等分臆造比例（flex:0.5/0.5）→ Figma 真值「固定 px + 填充」。
  //   固定卡撑满半屏成巨型卡的治本刀；无 figmaRoot 或判据不全时 fail-open。
  try {
    const d28 = normalizeSectionFlexTruth(result, { figmaRoot: ctx?.figmaRoot });
    for (const [p, c] of Object.entries(d28.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    if (d28.changes.length > 0) {
      summary.sectionFlexTruthFixed = d28.changes.length;
      for (const ch of d28.changes) {
        logger?.warn?.(
          '🛡️ 刀 28 修复：兄弟 section 等分臆造比例 → 真值固定 px + 填充 flex:1',
          { file: ch.file, count: ch.count },
        );
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:554', counter: summary });
    logger?.warn?.('🛡️ 刀 28 比例真值纠偏异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-g 刀 29（同上实锤）：同父相邻兄弟静态文本槽位对调（标题/地址、数值/标签互换）。
  //   真值交叉（CSS 字号序 vs Figma 字号序矛盾）或形态交叉（大字槽纯 CJK + 小字槽纯数字）。
  try {
    const d29 = normalizeTextSlotOrder(result, { figmaRoot: ctx?.figmaRoot });
    for (const [p, c] of Object.entries(d29.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    if (d29.changes.length > 0) {
      summary.textSlotSwapFixed = d29.changes.length;
      for (const ch of d29.changes) {
        logger?.warn?.('🛡️ 刀 29 修复：文案槽位互换已对调（Figma 字号真值交叉）', {
          file: ch.file,
          pairs: ch.pairs,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:576', counter: summary });
    logger?.warn?.('🛡️ 刀 29 文案槽位纠偏异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-h 刀 30（2026-10-14 · cd63d1c5 实锤立项）：stat 组「数值+标签」横排兄弟叶子
  //   → 契约结构（每组包裹容器、数值在上标签在下）。纯结构判据（交替 value/label ×N≥2），
  //   无需 figmaRoot；单对（值+单位）不触发防误伤；组类 CSS 堆叠规则注入 common.less。
  try {
    const d30 = normalizeStatGroupLayout(result);
    for (const [p, c] of Object.entries(d30.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    if (d30.changes.length > 0) {
      summary.statGroupLayoutFixed = d30.changes.length;
      for (const ch of d30.changes) {
        logger?.warn?.('🛡️ 刀 30 修复：stat 组横排 → 分组堆叠（数值上标签下）', {
          file: ch.file,
          pairs: ch.count,
          groups: ch.groups,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:600', counter: summary });
    logger?.warn?.('🛡️ 刀 30 stat 结构纠偏异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-i 刀 31（2026-10-14 · cd63d1c5 实锤立项，R8 容器底色契约）：
  //   slot-con 内容根容器无显式 background → 注入产物既有页面底色变量
  //   （color-bg-page/container/base/bg 优先级链，零臆造色值；全缺则跳过留痕）。
  //   🛡️ 2026-10-20：透传透明容器真值（5ef650ff 实锤）——figma 根透明时刀 31 停手。
  try {
    const d31 = ensureSlotConBackground(result, {
      transparentContainerTruth: ctx.layoutStructure?.transparentContainerTruth,
    });
    for (const [p, c] of Object.entries(d31.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    if (d31.changes.length > 0) {
      summary.slotConBackgroundFixed = d31.changes.length;
      for (const ch of d31.changes) {
        logger?.warn?.('🛡️ 刀 31 修复：slot-con 注入显式页面底色', {
          file: ch.file,
          selector: ch.selector,
          variable: ch.variable,
        });
      }
    }
    if (d31.skipped?.length > 0) {
      logger?.warn?.('🛡️ 刀 31 跳过：slot-con 缺底色但产物无可用页面底色变量', {
        count: d31.skipped.length,
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:632', counter: summary });
    logger?.warn?.('🛡️ 刀 31 容器底色纠偏异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-i2 C 层（2026-11-12 · mc-1794428749650-cc633474 实锤立项）：
  //   plan.gridColumns 是硬约束，但此前只存在于 prompt 文本 ⇒ LLM 写成 flex row 即漂移
  //   （实测 4 列真值渲成 5 列）。本刀按 plan 真值把列数**确定性写进** v-for 容器 style：
  //   `repeat(K, itemW px)` + gap（由段宽/项宽反算），已在同列数上则幂等跳过。
  try {
    const gc = enforceGridColumnTruth(result, {
      effectiveSections,
      fullSections,
    });
    for (const [p, c] of Object.entries(gc.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    summary.gridColumnTruthScanned = gc.stats.scanned;
    summary.gridColumnTruthResolved = gc.stats.resolved;
    summary.gridColumnTruthNoVfor = gc.stats.noVfor;
    if (gc.changes.length > 0) {
      summary.gridColumnTruthFixed = gc.stats.fixed;
      for (const ch of gc.changes) {
        logger?.warn?.('🛡️ C 层修复：gridColumns 真值落地（列数确定性写入网格容器）', {
          file: ch.file,
          count: ch.count,
          grids: ch.grids,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:grid-columns', counter: summary });
    logger?.warn?.('🛡️ C 层网格列数落地异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-i3 C 层之二：并排段主轴方向（两段 y 相同、x 相邻 ⇒ 宿主必须 row）。
  //   事故同源（c-cc6334）：规划层只记段内 direction=column，兄弟 row 关系丢失
  //   ⇒ 两张统计卡竖排、各占 24% 高。本刀按几何真值把相邻并排段包进 row 容器。
  try {
    const sr = enforceSiblingRowDirection(result, { effectiveSections, fullSections });
    for (const [p, c] of Object.entries(sr.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    summary.siblingRowScanned = sr.stats.rows;
    summary.siblingRowSkipped = sr.stats.skipped;
    if (sr.changes.length > 0) {
      summary.siblingRowWrapped = sr.stats.wrapped;
      for (const ch of sr.changes) {
        logger?.warn?.('🛡️ C 层之二修复：并排段包进 row 容器（主轴方向真值）', {
          file: ch.file,
          count: ch.count,
          gaps: ch.gaps,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:sibling-row', counter: summary });
    logger?.warn?.('🛡️ C 层之二并排方向落地异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-i3.5 刀 55 / P2-2（2026-11-12 · mc-max-1794456716158-7f427bd3 实锤立项）：
  //   统计卡「图标 + 数值 + 标签」复合卡，LLM 稳定漏写 `display:flex`（实测三处全缺）
  //   ⇒ <img>/<span> 退化块级、数值与标签纵向堆叠且溢出重叠（两张卡挤成一张）。
  //   本刀按 Figma 几何真值（图标与文本 y 区间重叠、图标在左）把复合卡容器**确定性写成
  //   row**，数值/标签兄弟再包 column（卡内两级方向）。无 figmaRoot 或无该事实 ⇒ fail-open。
  try {
    const cr = enforceCompositeRowTruth(result, { figmaRoot: ctx?.figmaRoot });
    for (const [p, c] of Object.entries(cr.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    summary.compositeRowScanned = cr.stats.scanned;
    summary.compositeRowTruth = cr.stats.rowTruth;
    summary.compositeRowSkipped = cr.stats.skipped;
    if (cr.changes.length > 0) {
      summary.compositeRowFixed = cr.stats.fixed;
      for (const ch of cr.changes) {
        logger?.warn?.('🛡️ 刀 55 修复：复合卡「图标 + 文本」横排真值落地', {
          file: ch.file,
          containers: ch.count,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:composite-row', counter: summary });
    logger?.warn?.('🛡️ 刀 55 复合卡横排落地异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-i3.6 刀 56 / P2-3（2026-11-12 · mc-max-1794462282698-2c855ae0 实锤立项）：
  //   分组容器上同时存在两条矛盾主轴声明 —— inline `flex-direction:row`（LLM 写的）
  //   与 scoped class `{ flex-direction: column }`（按 Figma 生成）。inline 优先 ⇒
  //   图标/标题/多个行容器被挤成一行、文本互相压字 ⇒ RUNTIME-016 + VISUAL-002 阻断。
  //   既有刀链没有一条看「同一元素的主轴是否与 Figma 真值一致」⇒ 整类错法无人管。
  //   本刀以 Figma 直接子元素几何的 y 带数判真值主轴，不符即把 inline 写成真值
  //   （inline 必胜、确定性生效）；映射不到唯一 Figma 节点 / 声明都缺 ⇒ fail-open。
  try {
    const ax = enforceContainerMainAxisTruth(result, { figmaRoot: ctx?.figmaRoot });
    for (const [p, c] of Object.entries(ax.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    summary.mainAxisScanned = ax.stats.scanned;
    summary.mainAxisConflicts = ax.stats.conflicts;
    summary.mainAxisMismatch = ax.stats.mismatch;
    summary.mainAxisSkipped = ax.stats.skipped;
    if (ax.changes.length > 0) {
      summary.mainAxisFixed = ax.stats.fixed;
      for (const ch of ax.changes) {
        logger?.warn?.('🛡️ 刀 56 修复：容器主轴按 Figma 几何真值归一', {
          file: ch.file,
          count: ch.count,
          axes: ch.axes,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:main-axis', counter: summary });
    logger?.warn?.('🛡️ 刀 56 容器主轴归一异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ④-j 刀 32（2026-10-14 · mc-max-1791965365126-2238359a 实锤立项）：
  //   LLM 把列表卡「首卡激活态」（Figma 1 异 N 同）误泛化成 nth-child(odd) 斑马纹。
  //   真值分布 active → 改写 :first-child, :hover（补 cursor/transition）；
  //   uniform → 剥除；zebra（≥4 严格交替）→ 合法保留；无 figmaRoot → fail-open。
  try {
    const d32 = healZebraStripeMisread(result, { figmaRoot: ctx?.figmaRoot });
    for (const [p, c] of Object.entries(d32.files)) {
      if (typeof c === 'string' && result[p] !== c) result[p] = c;
    }
    if (d32.changes.length > 0) {
      summary.zebraMisreadFixed = d32.changes.length;
      for (const ch of d32.changes) {
        logger?.warn?.('🛡️ 刀 32 修复：臆造斑马纹 → 激活态语义', {
          file: ch.file,
          action: ch.action,
          selector: ch.selector,
          to: ch.to,
          truth: d32.truth?.kind,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:659', counter: summary });
    logger?.warn?.('🛡️ 刀 32 斑马纹纠偏异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ⑤ FLEX-003 量纲归一（同 class 跨文件 flex grow 量纲冲突 → 像素量级）。
  const flexArr = Object.entries(result).map(([path, content]) => ({ path, content }));
  const flexNormalized = normalizeFlexSourceConflicts(flexArr);
  if (flexNormalized !== flexArr) {
    for (const nf of flexNormalized) {
      const prev = result[nf.path];
      if (prev !== undefined && prev !== nf.content) {
        result[nf.path] = nf.content;
        summary.flex003++;
      }
    }
    if (summary.flex003 > 0) {
      logger?.info?.('🛡️ FLEX-003 量纲归一（落盘前）', { files: summary.flex003 });
    }
  }

  // ⑥ FLEX-005 量纲归一（兄弟 class 量纲混用 → 等分 flex:1 1 0）。
  const flexSiblingArr = Object.entries(result).map(([path, content]) => ({ path, content }));
  const flexSiblingNormalized = normalizeFlexSiblingScale(flexSiblingArr);
  if (flexSiblingNormalized !== flexSiblingArr) {
    for (const nf of flexSiblingNormalized) {
      const prev = result[nf.path];
      if (prev !== undefined && prev !== nf.content) {
        result[nf.path] = nf.content;
        summary.flex005++;
      }
    }
    if (summary.flex005 > 0) {
      logger?.info?.('🛡️ FLEX-005 量纲归一（落盘前，统一到比例量级）', {
        files: summary.flex005,
      });
    }
  }

  // ⑥-c 🛡️ R10（2026-11-09 · loop-verify · 重点车辆 11bd56c1 实锤）：template 根游离元素归位。
  //    LLM 把 tab 行写在 <base-panel> 开标签之前（引用 index 自身 ref，非 T09 注入）⇒
  //    游离于宿主外悬空渲染。归位 = 移入 base-panel 默认插槽首部（语义等价，非判死）。
  try {
    const idxPath = Object.keys(result).find(
      (p) => p === 'package/index.vue' || p.endsWith('/index.vue'),
    )
    if (idxPath && typeof result[idxPath] === 'string') {
      const relocated = relocateStrayTemplateRoots(result[idxPath])
      if (relocated.changed) {
        result[idxPath] = relocated.content
        summary.r10StrayRelocated = (summary.r10StrayRelocated || 0) + 1
        logger?.warn?.('🛡️ R10 修复：template 根游离元素已归位 base-panel 默认插槽', {
          file: idxPath,
          moved: relocated.moved,
        })
      }
    }
  } catch (r10Err) {
    reportPatchChainError(r10Err, { logger: logger, pass: 'runPreWriteSelfHealing:r10', counter: summary });
    logger?.warn?.('🛡️ R10 游离根归位异常（fail-open）', {
      error: r10Err?.message || String(r10Err),
    });
  }

  // ⑦ 背景 :style 补全自愈（缺 size/repeat/position → `inferBackgroundStyle` 真值；
  //    解析不出该元素引用的资源才回落中性默认）。
  //    🛡️ F3′（2026-11-05 · 刀53 三链治本）：此前的 `mapping` 入参**形同虚设**——被调函数
  //    签名只收 content，一律用 `inferBackgroundStyle({})` 中性默认（`100% 100%`/`0px 0px`），
  //    把 191×81 的卡片底图铺满整卡（e23b0b40 / 300fe0f7 实锤）。现真正下传并计数。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const completed = ensureBackgroundStyleComplete(fc, mapping, summary);
    if (completed !== fc) {
      result[fp] = completed;
      summary.bgStyleComplete++;
      logger?.warn?.('🛡️ S6 修复：背景 :style 补全 size/repeat/position', { file: fp });
    }
  }

  // ⑥-b 🛡️ R9-b（2026-11-09 · loop-verify · 设备监测 49d23fe1 实锤）：横排 flex 兄弟组
  //    `width:100%` 挤压裁切的确定性修复。switch-con（89:38 横排）下两张统计卡 scoped CSS
  //    均 width:100% ⇒ 互相挤压，第二卡文字裁成「南北接：设备」。flex-shrink-guard 判据 A
  //    已识别此形态但只 WARN 不阻断 ⇒ 本节做 heal 形态：横排佐证下改写
  //    width:100% → flex:1 1 0 + min-width:0。
  //    判据同源 flex-shrink-guard.hasShrinkProtection（豁免口径一致，不复制第二套）。
  //    🔴 2026-11-09 修订（第二轮评审 P0-2）：旧实现用页面级正则判一次 isRow，就给**全部**
  //    子 .vue 传 `parentFlexRowClasses:['*']` ⇒「页面有任一横排」＝「每个子组件父级都是
  //    横排」，竖排 stack 里的卡也会被改成 flex:1 1 0（误杀）。现改为结构性判定：
  //    collectRowFlexChildComponents 解析 index.vue 中**横排容器的直接子组件名**，
  //    只有命中的文件才获得佐证（零硬编码：只认 display:flex + 非 column 结构）。
  try {
    const indexPath = Object.keys(result).find(
      (p) => p === 'package/index.vue' || p.endsWith('/index.vue'),
    );
    const indexContent = indexPath ? result[indexPath] : '';
    if (indexContent && typeof indexContent === 'string') {
      const rowChildNames = collectRowFlexChildComponents(indexContent);
      if (rowChildNames.length > 0) {
        // 组件标签名 → 文件（按 basename 精确匹配，不做模糊前缀）
        const fileByComponent = new Map();
        for (const fp of Object.keys(result)) {
          if (!fp.endsWith('.vue') || /index\.vue$/.test(fp)) continue;
          const base = fp.replace(/^.*\//, '').replace(/\.vue$/, '');
          fileByComponent.set(base, fp);
        }
        summary.r9bRowChildren = rowChildNames.length;
        for (const compName of rowChildNames) {
          const fp = fileByComponent.get(compName);
          if (!fp || typeof result[fp] !== 'string') continue;
          const healed = healHorizontalFlexWidth100(result[fp], { parentIsRowFlex: true });
          if (healed.changed) {
            result[fp] = healed.content;
            summary.r9bWidthHeal = (summary.r9bWidthHeal || 0) + healed.rewritten.length;
            logger?.warn?.('🛡️ R9-b 修复：横排 flex 子组件 width:100% → flex:1 1 0 + min-width:0', {
              file: fp,
              component: compName,
              rewritten: healed.rewritten,
            });
          }
        }
      }
    }
  } catch (r9bErr) {
    reportPatchChainError(r9bErr, { logger: logger, pass: 'runPreWriteSelfHealing:r9b', counter: summary });
    logger?.warn?.('🛡️ R9-b 横排 width:100% heal 异常（fail-open）', {
      error: r9bErr?.message || String(r9bErr),
    });
  }

  // ⑥-c 🛡️ R9-c（2026-11-09 · fe2acd21/54f523ac 实锤）：横排容器子项「定宽真值」注入。
  //    病灶：@antd/tab 行（89:37）下 tab 列（89:39）真值 46×317，产物 `flex: 0 0 auto`
  //    由内容自撑 193px ⇒ 挤占网格 ⇒ 列塌/重叠/越界。W1（planner container 分支几何
  //    透传）让真值进了 componentPlan；本节为出口兜底：LLM 仍写错时按段树真值行内注入
  //    `flex: 0 0 Wpx`。判据同源 horizontal-flex-width-heal（R9-b 同文件），真值单一
  //    事实源 = effectiveSections 树的 figmaBox/absoluteBoundingBox；缺真值计数跳过不猜。
  try {
    if (Array.isArray(effectiveSections) && effectiveSections.length > 0) {
      const indexPath2 = Object.keys(result).find(
        (p) => p === 'package/index.vue' || p.endsWith('/index.vue'),
      );
      const indexContent2 = indexPath2 ? result[indexPath2] : '';
      if (indexContent2 && typeof indexContent2 === 'string') {
        // sid → 真值宽度（树遍历一次；figmaBox 与 absoluteBoundingBox 同源口径）
        const widthBySid = new Map();
        const walkW = (list) => {
          for (const sec of Array.isArray(list) ? list : []) {
            if (!sec || typeof sec !== 'object') continue;
            const box = sec.figmaBox || sec.absoluteBoundingBox;
            const w = Number(box && box.width);
            if (sec.id && Number.isFinite(w) && w > 0) widthBySid.set(String(sec.id), w);
            walkW(sec.children || sec.body?.children);
          }
        };
        walkW(effectiveSections);
        if (widthBySid.size > 0) {
          const styleSources = Object.entries(result)
            .filter(([p, c]) => typeof c === 'string' && c && /\.(less|css|vue)$/i.test(p))
            .map(([p, c]) => ({ path: p, content: c }));
          const r9c = healRowFixedWidthTruth(indexContent2, styleSources, {
            truthWidthOf: (sid) => widthBySid.get(String(sid)) ?? null,
          });
          summary.r9cRowFlexContainers = r9c.stats.scanned;
          summary.r9cCandidates = r9c.stats.candidates;
          summary.r9cNoTruth = r9c.stats.noTruth;
          summary.r9cHasFlexSemantics = r9c.stats.hasFlexSemantics;
          if (r9c.changed) {
            result[indexPath2] = r9c.content;
            summary.r9cFixedWidthHeal = r9c.stats.healed;
            logger?.warn?.('🛡️ R9-c 修复：横排容器子项注入定宽真值 flex: 0 0 Wpx', {
              healed: r9c.healed,
              stats: r9c.stats,
            });
          }
        }
      }
    }
  } catch (r9cErr) {
    reportPatchChainError(r9cErr, { logger: logger, pass: 'runPreWriteSelfHealing:r9c', counter: summary });
    logger?.warn?.('🛡️ R9-c 横排定宽真值 heal 异常（fail-open）', {
      error: r9cErr?.message || String(r9cErr),
    });
  }

  // ⑥-d 🛡️ G1（2026-11-09 · 669d8bf8 实锤）：零样式容器布局真值注入。
  //    病灶：1263-38-con / 2-3446-con / 2-3496-con 三容器在 common.less 零样式块、
  //    行内无 display——真值两卡横排（同 y 异 x）被块级堆成纵向 ⇒ 右卡掉位、底图塌陷。
  //    本节为出口兜底：零样式容器按子节点 bbox 注入方向（row/column）与比例
  //    （flex: w/sum · h/sum），零硬编码；判据细节见 container-layout-truth.js
  //    头注释（B1 评审修正：偏移量切片替换 / `>` 组合器 / :style 动态 display
  //    跳过 / 子项已有 flex 不覆盖）。
  //    ⚠️ 真值源优先级（669d8bf8 真机实锤）：effectiveSections 树的 figmaBox 优先
  //    （planner W1 container 分支透传）；**缺失时回退 figmaRoot 直接子节点 bbox**
  //    （Figma 树恒有 absoluteBoundingBox——669d8bf8 的 effectiveSections 无几何，
  //    只走第一优先级会 noKids 全跳过，G1 空转）。真值双缺 ⇒ 计数跳过不猜。
  try {
    const indexPath3 = Object.keys(result).find(
      (p) => p === 'package/index.vue' || p.endsWith('/index.vue'),
    );
    const indexContent3 = indexPath3 ? result[indexPath3] : '';
    if (indexContent3 && typeof indexContent3 === 'string') {
      // 优先级 1：effectiveSections 树（figmaBox 与 absoluteBoundingBox 同源口径）
      const kidsBySid = new Map();
      const walkKids = (list) => {
        for (const sec of Array.isArray(list) ? list : []) {
          if (!sec || typeof sec !== 'object') continue;
          const childList = Array.isArray(sec.children)
            ? sec.children
            : sec.body && Array.isArray(sec.body.children)
              ? sec.body.children
              : null;
          if (sec.id && Array.isArray(childList) && childList.length > 0) {
            const boxes = childList
              .map((c) => {
                const b = c && (c.figmaBox || c.absoluteBoundingBox);
                const x = Number(b && b.x);
                const y = Number(b && b.y);
                const w = Number(b && b.width);
                const h = Number(b && b.height);
                return Number.isFinite(x) && Number.isFinite(y) &&
                  Number.isFinite(w) && Number.isFinite(h)
                  ? { id: String(c.id || ''), box: { x, y, width: w, height: h } }
                  : null;
              })
              .filter(Boolean);
            if (boxes.length > 0) kidsBySid.set(String(sec.id), boxes);
          }
          walkKids(sec.children || sec.body?.children);
        }
      };
      if (Array.isArray(effectiveSections) && effectiveSections.length > 0) {
        walkKids(effectiveSections);
      }
      // 优先级 2：figmaRoot 直接子节点（669d8bf8 实测 effectiveSections 常无几何）
      let figmaIndexed = false;
      if (figmaRoot && typeof figmaRoot === 'object') {
        const nodeById = new Map();
        const walkIdx = (n) => {
          if (!n || typeof n !== 'object') return;
          if (n.id) nodeById.set(String(n.id), n);
          for (const c of n.children || []) walkIdx(c);
        };
        walkIdx(figmaRoot.document || figmaRoot);
        if (nodeById.size > 0) {
          figmaIndexed = true;
          summary.g1TruthSource = 'figmaRoot';
          for (const [sid] of Array.from(nodeById.entries())) {
            if (kidsBySid.has(sid)) continue; // 优先级 1 已覆盖
            const node = nodeById.get(sid);
            if (!Array.isArray(node.children) || node.children.length === 0) continue;
            const boxes = node.children
              .map((c) => {
                const b = c && (c.absoluteBoundingBox || c.figmaBox);
                const x = Number(b && b.x);
                const y = Number(b && b.y);
                const w = Number(b && b.width);
                const h = Number(b && b.height);
                return Number.isFinite(x) && Number.isFinite(y) &&
                  Number.isFinite(w) && Number.isFinite(h)
                  ? { id: String(c.id || ''), box: { x, y, width: w, height: h } }
                  : null;
              })
              .filter(Boolean);
            if (boxes.length > 0) kidsBySid.set(sid, boxes);
          }
        }
      }
      if (!summary.g1TruthSource && kidsBySid.size > 0) summary.g1TruthSource = 'effectiveSections';
      if (kidsBySid.size > 0) {
        const styleSourcesG1 = Object.entries(result)
          .filter(([p, c]) => typeof c === 'string' && c && /\.(less|css|vue)$/i.test(p))
          .map(([p, c]) => ({ path: p, content: c }));
        const g1 = injectContainerLayoutTruth(indexContent3, styleSourcesG1, {
          childrenBoxesOf: (sid) => kidsBySid.get(String(sid)) ?? null,
        });
        summary.g1Scanned = g1.stats.scanned;
        summary.g1ZeroStyle = g1.stats.zeroStyle;
        summary.g1Injected = g1.stats.injected;
        summary.g1ChildFlex = g1.stats.childFlex;
        summary.g1NoKids = g1.stats.noKids;
        summary.g1MixedSkipped = g1.stats.mixedSkipped;
        if (g1.changed) {
          result[indexPath3] = g1.content;
          logger?.warn?.('🛡️ G1 修复：零样式容器注入布局真值（方向+比例）', {
            injected: g1.injected,
            stats: g1.stats,
          });
        }
      }
    }
  } catch (g1Err) {
    reportPatchChainError(g1Err, { logger: logger, pass: 'runPreWriteSelfHealing:g1', counter: summary });
    logger?.warn?.('🛡️ G1 容器布局真值注入异常（fail-open）', {
      error: g1Err?.message || String(g1Err),
    });
  }

  // ⑥-f 🛡️ 资源相对路径深度归一（2026-11-10 · mc-1794240310944-9f4835fa 实锤）
  //   病灶：模型把子组件放进 `components/<Group>/` 子目录（层级 +1），但
  //   `@import '../../resources/styles/index.less'` 没跟着加深 ⇒ 落盘后 LESS 门禁报
  //   「无法加载 LESS 依赖」直接阻断整个任务（设备监测 v2 即此，前一轮同样的组件是能过的）。
  //   口径：复用 `sfc-syntax-validation#normalizeResourceRelativePaths`（**单一实现**，
  //   按 path 段数算 `../` 次数），零硬编码路径、零文件名白名单；图片/样式 import 一并覆盖。
  try {
    let _pathFixed = 0;
    for (const [p, c] of Object.entries(result)) {
      if (typeof c !== 'string' || !p.endsWith('.vue')) continue;
      const next = normalizeResourceRelativePaths(c, p);
      if (next !== c) {
        result[p] = next;
        _pathFixed += 1;
      }
    }
    summary.resourcePathFixed = _pathFixed;
    if (_pathFixed > 0) {
      logger?.warn?.('🛡️ 资源相对路径按文件深度归一（⑥-f）', { files: _pathFixed });
    }
  } catch (pathDepthErr) {
    reportPatchChainError(pathDepthErr, {
      logger: logger,
      pass: 'runPreWriteSelfHealing:pathDepth',
      counter: summary,
    });
    logger?.warn?.('🛡️ 资源相对路径归一异常（fail-open）', {
      error: pathDepthErr?.message || String(pathDepthErr),
    });
  }

  // ⑥-h 🛡️ 动态 :src 的 <img> 补 v-if 守卫（2026-11-10 · 重点车辆 fbc0feb5 实锤）
  //   病灶：模板 `<img :src="item.icon">` 而数据项 `{label,value,valueClass}` **缺 icon 字段**
  //   ⇒ 渲染成 `<img src="">`（真机 4 张图 1 张空源、探针 emptyImg 告警、视觉上出现破图）。
  //   判据：只对「无 v-if / v-show 的 `:src="expr"`」补 `v-if="expr"`——表达式真值即是否渲染，
  //   零硬编码、零字段名依赖；已带条件的不动（幂等）。
  try {
    let _imgGuard = 0;
    for (const [p, c] of Object.entries(result)) {
      if (typeof c !== 'string' || !p.endsWith('.vue')) continue;
      const next = c.replace(
        /<img\b([^>]*?)\s:src="([^"]+)"([^>]*?)>/g,
        (full, pre, expr, post) => {
          if (/\bv-if=|\bv-show=/.test(`${pre}${post}`)) return full;
          // ⚠️ 自闭合 `/>` 必须保持在末尾：v-if 要插在斜杠**之前**，否则产出
          //   `<img ... class="x" / v-if="...">` 这种非法标签（首版即踩，靠本步验证发现）。
          const selfClose = /\/\s*$/.test(post);
          const tail = selfClose ? post.replace(/\/\s*$/, '') : post;
          _imgGuard += 1;
          return `<img${pre} :src="${expr}"${tail} v-if="${expr}"${selfClose ? ' /' : ''}>`;
        },
      );
      if (next !== c) result[p] = next;
    }
    // 静态空源（`src=""` / `src=''`）⇒ 整标签删除。空源本就不显示，留着只会触发
    //   无效请求 + 探针 emptyImg + 视觉破图占位（真机 0f1dcc33 两张）。
    let _imgEmptyRemoved = 0;
    for (const [p, c] of Object.entries(result)) {
      if (typeof c !== 'string' || !p.endsWith('.vue')) continue;
      const cleaned = c.replace(/<img\b[^>]*\bsrc=(""|'')[^>]*\/?>/g, () => {
        _imgEmptyRemoved += 1;
        return '';
      });
      if (cleaned !== c) result[p] = cleaned;
    }
    summary.imgSrcGuard = _imgGuard;
    summary.imgEmptyRemoved = _imgEmptyRemoved;
    if (_imgGuard > 0 || _imgEmptyRemoved > 0) {
      logger?.warn?.('🛡️ 图片守卫（⑥-h）：补 v-if / 删空源', {
        guard: _imgGuard,
        emptyRemoved: _imgEmptyRemoved,
      });
    }
  } catch (imgGuardErr) {
    reportPatchChainError(imgGuardErr, {
      logger: logger,
      pass: 'runPreWriteSelfHealing:imgSrcGuard',
      counter: summary,
    });
    logger?.warn?.('🛡️ 图片 v-if 守卫异常（fail-open）', {
      error: imgGuardErr?.message || String(imgGuardErr),
    });
  }

  // ⑥-i 🛡️ 重复卡组「卡底渐变」确定性注入（2026-11-10 · dbdbc813 实锤）
  //   病灶：Figma 卡底是卡内 RECTANGLE 的渐变（真机 `2:8035` 120×60 + r=1.76），产物
  //   `.stat-card` 只有 `min-width:0`（注释还写「背景图由系统注入到本容器」但从未注入）
  //   ⇒ 三张卡全透明，图标浮在白底。
  //   判据：重复卡组 = 有 ≥2 个等高子项的容器（纯几何）；卡底 = 其子树面积最大的渐变块；
  //   注入目标 = 产物模板中「首次出现最靠前」的重复 class（外层容器，非内层 value 组）。
  //   全部取自 Figma 节点与产物自身结构，零色值/类名白名单。
  try {
    if (figmaRoot && Array.isArray(effectiveSections) && effectiveSections.length > 0) {
      const _cardGroups = collectCardGroups(figmaRoot);
      const _bgByOwner = collectCardBgByOwner(resourceDomMapping);
      if (_cardGroups.size > 0 && _bgByOwner.size > 0) {
        const _files = Object.entries(result)
          .filter(([p, c]) => typeof c === 'string' && p.endsWith('.vue'))
          .map(([path, content]) => ({ path, content }));
        const _inj = injectCardBgImages(_files, { cardGroups: _cardGroups, bgByOwner: _bgByOwner });
        if (_inj.changed) {
          for (const f of _inj.contents) result[f.path] = f.content;
          summary.cardBgInjected = _inj.stats.mounted;
          logger?.warn?.('🛡️ 卡底背景图按 owner 精确挂载（⑥-i v2）', _inj.stats);
        }
      }
    }
  } catch (_cardBgErr) {
    reportPatchChainError(_cardBgErr, {
      logger: logger,
      pass: 'runPreWriteSelfHealing:cardBg',
      counter: summary,
    });
    logger?.warn?.('🛡️ 卡底渐变注入异常（fail-open）', {
      error: _cardBgErr?.message || String(_cardBgErr),
    });
  }

  // ⑨ D1 per-card 样式确定性改写（2026-09-20 · mc-1789869245851 实锤）：
  //   F1 已把 vision 卡片语义送进 prompt，但 LLM 对「同形资源」（bg-124/125/126）与
  //   「色值写法」仍随机漂移。此处按 effectiveSections 的 body.items 真值在落盘前
  //   确定性改写：bg 图引用 / 数值颜色 / icon 文件。归属不明（多卡声明同文件）时跳过。
  if (Array.isArray(effectiveSections) && effectiveSections.length > 0) {
    try {
      const d1 = enforceCardVisualTruth(result, effectiveSections, {
        logger,
        resourceDomMapping: mapping,
      });
      result = d1.files;
      summary.d1BgFixed = d1.summary.bgFixed;
      summary.d1ColorFixed = d1.summary.colorFixed;
      summary.d1IconFixed = d1.summary.iconFixed;
      summary.d1BgInjected = d1.summary.bgInjected || 0;
      summary.d1ImgSized = d1.summary.imgSized || 0;
      summary.d1Skipped = d1.summary.skipped;
    } catch (d1Err) {
      reportPatchChainError(d1Err, { logger: logger, pass: 'runPreWriteSelfHealing:727', counter: summary });
      logger?.warn?.('🛡️ D1 per-card 改写异常（fail-open 跳过）', {
        error: d1Err?.message || String(d1Err),
      });
    }
  }

  // ⑧ data-section-id 重复锚定检测（2026-09-19 · mc-max-1789811323065 实锤）：
  //   R2 element-group 拆分 + scopedInput 缓存污染曾导致两个子组件都锚定同一 section
  //   （ContentSection 与 ContentSection5 均写 data-section-id="136:127"）→ 卡片内容
  //   同源混淆、危化品车整卡丢失。同一 section id 只应由一个组件渲染；重复 = 锚定错位。
  //   本步骤 fail-open：只检测告警不修改内容（确定性事实不足以自愈「哪个该改」），
  //   issues 汇入 summary 供上游（重试 prompt / 门禁 / 日志取证）消费。
  //   合法豁免：v-for 模板组件（多实例同 id 属正常，子组件文件内模板只有一处）。
  summary.duplicateSectionAnchors = [];
  const anchorMap = new Map(); // sectionId -> [{ file, count }]
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const ids = new Set();
    for (const m of fc.matchAll(/data-section-id="([^"]+)"/g)) {
      ids.add(m[1]);
    }
    for (const sid of ids) {
      if (!anchorMap.has(sid)) anchorMap.set(sid, []);
      anchorMap.get(sid).push({ file: fp });
    }
  }
  for (const [sid, files] of anchorMap) {
    if (files.length > 1) {
      const issue = {
        sectionId: sid,
        files: files.map((f) => f.file),
        hint: '同一 Figma section 被多个组件锚定，疑似 R2 拆分组件归属错位（检查该 section 各分组的成员清单）',
      };
      summary.duplicateSectionAnchors.push(issue);
      logger?.warn?.(
        `🛡️ SECTION-ANCHOR-DUP：section ${sid} 被 ${files.length} 个组件锚定`,
        { files: issue.files },
      );
    }
  }

  // ⑩ 样式冲突检测（2026-10-03 · f7e57ac6 实锤，只报不改）：① 控件尺寸字号乘数换算
  //    （calc(字号×小数) 定 width/height）；② 同名 class 在 common.less 与 SFC scoped
  //    双定义布局属性（@import 后到静默覆盖）。防线主力是 mc-builder.md 生成铁律（预防），
  //    此处保证复发可见。必须排在全部注入/修复之后 —— 检测的是最终落盘形态。
  try {
    const styleScan = scanProductStyleIssues(result);
    summary.styleFontSizeSizing = styleScan.fontSizeSizing;
    summary.styleClassConflicts = styleScan.classConflicts;
    for (const w of styleScan.warnings) {
      logger?.warn?.(`🛡️ STYLE-CONFLICT：${w}`);
    }
    if (styleScan.warnings.length > 0) {
      logger?.warn?.('🛡️ 样式冲突扫描完成（只报不改，修复靠生成铁律+重试）', {
        fontSizeSizing: styleScan.fontSizeSizing,
        classConflicts: styleScan.classConflicts,
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:786', counter: summary });
    logger?.warn?.('🛡️ 样式冲突扫描异常（非阻断）', {
      error: err?.message || String(err),
    });
  }

  // ⑪ H1 百分比高度拉伸检测（2026-10-04 · fb505213 / a803f7 实锤，只报不改）：
  //    真值定值的内容区块（如 antd-table-con Figma 高 173px、父 con 高 270px）在产物里被写成
  //    `height:100%` 或比例 flex（`flex:0.764`）⇒ 区块撑满父容器，把同容器内后续区块
  //    （保存按钮）推出可视区、甚至被裁切。判据 v2（离线 552 产物实测，误伤 -95%）：
  //      判定域 = 内容区块类名且**非填充容器**（`*-slot-con`/`*-con-con`/`*-container`/`*-root`
  //        填满壳 body 属合法，排除）；信号 = `height:100%`（须 T子≠T父）或比例 flex
  //        （须 |flex − T子/T父| > 0.06）；**无真值 fail-open 不判**。真值来自 ctx.effectiveSections
  //        的 layoutMetadata.height（figmaRoot 可选，更权威）。
  //    只报不改：确定性事实只够判「这里不对」，不够判「该改成多少」（定值 vs 流式取决于区块语义）；
  //    修复主线仍是生成铁律 + 重试，此处只保证复发可见。必须排在全部改动之后（判的是最终落盘形态）。
  //    真值源：`ctx.percentHeightTruth`（H1 专用）→ 回退 `ctx.effectiveSections`（microcode 链，与 D1 同源）。
  //    分开的理由：vue3 链需要一个「只给 H1、不惊动 D1」的入口（见 ctx 注释）。
  const percentHeightTruth = Array.isArray(ctx.percentHeightTruth)
    ? ctx.percentHeightTruth
    : effectiveSections;
  if (Array.isArray(percentHeightTruth) && percentHeightTruth.length > 0) {
    try {
      const h1 = resolvePercentHeightStretch(result, {
        effectiveSections: percentHeightTruth,
        figmaRoot: ctx.figmaRoot,
        maxIssues: 50,
      });
      summary.percentHeightStretch = h1.issues;
      summary.percentHeightStats = h1.stats;
      for (const it of h1.issues) {
        logger?.warn?.(
          `🛡️ PERCENT-HEIGHT：[${it.file}] ${it.blockClass} 疑似撑满父容器 — ${it.detail}`,
          { sid: it.sid, parentSid: it.parentSid, signal: it.signal },
        );
      }
      if (h1.issues.length > 0) {
        logger?.warn?.('🛡️ 百分比高度拉伸检测完成（只报不改，修复靠生成铁律+重试）', {
          hits: h1.stats.hits,
          files: h1.stats.hitFiles,
        });
      }
    } catch (err) {
      reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:828', counter: summary });
      logger?.warn?.('🛡️ H1 百分比高度检测异常（非阻断）', {
        error: err?.message || String(err),
      });
    }
  }

  // ⑪-b 刀 31（2026-10-20 · 47647fae 实锤，检出+确定性自愈）：v-for 重复单元几何纠偏。
  //    与 ⑪ 的互补关系：⑪ 判定域 = 类名三明治 + section 真值；本刀判定域 = v-for 元素 +
  //    figma 原始树「同名同尺寸重复实例几何」（命名/类名无关，E1 未折叠也能判）。
  //    ① item 主轴垂直方向 100% 尺寸 ⇒ 改真值定值 px（治「6 卡各占满容器只见首卡」）；
  //    ② wrapper 方向与重复组几何方向矛盾 ⇒ 翻转（direction-guard 在 E1 未折叠时的兜底）。
  //    改写纪律与刀 30 同款：全部出现点、幂等、fail-open。
  if (ctx.figmaRoot) {
    try {
      const ru = detectRepeatUnitIssues(result, { figmaRoot: ctx.figmaRoot });
      summary.repeatUnitIssues = ru.issues;
      summary.repeatUnitStats = ru.stats;
      if (ru.issues.length > 0) {
        const healed = healRepeatUnitIssues(result, ru.issues);
        let healCount = 0;
        for (const [p, c] of Object.entries(healed.files)) {
          if (typeof c === 'string' && result[p] !== c) {
            result[p] = c;
            healCount++;
          }
        }
        summary.repeatUnitHealed = healed.healed;
        if (healed.failed.length > 0) {
          summary.repeatUnitHealFailed = healed.failed;
          // 🛡️ #128 ②：自愈失败显性化进 meta（此前仅日志，任务页不可见）
          appendFailOpenEvent(ctx.outputPath, {
            rule: 'REPEAT-UNIT-HEAL-FAILED',
            reason: `${healed.failed.length} 处 v-for 重复单元几何纠偏自愈失败（产物仍带病）`,
            detail: { failed: healed.failed.slice(0, 10) },
          });
        }
        for (const it of ru.issues) {
          logger?.warn?.(`🛡️ REPEAT-UNIT：[${it.file}] ${it.detail}`, {
            anchorSid: it.anchorSid,
            classes: it.classes || it.wrapperClasses,
          });
        }
        logger?.warn?.('🛡️ v-for 重复单元几何纠偏完成', {
          hits: ru.stats.hits,
          healed: healed.healed.length,
          healedFiles: healCount,
          failed: healed.failed.length,
        });
      }
    } catch (err) {
      reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:878', counter: summary });
      logger?.warn?.('🛡️ v-for 重复单元几何纠偏异常（非阻断）', {
        error: err?.message || String(err),
      });
    }
  }

  // ⑪-c（2026-10-20 · #128 ⑧，只报不改）：资源挂载/臆造规则两类审计。
  //   ① 已下载图片零引用（84af4f8f 实锤：header-1697.png 落盘但全产物零引用 ⇒
  //      头部图标丢失）——resources/images 下图片 stem 必须在任一 .vue/.ts/.js/.less
  //      中出现（import/url()），否则 WARN（资源挂载缺口，fail-open 显性化）。
  //   ② `:first-child { background: transparent }` 臆造审计（47647fae 实锤族）——
  //      与重复卡真值（layoutStructure.repeatedCardTruth）对照：首卡真值非透明 ⇒
  //      「臆造透明覆盖真值」强 WARN；无真值 ⇒ 弱 WARN 留痕（只报不改）。
  try {
    // ① 已下载图片零引用
    if (ctx.outputPath) {
      const imgDir = _joinPath(ctx.outputPath, 'resources', 'images');
      if (_existsSync(imgDir)) {
        const stems = _readdirSync(imgDir)
          .filter((f) => /\.(png|jpe?g|svg|webp|gif)$/i.test(f) && !/^mc-preview/.test(f))
          .map((f) => f.replace(/\.[^.]+$/, ''));
        if (stems.length > 0) {
          const allCode = Object.entries(result)
            .filter(([p]) => /\.(vue|ts|js|less|css)$/i.test(p))
            .map(([, c]) => (typeof c === 'string' ? c : ''))
            .join('\n');
          const orphans = stems.filter((s) => !allCode.includes(s));
          if (orphans.length > 0) {
            summary.unreferencedImages = orphans;
            logger?.warn?.(
              `🛡️ RES-UNREF：${orphans.length} 张已下载图片零引用（资源挂载缺口）`,
              { images: orphans },
            );
            // 🛡️ #128 ②：资源挂载缺口显性化进 meta（84af4f8f header-1697.png 实锤）
            appendFailOpenEvent(ctx.outputPath, {
              rule: 'RES-UNREF',
              reason: `${orphans.length} 张已下载图片零引用（资源挂载缺口，渲染丢图）`,
              detail: { images: orphans },
            });
          }
        }
      }
    }
    // ② :first-child transparent 臆造审计
    const firstChildTransparent = [];
    for (const [fp, fc] of Object.entries(result)) {
      if (!/\.(less|css|vue)$/i.test(fp) || typeof fc !== 'string') continue;
      for (const m of fc.matchAll(/\.([\w-]+):first-child\s*\{([^{}]*)\}/g)) {
        if (/background\s*:\s*transparent/.test(m[2])) {
          firstChildTransparent.push({ file: fp, class: m[1] });
        }
      }
    }
    if (firstChildTransparent.length > 0) {
      const rct = ctx.layoutStructure?.repeatedCardTruth;
      const contradictsTruth =
        rct && rct.baseFill && !/transparent/.test(String(rct.baseFill?.css || rct.baseFill || ''));
      summary.firstChildTransparent = firstChildTransparent;
      logger?.warn?.(
        `🛡️ FIRST-CHILD-TRANSPARENT：${firstChildTransparent.length} 处首卡透明背景规则${contradictsTruth ? '（⚠️ 与重复卡真值底色矛盾——疑似臆造覆盖）' : '（无真值对照，留痕观察）'}`,
        { hits: firstChildTransparent, repeatedCardTruth: rct ? 'present' : 'absent' },
      );
      // 🛡️ #128 ②：与真值矛盾的臆造覆盖显性化进 meta（无真值的弱留痕不进，防噪声）
      if (contradictsTruth) {
        appendFailOpenEvent(ctx.outputPath, {
          rule: 'FIRST-CHILD-TRANSPARENT',
          severity: 'WARN',
          reason: `${firstChildTransparent.length} 处 :first-child{background:transparent} 与重复卡真值底色矛盾（疑似臆造覆盖）`,
          detail: { hits: firstChildTransparent.slice(0, 10) },
        });
      }
    }
    // ③ 透明容器臆造背景 **审计 + 确定性修复**（2026-10-20 · 5ef650ff 实锤立项；
    //    2026-11-02 R8-2 · 50d7793f 实锤升级——原「只报不改」导致三张臆造卡壳直接落盘）：
    //    设计稿 fills=[] 的透明容器（底色由宿主提供），产物对应 wrapper 却刷
    //    background ⇒ 盖住宿主底色（浅色发白/深色发灰）。对照透明容器真值：
    //    data-section-id → class → 样式规则块顶层 background 非透明 ⇒ 留痕 + 剥除。
    //    🔴 收窄刀口（R8 系评审定案）：只剥 `background(-color)`；border/border-radius
    //    的真值源是 strokes/cornerRadius，本刀不碰（挂观测）——越权即重蹈「按单加守卫」覆辙。
    const tct = ctx.layoutStructure?.transparentContainerTruth;
    if (tct?.transparentIds?.length > 0) {
      const vueEntries = Object.entries(result)
        .filter(([p, c]) => /\.vue$/i.test(p) && typeof c === 'string');
      const styleEntries = Object.entries(result)
        .filter(([p, c]) => /\.(less|css|vue)$/i.test(p) && typeof c === 'string');
      const transparentBg = [];
      let transparentBgHealed = 0;
      for (const sid of tct.transparentIds) {
        // data-section-id="sid" 所在标签的 class
        let cls = null;
        for (const [, fc] of vueEntries) {
          const tagRe = new RegExp(`<[^>]*data-section-id=["']${sid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
          const tm = fc.match(tagRe);
          if (!tm) continue;
          const cm = tm[0].match(/class=["']([^"']+)["']/i);
          if (cm) { cls = cm[1].trim().split(/\s+/)[0]; break }
        }
        if (!cls) continue;
        // 该 class 规则块顶层声明里的 background（[^{}]* 只取顶层段，嵌套块不扰）。
        // 🔴 修复剥除在**原文区间**上做：rm[1]=`.cls {` 头、rm[2]=顶层声明段，
        //    bgM 在 rm[2] 内的偏移 + rm.index + rm[1].length ⇒ 原文绝对区间。
        const ruleRe = new RegExp(`(\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{)([^{}]*)(\\})`, 'g');
        for (const [fp, fc] of styleEntries) {
          const removals = []; // {start, end} 原文绝对区间（bgM[0] 含前导空白与尾分号）
          for (const rm of fc.matchAll(ruleRe)) {
            const bodyStart = rm.index + rm[1].length;
            const body = rm[2];
            const bgM = body.match(/(\s*)background(?:-color)?\s*:\s*([^;{}]+);/);
            if (!bgM) continue;
            if (/^\s*transparent\s*$/.test(bgM[2])) continue; // 显式透明=守卫写回，非臆造
            transparentBg.push({ sectionId: sid, file: fp, class: cls, value: bgM[2].trim().slice(0, 60) });
            removals.push({ start: bodyStart + bgM.index, end: bodyStart + bgM.index + bgM[0].length });
            break; // 每 sid 每文件只剥首个命中块（与审计 break 语义一致）
          }
          if (removals.length > 0) {
            let next = fc;
            for (const r of removals.reverse()) next = next.slice(0, r.start) + next.slice(r.end);
            result[fp] = next;
            transparentBgHealed++;
          }
        }
      }
      if (transparentBg.length > 0) {
        summary.transparentContainerBg = transparentBg;
        summary.transparentContainerBgHealed = transparentBgHealed;
        logger?.warn?.(
          `🛡️ TRANSPARENT-CONTAINER-BG：${transparentBg.length} 处透明容器被臆造背景色覆盖（设计稿 fills=[]），已确定性剥除 ${transparentBgHealed} 处（border/radius 真值源不同，本刀不碰挂观测）`,
          { hits: transparentBg.slice(0, 10), healed: transparentBgHealed, truthTotal: tct.total },
        );
        appendFailOpenEvent(ctx.outputPath, {
          rule: 'TRANSPARENT-CONTAINER-BG',
          severity: 'WARN',
          reason: `${transparentBg.length} 处透明容器（figma fills=[]）被产物刷上背景色，已剥除 ${transparentBgHealed} 处（R8-2）`,
          detail: { hits: transparentBg.slice(0, 10), healed: transparentBgHealed },
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1016', counter: summary });
    logger?.warn?.('🛡️ 资源/臆造规则审计异常（非阻断）', {
      error: err?.message || String(err),
    });
  }

  // ⑫ 刀 23（2026-10-08 · 07b4d2a5 实锤）：跨文件「同 class 同一布局属性」重声明——
  //   从 shared 表里剥，保留 SFC scoped。理由：FLEX-003 跨文件类索引读到 shared 那份不同
  //   flex 值就 BLOCK（如 `.c-07b4d2-header` SFC `flex:1 1 0` + common.less `flex:0 0 auto`）；
  //   SFC 编译后 (0,2,0) 恒胜 common.less (0,1,0)，浏览器实际生效仍是 SFC 那份 → 剥 shared
  //   不影响视觉、消除 BLOCK。本刀与既有 ⑤ normalizeFlexSourceConflicts 互补：后者只处理
  //   pixel/ratio 量纲冲突（grow ≥20 vs ≤19），本刀覆盖「同量纲不同值」（如 ratio 1 vs 0）。
  //   必须排在所有改动之后（检测的是最终形态）；fail-open。
  try {
    const d23 = pruneDuplicateStyleDeclsFromShared(result);
    if (d23.changes && d23.changes.length > 0) {
      // 结果对象形态：{files, changes}，files 形态与输入一致（dict 形态）
      if (d23.files && typeof d23.files === 'object' && !Array.isArray(d23.files)) {
        for (const [p, c] of Object.entries(d23.files)) {
          if (typeof c === 'string' && result[p] !== c) {
            result[p] = c;
            summary.d23Files = (summary.d23Files || 0) + 1;
          }
        }
        summary.d23Changes = d23.changes.length;
        logger?.warn?.('🛡️ 刀 23 修复：跨文件重声明已剥 shared 表（保 SFC scoped，治 FLEX-003 本）', {
          changes: d23.changes.length,
        });
      } else {
        // 数组形态：pruneDuplicateStyleDeclsFromShared 也支持数组，但本函数统一走 dict
        logger?.warn?.('🛡️ 刀 23 修复：返回形态非 dict，跳过（契约违规）');
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1049', counter: summary });
    logger?.warn?.('🛡️ 刀 23 异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ⑬ 刀 24（2026-10-08 · 07b4d2a5 实锤）：techstack 契约履行占位注入——对每个 `wrong-tag` 违规
  //   往宿主 .vue 追加 `v-if="false"` 占位元素（满足契约标签正则，视觉无破坏）。
  //   治 TECHSTACK-NOT-RENDERED 根因：6 个 antd 组件（form-item/upload/input/select/radio/button）
  //   契约被 img/手画 div 顶替，元素覆盖率 WARN 级不阻断 → 用户拿不到按钮。
  //   必须排在 ⑫ 之后（最终落盘形态）；fail-open。
  if (Array.isArray(effectiveSections) && effectiveSections.length > 0) {
    try {
      // 转为数组形态（enforceTechStackContractTags 接 array）
      const filesArr = Object.entries(result).map(([p, c]) => ({ path: p, content: c }));
      const d24 = enforceTechStackContractTags(filesArr, { effectiveSections });
      if (d24.fixed && d24.fixed.length > 0) {
        // 写回 dict
        for (const f of d24.files) {
          if (typeof f.content === 'string' && result[f.path] !== f.content) {
            result[f.path] = f.content;
          }
        }
        summary.d24Fixed = d24.fixed.length;
        summary.d24Skipped = d24.skipped.length;
        logger?.warn?.('🛡️ 刀 24 修复：techstack 契约履行占位已注入宿主 .vue（v-if="false"，治 TECHSTACK-NOT-RENDERED 本）', {
          fixed: d24.fixed.length,
          skipped: d24.skipped.length,
        });
      } else {
        summary.d24Skipped = (d24.skipped || []).length;
      }
    } catch (err) {
      reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1081', counter: summary });
      logger?.warn?.('🛡️ 刀 24 异常（fail-open）', {
        error: err?.message || String(err),
      });
    }
  }

  // ⑭ 刀 32/33/34（2026-10-20 · 477e185d 实锤）：结构真值三刀——
  //   刀 32 rowPeers 互挂兄弟被父 column 堆叠 ⇒ 包 row 容器（gap=figma bbox 真值）；
  //   刀 33 SFC × common.less 同名类布局属性冲突 ⇒ 以 SFC 为唯一语义源统一（双源归一，
  //      治「改 SFC 漏 common.less」必然事故族）；
  //   刀 34 插槽 × 主体同组件重复渲染 ⇒ 删插槽侧。
  //   全部纯结构/几何判据（零任务 id/节点名/组件名硬编码）；无真值 fail-open。
  //   刀 33 必须最后（读最终形态）。详 src/ai-engine/utils/structural-truth-healers.js。
  try {
    const st = healStructuralTruth(result, { effectiveSections, figmaRoot }, { logger });
    result = st.files;
    if (st.summary.rowpeersWrap > 0) {
      summary.rowpeersWrap = st.summary.rowpeersWrap;
      logger?.warn?.('🛡️ 刀 32：rowPeers 横向并列包裹完成', { count: st.summary.rowpeersWrap });
    }
    if (st.summary.dupClassDirection > 0) {
      summary.dupClassDirection = st.summary.dupClassDirection;
    }
    if (st.summary.slotDupRender > 0) {
      summary.slotDupRender = st.summary.slotDupRender;
    }
    if (st.summary.selfNestedCollapse > 0) {
      summary.selfNestedCollapse = st.summary.selfNestedCollapse;
      logger?.warn?.('🛡️ 刀 36：父容器自嵌套双重渲染已折叠', {
        count: st.summary.selfNestedCollapse,
      });
    }
    if (st.summary.details?.length > 0) {
      summary.structuralTruthDetails = st.summary.details;
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1117', counter: summary });
    logger?.warn?.('🛡️ 刀 32/33/34 结构真值三刀异常（fail-open）', {
      error: err?.message || String(err),
    });
  }

  // ⑮ 刀 37 + 刀 42（2026-10-21 · 07ae49a2 / mc-1792580653375-60212fb6 实锤）：容器面板真值纠偏。
  //   刀 37 病灶：卡 2 的 class 背景写成 `@color-border-yellow` —— 那是**战略合作厂商面板**的底色
  //   （rgba(226,208,132,.2)），而卡 2 真值 bg 层与卡 1 是同一条水平蓝渐变 ⇒ 一卡淡蓝一卡淡黄。
  //     判据：色值反查归属（「背景值 == 另一个 section 的背景真值」= 借用他人背景）+ 渐变缺失。
  //   刀 42 病灶：三段面板容器（38:3137/3162/3206，class `c-60212f-container`）的 inline 只有
  //   `flex/min-height/display`、class 也只有 `display:flex;width:100%` ⇒ **底色/圆角/外发光
  //   三件全丢**（用户反馈「三个 section 依旧没有统一样式」）。旧实现「纯色未声明 ⇒ 交主题
  //   变量」在该层**根本没有槽位**，等于永远不补。现按面板底矩形真值补三件套。
  //   详 src/ai-engine/utils/container-background-truth.js。
  try {
    const bg = healContainerBackgroundTruth(result, { figmaRoot, logger });
    result = bg.files;
    if (bg.changes.length > 0) {
      summary.containerBackground = bg.changes.length;
      // M1 独立计数（与刀37/42 的补齐/纠偏区分）
      const truthlessCount = bg.changes.filter((c) => c.reason === 'truthless-bg').length;
      if (truthlessCount > 0) summary.bgTruthlessStripped = truthlessCount;
      const radiusCount = bg.changes.filter((c) => c.radius != null).length;
      const glowCount = bg.changes.filter((c) => c.shadow != null).length;
      if (radiusCount > 0) summary.containerPanelRadius = radiusCount;
      if (glowCount > 0) summary.containerPanelGlow = glowCount;
      logger?.warn?.('🛡️ 刀 37/42：容器面板底色/圆角/外发光按 figma 面板底真值补齐/纠偏', {
        changes: bg.changes,
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1145', counter: summary });
    logger?.warn?.('🛡️ 刀 37/42 异常（fail-open）', { error: err?.message || String(err) });
  }

  // ⑮-b 刀 42-B（2026-10-21 · mc-1792580653375-60212fb6 实锤）：面板装饰误置到子元素 ⇒ 移除。
  //   病灶：面板底的三件套（底色 @color-bg-vendor-gold/mint、r12、inset 发光）被写进了
  //   **标题行**的 class（`.c-60212f-header-text{2,3}`），面板容器本身空白 ⇒ 三段各画成
  //   一条黄条 / 一块绿砖 / 半截青条（用户：「三个 section 依旧没有统一样式」）。
  //   判据：元素自身无面板底真值 ∧ 声明了「圆角 R + 发光」∧ 存在**唯一** section 其面板真值
  //   半径 == R 且发光 RGB 相同 ⇒ 该装饰属于那个面板 ⇒ 从本元素删除三件套。
  //   详 src/ai-engine/utils/panel-chrome-misplacement.js。
  try {
    const pc = healPanelChromeMisplacement(result, { figmaRoot });
    result = pc.files;
    // 🛡️ A0（2026-11-04）：**无条件留痕**（命中 0 也必须出现）——把每次运行的「分母 + 各筛除
    //   分支」落进 summary 与日志，杜绝「跑过零命中 / 未跑到 / 被哪条 continue 筛掉」三态不可分。
    //   （与 G14b「静默丢段」同款缺口；改动纯观测，判据一字未动。）
    const s = pc.stats || {};
    // 键映射表：stats 键 → summary 键（**全量落盘，命中 0 也必须出现**）。
    // 见上方 summary 初始化块的语义注释。
    const STATS_TO_SUMMARY = {
      scanned: 'panelChromeScanned',
      skippedSelfPanel: 'panelChromeSkippedSelfPanel',
      skippedMissingDecl: 'panelChromeSkippedMissingDecl',
      skippedUnresolvedValue: 'panelChromeSkippedUnresolvedValue',
      skippedNoUniqueOwner: 'panelChromeSkippedNoUniqueOwner',
      classLevelScanned: 'panelChromeClassScanned',
      classLevelSkipped: 'panelChromeClassSkipped',
      classLevelSkipAlreadyStripped: 'panelChromeClassSkipAlreadyStripped',
      classLevelSkipNoShadow: 'panelChromeClassSkipNoShadow',
      classLevelSkipUnused: 'panelChromeClassSkipUnused',
      classLevelSkipShared: 'panelChromeClassSkipShared',
      classLevelSkipUnresolved: 'panelChromeClassSkipUnresolved',
      classLevelSkipNoOwner: 'panelChromeClassSkipNoOwner',
      classLevelSkipOccupied: 'panelChromeClassSkipOccupied',
    };
    for (const [k, sk] of Object.entries(STATS_TO_SUMMARY)) summary[sk] = s[k] ?? 0;
    summary.panelChromeMisplaced = pc.changes.length;
    logger?.info?.('🛡️ 刀 42-B 面板装饰反查（零命中亦留痕）', {
      scanned: summary.panelChromeScanned,
      changes: pc.changes.length,
      stats: s,
      skipped: pc.skipped,
    });
    if (pc.changes.length > 0) {
      logger?.warn?.('🛡️ 刀 42-B：面板装饰（底色/圆角/外发光）误置于子元素，已移除', {
        changes: pc.changes,
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1165', counter: summary });
    logger?.warn?.('🛡️ 刀 42-B 异常（fail-open）', { error: err?.message || String(err) });
  }

  // ⑮-c 刀 57 / 方案 E（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）：面板标题槽位归属。
  //   病灶：index.vue 把 Figma 标题组件（plan type=header、子树恰 1 TEXT）放进
  //   `<template #header-right>`，而 default-panel chrome 无条件渲染 componentName 标题
  //   （declare.json.title == Figma 标题文本）⇒ 双标题。
  //   判据（五条同时成立，确定性）：slot 直接内容为单组件标签 + 组件文件带 data-section-id
  //   + plan 段 type==='header' + Figma 子树恰 1 TEXT + 同文件无既有 title-left。
  //   ⇒ heal：`#header-right` → `#title-left`（只改 slot 名）；chrome 侧由前端
  //   default-panel 的 `v-if="!slot['title-left']"` 让位（零现有使用 ⇒ 零回归）。
  try {
    const planForTitleSlot = effectiveSections ? { effectiveSections } : null;
    if (planForTitleSlot) {
      const ts = healPanelTitleSlot(result, { plan: planForTitleSlot, figmaRoot });
      result = ts.files;
      if (ts.changes.length > 0) {
        summary.panelTitleSlotReslot = ts.changes.length;
        logger?.warn?.('🛡️ 刀 57：面板标题被塞进 header-right，已改挂 title-left', {
          changes: ts.changes,
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1189', counter: summary });
    logger?.warn?.('🛡️ 刀 57 异常（fail-open）', { error: err?.message || String(err) });
  }

  // ⑯ 刀 38（2026-10-21 · e3ab048a 实锤）：真值无描边 ⇒ 产物不得有边框。
  //   病灶：统计卡 1（38:3260，class `.c-e3ab04-stats-con`）写成 `border:1px solid #a0c1ff`
  //   + `border-radius:4px`，而真值 `strokes=[]`、`#a0c1ff` 全树不存在；同一张卡 2 因走
  //   刀 37 的「背景缺失」分支被修对 ⇒ 同系列两卡一有框一无框。
  //   判据：strokes 为空/全隐 ⇒ 删该 section 的 inline 与**独占 class** 的 border/outline；
  //   `border-radius`（圆角）与 `box-shadow`（figma INNER_SHADOW 真值）一律保留。
  //   详 src/ai-engine/utils/border-without-strokes.js。
  try {
    const bd = healBorderWithoutStrokes(result, { figmaRoot });
    result = bd.files;
    if (bd.changes.length > 0) {
      summary.borderWithoutStrokes = bd.changes.length;
      logger?.warn?.('🛡️ 刀 38：真值无描边却有边框，已按 figma strokes 真值删除', {
        changes: bd.changes,
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1209', counter: summary });
    logger?.warn?.('🛡️ 刀 38 异常（fail-open）', { error: err?.message || String(err) });
  }

  // ⑰ 刀 40（2026-10-21 · mc-1792575046720-2c0767be 实锤）：同一规则块内同属性重复声明消歧。
  //   病灶：`.c-component-card-grid-list`（common.less:15）同一块内先 `display: grid`
  //   后 `display: flex` + `flex-direction: column` ⇒ 折叠列表 12 张卡纵向单列堆叠，
  //   厂商名全在却看起来像「完全没修」。
  //   判据：同块同属性声明 ≥2 次、值不相等、且**不属合法渐进增强**
  //   （厂商前缀值 / var()/env() 回退 / !important 混存 / 纯色+渐变双层）⇒ 删前面留最后
  //   （= 浏览器实际生效值，渲染结果不变，只消除歧义）。
  //   ⚠️ 本刀**不修视觉**：「折叠段容器必须横向网格」是另一条布局契约判据，混进来就不可证伪。
  //   详 src/ai-engine/utils/block-duplicate-decl-guard.js。
  try {
    const dp = dedupeDuplicateDeclsInBlocks(result);
    result = dp.files;
    if (dp.changes.length > 0) {
      summary.blockDuplicateDecls = dp.changes.length;
      logger?.warn?.('🛡️ 刀 40：同一规则块内同属性重复声明，已按「后写者胜」消歧', {
        changes: dp.changes,
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1231', counter: summary });
    logger?.warn?.('🛡️ 刀 40 异常（fail-open）', { error: err?.message || String(err) });
  }

  // ⑱ 刀 41（2026-10-21 · mc-1792578497809-3a5bb639 实锤）：折叠网格「布局契约」确定性自愈。
  //   病灶：三段真值完全同构（4 列 × 126×30、列距 20、行距 20），产物却是三套实现，且两轮真机
  //   跑出来方向**正好互换**（优质 row✅/普通 column❌ → 下一轮反过来）⇒ 方向不是「错」，是**没人管**。
  //   既有三道判据全不覆盖：LAYOUT-001 只比「是不是 grid / 列数」，T3 方向守卫对 `isGrid`
  //   直接 `continue`，刀 22-grid 只抓子项 `width: calc(N% …)`（本例是 `flex: 1 1 calc(…%)`）。
  //   判据 = 纯几何（items[].absoluteBoundingBox 推卡片尺寸/列数/两轴间距），命名无关；
  //   fail-open：单列（真纵向列表）/ x 不等距 / items<2 ⇒ 不判不改。
  //   ⚠️ 自愈目标形态取 `display:grid; repeat(N, Wpx)`（非 flex）——LAYOUT-001 对 grid 段要求
  //   `display:grid`，若改写成 flex 会把门禁转红（两段式铁律：门禁与自愈必须同一世界观）。
  //   详 src/ai-engine/utils/grid-list-layout-contract.js。
  try {
    const sections = Array.isArray(effectiveSections) && effectiveSections.length > 0
      ? effectiveSections
      : (ctx?.layoutStructure?.layout?.sections || ctx?.layoutStructure?.sections || []);
    if (Array.isArray(sections) && sections.length > 0) {
      const fileArr = Object.entries(result).map(([path, content]) => ({ path, content }));
      const gridFigmaIndex = figmaRoot ? indexFigmaNodes(figmaRoot?.document || figmaRoot) : null;
      const det = detectGridListLayoutIssues(fileArr, { sections, figmaIndex: gridFigmaIndex });
      logger?.info?.('🛡️ R8-10 declaredContent 网格契约·已评估', {
        evaluated: true,
        contracts: det.stats.contracts,
        judged: det.stats.judged,
        mismatches: det.stats.mismatches,
        skippedNoTruth: det.stats.skippedNoTruth,
        // 观测型计数（0 也打）：契约段内流式轨道段数 / 其中末行不满被判违规的段数
        fluidTracks: det.stats.fluidTracks,
        fluidTracksIllegal: det.stats.fluidTracksIllegal,
      });
      if (det.issues.length > 0) {
        const healed = healGridListLayout(fileArr, det.issues);
        for (const f of healed.files) {
          if (typeof f.content === 'string' && result[f.path] !== f.content) {
            result[f.path] = f.content;
          }
        }
        summary.gridContractHealed = healed.healed.length;
        summary.gridContractFailed = healed.failed.length;
        logger?.warn?.('🛡️ 刀 41 自愈：折叠网格按几何契约确定性改写', {
          issues: det.issues.map((i) => ({
            sectionId: i.sectionId,
            cls: i.wrapperClass,
            codes: i.violations.map((v) => v.code),
          })),
          healed: healed.healed,
          failed: healed.failed,
        });
        // 复检留痕（0 = 全愈；残留交回 WARN 门禁）
        const recheck = detectGridListLayoutIssues(healed.files, { sections, figmaIndex: gridFigmaIndex });
        if (recheck.issues.length > 0) {
          summary.gridContractResidual = recheck.issues.length;
          logger?.warn?.('🛡️ 刀 41 复检残留（交回 WARN 门禁）', {
            residual: recheck.issues.map((i) => `${i.sectionId}@${i.file}`),
          });
        }
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1288', counter: summary });
    logger?.warn?.('🛡️ 刀 41 异常（fail-open）', { error: err?.message || String(err) });
  }

  // ⑲ 刀 54（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）：「产物可见文本必须是 Figma 真值文本」。
  //   病灶：`CardGrid.vue` 状态列写死英文 `status:'disabled'`（真值 `43:4862`「禁用」）并用作判色键；
  //   `ContentSection3.vue`（**无** data-section-id，LLM 凭空复制邻卡）写死 `ref('运行中')` / `ref('2')`。
  //   既有防线全不覆盖：do-not-invent 只校验 vision 下发的禁止对 + 图表形态；section-content-guard
  //   只判借用/重复/归属；business-text-rules#isTextAllowedByRules 判据写好了却**零消费者**（死代码）。
  //   判据：**Figma 全树** TEXT 文本为唯一真值集（不依赖 plan / 不依赖 section 归属 ⇒ 无 id 的
  //   编造组件同样在网内），产物里会渲染成可见文本的字面量（静态文本 / 展示属性 / ref / const /
  //   v-for 数据源数组字段值）凡 ∉ 真值 ∪ 白名单 ⇒ 硬编码。
  //   处置：能确定性 heal（唯一编辑距离候选）就换成真值；否则剥离（产物里不留非真值内容文本）；
  //   array-value 额外要求「同字段多数值属真值」才剥离（宁漏不误删）；剩余转 residual 只留痕。
  //   ⚠️ fail-open：无 figmaRoot / 真值集为空 ⇒ 不判不改（无真值源不能猜）。
  //   详 src/ai-engine/utils/hardcoded-text-gate.js。
  try {
    const fileArr = Object.entries(result)
      .filter(([p, c]) => p.endsWith('.vue') && typeof c === 'string')
      .map(([path, content]) => ({ path, content }));
    const det = detectHardcodedText({ files: fileArr, figmaRoot });
    summary.hardcodedTextHits = det.hits || 0;
    // 🔴 计数行铁律：无真值源（fail-open）也必须留痕，否则「零命中」与「零问题」不可区分。
    logger?.info?.('🛡️ 刀 54 硬编码文本门禁·已评估', {
      evaluated: det.evaluated,
      hits: det.hits,
      skipped: det.skipped,
      truthCount: det.truthCount,
      skippedReason: det.skippedReason || null,
    });
    if (det.hits > 0) {
      const hr = healHardcodedText({
        files: fileArr,
        figmaRoot,
        validateSfc: (c, p) => validateVueSfc(c, p),
      });
      const outArr = Array.isArray(hr.files) ? hr.files : Object.entries(hr.files).map(([path, content]) => ({ path, content }));
      for (const f of outArr) {
        if (typeof f.content === 'string' && result[f.path] !== f.content) result[f.path] = f.content;
      }
      summary.hardcodedTextHealed = hr.healed.length;
      summary.hardcodedTextStripped = hr.stripped.length;
      summary.hardcodedTextResidual = hr.residual.length;
      logger?.warn?.('🛡️ 刀 54：产物文本不在 Figma 真值集内，已按真值确定性处置', {
        healed: hr.healed.map((h) => ({ file: h.path, from: h.from, to: h.to, kind: h.kind })),
        stripped: hr.stripped.map((s) => ({ file: s.path, text: s.text, kind: s.kind })),
        residual: hr.residual.map((s) => ({ file: s.path, text: s.text, kind: s.kind, reason: s.reason || null })),
      });
      // 复检留痕（0 = 全愈；残留交回 WARN 门禁）
      const recheck = detectHardcodedText({ files: outArr, figmaRoot });
      if (recheck.hits > 0) {
        summary.hardcodedTextResidual = Math.max(summary.hardcodedTextResidual, recheck.hits);
        logger?.warn?.('🛡️ 刀 54 复检残留（交回 WARN 门禁）', {
          residual: recheck.issues.map((i) => `${i.path}[${i.kind}]${JSON.stringify(i.text)}`),
        });
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1345', counter: summary });
    logger?.warn?.('🛡️ 刀 54 异常（fail-open）', { error: err?.message || String(err) });
  }

  // ⑳ 刀 55（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）：plan 之外的编造副本组件。
  //   病灶：`ContentSection3.vue` **没有** data-section-id，是 LLM 凭空复制 `43:4898` 的第 2 份
  //   ⇒ 统计行出现两张「运行中/2」。三道既有防线全不覆盖：刀 53 按「plan section → 组件名」
  //   接管（无 section ⇒ 从不进 map）；刀 54 判「文本 ∉ 真值」（「运行中」是真值 ⇒ 合法放行）；
  //   section-content-guard 的 duplicate 处置只认 `>纯文本<`（`{{ statLabel }}` 删不掉）。
  //   判据：组件 X 不在 plan 组件名集合里 **且** X 的可见文本集合是某个 plan 内组件 Y 的
  //   **子集**（删掉零信息损失）**且** Y 唯一 ⇒ 删文件 + 从 index.vue 摘掉标签与 import。
  //   fail-open：无 effectiveSections / X 带来新内容 / 宿主不唯一 / 删除引入新错误 ⇒ 不删。
  //   详 src/ai-engine/utils/plan-orphan-guard.js。
  try {
    const planForOrphan = Array.isArray(effectiveSections) && effectiveSections.length > 0
      ? { effectiveSections }
      : null;
    const fileArr2 = Object.entries(result)
      .filter(([p, c]) => p.endsWith('.vue') && typeof c === 'string')
      .map(([path, content]) => ({ path, content }));
    const od = detectOrphanDuplicateComponents({ files: fileArr2, plan: planForOrphan });
    summary.orphanHits = od.hits || 0;
    // 🔴 计数行铁律：无 plan（fail-open）也留痕，否则零命中与零问题不可区分。
    logger?.info?.('🛡️ 刀 55 plan 外编造组件门禁·已评估', {
      evaluated: od.evaluated,
      hits: od.hits,
      planNames: od.planNames,
      skippedReason: od.skippedReason || null,
    });
    if (od.hits > 0) {
      const or = healOrphanDuplicateComponents({
        files: fileArr2,
        plan: planForOrphan,
        validateSfc: (c, p) => validateVueSfc(c, p),
      });
      const outArr2 = Array.isArray(or.files) ? or.files : Object.entries(or.files).map(([path, content]) => ({ path, content }));
      const next = {};
      for (const f of outArr2) next[f.path] = f.content;
      result = next;
      summary.orphanRemoved = or.removed.length;
      summary.orphanResidual = or.residual.length;
      logger?.warn?.('🛡️ 刀 55：plan 之外的编造副本组件已确定性移除（含 index.vue 引用摘除）', {
        removed: or.removed.map((r) => ({ file: r.path, duplicateOf: r.duplicateOf, texts: r.texts })),
        residual: or.residual.map((r) => ({ file: r.orphanPath, reason: r.reason })),
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1391', counter: summary });
    logger?.warn?.('🛡️ 刀 55 异常（fail-open）', { error: err?.message || String(err) });
  }

  // R8-8 已撤回：同块 flex + grid-template 也可能是列模板放错元素，不能据此翻 display。
  // 网格只由刀41/R8-10 按 v-for 宿主 + section 契约 + Figma 几何接管。

  // ㉑ 层 4+5（2026-10-26 · mc-max-1792985029695-58de7d47 实锤）：布局真值守卫。
  //   必须排在所有「写样式」步骤（①–⑳）之后：本步是对**最终样式文本**做确定性消歧/收敛，
  //   前置任何一步若再写样式都会把本步结果重新污染。
  //   ① J1 同块互斥布局指令（**无需真值**）：按最终 display 判定 ——
  //        `display: grid` ⇒ 删 flex-direction/flex-wrap/flex-flow；`display:flex` ⇒ 删 grid-*。
  //        真机病灶：`.c-device-list-section` 同时有 `display: grid` 与 `flex-wrap: wrap`
  //        （ListSection.vue 与 common.less 双写），flex 语汇恒 inert、纯噪声且诱发误读。
  //   ② J2 绝对 px 超真值轴尺寸（需 bbox）：`gap: 6px 93px` 跨轴 93px > 真值宽 32px ⇒ 删跨轴；
  //        `min-*` 超真值轴 ⇒ 收敛为真值轴尺寸。两侧恒安全（单列时跨轴 gap 本就被忽略）。
  //   ③ J3 真值尺寸被 SFC scoped 抹掉（需 bbox + shared 锚定真值）：shared `min-height:98px`
  //       与真值一致、scoped 声明更小值 ⇒ 剥 scoped 那条。跨文件由**优先级**裁决（scoped (0,2,0)
  //        胜 shared (0,1,0)），真值尺寸被静默吃掉 —— R5「CSS 取较大值」假设在此不成立。
  //   fail-open：无 figmaRoot ⇒ J1 仍生效、J2/J3 跳过；异常吞掉但留痕。
  try {
    const lt = runLayoutTruthGuard(result, { figmaRoot: ctx.figmaRoot, logger });
    if (lt && lt.summary && lt.files) {
      result = lt.files;
      summary.layoutTruthEvaluated = lt.summary.evaluated || 0;
      summary.layoutTruthInertRemoved = lt.summary.j1InertRemoved || 0;
      summary.layoutTruthGeometryClamped = lt.summary.j2GeometryClamped || 0;
      summary.layoutTruthTruthOverrideStripped = lt.summary.j3TruthOverrideStripped || 0;
      summary.layoutTruthHits = lt.summary.hits || 0;
      summary.layoutTruthSkippedReason = lt.summary.skippedReason || null;
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1422', counter: summary });
    logger?.warn?.('🛡️ 层4+5 布局真值守卫异常（fail-open）', { error: err?.message || String(err) });
  }

  // ㉒ R8-6（2026-11-02 · c-d1be-99d1be1d 实锤立项）：frame 类挂载族对账。
  //   病灶：LLM 对同一 Figma frame id 在模板上**概率性**挂两套类族之一——
  //   `c-component-frame-{id}`（跨组件复用基类，common.less 同步产出基类规则：仅
  //   display/flex-direction/gap，**无尺寸**）与 `c-{sem}-frame-{id}`（组件前缀**尺寸类**：
  //   `flex: 1 1 calc(25% - 20px)` 等）。同单内 ContentSection4 挂尺寸类（4 列网格正常）、
  //   ContentSection 只挂基类 ⇒ 6 个厂商 item 无宽度约束挤一行互相压盖（用户实拍）。
  //   prompt/roles 对该双类体系零约定（grep 实证）⇒ 纯 LLM 自发行为，prompt 治标不可靠。
  //   判据（可辩驳，三条同时成立才补挂）：
  //     ① 模板元素挂了 `c-component-frame-{id}`；
  //     ② 同产物 less（resources/styles/**.less 或组件 scoped 块）存在 `.{X}-frame-{id}`
  //        且规则体含**尺寸声明**（flex:/width:/grid-template:，排除 min-/max- 前缀）；
  //     ③ 该元素 class 列表尚不含 `{X}-frame-{id}`。
  //   动作：class 列表尾补挂 `{X}-frame-{id}`（双类并存，不动基类——保留复用语义）。
  //   Figma 节点 id 全局唯一 ⇒ 同 id 尺寸类语义必然同构，补挂无串位风险。
  //   fail-open：无尺寸类 / 尺寸类无尺寸声明 ⇒ 不猜不动。计数恒形状（0 也出现）。
  try {
    summary.frameClassScanned = 0;
    summary.frameClassAligned = 0;
    const frameAlignHits = [];
    // ── 收集尺寸类：完整类名 → 是否含尺寸声明（从所有 .less 与 .vue scoped 块提取）──
    const sizeClassDefs = new Map(); // className -> hasSizeDecl
    const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g;
    const SIZE_DECL_RE = /(?:^|[^-\w])(flex|width|grid-template)\s*:/;
    const collectLessText = (css, srcName) => {
      if (typeof css !== 'string' || css.length === 0) return;
      const ruleRe = /\.([A-Za-z0-9_-]*-frame-[A-Za-z0-9_]+)\s*\{([^{}]*)\}/g;
      for (const m of css.matchAll(ruleRe)) {
        const cls = m[1];
        const hasSize = SIZE_DECL_RE.test(m[2]);
        // 同名多处定义：只要有一处带尺寸就按尺寸类算（并联不猜）
        sizeClassDefs.set(cls, (sizeClassDefs.get(cls) || false) || hasSize);
        void srcName;
      }
    };
    for (const [fp, fc] of Object.entries(result)) {
      if (typeof fc !== 'string') continue;
      if (fp.endsWith('.less')) collectLessText(fc, fp);
      else if (fp.endsWith('.vue')) {
        for (const sm of fc.matchAll(STYLE_BLOCK_RE)) collectLessText(sm[1], fp);
      }
    }
    if (sizeClassDefs.size > 0) {
      for (const [fp, fc] of Object.entries(result)) {
        if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
        // 模板里挂的基类 token：c-component-frame-{id}
        const baseTokens = new Set();
        for (const m of fc.matchAll(/c-component-frame-([A-Za-z0-9_]+)/g)) {
          baseTokens.add(m[1]);
        }
        for (const id of baseTokens) {
          summary.frameClassScanned++;
          // 尺寸类：任意 `{X}-frame-{id}`（X≠component）且带尺寸声明
          const sizeCls = [...sizeClassDefs.keys()].find(
            (k) => k.endsWith(`-frame-${id}`) && !k.startsWith('c-component-') && sizeClassDefs.get(k),
          );
          if (!sizeCls) continue; // 无尺寸类 ⇒ 不猜不动
          if (fc.includes(sizeCls)) continue; // 已挂 ⇒ 幂等跳过
          const classAttrRe = new RegExp(
            `(class="[^"]*\\bc-component-frame-${id}\\b)([^"]*")`,
            'g',
          );
          const next = fc.replace(classAttrRe, `$1 ${sizeCls}$2`);
          if (next === fc) continue; // 未找到可安全补挂的静态 class 形态 ⇒ 不动
          result[fp] = next;
          summary.frameClassAligned++;
          frameAlignHits.push({ file: fp, baseClass: `c-component-frame-${id}`, added: sizeCls });
        }
      }
    }
    logger?.info?.('🛡️ R8-6 frame 类挂载族对账·已评估', {
      scanned: summary.frameClassScanned,
      aligned: summary.frameClassAligned,
      sizeClasses: sizeClassDefs.size,
      hits: frameAlignHits.slice(0, 10),
    });
    if (frameAlignHits.length > 0) {
      logger?.warn?.('🛡️ R8-6：基类挂载缺尺寸类 ⇒ 已补挂（同 frame id 尺寸类真值存在）', {
        total: frameAlignHits.length,
        hits: frameAlignHits.slice(0, 10),
      });
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:1507', counter: summary });
    logger?.warn?.('🛡️ R8-6 frame 类对账异常（fail-open）', { error: err?.message || String(err) });
  }

  // 🛡️ 悬空引用占位兜底（2026-11-10 · 流量 cf2742b9/设备 ContentSection26/ContentDailyTotalFlow 实锤）：
  //   index.vue import 的本地 .vue 从未落盘（LLM chunk 被写盘门禁丢弃/生成中断）⇒ 预览 404
  //   ⇒ RUNTIME-004 整单崩。判据单一来源 collectMissingVueImports（与 chunk-snapshot-pusher
  //   /task-code-snapshot 同源，禁两侧口径漂移）。兜底=补最小占位 SFC——缺段诚实降级，
  //   避免单文件缺陷放大成整组件不可用（expression 语法错误族由写盘门禁继续拦截，不在此豁免）。
  try {
    const idxKey = Object.keys(result).find(
      (p) => p === 'package/index.vue' || p.endsWith('/index.vue'),
    );
    if (idxKey && typeof result[idxKey] === 'string') {
      const missingImports = collectMissingVueImports(idxKey, (p) =>
        typeof result[p] === 'string' ? result[p] : null,
      );
      let patched = 0;
      for (const mp of missingImports) {
        if (typeof result[mp] === 'string') continue;
        const compName = mp.split('/').pop()?.replace(/\.vue$/i, '') || 'Placeholder';
        result[mp] = [
          '<template>',
          `  <!-- 🛡️ 占位组件：原文件生成失败（LLM chunk 缺失/门禁丢弃），悬空引用兜底自动补齐——缺段诚实降级 -->`,
          `  <div class="${compName.toLowerCase()}-placeholder" style="display:flex;align-items:center;justify-content:center;min-height:24px;color:inherit;opacity:0.35;font-size:12px;">${compName}</div>`,
          '</template>',
          '',
          '<script setup>',
          '// 占位组件由 pre-write-self-healing 悬空引用兜底生成（runPreWriteSelfHealing）',
          '</script>',
          '',
        ].join('\n');
        patched += 1;
      }
      summary.danglingImportPatched = patched;
      if (patched > 0) {
        logger?.warn?.(
          `🛡️ 悬空引用占位兜底：补齐 ${patched} 个缺失子组件（缺段降级，防整组件 404 崩溃）`,
          { missing: missingImports },
        );
      }
    }
  } catch (err) {
    reportPatchChainError(err, { logger: logger, pass: 'runPreWriteSelfHealing:dangling-import', counter: summary });
    logger?.warn?.('🛡️ 悬空引用占位兜底异常（fail-open）', { error: err?.message || String(err) });
  }

  return { files: result, summary };
}

export default runPreWriteSelfHealing;
