/**
 * 文件写入模块（方案 A 拆分）
 *
 * 职责：LLM 产物写盘前的清洗、校验、写入
 * - 文件路径校验
 * - 文件内容清洗（去 markdown 标记、修复虚假换行等）
 * - 重复 <template> 去重
 * - Vue SFC 写盘门禁（less 变量/mixin 自动补全）
 * - 文件写入 + theme-vars.less 回写
 *
 * 设计原则：
 * - 纯函数导出，不依赖 this
 * - logger 通过参数注入
 * - 依赖 code-healer 的 fixSpuriousLineBreaks
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  validateVueSfc,
  extractLessGlobalVars,
} from '../../utils/sfc-syntax-validation.js';
import { repairScopedThirdPartySelectors, ensureFlexDirectionInVueSfc, ensureFlexDirection, ensureGridDisplay, ensureGridDisplayInVueSfc, fixInvalidCssPropertiesInVue, fixInvalidCssProperties } from '../../utils/css-sanitizer.js';
// 🔴 2026-10-12：接上 M5-7 字号归一（此前 `lite.service.ts#prepareMicrocodeVueContent`
//   实现了它但**全文无调用点** ⇒ 死代码 ⇒ 归一从未生效，硬编码 px 字号直接过检失败）。
//   顶层静态导入（`writeFiles` 是同步函数，不能动态 import）。
import { normalizeFontSizeLiterals } from '../../utils/font-size-normalizer.js';
import { stripFgTakeoverRules } from '../../utils/folded-grid-section-takeover.js';
// 🛡️ 刀 53h（2026-10-23 · cd8938f8 实锤）：**接管后样式失配**的第三态收尾。
//   刀 53 家族接管叶段时用确定性模板渲染（`c-<sem>-fg-<kind>-<id>`），**完全不读**旧 LLM
//   模板 ⇒ 旧类名到新类名**没有映射可依**（故不能「重命名保其值」）。旧规则于是成为
//   「零引用孤儿」：既失效、注释语义还可能写错，纯误导。本刀在写盘出口做**孤儿判定**
//   （零 DOM/字面/动态引用 ⇒ 删块 + 留痕），并**复用** class-facts + style-class-consolidator
//   的同一份解析（禁造第三份）。只改 .less 源：.css 由下游 `recompileIndexCss` 自动重生成。
import { dropOrphanStyleRules } from '../../utils/orphan-style-rule-guard.js';
import { fixSpuriousLineBreaks, injectMissingTabUi, healVueEmbeddedStyleBraces, healThemeMixinVarRefs, healThemeMixinVarRefsInVue, healLessResourceVarInterpolation, healPresetLiteralDecls, healSlotHexToVarRefs, healVarNameCase, applyHealToVueStyleBlocks, injectThemeVarDeclsForLess, healLessColorFnVarArgs } from './code-healer.js';
import { collectThemeSlotNames, healBusinessStyleVarsInCss } from '../../utils/theme-color-guard.js';
import { healRootFixedSize, gateStandaloneLessWrite, rebalanceBlockComments } from '../../validators/less-compile-gate.js';
// 🛡️ L2-a（195c8d0e 实锤）：写盘门禁判坏且磁盘无 last-good 时，回退到分块缓存中的合格版本
import { pickCachedChunkLastGood } from './cached-chunk-last-good.js';
import {
  isColorEvaluable,
  isColorFnConsumer,
  NEUTRAL_LESS_COLOR,
} from '../../utils/less-color-funcs.js';
import { safeLogger } from '../../logger/safe-logger.js';
// 🛡️ #139（N3 · 2026-10-20 · e7a50be7 实锤）：颜色变量补齐「真值优先」——
//   旧行为纯按变量名猜色（84 处 `// 自动添加（语义推断）`：group-bg-gold→#ffffff、
//   group-glow-gold→#333333、accent-gold→#409EFF 蓝），与 Figma 真值全面漂移。
//   新口径（对齐「node 出颜色」分工）：规范槽位用规范值；组件自定义颜色变量优先取
//   node 真值桶（唯一才取，避免错位），无唯一真值则取桶内中性色，**不再编造语义色**。
import {
  buildTruthPalette,
  bucketFromVarName,
  bucketOfProperty,
  findConsumerProperty,
  neutralForBucket,
  pickTruthCandidate,
} from '../../utils/truth-palette.js';
import { MC_CANONICAL_COLOR_SLOTS } from '../../utils/style-tokens.js';
// 🛡️ 2026-09-29 治本：写盘门禁前置自愈——自闭合标签「` /` 后夹属性」畸形还原（单点实现，双链路共用）
import { repairSelfClosingSlashInsideTag } from '../../utils/pre-write-self-healing.js';
// 🛡️ 刀 43（2026-10-22）：R24「空 `<img>` / `:src` 引用未声明变量」的落盘前终验。
//   `writeFiles` 是所有产物文件的唯一写盘出口、且最后一个调用点在全部覆写/回退步骤之后
//   ⇒ 只有这里能保证「校验的内容 === 落盘的内容」。
import {
  healEmptyImgSrc,
  buildComponentOwnerMap,
  ownerSectionIdForFile,
  collectSectionIds,
} from '../../utils/resource-img-src-healer.js';
// 🛡️ 刀 45（2026-10-22）：「section 有图标真值但组件零渲染」—— 连 `<img>` 都没有，
//   R24 无对象可修。位置与尺寸全部取自 mapping 的 figmaBox/parentBox 真值，缺即不判。
import { healMissingIconRender } from '../../utils/missing-icon-render-healer.js';
// 🛡️ 刀 49（2026-10-22 · mc-1792643509867-db2d65f7 实锤）：**图标槽位尺寸契约**。
//   共享 class 被「图标容器」和「图标本体」共用时（`.c-db2d65-icon` = div 的
//   `width:100%;flex:1 1 0` + img 的 16×16），img 被拉成 570px。刀 39 依赖
//   `mapping.figmaBox`，而 `resource-dom-mapping.json` 根本没有该字段 ⇒ 整条路径静默跳过。
//   本刀真值改用**导入图片的原始像素**（导出 1x，与 Figma bbox 等价），永不缺失。
//   自愈只写**元素级内联**（inline 恒胜），绝不改写共享 class。
import { enforceIconSlotSize, resolveImageAbsPath } from '../../utils/icon-slot-size-contract.js';
import { resolveResourceDomMapping } from '../../utils/resource-import-guard.js';
// 🛡️ 刀 51（2026-10-22）：**段内标题行几何契约**。刀 50 把段的 padding / 子项间距钉到 Figma
//   真值后，段内标题行**自身**仍是三套实现（`padding: 0 calc(@fontSize*0.6)`=7.2px、
//   `gap` 6px/7px、标题 line-height 16px/1.2）⇒ 标题被推到 x=49（真值 44），三段还差 1~2px。
//   真值只从 Figma 树推（icon 节点的兄弟 TEXT），不需要 plan；判据见
//   src/ai-engine/utils/header-row-geometry.js。同样是**唯一写盘出口**才有效。
import { enforceHeaderRowGeometry } from '../../utils/header-row-geometry.js';
// 🛡️ 刀 52（2026-10-22）：父容器「垂直堆叠」几何契约。刀 50 管段内、刀 51 管标题行，
//   而**段自身的高度**仍在按 `flex:比例` 摊 —— 见 utils/section-stack-contract.js 的病灶说明。
//   在写盘出口按 DOM 直接子元素算（`data-rowpeers-wrap` 行组与普通段一视同仁），
//   判据复用 `section-intrinsic-layout#resolveStackGeometry`（与刀 50 同一份实现）。
import { enforceStackGeometry } from '../../utils/section-stack-contract.js';
import { indexFigmaNodes } from '../../utils/section-tree.js';
// 🛡️ 刀 41 挂载点迁移（2026-10-22 真机实锤）：折叠网格几何契约原挂在
//   `pre-write-self-healing` ⑱ —— 那一刻段容器的 `data-section-id` **还没补齐**，
//   `sectionIdOf(hostAttrs)` 取不到 id ⇒ 整段 `continue`。真机日志
//   `contracts:3/mismatches:2` 里**没有** 38:3140（战略段），而它恰恰是唯一还错的那段。
//   `writeFiles` 是唯一写盘出口、且此阶段 section 归属已就位 ⇒ 迁到这里重跑一次。
//   ⚠️ 必须在 **per-file 循环之前**整体跑：判据要跨文件统计 class 复用次数
//   （`buildClassUsage`），逐文件跑会把「被复用」误判成「独占」。
import {
  detectGridListLayoutIssues,
  healGridListLayout,
} from '../../utils/grid-list-layout-contract.js';

/**
 * 验证文件路径是否合法
 * @param {string} path 相对路径
 * @returns {boolean}
 */
export function isValidFilePath(path) {
  if (!path || typeof path !== 'string') return false;

  // 必须包含文件扩展名（.vue, .js, .less, .json等）
  if (!/\.[a-zA-Z0-9]+$/.test(path)) {
    return false;
  }

  // 不能包含中文字符
  if (/[一-龥]/.test(path)) {
    return false;
  }

  // 不能包含空格（正常文件路径不应该有空格）
  if (/\s/.test(path)) {
    return false;
  }

  // 必须是相对路径格式（package/index.vue, resources/styles/index.less等）
  // 不能以/开头，不能包含..
  if (path.startsWith('/') || path.includes('..')) {
    return false;
  }

  return true;
}

/**
 * 清理文件内容中的 markdown 标记
 * @param {string} content - 原始内容
 * @param {string} filePath - 文件路径（用于 .vue 文件特殊处理）
 * @param {Object} [options]
 * @param {Object} [options.logger] - 日志器
 * @returns {string}
 */
