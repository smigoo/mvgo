<template>
  <base-panel panelKey="default-panel">
    <!-- 顶部统计栏 -> header-right 插槽 -->
    <template #header-right>
      <div class="c-mc-1785342600980-96fa180f-header-stats">
        <div class="c-mc-1785342600980-96fa180f-stat-item">
          <span class="c-mc-1785342600980-96fa180f-stat-label">设备类型</span>
          <span class="c-mc-1785342600980-96fa180f-stat-value c-mc-1785342600980-96fa180f-stat-value-blue">28</span>
        </div>
        <div class="c-mc-1785342600980-96fa180f-stat-item">
          <span class="c-mc-1785342600980-96fa180f-stat-label">设备总数</span>
          <span class="c-mc-1785342600980-96fa180f-stat-value c-mc-1785342600980-96fa180f-stat-value-blue">68562</span>
        </div>
        <div class="c-mc-1785342600980-96fa180f-stat-item">
          <span class="c-mc-1785342600980-96fa180f-stat-label">完好率</span>
          <span class="c-mc-1785342600980-96fa180f-stat-value c-mc-1785342600980-96fa180f-stat-value-green">98%</span>
        </div>
      </div>
    </template>

    <!-- 默认插槽：内容区 -->
    <div class="c-mc-1785342600980-96fa180f-content">
      <!-- 区域概览卡片 -->
      <div class="c-mc-1785342600980-96fa180f-top-cards">
        <!-- 隧道设备卡片 -->
        <div class="c-mc-1785342600980-96fa180f-card c-mc-1785342600980-96fa180f-card-tunnel">
          <!-- Fixed: 为 type='row' 嵌套结构添加 flex-direction: row 容器 -->
          <div class="c-mc-1785342600980-96fa180f-card-row">
            <img :src="icon3" class="c-mc-1785342600980-96fa180f-card-icon" />
            <span class="c-mc-1785342600980-96fa180f-card-title">总数:56302</span>
          </div>
          <div class="c-mc-1785342600980-96fa180f-card-row">
            <span class="c-mc-1785342600980-96fa180f-card-subtitle">隧道设备</span>
            <span class="c-mc-1785342600980-96fa180f-card-exception">异常数:5</span>
          </div>
        </div>

        <!-- 南北接线设备卡片 -->
        <div class="c-mc-1785342600980-96fa180f-card c-mc-1785342600980-96fa180f-card-bridge">
          <div class="c-mc-1785342600980-96fa180f-card-row">
            <img :src="icon4" class="c-mc-1785342600980-96fa180f-card-icon" />
            <span class="c-mc-1785342600980-96fa180f-card-title c-mc-1785342600980-96fa180f-card-title-light">总数:1280</span>
          </div>
          <div class="c-mc-1785342600980-96fa180f-card-row">
            <span class="c-mc-1785342600980-96fa180f-card-subtitle c-mc-1785342600980-96fa180f-card-subtitle-dark">南北接线设备</span>
            <span class="c-mc-1785342600980-96fa180f-card-exception">异常数:3</span>
          </div>
        </div>
      </div>

      <!-- 分类与设备列表 -->
      <div class="c-mc-1785342600980-96fa180f-main-content">
        <!-- 左侧Tab -->
        <div class="c-mc-1785342600980-96fa180f-sidebar-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-mc-1785342600980-96fa180f-tab-item', { 'c-mc-1785342600980-96fa180f-tab-active': activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
            <span v-if="tab.badge" class="c-mc-1785342600980-96fa180f-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="c-mc-1785342600980-96fa180f-device-grid">
          <!-- Fixed: 为每个设备item使用对应的背景图资源 bg1~bg12 -->
          <div
            v-for="device in devices"
            :key="device.name"
            class="c-mc-1785342600980-96fa180f-device-item"
            :style="{ 
              backgroundImage: `url(${device.bg})`, 
              backgroundSize: '100% 100%', 
              backgroundPosition: 'center', 
              backgroundRepeat: 'no-repeat' 
            }"
          >
            <img :src="device.icon" class="c-mc-1785342600980-96fa180f-device-icon" />
            <div class="c-mc-1785342600980-96fa180f-device-info">
              <span class="c-mc-1785342600980-96fa180f-device-name">{{ device.name }}</span>
              <span class="c-mc-1785342600980-96fa180f-device-value" :style="{ color: device.valueColor }">{{ device.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon3 from '../resources/images/icon-8798.png'
import icon4 from '../resources/images/icon-8817.png'
import bg1 from '../resources/images/bg-8788.png'
import bg12 from '../resources/images/bg-8759.png'
import icon5 from '../resources/images/icon-8444.png'
import icon6 from '../resources/images/icon-8473.png'
import bg2 from '../resources/images/bg-8439.png'
import icon7 from '../resources/images/icon-8503.png'
import bg3 from '../resources/images/bg-8468.png'
import icon8 from '../resources/images/icon-8532.png'
import bg4 from '../resources/images/bg-8498.png'
import icon9 from '../resources/images/icon-8561.png'
import bg5 from '../resources/images/bg-8527.png'
import icon10 from '../resources/images/icon-8590.png'
import bg6 from '../resources/images/bg-8556.png'
import icon11 from '../resources/images/icon-8619.png'
import bg7 from '../resources/images/bg-8585.png'
import icon12 from '../resources/images/icon-8648.png'
import bg8 from '../resources/images/bg-8614.png'
import bg9 from '../resources/images/bg-8643.png'
import bg10 from '../resources/images/bg-8672.png'
import bg11 from '../resources/images/bg-8701.png'

import { ref, onMounted, onUnmounted } from 'vue'

// Fixed: 补充 $mcComponentBuilder 调用，解构 runtimeBuilder 等
let runtimeBuilder = null
let componentApi = null
let businessProps = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentApi = builder?.componentApi
  businessProps = builder?.businessProps
} catch (e) {
  console.warn('[设备监测] $mcComponentBuilder 失败:', e)
}

// 配置读取工具函数
const getConfig = (key, defaultValue) => {
  const value = businessProps?.[key]
  if (value !== undefined && value !== null) return value
  return defaultValue
}

const sectionNum = ref(getConfig('sectionNum', 'S23-JY'))
const pollInterval = ref(getConfig('pollInterval', 60000))

// Tab 数据
const tabs = ref([
  { key: 'monitor', label: '监控' },
  { key: 'lighting', label: '照明', badge: '3' },
  { key: 'ventilation', label: '通风' },
  { key: 'power', label: '供配电' },
  { key: 'fire', label: '消防' },
  { key: 'traffic', label: '交通诱导' }
])
const activeTab = ref('monitor')

// 设备网格数据 (12个设备，对应 bg1~bg12 背景图资源)
const devices = ref([
  { name: '摄像机', value: '2/484', valueColor: '#f53f3f', icon: icon5, bg: bg1 },
  { name: '风速风向仪', value: '1/484', valueColor: '#f53f3f', icon: icon6, bg: bg2 },
  { name: '超高检测器', value: '0/484', valueColor: '#08a3a5', icon: icon7, bg: bg3 },
  { name: '烟道机器人', value: '0/484', valueColor: '#08a3a5', icon: icon8, bg: bg4 },
  { name: '激光雷达', value: '0/484', valueColor: '#08a3a5', icon: icon9, bg: bg5 },
  { name: 'CO₂传感器', value: '0/484', valueColor: '#08a3a5', icon: icon10, bg: bg6 },
  { name: 'CO/VI检测器', value: '0/484', valueColor: '#08a3a5', icon: icon11, bg: bg7 },
  { name: '温湿度传感器', value: '0/484', valueColor: '#08a3a5', icon: icon12, bg: bg8 },
  { name: '压力传感器', value: '0/484', valueColor: '#08a3a5', icon: icon12, bg: bg9 },
  { name: '光照度变送器', value: '0/484', valueColor: '#08a3a5', icon: icon12, bg: bg10 },
  { name: '紧急电话', value: '0/484', valueColor: '#08a3a5', icon: icon12, bg: bg11 },
  { name: '水质监测设备', value: '0/484', valueColor: '#08a3a5', icon: icon12, bg: bg12 }
])

// 数据加载
const loadData = async () => {
  if (!componentApi) return
  try {
    const res = await componentApi.getCommonApiFindOne({ sectionNum: sectionNum.value }, 'deviceOverview')
    if (res) {
      runtimeBuilder?.publishEvent('data-loaded', {
        sectionNum: sectionNum.value,
        total: res.total,
        online: res.online,
        abnormal: res.abnormal,
        onlineRate: res.onlineRate
      })
    }
  } catch (e) {
    console.error('获取设备数据失败:', e)
  }
}

let refreshTimer = null

onMounted(() => {
  // Fixed: 触发 onload 事件
  runtimeBuilder?.publishEvent('mc-1785342600980-96fa180f-onload', {
    componentId: 'mc-1785342600980-96fa180f',
    timestamp: Date.now(),
    sectionNum: sectionNum.value
  })

  loadData()
  refreshTimer = setInterval(loadData, pollInterval.value)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>