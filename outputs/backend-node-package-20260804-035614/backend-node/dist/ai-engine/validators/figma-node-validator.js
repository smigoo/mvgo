/**
 * Figma 节点验证器
 * 检查 Figma 节点处理是否符合规范
 */

import { RuleValidator } from './rule-validator.js'

export class FigmaNodeValidator extends RuleValidator {
  constructor() {
    super()
    this.registerFigmaNodeRules()
  }

  /**
   * 注册 Figma 节点相关规则
   * @private
   */
  registerFigmaNodeRules() {
    // 规则 1: bg 节点不应生成独立 DOM 元素
    this.registerRule('bg-no-dom-element', {
      name: 'bg 节点不应生成独立 DOM',
      category: 'figma-node',
      level: 'L3',
      docRef: 'figma-node-rules.md#容器型bg节点',
      stages: ['figma'],
      check: (context) => {
        return !this.hasBgDomElement(context.code)
      },
      message: '检测到独立的 bg DOM 元素，容器型 bg 应该作为父容器的 CSS background'
    })

    // 规则 2: 背景图必须设置 backgroundSize
    this.registerRule('bg-background-size-required', {
      name: '背景图必须设置 backgroundSize',
      category: 'figma-node',
      level: 'L2',
      docRef: 'figma-node-rules.md#backgroundSize精确计算规则',
      stages: ['figma'],
      check: (context) => {
        return this.hasBackgroundSizeWithImage(context.code)
      },
      message: '背景图缺少 backgroundSize 设置，可能导致显示不正确'
    })

    // 规则 3: 背景图不应使用 img 标签
    this.registerRule('bg-no-img-tag', {
      name: '背景图不应使用 img 标签',
      category: 'figma-node',
      level: 'L3',
      docRef: 'figma-node-rules.md#背景图使用规范',
      stages: ['figma'],
      check: (context) => {
        return !this.hasBgAsImgTag(context.code)
      },
      message: '检测到背景图使用 img 标签，应该使用 CSS background-image'
    })

    // 规则 4: 背景图不应添加 opacity
    this.registerRule('bg-no-opacity', {
      name: '背景图不应降低透明度',
      category: 'figma-node',
      level: 'L2',
      docRef: 'figma-node-rules.md#背景图必须完整显示',
      stages: ['figma'],
      check: (context) => {
        return !this.hasBgOpacity(context.code)
      },
      message: '检测到背景图设置了 opacity，背景图应该原样显示'
    })

    // 规则 5: 圆角必须来自 Figma 数据
    this.registerRule('border-radius-from-figma', {
      name: '圆角必须来自 Figma',
      category: 'figma-node',
      level: 'L2',
      docRef: 'figma-node-rules.md#圆角精确还原',
      stages: ['figma'],
      check: (context) => {
        // 检查是否有常见的默认圆角值（8px, 4px, 0.5rem）
        const hasDefaultRadius = /border-radius\s*:\s*(8px|4px|0\.5rem)(?!\s*\/\*\s*Figma)/.test(context.code)
        return !hasDefaultRadius
      },
      message: '检测到默认圆角值（8px/4px/0.5rem），圆角必须来自 Figma cornerRadius 数据'
    })

    // 规则 6: 图片尺寸必须来自 Figma
    this.registerRule('image-size-from-figma', {
      name: '图片尺寸必须来自 Figma',
      category: 'figma-node',
      level: 'L2',
      docRef: 'figma-node-rules.md#image节点处理规则',
      stages: ['figma'],
      check: (context) => {
        // 检查是否有图片尺寸且带有 Figma 注释
        const hasImageSize = /width\s*:\s*\d+px.*\/\*\s*Figma/.test(context.code)
        const hasImageWithoutComment = /\.(image|icon|img).*\{[^}]*width\s*:\s*\d+px(?![^}]*\/\*\s*Figma)/.test(context.code)

        if (hasImageWithoutComment) {
          return false
        }
        return true
      },
      message: '图片尺寸缺少 Figma 来源注释，应该添加 /* Figma X:YYYY: fieldName */ 注释'
    })

