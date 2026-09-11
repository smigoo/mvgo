<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <div class="c-mc-1785238301016-77e87ecc-title-left">
        <!-- 修复：使用已下载的标题图标资源，避免图标位空缺 -->
        <img :src="icon1" alt="标题标识" class="c-mc-1785238301016-77e87ecc-title-left-icon" />
      </div>
    </template>

    <template #title-right>
      <div class="c-mc-1785238301016-77e87ecc-title-right">
        <!-- 修复：补充标题右侧的状态/时间信息 -->
        <img :src="icon2" alt="更新时间标识" class="c-mc-1785238301016-77e87ecc-title-right-icon" />
        <span class="c-mc-1785238301016-77e87ecc-title-right-text">1111{{ titleRightText }}</span>
      </div>
    </template>

    <template #header-right>
      <div class="c-mc-1785238301016-77e87ecc-header-stats">
        <div
          v-for="item in headerStats"
          :key="item.key"
          class="c-mc-1785238301016-77e87ecc-header-stat-item"
        >
          <span class="c-mc-1785238301016-77e87ecc-header-stat-label">{{ item.label }}</span>
          <span
            class="c-mc-1785238301016-77e87ecc-header-stat-value"
            :style="item.type === 'teal' ? tealTextStyle : gradientTextStyle"
          >
            {{ item.value }}
          </span>
        </div>
      </div>
    </template>

    <div class="c-mc-1785238301016-77e87ecc-body">
      <div class="c-mc-1785238301016-77e87ecc-switch-row">
        <div
          v-for="item in switchCards"
          :key="item.key"
          class="c-mc-1785238301016-77e87ecc-switch-card"
          :class="{ 'is-active': activeSwitch === item.key }"
          :style="getBgStyle(item.bg)"
          @click="activeSwitch = item.key"
        >
          <!-- 修复：在自然布局位置使用已下载的 icon 资源 -->
          <img :src="item.icon" :alt="item.label" class="c-mc-1785238301016-77e87ecc-switch-card-icon" />
          <div class="c-mc-1785238301016-77e87ecc-switch-card-text">
            <span
              class="c-mc-1785238301016-77e87ecc-switch-card-title"
              :style="{ color: activeSwitch === item.key ? '#ffffff' : '#333333' }"
            >
              {{ item.label }}
            </span>
            <span
              class="c-mc-1785238301016-77e87ecc-switch-card-subtitle"
              :style="{ color: activeSwitch === item.key ? '#ffffff' : '#333333' }"
            >
              {{ item.subLabel }}
            </span>
          </div>
        </div>
      </div>

      <div class="c-mc-1785238301016-77e87ecc-tab-layout">
        <div class="c-mc-1785238301016-77e87ecc-tab-rail">
          <div
            v-for="tab in tabList"
            :key="tab.key"
            class="c-mc-1785238301016-77e87ecc-tab-item"
            :class="{ 'is-active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <span class="c-mc-1785238301016-77e87ecc-tab-item-text">{{ tab.label }}</span>
          </div>
        </div>

        <div class="c-mc-1785238301016-77e87ecc-card-panel">
          <div class="c-mc-1785238301016-77e87ecc-card-grid">
            <div
              v-for="card in visibleCards"
              :key="card.key"
              class="c-mc-1785238301016-77e87ecc-device-card"
              :style="getBgStyle(card.bg)"
            >
              <!-- 修复：为每个卡片补充自然位置图标，避免可用 icon 资源闲置 -->
              <img :src="card.icon" :alt="card.label" class="c-mc-1785238301016-77e87ecc-device-card-icon" />
              <div class="c-mc-1785238301016-77e87ecc-device-card-text">
                <span class="c-mc-1785238301016-77e87ecc-device-card-label">{{ card.label }}</span>
                <span class="c-mc-1785238301016-77e87ecc-device-card-value">
                  {{ card.value }}
                  <small v-if="card.unit">{{ card.unit }}</small>
                </span>
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
import icon5 from '../resources/images/icon-8444.png'
import bg3 from '../resources/images/bg-8439.png'
import icon6 from '../resources/images/icon-8473.png'
import bg4 from '../resources/images/bg-8468.png'
import icon7 from '../resources/images/icon-8503.png'
import bg5 from '../resources/images/bg-8498.png'
import icon8 from '../resources/images/icon-8532.png'
import bg6 from '../resources/images/bg-8527.png'
import bg7 from '../resources/images/bg-8556.png'
import bg8 from '../resources/images/bg-8614.png'

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const componentId = 'mc-1785238301016-77e87ecc'
const componentName = 'cp-设备监测'

