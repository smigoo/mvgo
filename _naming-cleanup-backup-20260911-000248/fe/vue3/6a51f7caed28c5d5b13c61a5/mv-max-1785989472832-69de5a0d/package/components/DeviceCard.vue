<template>
  <!-- 设备卡片子组件：展示单个设备的名称、状态数值、背景图、图标 -->
  <div
    class="mv3-mv-max-1785989472832-69de5a0d-device-card"
    :style="{ backgroundImage: bgSrc ? `url(${bgSrc})` : 'none' }"
  >
    <!-- 左侧图标区域：使用 img 渲染，flex-shrink: 0 防止压缩 -->
    <div class="device-card-icon-wrap">
      <img
        v-if="iconSrc"
        :src="iconSrc"
        class="device-card-icon"
        alt=""
      />
      <!-- 图标缺失时用 CSS 伪元素绘制占位图形 -->
      <div v-else class="device-card-icon-placeholder"></div>
    </div>

    <!-- 右侧文字区域：设备名称（上）+ 状态数值（下） -->
    <div class="device-card-text">
      <div class="device-card-name">{{ device.name }}</div>
      <div class="device-card-status">{{ device.status }}</div>
    </div>
  </div>
</template>

<script setup>
const bg9 = new URL('../../resources/images/bg-8439.png', import.meta.url).href
const bg20 = new URL('../../resources/images/bg-8759.png', import.meta.url).href
const icon5 = new URL('../../resources/images/icon-8444.png', import.meta.url).href
const icon16 = new URL('../../resources/images/icon-8764.png', import.meta.url).href
/**
 * DeviceCard 子组件
 * 功能：渲染单个设备监测卡片，包含背景图、图标、设备名称和运行状态数值
 * 数据来源：由主组件 index.vue 通过 props 传入 device 对象、背景图和图标变量
 * 关键交互：无，纯展示组件
 * 布局规则：CARD_LAYOUT — icon（左）+ 文字（右）→ flex-direction: row
 */

// #region 1. Props 定义
const props = defineProps({
  // 设备数据对象，包含 id / name / status 字段
  device: {
    type: Object,
    default: () => ({ id: 0, name: '', status: '' })
  },
  // 卡片背景图 URL（由主组件按 index 映射 bg9~bg20 注入）
  bgSrc: {
    type: String,
    default: ''
  },
  // 设备图标 URL（由主组件按 index 映射 icon5~icon16 注入）
  iconSrc: {
    type: String,
    default: ''
  }
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* ===== 设备卡片根容器 =====
 * 尺寸来自 Figma Group 节点：117×64px
 * 布局：CARD_LAYOUT → flex-direction: row（图标左、文字右）
 * 背景图由 :style 注入，background-size/position 需精确对应 117×64
 */
.mv3-mv-max-1785989472832-69de5a0d-device-card {
  display: flex;
  flex-direction: row; /* 图标在左，文字在右，符合 CARD_LAYOUT 规则 */
  align-items: center;
  gap: 8px;
  width: 117px;
  height: 64px;
  padding: 6px 8px;
  box-sizing: border-box;
  /* 背景图精确还原：卡片 bg 尺寸即为卡片本身大小，100%×100% 铺满 */
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: left top;
  overflow: hidden;
  flex-shrink: 0;
}

/* ===== 图标容器 =====
 * flex-shrink: 0 防止被右侧文字挤压
 * 宽度对应 Figma icon Group 宽度约 27px
 */
.device-card-icon-wrap {
  flex-shrink: 0;
  width: 27px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 图标 img：object-fit: contain 保持比例，不裁剪 */
.device-card-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 图标缺失占位符：用同色系 CSS 圆形代替 */
.device-card-icon-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4ba8fd 0%, #5db1fe 100%);
  opacity: 0.6;
}

/* ===== 文字区域 =====
 * 内部纵向堆叠：name（上）+ status（下）
 */
.device-card-text {
  display: flex;
  flex-direction: column; /* 文字区域内部纵向，符合 CARD_LAYOUT 规则 */
  gap: 4px;
  min-width: 0; /* 防止文字溢出撑破父容器 */
  flex: 1;
}

/* 设备名称：Source Han Sans CN 12px，浅色文字 */
.device-card-name {
  font-family: 'Source Han Sans CN', 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 设备状态数值：Roboto 16px，蓝白渐变高亮
 * 文本格式严格按 Figma：(2/484) 含括号和斜线，不简化
 */
.device-card-status {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 18.75px;
  /* 渐变文字效果，对应 Figma 数值节点填充 */
  background: linear-gradient(90deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
}</style>