    // 规则 7: 颜色必须精确提取
    this.registerRule('color-precise-extraction', {
      name: '颜色必须精确提取',
      category: 'figma-node',
      level: 'L2',
      docRef: 'figma-node-rules.md#Figma颜色精确提取规则',
      stages: ['figma'],
      check: (context) => {
        // 检查是否有近似颜色值（如 #3b7fe6 代替 #1990FF）
        // 这个检查比较复杂，需要实际的 Figma 数据对比
        // 这里只做基本检查：是否有颜色注释
        const hasColorWithComment = /color\s*:\s*#[0-9a-fA-F]{6}.*\/\*\s*Figma/.test(context.code)
        return hasColorWithComment || !this.hasHardcodedColors(context.code)
      },
      message: '颜色值缺少 Figma 来源注释或使用了近似值'
    })

    // 规则 8: 不应添加无证据的装饰样式
    this.registerRule('no-fabricated-styles', {
      name: '禁止臆造装饰样式',
      category: 'figma-node',
      level: 'L3',
      docRef: 'figma-node-rules.md#零臆造原则',
      stages: ['figma'],
      check: (context) => {
        // 检查是否有常见的"卡片模板"组合
        return !this.hasCardTemplate(context.code)
      },
      message: '检测到"卡片模板"组合（flex + center + gap + padding + border-radius），可能是 AI 臆造的样式'
    })
  }

  /**
   * 检查是否有独立的 bg DOM 元素
   * @private
   */
  hasBgDomElement(code) {
    // 检查是否有 class="bg" 或 class="xxx-bg" 的独立 div
    const bgClassPattern = /<div[^>]*class=['"][^'"]*\b(bg|.*-bg)\b[^'"]*['"][^>]*>/
    const bgDivPattern = /<div[^>]*class=['"]bg['"][^>]*>/

    return bgClassPattern.test(code) || bgDivPattern.test(code)
  }

  /**
   * 检查背景图是否设置了 backgroundSize
   * @private
   */
  hasBackgroundSizeWithImage(code) {
    // 如果有 backgroundImage，必须也有 backgroundSize
    const hasBackgroundImage = /backgroundImage\s*:\s*`url\(/.test(code)

    if (!hasBackgroundImage) {
      return true // 没有背景图，规则不适用
    }

    const hasBackgroundSize = /backgroundSize\s*:\s*['"`]/.test(code)
    return hasBackgroundSize
  }

  /**
   * 检查背景图是否错误使用 img 标签
   * @private
   */
  hasBgAsImgTag(code) {
    // 检查是否有 src={bg} 或 :src="bg" 的 img 标签
    const bgVarPattern = /(bg|background|bgImage)/i
    const imgPattern = /<img[^>]*(src=|:src=)["']?\{?/

    // 简单检查：如果有 bg 相关的 img 标签
    return /import.*from.*\/(bg-|slot-|frame-).*\.png/.test(code) &&
           /<img[^>]*src=.*bg/.test(code)
  }

  /**
   * 检查背景图是否设置了 opacity
   * @private
   */
  hasBgOpacity(code) {
    // 检查是否有背景相关的 opacity 设置
    return /\.(bg|background).*\{[^}]*opacity\s*:\s*0\.\d+/.test(code)
  }

  /**
   * 检查是否有硬编码颜色
   * @private
   */
  hasHardcodedColors(code) {
    // 检查是否有没有注释的颜色值
    const colorPattern = /(color|background|border-color)\s*:\s*#[0-9a-fA-F]{6}(?!\s*\/\*)/
    return colorPattern.test(code)
  }

  /**
   * 检查是否有卡片模板
   * @private
   */
  hasCardTemplate(code) {
    // 检查是否同时存在这些属性组合
    const hasFlexCenter = /display\s*:\s*flex.*align-items\s*:\s*center/s.test(code)
    const hasGapPadding = /gap\s*:\s*1rem.*padding\s*:\s*1rem/s.test(code)
    const hasBorderRadius = /border-radius\s*:\s*0\.5rem/.test(code)

    // 如果同时存在这些特征，可能是卡片模板
    return hasFlexCenter && hasGapPadding && hasBorderRadius
  }
}
