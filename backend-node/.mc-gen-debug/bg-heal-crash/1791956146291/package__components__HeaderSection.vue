<template>
  <div data-section-id="27:795" class="c-component-header" style="display:flex;flex-direction:row;align-items:center;">
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
    <img :src="icon1" class="c-component-header-close" alt="关闭" title="关闭" style="width:18px;height:18px;object-fit:contain" />
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/Frame-797.png'


// 资源变量由系统自动注入，无需手写 import
defineProps({
  businessConfig: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['close'])

const handleClose = () => {
  emit('close')
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-component-header {  display: flex;
  flex-direction: row;
  width: 100%;

  min-height: 0;
}

.c-component-header-title {
  font-size: 18px;
  font-weight: @fontWeightStrong;
  color: @color-text-base;
  line-height: 27px;
  white-space: nowrap;
}

.c-component-header-close {
  cursor: pointer;
  object-fit: contain;
}
</style>
