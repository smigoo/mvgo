/**
 * 主题和 CSS 变量验证器
 * 检查主题变量使用是否符合规范
 */

import { RuleValidator } from './rule-validator.js'

export class ThemeValidator extends RuleValidator {
  constructor() {
    super()
    this.registerThemeRules()
  }

  /**
   * 注册主题相关规则
   * @private
   */
  registerThemeRules() {
    // 规则 1: 必须使用 props.cssVars
    this.registerRule('css-vars-required', {
      name: '必须使用 props.cssVars',
      category: 'theme',
      level: 'L3',
      docRef: 'ai-generation-constraints.md#主题变量规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        // 如果有颜色使用，必须通过 props.cssVars
        const hasColors = /#[0-9a-fA-F]{6}|rgba?\(/.test(context.code)
        if (!hasColors) return true

        return /props\.cssVars/.test(context.code)
      },
      message: '组件使用了颜色但未通过 props.cssVars，无法支持主题切换'
    })

    // 规则 2: 禁止硬编码颜色值
    this.registerRule('no-hardcoded-colors', {
      name: '禁止硬编码颜色',
      category: 'theme',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#颜色使用规范',
      stages: ['preview'],
      check: (context) => {
        // 允许 Figma 阶段硬编码（因为要从 Figma 提取）
        if (context.stage === 'figma') return true

        // 检查是否有硬编码颜色（带注释的除外）
        return !this.hasHardcodedColorsWithoutComment(context.code)
      },
      message: '检测到硬编码颜色值，应该使用 props.cssVars 中的主题变量'
    })

    // 规则 3: CSS 变量必须正确解构
    this.registerRule('css-vars-destructure', {
      name: 'CSS 变量必须正确解构',
      category: 'theme',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#CSS变量解构规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        const usesCssVars = /props\.cssVars/.test(context.code)
        if (!usesCssVars) return true

        // 检查是否正确解构
        return /const\s+\{[^}]*\}\s*=\s*props\.cssVars/.test(context.code) ||
               /const\s+cssVars\s*=\s*props\.cssVars/.test(context.code)
      },
      message: 'props.cssVars 应该在 <script setup> 中解构或赋值给局部变量'
    })

    // 规则 4: 主题变量命名必须规范
    this.registerRule('theme-var-naming', {
      name: '主题变量命名必须规范',
      category: 'theme',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#主题变量命名规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        // 检查是否使用了不规范的变量名
        const invalidNames = [
          'color1', 'color2', 'bgColor', 'textColor',
          'primaryColor', 'secondaryColor'
        ]

        return !invalidNames.some(name =>
          new RegExp(`cssVars\\.${name}`).test(context.code)
        )
      },
      message: '检测到不规范的主题变量名，应该使用语义化命名（如 titleColor, valueColor）'
    })

    // 规则 5: 透明度必须单独控制
    this.registerRule('opacity-separate-control', {
      name: '透明度必须单独控制',
      category: 'theme',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#透明度控制规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        // 检查是否有 rgba 颜色但没有对应的透明度变量
        const hasRgba = /rgba?\([^)]*,\s*0\.\d+\)/.test(context.code)
        if (!hasRgba) return true

        // 应该有对应的 opacity 变量
        return /cssVars\.\w*[Oo]pacity/.test(context.code)
      },
      message: '检测到硬编码的透明度值，应该使用独立的 opacity 变量'
    })

    // 规则 6: 禁止使用 CSS 原生变量语法
    this.registerRule('no-css-var-syntax', {
      name: '禁止使用 var(--xxx) 语法',
      category: 'theme',
      level: 'L3',
      docRef: 'ai-generation-constraints.md#CSS变量使用方式',
      stages: ['preview', 'figma'],
      check: (context) => {
        return !/var\(--/.test(context.code)
      },
      message: '检测到 var(--xxx) 语法，微码组件必须使用 props.cssVars 对象'
    })

    // 规则 7: 主题变量必须有默认值
    this.registerRule('theme-var-default-value', {
      name: '主题变量必须有默认值',
      category: 'theme',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#主题变量默认值',
      stages: ['preview', 'figma'],
      check: (context) => {
        const usesCssVars = /props\.cssVars/.test(context.code)
        if (!usesCssVars) return true

        // 检查是否有默认值处理（如 || '#1990FF'）
        return /cssVars\.\w+\s*\|\|/.test(context.code) ||
               /withDefaults\(/.test(context.code)
      },
      message: '主题变量缺少默认值，应该使用 || 或 withDefaults 提供回退'
    })

    // 规则 8: 渐变色必须使用专用变量
    this.registerRule('gradient-dedicated-var', {
      name: '渐变色必须使用专用变量',
      category: 'theme',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#渐变色处理',
      stages: ['preview', 'figma'],
      check: (context) => {
        const hasGradient = /linear-gradient|radial-gradient/.test(context.code)
        if (!hasGradient) return true

        // 应该有对应的 gradient 变量
        return /cssVars\.\w*[Gg]radient/.test(context.code)
      },
      message: '检测到渐变色但未使用专用变量，应该定义 xxxGradient 变量'
    })
  }

  /**
   * 检查是否有没有注释的硬编码颜色
   * @private
   */
  hasHardcodedColorsWithoutComment(code) {
    // 检查颜色值（hex 或 rgba）是否有 Figma 注释
    const colorPatterns = [
      /#[0-9a-fA-F]{6}(?!\s*\/\*\s*Figma)/g,
      /rgba?\([^)]+\)(?!\s*\/\*\s*Figma)/g
    ]

    return colorPatterns.some(pattern => {
      const matches = code.match(pattern)
      return matches && matches.length > 0
    })
  }
}
