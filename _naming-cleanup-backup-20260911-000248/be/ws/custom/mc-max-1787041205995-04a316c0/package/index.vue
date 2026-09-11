<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 区域1：顶部统计 -->
      <div class="c-monitor-top-stats">
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备类型</span>
          <span class="c-monitor-stat-value">{{ deviceTypeCount }}</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备总数</span>
          <span class="c-monitor-stat-value">{{ totalDeviceCount }}</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">完好率</span>
          <span class="c-monitor-stat-value">{{ integrityRate }}</span>
        </div>
      </div>

      <!-- 区域2：分类统计卡片 -->
      <div class="c-monitor-category-cards">
        <!-- 隧道设备 -->
        <div class="c-monitor-category-card">
          <div class="c-monitor-card-header">
            <img :src="icon1" class="c-monitor-card-icon" />
            <span class="c-monitor-card-title">隧道设备</span>
          </div>
          <div class="c-monitor-stats-row">
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon2" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">在线</span>
                <span class="c-monitor-item-value">{{ tunnelOnline }}</span>
              </div>
            </div>
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon3" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">离线</span>
                <span class="c-monitor-item-value">{{ tunnelOffline }}</span>
              </div>
            </div>
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon4" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">故障</span>
                <span class="c-monitor-item-value">{{ tunnelFault }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 南北接线设备 -->
        <div class="c-monitor-category-card">
          <div class="c-monitor-card-header">
            <img :src="icon5" class="c-monitor-card-icon" />
            <span class="c-monitor-card-title">南北接线设备</span>
          </div>
          <div class="c-monitor-stats-row">
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon6" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">在线</span>
                <span class="c-monitor-item-value">{{ junctionOnline }}</span>
              </div>
            </div>
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon7" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">离线</span>
                <span class="c-monitor-item-value">{{ junctionOffline }}</span>
              </div>
            </div>
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon8" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">故障</span>
                <span class="c-monitor-item-value">{{ junctionFault }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 区域3：设备列表与导航 -->
      <div class="c-monitor-device-section">
        <!-- 左侧导航Tab -->
        <div class="c-monitor-nav-tabs">
          <div 
            v-for="tab in navTabs" 
            :key="tab.key" 
            :class="['c-monitor-nav-tab', { 'is-active': activeNav === tab.key }]"
            @click="activeNav = tab.key"
          >
            {{ tab.label }}
          </div>
        </div>

        <!-- 右侧设备状态网格 -->
        <div class="c-monitor-device-grid">
          <div 
            v-for="device in deviceList" 
            :key="device.key" 
            class="c-monitor-device-item"
          >
            <div class="c-monitor-device-icon-wrapper">
              <img :src="device.icon" class="c-monitor-device-icon" />
            </div>
            <span class="c-monitor-device-name">{{ device.name }}</span>
            <span class="c-monitor-device-status" :class="device.statusClass">
              {{ device.status }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-8421.png'
import icon2 from '../resources/images/Frame-8856.png'
import icon3 from '../resources/images/icon-8798.png'
import icon4 from '../resources/images/icon-8817.png'
import icon5 from '../resources/images/icon-8444.png'
import icon6 from '../resources/images/icon-8473.png'
import icon7 from '../resources/images/icon-8503.png'
import icon8 from '../resources/images/icon-8532.png'


import { ref, onMounted, onUnmounted, computed} from 'vue'

// --- $mcComponentBuilder 初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

// --- 顶部统计数据 ---
const deviceTypeCount = ref(12)
const totalDeviceCount = ref(1024)
const integrityRate = ref('98.5%')

// --- 隧道设备数据 ---
const tunnelOnline = ref(450)
const tunnelOffline = ref(12)
const tunnelFault = ref(3)

// --- 南北接线设备数据 ---
const junctionOnline = ref(320)
const junctionOffline = ref(8)
const junctionFault = ref(1)

// --- 导航Tab数据 ---
const navTabs = ref([
  { key: 'all', label: '全部' },
  { key: 'camera', label: '摄像机' },
  { key: 'detector', label: '检测器' },
  { key: 'sign', label: '情报板' },
  { key: 'light', label: '照明' }
])
const activeNav = ref('all')

// --- 设备列表数据（联动Tab切换） ---
const deviceList = computed(() => {
  const allDevices = [
    { key: '1', icon: icon1, name: '高清摄像机', status: '在线', statusClass: 'status-online' },
    { key: '2', icon: icon2, name: '微波检测器', status: '在线', statusClass: 'status-online' },
    { key: '3', icon: icon3, name: 'CO检测器', status: '离线', statusClass: 'status-offline' },
    { key: '4', icon: icon4, name: '情报板', status: '故障', statusClass: 'status-fault' },
    { key: '5', icon: icon5, name: '照明控制器', status: '在线', statusClass: 'status-online' },
    { key: '6', icon: icon6, name: '火灾报警器', status: '在线', statusClass: 'status-online' },
    { key: '7', icon: icon7, name: '车道指示器', status: '离线', statusClass: 'status-offline' },
    { key: '8', icon: icon8, name: '风速仪', status: '在线', statusClass: 'status-online' }
  ]
  
  if (activeNav.value === 'all') {
    return allDevices
  }
  
  const typeMap = {
    'camera': ['高清摄像机'],
    'detector': ['微波检测器', 'CO检测器', '风速仪'],
    'sign': ['情报板'],
    'light': ['照明控制器', '车道指示器']
  }
  
  const filterNames = typeMap[activeNav.value] || []
  return allDevices.filter(d => filterNames.includes(d.name))
})

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理监听或定时器
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>