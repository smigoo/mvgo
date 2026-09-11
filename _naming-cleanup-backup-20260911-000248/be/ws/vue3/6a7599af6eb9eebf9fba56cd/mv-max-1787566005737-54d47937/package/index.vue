<template>
  <div class="mc-demo">
    <div class="mc-demo__card">
      <div class="mc-demo__header">
        <h3 class="mc-demo__title">{{ componentProps.title || '微码组件示例' }}</h3>
        <span class="mc-demo__badge">{{ componentProps.badge || 'NEW' }}</span>
      </div>
      <p class="mc-demo__desc">{{ businessProps.description || '这是一个基于微码构建器的示例组件。' }}</p>
      <button class="mc-demo__btn" @click="handleClick">点击交互</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const handleClick = () => {
  runtimeBuilder.publishEvent('McDemo-click', {
    value: businessProps.clickCount || 0,
    timestamp: Date.now(),
  })
}

onMounted(() => {
  runtimeBuilder.publishEvent('McDemo-onload', {
    componentProps,
    businessProps,
    timestamp: Date.now(),
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';</style>