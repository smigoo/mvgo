/**
 * Figma 样式提取器
 * 从 Figma 节点提取样式属性并转换为 CSS 格式
 */

import {
  isTechStackNode,
  needsDeepStyles,
  extractVisualContainerStyles,
} from '../../utils/tech-stack-style-extractor.js';

export class FigmaStyleExtractor {
  /**
   * 提取完整样式
   * @param {Object} figmaNode - Figma 节点数据
   * @returns {Object} 提取的样式数据
   */
  extractStyles(figmaNode) {
    // 🆕 技术栈节点：只提取视觉容器样式，不深入子节点
    if (isTechStackNode(figmaNode.name)) {
      return {
        isTechStackNode: true,
        techStackHint: figmaNode.name,
        containerStyles: extractVisualContainerStyles(figmaNode),
        needsDeepStyles: needsDeepStyles(figmaNode.name),
      };
    }

    // 常规节点：提取完整样式
    return {
      isTechStackNode: false,
      colors: this.extractColors(figmaNode),
      typography: this.extractTypography(figmaNode),
      effects: this.extractEffects(figmaNode),
      layout: this.extractLayout(figmaNode),
      spacing: this.extractSpacing(figmaNode),
      borders: this.extractBorders(figmaNode),
    };
  }

  /**
   * 提取颜色
   */
  extractColors(node) {
    const colors = {};

    // 填充色
    if (node.fills && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.type === 'SOLID' && fill.visible !== false) {
        colors.background = this.rgbaToCSS(fill.color, fill.opacity);
      }
    }

    // 描边色
    if (node.strokes && node.strokes.length > 0) {
      const stroke = node.strokes[0];
      if (stroke.type === 'SOLID' && stroke.visible !== false) {
        colors.border = this.rgbaToCSS(stroke.color, stroke.opacity);
      }
    }

    return colors;
  }

  /**
   * 提取字体样式
   */
  extractTypography(node) {
    if (node.type !== 'TEXT') return {};

    const style = node.style || {};
    const typography = {};

    if (style.fontFamily) typography.fontFamily = style.fontFamily;
    if (style.fontSize) typography.fontSize = `${style.fontSize}px`;
    if (style.fontWeight) typography.fontWeight = style.fontWeight;

    if (style.lineHeightPx) {
      typography.lineHeight = `${style.lineHeightPx}px`;
    } else if (style.lineHeightPercent) {
      typography.lineHeight = `${style.lineHeightPercent}%`;
    }

    if (style.letterSpacing) {
      typography.letterSpacing = `${style.letterSpacing}px`;
    }

    if (style.textAlignHorizontal) {
      typography.textAlign = style.textAlignHorizontal.toLowerCase();
    }

    return typography;
  }

  /**
   * 提取效果（阴影、模糊等）
   */
  extractEffects(node) {
    const effects = [];

    if (!node.effects || node.effects.length === 0) return effects;

    for (const effect of node.effects) {
      if (!effect.visible) continue;

      if (effect.type === 'DROP_SHADOW') {
        effects.push({
          type: 'box-shadow',
          value: `${effect.offset.x}px ${effect.offset.y}px ${effect.radius}px ${this.rgbaToCSS(effect.color)}`,
        });
      } else if (effect.type === 'INNER_SHADOW') {
        effects.push({
          type: 'box-shadow',
          value: `inset ${effect.offset.x}px ${effect.offset.y}px ${effect.radius}px ${this.rgbaToCSS(effect.color)}`,
        });
      }
    }

    return effects;
  }

  /**
   * 提取布局信息
   */
  extractLayout(node) {
    const layout = {};

    // 尺寸
    if (node.absoluteBoundingBox) {
      layout.width = node.absoluteBoundingBox.width;
      layout.height = node.absoluteBoundingBox.height;
    }

    // Auto Layout
    if (node.layoutMode) {
      layout.display = 'flex';
      layout.flexDirection =
        node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';

      // 主轴对齐
      if (node.primaryAxisAlignItems) {
        layout.justifyContent = this.mapFigmaAlignment(
          node.primaryAxisAlignItems,
        );
      }

      // 交叉轴对齐
      if (node.counterAxisAlignItems) {
        layout.alignItems = this.mapFigmaAlignment(node.counterAxisAlignItems);
      }

      // 间距
      if (node.itemSpacing !== undefined) {
        layout.gap = `${node.itemSpacing}px`;
      }
    }

    // 圆角
    if (node.cornerRadius !== undefined) {
      layout.borderRadius = `${node.cornerRadius}px`;
    } else if (node.rectangleCornerRadii) {
      // 单独设置的圆角
      const radii = node.rectangleCornerRadii;
      layout.borderRadius = `${radii[0]}px ${radii[1]}px ${radii[2]}px ${radii[3]}px`;
    }

    return layout;
  }

  /**
   * 提取间距
   */
  extractSpacing(node) {
    const spacing = {};

    if (node.paddingLeft !== undefined)
      spacing.paddingLeft = `${node.paddingLeft}px`;
    if (node.paddingRight !== undefined)
      spacing.paddingRight = `${node.paddingRight}px`;
    if (node.paddingTop !== undefined)
      spacing.paddingTop = `${node.paddingTop}px`;
    if (node.paddingBottom !== undefined)
      spacing.paddingBottom = `${node.paddingBottom}px`;

    return spacing;
  }

  /**
   * 提取边框
   */
  extractBorders(node) {
    const borders = {};

    if (node.strokeWeight !== undefined) {
      borders.borderWidth = `${node.strokeWeight}px`;
    }

    if (node.strokes && node.strokes.length > 0) {
      const stroke = node.strokes[0];
      if (stroke.type === 'SOLID') {
        borders.borderStyle = 'solid';
        borders.borderColor = this.rgbaToCSS(stroke.color, stroke.opacity);
      }
    }

    return borders;
  }

  /**
   * Figma RGBA 转 CSS 颜色
   */
  rgbaToCSS(color, opacity = 1) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a =
      opacity !== undefined ? opacity : color.a !== undefined ? color.a : 1;

    if (a === 1) {
      return `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}`;
    } else {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }

  /**
   * 数字转16进制
   */
  toHex(value) {
    return value.toString(16).padStart(2, '0');
  }

  /**
   * Figma 对齐方式映射到 CSS
   */
  mapFigmaAlignment(alignment) {
    const map = {
      MIN: 'flex-start',
      CENTER: 'center',
      MAX: 'flex-end',
      SPACE_BETWEEN: 'space-between',
      SPACE_AROUND: 'space-around',
    };
    return map[alignment] || 'flex-start';
  }
}
