<template>
  <base-panel class="c-mc-max-1788347975121-26afcb42" panelKey="default-panel">
      <template #header_right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">柱状图切换图标 + 列表切换图标（带角标6）</span>
      </template>
    
    
    
    <SectionChart 
      :activeTab="activeTab" 
    />
  </base-panel>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import PanelTitle from './components/PanelTitle.vue'
import SectionTabsAndIcons from './components/SectionTabsAndIcons.vue'
import SectionChart from './components/SectionChart.vue'

// 1. 一次调用 $mcComponentBuilder 并直接解构
const { runtimeBuilder } = $mcComponentBuilder()

// 2. 主组件状态：当前激活的 Tab（默认一氧化碳）
const activeTab = ref('一氧化碳')

// 3. 触发组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>