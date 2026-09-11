<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-1785400257658-7f2c4def-root">
      <!-- 头部区域 -->
      <div class="c-mc-1785400257658-7f2c4def-header">
        <div class="c-mc-1785400257658-7f2c4def-title-group">
          <img :src="icon1" class="c-mc-1785400257658-7f2c4def-title-icon" alt="icon" />
          <span class="c-mc-1785400257658-7f2c4def-title-text">设备监测</span>
        </div>
        <div class="c-mc-1785400257658-7f2c4def-stats">
          <div class="c-mc-1785400257658-7f2c4def-stat-item">
            <span class="c-mc-1785400257658-7f2c4def-stat-label">设备类型</span>
            <span class="c-mc-1785400257658-7f2c4def-stat-value c-mc-1785400257658-7f2c4def-stat-value--blue">{{ stats.deviceType }}</span>
          </div>
          <div class="c-mc-1785400257658-7f2c4def-stat-item">
            <span class="c-mc-1785400257658-7f2c4def-stat-label">设备总数</span>
            <span class="c-mc-1785400257658-7f2c4def-stat-value c-mc-1785400257658-7f2c4def-stat-value--blue">{{ stats.deviceTotal }}</span>
          </div>
          <div class="c-mc-1785400257658-7f2c4def-stat-item">
            <span class="c-mc-1785400257658-7f2c4def-stat-label">完好率</span>
            <span class="c-mc-1785400257658-7f2c4def-stat-value c-mc-1785400257658-7f2c4def-stat-value--green">{{ stats.goodRate }}</span>
          </div>
          <span class="c-mc-1785400257658-7f2c4def-update-text">*数据实时更新</span>
          <img :src="icon2" class="c-mc-1785400257658-7f2c4def-header-action" alt="action" />
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="c-mc-1785400257658-7f2c4def-body">
        <!-- Switch 切换 -->
        <div class="c-mc-1785400257658-7f2c4def-switch">
          <div
            v-for="tab in switchTabs"
            :key="tab.key"
            class="c-mc-1785400257658-7f2c4def-switch-item"
            :class="{ 'is-active': activeSwitch === tab.key }"
            :style="{ backgroundImage: `url(${tab.bg})` }"
            @click="activeSwitch = tab.key"
          >
            <div class="switch-left">
              <img :src="tab.icon" class="switch-icon" alt="switch-icon" />
              <span class="switch-title">{{ tab.label }}</span>
            </div>
            <div class="switch-right">
              <div class="switch-data">
                <span class="data-label">总数:</span>
                <span class="data-value">{{ tab.total }}</span>
              </div>
              <div class="switch-data">
                <span class="data-label">异常:</span>
                <span class="data-value data-value--error">{{ tab.error }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 下方内容区 (Tabs + Cards) -->
        <div class="c-mc-1785400257658-7f2c4def-content">
          <!-- 左侧垂直 Tabs -->
          <div class="c-mc-1785400257658-7f2c4def-tabs">
            <div
              v-for="tab in leftTabs"
              :key="tab.key"
              class="c-mc-1785400257658-7f2c4def-tab-item"
              :class="{ 'is-active': activeLeftTab === tab.key }"
              @click="activeLeftTab = tab.key"
            >
              {{ tab.label }}
            </div>
          </div>

          <!-- 右侧卡片网格 -->
          <div class="c-mc-1785400257658-7f2c4def-cards">
            <div
              v-for="card in cards"
              :key="card.label"
              class="c-mc-1785400257658-7f2c4def-card"
              :style="{ backgroundImage: `url(${card.bg})` }"
            >
              <img :src="card.icon" class="c-mc-1785400257658-7f2c4def-card-icon" alt="card-icon" />
              <div class="c-mc-1785400257658-7f2c4def-card-info">
                <span class="c-mc-1785400257658-7f2c4def-card-label">{{ card.label }}</span>
                <span class="c-mc-1785400257658-7f2c4def-card-value">{{ card.value }}</span>
              </div>
            </div>
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
import bg1 from '../resources/images/bg-8788.png'
import icon4 from '../resources/images/icon-8817.png'
import bg2 from '../resources/images/bg-8807.png'
import bg3 from '../resources/images/bg-8439.png'
import bg8 from '../resources/images/bg-8730.png'
import bg4 from '../resources/images/bg-8468.png'
import bg5 from '../resources/images/bg-8498.png'
import bg6 from '../resources/images/bg-8527.png'
import bg7 from '../resources/images/bg-8556.png'
import icon5 from '../resources/images/icon-8444.png'
import icon6 from '../resources/images/icon-8473.png'
import icon7 from '../resources/images/icon-8503.png'
import icon8 from '../resources/images/icon-8532.png'
import icon9 from '../resources/images/icon-8561.png'
import icon10 from '../resources/images/icon-8590.png'
import icon11 from '../resources/images/icon-8648.png'

import { ref, onMounted } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const stats = ref({
  deviceType: 28,
  deviceTotal: 68562,
  goodRate: '98%'
})

const activeSwitch = ref('tunnel')
const switchTabs = ref([
  { key: 'tunnel', label: '隧道设备', icon: icon3, bg: bg1, total: 56302, error: 5 },
  { key: 'bridge', label: '南北接线 设备', icon: icon4, bg: bg2, total: 1280, error: 3 }
])

const activeLeftTab = ref('monitor')
const leftTabs = ref([
  { key: 'monitor', label: '监控' },
  { key: 'lighting', label: '照明' },
  { key: 'ventilation', label: '通风' },
  { key: 'power', label: '供配电' },
  { key: 'fire', label: '消防' },
  { key: 'traffic', label: '交通诱导' }
])

const cardBgs = [bg3, bg4, bg5, bg6, bg7, bg8]
const cardIcons = [icon5, icon6, icon7, icon8, icon9, icon10, icon11]

const cards = ref([
  { label: '摄像机', value: '(2/484)', icon: cardIcons[0], bg: cardBgs[0] },
  { label: '风速风向仪', value: '(1/484)', icon: cardIcons[1], bg: cardBgs[1] },
  { label: '超高检测器', value: '(0/484)', icon: cardIcons[2], bg: cardBgs[2] },
  { label: '烟道机器人', value: '(0/484)', icon: cardIcons[3], bg: cardBgs[3] },
  { label: '激光雷达', value: '(0/484)', icon: cardIcons[4], bg: cardBgs[4] },
  { label: 'CO2传感器', value: '(0/484)', icon: cardIcons[5], bg: cardBgs[5] },
  { label: 'CO/VI检测器', value: '(0/484)', icon: cardIcons[6], bg: cardBgs[0] },
  { label: '温湿度传感器', value: '(0/484)', icon: cardIcons[0], bg: cardBgs[1] },
  { label: '压力传感器', value: '(0/484)', icon: cardIcons[1], bg: cardBgs[2] },
  { label: '光照度变送器', value: '(0/484)', icon: cardIcons[2], bg: cardBgs[3] },
  { label: '紧急电话', value: '(0/484)', icon: cardIcons[3], bg: cardBgs[4] },
  { label: '水质监测设备', value: '(0/484)', icon: cardIcons[4], bg: cardBgs[5] }
])

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785400257658-7f2c4def-onload', {
      componentId: 'mc-1785400257658-7f2c4def',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>