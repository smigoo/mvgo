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
import { repairScopedThirdPartySelectors, ensureFlexDirectionInVueSfc, ensureFlexDirection } from '../../utils/css-sanitizer.js';
import { fixSpuriousLineBreaks, injectMissingTabUi, healVueEmbeddedStyleBraces, healThemeMixinVarRefs, healThemeMixinVarRefsInVue, healLessResourceVarInterpolation, healPresetLiteralDecls, healSlotHexToVarRefs, healVarNameCase, applyHealToVueStyleBlocks, injectThemeVarDeclsForLess } from './code-healer.js';
import { healLessSource, healRootFixedSize } from '../../validators/less-compile-gate.js';
import { safeLogger } from '../../logger/safe-logger.js';

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
 * 按变量名推测安全的 less 变量默认值
 * @param {string} name 变量名（含 @ 前缀）
 * @returns {string}
 */
export function safeLessVarValue(name = '') {
  const n = String(name).replace(/^@/, '').toLowerCase();
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
  if (/border/.test(n)) return '#e8e8e8';
  if (/(bg|background)/.test(n)) return '#ffffff';
  if (/(primary|accent)/.test(n)) return '#409EFF';
  if (/(success|ok)/.test(n)) return '#52c41a';
  if (/(warning|warn)/.test(n)) return '#faad14';
  if (/(error|danger|fail)/.test(n)) return '#f5222d';
  if (/(text|color|colour|font|fg|ink)/.test(n)) return '#333333';
  // 兜底：CSS 全局关键字，对几乎所有属性合法，保证编译通过（渲染为中性默认）
  return 'unset';
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

export function writeFiles(files, outputPath, options = {}) {
  // 🔒 入口归一化（见 logger.js safeLogger）：本函数体内有 18 处裸 logger.* 调用，
  // 其中 3 处在 catch 块内。logger 未传时降级为 no-op，避免 TypeError 掩盖真实写盘错误。
  const logger = safeLogger(options.logger);

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

  try {
    let pendingThemeVars = '';
    for (const [relativePath, content] of Object.entries(files)) {
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
            const themedVue = applyHealToVueStyleBlocks(sanitizedContent, (css) => {
              const slotHealed = healSlotHexToVarRefs(css, themeVarsForVue);
              const presetHealed = healPresetLiteralDecls(slotHealed, relativePath);
              return healVarNameCase(presetHealed);
            });
            if (themedVue !== sanitizedContent) {
              sanitizedContent = themedVue;
              if (logger) {
                logger.warn(
                  `🧩 主题变量化自愈: ${relativePath}（槽位 hex → var() 引用 / 预设字面量 → var 透传）`,
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
        const lessGlobalVars = extractLessGlobalVars(files);
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
                  .map((v) => `@${v}: ${safeLessVarValue('@' + v)};`)
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
                pendingThemeVars += `${missing.map((v) => `@${v}: ${safeLessVarValue('@' + v)};`).join('\n')}\n`;
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

        // 🛡️ 确定性自愈：补全 LLM 漏写的右大括号 / 未闭合块注释。
        // 写盘即修复，避免把必然编译失败的 LESS 送到下游门禁（历史上表现为
        // LESS-COMPILE-001 ×N → L0-B BLOCK → 重试耗尽 → 任务失败且预览不可用）。
        try {
          const healed = healLessSource(sanitizedContent, { sourceType: 'style' });
          if (healed.changed) {
            if (logger) {
              logger.warn(
                `🧩 LESS 写盘自愈: ${relativePath}（补全 ${healed.addedBraces || 0} 个右大括号/块注释）`,
              );
            }
            sanitizedContent = healed.source;
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
            const slotHealedLess = healSlotHexToVarRefs(sanitizedContent, themeVarsForLess);
            const presetHealedLess = healPresetLiteralDecls(slotHealedLess, relativePath);
            const varCaseHealedLess = healVarNameCase(presetHealedLess);
            if (varCaseHealedLess !== sanitizedContent) {
              sanitizedContent = varCaseHealedLess;
              if (logger) {
                logger.warn(
                  `🧩 主题变量化自愈: ${relativePath}（槽位 hex → var() 引用 / 预设字面量 → var 透传 / 变量名 camelCase 归一）`,
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
          if (!globalMissing.has(v)) globalMissing.set(v, p);
        }
      }
      if (globalMissing.size > 0) {
        const decl = [...globalMissing.keys()]
          .map((v) => `@${v}: ${safeLessVarValue('@' + v)};`)
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
 * M2-3/M4-4/M6-2b/M6-2c：生成 resources/config/css-vars.js（确定性模板）。
 * 导出 common + 主题对象（dark/light）；字体变量走 $mcCssBuilder.getCssSize()（M4-4b）。
 * ⚠️ dark 默认只含 3 个核心变量（M4-9 最低要求）+ 设计变量轨（options.styleTokens.darkWithDesign，
 *    原 UI 深色时含 Figma 深色真值自定义变量，2026-09-03 契约双轨制）；可选变量（colorTextSecondary 等）
 *    通过 options.extraDarkVars 按需注入——注入即可选变量必须同步进 cssVariableConfig，
 *    否则 M3-4c（自定义变量声明）会判失败。
 * @param {Object} [options]
 * @param {string} [options.fontSize] 字体基准（px 数值字符串，默认 12）
 * @param {boolean} [options.includeLight] 是否生成 light 主题对象（默认 true）
 * @param {Object} [options.extraDarkVars] 额外 dark 变量（键值对，值须符合枚举）
 * @param {Object} [options.styleTokens] styleTokens 契约（utils/style-tokens.js buildStyleTokens 产出）：
 *   light → light 槽位（Figma 提取或派生算法）；darkWithDesign → dark 槽位（枚举三核心+设计变量轨）
 * @returns {string} css-vars.js 完整内容
 */
export function buildCssVarsFile(options = {}) {
  const fontSize = options.fontSize || '12';
  const includeLight = options.includeLight !== false;
  const extraDark = options.extraDarkVars && typeof options.extraDarkVars === 'object' ? options.extraDarkVars : {};
  const tokens = options.styleTokens && typeof options.styleTokens === 'object' ? options.styleTokens : null;
  // 🛡️ 治本 E1（2026-09-13）：通用语义色兜底——danger/warning/success/border/secondary 是
  // 跨组件一致的通用语义色（非 Figma 提取），故固定注入，让组件 var(--colorDanger) 等引用
  // 真正命中宿主注入的 CSS 变量（此前契约只含 primary/textBase，语义色缺失 → 引用 fallback 兜底、主题不响应）。
  const SEMANTIC_COLORS_DARK = {
    colorTextSecondary: MC_DARK_THEME_COLOR_ENUM.colorTextSecondary,
    colorDanger: MC_DARK_THEME_COLOR_ENUM.colorDanger,
    colorWarning: MC_DARK_THEME_COLOR_ENUM.colorWarning,
    colorSuccess: MC_DARK_THEME_COLOR_ENUM.colorSuccess,
    colorBorder: MC_DARK_THEME_COLOR_ENUM.colorBorder,
  };
  const SEMANTIC_COLORS_LIGHT = {
    colorTextSecondary: '#666666',
    colorDanger: '#f5222d',
    colorWarning: '#faad14',
    colorSuccess: '#52c41a',
    colorBorder: '#e8e8e8',
  };
  // dark 槽位：契约 darkWithDesign（= 枚举三核心 + 设计变量轨）或回退纯枚举三核心；再叠加语义色 + 额外注入
  const dark = { ...(tokens?.darkWithDesign || MC_DARK_THEME_COLOR_ENUM_CORE), ...SEMANTIC_COLORS_DARK, ...extraDark };
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
  const darkBody = buildCssVarsObjectBody(dark);
  const lightBody = light ? buildCssVarsObjectBody(light) : null;
  const exportNames = `common, dark${light ? ', light' : ''}`;
  // ⚠️ common 色值必须引用完整枚举 MC_DARK_THEME_COLOR_ENUM（含 Hover/Active/BgHover）——
  //    此前引用 dark 对象（仅 3 核心变量）会输出 'undefined'（既有 bug，2026-09-03 顺带修复）。
  return `// 组件 CSS 变量默认值（系统生成，勿手改）
// 规范：M4-4 导出 common + 每个主题对象；M4-4b 字体变量使用 $mcCssBuilder.getCssSize()
// 导出形态：命名导出（declare.js import cssVars 用）+ default 导出（mc-check M4-8 正则
//   /export\\s+default\\s*\\{[\\s\\S]*dark[\\s\\S]*\\}/ 只认 default 导出对象，2026-09-03 实锤）
const common = {
  fontSize: $mcCssBuilder.getCssSize(${fontSize}),
  fontWeightStrong: 600,
  colorTextBase: '#ffffff',
  colorPrimary: '${MC_DARK_THEME_COLOR_ENUM.colorPrimary}',
  colorPrimaryHover: '${MC_DARK_THEME_COLOR_ENUM.colorPrimaryHover}',
  colorPrimaryActive: '${MC_DARK_THEME_COLOR_ENUM.colorPrimaryActive}',
  colorPrimaryBg: '${MC_DARK_THEME_COLOR_ENUM.colorPrimaryBg}',
  colorPrimaryBgHover: '${MC_DARK_THEME_COLOR_ENUM.colorPrimaryBgHover}',
  colorTextSecondary: '${MC_DARK_THEME_COLOR_ENUM.colorTextSecondary}',
  colorDanger: '${MC_DARK_THEME_COLOR_ENUM.colorDanger}',
  colorWarning: '${MC_DARK_THEME_COLOR_ENUM.colorWarning}',
  colorSuccess: '${MC_DARK_THEME_COLOR_ENUM.colorSuccess}',
  colorBorder: '${MC_DARK_THEME_COLOR_ENUM.colorBorder}',
};

const dark = {
${darkBody}
};

${lightBody ? `const light = {\n${lightBody}\n};\n` : ''}
export { ${exportNames} };
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

