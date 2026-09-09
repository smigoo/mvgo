/**
 * AI 常用样式禁止配置
 * 
 * 这些是 AI 模型常添加但 Figma 中不存在的样式
 * 用于检测代码生成中的幻觉问题
 */

/**
 * AI 常添加但 Figma 中通常不存在的圆角值
 */
export const forbiddenBorderRadius = [
  '4px', '6px', '8px', '10px', '12px',
  '0.25rem', '0.5rem', '0.75rem', '1rem',
  'border-radius: 4px',
  'border-radius: 8px'
]

/**
 * AI 常添加的边框样式（Figma 中通常无边框）
 */
export const forbiddenBorders = [
  '1px solid #e5e7eb',
  '1px solid #f3f4f6',
  '1px solid #d1d5db',
  '1px solid rgba(0, 0, 0, 0.1)',
  '1px solid rgba(0, 0, 0, 0.05)',
  '1px solid #e0e0e0',
  '1px solid #ddd',
  '2px solid'
]

/**
 * AI 常添加的颜色（Tailwind/Bootstrap 默认色板）
 */
export const forbiddenColors = {
  // Tailwind 默认灰蓝色
  tailwind: [
    '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af',
    '#6b7280', '#4b5563', '#374151', '#1f2937',
    '#111827', '#000000'
  ],
  // 常见的 AI 臆造颜色
  common: [
    '#ffffff', '#ffffff', // 白底配白字是 AI 幻觉
    '#f8f9fa', '#fafbfc', // 过于通用的背景色
    '#e9ecef', '#dee2e6', // Bootstrap 灰
    '#ced4da' // Bootstrap 灰
  ],
  // AI 偏爱的蓝紫色调
  bluePurple: [
    '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', // Tailwind blue
    '#6366f1', '#4f46e5', '#4338ca', '#3730a3', // Tailwind indigo
    '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', // Tailwind violet
    '#a855f7', '#9333ea', '#c084fc' // 紫色系
  ]
}

/**
 * AI 常添加的阴影样式（Figma 中通常无阴影）
 */
export const forbiddenShadows = [
  '0 1px 3px rgba(0, 0, 0, 0.1)',
  '0 1px 2px rgba(0, 0, 0, 0.05)',
  '0 4px 6px rgba(0, 0, 0, 0.1)',
  '0 2px 4px rgba(0, 0, 0, 0.06)',
  '0 10px 15px rgba(0, 0, 0, 0.1)',
  '0 20px 25px rgba(0, 0, 0, 0.1)',
  '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
  '0 3px 6px rgba(0, 0, 0, 0.15)',
  '0 2px 8px rgba(0, 0, 0, 0.1)',
  'box-shadow: 0',
  'shadow-md',
  'shadow-lg',
  'shadow-sm'
]

export default {
  forbiddenBorderRadius,
  forbiddenBorders,
  forbiddenColors,
  forbiddenShadows
}
