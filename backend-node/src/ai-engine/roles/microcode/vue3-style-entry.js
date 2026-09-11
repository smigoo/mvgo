/**
 * Vue3 样式入口 / 子组件接线 / 子组件规划模块（从 vue3-engineer.js 拆分，2026-08-30）
 *
 * 职责：
 * - ensureVue3StyleEntry：补齐 resources/styles/{index,theme-vars,common}.less
 * - wireVue3SubComponentImports：子组件 import 自动接线
 * - resolveVue3SubComponentPlan：统一解析 subComponentPlan（字段缺失/类型错误兜底）
 * - assembleVue3IndexVue：三段拼装主组件 SFC（真实 style 段）
 *
 * 纯函数导出 + options 依赖注入模式（this → options）：
 *   ensureVue3StyleEntry(files, { logger })
 *   wireVue3SubComponentImports(files, { logger })
 *   assembleVue3IndexVue(tpl, scr, sty, input, { postProcessIndexVue })
 */

import { sanitizeCssContent } from '../../utils/css-sanitizer.js';
import { extractComponentTagNames } from '../../utils/sfc-semantics.js';
import { extractVue3SfcBlock } from './vue3-healer.js';
import { extractSfcTemplate } from '../../utils/sfc-template-extractor.js';
import {
  buildVue3ThemeMixinSnippet,
  buildVue3ThemeVarsLess,
} from '../../utils/style-tokens.js';

/**
 * 补齐 Vue3 共享样式入口：resources/styles/{index,theme-vars,common}.less
 * - index.less 固定 @import 前两者
 * - theme-vars.less 缺失时补空 mixin 模板；存在但缺 mixin 定义时自动补齐
 * - common.less 缺失时补最小空模板
 * @param {object} files - 文件映射（相对路径 → 内容）
 * @param {object} options - { logger, styleTokens? }（styleTokens：utils/style-tokens.js 契约，
 *   1.4 起 theme-vars.less 兜底按契约渲染——common 框架变量 + dark/light 槽位，无契约回退空模板）
 * @returns {object} 补齐后的 files
 */
export function ensureVue3StyleEntry(files = {}, options = {}) {
  const entryPath = 'resources/styles/index.less';
  const themeVarsPath = 'resources/styles/theme-vars.less';
  const commonPath = 'resources/styles/common.less';

  // 补齐 index.less（一定存在）
  if (!files[entryPath]) {
    options.logger.warn(
      '🛡️ Vue3 共享样式入口缺失，已自动补齐 resources/styles/index.less',
    );
  }

  // 自动补缺失的 theme-vars.less（优先按 styleTokens 契约确定性渲染，无契约时兜底空模板）
  // 注意：注释里不用 ".common()" 格式，否则 less-compile-gate 的正则 /\.common\s*\(/ 会匹配到注释
  const hasStyleTokens =
    options.styleTokens && typeof options.styleTokens === 'object';
  if (!files[themeVarsPath]) {
    if (hasStyleTokens) {
      options.logger.warn(
        '🛡️ Vue3 theme-vars.less 缺失，已按 styleTokens 契约渲染补齐（含主题 mixin 变量）',
      );
      files[themeVarsPath] = buildVue3ThemeVarsLess(options.styleTokens);
    } else {
      options.logger.warn(
        '🛡️ Vue3 theme-vars.less 缺失，已自动补齐空模板（含 mixin 定义）',
      );
      files[themeVarsPath] = `// 自动补空模板 - 模型漏生成时系统自动补齐
// 主题变量和 mixins 定义

.common() {
}

.theme-dark() {
}

.theme-light() {
}
`;
    }
  } else {
    // theme-vars.less 已存在，检查是否缺少必要 mixin 定义并自动补齐
    // 根因：LLM 有时生成只含变量/注释的文件，漏掉 .common/.theme-dark/.theme-light 定义
    // → less-compile-gate 的 wrapper 注入 .common() 调用后报 ".common is undefined"
    const tvContent = files[themeVarsPath];
    const missingMixins = [];
    // 用代码感知正则（非注释行）检查 mixin 定义是否存在
    const codeLines = tvContent
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join('\n');
    if (!/\.common\s*\([^)]*\)\s*\{/.test(codeLines))
      missingMixins.push('.common() {}');
    if (!/\.theme-dark\s*\([^)]*\)\s*\{/.test(codeLines))
      missingMixins.push('.theme-dark() {}');
    if (!/\.theme-light\s*\([^)]*\)\s*\{/.test(codeLines))
      missingMixins.push('.theme-light() {}');
    if (missingMixins.length > 0) {
      options.logger.warn(
        `🛡️ Vue3 theme-vars.less 缺少 mixin 定义，已自动补齐: ${missingMixins.join(', ')}`,
      );
      // 1.4：有 styleTokens 契约时补「含槽位变量的 mixin」（dark=枚举三核心+设计变量、
      // light=Figma 提取/派生），无契约时维持空壳定义（保编译）。
      const snippetNameMap = {
        '.common() {}': 'common',
        '.theme-dark() {}': 'theme-dark',
        '.theme-light() {}': 'theme-light',
      };
      const fillBlocks = missingMixins.map((m) => {
        if (!hasStyleTokens) return m;
        const mixinName = snippetNameMap[m];
        const snippet = mixinName
          ? buildVue3ThemeMixinSnippet(mixinName, options.styleTokens)
          : null;
        return snippet || m;
      });
      files[themeVarsPath] =
        tvContent +
        '\n// === [自动修复] 补齐缺失 mixin 定义 ===\n' +
        fillBlocks.join('\n\n') +
        '\n';
    }
  }

  // 自动补缺失的 common.less（最小空模板）
  if (!files[commonPath]) {
    options.logger.warn('🛡️ Vue3 common.less 缺失，已自动补齐空模板');
    files[commonPath] = `// 自动补空模板（模型漏生成）
// 请在此文件定义所有组件 CSS 规则
`;
  }

  return {
    ...files,
    [entryPath]: "@import './theme-vars.less';\n@import './common.less';\n",
  };
}

