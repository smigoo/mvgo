// 组件 CSS 变量默认值（系统生成，勿手改）
// 规范：M4-4 导出 common + 每个主题对象；M4-4b 字体变量使用 $mcCssBuilder.getCssSize()
// 导出形态：命名导出（declare.js import cssVars 用）+ default 导出（mc-check M4-8 正则
//   /export\s+default\s*\{[\s\S]*dark[\s\S]*\}/ 只认 default 导出对象，2026-09-03 实锤）
const common = {
  fontSize: $mcCssBuilder.getCssSize(12),
  fontWeightStrong: 600,
  colorTextBase: '#ffffff',
  colorPrimary: '#44E4FF',
  colorPrimaryHover: '#78ECFF',
  colorPrimaryActive: '#00BBFF',
  colorPrimaryBg: '#414141',
  colorPrimaryBgHover: '#4B4B4B',
};

const dark = {
  colorTextBase: '#ffffff',
  colorPrimary: '#44E4FF',
  colorPrimaryBg: '#414141',
};

const light = {
  colorTextBase: '#333333',
  colorPrimary: '#f0f5ff',
  colorPrimaryBg: 'rgba(240, 245, 255, 0.12)',
  colorPrimaryHover: '#ffffff',
  colorPrimaryActive: '#bdd3ff',
  colorPrimaryBgHover: 'rgba(240, 245, 255, 0.16)',
};

export { common, dark, light };
export default { common, dark, light };