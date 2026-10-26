/**
 * 🔴 2026-10-26 RC2（a0f93b25 实锤「设计稿的深色主题和默认 dark 一模一样」）
 *
 * 病灶：`buildCssVarsFile` 早已支持 N 主题导出，但 `buildDeclareJsFile` **硬编码**
 *   `import { common, dark, light }` + `cssVars: { common, dark, light }`。
 *   产物 `css-vars.js:76` 明写 `export { common, dark, light, theme_2 };`，
 *   而 `declare.js` 里没有 theme_2 ⇒ 运行期 `cssVars['theme_2']` = undefined ⇒
 *   预览页 `applyPreviewCssVars` 的 `{ ...common, ...cssVars[theme] }` 退化为只剩 common
 *   ⇒ **主题 class 切了，CSS 变量一个都没变** ⇒ 看起来「两个深色一模一样」。
 *
 * 本组锁三件事：
 *   ① 缺省（lite 路径不传 styleTokens）输出**逐字节等价**旧版 —— 零回归硬要求；
 *   ② 有自定义主题时 declare.js 的主题名与 css-vars.js 的导出一致（单一事实源）；
 *   ③ 只有 light/dark 时仍逐字节等价（旧双主题路径不受影响）。
 */
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.spec 等同款惯例）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { buildDeclareJsFile, buildCssVarsFile, buildMcPlatformFiles } from './file-writer.js';

const LEGACY_DECLARE_JS = `import declareConfig from './declare.json'
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

/** 双稿 + 一个自定义主题（key=theme_2，brightness=dark）——a0f93b25 的真实形状 */
const TOKENS_TWO_EXTRA = {
  defaultTheme: 'light',
  light: { colorTextBase: '#333333' },
  darkWithDesign: { colorTextBase: '#ffffff' },
  themeSlots: {
    light: { 'color-text-base': '#333333' },
    theme_2: { 'color-text-base': '#ffffff' },
  },
  themeMeta: [
    { key: 'light', brightness: 'light' },
    { key: 'theme_2', brightness: 'dark' },
  ],
  dualTruth: { enabled: true },
};

describe('RC2 · declare.js 主题名必须与 css-vars.js 同源', () => {
  it('🩺 阴性对照：无 options ⇒ 逐字节等价旧版（lite 路径零回归）', () => {
    expect(buildDeclareJsFile()).toBe(LEGACY_DECLARE_JS);
    expect(buildDeclareJsFile({})).toBe(LEGACY_DECLARE_JS);
    // lite.service 两处真实调用形态：只传 componentName / rootClass，不带 styleTokens
    expect(buildDeclareJsFile({ componentName: 'c-x', rootClass: 'c-x' })).toBe(LEGACY_DECLARE_JS);
  });

  it('🩺 阴性对照：themeSlots 只有 light/dark ⇒ 仍逐字节等价旧版', () => {
    const tokens = {
      themeSlots: {
        light: { 'color-text-base': '#333333' },
        dark: { 'color-text-base': '#ffffff' },
      },
      themeMeta: [{ key: 'light', brightness: 'light' }, { key: 'dark', brightness: 'dark' }],
    };
    expect(buildDeclareJsFile({ styleTokens: tokens })).toBe(LEGACY_DECLARE_JS);
  });

  it('🩺 阳性：自定义主题 theme_2 进 import 与 cssVars（旧版两者皆缺）', () => {
    const out = buildDeclareJsFile({ styleTokens: TOKENS_TWO_EXTRA });
    expect(out).toContain(
      "import { common, dark, light, theme_2 } from './resources/config/css-vars.js'",
    );
    expect(out).toContain('cssVars: { common, dark, light, theme_2 }');
    // 旧版铁证：改动前这两行里没有 theme_2 ⇒ 下面两条会失败
    expect(out).not.toContain("import { common, dark, light } from");
  });

  it('🔗 不变量：declare.js 声明的主题名 ⊆ css-vars.js 的导出名（单一事实源）', () => {
    const opts = { fontSize: '12', styleTokens: TOKENS_TWO_EXTRA };
    const cssVars = buildCssVarsFile(opts);
    const declare = buildDeclareJsFile(opts);

    const exportLine = cssVars.match(/export \{ ([^}]+) \};/);
    expect(exportLine).not.toBeNull();
    const exported = exportLine[1].split(',').map((s) => s.trim());

    const importLine = declare.match(/import \{ ([^}]+) \} from '\.\/resources\/config\/css-vars\.js'/);
    expect(importLine).not.toBeNull();
    const imported = importLine[1].split(',').map((s) => s.trim());

    // 每一个 import 都必须在 css-vars.js 里真实导出，否则是断链（打包期 ReferenceError）
    for (const name of imported) {
      expect(exported).toContain(name);
    }
    expect(imported).toContain('theme_2');
  });

  it('🩺 阳性：经 buildMcPlatformFiles 一并产出时两侧口径一致（真实调用路径）', () => {
    const files = buildMcPlatformFiles({ fontSize: '12', styleTokens: TOKENS_TWO_EXTRA });
    expect(files['resources/config/css-vars.js']).toContain('export { common, dark, light, theme_2 };');
    expect(files['declare.js']).toContain('cssVars: { common, dark, light, theme_2 }');
  });

  it('🩺 阴性：非法/空 themeSlots 不产生空名导出（不制造 `import { , }` 坏文件）', () => {
    for (const bad of [null, undefined, {}, 'x', 42]) {
      const out = buildDeclareJsFile({ styleTokens: { themeSlots: bad } });
      expect(out).toBe(LEGACY_DECLARE_JS);
    }
    // 空 key 必须被过滤掉（`const  = {}` 是语法错误）
    const out = buildDeclareJsFile({ styleTokens: { themeSlots: { '': { a: 'b' } } } });
    expect(out).toBe(LEGACY_DECLARE_JS);
  });
});