/**
 * Vue3 子组件 import 自动接线（治本修复"模板引用未声明组件"）。
 *
 * 背景：三段降级单独生成脚本段时，模型常漏写子组件 import（如 <SectionHeader>），
 * 导致 (1) 写盘门禁报"模板引用了 script 中未声明的变量/组件"；(2) 运行期组件悬空。
 * 子组件文件已由 generateCode 阶段据模板标签生成到 package/components/<Tag>.vue，
 * 本方法确定性地把它们 import 进主组件 <script setup>，使其在 <script setup> 下自动注册，
 * 无需模型配合、不依赖重试，保证最终落盘文件语义完整且运行期可解析。
 *
 * 仅接线"确实已生成"的子组件文件；已 import / 已在 components:{} 注册的跳过，幂等安全。
 * @param {object} files 文件映射（相对路径 → 内容）
 * @param {object} options - { logger }
 * @returns {object} 同一 files 对象（原地修改 package/index.vue）
 */
export function wireVue3SubComponentImports(files, options = {}) {
  const main = files && files['package/index.vue'];
  if (!main || typeof main !== 'string') return files;

  const templateBody = extractSfcTemplate(main);
  if (!templateBody) return files;
  const tags = extractComponentTagNames(templateBody);
  if (tags.length === 0) return files;

  // 已生成的子组件文件集合（仅接线真实存在的）
  const existingSub = new Set(
    Object.keys(files).filter((f) =>
      /^package\/components\/[^/]+\.vue$/.test(f),
    ),
  );
  const scriptMatch = main.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return files;
  const scriptBody = scriptMatch[1];

  const toImport = [];
  for (const tag of tags) {
    if (!existingSub.has(`package/components/${tag}.vue`)) continue; // 仅接线已生成的子组件
    if (new RegExp(`import\\s+${tag}\\b`).test(scriptBody)) continue; // 已 import
    if (
      new RegExp(`components\\s*:\\s*\\{[^}]*\\b${tag}\\b`).test(scriptBody)
    )
      continue; // 已在 components:{} 注册
    if (new RegExp(`\\b(?:const|let|var)\\s+${tag}\\s*=`).test(scriptBody))
      continue; // 已用 defineAsyncComponent 等方式声明
    if (new RegExp(`\\bfunction\\s+${tag}\\b`).test(scriptBody)) continue; // 已是函数声明
    toImport.push(tag);
  }
  if (toImport.length === 0) return files;

  const importBlock = toImport
    .map((t) => `import ${t} from './components/${t}.vue'`)
    .join('\n');

  // 插到最后一个 import 语句之后；若脚本段无任何 import，则插到 <script> 开标签之后
  const importRe = /^[ \t]*import\s+[^\n;]*?from\s+['"][^\n]*['"][^\n]*\n/gm;
  let lastEnd = -1;
  let mm;
  while ((mm = importRe.exec(main)) !== null)
    lastEnd = mm.index + mm[0].length;
  let newMain;
  if (lastEnd >= 0) {
    newMain =
      main.slice(0, lastEnd) + importBlock + '\n' + main.slice(lastEnd);
  } else {
    const openIdx = main.indexOf('<script');
    const closeOpen = main.indexOf('>', openIdx);
    newMain =
      main.slice(0, closeOpen + 1) +
      '\n' +
      importBlock +
      '\n' +
      main.slice(closeOpen + 1);
  }
  options.logger.info('🛡️ 已为 index.vue 自动接线子组件 import', {
    imported: toImport,
  });
  files['package/index.vue'] = newMain;
  return files;
}

/**
 * 统一解析 subComponentPlan（来自 subcomponent-planner 结构规划阶段）
 * 集中处理「字段缺失 / 类型错误」兜底，避免 buildCodePrompt 与 generateCode 各写一套导致失同步。
 * 返回结构始终含完整字段：
 * - subPlan: 归一化后的 plan（含 effectiveSections / items / isForced / minFiles / reason）
 * - effectiveSections: subPlan.effectiveSections 或空数组
 * - requiredSubComps: subPlan.items 中 isRequired 为真的子组件
 * @param {object} input - 含 subComponentPlan 的输入对象
 * @returns {{ subPlan: object, effectiveSections: Array, requiredSubComps: Array }}
 */
export function resolveVue3SubComponentPlan(input) {
  // 🛡️ 接管（P1）：优先消费 Context Assembler 裁决的 componentPlan（单一事实源），
  // 但以合并策略保留 legacy 的 items（requiredSubComps 来源，防御历史路径），
  // effectiveSections/isForced/minFiles/reason 由 genPlan 覆盖。
  const genPlan = input && input.generationInput?.componentPlan;
  const legacy = input && input.subComponentPlan;
  const raw =
    genPlan && typeof genPlan === 'object'
      ? {
          ...(legacy && typeof legacy === 'object' ? legacy : {}),
          ...genPlan,
        }
      : legacy;
  const subPlan =
    raw && typeof raw === 'object'
      ? raw
      : {
          effectiveSections: [],
          items: [],
          isForced: false,
          minFiles: 0,
          reason: '未传入 subComponentPlan',
        };
  const effectiveSections = subPlan.effectiveSections || [];
  const requiredSubComps = (subPlan.items || []).filter(
    (it) => it && it.isRequired,
  );

  // 🎯 Phase 2 方案1: 提取内部子组件
  const internalSubcomponents = subPlan.internalSubcomponents || [];

  return {
    subPlan,
    effectiveSections,
    requiredSubComps,
    internalSubcomponents,
  };
}

/**
 * Vue3 拼装（真实 style 段，而非微码固定 @import 模板）
 * 三段降级路径下容忍段间泄漏，按块类型抽取唯一 SFC 块，再走父类后处理兜底。
 * @param {string} templateContent - 模板段内容
 * @param {string} scriptContent - 脚本段内容
 * @param {string} styleContent - 样式段内容
 * @param {object} input - 生成输入
 * @param {object} options - { postProcessIndexVue }
 * @returns {string} 完整 SFC
 */
export function assembleVue3IndexVue(
  templateContent,
  scriptContent,
  styleContent,
  input = {},
  options = {},
) {
  const strip = (s) =>
    (s || '')
      .trim()
      .replace(/^\/\/\s*===\s*package\/index\.vue\s*===\s*\n?/i, '');
  const rawTpl = strip(templateContent);
  const rawScr = strip(scriptContent);
  const rawSty = strip(styleContent);

  // 各段按"自己负责的块类型"抽取；缺漏/泄漏的块从其他段回退抽取，保证整文件仅一个 template/script/style
  let tpl =
    extractVue3SfcBlock(rawTpl, 'template') ||
    extractVue3SfcBlock(rawScr, 'template') ||
    extractVue3SfcBlock(rawSty, 'template');
  let scr =
    extractVue3SfcBlock(rawScr, 'script') ||
    extractVue3SfcBlock(rawTpl, 'script') ||
    extractVue3SfcBlock(rawSty, 'script');
  let sty =
    extractVue3SfcBlock(rawSty, 'style') ||
    extractVue3SfcBlock(rawTpl, 'style') ||
    extractVue3SfcBlock(rawScr, 'style');

  // style 段可能是纯 less（无 <style> 包裹）→ 包裹并清洗
  if (!sty && rawSty && rawSty.trim() && !rawSty.includes('<style')) {
    sty = sanitizeCssContent(rawSty, { isLessFile: false });
    sty = `<style lang="less" scoped>\n${sty}\n</style>`;
  }

  // 任一缺失时给兜底占位，避免写盘门禁再次失败
  if (!tpl)
    tpl =
      '<template>\n  <div class="c-monitor-panel">\n    <!-- 模板生成失败，需人工补充 -->\n  </div>\n</template>';
  if (!scr) scr = '<script setup>\n</script>';
  if (!sty)
    sty =
      '<style lang="less" scoped>\n/* 样式生成失败，需人工补充 */\n</style>';

  // 🔧 一致性修复：vue3 路径此前完全绕过父类 _postProcessIndexVue，
  // 导致 T03(min-height)/T04(背景去重)/T05(bg-size→cover)/T06(容器尺寸)/T07(资源引用)
  // 对 vue3 组件全部失效——而 vue3 恰是 bg-size 硬编码、标题装饰容器 420×186 等痛点的组件类型。
  // 此处补接入父类后处理兜底，与 microcode 路径行为对齐。
  const assembled = [tpl, scr, sty].join('\n\n') + '\n';
  return options.postProcessIndexVue(assembled, input);
}
