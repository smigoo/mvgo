<template>
  <base-panel panelKey="default-panel">
      <template #header_right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">设备类型 28</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">设备总数 68562</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">完好率 98%</span>
      </template>
    <div class="c-monitor-root">
      <!-- 顶部统计栏 -->
      <StatsBar />
      
      <!-- 主体内容区：设备分类标签栏 + 设备网格 -->
      <div class="c-monitor-main">
        <!-- 左侧：设备分类标签栏 -->
        <EquipmentCategories />
        
        <!-- 右侧：设备网格 -->
        <EquipmentGrid />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
// === 子组件引入（section 级拆分） ===
import StatsBar from './components/StatsBar.vue'
import EquipmentCategories from './components/EquipmentCategories.vue'
import EquipmentGrid from './components/EquipmentGrid.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，全组件仅调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 组件标识常量（用于 onload 事件上报） ===
const COMPONENT_ID = 'monitor'
const ONLOAD_EVENT_ID = 'monitor-onload'
// === onload 事件上报函数（定义，调用在生命周期部分） ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent(ONLOAD_EVENT_ID, {
    componentId: COMPONENT_ID,
    timestamp: Date.now()
  })
}

// 生命周期钩子
onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 组件卸载时的清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>