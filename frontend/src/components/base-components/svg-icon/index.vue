<template>
  <div
    v-if="isOnlineSvg"
    :style="{ '--svg-icon-url': `url(${svgUrl})` }"
    class="svg-icon svg-icon-online"
    :class="className"
  />
  <!-- <svg v-else class="svg-icon" :class="className" aria-hidden="true">
    <use :xlink:href="`#icon-${iconClass}`" />
  </svg> -->
  <svg v-else :class="'i-svg:' + iconClass"></svg>
</template>

<script setup>
import { computed } from 'vue'
const svgUrl = computed(() => {
  if (/^(https?:)/.test(props.iconClass)) {
    return props.iconClass
  } else {
    return (window?.__WUJIE_PUBLIC_PATH__ || '') + props.iconClass
  }
})
const props = defineProps({
  // SVG 图标名称或在线URL
  iconClass: {
    type: String,
    required: true
  },
  // 图标类名
  className: {
    type: String,
    default: ''
  },
  rotate: Number
})
// 检验svg名称是http 或者 https 或者 以 / 开头
const isOnlineSvg = computed(
  () => /^(https?:)/.test(props.iconClass) || props.iconClass.includes('/')
)
</script>

<style scoped lang="less">
.svg-icon {
  width: 1em;
  height: 1em;
  fill: currentColor;
  overflow: hidden;
  vertical-align: -0.125em;
}

.svg-icon-online {
  background-color: currentColor;
  mask-image: var(--svg-icon-url);
  -webkit-mask-image: var(--svg-icon-url);
  mask-size: contain;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  display: inline-block;
}
</style>
