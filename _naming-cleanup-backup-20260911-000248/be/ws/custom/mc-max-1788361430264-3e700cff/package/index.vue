<template>
  <base-panel class="c-mc-max-1788361430264-3e700cff" panelKey="default-panel">
      <template #header_right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">柱状图图标按钮（图表视图切换）</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">列表图标按钮（列表视图切换），右上角有数字徽章「6」</span>
      </template>
    <div class="c-env-monitor-root">
      <TabsSection />
      <ChartSection />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import TabsSection from './components/TabsSection.vue'
import ChartSection from './components/ChartSection.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  overflow: hidden;
  font-size: var(--fontSize, 14px);

}</style>