<!--
 * @Description: 统一封装的Tooltip提示组件
 * @Author:李世萍
 * @Date: 2025-01-27
 * @LastEditors: 李世萍 1948906698@qq.com
 * @LastEditTime: 2025-09-04 20:35:32
 * @FilePath: \src\components\base-components\mc-tooltip\index.vue
-->
<template>
  <a-tooltip
    :title="title"
    :zIndex="zIndex"
    :align="{
      offset: [0, 5]
    }"
  >
    <div class="mv-tooltip-wrapper">
      <slot></slot>
    </div>
  </a-tooltip>
</template>

<script setup>
import { Tooltip as ATooltip } from 'ant-design-vue'

const componentProps = inject('componentProps')

const props = defineProps({
  tooltipKey: {
    type: String,
    default: ''
  },
  zIndex: {
    type: Number,
    default: 1000
  }
})
const title = computed(() => {
  return componentProps?.prompts?.[props?.tooltipKey]
})

defineOptions({
  name: 'McTooltip'
})
</script>

<style lang="less">
.ant-tooltip {
  .ant-tooltip-inner {
    font-size: 12px !important;
    text-align: center !important;
    height: 22px !important;
    line-height: 1 !important;
    min-height: auto !important;
    padding: 4px !important;
  }
}
</style>
