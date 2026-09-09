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
  // 语义：文字主色（DeviceGrid name rgba(51,51,51,0.85) ≈ #333 半透）
  colorTextBase: '#333333',
  // 语义：次要文字色（DeviceGrid separator/total rgba(51,51,51,0.65) ≈ #666 半透）
  colorTextSecondary: '#666666',
  // 语义：主色（DeviceGrid current rgba(24,144,255,1) = #1890ff 沿用）
  colorPrimary: '#1890ff',
  colorPrimaryHover: '#40a9ff',
  colorPrimaryActive: '#096dd9',
  colorPrimaryBg: 'rgba(24, 144, 255, 0.12)',
  colorPrimaryBgHover: 'rgba(24, 144, 255, 0.16)',
  // 自定义设计变量（避开预设 8 命名，须同步 declare.json cssVariableConfig 声明）
  colorTextInverse: '#ffffff',
  colorError: '#ff4d4f',         // 4e4799ad 实际色（沿用现状，非 #f53f3f）
  colorWarning: '#faad14',       // antd 警告色（声明备用，UI 当前未直接使用）
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
  colorError: '#ff4d4f',         // 双主题同值，保识别
  colorWarning: '#faad14',
};

export { common, dark, light };
export default { common, dark, light };
