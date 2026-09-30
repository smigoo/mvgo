/**
 * @file mc-skeleton.js — 🛡️ P1.8（2026-09-11）：**微码平台产物骨架的单一生成器**。
 *
 * 事故（lite 产物微码规范检查全红，用户截图）：同一份「微码产物规范」被两条链各自实现 ——
 *   · max/Figma 路径（microcode-engineer + microcode/file-writer）产**全量骨架**：
 *     config/css-vars.js + declare.js + component.js + themes/{theme-vars,dark,light}.less
 *     + common.less + index.less（含 @import 与默认主题调用）
 *   · lite 路径（lite/lite.service.ts 自造精简落盘）**只写** index.vue + declare.json
 *     + 自拼 declare.js + 私有 buildDefaultLess + component.js → 缺 css-vars/common/themes
 *     → M2-3/M2-4/M3-5/M3-6/M4-8 必然全红（实测 lite 11/11 全缺，max 138 个仅 5–8% 缺）。
 *
 * 本模块把骨架抽为**一处**（复用 file-writer 的 buildCssVarsFile/buildDeclareJsFile/
 * buildComponentJsFile 与 style-tokens），lite / max 及后续任何路径统一调用。
 *
 * jest 安全：无 import.meta。
 */

import {
  buildCssVarsFile,
  buildDeclareJsFile,
  buildComponentJsFile,
} from '../roles/microcode/file-writer.js';

/**
 * 🎨 主题覆盖层模板 —— **唯一事实源**（2026-09-30 迁移补全）。
 *
 * 消费方（三处，同一常量）：
 *   ① 本模块 `buildMcSkeleton`（骨架生成，lite / max 统一入口）；
 *   ② `roles/microcode-engineer.js`（max/Figma 路径的骨架构建，经 import 取用）；
 *   ③ `roles/microcode/code-validator.js`（补写缺失的 themes/*.less，值由 engineer 经
 *      `helpers.themeWrapperTemplates` 透传 ⇒ 与 ② 同源）。
 *
 * ⚠️ 迁移史：本常量原在 `microcode-engineer.js` 内定义；抽出时**只复制未删除**，
 *   导致 engineer 侧长期保留一份可用副本（4 处使用点）+ 本处一份（校验器用）
 *   ⇒ 「同一事实两处定义」的复发温床（两份内容逐字相同，故一直未暴露，但改一处不同步另一处
 *   时，**生成端与校验端口径必然分叉**）。2026-09-30 收敛：engineer 改为 import、删本地副本。
 *
 * ⚠️ 关键背景（2026-08-26 治本修复）：旧架构由 index.less 只 @import dark.less / light.less，
 * 两者又用 `&.dark { @import '../common.less' }` 把 common.less 的全部规则包进 `.dark`/`.light`
 * 作用域。但宿主 base-panel 与前端预览**从不给组件根注入 .dark / .light 类**，编译产物
 * `.dark .c-xxx` 在真实 DOM 上 0 命中 → 所有微码组件样式（背景/边框/圆角/图标尺寸/内部布局）
 * 100% 失效，表现为「布局在但全白/裸奔」。新架构：index.less 在**根作用域**先调用默认主题
 * mixin 再导入 common.less（保证无主题类时样式生效），dark.less / light.less 保留为
 * 「宿主未来注入主题类时的高特异性覆盖层」，由 index.less 决定是否引入。
 */
export const THEME_WRAPPER_TEMPLATES = {
  dark: `// 主题覆盖层：仅当宿主给组件根注入 .dark 类时生效（特异性高于根作用域默认主题）
&.dark {
  .common();
  .theme-dark();
  @import (multiple) '../common.less';
}
`,
  light: `// 主题覆盖层：仅当宿主给组件根注入 .light 类时生效（特异性高于根作用域默认主题）
&.light {
  .common();
  .theme-light();
  @import (multiple) '../common.less';
}
`,
};

/** 是否在 index.less 引入 .dark/.light 覆盖层（默认 true：mc-check M4-5 要求） */
function includeThemeOverrides() {
  return String(process.env.MC_EMIT_THEME_OVERRIDES || '1') !== '0';
}

