<template>
  <div class="pannel">
    <div class="pannel-header">
      <div class="pannel-header-title">{{ componentName }}</div>
      <!-- 🛡️ 2026-09-30（f8116aa6）：补齐头部插槽出口——此前 aio-panel 无任何 header 插槽，
           产物经管线注入 #header-right 的 HeaderSection 无出口整块消失（对照组 default-panel 有 4 处插槽出口）。
           flex 布局：标题左、插槽右，避免 absolute 覆盖标题 -->
      <div
        class="pannel-header-right"
        v-if="slot['title-left'] || slot['title-right'] || slot['header-right']"
      >
        <slot name="title-left"></slot>
        <slot name="title-right"></slot>
        <slot name="header-right"></slot>
      </div>
      <div class="pannel-header-icon" v-if="type === 'dynamic-component'" @click="close">
        <CloseOutlined />
      </div>
    </div>
    <div class="pannel-content" id="pannel-content">
      <slot></slot>
    </div>
  </div>
</template>
<script setup>
import { CloseOutlined } from '@ant-design/icons-vue'
const basePanelProp = inject('basePanelProp')
const slot = defineSlots()
defineProps({
  // 组件名称
  componentName: {
    type: String
  },
  // 组件类型
  type: {
    type: String,
    default: 'component'
  }
})
// 关闭弹框方法
const close = () => {
  basePanelProp.close()
}
</script>
<style lang="less" scoped>
// 面板通用样式
.pannel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #424242;
  border: 1px solid #383838;
  border-radius: var(--radius-xs) var(--radius-xs) 0px 0px;
  font-size: 14px;
  .pannel-header {
    width: 100%;
    height: 38px;
    color: var(--text-inverse);
    position: relative;
    display: flex;
    align-items: center;
  }
  .pannel-header-title {
    line-height: 38px;
    padding: 0 10px;
    flex-shrink: 0;
    /* 🛡️ f8116aa6：HeaderSection 的头部背景带是整行真值（铺满行），标题浮于其上 */
    position: relative;
    z-index: 1;
  }

  .pannel-content {
    height: calc(100% - 38px);
    background-color: #535353;
  }
  .pannel-header-icon {
    position: absolute;
    right: 10px;
    top: 10px;
    color: var(--text-inverse);
    cursor: pointer;
  }
  .pannel-header-right {
    /* 🛡️ f8116aa6：铺满 header 行——产物 HeaderSection 的背景带是整行 Figma 真值（460px），
       非全行容器会被压缩/溢出错位（标签压标题实锤） */
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    min-width: 0;
  }
}
</style>
