/**
 * 符合微码规范的组件模板生成器
 * 修复 P1 问题：
 * 1. 正确调用 $mcComponentBuilder() 并解构
 * 2. 添加 onload 事件触发
 * 3. componentName 使用中文（从节点名称提取）
 * 4. 不生成面板标题（由 base-panel 自动处理）
 */

/**
 * 生成符合规范的 Vue 组件代码
 * @param {Object} options - 组件配置
 * @param {string} options.componentId - 组件 ID（kebab-case）
 * @param {string} options.componentName - 组件中文名称
 * @param {string} options.nodeData - Figma 节点数据
 * @param {Object} options.styles - 样式信息
 * @returns {string} Vue 组件代码
 */
export function generateComponentCode({ componentId, componentName, nodeData, styles }) {
  // 提取颜色值
  const bgColor = styles.fills[0]?.color || 'rgba(255, 255, 255, 1)'
  const borderRadius = styles.cornerRadius || 0

  return `<template>
  <!-- ✅ base-panel 使用字符串字面量 panelKey -->
  <base-panel panelKey="default-panel">
    <div
      class="container"
      :style="{
        width: '100%',
        height: '100%',
        background: bgColor,
        borderRadius: borderRadius
      }"
    >
      <!-- ✅ 不生成组件标题，由 base-panel 根据 declare.json.componentName 自动显示 -->
      <div class="content">
        <!-- 组件内容 -->
        <slot></slot>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// 使用 defineProps 提供默认值
const props = defineProps({
  cssVars: {
    type: Object,
    default: () => ({
      bgColor: '${bgColor}',
      borderRadius: '${borderRadius}px'
    })
  }
})

// 使用默认值解构
const {
  bgColor = '${bgColor}',
  borderRadius = '${borderRadius}px'
} = props.cssVars || {}

// ✅ 正确调用 $mcComponentBuilder() 并解构
const { runtimeBuilder } = $mcComponentBuilder()

// ✅ 添加 onload 事件触发函数
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('${componentId}-onload', {
    componentId: '${componentId}',
    timestamp: Date.now()
  })
}

// ✅ 在 onMounted 中触发 onload 事件
onMounted(() => {
  emitLoadEvent()
})
</script>

<style scoped lang="less">
@import '../resources/styles/index.less';
</style>
`
}

/**
 * 生成符合规范的 declare.json
 * @param {Object} options - 组件配置
 * @param {string} options.componentId - 组件 ID
 * @param {string} options.componentName - 组件中文名称
 * @param {string} options.nodeData - Figma 节点数据
 * @returns {Object} declare.json 对象
 */
export function generateDeclareJson({ componentId, componentName, nodeData, backgroundBrightness }) {
  // 从Figma节点数据中提取真实宽高比例
  let aspectRatio = [16, 9] // 默认值
  let size = null // 原始尺寸（供预览页按实际宽高渲染，避免 aspectRatio 丢失精度导致变形）

  if (nodeData && nodeData.absoluteBoundingBox) {
    const width = Math.round(nodeData.absoluteBoundingBox.width)
    const height = Math.round(nodeData.absoluteBoundingBox.height)

    if (width > 0 && height > 0) {
      // 保存原始尺寸
      size = { width, height }

      // 计算最大公约数，简化比例
      const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
      const divisor = gcd(width, height)
      aspectRatio = [width / divisor, height / divisor]

      // 如果比例过大（如100:67），尝试约分到更简洁的比例
      if (aspectRatio[0] > 50 || aspectRatio[1] > 50) {
        const scale = Math.max(aspectRatio[0], aspectRatio[1]) / 16
        aspectRatio = [
          Math.round(aspectRatio[0] / scale),
          Math.round(aspectRatio[1] / scale)
        ]
      }
    }
  }

  const result = {
    componentId,
    componentName,
    version: 'v1.0.0',
    // Figma 原始尺寸 — 预览页读此字段按实际宽高渲染，避免仅靠 aspectRatio 简比丢失精度
    ...(size ? { size } : {}),
    attribute: {
      imgUrl: null,
      aspectRatio,
      title: componentName,
      description: componentName
    },
    businessEvents: {
      [`${componentId}-onload`]: {
        eventId: `${componentId}-onload`,
        eventName: '组件加载完成',
        eventDataSchema: {
          componentId: {
            key: 'componentId',
            name: '组件ID',
            type: 'string',
            required: true
          },
          timestamp: {
            key: 'timestamp',
            name: '时间戳',
            type: 'number',
            required: true
          }
        }
      }
    },
    businessStatuses: {},
    dataSources: null,
    formSources: null,
    layoutConfig: {
      default: 'one',
      list: [
        {
          name: '默认布局',
          key: 'one',
          previewName: 'mc-preview.png'
        }
      ]
    },
    themeConfig: {
      default: (backgroundBrightness === 'light' ? 'light' : 'dark'),
      list: [
        {
          name: '浅色主题',
          key: 'light'
        },
        {
          name: '深色主题',
          key: 'dark'
        }
      ]
    },
    cssVariableConfig: []
  }
  return result
}

/**
 * 从节点名称提取中文标题
 * @param {string} nodeName - Figma 节点名称
 * @returns {string} 提取的中文标题
 */
export function extractChineseTitle(nodeName) {
  // 提取中文字符
  const chineseMatch = nodeName.match(/[一-龥]+/g)

  if (chineseMatch && chineseMatch.length > 0) {
    // 返回第一段中文（通常是主标题）
    return chineseMatch[0]
  }

  // 如果没有中文，返回原始名称（警告：不符合规范）
  console.warn(`⚠️  节点名称 "${nodeName}" 中未找到中文，建议手动设置 componentName`)
  return nodeName
}

/**
 * 生成组件 ID（kebab-case）
 * @param {string} nodeName - Figma 节点名称
 * @returns {string} 组件 ID
 */
export function generateComponentId(nodeName) {
  return nodeName
    .replace(/[^a-zA-Z0-9一-龥]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}