export function sanitizeFileContent(content, filePath = '', options = {}) {
  const logger = safeLogger(options.logger);
  if (!content || typeof content !== 'string') return content;

  // 1. 去除开头的 markdown 代码围栏（``` 或 ```less 等）
  let sanitized = content.replace(/^\s*```[a-zA-Z]*\s*\n?/m, '');

  // 1.5.去除 <thinking>...</thinking> 块（LLM 推理文本泄漏到 Vue 文件中）
  sanitized = sanitized.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '');

  // 2. 去除结尾的 markdown 代码围栏（单独成行的 ```）
  sanitized = sanitized.replace(/\n?\s*```\s*$/g, '');

  // 3. 去除中间可能出现的独立 markdown 围栏行（整行只有 ``` 或 ```lang）
  sanitized = sanitized.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '');

  // 4L. 🎯 2026-09-14 治本（mc-max-1789390853889-4bda6d13 真机实锤）：
  // .less/.css 文件混入 SFC 标签——LLM 输出样式块时把闭合标签一起带出（common.less:306
  // 残留孤立 `</style>`，无开标签）。样式文件**永远不可能合法包含**这些标签 → 直接剥离，零误伤。
  // 后果实证：`</style>` → LESS 编译 Unrecognised input → 最终 LESS 门禁 BLOCK、任务失败；
  // 且 index.less @import common.less，一个污染点连锁成「几乎所有文件都报 LESS-COMPILE-001」。
  // 此前微码链路只有 prompt 层"请别写"约束（lite/page-skeleton 等其他管线才有剥离逻辑）→ 必然复发。
  if (/\.(less|css|scss)$/i.test(filePath)) {
    sanitized = sanitized.replace(/<\/?(style|template|script)\b[^>]*>/gi, '');

    // 4L-b. 🎯 2026-10-05 治本（mc-max-1791132079721-6b655282 真机实锤）：
    // 4L 只覆盖 style/template/script 三个**固定标签名**，模型换一个标签名即穿透。
    // 事故现场：common.less 尾部同时残 `</style>`（4L 剥掉）+ `</a-table>`（漏网，非 SFC 名）
    // → LESS `Unrecognised input`（真实坐标 common.less:91）→ index.less 在**根作用域**
    //   `@import (multiple) './common.less'` ⇒ 4 个 .vue + index.less + common.less
    //   共 **6 个文件全部 LESS-COMPILE-001** ⇒ L0-B 重试耗尽 ⇒ 任务失败。
    // 故泛化为「整行裸标签」：样式文件里**不可能合法存在**只由标签构成的一行 ⇒ 直接剥离。
    // 刻意用行级匹配（^…$）：行内形态 `url('data:image/svg+xml;utf8,<svg …</svg>')` 是合法数据 URI，
    // 必须豁免（否则会剥掉 SVG 图标内容）。
    // 误伤审计（2026-10-05）：frontend/workspace/custom-components 全量 572 组件 / 2799 个 .less
    // → 命中 **1 处 = 本事故文件**；`</svg>` 2 处（c-device-monitor-54038a3a:332、a0167230:323）
    //   均在 url() 内同行 ⇒ 天然豁免。合取「阳性 1 / 误伤 0」。
    sanitized = sanitized.replace(/^[ \t]*<\/?[A-Za-z][\w-]*(?:\s[^>]*)?>[ \t]*(?:\r?\n|$)/gm, '');
  }

  // 4J. 🎯 2026-10-25 治本（mc-max-1792934332868-389dd460 真机实锤）：
  // **脚本文件**里混入 SFC 标签——LLM 把「某个 <script> 块」当**独立文件**输出时，
  // 尾部闭合标签随内容一起落盘（4L/4L-b 只管 .less/.css，`.js` 此前**零防护**）。
  //
  // 事故现场 `package/runtime.js`（7 行 / 466B）尾行 `</script>`：
  //   · chunk 原文（`.mc-gen/cache/code-chunks/3-package_runtime.js`）= 首行 ` ```js `
  //     + 正文 + 尾行 `</script>`；首围栏被本函数第 1 步剥掉，**尾标签无人管**
  //     （第 2 步只认 ```，且 `stripLlmTailGarbage` 显式跳过 `.js`）。
  //   · 预览端 vue3-sfc-loader 对 `.js` 固定按 script 模式解析
  //     （内部 `case ".js": createJSModule(src, false)`）⇒ 顶层 `export` 抛
  //     `'import' and 'export' may appear only with 'sourceType: "module"' (6:0)`
  //     ⇒「组件加载失败」；报错坐标指向真实的 `export` 行 ⇒ 掩盖了尾行 `</script>`。
  //   · 该文件**同时**踩两个坑（残留标签 + ESM 判别），故两层都要治——预览侧的
  //     ESM 升级见 `frontend/src/utils/sfc-loader-esm-js.js`，两边判据独立、互不替代。
  //
  // 判据刻意比 4L-b（任意标签名）更窄——JS 里 `<div>` 是合法内容（模板字符串拼 HTML）：
  //   ① 只认 template / script / style 三个 **SFC 块名**；
  //   ② 行级匹配（`^…$`）⇒ `const s = '</script>'` 这类**行内**字面量天然豁免；
  //   ③ 独占一行的 SFC 块标签在脚本文件里**不可能合法存在**（无配对开标签即无法闭合）。
  // 误伤审计（同 4L-b 口径）：全语料 `frontend/workspace/custom-components` +
  //   `temp-components` 的 `.js/.mjs/.ts` 扫「独占一行 SFC 标签」，除本事故件外命中即逐个人工核。
  if (/\.(js|mjs|cjs|jsx|ts|tsx)$/i.test(filePath)) {
    sanitized = sanitized.replace(
      /^[ \t]*<\/?(?:template|script|style)\b[^>]*>[ \t]*(?:\r?\n|$)/gm,
      '',
    );
  }

  // 4. 对 .vue 文件：去除 </style> / </script> / </template> 之后的说明性文本/markdown残留
  if (filePath.endsWith('.vue')) {
    // 标准 Vue SFC 中 </style> 应是最后一个块，它之后的任何内容全部丢弃
    const styleCloseIdx = sanitized.lastIndexOf('</style>');
    if (styleCloseIdx !== -1) {
      sanitized = sanitized.substring(0, styleCloseIdx + '</style>'.length);
    } else {
      // 回退：若没有 style 块，取所有闭合标签中位置最靠后的，并去除其后说明性文本
      const closingTags = ['</script>', '</template>'];
      let lastCloseIdx = -1;
      let lastCloseTagLen = 0;
      for (const tag of closingTags) {
        const idx = sanitized.lastIndexOf(tag);
        if (idx > lastCloseIdx) {
          lastCloseIdx = idx;
          lastCloseTagLen = tag.length;
        }
      }
      if (lastCloseIdx !== -1) {
        const afterClose = sanitized.substring(
          lastCloseIdx + lastCloseTagLen,
        );
        if (/```|精修说明|#\s|说明|Explanation|NOTE:|\*\*/.test(afterClose)) {
          sanitized = sanitized.substring(0, lastCloseIdx + lastCloseTagLen);
        }
      }
    }

    // 5.修复 LLM 输出中的虚假换行（每 ~15-20 字符硬换行导致标识符被拆碎）
    sanitized = fixSpuriousLineBreaks(sanitized, { logger });

    // 5.5. 修复 LLM 输出中的对象属性名被空格拆分（如 `for matter:` → `formatter:`）
    // 已知模式：`for matter` → `formatter`（ECharts tooltip.formatter 被模型错误拆分）
    // 只修明确是属性赋值的场景（后面跟 `:` 或 `(` ），避免误伤正常 `for` 循环
    sanitized = sanitized.replace(/\bfor\s+matter\s*(?=[:(])/g, 'formatter');
  }

  // 6. 去除首尾多余空白（保留内容中的空白）
  return sanitized.trim();
}

/**
 * 🛡️ 多余块闭合标签剔除（2026-09-26 · mc-max-1790430709803-8d304bf9 实锤）
 *
 * 病灶：`ContentActive.vue` 尾部出现**重复 `</style>`**：
 *   ```
 *   106: }
 *   107: </style>
 *   108: </style>     ← 多余
 *   ```
 * → `@vue/compiler-sfc` 报 `Invalid end tag.` → 内存校验判为坏文件 →
 * `isolateBadVueFiles` **把它连同 index.vue 里的 `<ContentActive/>` 引用一起剔除**
 * （P1-4 坏文件隔离）→ 切换区从「两张卡」变成「一张卡」，且模板留下一行空白。
 * 这是「机械可修」的缺陷，绝不该走「整个子组件降级剔除」这条重路。
 *
 * 与 `deduplicateTemplateBlocks`（重复 `<template>` 去重）同族且互补：本项目已有
 * 「块级标签重复 → 校验前先确定性去重」的先例，本函数补齐 `<style>` / `<script>` 两类
 * **闭合标签**（不删块内容，只删多出来的 `</tag>`）。
 *
 * 纪律：
 *   - 仅当 `闭合数 > 开始数` 时才动手，且只删「多出来的」那几个（从文件尾部往前删），
 *     合法的多块（如 `<style>` + `<style scoped>`）计数相等 → 零改动；
 *   - 删除时连同该行前导空白整行移除，避免在模板里留下空行；
 *   - 不碰块内容，纯文本变换，幂等。
 *
 * @param {string} source Vue SFC 全文
 * @returns {{ source: string, removed: string[] }} removed 形如 ['</style>']
 */
export function stripSurplusBlockClosers(source = '') {
  const src = String(source);
  if (!src) return { source: src, removed: [] };

  const BLOCK_TAGS = ['template', 'style', 'script'];
  let out = src;
  const removed = [];

  for (const tag of BLOCK_TAGS) {
    const opens = (out.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
    const closes = (out.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    let surplus = closes - opens;
    if (surplus <= 0) continue;

    // 收集全部闭合位置（从后往前删，保证低位下标不被前面的删除影响）
    const positions = [];
    const rx = new RegExp(`</${tag}\\s*>`, 'gi');
    let m;
    while ((m = rx.exec(out)) !== null) positions.push({ index: m.index, text: m[0] });

    for (let i = positions.length - 1; i >= 0 && surplus > 0; i--, surplus--) {
      const { index, text } = positions[i];
      const lineStart = out.lastIndexOf('\n', index);
      const lineHead = out.slice(lineStart + 1, index);
      if (/^[ \t]*$/.test(lineHead)) {
        // 该闭合标签独占一行 → 整行（含前导空白与换行）删除，不留空行
        out = out.slice(0, lineStart + 1) + out.slice(index + text.length);
      } else {
        out = out.slice(0, index) + out.slice(index + text.length);
      }
      removed.push(`</${tag}>`);
    }
  }

  if (removed.length === 0) return { source: src, removed: [] };
  return { source: out, removed };
}

/**
 * 检测并去重 Vue SFC 中重复的 <template> 标签。
 * 模型偶尔生成多个 <template>（如"模板1/模板2"双版本、或重复包裹），导致 @vue/compiler-sfc 报
 * "Single file component can contain only one <template> element" → 写盘门禁跳过整个文件。
 *
 * 策略：
 *  - 若检测到 2+ 个 <template>...</template> 顶层块，保留第一个，删除其余；
 *  - 保留的模板若只含 `<div>...</div>` 包裹且其内部内容看起来是"备选方案"（如包含
 *    "方案A/方案B"/"版本1/版本2"等文本），则进一步合并（把后续模板内容追加到首个模板末尾）。
 *  - 返回值：{ source: string, fixed: boolean, removedCount: number }
 */
export function deduplicateTemplateBlocks(source = '') {
  const src = String(source);
  // 匹配顶层 <template...>...</template>（非贪婪 + 允许带属性）
  const re = /<template\b[^>]*>([\s\S]*?)<\/template>/gi;
  const matches = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      full: m[0],
      content: m[1],
    });
  }
  if (matches.length <= 1)
    return { source: src, fixed: false, removedCount: 0 };

  // 保留第一个，把后续模板的内容合并到首个模板（如果看起来是「备选方案」）；
  // 否则直接丢弃（模型生成的重复大多是无意义重复，不是互补内容）。
  const first = matches[0];
  let mergedContent = first.content;
  const alternationHint =
    /方案[一二三四五1-9]|版本[一二三四五1-9]|alternative|option\s*[A-Z]/i;
  const hasAlternation = matches.some(
    (b, i) => i > 0 && alternationHint.test(b.content),
  );

  if (hasAlternation) {
    // 备选方案：合并内容到首个模板（保持首个为"主方案"）
    const extras = matches
      .slice(1)
      .map((b) => b.content.trim())
      .join('\n');
    mergedContent = `${first.content.trim()}\n<!-- 备选方案已合并 -->\n${extras}`;
  }

  // 重新构造 SFC：首个模板之前 + 新模板 + 首个模板之后（去除后续模板）
  const before = src.slice(0, first.start);
  const after = src.slice(first.end);
  const newTemplate = `<template>${mergedContent}</template>`;
  // 从 after 中删除所有后续模板的位置
  let cleanedAfter = after;
  for (let i = matches.length - 1; i >= 1; i--) {
    const rel = matches[i];
    const relStart = rel.start - first.end;
    const relEnd = rel.end - first.end;
    if (relStart >= 0 && relEnd <= cleanedAfter.length) {
      cleanedAfter =
        cleanedAfter.slice(0, relStart) + cleanedAfter.slice(relEnd);
    }
  }

  const result = `${before}${newTemplate}${cleanedAfter}`;
  return { source: result, fixed: true, removedCount: matches.length - 1 };
}

/**
 * 提取 style 内容中被引用（而非声明/混入）的所有 less 变量名。
 * 排除 @media/@import/@keyframes/@mixin/@include 等 at-rule 与混入调用（@name(）。
 * 用于「写盘门禁」兜底：把模型引用但未声明的设计令牌全部识别出来，避免链式/间接 undefined 漏网。
 */
export function extractLessVarReferences(content = '') {
  const atRuleExclude = new Set([
    'media',
    'import',
    'keyframes',
    'supports',
    'container',
    'charset',
    'namespace',
    'page',
    'font-face',
    'document',
    'viewport',
    'apply',
    'mixin',
    'include',
    'function',
    'if',
    'else',
    'each',
    'for',
    'while',
    'return',
    'extend',
    'use',
    'forward',
    'nest',
    'screen',
    'debug',
    'warn',
    'error',
    'rest',
    'once',
    'plugin',
  ]);
  const refs = new Set();
  const re = /@([a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1];
    if (atRuleExclude.has(name.toLowerCase())) continue;
    const after = content[m.index + m[0].length];
    if (after === '(') continue; // @mixin / @include / 混入调用，不是变量引用
    refs.add(name);
  }
  return [...refs];
}

/**
 * 判断 less 变量是否已声明
 * @param {string} content style 内容
 * @param {string} name 变量名（不含 @ 前缀）
 * @returns {boolean}
 */
export function isLessVarDeclared(content = '', name = '') {
  return new RegExp(`@${name}\\s*[:(]`).test(content);
}

/**
 * 从写盘门禁的 less 编译错误中提取「未定义的 mixin」名（.X is undefined）。
 * 模型常直接调用 .common()/.theme-dark()/.theme-light() 等 mixin，但这些定义在 theme-vars.less
 * 里，写盘门禁因相对 @import 被 strip 而无法解析。与变量兜底同理，注入空 mixin `.X() {}` 使内存编译通过；
 * 真实内容由落盘后的目录门禁（绝对路径 @import 链）完整编译校验。
 * 正则仅匹配「.name is undefined」这种 mixin 报错，不会误伤「variable @name is undefined」（@ 前缀）。
 */
export function extractUndefinedLessMixins(errors = []) {
  const names = new Set();
  for (const e of errors || []) {
    const re = /\.([A-Za-z_][\w-]*)\s+is\s+undefined/g;
    let m;
    while ((m = re.exec(String(e))) !== null) {
      names.add(m[1]);
    }
  }
  return [...names];
}

/**
 * 名字分支：**纯名字**推测安全值（不含消费端事实）。
 * ⚠️ 它可能返回非颜色（`0px` / `1.5` / `1` / `400`）或兜底 `unset` ——
 * 这些值被 LESS 颜色函数当实参时编译期不可求值，故必须经 `safeLessVarValue` 后置过滤。
 * @param {string} n 已去 @、已小写的变量名
 * @returns {string}
 */
function guessLessVarValueByName(n = '', ctx = {}) {
  // 🔴 2026-10-12 治本 B：深色底下面**反相**背景/边框/文字三类槽位。
  //   旧实现对 light/dark 返回同一个值 ⇒ 两个主题 mixin 同色 ⇒ 切主题零变化
  //   （真机实锤：产物 c-aiot-dpjh-bsjd-def7310d 的 `@color-bg-card` 两套都是 #ffffff）。
  const isDarkBg = ctx.background === 'dark';
  // 数值型：给真实数值，确保算术（如 @gap + 4px）也能编译通过
  if (/radius/.test(n)) return '8px';
  // 🛡️ 顺序修复（2026-09-02）：font-size 必须排在 size 之前——否则 `fontsize` 含子串 `size`，
  // 会被下面 /(…|size)/ 命中返回 0px（环境监测/流量监测「文字消失」根因，@fontSize 被兜底成 0px）。
  // 🛡️ 2026-09-03：补全值 '14px' → 'var(--fontSize)'——mc-check v1.0.20 M5-6 硬性要求
  // theme-vars.less 的 @fontSize 是 var(--fontSize) 映射（正则只认不带 fallback 的精确形态），
  // 字面值补全会导致每个组件 M5-6 失败（实锤 /tmp/mc-verify 复测）；var() 引用由根容器
  // --fontSize 变量驱动，less 编译原样输出合法。
  if (/(font-size|fontsize)/.test(n)) return 'var(--fontSize)';
  if (/(gap|padding|margin|space|offset|width|height|size)/.test(n))
    return '0px';
  if (/(line-height|lh)/.test(n)) return '1.5';
  if (/(opacity|alpha)/.test(n)) return '1';
  if (/(zindex|z-index)/.test(n)) return '1';
  if (/(weight|fw)/.test(n)) return '400';
  if (/(duration|delay|speed)/.test(n)) return '0.2s';
  // 颜色型：必须返回真实颜色（#/rgba），否则 lighten()/darken()/fade() 等 LESS 颜色函数无法求值。
  // 主题切换由 .theme-light()/.theme-dark() mixin 提供不同真实颜色，无需 CSS 运行时 var()。
  //
  // 🔴 2026-10-12 治本 B：深色底下背景/边框/文字必须给**深色系**值，
  //   否则深色主题渲染出白卡片/黑字 ⇒ 切主题看起来毫无变化（真机实锤）。
  if (/border/.test(n)) return isDarkBg ? '#4b4b4b' : '#e8e8e8';
  if (/(bg|background)/.test(n)) return isDarkBg ? '#2b2b2b' : '#ffffff';
  if (/(primary|accent)/.test(n)) return '#409EFF';
  if (/(success|ok)/.test(n)) return '#52c41a';
  if (/(warning|warn)/.test(n)) return '#faad14';
  // 🛡️ 2026-09-28（c-device-monitor-aa799337 实锤）：`alert`/`notice` 属**告警语义**，
  //   此前**不在语义表里** → `@color-alert` 含 "color" 一路落到下面的通用
  //   `/(text|color|...)/` → 被兜底成 `#333333`（灰）→ 设计的红色告警数字渲染成灰
  //   （真值 `d-3`/`d-5` fills 顶层 SOLID = #E03434 红）。
  //   归入 danger 族（与 `error|danger|fail` 同值），**必须先于**通用 text/color 分支命中。
  //   ⚠️ 归位安全性：数值型分支（zindex/weight/size…）都排在本行之前，故 `@alertZIndex`
  //   之类仍由数值分支接管，不会被误判成颜色。
  if (/(error|danger|fail|alert|notice)/.test(n)) return '#f5222d';
  if (/(text|color|colour|font|fg|ink)/.test(n)) return isDarkBg ? '#e6e6e6' : '#333333';
  // 兜底：CSS 全局关键字，对几乎所有属性合法，保证编译通过（渲染为中性默认）
  return 'unset';
}

/**
 * 按变量名推测安全的 less 变量默认值。
 * @param {string} name 变量名（含 @ 前缀）
 * @param {{styleText?: string, usedByColorFn?: boolean}} [ctx]
 *   消费端事实（二选一）：`styleText` 现场推断，或 `usedByColorFn` 集合查表。
 *   拿不到消费端上下文时可省略 —— 此时退化为纯名字猜测（与刀 16b 之前行为一致）。
 * @returns {string}
 */
/** 规范颜色槽位名集合（设计系统预设，属真值范畴；不在此列的组件变量不得按名编造色值） */
const CANONICAL_COLOR_NAMES = new Set([
  ...Object.keys(MC_CANONICAL_COLOR_SLOTS.light),
  ...Object.keys(MC_CANONICAL_COLOR_SLOTS.dark),
]);
/** 猜测值是否为 CSS 颜色/渐变（用于分流「颜色变量」与「数值变量」） */
const COLOR_VALUE_RE = /^(#|rgba?\(|hsla?\(|linear-gradient|radial-gradient)/i;

export function safeLessVarValue(name = '', ctx = {}) {
  const n = String(name).replace(/^@/, '').toLowerCase();
  const guess = guessLessVarValueByName(n, ctx);
  // 🛡️ #139（N3 · e7a50be7 实锤）：颜色变量一律「真值优先、禁止按名编造」。
  //   旧行为：`@color-group-glow-gold` → /accent|primary/ 未命中 → /(text|color)/ 命中 →
  //   #333333；`@color-accent-gold` → /accent/ 命中 → #409EFF（蓝）。而 node 真值分别是
  //   #ffc800（金）/ rgba(226,208,132,0.2)。按名猜测让整批变量色值漂移。
  //   新口径：① 规范槽位（设计系统预设）保留规范值；② 组件自定义颜色变量取真值桶
  //   （仅当桶内恰好 1 个候选，避免错位）；③ 否则取桶内中性色（backgrounds 全透明），
  //   绝不编造语义色——「没有真值就不给颜色」。
  if (COLOR_VALUE_RE.test(String(guess))) {
    if (CANONICAL_COLOR_NAMES.has(n)) {
      if (isColorEvaluable(guess) || !isColorFnConsumer(n, ctx)) return guess;
      return NEUTRAL_LESS_COLOR;
    }
    const prop = findConsumerProperty(ctx.styleText || '', n);
    // 🔴 桶优先取「真实消费属性」（事实）；查不到再按**变量名用途词**退路
    //   （只决定用哪个桶的中性色/真值，不产生新色值）。
    //   只认消费属性会让「定义在 mixin、消费在别处」的变量桶恒为 null ⇒ 全退成字色，
    //   `@color-card-bg` 白底变 #333333（存量 spec 实锤）。
    const bucket = bucketOfProperty(prop || '') || bucketFromVarName(n);
    const dark = ctx.background === 'dark';
    // 🔴 #139（N3 · e7a50be7 实锤）：**候选收窄**后唯一才取真值。
    //   收窄维度：属性形态（color/border 不接受渐变）× 色系（名字带 gold/mint/cyan ⇒
    //   只在同色系真值里挑）× 透明度档位（panel 偏半透明 / item·cell 偏不透明）。
    //   多义 = 真值不可判定 ⇒ 走中性兜底，**不猜**（猜就是 #409EFF 蓝的来路）。
    if (bucket) {
      const truth = pickTruthCandidate(ctx.truthPalette, bucket, {
        varName: n,
        property: prop || '',
      });
      if (truth) return truth;
      return neutralForBucket(bucket, { dark });
    }
    return isColorFnConsumer(n, ctx) ? NEUTRAL_LESS_COLOR : neutralForBucket('texts', { dark });  }
  // 🛡️ 刀 16b（2026-09-13）：**消费端事实优先于名字猜测**。
  // 名字分支可能给出非颜色（`@line-alpha` → '1'、`@radius-x` → '8px'）或兜底 'unset'；
  // 若该变量在样式里被 `lighten()/darken()/fade()` 等当**实参**引用，这些值在 LESS
  // **编译期**不可求值 → 报 `Argument cannot be evaluated to a color` → 整个 `<style>`
  // 块编译失败 → P1-4 坏文件隔离 → **子组件整块消失**。
  // 所以只要「猜出的值不可求值 且 确实被颜色函数消费」，就换中立真颜色。
  if (!isColorEvaluable(guess) && isColorFnConsumer(n, ctx)) {
    return NEUTRAL_LESS_COLOR;
  }
  return guess;
}

/**
 * 写入文件（主入口）
 *
 * @param {Object<string,string>} files 路径 → 内容
 * @param {string} outputPath 输出根目录
 * @param {Object} [options]
 * @param {Object} [options.logger] 日志器
 * @returns {{written: string[], skipped: string[]}}
 */
function isUserPatched(outputPath, relativePath) {
  try {
    const manifestPath = join(outputPath, '.user-patch', 'manifest.json');
    if (!existsSync(manifestPath)) return false;
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    return Array.isArray(parsed?.files) && parsed.files.includes(relativePath);
  } catch {
    return false;
  }
}

/**
 * P1-Slice1（增量补丁式更新）：写前 diff —— 判断本次写盘能否跳过。
 *
 * 背景：旧行为对同名文件一律 `writeFileSync` 无条件覆盖，等价于「每次生成都整包重写」。
 * 后果不仅是无意义 IO，更关键的是**重置 mtime、抹掉「本轮真正变化了哪些文件」这一信息**，
 * 使下游（候选快照 / 预览 / 断点续跑 / 缺失文件清单）无法做增量判断，
 * 表现为用户观察到的「一会儿一小部分、之前的不见了」。
 *
 * 契约（保守优先）：**只在磁盘内容与待写内容字节级全等时**才跳过；
 * 任何不确定情况（文件不存在 / 内容不同 / 读取异常）一律照常写入，
 * 绝不允许因增量优化而丢失产物。
 *
 * @param {string} fullPath 目标文件绝对路径（含文件名）
 * @param {string} content 待写入内容（应已过 sanitize，与最终落盘内容一致）
 * @returns {{skip: boolean, reason: 'absent'|'identical'|'differs'|'read_error'}}
 */
export function shouldSkipWrite(fullPath, content) {
  try {
    if (!existsSync(fullPath)) return { skip: false, reason: 'absent' };
    const existing = readFileSync(fullPath, 'utf-8');
    return existing === content
      ? { skip: true, reason: 'identical' }
      : { skip: false, reason: 'differs' };
  } catch {
    // 读取失败（权限 / 目录当文件读 / 编码异常等）：保守写入，不因兜底吞掉真实产物
    return { skip: false, reason: 'read_error' };
  }
}

/**
 * 🛡️ L2-a（2026-10-20 · mc-max-1792497064987-195c8d0e 实锤）：分块缓存 last-good 回退。
 * 实现与单测见 `cached-chunk-last-good.js`（独立模块，避免被本文件的重量级 import 链拖累）。
 * 判据：①chunk-meta 有登记 ②候选自身过写盘门禁 ③与本轮输出同 class 前缀。
 * @type {import('./cached-chunk-last-good.js').pickCachedChunkLastGood}
 */
export function writeFiles(files, outputPath, options = {}) {
  // 🔒 入口归一化（见 logger.js safeLogger）：本函数体内有 18 处裸 logger.* 调用，
  // 其中 3 处在 catch 块内。logger 未传时降级为 no-op，避免 TypeError 掩盖真实写盘错误。
  const logger = safeLogger(options.logger);
  // 🛡️ #139（N3）：真值色板（node 侧精确色值，按用途分桶）。缺省时颜色变量走中性色，
  //   不再按变量名编造语义色。调用方负责从 figma 树 buildTruthPalette 后透传。
  if (!options.truthPalette && options.figmaRoot) {
    try { options.truthPalette = buildTruthPalette(options.figmaRoot); } catch { /* fail-open */ }
  }

  if (!files || typeof files !== 'object') {
    logger.error('writeFiles 收到无效的 files 参数', { files });
    throw new Error('files 参数无效：期望一个对象');
  }

  if (logger) {
    logger.info('开始写入文件', {
      outputPath,
      fileCount: Object.keys(files).length,
    });
  }

  const writtenFiles = [];
  const skippedFiles = [];
  let currentFile = '';
  let currentStep = 'init';

  // 🛡️ 刀 43（2026-10-22 · mc-1792635919906-88b9c3a5 / mc-1792638154357-8a1a0d96 双实锤）：
  //   R24（空 `<img>` / `:src` 引用未声明变量）的**真正落盘前终验**。
  //
  //   为什么必须在这里、而不是 `pre-write-self-healing`：
  //   该链之后还有 4 个会**覆写或回退内容**的步骤 —— ① CODE-020 模板类名统一补前缀；
  //   ② 根容器布局归一；③ 「覆写后语义校验命中 ⇒ 回退到 `allFiles`（覆写前版本）」；
  //   ④ absolute 遮罩层宿主补 position。而 `writeFiles` 是**所有产物文件的唯一写盘出口**，
  //   其最后一个调用点在上述四步之后 ⇒ 只有这里能保证「门禁校验的内容 === 实际落盘的内容」。
  //   实测 8a1a0d96：pre-write 阶段零命中（产物三标题仍是裸 img），写盘出口才是唯一有效位。
  //
  //   归属表用**本次 files 全量**建（装配层 index.vue → 子组件最近 section 祖先），
  //   给「模板无 `data-section-id`」的组件兜底；惰性建一次。
  const _r24Mapping = (() => {
    try {
      return resolveResourceDomMapping(options.resourceDomMapping, outputPath);
    } catch {
      return null;
    }
  })();
  // 🔴 mapping 为空时 R24 与刀 45 **整条链静默跳过**（历史上因此白丢多轮真机验证）
  let _r24NoMappingLogged = false;
  let _r24OwnerMap = null;
  // 🛡️ 刀 51：Figma 节点索引惰性建一次（14 个 .vue × 全树 walk 太浪费；同一轮产物共用一棵树）
  let _r51Idx = null;
  // 🔴 刀 51 的可辩驳留痕（2026-10-22 真机实锤）：`figmaRoot` 上游曾恒为 undefined，
  //   导致 `_r51Idx.size === 0` 静默跳过 —— 日志里「没有报错」被误读成「没有问题」。
  //   现在「无树」与「有树但零命中」都要留痕，任何一环断路都能在日志里看见。
  let _r51NoTreeLogged = false;
  const _r51Stats = { evaluated: 0, singleImg: 0, mapped: 0, matched: 0, healed: 0 };
  // 🛡️ 刀 52：父容器堆叠（与刀 51 共用同一棵 Figma 索引；同样必须留痕，否则零命中不可判读）
  const _r52Stats = { evaluated: 0, mapped: 0, matched: 0, healed: 0 };
  // 🛡️ 刀 41（挂载点迁移）：折叠网格几何契约 —— 见文件头 import 处的病灶说明。
  //   留痕同理：`sections` 缺失 / `contracts:0` / `mismatches:0` 必须能在日志里区分。
  //   `skip*` 四列＝「为什么没判」（真机 2026-10-22：战略段两行 `38:3140/38:3153`
  //   根本不在 section 树里 ⇒ 一律 skipNoSection，任何几何判据都够不着）。
  const _r41Stats = {
    sections: 0,
    contracts: 0,
    mismatches: 0,
    healed: 0,
    failed: 0,
    residual: 0,
    skipNoSection: 0,
    skipNoTruth: 0,
    skipNoVFor: 0,
    skipNoClass: 0,
  };
  let _r41TreeLogged = false;
  // 刀 41 与刀 51/52 共用同一棵 Figma 索引（惰性建一次；真值兜底要用）
  let _r41Idx = null;
  // 🛡️ 刀 53h（2026-10-23 · cd8938f8 实锤）：接管后**孤儿样式规则**处置（第三态收尾）。
  //   留痕要求与刀 41 同理：`scanned===0`（无 styles 文件）与 `removed.length===0`
  //   （有 styles 但无孤儿）必须能在日志里区分 —— 禁「没日志 = 没问题」。
  //   `kept/skipped` 存的是**理由**，用于事后复算「为什么留」（可辩驳判据）。
  const _r53hStats = {
    scannedFiles: 0,
    blocks: 0,
    candidates: 0,
    removed: [],
    kept: [],
    skipped: [],
    residual: 0,
    dynamicPrefixes: [],
  };

  // ── 刀 41：整体（跨文件）跑一次，改写后的内容回灌到 filesForWrite ─────────────
  //   为什么是循环外：`detectGridListLayoutIssues` 用 `buildClassUsage(allFiles)` 统计
  //   每个 class 被几个元素使用，**只改写独占 class**（`frame-2136639905` 双身份铁律）。
  //   逐文件喂进去 ⇒ 复用统计恒为 1 ⇒ 会去改共享 class。真机 `pre-write` 那次是整体跑，
  //   这里必须保持一致，否则等于换了一套判据。
  let filesForWrite = files;
  try {
    const _r41Sections = Array.isArray(options.sections) ? options.sections : [];
    if (_r41Sections.length > 0) {
      _r41Stats.sections = _r41Sections.length;
      const _r41Arr = Object.entries(files)
        .filter(([, c]) => typeof c === 'string' && c)
        .map(([path, content]) => ({ path, content }));
      // 🔴 真值兜底（2026-10-22 真机实锤 mc-1792653212647）：section 树里**有** 38:3140 /
      //   38:3153，但 plan 节点不带 `items` ⇒ 旧实现 `skippedNoTruth:2`，战略段两行从未被判定。
      //   真值本来就在 Figma 树里；把同一棵索引（与刀 51/52 共用）交给判据按 id 反查。
      if (!_r41Idx) {
        _r41Idx = indexFigmaNodes(options.figmaRoot?.document ?? options.figmaRoot ?? null);
      }
      const _r41Det = detectGridListLayoutIssues(_r41Arr, {
        sections: _r41Sections,
        figmaIndex: _r41Idx && _r41Idx.size > 0 ? _r41Idx : null,
      });
      const _r41Ds = _r41Det.stats || {};
      _r41Stats.contracts = Number(_r41Ds.contracts) || 0;
      _r41Stats.mismatches = _r41Det.issues.length;
      _r41Stats.skipNoSection = Number(_r41Ds.skippedNoSection) || 0;
      _r41Stats.skipNoTruth = Number(_r41Ds.skippedNoTruth) || 0;
      _r41Stats.skipNoVFor = Number(_r41Ds.skippedNoVFor) || 0;
      _r41Stats.skipNoClass = Number(_r41Ds.skippedNoClass) || 0;
      // 🔴 section 树留痕（一次性）：这是「判据够不着某段」的唯一可判读证据。
      //   真机 2026-10-22 实锤：战略段两行（38:3140 / 38:3153）不在树里 ⇒
      //   只打 `mismatches:0` 会让人以为「已经对了」，实际是「从来没被看过」。
      if (logger && !_r41TreeLogged) {
        _r41TreeLogged = true;
        const _ids = [];
        const _walk = (list, depth) => {
          for (const s of Array.isArray(list) ? list : []) {
            if (!s || typeof s !== 'object') continue;
            _ids.push(`${'.'.repeat(Math.min(depth, 4))}${s.id || s.figmaNodeId || '?'}`);
            if (depth < 3) _walk(s.children || s.body?.children, depth + 1);
          }
        };
        _walk(_r41Sections, 0);
        logger.info('🛡️ 刀 41 section 树（真值源，判据只能看到这些 id）', {
          count: _ids.length,
          ids: _ids.slice(0, 80),
        });
      }
      if (_r41Det.issues.length > 0) {
        const _r41Healed = healGridListLayout(_r41Arr, _r41Det.issues);
        const _r41Map = new Map();
        for (const f of _r41Healed.files || []) {
          if (f && typeof f.path === 'string' && typeof f.content === 'string') {
            _r41Map.set(f.path, f.content);
          }
        }
        _r41Stats.healed = (_r41Healed.healed || []).length;
        _r41Stats.failed = (_r41Healed.failed || []).length;
        if (_r41Map.size > 0) {
          filesForWrite = { ...files };
          for (const [p, c] of _r41Map) {
            if (filesForWrite[p] !== c) filesForWrite[p] = c;
          }
        }
        if (logger) {
          logger.warn('🛡️ 刀 41 折叠网格几何契约（写盘出口·循环外整体）', {
            issues: _r41Det.issues.map((i) => ({
              sectionId: i.sectionId,
              file: i.file,
              cls: i.wrapperClass,
              codes: (i.violations || []).map((v) => v.code),
            })),
            healed: _r41Healed.healed,
            failed: _r41Healed.failed,
          });
        }
        // 复检留痕：0 = 全愈；残留交回 WARN 门禁（与 pre-write 同口径）
        //   ⚠️ 必须与 detect 用**同一组入参**（sections + figmaIndex），否则「复检通过」
        //   可能只是「换了一套判据」——两段式铁律的常见破法。
        const _r41Re = detectGridListLayoutIssues(
          Object.entries(filesForWrite).map(([path, content]) => ({ path, content })),
          { sections: _r41Sections, figmaIndex: _r41Idx && _r41Idx.size > 0 ? _r41Idx : null },
        );
        _r41Stats.residual = _r41Re.issues.length;
        if (_r41Re.issues.length > 0 && logger) {
          logger.warn('🛡️ 刀 41 复检残留（交回 WARN 门禁）', {
            residual: _r41Re.issues.map((i) => `${i.sectionId}@${i.file}`),
          });
        }
      }
    } else if (logger) {
      // 🔴 缺 sections = 静默全盲（历史事故重演点）：必须留痕，不许「没日志 = 没问题」
      logger.warn('🛡️ 刀 41 无 sections（fail-open，折叠网格契约无法判定）—— 请检查 writeFiles 的 sections 透传');
    }
  } catch (_r41Err) {
    // fail-open：修不了也必须写盘
    if (logger) {
      logger.warn('🛡️ 刀 41 写盘出口跳过（fail-open）', {
        error: _r41Err?.message || String(_r41Err),
      });
    }
  }

  // ── 刀 53h：孤儿样式规则整体（跨文件）处置一次，结果回灌到 filesForWrite ──────
  //   为什么是循环外：判据要跨文件查引用（`resolveDomClass` 命中 / 定义文件之外的
  //   字面引用 / 动态插值前缀干），逐文件喂进去会把「被别的文件引用」误判成零引用 ⇒ 误删。
  //   为什么能安全删：刀 53 家族接管叶段用的是确定性模板（不读旧 LLM 内容）⇒ 旧类名若
  //   在**全量产物**里零引用，就是纯粹的失效+误导残留。**只改 .less**：`.css` 是编译产物，
  //   下游 refiner 的 `recompileIndexCss` 会自动重生成（手改 css 必被覆盖）。
  try {
    const { map, stats } = dropOrphanStyleRules(filesForWrite);
    Object.assign(_r53hStats, stats);
    if (map && map.size > 0) {
      filesForWrite = { ...filesForWrite };
      for (const [p, c] of map) {
        if (filesForWrite[p] !== c) filesForWrite[p] = c;
      }
    }
    if (logger) {
      logger.warn('🛡️ 刀 53h 孤儿样式规则处置（写盘出口·循环外整体）', {
        scannedFiles: _r53hStats.scannedFiles,
        blocks: _r53hStats.blocks,
        candidates: _r53hStats.candidates,
        removed: _r53hStats.removed,
        removedCount: _r53hStats.removed.length,
        keptCount: _r53hStats.kept.length,
        skippedCount: _r53hStats.skipped.length,
        dynamicPrefixes: _r53hStats.dynamicPrefixes,
        residual: _r53hStats.residual,
      });
    }
  } catch (_r53hErr) {
    // fail-open：修不了也必须写盘
    if (logger) {
      logger.warn('🛡️ 刀 53h 写盘出口跳过（fail-open）', {
        error: _r53hErr?.message || String(_r53hErr),
      });
    }
  }

  try {
    let pendingThemeVars = '';
    // 🔴 数据源是 `filesForWrite`（= files 经刀 41 改写后）：若这里仍用 `files`，
    //   刀 41 的改写会被**静默丢弃**（它是循环外算好的，不写盘等于白跑一轮）。
    for (const [relativePath, content] of Object.entries(filesForWrite)) {
      currentFile = relativePath;
      currentStep = 'validating_path';
      // ✅ 验证文件路径
      if (!isValidFilePath(relativePath)) {
        if (logger) {
          logger.warn('❌ 跳过无效文件路径', {
            path: relativePath,
            reason: '路径包含中文、空格或缺少扩展名',
            contentPreview: content ? content.substring(0, 100) : '',
          });
        }
        skippedFiles.push(relativePath);
        continue;
      }

      // ✅ 清理文件内容（去除markdown标记），并修复 scoped 第三方组件样式穿透
      currentStep = 'sanitizing';
      let sanitizedContent = sanitizeFileContent(content, relativePath, { logger });

      // 🔴🔴 2026-10-12 接上死代码，修 M5-7（硬编码字体大小，mc-check 判 error）。
      //
      //   背景：`lite.service.ts` 里的 `prepareMicrocodeVueContent` 实现了字号归一，
      //   但**全文无任何调用点** ⇒ 死代码 ⇒ 归一能力从未生效。
      //   实测：产物 `c-aiot-dpjh-bsjd-fca166e8` 的 common.less 有 4 处
      //   `font-size: 18px/14px` ⇒ M5-7 error（`通过:34 失败:1`）。
      //
      //   为什么放这里：`writeFiles` 是**所有产物文件的统一写盘入口**，
      //   一次接入即覆盖 `.less` / `.css` / `.vue`（SFC 的 <style> 块），
      //   不依赖调用方记得调（这正是原死代码的根因）。
      //
      //   归一规则（`font-size-normalizer.js`，已离线验证 4 处 → 0 处）：
      //     font-size: 14px → @fontSize                （等于基准）
      //     font-size: 18px → calc(@fontSize * 1.2857) （倍数）
      //   ⚠️ 与 A7 同口径：倍数一律用 `calc()` —— Less 的 `var()` 变量不能参与算术，
      //     而 `@fontSize` 是 Less 槽位，裸乘法可行但 `calc()` 兼容性更好。
      //   ⚠️ 只动 `>5px`（`MIN_FONT_PX`）的字号，图标类小字号（≤5px）保持原样。
      if (/\.(less|css|vue)$/i.test(relativePath)) {
        try {
          // ⚠️ `writeFiles` 是**同步函数**（:496）⇒ 不能用动态 import（await 会语法错），
          //   故用顶层静态导入（见文件头 import）。
          const normalized = normalizeFontSizeLiterals(sanitizedContent);
          if (normalized.changes.length > 0) {
            sanitizedContent = normalized.text;
            if (logger) {
              logger.warn(
                `🛡️ M5-7 字号归一（硬编码 px → @fontSize / calc(@fontSize * N)）: ${relativePath}`,
                { changes: normalized.changes.length, sample: normalized.changes.slice(0, 3) },
              );
            }
          }
        } catch (fsnErr) {
          // 归一失败**不阻断**写盘（它只是兜底优化，门禁该拦就拦）
          logger?.warn?.(`字号归一跳过（${relativePath}）: ${fsnErr?.message || fsnErr}`);
        }
      }
      if (relativePath.endsWith('.vue')) {
        sanitizedContent = repairScopedThirdPartySelectors(
          sanitizedContent,
          logger,
        );
        sanitizedContent = ensureFlexDirectionInVueSfc(
          sanitizedContent,
          logger,
          { flexDirectionDefault: 'none' },
        );
        // 🛡️ 确定性自愈：grid-template-* 但漏写 display 时补 display:grid
        // （否则 grid-template-columns 完全失效 → 多列塌成一列 → 溢出被外壳裁掉 = 整块内容消失）
        sanitizedContent = ensureGridDisplayInVueSfc(sanitizedContent, logger);
        // 🛡️ 无效 CSS 属性名修正（LLM 幻觉属性如 line-min-height → min-height）
        sanitizedContent = fixInvalidCssPropertiesInVue(sanitizedContent, logger);
        // 🛡️ 重复 <template> 去重（模型偶尔生成多个 <template> 块，导致写盘门禁跳过整个文件）
        const dedup = deduplicateTemplateBlocks(sanitizedContent);
        if (dedup.fixed) {
          sanitizedContent = dedup.source;
          if (logger) {
            logger.warn(
              `🛡️ 写盘门禁自动去重 <template> 标签（${dedup.removedCount} 个）: ${relativePath}`,
            );
          }
        }
        // 🛡️ 确定性修复：对象字面量裸 key 漏引号（如 ref({ c-monitor-beijing: true })），
        // 不依赖模型重试，写盘前直接补齐引号，避免 compiler-sfc Unexpected token 致组件加载失败。
        const beforeKeyNormalize = sanitizedContent;
        sanitizedContent = normalizeObjectStringKeysInVue(sanitizedContent);
        if (sanitizedContent !== beforeKeyNormalize && logger) {
          logger.warn(
            `🛡️ 写盘门禁自动补齐对象裸 key 引号: ${relativePath}`,
          );
        }
        // 🛡️ 确定性自愈：LLM 定义了 tabs 数组但模板未渲染 tab UI → 注入 tab 栏骨架。
        // 与 healRootFixedSize 同源思路，写盘即修复，复用已有的 tabs/activeTab/handleTabChange，
        // 不依赖模型重试（L0-B 拦截重试有空转风险）。注入后仍需通过下方 SFC 写盘门禁校验。
        try {
          const tabbed = injectMissingTabUi(sanitizedContent);
          if (tabbed !== sanitizedContent) {
            sanitizedContent = tabbed;
            if (logger) {
              logger.warn(
                `🛡️ Tab UI 骨架自愈: ${relativePath}（script 定义 tabs 但模板无 tab 渲染，已注入 tab 栏）`,
              );
            }
          }
        } catch (tabErr) {
          if (logger) {
            logger.warn(
              `🛡️ Tab UI 骨架自愈跳过: ${relativePath}（${tabErr?.message || tabErr}）`,
            );
          }
        }
        // 🧩 SFC 内嵌 style 括号平衡自愈（LLM 常漏右大括号；独立 .less 有 heal、内嵌 style 此前无人管）
        try {
          const healedStyle = healVueEmbeddedStyleBraces(sanitizedContent);
          if (healedStyle !== sanitizedContent) {
            sanitizedContent = healedStyle;
            if (logger) {
              logger.warn(
                `🧩 SFC 内嵌 style 括号自愈: ${relativePath}（补全缺失右大括号）`,
              );
            }
          }
        } catch (styleErr) {
          if (logger) {
            logger.warn(
              `🧩 SFC 内嵌 style 括号自愈跳过: ${relativePath}（${styleErr?.message || styleErr}）`,
            );
          }
        }
        // 🛡️ E 步扩展：SFC 内嵌 style 的 theme 变量引用自愈（mixin 闭包变量 @fontSize 等
        // 顶层不可见 → SFC style 编译失败 → P1-4 隔离 → 「刷新后 tabs 消失只剩 chart」，
        // 实锤 mc-max-1788176720155-9560d082 HeaderTabs/EnvironmentTabs）
        try {
          const themeVars = files?.['resources/styles/themes/theme-vars.less'];
          if (typeof themeVars === 'string') {
            // 🛡️ 同步 M5-6（2026-09-10）：SFC 内嵌 style 也先注入同名 Less 声明，
            // 让下方 healThemeMixinVarRefs 因 localDeclared 命中而跳过 `@color-*`
            // → `var(--colorXxx)` 改写，避免产出 `var(--colorTextBase, #333333)`
            // 被 THEME-VAR-NAME-MISMATCH 拦（P0-C 实锤 mc-max-1790672828887-57d80179）。
            // 与独立 .less 分支 injectThemeVarDeclsForLess 同源。
            const declInjected = applyHealToVueStyleBlocks(sanitizedContent, (css) =>
              injectThemeVarDeclsForLess(css, themeVars),
            );
            if (declInjected !== sanitizedContent) {
              sanitizedContent = declInjected;
              if (logger) {
                logger.warn(
                  `🧩 SFC theme 变量声明注入(同步 M5-6): ${relativePath}（@color-* → 同名 Less 声明，避免改写 var()）`,
                );
              }
            }
            const healedRefs = healThemeMixinVarRefsInVue(sanitizedContent, themeVars);
            if (healedRefs !== sanitizedContent) {
              sanitizedContent = healedRefs;
              if (logger) {
                logger.warn(
                  `🧩 SFC theme 变量引用自愈: ${relativePath}（mixin 闭包变量 @x → var(--x, 默认值)）`,
                );
              }
            }
          }
        } catch (refErr) {
          if (logger) {
            logger.warn(`🧩 SFC theme 变量引用自愈跳过: ${relativePath}（${refErr?.message || refErr}）`);
          }
        }
        // 🛡️ 2026-09-04 A2+B：主题变量化确定性自愈（写盘即修复，防 THEME 门禁 3 轮重试耗尽）。
        // ① 槽位 hex 字面量（color: #ffffff）→ var(--cssVar, #hex)（THEME-SLOT-COLOR）；
        // ② 预设字面量声明（@colorPrimary: #409EFF）→ @colorPrimary: var(--colorPrimary, #409EFF)
        //    透传（THEME-PRESET-OVERRIDE）。仅作用于 <style> 块，template/script 不参与。
        try {
          const themeVarsForVue = files?.['resources/styles/themes/theme-vars.less'];
          if (typeof themeVarsForVue === 'string') {
            // 🛡️ 2026-09-29 P0-C 治本：写盘阶段即把 SFC <style> 内 `var(--colorXxx[, fallback])`
            // 确定性转成 @color-xxx Less 槽位引用（与 healBusinessStyleVarRefs 同源，但限定 <style> 块，
            // 避免误伤 <template>/<script>），根治 L0-B THEME-VAR-NAME-MISMATCH（var() 运行期不被注入
            // → fallback 恒生效、切主题零响应）。此前该转换只在 quality-auto-fix 事后阶段，L0-B 已先 block。
            const slotNames = collectThemeSlotNames(themeVarsForVue);
            const themedVue = applyHealToVueStyleBlocks(sanitizedContent, (css) => {
              const varToLess = healBusinessStyleVarsInCss(css, slotNames); // <style> 内 var() → @color-x
              const slotHealed = healSlotHexToVarRefs(varToLess, themeVarsForVue);
              const presetHealed = healPresetLiteralDecls(slotHealed, relativePath);
              return healVarNameCase(presetHealed);
            });
            if (themedVue !== sanitizedContent) {
              sanitizedContent = themedVue;
              if (logger) {
                logger.warn(
                  `🧩 主题变量化自愈 + SFC <style> var()→Less 槽位: ${relativePath}（var(--colorXxx) → @color-xxx，避免 THEME-VAR-NAME-MISMATCH）`,
                );
              }
            }
          }
        } catch (themeHealVueErr) {
          if (logger) {
            logger.warn(`🧩 主题变量化自愈跳过: ${relativePath}（${themeHealVueErr?.message || themeHealVueErr}）`);
          }
        }
        // 🛡️ less 插值引用资源变量自愈：url('@{bg1}') 引的是 JS import 变量，
        // less 编译报 undefined → 改写为相对当前文件的静态资源路径（背景图真实可见）。
        // 实锤 StatisticsRow.vue:35 variable @bg1 is undefined → P1-4 隔离。
        try {
          const healedRes = healLessResourceVarInterpolation(
            sanitizedContent,
            relativePath,
            files,
          );
          if (healedRes !== sanitizedContent) {
            sanitizedContent = healedRes;
            if (logger) {
              logger.warn(
                `🧩 less 资源插值自愈: ${relativePath}（@{x} → 静态相对路径）`,
              );
            }
          }
        } catch (resErr) {
          if (logger) {
            logger.warn(`🧩 less 资源插值自愈跳过: ${relativePath}（${resErr?.message || resErr}）`);
          }
        }
        // 🛡️ 主题变量补集（mc-max-1788258252381-9168ed08 实锤）：内存阶段 validateVueSfc
        // 剥离相对 @import 连带剥掉 theme-vars 变量定义 → 合法 `@fontSize` 引用误报
        // undefined → 下方兜底会注入冗余声明（覆盖主题真值）。以文件集顶层变量 globalVars
        // 补回定义，只在「真臆造变量」时才走注入兜底。
        // 🛡️ 写盘门禁**前置**自愈（2026-09-26 普查）：LESS 颜色函数（fade/lighten/darken…）
        //   的参数写成运行期 `var(--x, #hex)` → LESS 编译期无法求值 → 硬报错 → 重试仍失败
        //   → **整文件被跳过**（比坏文件隔离更隐蔽，不留 degradedFiles 痕迹）。
        //   全日志 67 条「写盘门禁失败（已跳过）」中 37 条（55%）正是此形态。
        //   在任何校验之前确定性改写为编译期可求值形式（无匹配时零改动）。
        const _colorFnHeal = healLessColorFnVarArgs(sanitizedContent);
        if (_colorFnHeal.changes.length > 0) {
          sanitizedContent = _colorFnHeal.source;
          if (logger) {
            logger.info('🛡️ LESS 颜色函数 var() 参数 → 编译期可求值（写盘门禁前置自愈）', {
              path: relativePath,
              count: _colorFnHeal.changes.length,
              sample: _colorFnHeal.changes.slice(0, 2),
            });
          }
        }
        const lessGlobalVars = extractLessGlobalVars(files);
        // 🛡️ 写盘门禁**前置**自愈（2026-09-29 · mc-max-1790678096786-f5cac254 实锤）：
        //   N3「bg→父容器强制挂载」对**自闭合**元素拼接 :style 时把属性写到了 `/` 之后
        //   ⇒ `<X … class="…" / :style="{ … }">` ⇒ compiler-sfc 报
        //   `Illegal '/' in tags.` + `Element is missing end tag.` ⇒ 本门禁判死 → **整文件跳过**
        //   （进 component-meta.json#gateSkippedFiles）→ 产物缺失 → 前端「组件资源加载失败」。
        //   全语料 68 个任务带 gateSkippedFiles，21 个跳过的正是 package/index.vue（复发型 P0）。
        //   在任何校验之前确定性还原语法（无匹配时零改动、幂等），与上方 healLessColorFnVarArgs 同款。
        //   实现单点在 utils/pre-write-self-healing.js（双链路共用），此处只做调用。
        try {
          const _slashHealed = repairSelfClosingSlashInsideTag(sanitizedContent);
          if (_slashHealed !== sanitizedContent) {
            sanitizedContent = _slashHealed;
            if (logger) {
              logger.warn(
                `🛡️ 自闭合标签斜杠错位修复（写盘门禁前置自愈）: ${relativePath}（\` / :style=\` → \`:style= … />\`）`,
              );
            }
          }
        } catch (slashErr) {
          if (logger) {
            logger.warn(
              `🛡️ 自闭合标签斜杠错位修复跳过: ${relativePath}（${slashErr?.message || slashErr}）`,
            );
          }
        }
        const syntaxResult = validateVueSfc(sanitizedContent, relativePath, {
          lessGlobalVars,
        });
        if (!syntaxResult.valid) {
          // 🛡️ 写盘门禁容错：模型常引用未定义的 less 设计令牌
          const styleBlocks = (
            sanitizedContent.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ||
            []
          ).join('\n');
          const referenced = extractLessVarReferences(styleBlocks);
          const missing = referenced.filter(
            (v) => !isLessVarDeclared(styleBlocks, v),
          );
          const missingMixins = extractUndefinedLessMixins(
            syntaxResult.errors,
          );
          if (missing.length > 0 || missingMixins.length > 0) {
            const declParts = [];
            if (missing.length > 0)
              declParts.push(
                missing
                  .map((v) => `@${v}: ${safeLessVarValue('@' + v, { styleText: styleBlocks, truthPalette: options.truthPalette })};`)
                  .join('\n'),
              );
            if (missingMixins.length > 0)
              declParts.push(
                missingMixins.map((name) => `.${name}() {}`).join('\n'),
              );
            const decl = declParts.join('\n');
            const fixed = sanitizedContent.replace(
              /<style\b[^>]*>/g,
              (m) => `${m}\n${decl}\n`,
            );
            const retry = validateVueSfc(fixed, relativePath, {
              lessGlobalVars,
            });
            if (retry.valid) {
              sanitizedContent = fixed;
              if (missing.length > 0) {
                pendingThemeVars += `${missing.map((v) => `@${v}: ${safeLessVarValue('@' + v, { styleText: styleBlocks, truthPalette: options.truthPalette })};`).join('\n')}\n`;
                if (logger) {
                  logger.warn(
                    `🛡️ 写盘门禁自动补全缺失 less 变量 ${missing.join(', ')}（${relativePath}）`,
                  );
                }
              }
              if (missingMixins.length > 0 && logger) {
                logger.warn(
                  `🛡️ 写盘门禁自动补全缺失 less mixin ${missingMixins.join(', ')}（${relativePath}）`,
                );
              }
            } else {
              // 修复后仍失败：降级为 warn + 跳过该文件，不阻断其他文件落盘
              if (logger) {
                logger.warn(
                  `🛡️ Vue SFC 写盘门禁失败（已跳过）: ${relativePath}`,
                  { errors: retry.errors },
                );
              }
              skippedFiles.push(relativePath);
              continue;
            }
          } else {
            // 无缺失变量/mixin，直接是语法错误：同样 warn + 跳过，避免整体任务作废
            if (logger) {
              logger.warn(
                `🛡️ Vue SFC 写盘门禁失败（已跳过）: ${relativePath}`,
                { errors: syntaxResult.errors },
              );
            }
            skippedFiles.push(relativePath);
            continue;
          }
        }
      } else if (
        relativePath.endsWith('.less') ||
        relativePath.endsWith('.css')
      ) {
        // 🛡️ 独立样式文件（common.less / index.css 等）也做 flex 方向确定性补全
        sanitizedContent = ensureFlexDirection(
          sanitizedContent,
          logger,
          { flexDirectionDefault: 'none' },
        );
        // 🛡️ 确定性自愈：grid-template-* 但漏写 display 时补 display:grid（见 SFC 分支同名注释）
        sanitizedContent = ensureGridDisplay(sanitizedContent, logger);
        // 🛡️ 无效 CSS 属性名修正（LLM 幻觉属性如 line-min-height → min-height）
        sanitizedContent = fixInvalidCssProperties(sanitizedContent, logger);

        // 🛡️ P1-5（2026-10-01 · 869be6fe 实锤）：独立 .less 的**写盘前等价门禁**。
        //   旧实现只跑 healLessSource 且**不校验结果** ⇒ common.less 这条旁路无门禁：
        //   style-class-consolidator#mergeIntoCommonLess 把已被判死的坏文本原样搬进共享样式表
        //   直接落盘 → 最终 LESS 门禁 BLOCK → L0-B 重试耗尽 → 任务失败且预览不可用。
        //   现在：能修先修（围栏/未闭合注释/漏分号/漏右大括号），修不掉则**跳过写盘**
        //   （保住磁盘 last-good 版本）。为何不做真编译见 gateStandaloneLessWrite 头注。
        try {
          const _lessGate = gateStandaloneLessWrite(sanitizedContent, relativePath);
          if (_lessGate.fixes.length > 0) {
            sanitizedContent = _lessGate.content;
            if (logger) {
              logger.warn(
                `🧩 LESS 写盘自愈: ${relativePath}（${_lessGate.fixes.join(', ')}）`,
              );
            }
          }
          if (!_lessGate.ok) {
            // 🛡️ 2026-10-15（a715fafc 实锤，B 降级）：「跳过 = 保留磁盘 last-good」只对
            //   **已存在好版本**的文件成立。新任务首次写盘（或磁盘上本就是空兜底模板）时
            //   跳过 = 交付空兜底模板裸样式产物，比带病落盘更糟。
            //   ⇒ 无 last-good 时降级：块注释配平（未闭合 /* / 孤立 */ 抹空格）→ 复检
            //   → 落盘 + WARN；配平后仍有缺陷才回退原跳过策略。
            let _hasLastGood = false;
            try {
              const _absPath = join(outputPath, relativePath);
              const _disk = existsSync(_absPath) ? readFileSync(_absPath, 'utf-8') : '';
              _hasLastGood =
                _disk.trim().length > 0 && !_disk.includes('模型输出为空时自动补齐');
            } catch {
              _hasLastGood = false;
            }
            if (!_hasLastGood) {
              // 🛡️ L2-a（195c8d0e 实锤）：磁盘无 last-good ⇒ 先试**分块缓存**里的合格版本。
              //   命中则直接用它落盘（不再走块注释配平 / 跳过），避免好样式被兜底模板覆盖。
              const _cachedGood = pickCachedChunkLastGood(
                outputPath,
                relativePath,
                sanitizedContent,
              );
              if (_cachedGood) {
                sanitizedContent = _cachedGood;
                if (logger) {
                  logger.warn(
                    `🛡️ LESS 写盘门禁失败，已回退到分块缓存中的合格版本: ${relativePath}`,
                    { defects: _lessGate.defects, recoveredChars: _cachedGood.length },
                  );
                }
              } else {
                const _retry = gateStandaloneLessWrite(
                  rebalanceBlockComments(sanitizedContent),
                  relativePath,
                );
                if (_retry.ok) {
                  sanitizedContent = _retry.content;
                  if (logger) {
                    logger.warn(
                      `🛡️ LESS 写盘门禁降级落盘（无 last-good，块注释配平）: ${relativePath}`,
                      { defects: _lessGate.defects, retryFixes: _retry.fixes },
                    );
                  }
                } else {
                  if (logger) {
                    logger.warn(
                      `🛡️ LESS 写盘门禁失败（无 last-good、无缓存合格版本，配平后仍缺陷，已跳过）: ${relativePath}`,
                      { defects: _retry.defects },
                    );
                  }
                  skippedFiles.push(relativePath);
                  continue;
                }
              }
            } else {
              if (logger) {
                logger.warn(
                  `🛡️ LESS 写盘门禁失败（已跳过，保留磁盘 last-good）: ${relativePath}`,
                  { defects: _lessGate.defects },
                );
              }
              skippedFiles.push(relativePath);
              continue;
            }
          }
        } catch (healErr) {
          if (logger) {
            logger.warn(`🧩 LESS 写盘自愈跳过: ${relativePath}（${healErr?.message || healErr}）`);
          }
        }

        // 🛡️ M5-6 归一（2026-09-03，mc-check v1.0.20 实锤）：theme-vars.less 的 @fontSize
        // 必须是 `var(--fontSize)` 映射形态（检查正则只认不带 fallback 的精确形态），
        // LLM 常写字面值（@fontSize: 14px）→ 每个组件 M5-6 失败。写盘即归一，不依赖模型。
        if (relativePath === 'resources/styles/themes/theme-vars.less') {
          const normalized = sanitizedContent
            .replace(
              /@fontSize\s*:\s*\d+(?:\.\d+)?px\s*;/g,
              '@fontSize: var(--fontSize);',
            )
            .replace(
              /@fontSize\s*:\s*var\(--fontSize\s*,\s*[^)]+\)\s*;/g,
              '@fontSize: var(--fontSize);',
            );
          if (normalized !== sanitizedContent) {
            sanitizedContent = normalized;
            if (logger) {
              logger.warn(
                `🧩 M5-6 归一: ${relativePath}（@fontSize 字面值/fallback → var(--fontSize) 精确映射）`,
              );
            }
          }
        }

        // 🛡️ M5-6 治本（2026-09-10）：业务 .less 顶层注入 theme-vars 变量声明。
        // 必须放在下方「E 步 healThemeMixinVarRefs」**之前**：注入后其 localDeclared
        // 命中 → 自动跳过 var() 替换 → 业务样式保留 `@fontSize`（mc-check v1.0.20
        // M5-6 要求「声明了就要用」），同时 LESS 不再报 variable undefined。
        // 编译产物 CSS 与「替换成 var(--x, var(--x))」完全等价，不改变运行时行为。
        // 仅作用于业务样式，themes/ 下的声明文件不处理。
        if (
          /^resources\/styles\/.+\.less$/.test(relativePath) &&
          !relativePath.includes('/themes/')
        ) {
          try {
            const rawTheme = String(
              files?.['resources/styles/themes/theme-vars.less'] || '',
            );
            if (rawTheme) {
              // 归一后再取变量值，确保注入的是 `@fontSize: var(--fontSize)` 精确映射
              const themeVarsSrc = rawTheme
                .replace(
                  /@fontSize\s*:\s*\d+(?:\.\d+)?px\s*;/g,
                  '@fontSize: var(--fontSize);',
                )
                .replace(
                  /@fontSize\s*:\s*var\(--fontSize\s*,\s*[^)]+\)\s*;/g,
                  '@fontSize: var(--fontSize);',
                );
              const injected = injectThemeVarDeclsForLess(
                sanitizedContent,
                themeVarsSrc,
              );
              if (injected !== sanitizedContent) {
                sanitizedContent = injected;
                if (logger) {
                  logger.warn(
                    `🧩 M5-6 治本: ${relativePath}（顶层注入 theme-vars 变量声明，保留 @变量 引用）`,
                  );
                }
              }
            }
          } catch (injectErr) {
            if (logger) {
              logger.warn(
                `🧩 M5-6 注入跳过: ${relativePath}（${injectErr?.message || injectErr}）`,
              );
            }
          }
        }

        // 🛡️ 确定性自愈（E 步）：theme-vars.less 的变量定义在 .common() 等 mixin 闭包内，
        // 顶层作用域不可见。LLM 常在 common.less 顶层直接引用 @fontSize（而 root 又用了
        // 正确的 var(--fontSize,14px)，同一文件一半对一半错）→ 顶层引用改写为 var() 形式。
        // 实锤 mc-max-1788176720155-9560d082：5 处 @fontSize → variable undefined → 标红。
        try {
          const themeVars = files?.['resources/styles/themes/theme-vars.less'];
          if (
            typeof themeVars === 'string' &&
            relativePath !== 'resources/styles/themes/theme-vars.less'
          ) {
            const healedRefs = healThemeMixinVarRefs(sanitizedContent, themeVars);
            if (healedRefs !== sanitizedContent) {
              if (logger) {
                logger.warn(
                  `🧩 theme 变量引用自愈: ${relativePath}（mixin 闭包变量 @x → var(--x, 默认值)）`,
                );
              }
              sanitizedContent = healedRefs;
            }
          }
        } catch (refErr) {
          if (logger) {
            logger.warn(`🧩 theme 变量引用自愈跳过: ${relativePath}（${refErr?.message || refErr}）`);
          }
        }

        // 🛡️ 2026-09-04 A2+B：主题变量化确定性自愈（独立 .less 同样需要——生产实锤
        // common.less:69/112 color:#ffffff 3 轮门禁未消，SFC 自愈不覆盖 .less）。
        try {
          const themeVarsForLess = files?.['resources/styles/themes/theme-vars.less'];
          if (
            typeof themeVarsForLess === 'string' &&
            relativePath !== 'resources/styles/themes/theme-vars.less'
          ) {
            // 🔴 2026-10-12 治本（真机实锤）：独立 .less 此前**只做反向**转换
            //   （槽位 hex → var()），缺了 SFC 侧那条**正向**的
            //   `var(--colorXxx[, fallback]) → @color-xxx`。
            //   ⇒ common.less 里的 10 处 `color: var(--colorPrimary, #a6ceff)`
            //     原样落盘 ⇒ L0-B THEME-VAR-NAME-MISMATCH 重试耗尽、
            //     组件禁止发布（真机 session mc-1791783220397-9f7bad18）。
            //   顺序与 SFC 侧完全一致（先 var→槽位，再做 hex/预设/大小写），
            //   保证两条链路的产物同形。
            const slotNames = collectThemeSlotNames(themeVarsForLess);
            const varToLess = healBusinessStyleVarsInCss(sanitizedContent, slotNames);
            const slotHealedLess = healSlotHexToVarRefs(varToLess, themeVarsForLess);
            const presetHealedLess = healPresetLiteralDecls(slotHealedLess, relativePath);
            const varCaseHealedLess = healVarNameCase(presetHealedLess);
            if (varCaseHealedLess !== sanitizedContent) {
              sanitizedContent = varCaseHealedLess;
              if (logger) {
                logger.warn(
                  `🧩 主题变量化自愈: ${relativePath}（var(--colorXxx) → @color-xxx 槽位 / 槽位 hex → var() 引用 / 预设字面量 → var 透传 / 变量名 camelCase 归一）`,
                );
              }
            }
          }
        } catch (themeHealLessErr) {
          if (logger) {
            logger.warn(`🧩 主题变量化自愈跳过: ${relativePath}（${themeHealLessErr?.message || themeHealLessErr}）`);
          }
        }

        // 🛡️ less 资源插值自愈（独立 .less 文件同样需要：common.less 里也可能有 url('@{bg1}')）
        try {
          const healedRes2 = healLessResourceVarInterpolation(
            sanitizedContent,
            relativePath,
            files,
          );
          if (healedRes2 !== sanitizedContent) {
            sanitizedContent = healedRes2;
            if (logger) {
              logger.warn(
                `🧩 less 资源插值自愈: ${relativePath}（@{x} → 静态相对路径）`,
              );
            }
          }
        } catch (resErr2) {
          if (logger) {
            logger.warn(`🧩 less 资源插值自愈跳过: ${relativePath}（${resErr2?.message || resErr2}）`);
          }
        }

        // 🛡️ 确定性自愈：根容器固定像素宽高 → 100%（占满 default-panel 的 .pannel-content）。
        // LLM 常把 Figma 设计框尺寸（_figma-size.json）写成 .c-<name>-root 的 width/height 固定像素，
        // 导致组件在面板内留白/错位。治本：写盘即强制 100%，不依赖模型重试。
        try {
          const rooted = healRootFixedSize(sanitizedContent, { sourceType: 'style' });
          if (rooted.changed) {
            if (logger) {
              logger.warn(
                `🧩 根容器尺寸自愈: ${relativePath}（width/height 固定像素 → 100%）`,
              );
            }
            sanitizedContent = rooted.source;
          }
        } catch (healErr) {
          if (logger) {
            logger.warn(`🧩 根容器尺寸自愈跳过: ${relativePath}（${healErr?.message || healErr}）`);
          }
        }
      }

      // 🛡️ 刀 43 / R24 落盘前终验（本文件顶部已说明为何必须挂在这里）。
      //   位置要求：在所有内容级自愈之后、`shouldSkipWrite` / `writeFileSync` 之前 ——
      //   这样「比对的内容」「写盘的内容」「门禁校验的内容」三者恒等。
      if (
        relativePath.endsWith('.vue') &&
        Array.isArray(_r24Mapping) &&
        _r24Mapping.length > 0
      ) {
        try {
          if (!_r24OwnerMap) _r24OwnerMap = buildComponentOwnerMap(files);
          const _r24Owner = ownerSectionIdForFile(_r24OwnerMap, relativePath);
          const _r24RelBase = /^package\/components\//.test(relativePath)
            ? '../../resources/images/'
            : '../resources/images/';
          const _r24 = healEmptyImgSrc(sanitizedContent, _r24Mapping, _r24RelBase, {
            ownerSectionId: _r24Owner,
          });
          if (_r24.changed) {
            sanitizedContent = _r24.code;
            currentStep = 'heal_img_src';
            if (logger) {
              logger.warn(
                `🛡️ R24 落盘前终验（写盘出口）: ${relativePath}（<img> 缺失/失效资源绑定已修）`,
                { ownerSectionId: _r24Owner || undefined, healed: _r24.healed },
              );
            }
          } else if (logger) {
            // 🔴 可观测性（2026-10-22 · mc-1792640936339-f6660c71 实锤）：
            //   未命中时原本**完全静默**，导致「离线能修 / 真机没修」无法归因。
            //   必须同时记录 ① code 里实际存在的 sectionId（判断锚点是否已注入）
            //   ② owner 兜底值（`no-section-id` 时唯一通道）③ mapping 条数。
            logger.debug(`R24 写盘出口未命中: ${relativePath}`, {
              ownerSectionId: _r24Owner || null,
              sectionIds: collectSectionIds(sanitizedContent),
              mappingCount: _r24Mapping.length,
              skipped: _r24.skipped,
            });
          }
        } catch (r24Err) {
          // fail-open：修不了也要写盘，绝不因自愈异常丢产物
          if (logger) {
            logger.warn(
              `🛡️ R24 写盘出口跳过: ${relativePath}（${r24Err?.message || r24Err}）`,
            );
          }
        }
      } else if (relativePath.endsWith('.vue') && !_r24NoMappingLogged && logger) {
        _r24NoMappingLogged = true;
        logger.warn('🛡️ R24/刀 45 整链跳过：resourceDomMapping 不可用', {
          file: relativePath,
          hasOption: Boolean(options?.resourceDomMapping),
          outputPath,
        });
      }

      // 🛡️ 刀 49（2026-10-22 · mc-1792643509867-db2d65f7 实锤）：**图标槽位尺寸契约**。
      //   位置：R24 之后（R24 可能刚补完 `:src` + import，本步才有对象可判）、
      //   所有覆写/回退步骤之后 —— 与 R24 同理，只有写盘出口能保证「门禁校验 === 落盘」。
      //   判据：资源 `<img>` 的内联必须同时满足 width=图片原始宽 / height=原始高 / flex 不拉伸；
      //   自愈只写元素级内联（inline 恒胜），**绝不改共享 class**。
      //   fail-open：非 import 变量 / 图片读不到 / `object-fit:cover`（有意裁剪铺满）⇒ 不判。
      if (relativePath.endsWith('.vue')) {
        try {
          const _icon = enforceIconSlotSize(sanitizedContent, {
            resolveAbs: (imgPath) => resolveImageAbsPath(outputPath, imgPath),
          });
          if (_icon.changed) {
            sanitizedContent = _icon.code;
            currentStep = 'heal_icon_slot_size';
            if (logger) {
              logger.warn(
                `🛡️ 刀 49 图标槽位尺寸契约（写盘出口）: ${relativePath}`,
                { healed: _icon.healed },
              );
            }
          } else if (logger && _icon.stats && _icon.stats.skippedUnresolved > 0) {
            // 可观测性：能解析到图标但图片不在磁盘 —— 否则「离线能修 / 真机没修」无法归因
            logger.debug(`刀 49 未命中: ${relativePath}`, _icon.stats);
          }
        } catch (iconErr) {
          // fail-open：修不了也要写盘
          if (logger) {
            logger.warn(
              `🛡️ 刀 49 写盘出口跳过: ${relativePath}（${iconErr?.message || iconErr}）`,
            );
          }
        }
      }

      // 🛡️ 刀 45（2026-10-22 · mc-1792639559460-61f0ebaf 实锤「战略合作厂商面板没有图标」）：
      //   R24 只在「模板已有 `<img>`」时有效；本步处理**连 `<img>` 都没有**的形态。
      //   位置（首子/末子）与尺寸全部取自 mapping 的 `figmaBox`/`parentBox` 真值，
      //   任一缺失 ⇒ 不判（插错比不插更糟）。排在 R24 之后：R24 补完 `:src` 后本步自然跳过。
      if (
        relativePath.endsWith('.vue') &&
        Array.isArray(_r24Mapping) &&
        _r24Mapping.length > 0
      ) {
        try {
          if (!_r24OwnerMap) _r24OwnerMap = buildComponentOwnerMap(files);
          const _miOwner = ownerSectionIdForFile(_r24OwnerMap, relativePath);
          const _miRelBase = /^package\/components\//.test(relativePath)
            ? '../../resources/images/'
            : '../resources/images/';
          const _mi = healMissingIconRender(sanitizedContent, _r24Mapping, _miRelBase, {
            ownerSectionId: _miOwner,
          });
          if (_mi.changed) {
            sanitizedContent = _mi.code;
            currentStep = 'heal_missing_icon';
            if (logger) {
              logger.warn(
                `🛡️ 刀 45 写盘出口: ${relativePath}（section 图标真值零渲染 ⇒ 已补 <img>）`,
                { ownerSectionId: _miOwner || undefined, healed: _mi.healed },
              );
            }
          }
        } catch (miErr) {
          if (logger) {
            logger.warn(
              `🛡️ 刀 45 写盘出口跳过: ${relativePath}（${miErr?.message || miErr}）`,
            );
          }
        }
      }

      // 🛡️ 刀 51（2026-10-22）：**段内标题行几何契约**。
      //   位置：R24 / 刀 45 之后 —— 那两步可能刚补出 `<img>`，本步才有「图标」可对齐；
      //   且必须在所有覆写/回退步骤之后（写盘出口是唯一能保证「校验 === 落盘」的地方）。
      //   判据：组件里恰 1 个 `<img>`，其绑定的资源变量能在 mapping 里反查到 figmaNodeId；
      //   该 icon 在 Figma 里同一父节点、同一行有且仅有 1 个 TEXT 且在其右侧
      //   ⇒ `gap = text.x − (icon.x + icon.w)`、行高 = max(icon.h, text.h)、icon 最左 ⇒ padding 0。
      //   只写元素级内联（inline 恒胜），**绝不改 class 规则**（`.c-db2d65-icon` 被 3 个元素共用）。
      if (relativePath.endsWith('.vue')) {
        try {
          if (!_r51Idx) {
            _r51Idx = indexFigmaNodes(
              options.figmaRoot?.document ?? options.figmaRoot ?? null,
            );
          }
          if (_r51Idx.size > 0) {
            const _hr = enforceHeaderRowGeometry(
              { [relativePath]: sanitizedContent },
              {
                figmaRoot: options.figmaRoot,
                resourceDomMapping: _r24Mapping,
                figmaIndex: _r51Idx,
              },
            );
            const _s51 = _hr.stats || {};
            _r51Stats.evaluated += Number(_s51.evaluated) || 0;
            _r51Stats.singleImg += Number(_s51.singleImg) || 0;
            _r51Stats.mapped += Number(_s51.mapped) || 0;
            _r51Stats.matched += Number(_s51.matched) || 0;
            if (_hr.changed) {
              _r51Stats.healed += (_hr.healed || []).length;
              sanitizedContent = _hr.files[relativePath];
              currentStep = 'heal_header_row_geometry';
              if (logger) {
                logger.warn(
                  `🛡️ 刀 51 段内标题行几何契约（写盘出口）: ${relativePath}`,
                  { healed: _hr.healed },
                );
              }
            }
          } else if (!_r51NoTreeLogged) {
            _r51NoTreeLogged = true;
            if (logger) {
              logger.warn(
                '🛡️ 刀 51 无 Figma 树（fail-open，标题行几何无法判定）——请检查 writeFiles 的 figmaRoot 透传',
                { figmaRootGiven: !!options.figmaRoot },
              );
            }
          }
        } catch (hrErr) {
          // fail-open：修不了也要写盘
          if (logger) {
            logger.debug(
              `🛡️ 刀 51 写盘出口跳过: ${relativePath}（${hrErr?.message || hrErr}）`,
            );
          }
        }
      }

      // 🛡️ 刀 52（2026-10-22）：**父容器垂直堆叠几何契约**。
      //   刀 50 只管「段内」（段 → 子项）；段**自身**的高度仍是 `flex:比例`（179/227/278 vs
      //   真值 161/212/265），而两张统计卡同 y 并列 ⇒ 刀 50 判 overlap 整段 fail-open。
      //   这里按 **DOM 直接子元素**算（行组包裹层 `data-rowpeers-wrap` 与普通段一视同仁），
      //   判据复用 `section-intrinsic-layout#resolveStackGeometry`（与刀 50 同一份实现）。
      //   只写元素级内联，绝不改 class（`.c-component-container` 被三段共用）。
      if (relativePath.endsWith('.vue')) {
        try {
          if (!_r51Idx) {
            _r51Idx = indexFigmaNodes(
              options.figmaRoot?.document ?? options.figmaRoot ?? null,
            );
          }
          if (_r51Idx.size > 0) {
            const _st = enforceStackGeometry(
              { [relativePath]: sanitizedContent },
              {
                figmaRoot: options.figmaRoot,
                figmaIndex: _r51Idx,
              },
            );
            const _s52 = _st.stats || {};
            _r52Stats.evaluated += Number(_s52.evaluated) || 0;
            _r52Stats.mapped += Number(_s52.mapped) || 0;
            _r52Stats.matched += Number(_s52.matched) || 0;
            if (_st.changed) {
              _r52Stats.healed += (_st.healed || []).length;
              sanitizedContent = _st.files[relativePath];
              currentStep = 'heal_section_stack_geometry';
              if (logger) {
                logger.warn(
                  `🛡️ 刀 52 父容器堆叠几何契约（写盘出口）: ${relativePath}`,
                  { healed: _st.healed },
                );
              }
            }
          }
        } catch (stErr) {
          // fail-open：修不了也要写盘
          if (logger) {
            logger.debug(
              `🛡️ 刀 52 写盘出口跳过: ${relativePath}（${stErr?.message || stErr}）`,
            );
          }
        }
      }

      const fullPath = join(outputPath, relativePath);
      const dir = dirname(fullPath);
      currentStep = 'ensuring_directory';
      // 确保目录存在
      if (!existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true });
        } catch (e) {
          if (logger) {
            logger.error('❌ 创建目录失败', {
              file: relativePath,
              step: 'mkdir',
              directory: dir,
              error: e.message,
              stack: e.stack,
              outputPath,
            });
          }
          skippedFiles.push(relativePath);
          continue;
        }
      }

      // 🛡️ C 方案：生成完成不覆盖用户在 Playground 编辑过的文件（保留用户版本）
      if (isUserPatched(outputPath, relativePath)) {
        if (logger) {
          logger.info('🛡️ C-保留用户编辑版本，跳过生成覆盖', {
            path: relativePath,
            outputPath,
          });
        }
        skippedFiles.push(relativePath);
        continue;
      }

      // 🛡️ 刀 53 命名空间隔离（round-13）：fg- 类规则只允许存在于接管文件自带的 style 块。
      //   common.less / index.css 里的 fg- 规则一律是编造或提升副本，编译后经预览注入
      //   （特异性 0,3,0）压过子组件 scoped 规则 ⇒ 整块剔除。接管文件随后被终裁覆写，
      //   故此处的剔除不会影响它们的确定性样式。
      if (/\.(less|css|vue)$/i.test(relativePath)) {
        try {
          const stripped = stripFgTakeoverRules(sanitizedContent);
          if (stripped.removed > 0) {
            sanitizedContent = stripped.text;
            logger.warn('🛡️ 刀 53 剔除编造的 fg- 类规则块', {
              path: relativePath,
              removed: stripped.removed,
            });
          }
        } catch (fgStripErr) {
          logger?.warn?.(`刀 53 规则剔除跳过（${relativePath}）: ${fgStripErr?.message || fgStripErr}`);
        }
      }

      // 🛡️ 刀 53 终裁覆写（2026-10-22 round-13 实锤）。
      //
      //   病灶：接管文件在 chunk 阶段已由 Figma 真值确定性渲染，但后续环节仍会改写它 ——
      //   第二轮生成时 LLM 从既有产物上下文看到 `c-{sem}-fg-{header|grid}-*` 类名，
      //   在 common.less 里为它编造规则（`height:100%;flex-direction:column;flex:1.548 1 0`），
      //   再被 style-class-consolidator 以「common.less 丰富版」回写进子组件 style 块；
      //   `font-size:16px` 同时被改写成 `calc(@fontSize * 1.1429)` ⇒ 真机实测 13.71px（真值 16px）。
      //   逐工具加豁免只能挡住已知的几个，挡不住「LLM 从上下文照抄 + 整合器回写」这条链。
      //
      //   治本：接管文件的内容**完全由 Figma 真值决定**，任何后置改写都是失真 ⇒
      //   在唯一写盘出口、且在所有内容级自愈之后、写盘/diff 之前，用确定性版本终裁覆写。
      const _fgFinal = options.fgTakeoverFiles;
      if (_fgFinal) {
        const isMap = typeof _fgFinal.get === 'function';
        const has = isMap
          ? _fgFinal.has(relativePath)
          : Object.prototype.hasOwnProperty.call(_fgFinal, relativePath);
        if (has) {
          const locked = isMap ? _fgFinal.get(relativePath) : _fgFinal[relativePath];
          if (typeof locked === 'string' && locked) {
            if (locked !== sanitizedContent) {
              logger.warn('🛡️ 刀 53 终裁覆写（后置改写被回滚为 Figma 真值渲染版）', {
                path: relativePath,
                before: sanitizedContent.length,
                after: locked.length,
              });
            }
            sanitizedContent = locked;
          }
        }
      }

      // 🛡️ P1-Slice1（增量补丁式更新）：写前 diff —— 内容未变化则跳过写盘。
      // 避免「每次生成都整包重写」：旧行为无条件 writeFileSync 会重置 mtime、
      // 抹掉「本轮真正变化了哪些文件」这一信息，使下游（候选快照 / 预览 / 断点续跑 /
      // 缺失文件清单）无法做增量判断。只在**字节级全等**时跳过；
      // 任何不确定情况（不存在 / 内容不同 / 读取异常）一律照常写入（保守优先，绝不丢产物）。
      const diff = shouldSkipWrite(fullPath, sanitizedContent);
      if (diff.skip) {
        // 🔒 R1 一致性：虽未写盘，仍需把自愈结果回写内存 ——
        // 磁盘上已是 sanitizedContent，若内存 files map 停留在本轮 content，
        // 二者会分叉（这正是 R1 修复的分叉点①）。
        if (sanitizedContent !== content) {
          files[relativePath] = sanitizedContent;
        }
        if (logger) {
          logger.debug('⏭️ 内容未变化，跳过写盘（增量补丁）', {
            path: relativePath,
            reason: diff.reason,
          });
        }
        continue;
      }

      // 写入文件
      currentStep = 'writing_file';
      try {
        writeFileSync(fullPath, sanitizedContent, 'utf-8');
      } catch (e) {
        if (logger) {
          logger.error('❌ 写入文件内容失败', {
            file: relativePath,
            step: 'writeFileSync',
            fullPath,
            contentSize: sanitizedContent.length,
            error: e.message,
            stack: e.stack,
            outputPath,
          });
        }
        skippedFiles.push(relativePath);
        continue;
      }
      writtenFiles.push(relativePath);

      // 🔒 R1（2026-09-01）：自愈结果回写内存 files map（单一事实源）。
      // 此前 sanitizedContent 只写磁盘不回写内存 → 候选快照/后续校验读到的仍是
      // 修复前内容，与 workspace 磁盘分叉（分叉点①）。写盘成功才回写；
      // 用户编辑保护（isUserPatched）与写失败的 continue 分支不会走到这里。
      if (sanitizedContent !== content) {
        files[relativePath] = sanitizedContent;
      }

      if (logger) {
        logger.debug('✅ 文件已写入', {
          path: relativePath,
          size: sanitizedContent.length,
          sanitized: sanitizedContent.length !== content.length,
        });
      }
    }

    // 🛡️ 跨文件缺失变量全局兜底（2026-09-10 治本）：单文件写盘门禁是「逐文件 retry.valid 门禁」，
    // 若某 .vue/.less 除缺失变量外还带其他错误（CODE-003 前缀缺失 / 注释未闭合等），retry.valid 为
    // false → 走「跳过」分支 → 该文件缺失变量永不补 → 最终 index.less→index.css 编译失败降级 + LESS-COMPILE-001。
    // 且 .less 文件本身从不被 P0-1（只遍历 .vue）或单文件门禁覆盖 → common.less 内 @color-tab-* 永远 undefined。
    // 治本：落盘后扫一遍所有 .less + .vue 的 @var 引用，凡 theme-vars 未声明、非资源、非已声明 mixin 的，
    // 统一注入 theme-vars.less（单一事实源），不依赖单文件 retry.valid。复用 P0-1 的 resMap 判据，避免误伤资源/主题变量。
    try {
      const resMap = {};
      const resourceDomMapping = options.resourceDomMapping || [];
      for (const m of resourceDomMapping) {
        if (m && m.assignedVarName && m.resourceFile) {
          resMap[m.assignedVarName] = String(m.resourceFile).split('/').pop();
        }
      }
      const tvPath = 'resources/styles/themes/theme-vars.less';
      const tvContentNow =
        (files && typeof files[tvPath] === 'string'
          ? files[tvPath]
          : '') + pendingThemeVars;
      const declaredSet = new Set();
      for (const mm of tvContentNow.matchAll(/@([a-zA-Z][\w-]*)\s*[:]/g))
        declaredSet.add(mm[1]);
      const globalMissing = new Map();
      for (const [p, c] of Object.entries(files || {})) {
        if (typeof c !== 'string') continue;
        if (!p.endsWith('.less') && !p.endsWith('.vue')) continue;
        const styleBlocks = (
          p.endsWith('.vue')
            ? c.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []
            : [c]
        ).join('\n');
        for (const v of extractLessVarReferences(styleBlocks)) {
          if (resMap[v]) continue; // 资源变量，跳过
          if (declaredSet.has(v)) continue; // 已在 theme-vars 声明，跳过
          if (isLessVarDeclared(styleBlocks, v)) continue; // 本文件已声明（局部），跳过
          // 记录「首次出现该变量的文件」+ 其样式文本 —— 后者供 safeLessVarValue 判定
          // 该变量是否被 LESS 颜色函数消费（刀 16b：兜底值必须可求值）。
          if (!globalMissing.has(v))
            globalMissing.set(v, { path: p, styleText: styleBlocks });
        }
      }
      if (globalMissing.size > 0) {
        const decl = [...globalMissing.entries()]
          .map(
            ([v, info]) =>
              `@${v}: ${safeLessVarValue('@' + v, { styleText: info?.styleText, truthPalette: options?.truthPalette })};`,
          )
          .join('\n');
        pendingThemeVars += `${decl}\n`;
        if (logger) {
          logger.warn('🛡️ 跨文件缺失 less 变量全局兜底（注入 theme-vars）', {
            count: globalMissing.size,
            vars: [...globalMissing.keys()],
          });
        }
      }
    } catch (gErr) {
      if (logger) {
        logger.warn('跨文件缺失变量全局兜底跳过（非致命）', {
          error: gErr?.message || gErr,
        });
      }
    }

    // 🛡️ 落盘后回写 theme-vars.less：把门禁自动补全的缺失变量落盘
    if (pendingThemeVars) {
      try {
        const tvPath = 'resources/styles/themes/theme-vars.less';
        const full = join(outputPath, tvPath);
        const existing = existsSync(full)
          ? readFileSync(full, 'utf-8')
          : files[tvPath] || '';
        const tvContent = `${existing}\n// 写盘门禁自动补全缺失变量\n${pendingThemeVars}`;
        writeFileSync(full, tvContent, 'utf-8');
        // 🔒 R1（2026-09-01）：同步回写内存 files map（单一事实源，与磁盘同内容）
        if (files && typeof files === 'object') files[tvPath] = tvContent;
        writtenFiles.push(tvPath);
        if (logger) {
          logger.info(' 已回写缺失 less 变量到 theme-vars.less', {
            path: tvPath,
            varsSize: pendingThemeVars.length,
          });
        }
      } catch (e2) {
        if (logger) {
          logger.warn('回写 theme-vars.less 失败（非致命）', {
            error: e2.message,
            stack: e2.stack,
          });
        }
      }
    }

    if (logger) {
      // 🛡️ 刀 51 汇总（每轮一条）：让「零命中」也是一个**可判读的事实**，而不是沉默。
      if (_r51Stats.evaluated > 0) {
        logger.info('🛡️ 刀 51 段内标题行几何·已评估', _r51Stats);
      }
      if (_r52Stats.evaluated > 0) {
        logger.info('🛡️ 刀 52 父容器堆叠几何·已评估', _r52Stats);
      }
      // 🛡️ 刀 41 汇总：`contracts/mismatches` 都必须留痕 —— 否则「策略段没被管」
      //   与「策略段已正确」在日志里长得一模一样（这正是上一轮白跑的原因）。
      if (_r41Stats.sections > 0) {
        logger.info('🛡️ 刀 41 折叠网格几何·已评估', _r41Stats);
      }
      logger.info('✅ 文件写入完成', {
        written: writtenFiles.length,
        skipped: skippedFiles.length,
        skippedPaths: skippedFiles.length > 0 ? skippedFiles.slice(0, 5) : [],
      });
    }
    return { written: writtenFiles, skipped: skippedFiles };
  } catch (error) {
    if (logger) {
      logger.error('文件写入失败', {
        error: error.message,
        stack: error.stack,
        file: currentFile,
        step: currentStep,
        outputPath,
        writtenCount: writtenFiles.length,
        skippedCount: skippedFiles.length,
        totalFiles: Object.keys(files).length,
      });
    }
    throw error;
  }
}

/**
 * 补齐 Vue 模板中对象字面量的裸 key 引号
 * （从 microcode-engineer.js 的 normalizeObjectStringKeysInVue 导入，此处重导出以便 file-writer 自包含）
 */
// 注意：normalizeObjectStringKeysInVue 已在 microcode-engineer.js 中定义，
// 未来可提取到 utils/ 下；此处暂用 inline 实现避免循环依赖
function normalizeObjectStringKeysInVue(vueContent) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent;
  // 匹配 :class / :style 绑定中的对象字面量
  return vueContent.replace(
    /(:\s*(?:class|style)\s*=\s*["'])(\{[^}]*\})(["'])/g,
    (m, prefix, obj, suffix) => {
      const fixed = obj.replace(
        /([{,])\s*([A-Za-z_$][\w$]*(?:-[\w$]+)+)\s*:/g,
        (m2, open, key) => `${open} '${key}':`,
      );
      return prefix + fixed + suffix;
    },
  );
}

// ══════════════════════════════════════════════════════════════
// 一体化平台文件生成（mc-only，确定性产物，不依赖 LLM）
// 规范来源：微码组件开发规范和健康度检查报告说明 v1.0.19-1
// 覆盖 M2-3 / M4-1 / M4-2 / M4-3 / M4-4 / M4-4b / M6-2b / M6-2c / M6-2d
// ══════════════════════════════════════════════════════════════

// dark 枚举与预设变量事实源已迁移至 utils/style-tokens.js（2026-09-03，契约统一事实源），
// 此处 re-export 保持 mc-health-validator.js 等既有 import 兼容；
// 本地 import 供 buildCssVarsFile 使用（export...from 不带入本地作用域）。
export {
  MC_DARK_THEME_COLOR_ENUM,
  MC_DARK_THEME_COLOR_ENUM_CORE,
  MC_FRAMEWORK_PRESET_VARS,
} from '../../utils/style-tokens.js';
import { MC_DARK_THEME_COLOR_ENUM, MC_DARK_THEME_COLOR_ENUM_CORE } from '../../utils/style-tokens.js';

/**
 * M4-10 受约束的三核心 key（**从 MC_DARK_THEME_COLOR_ENUM_CORE 派生，不重复维护**）。
 * 🔴 2026-10-12 A8-2：这 3 个键在 `dark` 里必须落枚举值；其余槽位可写设计稿真值。
 */
const MC_DARK_THEME_COLOR_ENUM_CORE_KEYS = Object.keys(MC_DARK_THEME_COLOR_ENUM_CORE);

// 🔴 2026-10-12：通用语义色提升为**模块级常量并导出**（原为 buildCssVarsFile 内局部变量）。
//
// 为什么必须导出：mc-check M3-8（`mc-check.cjs:437-451`）要求 css-vars.js 里的**每个**
// 非框架预设变量都在 declare.json 的 `cssVariableConfig` 声明；而写 declare.json 的
// `normalizeDeclareJson` 拿不到函数内局部变量 ⇒ 漏声明 ⇒ M3-8 判死
//（实测：产物 `cssVariableConfig` 只有 3 条 designVars，缺 5 个语义色）。
// 导出后由调用方复用**同一份事实源**（避免「两处维护、必然漂移」——本仓既有教训）。
export const SEMANTIC_COLORS_DARK = {
  colorTextSecondary: MC_DARK_THEME_COLOR_ENUM.colorTextSecondary,
  colorDanger: MC_DARK_THEME_COLOR_ENUM.colorDanger,
  colorWarning: MC_DARK_THEME_COLOR_ENUM.colorWarning,
  colorSuccess: MC_DARK_THEME_COLOR_ENUM.colorSuccess,
  colorBorder: MC_DARK_THEME_COLOR_ENUM.colorBorder,
};
export const SEMANTIC_COLORS_LIGHT = {
  colorTextSecondary: '#666666',
  colorDanger: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBorder: '#e8e8e8',
};

/** 语义色键名（去重）—— 供 declare.json 的 `cssVariableConfig` 声明复用（M3-8）。 */
export function getSemanticCssVarKeys() {
  return [...new Set([...Object.keys(SEMANTIC_COLORS_DARK), ...Object.keys(SEMANTIC_COLORS_LIGHT)])];
}

/**
 * M2-3/M4-4/M6-2b/M6-2c：生成 resources/config/css-vars.js（确定性模板）。
 * 导出 common + 主题对象（dark/light）；字体变量走 $mcCssBuilder.getCssSize()（M4-4b）。
 * ⚠️ dark 默认只含 3 个核心变量（M4-9 最低要求）+ 设计变量轨（options.styleTokens.darkWithDesign，
 *    原 UI 深色时含 Figma 深色真值自定义变量，2026-09-03 契约双轨制）；可选变量（colorTextSecondary 等）
 *    通过 options.extraDarkVars 按需注入——注入即可选变量必须同步进 cssVariableConfig，
 *    否则 M3-4c（自定义变量声明）会判失败。
 * @param {Object} [options]
 * @param {string} [options.fontSize] 字体基准（px 数值字符串）。**缺省时输出 `getCssSize()`（无参）**，
 *   由框架 `defaultCssVars.baseFontSize`（= 14，`frontend/src/config/theme-config.js`）决定——
 *   这是规范文档的写法（`references/patterns/css-variable-pattern.md`），且与 theme-vars.less 的
 *   `@font-size-base: 14px` 同源。⚠️ 不要在此写魔法数（历史遗留 `'12'` 使全组件字号系统性 0.857×）。
 * @param {boolean} [options.includeLight] 是否生成 light 主题对象（默认 true）
 * @param {Object} [options.extraDarkVars] 额外 dark 变量（键值对，值须符合枚举）
 * @param {Object} [options.styleTokens] styleTokens 契约（utils/style-tokens.js buildStyleTokens 产出）：
 *   light → light 槽位（Figma 提取或派生算法）；darkWithDesign → dark 槽位（枚举三核心+设计变量轨）
 * @returns {string} css-vars.js 完整内容
 */
export function buildCssVarsFile(options = {}) {
  // 🛡️ 2026-09-28（c-device-monitor-aa799337 实锤 · 删硬编码）：**不再有 `|| '12'` 魔法数**。
  //   原 `'12'` 使 463/463 组件的 `--fontSize` 都算成 `12/16rem`，而设计基准是 **14**
  //   （`@font-size-base: 14px` 命中 421/422 组件；prompt-builder 也要求 `@fontSize: 14px`）
  //   → 全组件基于 `@fontSize` 的字号/间距**系统性偏小 0.857×**。
  //   缺省留空 → 模板渲染 `$mcCssBuilder.getCssSize()`（无参）→ 框架 baseFontSize(14)，
  //   与 `@font-size-base` 同源、且是规范文档写法（M4-7 正则 `getCssSize\(\s*\d*\s*\)` 允许无参）。
  const fontSize = options.fontSize ? String(options.fontSize) : '';
  const includeLight = options.includeLight !== false;
  const extraDark = options.extraDarkVars && typeof options.extraDarkVars === 'object' ? options.extraDarkVars : {};
  const tokens = options.styleTokens && typeof options.styleTokens === 'object' ? options.styleTokens : null;
  // 🛡️ 治本 E1（2026-09-13）：通用语义色兜底——danger/warning/success/border/secondary 是
  // 跨组件一致的通用语义色（非 Figma 提取），故固定注入，让组件 var(--colorDanger) 等引用
  // 真正命中宿主注入的 CSS 变量（此前契约只含 primary/textBase，语义色缺失 → 引用 fallback 兜底、主题不响应）。
  //
  // 🔴 2026-10-12：改用**模块级**常量（见文件上方 SEMANTIC_COLORS_* 与 getSemanticCssVarKeys）。
  //   原因：mc-check M3-8 要求 css-vars.js 的每个非框架变量都在 declare.json 的
  //   `cssVariableConfig` 声明，而调用方（normalizeDeclareJson）**拿不到函数内局部变量**
  //   ⇒ 漏声明 ⇒ M3-8 判死（实测产物 cssVariableConfig 只有 3 条 designVars）。
  //   提升为模块级并导出后，调用方复用同一份事实源，杜绝两处维护。
  //   （下方 :1357 / :1371 直接引用同名的模块级常量，无需局部别名。）
  const _semanticKeys = getSemanticCssVarKeys();
  // dark 槽位：契约 darkWithDesign（= 枚举三核心 + 设计变量轨）或回退纯枚举三核心；再叠加语义色 + 额外注入
  //
  // 🔴🔴 2026-10-12 A8-2：`dark` 的**三核心必须是 M4-10 硬枚举值**，不得写设计稿真值。
  //
  //   mc-check M4-10（mc-check.cjs:794-820）把 `dark` 的 colorTextBase/colorPrimary/
  //   colorPrimaryBg 锁死在 5 个色值上（`#44E4FF` / `#414141,#454545,#474747` / `#ffffff,#F0F0F0`），
  //   而它是**纯文件字符串判定、无任务上下文** ⇒ 任何「按设计稿取真值」的策略都会翻车。
  //   实锤：产物 c-aiot-dpjh-bsjd-80092f38 的 `const dark` 写的是真值
  //   （colorPrimary '#071f3d'、colorTextBase '#98c2f6'）⇒ M4-10 必判error。
  //
  //   官方新版 c-mc-demo 的做法完全一致：把 demo 原本的 `#333`→`#44E4FF`、
  //   `#090b22`→`#414141`（即**让 demo 迁就枚举**）。
  //
  //   **用户深色稿的真值怎么办**：按用户决策，`dark` 是过检占位，真实深色色值
  //   落在用户自定义 key 上（theme_2 / 黄昏模式 等），那些 key 不在 M4-10 的
  //   三个核心名里 ⇒ 不受枚举约束（实测 `通过:35 失败:0`）。
  const darkCoreFromTruth = tokens?.darkWithDesign || {};
  const dark = {
    // 三核心：强制枚举值（覆盖 darkWithDesign 里可能存在的真值）
    ...MC_DARK_THEME_COLOR_ENUM_CORE,
    // 设计变量轨的非核心槽位仍取真值（colorBgContainer/colorBorder/语义色等不受 M4-10 约束）
    ...Object.fromEntries(
      Object.entries(darkCoreFromTruth).filter(
        ([k]) => !MC_DARK_THEME_COLOR_ENUM_CORE_KEYS.includes(k),
      ),
    ),
    ...SEMANTIC_COLORS_DARK,
    ...extraDark,
  };
  // light 槽位：契约值（Figma 提取/派生算法）或回退通用浅色模板；再叠加语义色
  const light = includeLight
    ? {
        ...(tokens?.light || {
          colorTextBase: '#333333',
          colorPrimary: '#2f6bff',
          colorPrimaryBg: '#e8f0ff',
          colorPrimaryHover: '#5c8aff',
          colorPrimaryActive: '#1f4fd0',
          colorPrimaryBgHover: 'rgba(47, 107, 255, 0.12)',
        }),
        ...SEMANTIC_COLORS_LIGHT,
      }
    : null;
  // 🛡️ 2026-09-26 治本 0.6：`common`（默认槽位）必须以**设计主题**为准，与 theme-vars.less 同源。
  //   此前硬编码 DARK 枚举 → 浅色设计下输出 `common.colorTextBase:'#ffffff'`（白字）、
  //   `colorPrimary:'#44E4FF'`（深色主色），与 theme-vars 的设计真值打架（矛盾 #5）。
  const commonSlots = tokens?.defaultTheme === 'light' && light ? light : dark;
  const darkBody = buildCssVarsObjectBody(dark);
  const lightBody = light ? buildCssVarsObjectBody(light) : null;

  // 🆕🆕 2026-10-12 N 主题：导出**全部** themeSlots 键（自定义 key，如「黄昏模式」）。
  //
  //   为什么必须：前端预览页 `applyPreviewCssVars` 按 `cssVars[themeKey]` 查表注入
  //   CSS 变量。若只导出 light/dark，切到第 3+ 个主题时查表得到 undefined
  //   ⇒ **class 变了但 CSS 变量没变**，看起来「切了没反应」。
  //
  //   键名安全：themeSlots 的 key 已过 slugifyThemeName（剔除空格/特殊符号，中文保留），
  //   故 `const 浅色 = {...}` / `export { 浅色 }` 均为合法 JS。
  //   ⚠️ 单稿/旧双主题（无 themeSlots 或键名为 light/dark）⇒ 完全不追加，输出逐字节一致。
  const _themeSlots = tokens?.themeSlots;
  const _extraThemeKeys = [];
  const _extraThemeBodies = [];
  if (_themeSlots && typeof _themeSlots === 'object') {
    // 🔴🔴 2026-10-12 治本 B 延伸（真机实锤：切到 theme_2 先深色后变浅）：
    //   `light` / `dark` 各自叠加了 `SEMANTIC_COLORS_LIGHT/DARK`（:1406 / :1392），
    //   但**自定义主题（themeSlots 的键）只写裸 slots** ⇒ 缺语义色。
    //   而 iframe 的 `applyPreviewCssVars` 用 `{...cssVars.common, ...cssVars[theme]}`
    //   ⇒ theme_2 查不到语义色 ⇒ **回落到 common 的浅色值**（`colorTextSecondary:'#666666'`）
    //   ⇒ 运行期把编译期的深色值**覆盖回浅色** ⇒ 「先变深、几秒后变浅」。
    //
    //   正解：按该主题的明暗（`themeMeta[].brightness`）叠加对应语义色，与 light/dark 同口径。
    const _themeMetaByKey = new Map(
      (Array.isArray(tokens?.themeMeta) ? tokens.themeMeta : []).map((t) => [t.key, t]),
    );
    for (const [k, slots] of Object.entries(_themeSlots)) {
      // light/dark 已单独输出（body 里用的是兼容字段），跳过避免重复声明
      if (k === 'light' || k === 'dark') continue;
      // 🔴 明暗判据：优先 themeMeta 的 brightness；缺省回退 key 名
      const meta = _themeMetaByKey.get(k);
      const isDark =
        meta?.brightness === 'dark' ??
        (meta?.brightness === 'light' ? false : /dark|深色|夜|night/i.test(k));
      const body = buildCssVarsObjectBody({
        ...(slots || {}),
        ...(isDark ? SEMANTIC_COLORS_DARK : SEMANTIC_COLORS_LIGHT),
      });
      if (!body) continue;
      _extraThemeKeys.push(k);
      _extraThemeBodies.push(`const ${k} = {\n${body}\n};\n`);
    }
  }
  const exportNames = `common, dark${light ? ', light' : ''}${
    _extraThemeKeys.length ? `, ${_extraThemeKeys.join(', ')}` : ''
  }`;
  // 🛡️ 双真值标记（D8 · 2026-10-10）：双真值模式下三核心取 Figma 设计真值，
  //   必然不在规范枚举白名单内（M4-10）。mc-check 是**纯文件判定**、无任务上下文，
  //   无法按模式分叉 ⇒ 在产物内写确定性标记，判据据此对三核心豁免枚举比对。
  //   ⚠️ 必须由本函数（确定性生成器）写入，**不接受 LLM 写入** —— css-vars.js 整体由
  //   buildCssVarsFile 覆盖生成，LLM 不参与，故标记不可被臆造。
  //   单稿路径不写此行 ⇒ 铁律 1 与 M4-10 原样生效（零回归）。
  const dualTruthMarker = tokens?.dualTruth?.enabled
    ? `// dualTruth: figma-derived（双真值：两侧色值均为 Figma 设计真值；M4-10 三核心按 D8 豁免枚举）\n`
    : '';
  // ⚠️ common 色值必须引用完整枚举 MC_DARK_THEME_COLOR_ENUM（含 Hover/Active/BgHover）——
  //    此前引用 dark 对象（仅 3 核心变量）会输出 'undefined'（既有 bug，2026-09-03 顺带修复）。
  return `${dualTruthMarker}// 组件 CSS 变量默认值（系统生成，勿手改）
// 规范：M4-4 导出 common + 每个主题对象；M4-4b 字体变量使用 $mcCssBuilder.getCssSize()
// 导出形态：命名导出（declare.js import cssVars 用）+ default 导出（mc-check M4-8 正则
//   /export\\s+default\\s*\\{[\\s\\S]*dark[\\s\\S]*\\}/ 只认 default 导出对象，2026-09-03 实锤）
const common = {
  fontSize: $mcCssBuilder.getCssSize(${fontSize}),
  fontWeightStrong: 600,
${buildCssVarsObjectBody(commonSlots)}
};

const dark = {
${darkBody}
};

${lightBody ? `const light = {\n${lightBody}\n};\n` : ''}
${_extraThemeBodies.join('\n')}${_extraThemeBodies.length ? '\n' : ''}export { ${exportNames} };
export default { ${exportNames} };
`;
}

/** 把主题色值对象格式化为 JS 对象体（两空格缩进，字符串值） */
function buildCssVarsObjectBody(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `  ${k}: '${v}',`)
    .join('\n');
}

/**
 * M4-1/M4-2：生成 declare.js（声明构建脚本，$createMcDeclare + 传入 cssVars）。
 * ⚠️ 格式与管线既有运行时一致：`$createMcDeclare` 由构建环境全局注入（不 import 包），
 *    配置走 `import declareConfig from './declare.json'`（declare.json 的 themeConfig/
 *    businessEvents/cssVariableConfig 靠它生效）；M4-2 要求传入 cssVars → 同步 import
 *    resources/config/css-vars.js 的三个主题对象并传入。
 *    不再接收 componentId 参数（componentId 由 declareConfig 携带）——此前调用处引用
 *    未定义变量 componentId → ReferenceError 被非阻断 catch 吞掉，全天 21 次生成全部
 *    静默失败（2026-09-03 实锤），css-vars.js 从未落盘。
 * @param {Object} [options] 保留参数位（兼容旧调用签名），当前无需任何字段
 * @returns {string} declare.js 完整内容
 */
export function buildDeclareJsFile(options = {}) {
  return `import declareConfig from './declare.json'
import { common, dark, light } from './resources/config/css-vars.js'
// 设置微码组件信息（cssVars 为 M4-2 必传项）
let declareInfo = $createMcDeclare({
  metaUrl: import.meta.url,
  declareConfig,
  cssVars: { common, dark, light }
})
// 导出组件配置信息
export default declareInfo
`;
}

/**
 * M4-3：生成 component.js（组件导出入口，导出 ./package/index.vue）。
 * @returns {string} component.js 完整内容
 */
export function buildComponentJsFile() {
  return `// 组件导出（系统生成，勿手改）
import component from './package/index.vue';

export default component;
`;
}

/**
 * 一体化平台文件完整集（M2-3/M4-1/M4-2/M4-3 一键生成）。
 * @param {Object} [options] 同 buildCssVarsFile/buildDeclareJsFile
 * @returns {Object<string,string>} path → content
 */
export function buildMcPlatformFiles(options = {}) {
  return {
    'resources/config/css-vars.js': buildCssVarsFile(options),
    'declare.js': buildDeclareJsFile(options),
    'component.js': buildComponentJsFile(),
  };
}

