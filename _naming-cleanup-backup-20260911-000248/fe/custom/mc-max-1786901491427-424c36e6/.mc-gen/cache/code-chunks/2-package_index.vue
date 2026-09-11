<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <img :src="icon1" class="c-device-monitor-title-dot" alt="标题装饰点" />
    </template>

    <template #title-right>
      <img :src="icon2" class="c-device-monitor-title-icon" alt="标题装饰图标" />
    </template>

    <template #header-right>
      <div class="c-device-monitor-header-stats">
        <div v-for="stat in headerStats" :key="stat.label" class="c-device-monitor-header-stat">
          <span class="c-device-monitor-header-stat-label">{{ stat.label }}</span>
          <span class="c-device-monitor-header-stat-value" :class="stat.valueClass">{{ stat.value }}</span>
        </div>
      </div>
    </template>

    <div class="c-device-monitor-body">
      <div class="c-device-monitor-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          :class="['c-device-monitor-tab', { active: activeTab === tab.id }]"
          @click="handleTabChange(tab.id)"
        >
          <span class="c-device-monitor-tab-label">{{ tab.name }}</span>
          <span v-if="tab.badge" class="c-device-monitor-tab-badge" :style="{ backgroundColor: tab.badge.color }">
            {{ tab.badge.text }}<small v-if="tab.badge.subText">{{ tab.badge.subText }}</small>
          </span>
        </div>
      </div>

      <div class="c-device-monitor-content">
        <div class="c-device-monitor-cards">
          <div
            v-for="card in summaryCards"
            :key="card.id"
            class="c-device-monitor-card"
            :class="card.cardClass"
          >
            <div class="c-device-monitor-card-info">
              <span class="c-device-monitor-card-label">{{ card.label }}</span>
              <div class="c-device-monitor-card-row">
                <span class="c-device-monitor-card-caption">{{ card.totalLabel }}</span>
                <span class="c-device-monitor-card-number" :class="card.totalValueClass">{{ card.totalValue }}</span>
              </div>
              <div class="c-device-monitor-card-row">
                <span class="c-device-monitor-card-caption">{{ card.abnormalLabel }}</span>
                <span class="c-device-monitor-card-number abnormal">{{ card.abnormalValue }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="c-device-monitor-device-grid">
          <div
            v-for="device in devices"
            :key="device.id"
            class="c-device-monitor-device-card"
          >
            <img :src="device.icon" class="c-device-monitor-device-icon" alt="设备图标" />
            <span class="c-device-monitor-device-label">{{ device.name }}</span>
            <span class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-abnormal" :class="{ zero: device.abnormal === '0' }">({{ device.abnormal }}</span>
              <span class="c-device-monitor-device-total">/{{ device.total }})</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[设备监测] $mcComponentBuilder 初始化失败:', e)
}

const headerStats = [
  { label: '设备类型', value: '28', valueClass: 'c-device-monitor-header-value-primary' },
  { label: '设备总数', value: '68562', valueClass: 'c-device-monitor-header-value-primary' },
  { label: '完好率', value: '98%', valueClass: 'c-device-monitor-header-value-teal' }
]

const tabs = [
  { id: 'monitoring', name: '监控', badge: { text: '3', color: '#f53f3f', subText: '/3740' } },
  { id: 'lighting', name: '照明', badge: { text: '3', color: '#f53f3f', subText: '' } },
  { id: 'ventilation', name: '通风', badge: null },
  { id: 'power-supply', name: '供配电', badge: null },
  { id: 'fire-fighting', name: '消防', badge: null },
  { id: 'traffic-guidance', name: '交通诱导', badge: null }
]

const activeTab = ref('monitoring')

const handleTabChange = (tabId) => {
  if (activeTab.value === tabId) return
  activeTab.value = tabId
}

watch(activeTab, (newTab) => {
  // 当前不同标签暂无独立设备数据，仅更新激活态；后续可扩展数据联动
  console.log('当前设备分类:', newTab)
})

const summaryCards = [
  {
    id: 'caitong',
    label: '财通设置',
    totalLabel: '总 数:',
    totalValue: '56302',
    abnormalLabel: '异常数:',
    abnormalValue: '5',
    cardClass: 'c-device-monitor-card-gradient',
    totalValueClass: ''
  },
  {
    id: 'nanbei',
    label: '南北拱顶设置',
    totalLabel: '总数:',
    totalValue: '1280',
    abnormalLabel: '异常数:',
    abnormalValue: '3',
    cardClass: 'c-device-monitor-card-white',
    totalValueClass: 'c-device-monitor-card-number-blue'
  }
]

const devices = [
  { id: 'camera', name: '摄像机', abnormal: '2', total: '484', icon: icon3 },
  { id: 'wind-speed', name: '风速风向位', abnormal: '1', total: '484', icon: icon4 },
  { id: 'height-detector', name: '超高检测器', abnormal: '0', total: '484', icon: icon5 },
  { id: 'smoke-robot', name: '烟道机器人', abnormal: '0', total: '484', icon: icon6 },
  { id: 'laser-radar', name: '激光雷达', abnormal: '0', total: '484', icon: icon7 },
  { id: 'co-sensor', name: 'CO/传感器', abnormal: '0', total: '484', icon: icon8 },
  { id: 'co-vi-detector', name: 'CO/VI检测器', abnormal: '0', total: '484', icon: icon9 },
  { id: 'temp-humidity', name: '温湿度传感器', abnormal: '0', total: '484', icon: icon10 },
  { id: 'pressure-sensor', name: '压力传感器', abnormal: '0', total: '484', icon: icon11 },
  { id: 'light-sensor', name: '光照度变送器', abnormal: '0', total: '484', icon: icon12 },
  { id: 'emergency-phone', name: '紧急电话', abnormal: '0', total: '484', icon: icon13 },
  { id: 'water-quality', name: '水质测设备', abnormal: '0', total: '484', icon: icon14 }
]

const emitLoadEvent = () => {
  if (!runtimeBuilder) return
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>