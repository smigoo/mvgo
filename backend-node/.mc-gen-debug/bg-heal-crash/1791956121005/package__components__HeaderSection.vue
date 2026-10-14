<template>
  <div class="c-component-header">
    <span class="c-component-header-title">新增产品</span>
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

.c-component-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 27px;
  min-height: 0;
  box-sizing: border-box;
}

.c-component-header-title {
  font-size: 18px;
  font-weight: @fontWeightStrong;
  color: @color-text-base;
  line-height: 27px;
  white-space: nowrap;
}

.c-component-header-close {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
  object-fit: contain;
}
</style>
