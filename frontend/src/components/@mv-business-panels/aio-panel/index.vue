<template>
  <div class="pannel">
    <div class="pannel-header">
      <div class="pannel-header-title">{{ componentName }}</div>
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
  }
  .pannel-header-title {
    line-height: 38px;
    padding: 0 10px;
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
}
</style>