/** 浅色默认令牌（styleTokens 未提供时的确定性兜底） */
const LIGHT_DEFAULT = {
  colorPrimary: '#1890ff',
  colorSecondary: '#08a3a5',
  colorDanger: '#ff6450',
  colorTextBase: '#333333',
  colorTextInverse: '#ffffff',
  colorBgPanel: '#edf4fb',
  colorBorder: '#e8e8e8',
};

/** 深色默认令牌（与 style-tokens 的枚举口径一致） */
const DARK_DEFAULT = {
  colorPrimary: '#44E4FF',
  colorSecondary: '#08a3a5',
  colorDanger: '#ff6450',
  colorTextBase: '#ffffff',
  colorTextInverse: '#333333',
  colorBgPanel: '#414141',
  colorBorder: '#4b4b4b',
};

/** 令牌对象 → LESS 变量行 */
function tokensToLessVars(tokens = {}, fallback = {}) {
  const merged = { ...fallback, ...(tokens || {}) };
  return Object.entries(merged)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `  @${k}: ${v};`)
    .join('\n');
}

/**
 * 生成 theme-vars.less（确定性；`.common()` / `.theme-light()` / `.theme-dark()` 三 mixin）。
 * 与 max 路径产物契约一致（M5-6：`@fontSize: var(--fontSize)` 精确映射）。
 */
export function buildThemeVarsLess(options = {}) {
  const { styleTokens = null } = options;
  const light = styleTokens?.light || LIGHT_DEFAULT;
  const dark = styleTokens?.darkWithDesign || DARK_DEFAULT;
  return `// ─────────────────────────────────────────────
// 微码组件主题变量（系统自动生成，勿手改）
// 由 style-tokens 确定性派生；@fontSize 走 var(--fontSize) 精确映射（M5-6）
// ─────────────────────────────────────────────

.common() {
  // 字体缩放基准令牌（根容器通过 CSS 变量 --fontSize 驱动，默认 14px）
  @fontSize: var(--fontSize);

  // 字体尺寸
  @font-size-base: 14px;
  @font-size-lg: 28px;
  @font-size-sm: 12px;

  // 字重
  @font-weight-strong: 700;

  // 圆角
  @border-radius-base: 4px;
  @border-radius-lg: 8px;
}

.theme-light() {
${tokensToLessVars(light, LIGHT_DEFAULT)}
}

.theme-dark() {
${tokensToLessVars(dark, DARK_DEFAULT)}
}
`;
}

/**
 * 生成 index.less（样式入口；max 路径同款确定性入口）。
 * 根作用域先调默认主题再导入 common.less —— 保证宿主未注入主题类时样式仍生效。
 */
export function buildIndexLess() {
  const overrides = includeThemeOverrides()
    ? `
// 主题覆盖层（宿主注入 .dark/.light 类时生效）
@import './themes/dark.less';
@import './themes/light.less';
`
    : '';
  return `// 样式入口（系统自动生成，勿手改）
@import './themes/theme-vars.less';

// 默认主题：必须在**根作用域**生效，否则组件在无 .dark/.light 祖先的真实 DOM 上样式全部失效
.common();
.theme-light();
@import (multiple) './common.less';
${overrides}`;
}

/**
 * 生成最小可编译的 common.less 骨架（业务规则由模型/后续阶段追加）。
 * 🛡️ 必须 `@import themes/theme-vars.less` + 调 `.common()`：否则 M5-6 的 @fontSize 不可用。
 */
export function buildCommonLessSkeleton(options = {}) {
  const { componentName = 'component', rootClass = '' } = options;
  return `@import './themes/theme-vars.less';

.common();

// ─────────────────────────────────────────────
// ${componentName} 业务样式（所有 class 以组件前缀开头）
// ─────────────────────────────────────────────
${rootClass ? `.${rootClass} {\n  width: 100%;\n  height: 100%;\n  box-sizing: border-box;\n}\n` : ''}`;
}

/**
 * 生成微码平台骨架文件集（单一入口）。
 * @param {Object} options
 * @param {string} [options.componentName]
 * @param {string} [options.rootClass] 内容根类名（可选，仅用于 common.less 骨架）
 * @param {object} [options.styleTokens] style-tokens 输出（light / darkWithDesign）
 * @param {string} [options.fontSize] css-vars 字体基准（px 数值字符串）。缺省取
 *   `options.styleTokens.fontSize`（设计基准）；都没有则留空 → 输出 `$mcCssBuilder.getCssSize()`
 *   （框架 `baseFontSize`）。**禁止写死数值**（历史 `'12'` 使字号系统性 0.857×）。
 * @param {object} [options.extraDarkVars]
 * @returns {Object<string,string>} path → content
 */
