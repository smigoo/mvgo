// 组件 CSS 变量默认值（系统生成，勿手改）
// 规范：M4-4 导出 common + 每个主题对象；M4-4b 字体变量使用 $mcCssBuilder.getCssSize()
// 导出形态：命名导出（declare.js import cssVars 用）+ default 导出（mc-check M4-8 正则
//   /export\s+default\s*\{[\s\S]*dark[\s\S]*\}/ 只认 default 导出对象，2026-09-03 实锤）
const common = {
  fontSize: $mcCssBuilder.getCssSize(12),
  fontWeightStrong: 600,
  colorTextBase: '#546881',
  colorPrimary: '#a6ceff',
  colorPrimaryBg: 'rgba(166, 206, 255, 0.12)',
  colorPrimaryHover: '#d9eaff',
  colorPrimaryActive: '#73b2ff',
  colorPrimaryBgHover: 'rgba(166, 206, 255, 0.16)',
  colorTextSecondary: '#666666',
  colorDanger: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBorder: '#e8e8e8',
};

const dark = {
  colorTextBase: '#ffffff',
  colorPrimary: '#44E4FF',
  colorPrimaryBg: '#414141',
  colorTextSecondary: '#D6D6D6',
  colorDanger: '#ff5a50',
  colorWarning: '#ffb03c',
  colorSuccess: '#5cdb6b',
  colorBorder: '#4b4b4b',
};

const light = {
  colorTextBase: '#546881',
  colorPrimary: '#a6ceff',
  colorPrimaryBg: 'rgba(166, 206, 255, 0.12)',
  colorPrimaryHover: '#d9eaff',
  colorPrimaryActive: '#73b2ff',
  colorPrimaryBgHover: 'rgba(166, 206, 255, 0.16)',
  colorTextSecondary: '#666666',
  colorDanger: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBorder: '#e8e8e8',
};

export { common, dark, light };
export default { common, dark, light };
