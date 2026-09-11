<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <div class="c-monitor-layout">
        <!-- 左侧Tab切换栏 -->
        <LeftTabsSection />
        
        <!-- 主内容区 -->
        <MainContentSection />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import LeftTabsSection from './components/LeftTabsSection.vue'
import MainContentSection from './components/MainContentSection.vue'

// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.c-monitor-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  gap: 8px;
  min-height: 0;
}
</style>
