<template>
  <base-panel panelKey="empty">
    <div class="c-monitor-root">
      <!-- 左侧设备分类导航 -->
      <LeftSidebar />
      
      <!-- 主内容区 -->
      <MainContent />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import LeftSidebar from './components/LeftSidebar.vue'
import MainContent from './components/MainContent.vue'

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
  display: flex;
  flex-direction: row;
  gap: 0;
  box-sizing: border-box;
  overflow: hidden;
}
</style>
