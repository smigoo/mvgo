<template>
  <div class="mc-card">
    <div
      v-if="componentProps.bg1"
      class="mc-card__bg"
      :style="{ backgroundImage: `url(${componentProps.bg1})` }"
    ></div>
    <div class="mc-card__content">
      <img
        v-if="componentProps.icon1"
        class="mc-card__icon"
        :src="componentProps.icon1"
        alt=""
      />
      <div class="mc-card__title">{{ componentProps.title || '组件标题' }}</div>
      <div class="mc-card__desc">{{ componentProps.description || '组件描述' }}</div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7880.png'
import icon1 from '../resources/images/g-7883.png'

import { onMounted} from 'vue'

// 关键约束：一次调用并直接解构，禁止 let runtimeBuilder 分离声明
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('组件名-onload', {
    componentProps,
    businessProps,
    componentApi,
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';</style>