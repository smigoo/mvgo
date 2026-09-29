/**
 * A 的行为探针（只读，用 dist 真函数）：
 *  A-① injectThemeVarDeclsForLess 不再注入主题作用域槽位（颜色/阴影）
 *  A-② healThemeMixinVarRefs 不改写被 LESS 颜色函数当实参引用的槽位
 *
 * 用法：env -i PATH=... HOME=... node .tmp-a-behavior-probe.js
 */
const { injectThemeVarDeclsForLess, healThemeMixinVarRefs } =
  require('./dist/ai-engine/roles/microcode/code-healer.js');

const THEME_VARS = `
.common() {
  @fontSize: var(--fontSize);
  @fontWeightStrong: var(--fontWeightStrong);
  @border-radius-base: 8px;
}
.theme-light() {
  @color-text-base: #333333;
  @color-primary: #3170aa;
}
.theme-dark() {
  @color-text-base: #ffffff;
  @color-primary: #44E4FF;
}
`;

const LESS = `.c-x {
  color: @color-text-base;
  background: @color-primary;
  border: 1px solid lighten(@color-primary, 10%);
  font-size: @fontSize;
}
`;

console.log('=== A-① injectThemeVarDeclsForLess ===');
const injected = injectThemeVarDeclsForLess(LESS, THEME_VARS);
console.log(injected);
console.log('判据：应只出现 @fontSize（.common() 令牌），不应出现任何 @color-*');
console.log(
  /@(?:color|shadow)-/.test(injected.split('\n').slice(0, 4).join('\n'))
    ? '  ❌ 仍注入了主题作用域槽位'
    : '  ✅ 未注入主题作用域槽位',
);

console.log('\n=== A-② healThemeMixinVarRefs ===');
const healed = healThemeMixinVarRefs(LESS, THEME_VARS);
console.log(healed);
console.log('判据：lighten() 实参应保持 `@color-primary`，其余槽位应被改写为 var()');
const lightenLine = healed.split('\n').find((l) => l.includes('lighten'));
console.log(
  lightenLine && lightenLine.includes('lighten(@color-primary,')
    ? '  ✅ 颜色函数实参保留 Less 槽位引用'
    : `  ❌ 颜色函数实参被改写 → ${lightenLine && lightenLine.trim()}`,
);
const colorLine = healed.split('\n').find((l) => l.trim().startsWith('color:'));
console.log(
  colorLine && colorLine.includes('var(--color-text-base')
    ? '  ✅ 非颜色函数引用仍走 var() 兜底（保持原行为）'
    : `  ⚠️ 非颜色函数引用未改写 → ${colorLine && colorLine.trim()}`,
);
