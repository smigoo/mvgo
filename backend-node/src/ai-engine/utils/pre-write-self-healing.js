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
import { healPanelChromeMisplacement, healPanelTitleSlot } from './panel-chrome-misplacement.js';
import { healBorderWithoutStrokes } from './border-without-strokes.js';
// 🛡️ 刀 40（2026-10-21）：同一规则块内同属性重复声明消歧（`display: grid` 被同块后写的
//   `display: flex` 覆盖 ⇒ 折叠列表纵向单列散架）。只消歧、不修视觉。
import { dedupeDuplicateDeclsInBlocks } from './block-duplicate-decl-guard.js';
// 🛡️ 刀 54（2026-10-23）：硬编码文本门禁 + 处置（产物可见文本必须是 Figma 真值文本）。
import { detectHardcodedText, healHardcodedText } from './hardcoded-text-gate.js';
// 🛡️ 刀 55（2026-10-23）：plan 之外的编造副本组件确定性移除。
import { detectOrphanDuplicateComponents, healOrphanDuplicateComponents } from './plan-orphan-guard.js';
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
} from './layout-truth-healer.js';

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
  const rootRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?data-section-id="[^"]+"(?:"[^"]*"|'[^']*'|[^>])*)>/;
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
    imgSrcBackfilled: 0,
    // 刀 38 / 刀 40（2026-10-21）：显式初始化 —— 下游若按固定形状序列化 summary，
    // 动态赋值的键会因「条件命中才出现」而缺字段（记忆铁律：加新字段必查下游消费）。
    borderWithoutStrokes: 0,
    blockDuplicateDecls: 0,
    gridContractHealed: 0,
    gridContractFailed: 0,
    gridContractResidual: 0,
    // 刀 42（2026-10-21）：面板三件套（底色/圆角/外发光）自愈计数
    containerBackground: 0,
    containerPanelRadius: 0,
    containerPanelGlow: 0,
    panelChromeMisplaced: 0,
    // 刀 57（2026-10-23 · 方案 E）：面板标题槽位归属（header-right → title-left）
    panelTitleSlotReslot: 0,
    // 刀 54（2026-10-23）：硬编码文本门禁（显式初始化 —— 下游按固定形状序列化 summary，
    // 动态赋值的键会因「条件命中才出现」而缺字段；记忆铁律：加新字段必查下游消费）。
    hardcodedTextHits: 0,
    hardcodedTextHealed: 0,
    hardcodedTextStripped: 0,
    hardcodedTextResidual: 0,
    // 刀 55（2026-10-23）：plan 外编造副本组件
    orphanHits: 0,
    orphanRemoved: 0,
    orphanResidual: 0,
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
        logger?.warn?.('🛡️ CODE-022 修复器异常（非阻断）', {
          file: fp,
          error: err?.message || String(err),
        });
      }
    }
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
      const det = detectVForListDirectionMismatch(fileArr, layoutStructure);
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
        const recheck = detectVForListDirectionMismatch(healed.files, layoutStructure);
        if (recheck.issues.length > 0) {
          summary.vForListDirectionResidual = recheck.issues.length;
          logger?.warn?.('🛡️ 刀 30 复检残留（交回 WARN 门禁）', {
            residual: recheck.issues.map((i) => `${i.id}@${i.file}`),
          });
        }
      }
    }
  } catch (err) {
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
    logger?.warn?.('🛡️ 刀 31 容器底色纠偏异常（fail-open）', {
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

  // ⑦ 背景 :style 补全自愈（缺 size/repeat/position → inferBackgroundStyle，无 mapping 才兜底铺满）。
  for (const [fp, fc] of Object.entries(result)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const completed = ensureBackgroundStyleComplete(fc, mapping);
    if (completed !== fc) {
      result[fp] = completed;
      summary.bgStyleComplete++;
      logger?.warn?.('🛡️ S6 修复：背景 :style 补全 size/repeat/position', { file: fp });
    }
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
    // ③ 透明容器臆造背景审计（2026-10-20 · 5ef650ff 实锤，只报不改）：
    //    设计稿 fills=[] 的透明容器（底色由宿主提供），产物对应 wrapper 却刷
    //    background ⇒ 盖住宿主底色（浅色发白/深色发灰）。对照透明容器真值：
    //    data-section-id → class → 样式规则块顶层 background 非透明 ⇒ 强 WARN。
    const tct = ctx.layoutStructure?.transparentContainerTruth;
    if (tct?.transparentIds?.length > 0) {
      const vueEntries = Object.entries(result)
        .filter(([p, c]) => /\.vue$/i.test(p) && typeof c === 'string');
      const styleEntries = Object.entries(result)
        .filter(([p, c]) => /\.(less|css|vue)$/i.test(p) && typeof c === 'string');
      const transparentBg = [];
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
        // 该 class 规则块顶层声明里的 background（[^{}]* 只取顶层段，嵌套块不扰）
        const ruleRe = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`, 'g');
        for (const [fp, fc] of styleEntries) {
          for (const rm of fc.matchAll(ruleRe)) {
            const body = rm[1];
            const bgM = body.match(/background(?:-color)?\s*:\s*([^;]+);/);
            if (bgM && !/^\s*transparent\s*$/.test(bgM[1])) {
              transparentBg.push({ sectionId: sid, file: fp, class: cls, value: bgM[1].trim().slice(0, 60) });
              break;
            }
          }
        }
      }
      if (transparentBg.length > 0) {
        summary.transparentContainerBg = transparentBg;
        logger?.warn?.(
          `🛡️ TRANSPARENT-CONTAINER-BG：${transparentBg.length} 处透明容器被臆造背景色覆盖（设计稿 fills=[]，底色应由宿主透出）`,
          { hits: transparentBg.slice(0, 10), truthTotal: tct.total },
        );
        appendFailOpenEvent(ctx.outputPath, {
          rule: 'TRANSPARENT-CONTAINER-BG',
          severity: 'WARN',
          reason: `${transparentBg.length} 处透明容器（figma fills=[]）被产物刷上背景色，盖住宿主底色（浅发白/深发灰）`,
          detail: { hits: transparentBg.slice(0, 10) },
        });
      }
    }
  } catch (err) {
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
    const bg = healContainerBackgroundTruth(result, { figmaRoot });
    result = bg.files;
    if (bg.changes.length > 0) {
      summary.containerBackground = bg.changes.length;
      const radiusCount = bg.changes.filter((c) => c.radius != null).length;
      const glowCount = bg.changes.filter((c) => c.shadow != null).length;
      if (radiusCount > 0) summary.containerPanelRadius = radiusCount;
      if (glowCount > 0) summary.containerPanelGlow = glowCount;
      logger?.warn?.('🛡️ 刀 37/42：容器面板底色/圆角/外发光按 figma 面板底真值补齐/纠偏', {
        changes: bg.changes,
      });
    }
  } catch (err) {
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
    if (pc.changes.length > 0) {
      summary.panelChromeMisplaced = pc.changes.length;
      logger?.warn?.('🛡️ 刀 42-B：面板装饰（底色/圆角/外发光）误置于子元素，已移除', {
        changes: pc.changes,
      });
    }
  } catch (err) {
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
      const det = detectGridListLayoutIssues(fileArr, { sections });
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
        const recheck = detectGridListLayoutIssues(healed.files, { sections });
        if (recheck.issues.length > 0) {
          summary.gridContractResidual = recheck.issues.length;
          logger?.warn?.('🛡️ 刀 41 复检残留（交回 WARN 门禁）', {
            residual: recheck.issues.map((i) => `${i.sectionId}@${i.file}`),
          });
        }
      }
    }
  } catch (err) {
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
    logger?.warn?.('🛡️ 刀 55 异常（fail-open）', { error: err?.message || String(err) });
  }

  return { files: result, summary };
}

export default runPreWriteSelfHealing;
