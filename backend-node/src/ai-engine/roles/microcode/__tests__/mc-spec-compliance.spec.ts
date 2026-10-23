/**
 * M5-6 治本防回归（2026-09-10）
 *
 * 背景：mc-check v1.0.20 扫描 106 个合法命名组件，68 个因 M5-6 不允许上线。
 * 根因不是模型：`theme-vars.less` 被归一为 `@fontSize: var(--fontSize)` 后，
 * `healThemeMixinVarRefs` 把业务样式的 `@fontSize` 替换成
 * `var(--fontSize, var(--fontSize))`（自指 fallback + 绕过 LESS 变量层）。
 *
 * 治本：写盘前先 `injectThemeVarDeclsForLess` 在业务 .less 顶层注入同名声明，
 * 使 `healThemeMixinVarRefs` 的 localDeclared 命中并跳过替换 → 保留 `@fontSize`。
 *
 * 本 spec 钉死这条契约：**自愈不得把已合规形态改写成不合规形态**。
 */
// @ts-ignore —— 引擎层为 ESM .js，无 .d.ts
import {
  injectThemeVarDeclsForLess,
  healThemeMixinVarRefs,
  // @ts-ignore
} from '../code-healer.js';

const THEME_VARS_MIXIN = `.common() {
  @fontSize: var(--fontSize);
  @colorText: var(--colorTextBase);
}
`;

const THEME_VARS_TOPLEVEL = `@fontSize: var(--fontSize);
.common() {
  @fontSize: var(--fontSize);
}
`;

const SELF_REF = /var\(--fontSize,\s*var\(--fontSize\)\)/;

describe('M5-6 治本：业务 .less 顶层注入 theme-vars 声明', () => {
  it('mixin 内声明 + 直接引用：注入顶层声明后保留 @fontSize，无自指 fallback', () => {
    const business = '.device-root {\n  font-size: @fontSize;\n  color: @colorText;\n}\n';
    const injected = injectThemeVarDeclsForLess(business, THEME_VARS_MIXIN);

    expect(injected).toContain('@fontSize: var(--fontSize);');
    expect(injected).toContain('@colorText: var(--colorTextBase);');

    // 关键契约：注入后再过自愈，不得被改写成 var()
    const after = healThemeMixinVarRefs(injected, THEME_VARS_MIXIN);
    expect(after).toContain('font-size: @fontSize');
    expect(after).not.toMatch(SELF_REF);
  });

  it('calc 运算引用同样保留 @fontSize', () => {
    const business = '.device-root {\n  font-size: calc(@fontSize * 1.429);\n}\n';
    const injected = injectThemeVarDeclsForLess(business, THEME_VARS_MIXIN);
    const after = healThemeMixinVarRefs(injected, THEME_VARS_MIXIN);

    expect(after).toContain('calc(@fontSize * 1.429)');
    expect(after).not.toMatch(SELF_REF);
  });

  it('注入值原样取自 theme-vars：非 fontSize 变量不得被写成 var(--同名)', () => {
    const business = '.device-root {\n  color: @colorText;\n}\n';
    const injected = injectThemeVarDeclsForLess(business, THEME_VARS_MIXIN);

    // @colorText 在 theme-vars 里的值是 var(--colorTextBase)，必须原样注入
    expect(injected).toContain('@colorText: var(--colorTextBase);');
    expect(injected).not.toContain('@colorText: var(--colorText);');
  });

  it('业务文件顶层已声明的变量不重复注入', () => {
    const business = '@fontSize: 14px;\n.device-root {\n  font-size: @fontSize;\n}\n';
    const injected = injectThemeVarDeclsForLess(business, THEME_VARS_MIXIN);

    expect(injected).toBe(business); // 无缺失 → 原样返回
  });

  it('at-rule（@media / @import）不得被误判为变量注入', () => {
    const business =
      '@import "../themes/theme-vars.less";\n@media (max-width: 768px) {\n  .x { font-size: 12px; }\n}\n';
    const injected = injectThemeVarDeclsForLess(business, THEME_VARS_MIXIN);

    expect(injected).toBe(business);
    expect(injected).not.toContain('@media:');
    expect(injected).not.toContain('@import:');
  });

  it('无 theme-vars 或为空时原样返回', () => {
    const business = '.device-root {\n  font-size: @fontSize;\n}\n';
    expect(injectThemeVarDeclsForLess(business, '')).toBe(business);
    // @ts-ignore 边界：null 输入
    expect(injectThemeVarDeclsForLess(business, null)).toBe(business);
  });

  it('回归锚点：刀 A 后不再产自指 fallback，fallback 落设计基准 14px', () => {
    const business = '.device-root {\n  font-size: @fontSize;\n}\n';
    const withoutFix = healThemeMixinVarRefs(business, THEME_VARS_MIXIN);

    // 🔴🔴 2026-10-23 刀 A（mc-max-1792739994368-e2c61f62 治本）：源头不再产
    //   `var(--x, var(--x))` **自引用双写**（旧断言 `toMatch(SELF_REF)` 记录的正是该事故
    //   行为，已随治本同步翻转为阴性断言）。fallback 改为三级取值：
    //   内层字面量 → 设计基准表（fontSize=14px）→ fail-open 跳过。
    //   注入仍是首选路径（保响应式），此处证明「即使不注入也不再产生畸形」。
    expect(withoutFix).not.toMatch(SELF_REF);
    expect(withoutFix).toContain('var(--fontSize, 14px)');
  });

  it('顶层已声明的 theme-vars 场景：自愈不再改坏，注入后保持合规', () => {
    const business = '.device-root {\n  font-size: @fontSize;\n}\n';
    // 🔴 刀 A 后「不注入」这条路径也不再产出非法自引用（旧行为记录已翻转）
    const withoutFix = healThemeMixinVarRefs(business, THEME_VARS_TOPLEVEL);
    expect(withoutFix).not.toMatch(SELF_REF);

    const injected = injectThemeVarDeclsForLess(business, THEME_VARS_TOPLEVEL);
    const after = healThemeMixinVarRefs(injected, THEME_VARS_TOPLEVEL);
    expect(after).toContain('font-size: @fontSize');
    expect(after).not.toMatch(SELF_REF);
  });
});
