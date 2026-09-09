// 组件 CSS 变量默认值（存量组件变量化改造 2026-09-04，勿手改）
// 契约（docs/微码管线改造方案-2026-09-03 §5.3）：
//   light = 设计真值（现状亮色板，保证无主题注入时视觉零变化）
//   dark  = 规范枚举（M4-10：colorTextBase #ffffff / colorPrimary #44E4FF / colorPrimaryBg #414141）
//   自定义设计变量（反白文字/功能色）双主题同值，命名避开框架预设 8 变量
// 导出形态：命名导出（declare.js import）+ default 导出（mc-check M4-8 只认 default）
const common = {
  fontSize: '14px',
};

const light = {
  // 语义：文字主色（control-label/label/legend-text 现状 #333333）
  colorTextBase: '#333333',
  // 语义：次要文字色
  colorTextSecondary: '#666666',
  // 语义：主色（tab-item 现状 #2c9bea 沿用；与 theme-vars.less @color-primary #1890ff 不同）
  colorPrimary: '#2c9bea',
  colorPrimaryHover: '#55b8ef',
  colorPrimaryActive: '#006fef',
  colorPrimaryBg: 'rgba(44, 155, 234, 0.12)',
  colorPrimaryBgHover: 'rgba(44, 155, 234, 0.16)',
  // 自定义设计变量（避开预设 8 命名）
  colorTextInverse: '#ffffff',   // badge 字、tab-item--active 字
  colorError: '#f53f3f',         // badge 底（沿用 UI 现状，非 #ff4d4f）
  colorWarning: '#d32f2f',       // echarts markLine 红色（声明备用）
};

const dark = {
  colorTextBase: '#ffffff',
  colorTextSecondary: '#D6D6D6',
  colorPrimary: '#44E4FF',
  colorPrimaryHover: '#78ECFF',
  colorPrimaryActive: '#00BBFF',
  colorPrimaryBg: '#414141',
  colorPrimaryBgHover: '#4B4B4B',
  colorTextInverse: '#ffffff',
  colorError: '#f53f3f',         // 双主题同值，保识别
  colorWarning: '#d32f2f',
};

export { common, dark, light };
export default { common, dark, light };
