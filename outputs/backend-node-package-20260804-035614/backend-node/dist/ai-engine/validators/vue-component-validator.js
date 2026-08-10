/**
 * Vue 组件规范验证器
 * 检查 Vue 组件是否符合微码规范
 */

import { RuleValidator } from './rule-validator.js'

export class VueComponentValidator extends RuleValidator {
  constructor() {
    super()
    this.registerVueComponentRules()
  }

  /**
   * 注册 Vue 组件相关规则
   * @private
   */
  registerVueComponentRules() {
    // 规则 1: 必须使用 <script setup> 语法
    this.registerRule('vue-script-setup-required', {
      name: '必须使用 <script setup>',
      category: 'vue-component',
      level: 'L3',
      docRef: 'ai-generation-constraints.md#微码组件核心规范',
      stages: ['preview', 'figma', 'req', 'req-s'],
      check: (context) => {
        return /<script\s+setup/.test(context.code)
      },
      message: '组件未使用 <script setup> 语法，必须使用 Vue 3 Composition API'
    })

    // 规则 2: 必须调用 $mcComponentBuilder
    this.registerRule('mc-component-builder-required', {
      name: '必须调用 $mcComponentBuilder',
      category: 'vue-component',
      level: 'L3',
      docRef: 'ai-generation-constraints.md#微码组件核心规范',
      stages: ['preview', 'figma', 'req', 'req-s'],
      check: (context) => {
        return /\$mcComponentBuilder\s*\(/.test(context.code)
      },
      message: '组件未调用 $mcComponentBuilder()，无法注册为微码组件'
    })

    // 规则 3: 必须使用 <base-panel> 作为根容器
    this.registerRule('base-panel-required', {
      name: '必须使用 <base-panel>',
      category: 'vue-component',
      level: 'L3',
      docRef: 'ai-generation-constraints.md#微码组件核心规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        return /<base-panel/.test(context.code)
      },
      message: '组件未使用 <base-panel> 作为根容器'
    })

    // 规则 4: 禁止使用 Options API
    this.registerRule('no-options-api', {
      name: '禁止使用 Options API',
      category: 'vue-component',
      level: 'L3',
      docRef: 'ai-generation-constraints.md#微码组件核心规范',
      stages: ['preview', 'figma', 'req', 'req-s'],
      check: (context) => {
        return !this.usesOptionsApi(context.code)
      },
      message: '检测到 Options API 语法（data/methods/computed），必须使用 Composition API'
    })

    // 规则 5: 样式必须使用 scoped
    this.registerRule('style-scoped-required', {
      name: '样式必须使用 scoped',
      category: 'vue-component',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#样式隔离规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        const hasStyle = /<style/.test(context.code)
        if (!hasStyle) return true // 没有 style，规则不适用

        return /<style[^>]*scoped/.test(context.code)
      },
      message: '<style> 标签缺少 scoped 属性，可能导致样式污染'
    })

    // 规则 6: 样式必须使用 lang="less"
    this.registerRule('style-less-required', {
      name: '样式必须使用 Less',
      category: 'vue-component',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#样式语言规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        const hasStyle = /<style/.test(context.code)
        if (!hasStyle) return true

        return /<style[^>]*lang=['"]less['"]/.test(context.code)
      },
      message: '<style> 标签未指定 lang="less"'
    })

    // 规则 7: 禁止直接写内联样式
    this.registerRule('no-inline-styles', {
      name: '禁止过度使用内联样式',
      category: 'vue-component',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#样式编写规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        // 检查是否有过多的 style 属性（超过 5 个）
        const styleMatches = context.code.match(/\sstyle=/g)
        return !styleMatches || styleMatches.length <= 5
      },
      message: '检测到过多的内联样式（>5），应该使用 CSS 类'
    })

    // 规则 8: 组件必须有 name 属性
    this.registerRule('component-name-required', {
      name: '组件必须有 name',
      category: 'vue-component',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#组件命名规范',
      stages: ['preview', 'figma', 'req', 'req-s'],
      check: (context) => {
        return /name\s*:\s*['"]/.test(context.code)
      },
      message: '组件缺少 name 属性，调试时不便识别'
    })

    // 规则 9: 禁止使用 v-html（安全风险）
    this.registerRule('no-v-html', {
      name: '禁止使用 v-html',
      category: 'vue-component',
      level: 'L3',
      docRef: 'ai-generation-constraints.md#安全规范',
      stages: ['preview', 'figma', 'req', 'req-s'],
      check: (context) => {
        return !/v-html=/.test(context.code)
      },
      message: '检测到 v-html 使用，存在 XSS 安全风险'
    })

    // 规则 10: 响应式数据必须使用 ref/reactive
    this.registerRule('reactive-data-properly-defined', {
      name: '响应式数据必须正确定义',
      category: 'vue-component',
      level: 'L2',
      docRef: 'ai-generation-constraints.md#响应式数据规范',
      stages: ['req', 'req-s'],
      check: (context) => {
        // 检查是否有直接赋值的变量（可能忘记使用 ref/reactive）
        // 这是一个启发式检查，可能有误报
        return !this.hasUnreactiveData(context.code)
      },
      message: '检测到可能未使用 ref/reactive 的响应式数据'
    })
  }

  /**
   * 检查是否使用了 Options API
   * @private
   */
  usesOptionsApi(code) {
    // 检查常见的 Options API 特征
    const optionsApiPatterns = [
      /export\s+default\s+\{[^}]*data\s*\(/,
      /export\s+default\s+\{[^}]*methods\s*:/,
      /export\s+default\s+\{[^}]*computed\s*:/,
      /export\s+default\s+\{[^}]*watch\s*:/
    ]

    return optionsApiPatterns.some(pattern => pattern.test(code))
  }

  /**
   * 检查是否有非响应式数据
   * @private
   */
  hasUnreactiveData(code) {
    // 这是一个简化的检查，检测 let/const 变量可能需要是响应式的
    // 检查是否有 let xxx = 但没有对应的 ref()
    const letVarPattern = /let\s+(\w+)\s*=\s*(?!ref\(|reactive\(|computed\()/g
    const matches = code.match(letVarPattern)

    if (!matches) return false

    // 排除一些明显不需要响应式的变量
    const excludePatterns = [
      /let\s+\w+\s*=\s*props\./,
      /let\s+\w+\s*=\s*\w+\.value/,
      /let\s+\w+\s*=\s*['"`]/,  // 字符串字面量
      /let\s+\w+\s*=\s*\d+/,     // 数字字面量
      /let\s+\w+\s*=\s*(true|false)/  // 布尔字面量
    ]

    return matches.some(match =>
      !excludePatterns.some(exclude => exclude.test(match))
    )
  }
}
