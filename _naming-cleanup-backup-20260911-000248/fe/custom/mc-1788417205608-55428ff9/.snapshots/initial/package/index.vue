<template>
  <base-panel panelKey="default-panel">
      <template #header-right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">设备类型 28</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">设备总数 68562</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">完好率 98%</span>
      </template>
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

.c-monitor-root {width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  font-size: var(--fontSize, 14px);

}
.c-monitor-layout {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: row;
  gap: 8px;
  min-height: 0;
}
</style>