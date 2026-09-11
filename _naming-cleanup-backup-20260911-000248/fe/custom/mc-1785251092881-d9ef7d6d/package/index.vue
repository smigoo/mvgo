<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <!-- 修复：在标题左侧自然位置使用 g 图标资源 icon1 -->
      <img :src="icon1" alt="标题装饰" class="c-mc-1785251092881-d9ef7d6d-title-dot" />
    </template>

    <template #header-right>
      <div class="c-mc-1785251092881-d9ef7d6d-header-metrics">
        <div class="c-mc-1785251092881-d9ef7d6d-header-metric">
          <span class="c-mc-1785251092881-d9ef7d6d-header-metric-label">设备类型</span>
          <span class="c-mc-1785251092881-d9ef7d6d-header-metric-value">{{ deviceTypeCount }}</span>
        </div>
        <div class="c-mc-1785251092881-d9ef7d6d-header-metric">
          <span class="c-mc-1785251092881-d9ef7d6d-header-metric-label">设备总数</span>
          <span class="c-mc-1785251092881-d9ef7d6d-header-metric-value">{{ overview.total }}</span>
        </div>
        <div class="c-mc-1785251092881-d9ef7d6d-header-metric">
          <span class="c-mc-1785251092881-d9ef7d6d-header-metric-label">完好率</span>
          <span class="c-mc-1785251092881-d9ef7d6d-header-metric-value c-mc-1785251092881-d9ef7d6d-header-metric-value-rate">{{ intactRateText }}</span>
        </div>
        <!-- 修复：在标题栏右侧操作区自然位置使用 Frame 图标资源 icon2 -->
        <img :src="icon2" alt="设备操作" class="c-mc-1785251092881-d9ef7d6d-header-action-icon" />
      </div>
    </template>

    <div class="c-mc-1785251092881-d9ef7d6d-root" :class="themeClass">
      <div v-if="visibleCards.length || config.showSystemPanel" class="c-mc-1785251092881-d9ef7d6d-body">
        <div class="c-mc-1785251092881-d9ef7d6d-switch-row">
          <button
            v-for="tab in scopeTabs"
            :key="tab.key"
            type="button"
            :class="[
              'c-mc-1785251092881-d9ef7d6d-switch-item',
              activeScope === tab.key ? 'c-mc-1785251092881-d9ef7d6d-switch-item-active' : 'c-mc-1785251092881-d9ef7d6d-switch-item-default'
            ]"
            :style="{
              // 修复：使用 bg1/bg2 作为 switch 背景图资源，禁止用渐变替代已下载 bg 图片
              backgroundImage: `url(${tab.bg})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
            @click="handleScopeChange(tab.key)"
          >
            <span class="c-mc-1785251092881-d9ef7d6d-switch-text">{{ tab.label }}</span>
            <img :src="tab.icon" :alt="tab.label" class="c-mc-1785251092881-d9ef7d6d-switch-icon" />
          </button>
        </div>

        <div class="c-mc-1785251092881-d9ef7d6d-summary-grid">
          <div
            v-for="card in visibleCards"
            :key="card.key"
            class="c-mc-1785251092881-d9ef7d6d-summary-card"
            :style="{
              // 修复：统计卡片使用 bg3-bg6 背景图资源，禁止用纯色或渐变替代
              backgroundImage: `url(${card.bg})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <img :src="card.icon" :alt="card.label" class="c-mc-1785251092881-d9ef7d6d-summary-icon" />
            <div class="c-mc-1785251092881-d9ef7d6d-summary-text-group">
              <span class="c-mc-1785251092881-d9ef7d6d-summary-label">{{ card.label }}</span>
              <span :class="card.valueClass">{{ card.value }}<small v-if="card.unit">{{ card.unit }}</small></span>
            </div>
          </div>
        </div>

        <div v-if="config.showSystemPanel" class="c-mc-1785251092881-d9ef7d6d-system-area">
          <button
            v-for="system in systemList"
            :key="system.name"
            type="button"
            :class="[
              'c-mc-1785251092881-d9ef7d6d-system-panel',
              expandedSystem === system.name ? 'c-mc-1785251092881-d9ef7d6d-system-panel-expanded' : ''
            ]"
            :style="{
              // 修复：系统面板使用 bg7/bg8 背景图资源，补齐所有 HIGH 级 bg 资源引用
              backgroundImage: `url(${system.bg})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
            @click="toggleSystem(system)"
          >
            <div class="c-mc-1785251092881-d9ef7d6d-system-head">
              <img :src="system.icon" :alt="system.name" class="c-mc-1785251092881-d9ef7d6d-system-icon" />
              <div class="c-mc-1785251092881-d9ef7d6d-system-title-group">
                <span class="c-mc-1785251092881-d9ef7d6d-system-title">{{ system.name }}</span>
                <span class="c-mc-1785251092881-d9ef7d6d-system-count">{{ system.total }}台</span>
              </div>
              <span
                v-if="system.abnormal > 0"
                class="c-mc-1785251092881-d9ef7d6d-warning-tag"
              >报修</span>
            </div>

            <div
              v-if="expandedSystem === system.name"
              class="c-mc-1785251092881-d9ef7d6d-device-list"
            >
              <div
                v-for="device in getSystemDeviceTypes(system)"
                :key="device.code"
                class="c-mc-1785251092881-d9ef7d6d-device-row"
                @click.stop="handleDeviceTypeClick(device, system)"
              >
                <span class="c-mc-1785251092881-d9ef7d6d-device-name">{{ device.name }}</span>
                <span class="c-mc-1785251092881-d9ef7d6d-device-total">{{ device.total }}台</span>
                <span
                  v-if="device.abnormal > 0"
                  class="c-mc-1785251092881-d9ef7d6d-device-warning"
                >{{ device.abnormal }}异常</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div v-else class="c-mc-1785251092881-d9ef7d6d-empty">
        {{ config.emptyText }}
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-8421.png'
import icon2 from '../resources/images/Frame-8856.png'
import bg1 from '../resources/images/bg-8788.png'
import bg2 from '../resources/images/bg-8807.png'
import bg3 from '../resources/images/bg-8439.png'
import bg6 from '../resources/images/bg-8527.png'
import bg7 from '../resources/images/bg-8556.png'
import bg8 from '../resources/images/bg-8585.png'
import icon3 from '../resources/images/icon-8798.png'
import icon4 from '../resources/images/icon-8817.png'
import icon5 from '../resources/images/icon-8444.png'
import icon6 from '../resources/images/icon-8473.png'
import bg4 from '../resources/images/bg-8468.png'
import icon7 from '../resources/images/icon-8503.png'
import bg5 from '../resources/images/bg-8498.png'
import icon8 from '../resources/images/icon-8532.png'
import icon9 from '../resources/images/icon-8590.png'

import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'

const componentId = 'mc-1785251092881-d9ef7d6d'
const componentProps = {
  themeType: 'dark',
  layoutType: 'one'
}

let runtimeBuilder = null
let businessProps = {}
let componentApi = null

try {
  const builder = typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
    ? window.$mcComponentBuilder({
      componentId,
      componentProps,
      componentName: 'mc-1785251092881-d9ef7d6d'
    })
    : null
  runtimeBuilder = builder?.runtimeBuilder || null
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi || null
  if (builder?.componentProps) {
    Object.assign(componentProps, builder.componentProps)
  }
} catch (error) {
  console.warn('[设备监测] 微码组件构建器初始化失败：', error)
}

provide('componentApi', componentApi)

const declareDefaults = {
  sectionNum: 'S23-JY',
  sectionName: '隧道',
  pollInterval: 60000,
  showTotalCard: true,
  showOnlineCard: true,
  showAbnormalCard: true,
  showRateCard: true,
  showSystemPanel: true,
  allowExpand: true,
  emptyText: '暂无设备数据'
}

function getConfig(key, defaultValue) {
  const value = businessProps?.[key]
  if (value !== undefined && value !== null) return value
  if (declareDefaults[key] !== undefined && declareDefaults[key] !== null) return declareDefaults[key]
  return defaultValue
}

const config = computed(() => ({
  sectionNum: getConfig('sectionNum', 'S23-JY'),
  sectionName: getConfig('sectionName', '隧道'),
  pollInterval: getConfig('pollInterval', 60000),
  showTotalCard: getConfig('showTotalCard', true) !== false,
  showOnlineCard: getConfig('showOnlineCard', true) !== false,
  showAbnormalCard: getConfig('showAbnormalCard', true) !== false,
  showRateCard: getConfig('showRateCard', true) !== false,
  showSystemPanel: getConfig('showSystemPanel', true) !== false,
  allowExpand: getConfig('allowExpand', true) !== false,
  emptyText: getConfig('emptyText', '暂无设备数据')
}))

const themeClass = computed(() => componentProps.themeType || 'dark')
const currentSection = ref({
  sectionNum: config.value.sectionNum,
  sectionName: config.value.sectionName
})

const activeScope = ref('tunnel')
const expandedSystem = ref('视频监控系统')

const overview = ref({
  total: 68562,
  online: 67280,
  abnormal: 1282,
  onlineRate: 98,
  systemList: [
    { name: '视频监控系统', code: 'video', total: 16820, online: 16540, abnormal: 280 },
    { name: '照明控制系统', code: 'light', total: 12800, online: 12640, abnormal: 160 },
    { name: '通风消防系统', code: 'fire', total: 9650, online: 9440, abnormal: 210 },
    { name: '供配电系统', code: 'power', total: 11290, online: 11080, abnormal: 210 },
    { name: '通信广播系统', code: 'comm', total: 8420, online: 8260, abnormal: 160 },
    { name: '环境检测系统', code: 'env', total: 9582, online: 9320, abnormal: 262 }
  ],
  deviceTypeList: [
    { code: 'camera', name: '摄像机', systemName: '视频监控系统', total: 9800, abnormal: 120 },
    { code: 'decoder', name: '视频解码器', systemName: '视频监控系统', total: 7020, abnormal: 160 },
    { code: 'lamp', name: '照明灯具', systemName: '照明控制系统', total: 10200, abnormal: 100 },
    { code: 'controller', name: '控制器', systemName: '照明控制系统', total: 2600, abnormal: 60 },
    { code: 'fan', name: '射流风机', systemName: '通风消防系统', total: 4160, abnormal: 90 },
    { code: 'hydrant', name: '消防设备', systemName: '通风消防系统', total: 5490, abnormal: 120 },
    { code: 'ups', name: 'UPS设备', systemName: '供配电系统', total: 4280, abnormal: 80 },
    { code: 'cabinet', name: '配电柜', systemName: '供配电系统', total: 7010, abnormal: 130 },
    { code: 'broadcast', name: '广播设备', systemName: '通信广播系统', total: 3540, abnormal: 70 },
    { code: 'phone', name: '紧急电话', systemName: '通信广播系统', total: 4880, abnormal: 90 },
    { code: 'sensor', name: '环境传感器', systemName: '环境检测系统', total: 6300, abnormal: 160 },
    { code: 'detector', name: '检测主机', systemName: '环境检测系统', total: 3282, abnormal: 102 }
  ]
})

provide('deviceOverview', overview)

const scopeTabs = computed(() => [
  {
    key: 'tunnel',
    label: '隧道设备',
    bg: bg1,
    icon: icon3
  },
  {
    key: 'connection',
    label: '南北接线设备',
    bg: bg2,
    icon: icon4
  }
])

const summaryCards = computed(() => [
  {
    key: 'total',
    label: '设备总数',
    value: overview.value.total,
    unit: '台',
    icon: icon5,
    bg: bg3,
    visible: config.value.showTotalCard,
    valueClass: 'c-mc-1785251092881-d9ef7d6d-summary-value c-mc-1785251092881-d9ef7d6d-summary-value-total'
  },
  {
    key: 'online',
    label: '在线设备',
    value: overview.value.online,
    unit: '台',
    icon: icon6,
    bg: bg4,
    visible: config.value.showOnlineCard,
    valueClass: 'c-mc-1785251092881-d9ef7d6d-summary-value c-mc-1785251092881-d9ef7d6d-summary-value-online'
  },
  {
    key: 'abnormal',
    label: '异常设备',
    value: overview.value.abnormal,
    unit: '台',
    icon: icon7,
    bg: bg5,
    visible: config.value.showAbnormalCard,
    valueClass: 'c-mc-1785251092881-d9ef7d6d-summary-value c-mc-1785251092881-d9ef7d6d-summary-value-abnormal'
  },
  {
    key: 'rate',
    label: '在线率',
    value: overview.value.onlineRate,
    unit: '%',
    icon: icon8,
    bg: bg6,
    visible: config.value.showRateCard,
    valueClass: 'c-mc-1785251092881-d9ef7d6d-summary-value c-mc-1785251092881-d9ef7d6d-summary-value-rate'
  }
])

const visibleCards = computed(() => summaryCards.value.filter((card) => card.visible))

const systemList = computed(() => {
  const list = Array.isArray(overview.value.systemList) ? overview.value.systemList : []
  const bgList = [bg7, bg8]
  const iconList = [icon9, icon5, icon6, icon7, icon8, icon9]
  return list.map((item, index) => ({
    ...item,
    bg: bgList[index % bgList.length],
    icon: iconList[index % iconList.length]
  }))
})

const deviceTypeCount = computed(() => {
  const list = overview.value.deviceTypeList
  return Array.isArray(list) ? list.length : 0
})

const intactRateText = computed(() => {
  const total = Number(overview.value.total) || 0
  const abnormal = Number(overview.value.abnormal) || 0
  if (!total) return '0%'
  return `${Math.round(((total - abnormal) / total) * 100)}%`
})

const normalizeOverview = (source) => {
  const sourceData = source && typeof source === 'object' ? source : {}
  const total = Number(sourceData.total ?? overview.value.total ?? 0)
  const online = Number(sourceData.online ?? overview.value.online ?? 0)
  const abnormal = Number(sourceData.abnormal ?? overview.value.abnormal ?? 0)
  const onlineRate = Number(sourceData.onlineRate ?? (total ? Math.round((online / total) * 100) : 0))
  return {
    total,
    online,
    abnormal,
    onlineRate,
    systemList: Array.isArray(sourceData.systemList) ? sourceData.systemList : overview.value.systemList,
    deviceTypeList: Array.isArray(sourceData.deviceTypeList) ? sourceData.deviceTypeList : overview.value.deviceTypeList
  }
}

const publishDataLoaded = () => {
  runtimeBuilder?.publishEvent?.('data-loaded', {
    sectionNum: currentSection.value.sectionNum,
    total: Number(overview.value.total) || 0,
    online: Number(overview.value.online) || 0,
    abnormal: Number(overview.value.abnormal) || 0,
    onlineRate: Number(overview.value.onlineRate) || 0
  })
}

const fetchDeviceOverview = async (sectionNum = currentSection.value.sectionNum) => {
  currentSection.value.sectionNum = sectionNum || currentSection.value.sectionNum
  const params = {
    sectionNum: currentSection.value.sectionNum,
    sectionName: currentSection.value.sectionName,
    scope: activeScope.value
  }

  try {
    if (componentApi?.getCommonApiFindOne) {
      const response = await componentApi.getCommonApiFindOne(params, 'device_overview')
      overview.value = normalizeOverview(response)
    } else {
      overview.value = normalizeOverview({})
    }
  } catch (error) {
    console.warn('[设备监测] 获取设备总览数据失败，已使用兜底数据：', error)
    overview.value = normalizeOverview({})
  }

  publishDataLoaded()
}

const handleScopeChange = (key) => {
  if (activeScope.value === key) return
  activeScope.value = key
}

const toggleSystem = (system) => {
  if (!config.value.allowExpand) return
  const nextExpanded = expandedSystem.value === system.name ? '' : system.name
  expandedSystem.value = nextExpanded
  runtimeBuilder?.publishEvent?.('system-expand', {
    systemName: system.name,
    expanded: nextExpanded === system.name
  })
}

const getSystemDeviceTypes = (system) => {
  const list = Array.isArray(overview.value.deviceTypeList) ? overview.value.deviceTypeList : []
  return list.filter((item) => item.systemName === system.name || item.systemCode === system.code)
}

const handleDeviceTypeClick = (device, system) => {
  runtimeBuilder?.publishEvent?.('device-type-click', {
    deviceTypeCode: device.code,
    deviceTypeName: device.name,
    systemName: system.name
  })
}

const handleRefreshData = (payload = {}) => {
  fetchDeviceOverview(payload.sectionNum || currentSection.value.sectionNum)
}

const handleSetSection = (payload = {}) => {
  currentSection.value = {
    sectionNum: payload.sectionNum || currentSection.value.sectionNum,
    sectionName: payload.sectionName || currentSection.value.sectionName
  }
  fetchDeviceOverview(currentSection.value.sectionNum)
}

const handleExpandSystem = (payload = {}) => {
  if (!payload.systemName) return
  const target = systemList.value.find((item) => item.name === payload.systemName)
  if (!target) return
  expandedSystem.value = target.name
  runtimeBuilder?.publishEvent?.('system-expand', {
    systemName: target.name,
    expanded: true
  })
}

const emitLoadEvent = () => {
  runtimeBuilder?.publishEvent?.('mc-1785251092881-d9ef7d6d-onload', {
    componentId,
    timestamp: Date.now(),
    sectionNum: currentSection.value.sectionNum
  })
}

let refreshTimer = null

const startPolling = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  const interval = Number(config.value.pollInterval) || 60000
  refreshTimer = setInterval(() => {
    fetchDeviceOverview()
  }, interval)
}

watch(activeScope, () => {
  fetchDeviceOverview()
})

watch(
  () => config.value.pollInterval,
  () => {
    startPolling()
  }
)

onMounted(() => {
  emitLoadEvent()
  fetchDeviceOverview()
  startPolling()

  runtimeBuilder?.listenEvent?.('refresh-data', handleRefreshData)
  runtimeBuilder?.listenEvent?.('set-section', handleSetSection)
  runtimeBuilder?.listenEvent?.('expand-system', handleExpandSystem)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  runtimeBuilder?.removeListener?.('refresh-data')
  runtimeBuilder?.removeListener?.('set-section')
  runtimeBuilder?.removeListener?.('expand-system')
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>