<template>
  <base-panel panelKey="default-panel">
    <template #title-right>
      <img :src="icon2" class="c-mc-1785473296223-c4025de6-title-icon" />
    </template>
    <template #header-right>
      <div class="c-mc-1785473296223-c4025de6-header-stats">
        <div class="c-mc-1785473296223-c4025de6-stat-item">
          <span class="c-mc-1785473296223-c4025de6-stat-label">设备类型</span>
          <span class="c-mc-1785473296223-c4025de6-stat-value-blue">28</span>
        </div>
        <div class="c-mc-1785473296223-c4025de6-stat-item">
          <span class="c-mc-1785473296223-c4025de6-stat-label">设备总数</span>
          <span class="c-mc-1785473296223-c4025de6-stat-value-blue">68562</span>
        </div>
        <div class="c-mc-1785473296223-c4025de6-stat-item">
          <span class="c-mc-1785473296223-c4025de6-stat-label">完好率</span>
          <span class="c-mc-1785473296223-c4025de6-stat-value-green">98%</span>
        </div>
      </div>
    </template>

    <div class="c-mc-1785473296223-c4025de6-content">
      <div class="c-mc-1785473296223-c4025de6-switch">
        <div
          class="c-mc-1785473296223-c4025de6-card"
          :style="{ backgroundImage: `url(${bg1})` }"
        >
          <img :src="icon3" class="c-mc-1785473296223-c4025de6-card-icon" />
          <div class="c-mc-1785473296223-c4025de6-card-text">
            <span class="c-mc-1785473296223-c4025de6-card-title-white">总数:56302</span>
            <div>
              <span class="c-mc-1785473296223-c4025de6-card-desc-white">隧道设备 异常数:</span>
              <span class="c-mc-1785473296223-c4025de6-card-desc-red">5</span>
            </div>
          </div>
        </div>
        <div
          class="c-mc-1785473296223-c4025de6-card"
          :style="{ backgroundImage: `url(${bg2})` }"
        >
          <img :src="icon4" class="c-mc-1785473296223-c4025de6-card-icon" />
          <div class="c-mc-1785473296223-c4025de6-card-text">
            <span class="c-mc-1785473296223-c4025de6-card-title-dark">总数:1280</span>
            <div>
              <span class="c-mc-1785473296223-c4025de6-card-desc-dark">南北接线设备 异常数:</span>
              <span class="c-mc-1785473296223-c4025de6-card-desc-red">3</span>
            </div>
          </div>
        </div>
      </div>

      <div class="c-mc-1785473296223-c4025de6-main-content">
        <div class="c-mc-1785473296223-c4025de6-tabs">
          <div
            v-for="(tab, index) in tabs"
            :key="index"
            :class="[
              'c-mc-1785473296223-c4025de6-tab-item',
              { 'c-mc-1785473296223-c4025de6-tab-active': activeTab === index }
            ]"
            @click="activeTab = index"
          >
            <span class="c-mc-1785473296223-c4025de6-tab-label">{{ tab.label }}</span>
            <span v-if="tab.badge" class="c-mc-1785473296223-c4025de6-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <div class="c-mc-1785473296223-c4025de6-device-grid">
          <div
            v-for="(device, index) in devices"
            :key="index"
            class="c-mc-1785473296223-c4025de6-device-item"
            :style="device.bg ? { backgroundImage: `url(${device.bg})` } : {}"
          >
            <img v-if="device.icon" :src="device.icon" class="c-mc-1785473296223-c4025de6-device-icon" />
            <div class="c-mc-1785473296223-c4025de6-device-info">
              <span class="c-mc-1785473296223-c4025de6-device-label">{{ device.label }}</span>
              <span class="c-mc-1785473296223-c4025de6-device-value">{{ device.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon2 from '../resources/images/Frame-8856.png'
import bg1 from '../resources/images/bg-8788.png'
import icon3 from '../resources/images/icon-8798.png'
import bg2 from '../resources/images/bg-8807.png'
import icon4 from '../resources/images/icon-8817.png'
import bg3 from '../resources/images/bg-8439.png'
import icon5 from '../resources/images/icon-8444.png'
import bg4 from '../resources/images/bg-8468.png'
import icon6 from '../resources/images/icon-8473.png'
import bg5 from '../resources/images/bg-8498.png'
import icon7 from '../resources/images/icon-8503.png'
import bg6 from '../resources/images/bg-8527.png'
import icon8 from '../resources/images/icon-8532.png'
import bg7 from '../resources/images/bg-8556.png'
import icon9 from '../resources/images/icon-8561.png'
import icon10 from '../resources/images/icon-8590.png'
import bg8 from '../resources/images/bg-8614.png'
import icon11 from '../resources/images/icon-8619.png'
import bg9 from '../resources/images/bg-8643.png'
import icon12 from '../resources/images/icon-8735.png'

import { ref, onMounted } from 'vue'

const componentName = 'mc-1785473296223-c4025de6'

let runtimeBuilder = null
try {
  const result = typeof window !== 'undefined' && window.$mcComponentBuilder
    ? window.$mcComponentBuilder({
        componentId: componentName,
        componentProps: {},
        componentName: 'cp-设备监测'
      })
    : null
  runtimeBuilder = result?.runtimeBuilder || null
} catch (e) {
  console.warn('[$mcComponentBuilder] 初始化失败:', e)
}

const activeTab = ref(0)

const tabs = ref([
  { label: '监控', active: true },
  { label: '照明', badge: '3' },
  { label: '通风' },
  { label: '供配电' },
  { label: '消防' },
  { label: '交通诱导' }
])

const devices = ref([
  { label: '摄像机', value: '(2/484)', bg: bg3, icon: icon5 },
  { label: '风速风向仪', value: '(1/484)', bg: bg4, icon: icon6 },
  { label: '超高检测器', value: '(0/484)', bg: bg5, icon: icon7 },
  { label: '烟道机器人', value: '(0/484)', bg: bg6, icon: icon8 },
  { label: '激光雷达', value: '(0/484)', bg: bg7, icon: icon9 },
  { label: 'CO₂传感器', value: '(0/484)', bg: null, icon: icon10 },
  { label: 'CO/VI检测器', value: '(0/484)', bg: bg8, icon: icon11 },
  { label: '温湿度传感器', value: '(0/484)', bg: bg9, icon: icon12 },
  { label: '压力传感器', value: '(0/484)', bg: null, icon: null },
  { label: '光照度变送器', value: '(0/484)', bg: null, icon: null },
  { label: '紧急电话', value: '(0/484)', bg: null, icon: null },
  { label: '水质监测设备', value: '(0/484)', bg: null, icon: null }
])

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent(`${componentName}-onload`, {
      componentId: componentName,
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>