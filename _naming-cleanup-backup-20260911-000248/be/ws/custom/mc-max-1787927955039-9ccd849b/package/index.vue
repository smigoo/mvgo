<template>
  <base-panel panelKey="default-panel" :class="['c-monitor-root', componentProps.themeType]" :style="{ ...{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
      <template #header_right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">设备类型 28</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">设备总数 68562</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">完好率 98%</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">设备类型 28</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">设备总数 68562</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size:13px;line-height:1;white-space:nowrap;">完好率 98%</span>
      </template>
    <!-- 1. 头部统计栏 -->
    <HeaderStats />

    <!-- 2. 汇总统计卡片 -->
    <SummaryCards />

    <!-- 3. 设备分类网格 -->
    <DeviceGrid />

    <!-- 4. 左侧导航栏 -->
    <SidebarNav />
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-8788.png'
import bg3 from '../resources/images/bg-8807.png'


import SummaryCards from './components/SummaryCards.vue'
import DeviceGrid from './components/DeviceGrid.vue'
import SidebarNav from './components/SidebarNav.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 触发 onload 事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

// ==================== 第 2/3 部分：生命周期与事件 ====================
// === 生命周期钩子 ===
onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
  
  console.log('[设备监测] 组件已加载')
})

onUnmounted(() => {
  console.log('[设备监测] 组件已卸载')
})
// === 事件处理函数 ===
// 本组件为容器组件，所有交互逻辑在子组件内部处理
// index.vue 只负责组合子组件，不包含业务事件处理
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>