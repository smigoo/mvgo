/**
 * 禁止样式配置
 * 定义不允许 AI 自动添加的常用样式
 */

export default {
  // 禁止的圆角值
  forbiddenBorderRadius: [
    '4px',
    '6px',
    '8px',
    '12px',
    '16px',
    '0.25rem',
    '0.5rem',
    '1rem'
  ],

  // 禁止的边框样式
  forbiddenBorders: [
    '1px solid #ccc',
    '1px solid #ddd',
    '1px solid #eee',
    '1px solid rgba(0,0,0,0.1)',
    '1px solid rgba(0,0,0,0.05)',
    'border: 1px solid'
  ],

  // AI 常用的颜色（禁止列表）
  forbiddenColors: {
    // Tailwind 默认色
    tailwind: [
      '#6366f1', // blue-500
      '#8b5cf6', // purple-500
      '#3b82f6', // sky-500
      '#a855f7', // violet-500
      '#ec4899', // pink-500
      '#f59e0b', // amber-500
      '#10b981', // emerald-500
      '#06b6d4'  // cyan-500
    ],

    // 常见的 AI 默认色
    common: [
      '#007bff', // Bootstrap blue
      '#6c757d', // Bootstrap gray
      '#28a745', // Bootstrap green
      '#dc3545', // Bootstrap red
      '#333333', // 常见深灰
      '#666666', // 常见中灰
      '#999999'  // 常见浅灰
    ],

    // 常见的蓝紫色系
    bluePurple: [
      '#667eea',
      '#764ba2',
      '#5e72e4',
      '#7367f0',
      '#6e8efb',
      '#5f72bd'
    ]
  },

  // 禁止的阴影
  forbiddenShadows: [
    '0 2px 4px rgba(0,0,0,0.1)',
    '0 4px 6px rgba(0,0,0,0.1)',
    '0 1px 3px rgba(0,0,0,0.12)',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.15)'
  ],

  // 允许的例外（即使不在 Figma 中也可以使用）
  allowedDefaults: {
    // 可以使用的默认圆角（如果明确需要）
    borderRadius: [],

    // 可以使用的微码规范颜色变量
    colors: [
      'var(--mc-color-primary)',
      'var(--mc-color-secondary)',
      'var(--mc-bg-color)',
      'var(--mc-text-color)'
    ]
  },

  // 警告阈值
  warningThreshold: {
    // 如果超过这个数量的"可疑样式"，发出警告
    suspiciousStylesCount: 3
  }
}
