<template>
  <div class="pannel">
    <div class="header-icon" v-if="isShowClose" @click="close">
      <CloseOutlined />
    </div>
    <div class="pannel-content" id="pannel-content">
      <slot></slot>
    </div>
  </div>
</template>
<script setup>
import { CloseOutlined } from '@ant-design/icons-vue'
import { computed, onMounted } from 'vue'
const basePanelProp = inject('basePanelProp')
const props = defineProps({
  // 组件名称
  componentName: {
    type: String
  },
  // 组件类型
  type: {
    type: String,
    default: 'component'
  },
  showClose: {
    type: Boolean,
    default: false
  }
})
const isShowClose = computed(() => {
  return props.showClose
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
  // background: rgba(237, 244, 251, 0.7);
  // box-shadow: 0px 4px 10px 0px rgba(74, 117, 141, 0.25);
  .pannel-content {
    height: 100%;
    // padding: 5px 10px 5px 10px;
    flex: 1;
  }
  .header-icon {
    position: absolute;
    right: 10px;
  }
}
</style>
