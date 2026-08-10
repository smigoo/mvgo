<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <div 
        class="c-device-monitor-content"
        :style="{ backgroundImage: `url(${bgMain})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <!-- Header 区域 -->
        <div class="c-device-monitor-header">
          <span class="c-device-monitor-title">设备监测</span>
          <div class="c-device-monitor-stats">
            <div class="c-device-monitor-stat-item">
              <span class="c-device-monitor-stat-label">设备类型</span>
              <span class="c-device-monitor-stat-value">{{ headerStats.type }}</span>
            </div>
            <div class="c-device-monitor-stat-item">
              <span class="c-device-monitor-stat-label">设备总数</span>
              <span class="c-device-monitor-stat-value">{{ headerStats.total }}</span>
            </div>
            <div class="c-device-monitor-stat-item">
              <span class="c-device-monitor-stat-label">完好率</span>
              <span class="c-device-monitor-stat-value c-device-monitor-stat-value--rate">{{ headerStats.rate }}</span>
            </div>
          </div>
          <span class="c-device-monitor-update-tip">*数据实时更新</span>
        </div>

        <!-- Switch 卡片区域 -->
        <div class="c-device-monitor-switch">
          <div 
            v-for="(card, index) in switchCards" 
            :key="index"
            class="c-device-monitor-switch-card"
            :class="card.active ? 'c-device-monitor-switch-card--active' : 'c-device-monitor-switch-card--default'"
          >
            <img :src="card.icon" class="c-device-monitor-card-icon" />
            <div class="c-device-monitor-card-info">
              <span class="c-device-monitor-card-title">{{ card.name }}</span>
              <div class="c-device-monitor-card-line">
                <span class="c-device-monitor-card-label">总数:</span>
                <span class="c-device-monitor-card-value">{{ card.total }}</span>
              </div>
              <div class="c-device-monitor-card-line">
                <span class="c-device-monitor-card-label">异常数:</span>
                <span class="c-device-monitor-card-error">{{ card.error }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab + Grid 区域 -->
        <div class="c-device-monitor-main">
          <!-- 左侧 Tabs -->
          <div class="c-device-monitor-tabs">
            <div 
              v-for="(tab, index) in tabs" 
              :key="index"
              class="c-device-monitor-tab"
              :class="tab.active ? 'c-device-monitor-tab--active' : 'c-device-monitor-tab--inactive'"
            >
              <span class="c-device-monitor-tab-text">{{ tab.name }}</span>
              <template v-if="tab.active && tab.badge">
                <span class="c-device-monitor-tab-badge">{{ tab.badge }}</span>
              </template>
              <template v-else-if="!tab.active && tab.dot">
                <span class="c-device-monitor-tab-dot">{{ tab.dot }}</span>
              </template>
            </div>
          </div>

          <!-- 右侧 Grid -->
          <div class="c-device-monitor-grid">
            <div 
              v-for="(item, index) in gridItems" 
              :key="index"
              class="c-device-monitor-grid-item"
            >
              <div class="c-device-monitor-item-icon">
                <img :src="item.icon" />
              </div>
              <div class="c-device-monitor-item-info">
                <span class="c-device-monitor-item-name">{{ item.name }}</span>
                <span class="c-device-monitor-item-value">({{ item.value }})</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bgMain from '../resources/images/bg-8418.png'
import iconTunnel from '../resources/images/icon-8444.png'
import iconCable from '../resources/images/icon-8473.png'
import iconCamera from '../resources/images/icon-8503.png'
import iconWind from '../resources/images/icon-8532.png'
import iconHeight from '../resources/images/icon-8561.png'
import iconRobot from '../resources/images/icon-8590.png'
import iconRadar from '../resources/images/icon-8619.png'
import iconCO2 from '../resources/images/icon-8648.png'
import iconCOVI from '../resources/images/icon-8677.png'
import iconTempHum from '../resources/images/icon-8706.png'
import iconPressure from '../resources/images/icon-8735.png'
import iconLight from '../resources/images/icon-8764.png'
import iconPhone from '../resources/images/icon-8798.png'
import iconWater from '../resources/images/icon-8817.png'

import { ref, onMounted } from 'vue'

let runtimeBuilder = null
let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentApi = builder?.componentApi
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const headerStats = ref({
  type: 28,
  total: 68562,
  rate: '98%'
})

const switchCards = ref([
  { name: '隧道设备', total: 56302, error: 5, active: true, icon: iconTunnel },
  { name: '南北接线设备', total: 1280, error: 3, active: false, icon: iconCable }
])

const tabs = ref([
  { name: '监控', badge: '3/3740', active: true },
  { name: '照明', dot: '3', active: false },
  { name: '通风', active: false },
  { name: '供配电', active: false },
  { name: '消防', active: false },
  { name: '交通诱导', active: false }
])

const gridItems = ref([
  { name: '摄像机', value: '2/484', icon: iconCamera },
  { name: '风速风向仪', value: '1/484', icon: iconWind },
  { name: '超高检测器', value: '0/484', icon: iconHeight },
  { name: '烟道机器人', value: '0/484', icon: iconRobot },
  { name: '激光雷达', value: '0/484', icon: iconRadar },
  { name: 'CO2传感器', value: '0/484', icon: iconCO2 },
  { name: 'CO/VI检测器', value: '0/484', icon: iconCOVI },
  { name: '温湿度传感器', value: '0/484', icon: iconTempHum },
  { name: '压力传感器', value: '0/484', icon: iconPressure },
  { name: '光照度变送器', value: '0/484', icon: iconLight },
  { name: '紧急电话', value: '0/484', icon: iconPhone },
  { name: '水质监测设备', value: '0/484', icon: iconWater }
])

const fetchData = async () => {
  try {
    if (componentApi) {
      const res = await componentApi.getCommonApiFindOne({}, 'deviceMonitorData')
      if (res) {
        if (res.headerStats) headerStats.value = { ...headerStats.value, ...res.headerStats }
        if (res.switchCards) switchCards.value = res.switchCards
        if (res.gridItems) gridItems.value = res.gridItems
        return
      }
    }
  } catch (e) {
    console.warn('[组件] 获取设备监测数据失败:', e)
  }
}

onMounted(() => {
  fetchData()
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785977550903-5ec08759-onload', {
      componentId: 'mc-1785977550903-5ec08759',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>