let runtimeBuilder = null
let businessProps = {}
let componentProps = {}

try {
  if (typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function') {
    const builder = window.$mcComponentBuilder({
      componentId,
      componentProps: {},
      componentName
    })
    runtimeBuilder = builder?.runtimeBuilder || null
    businessProps = builder?.businessProps || {}
    componentProps = builder?.componentProps || {}
  }
} catch (error) {
  console.warn('组件构建器初始化失败：', error)
}

const activeSwitch = ref('tunnel')
const activeTab = ref('all')
const lastUpdateAt = ref(Date.now())

const autoRefresh = computed(() => businessProps?.autoRefresh !== false)
const refreshIntervalMs = computed(() => (businessProps?.refreshInterval ?? 30) * 1000)

const gradientTextStyle = {
  background: 'linear-gradient(270deg, #e1f0ff 0%, #00ccff 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent'
}

const tealTextStyle = {
  color: '#08a3a5'
}

const headerStats = [
  {
    key: 'deviceType',
    label: '设备类型',
    value: '28',
    type: 'gradient'
  },
  {
    key: 'deviceTotal',
    label: '设备总数',
    value: '68562',
    type: 'gradient'
  },
  {
    key: 'integrityRate',
    label: '完好率',
    value: '98%',
    type: 'teal'
  }
]

const switchCards = [
  {
    key: 'tunnel',
    label: '隧道设备',
    subLabel: 't-隧道设备',
    icon: icon3,
    bg: bg1
  },
  {
    key: 'junction',
    label: '南北接线设备',
    subLabel: '南北接线 设备',
    icon: icon4,
    bg: bg2
  }
]

const tabList = [
  { key: 'all', label: '全部' },
  { key: 'online', label: '在线' },
  { key: 'offline', label: '离线' },
  { key: 'alarm', label: '告警' },
  { key: 'maintain', label: '维护' }
]

const cardSets = {
  tunnel: [
    { key: 'tunnel-1', label: '监控设备', value: '128', unit: '台', status: 'online', icon: icon5, bg: bg3 },
    { key: 'tunnel-2', label: '照明设备', value: '56', unit: '台', status: 'online', icon: icon6, bg: bg4 },
    { key: 'tunnel-3', label: '通风设备', value: '24', unit: '台', status: 'alarm', icon: icon7, bg: bg5 },
    { key: 'tunnel-4', label: '供配电', value: '18', unit: '台', status: 'offline', icon: icon8, bg: bg6 },
    { key: 'tunnel-5', label: '广播系统', value: '12', unit: '台', status: 'maintain', icon: icon1, bg: bg7 },
    { key: 'tunnel-6', label: '消防设备', value: '39', unit: '台', status: 'online', icon: icon2, bg: bg8 }
  ],
  junction: [
    { key: 'junction-1', label: '主线监控', value: '96', unit: '台', status: 'online', icon: icon6, bg: bg3 },
    { key: 'junction-2', label: '联络通道', value: '44', unit: '台', status: 'online', icon: icon7, bg: bg4 },
    { key: 'junction-3', label: '交通诱导', value: '21', unit: '台', status: 'alarm', icon: icon8, bg: bg5 },
    { key: 'junction-4', label: '应急广播', value: '19', unit: '台', status: 'offline', icon: icon5, bg: bg6 },
    { key: 'junction-5', label: '环境监测', value: '8', unit: '台', status: 'maintain', icon: icon2, bg: bg7 },
    { key: 'junction-6', label: '供电终端', value: '27', unit: '台', status: 'online', icon: icon1, bg: bg8 }
  ]
}

const visibleCards = computed(() => {
  const list = cardSets[activeSwitch.value] || []
  if (activeTab.value === 'all') {
    return list
  }
  return list.filter((item) => item.status === activeTab.value)
})

const titleRightText = computed(() => `更新时间：${formatDateTime(lastUpdateAt.value)}`)

let refreshTimer = null

function formatDateTime(timestamp) {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}:${s}`
}

function getBgStyle(bg) {
  return {
    backgroundImage: `url(${bg})`,
    backgroundSize: '100% 100%',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat'
  }
}

function updateClock() {
  lastUpdateAt.value = Date.now()
}

watch(activeSwitch, () => {
  activeTab.value = 'all'
})

onMounted(() => {
  // 修复：补充组件加载事件上报，保证微码生命周期完整
  runtimeBuilder?.publishEvent(`${componentId}-onload`, {
    componentId,
    componentName
  })

  updateClock()

  if (autoRefresh.value) {
    refreshTimer = window.setInterval(() => {
      updateClock()
    }, refreshIntervalMs.value)
  }
})

onUnmounted(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>