/**
 * 资源路径验证器
 * 检查静态资源路径是否符合规范
 */

import { RuleValidator } from './rule-validator.js'

export class ResourcePathValidator extends RuleValidator {
  constructor() {
    super()
    this.registerResourcePathRules()
  }

  /**
   * 注册资源路径相关规则
   * @private
   */
  registerResourcePathRules() {
    // 规则 1: 图片必须使用 import 导入
    this.registerRule('image-import-required', {
      name: '图片必须使用 import',
      category: 'resource-path',
      level: 'L3',
      docRef: 'static-resource-handling.md#图片资源处理',
      stages: ['preview', 'figma'],
      check: (context) => {
        return !this.hasDirectImagePath(context.code)
      },
      message: '检测到直接使用图片路径（如 /assets/xxx.png），必须使用 import 导入'
    })

    // 规则 2: 图片导入必须带 ?url 后缀
    this.registerRule('image-url-suffix-required', {
      name: '图片导入必须带 ?url',
      category: 'resource-path',
      level: 'L3',
      docRef: 'static-resource-handling.md#Vite导入规则',
      stages: ['preview', 'figma'],
      check: (context) => {
        const hasImageImport = /import.*from.*\.(png|jpg|jpeg|gif|svg|webp)['"]/.test(context.code)
        if (!hasImageImport) return true

        return /import.*from.*\.(png|jpg|jpeg|gif|svg|webp)\?url['"]/.test(context.code)
      },
      message: '图片导入缺少 ?url 后缀，Vite 无法正确处理'
    })

    // 规则 3: 禁止使用 @ 别名
    this.registerRule('no-alias-import', {
      name: '禁止使用 @ 别名',
      category: 'resource-path',
      level: 'L3',
      docRef: 'static-resource-handling.md#路径别名规范',
      stages: ['preview', 'figma', 'req', 'req-s'],
      check: (context) => {
        return !/import.*from\s+['"]@\//.test(context.code)
      },
      message: '检测到 @ 别名使用，微码组件必须使用相对路径'
    })

    // 规则 4: 相对路径必须从当前目录开始
    this.registerRule('relative-path-from-current', {
      name: '相对路径必须规范',
      category: 'resource-path',
      level: 'L2',
      docRef: 'static-resource-handling.md#相对路径规范',
      stages: ['preview', 'figma', 'req', 'req-s'],
      check: (context) => {
        // 检查是否有 import ... from 'xxx' (没有 ./ 或 ../)
        const hasInvalidImport = /import.*from\s+['"]\w+/.test(context.code)
        // 排除 node_modules 包
        const isNodeModule = /import.*from\s+['"][a-z@]/.test(context.code)

        return !hasInvalidImport || isNodeModule
      },
      message: '相对路径导入缺少 ./ 或 ../ 前缀'
    })

    // 规则 5: SVG 图标应使用 ?raw 导入
    this.registerRule('svg-icon-raw-import', {
      name: 'SVG 图标应使用 ?raw',
      category: 'resource-path',
      level: 'L2',
      docRef: 'static-resource-handling.md#SVG处理规则',
      stages: ['preview', 'figma'],
      check: (context) => {
        const hasSvgImport = /import.*from.*\.svg['"]/.test(context.code)
        if (!hasSvgImport) return true

        // 如果是用于 v-html 或作为组件，应该使用 ?raw
        const usedAsHtml = /v-html=/.test(context.code)
        const hasSvgRaw = /import.*from.*\.svg\?raw['"]/.test(context.code)

        return !usedAsHtml || hasSvgRaw
      },
      message: 'SVG 用于 v-html 时应该使用 ?raw 导入获取源码'
    })

    // 规则 6: 禁止使用绝对路径
    this.registerRule('no-absolute-path', {
      name: '禁止使用绝对路径',
      category: 'resource-path',
      level: 'L3',
      docRef: 'static-resource-handling.md#路径规范',
      stages: ['preview', 'figma', 'req', 'req-s'],
      check: (context) => {
        // 检查是否有 /Users/, /home/, C:\ 等绝对路径
        return !/['"`](\/Users\/|\/home\/|[A-Z]:\\)/.test(context.code)
      },
      message: '检测到系统绝对路径，必须使用相对路径'
    })

    // 规则 7: 静态资源必须放在 assets 目录
    this.registerRule('assets-in-assets-dir', {
      name: '静态资源必须在 assets 目录',
      category: 'resource-path',
      level: 'L2',
      docRef: 'static-resource-handling.md#资源组织规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        const hasImageImport = /import.*from.*\.(png|jpg|jpeg|gif|svg|webp)/.test(context.code)
        if (!hasImageImport) return true

        return /import.*from.*['"]\.[\/]*assets\//.test(context.code)
      },
      message: '静态资源未放在 assets 目录，应该使用统一的资源目录'
    })

    // 规则 8: 禁止使用 public 目录
    this.registerRule('no-public-directory', {
      name: '禁止使用 public 目录',
      category: 'resource-path',
      level: 'L2',
      docRef: 'static-resource-handling.md#public目录使用限制',
      stages: ['preview', 'figma'],
      check: (context) => {
        return !/['"`]\/public\//.test(context.code)
      },
      message: '检测到 /public/ 路径，微码组件不应使用 public 目录'
    })
  }

  /**
   * 检查是否有直接使用的图片路径
   * @private
   */
  hasDirectImagePath(code) {
    // 检查 src="xxx.png" 或 :src="'xxx.png'" 而不是 :src="importedImage"
    const directPathPatterns = [
      /src=['"]\.\/.*\.(png|jpg|jpeg|gif|svg|webp)['"]/,
      /src=['"]\/assets\/.*\.(png|jpg|jpeg|gif|svg|webp)['"]/,
      /:src=['"]\.\/.*\.(png|jpg|jpeg|gif|svg|webp)['"]/
    ]

    return directPathPatterns.some(pattern => pattern.test(code))
  }
}
