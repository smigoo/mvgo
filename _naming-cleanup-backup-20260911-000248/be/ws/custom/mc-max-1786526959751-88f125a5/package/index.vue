<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <!-- Header 区域 -->
      <div class="c-device-monitor-header">
        <div class="c-device-monitor-header-left">
          <span class="c-device-monitor-title">设备监测</span>
        </div>
        <div class="c-device-monitor-header-stats">
          <div class="c-device-monitor-stat-item">
            <span class="c-device-monitor-stat-label">设备类型</span>
            <span class="c-device-monitor-stat-value primary">{{ stats.typeCount }}</span>
          </div>
          <div class="c-device-monitor-stat-item">
            <span class="c-device-monitor-stat-label">设备总数</span>
            <span class="c-device-monitor-stat-value primary">{{ stats.totalCount }}</span>
          </div>
          <div class="c-device-monitor-stat-item">
            <span class="c-device-monitor-stat-label">完好率</span>
            <span class="c-device-monitor-stat-value success">{{ stats.goodRate }}</span>
          </div>
        </div>
        <span class="c-device-monitor-update-tip">*数据实时更新</span>
      </div>

      <!-- Switch 概览卡片区域 -->
      <div class="c-device-monitor-switch">
        <div
          v-for="card in switchCards"
          :key="card.key"
          :class="['c-device-monitor-switch-card', { 'is-active': activeSwitch === card.key }]"
          @click="activeSwitch = card.key"
        >
          <div class="c-device-monitor-switch-icon">
            <img :src="card.icon" alt="" />
          </div>
          <div class="c-device-monitor-switch-info">
            <div class="c-device-monitor-switch-line">
              <span class="c-device-monitor-switch-text">总数:</span>
              <span class="c-device-monitor-switch-num">{{ card.total }}</span>
            </div>
            <div class="c-device-monitor-switch-line">
              <span class="c-device-monitor-switch-text">异常数:</span>
              <span class="c-device-monitor-switch-num error">{{ card.error }}</span>
            </div>
          </div>
          <span class="c-device-monitor-switch-title">{{ card.title }}</span>
        </div>
      </div>

      <!-- 主内容区 (Tab + Grid) -->
      <DeviceAlarmList />
    </div>
  </base-panel>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import switchIcon1 from '../resources/images/icon-8444.png'
import switchIcon2 from '../resources/images/icon-8473.png'
import DeviceAlarmList from './components/DeviceAlarmList.vue'

// --- 框架初始化 ---
let runtimeBuilder = null
let componentProps = {}
let businessProps = {}
let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi
} catch (e) {
  console.warn('[DeviceMonitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 (严格使用 Figma 数据) ---
const stats = reactive({
  typeCount: 28,
  totalCount: 68562,
  goodRate: '98%'
})

const activeSwitch = ref('tunnel')
const switchCards = ref([
  { key: 'tunnel', title: '隧道设备', icon: switchIcon1, total: 56302, error: 5 },
  { key: 'north-south', title: '南北接线设备', icon: switchIcon2, total: 1280, error: 3 }
])

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-device-monitor',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>