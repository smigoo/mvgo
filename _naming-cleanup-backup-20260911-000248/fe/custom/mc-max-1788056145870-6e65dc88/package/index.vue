<template>
  <base-panel panelKey="default-panel" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
    <!-- 右上角控制按钮：图表类型切换 + 通知角标（放入标题栏右侧插槽） -->
    <template #header_right>
      <HeaderControls />
    </template>

    <!-- 组件主体内容 -->
    <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-root">
      <!-- Tab 切换栏：一氧化碳 / 能见度 / 洞内照明 / 洞外光强 -->
      <EnvTabBar />

      <!-- 图表区域：CO 浓度面积图 -->
      <ChartSection />
    </div>
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-7890.png'


import HeaderControls from './components/HeaderControls.vue'
import EnvTabBar from './components/EnvTabBar.vue'
import ChartSection from './components/ChartSection.vue'

// ✅ $mcComponentBuilder 直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// ✅ onMounted 中触发 onload 事件
onMounted(() => {
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'c-env-monitor',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>