export function buildMcSkeleton(options = {}) {
  const files = {
    'resources/config/css-vars.js': buildCssVarsFile({
      // 🛡️ 2026-09-28：删掉 `|| '12'` 魔法数（全组件字号系统性 0.857× 的根因）。
      //   显式传入优先；否则取 styleTokens 的设计基准（与 theme-vars.less `@font-size-base` 同源）；
      //   都没有则留空 → buildCssVarsFile 输出 `getCssSize()`（框架 baseFontSize）。
      fontSize: options.fontSize || options.styleTokens?.fontSize,
      styleTokens: options.styleTokens || null,
      extraDarkVars: options.extraDarkVars || null,
      includeLight: options.includeLight !== false,
    }),
    'declare.js': buildDeclareJsFile(options),
    'component.js': buildComponentJsFile(),
    'resources/styles/index.less': buildIndexLess(),
    'resources/styles/common.less': buildCommonLessSkeleton(options),
    'resources/styles/themes/theme-vars.less': buildThemeVarsLess(options),
    'resources/styles/themes/dark.less': THEME_WRAPPER_TEMPLATES.dark,
    'resources/styles/themes/light.less': THEME_WRAPPER_TEMPLATES.light,
  };
  return files;
}

/** 微码产物必需骨架文件（与 mc-check M2-3/M2-4/M3-5/M3-6/M4-2/M4-6/M4-8 口径一致） */
export const REQUIRED_SKELETON_FILES = [
  { path: 'resources/config/css-vars.js', check: 'M2-3', label: 'css-vars.js' },
  { path: 'resources/styles/common.less', check: 'M2-4', label: 'common.less' },
  { path: 'resources/styles/themes/theme-vars.less', check: 'M3-6', label: 'theme-vars.less' },
  { path: 'resources/styles/themes/dark.less', check: 'M3-5', label: 'themes/dark.less' },
  { path: 'resources/styles/themes/light.less', check: 'M3-5', label: 'themes/light.less' },
  { path: 'resources/styles/index.less', check: 'M4-6', label: 'index.less' },
  { path: 'declare.js', check: 'M4-1', label: 'declare.js' },
  { path: 'declare.json', check: 'M3-1', label: 'declare.json' },
];

/**
 * 骨架完整性校验（单一实现；门禁 CODE-026 与报告共用）。
 * 只在「微码产物」上生效（以 package/index.vue + declare.json 判定），避免误伤 vue3 路径。
 * @param {Object<string,string>} files
 * @returns {Array<{id:string, code:string, file:string, message:string}>}
 */
export function checkSkeletonCompleteness(files = {}) {
  const paths = new Set(Object.keys(files || {}));
  const isMicrocode =
    [...paths].some((p) => /package\/index\.vue$/.test(p)) &&
    [...paths].some((p) => /(^|\/)declare\.json$/.test(p));
  if (!isMicrocode) return [];

  const out = [];
  for (const req of REQUIRED_SKELETON_FILES) {
    const exists = [...paths].some((p) => p === req.path || p.endsWith(`/${req.path}`));
    if (!exists) {
      out.push({
        id: 'SKELETON-MISSING',
        code: req.check,
        file: req.path,
        message: `微码产物缺少必要文件 \`${req.path}\`（mc-check ${req.check}）—— 骨架不全将导致规范检查全红`,
      });
    }
  }
  // M4-8：index.vue 必须引用 styles/index.less
  for (const [p, c] of Object.entries(files || {})) {
    if (!/package\/index\.vue$/.test(p) || typeof c !== 'string') continue;
    if (!/@import\s+['"][^'"]*resources\/styles\/index\.less['"]/.test(c)) {
      out.push({
        id: 'SKELETON-NO-INDEX-LESS-IMPORT',
        code: 'M4-8',
        file: p,
        message: 'index.vue 未引用 `resources/styles/index.less`（mc-check M4-8）—— 样式入口断链，主题与业务样式均不生效',
      });
    }
  }
  return out;
}
