<template>
  <base-panel panelKey="empty">
      <template #header-right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">设备类型 28</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">设备总数 68562</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">完好率 98%</span>
      </template>
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

.c-monitor-root {width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  gap: 0;
  box-sizing: border-box;
  overflow: hidden;
  font-size: var(--fontSize, 14px);

}</style>