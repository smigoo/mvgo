<template>
  <base-panel class="c-mc-max-1787798769157-ecf25ff9" panelKey="default-panel">
    <template #title_left>
      <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-title-left">
        <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-title-decor"></span>
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
      </div>
    </template>
    
    

    <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-body">
      <!-- 设备分类统计卡片 -->
      <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-category-cards">
        <div class="c-monitor-card c-mc-max-1787798769157-ecf25ff9-c-monitor-card--tunnel">
          <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-header">
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-icon-placeholder"></span>
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-title">隧道设备</span>
          </div>
          <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-row">
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-label">总数:</span>
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-value">56302</span>
          </div>
          <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-row">
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-label">异常数:</span>
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-value c-mc-max-1787798769157-ecf25ff9-c-monitor-card-value--danger">5</span>
          </div>
        </div>
        
        <div class="c-monitor-card c-mc-max-1787798769157-ecf25ff9-c-monitor-card--north-south">
          <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-header">
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-icon-placeholder"></span>
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-title">南北接线设备</span>
          </div>
          <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-row">
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-label">总数:</span>
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-value c-mc-max-1787798769157-ecf25ff9-c-monitor-card-value--primary">1280</span>
          </div>
          <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-row">
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-label">异常数:</span>
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-card-value c-mc-max-1787798769157-ecf25ff9-c-monitor-card-value--danger">3</span>
          </div>
        </div>
      </div>

      <!-- 设备列表与导航 -->
      <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-device-container">
        <!-- 左侧导航Tab -->
        <a-tabs 
          v-model:activeKey="activeTab" 
          tab-position="left" 
          class="c-mc-max-1787798769157-ecf25ff9-c-monitor-vertical-tabs"
        >
          <a-tab-pane v-for="tab in tabs" :key="tab.name" :tab="tab.name">
            
          </a-tab-pane>
        </a-tabs>

        <!-- 设备网格 -->
        <div class="c-mc-max-1787798769157-ecf25ff9-c-monitor-device-grid">
          <div 
            v-for="device in devices" 
            :key="device.name" 
            class="c-mc-max-1787798769157-ecf25ff9-c-monitor-device-card"
          >
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-device-icon-placeholder"></span>
            <span class="c-mc-max-1787798769157-ecf25ff9-c-monitor-device-name">{{ device.name }}</span>
            <span :class="['c-monitor-device-count', device.countClass]">{{ device.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

// 一次调用 $mcComponentBuilder 并直接解构，禁止多次调用
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 左侧导航 Tab 默认选中项
const activeTab = ref('监控')

// 左侧导航 Tab 配置（文字全部逐字来自设计稿文字清单）
const tabs = [
  { name: '监控', badge: null, page: '3/3740' },
  { name: '照明', badge: '3', page: null },
  { name: '通风', badge: null, page: null },
  { name: '供配电', badge: null, page: null },
  { name: '消防', badge: null, page: null },
  { name: '交通诱导', badge: null, page: null }
]

// 设备网格数据（文字与数值逐字来自设计稿文字清单）
const devices = ref([
  { name: '摄像机', count: '(2/484)', countClass: 'c-monitor-device-count--blue' },
  { name: '风速风向仪', count: '(1/484)', countClass: 'c-monitor-device-count--danger' },
  { name: '超高检测器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '烟道机器人', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '激光雷达', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: 'CO2传感器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: 'CO/VI检测器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '温湿度传感器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '压力传感器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '光照度变送器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '紧急电话', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '水质监测设备', count: '(0/484)', countClass: 'c-monitor-device-count--info' }
])

// 监听左侧 Tab 切换（tab-switch 交互）
// 设计稿未提供不同 Tab 下设备网格数据差异，因此不臆造具体数据变化逻辑
watch(activeTab, () => {
  // 状态切换已由 a-tabs 的 v-model:activeKey 完成
  // 此处保留扩展点：后续可根据 activeTab 从后端拉取对应设备分类数据
})

onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 当前脚本无 listenEvent，无需清理
})
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>