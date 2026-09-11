<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备类型</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-blue">28</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备总数</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-blue">68562</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">完好率</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-green">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-content">
      <div class="c-monitor-sidebar">
        <div 
          v-for="(tab, index) in tabs" 
          :key="tab.label" 
          :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === index }]"
          :style="{ backgroundImage: activeTab === index ? 'none' : `url(${getTabBg(index)})` }"
          @click="activeTab = index"
        >
          <span class="c-monitor-tab-text">{{ tab.label }}</span>
          <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
        </div>
      </div>

      <div class="c-monitor-right">
        <div class="c-monitor-summary-cards">
          <div 
            v-for="card in summaryCards" 
            :key="card.title" 
            class="c-monitor-summary-card"
            :style="{ backgroundImage: `url(${card.bg})` }"
          >
            <img :src="card.icon" class="c-monitor-card-icon" />
            <div class="c-monitor-card-content">
              <span :class="['c-monitor-card-title', card.theme === 'light' ? 'c-monitor-card-title--light' : 'c-monitor-card-title--dark']">{{ card.title }}</span>
              <div class="c-monitor-card-row">
                <span :class="['c-monitor-card-label', card.theme === 'light' ? 'c-monitor-card-label--light' : 'c-monitor-card-label--dark']">总数:</span>
                <span :class="['c-monitor-card-value', card.theme === 'light' ? 'c-monitor-card-value--light' : 'c-monitor-card-value--blue']">{{ card.total }}</span>
              </div>
              <div class="c-monitor-card-row">
                <span :class="['c-monitor-card-label', card.theme === 'light' ? 'c-monitor-card-label--light' : 'c-monitor-card-label--dark']">异常数:</span>
                <span class="c-monitor-card-value c-monitor-card-value--danger">{{ card.error }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="c-monitor-device-grid">
          <div 
            v-for="(device, index) in devices" 
            :key="device.label" 
            class="c-monitor-device-item"
            :style="{ backgroundImage: `url(${getDeviceBg(index)})` }"
          >
            <img :src="getDeviceIcon(index)" class="c-monitor-device-icon" />
            <span class="c-monitor-device-label">{{ device.label }}</span>
            <div class="c-monitor-device-value">
              <span class="c-monitor-device-bracket">(</span>
              <span :class="device.error > 0 ? 'c-monitor-device-num--danger' : 'c-monitor-device-num--success'">{{ device.error }}</span>
              <span class="c-monitor-device-total">/{{ device.total }}</span>
              <span class="c-monitor-device-bracket">)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const tabs = ref([
  { label: '监控', badge: null },
  { label: '照明', badge: '3' },
  { label: '通风', badge: null },
  { label: '供配电', badge: null },
  { label: '消防', badge: null },
  { label: '交通诱导', badge: null }
])
const activeTab = ref(0)

const summaryCards = ref([
  {
    title: '隧道设备',
    total: 56302,
    error: 5,
    icon: icon3,
    bg: bg1,
    theme: 'light'
  },
  {
    title: '南北接线设备',
    total: 1280,
    error: 3,
    icon: icon4,
    bg: bg2,
    theme: 'dark'
  }
])

const devices = ref([
  { label: '摄像机', error: 2, total: 484 },
  { label: '风速风向仪', error: 1, total: 484 },
  { label: '超高检测器', error: 0, total: 484 },
  { label: '烟道机器人', error: 0, total: 484 },
  { label: '激光雷达', error: 0, total: 484 },
  { label: 'CO₂传感器', error: 0, total: 484 },
  { label: 'CO/VI检测器', error: 0, total: 484 },
  { label: '温湿度传感器', error: 0, total: 484 },
  { label: '压力传感器', error: 0, total: 484 },
  { label: '光照度变送器', error: 0, total: 484 },
  { label: '紧急电话', error: 0, total: 484 },
  { label: '水质监测设备', error: 0, total: 484 }
])

const getTabBg = (index) => {
  if (index === 5) return bg6
  if (index === 3) return bg7
  return bg3
}

const getDeviceBg = (index) => {
  const bgs = [bg8, bg9, bg10, bg11, bg12, bg13, bg14, bg15, bg16, bg17, bg18, bg19]
  return bgs[index]
}

const getDeviceIcon = (index) => {
  const icons = [icon5, icon6, icon7, icon8, icon9, icon10, icon11, icon12, icon13, icon14, icon15, icon16]
  return icons[index]
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-monitor',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-header-stats {
  display: flex;
  flex-direction: row;
  gap: 20px;
  align-items: center;
}

.c-monitor-stat-item {
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
}

.c-monitor-stat-label {
  font-size: 14px;
  color: #333333;
  font-family: 'Source Han Sans CN', sans-serif;
}

.c-monitor-stat-value {
  font-size: 20px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
}

.c-monitor-stat-value-blue {
  color: #1990ff;
}

.c-monitor-stat-value-green {
  color: #08a3a5;
}

.c-monitor-content {
  display: flex;
  flex-direction: row;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-sidebar {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-tab-item {
  width: 46px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;

  &--active {
    background: linear-gradient(270deg, #318aff 0%, #70bfff 100%) !important;
    
    .c-monitor-tab-text {
      color: #ffffff;
      font-weight: 700;
    }
  }
}

.c-monitor-tab-text {
  font-size: 14px;
  color: #333333;
  font-family: 'Source Han Sans CN', sans-serif;
  text-align: center;
}

.c-monitor-tab-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 50%;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Roboto', sans-serif;
}

.c-monitor-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

.c-monitor-summary-cards {
  display: flex;
  flex-direction: row;
  gap: 10px;
  flex-shrink: 0;
}

.c-monitor-summary-card {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12px;
  position: relative;
  overflow: hidden;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  min-height: 65px;
  box-sizing: border-box;
}

.c-monitor-card-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
}

.c-monitor-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 8px;
}

.c-monitor-card-title {
  font-size: 12px;
  font-family: 'YouSheBiaoTiHei', sans-serif;
}

.c-monitor-card-title--light {
  color: #ffffff;
}

.c-monitor-card-title--dark {
  color: #333333;
}

.c-monitor-card-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-monitor-card-label {
  font-size: 14px;
  font-family: 'Source Han Sans CN', sans-serif;
}

.c-monitor-card-label--light {
  color: #ffffff;
}

.c-monitor-card-label--dark {
  color: #333333;
}

.c-monitor-card-value {
  font-size: 20px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
}

.c-monitor-card-value--light {
  color: #ffffff;
}

.c-monitor-card-value--blue {
  color: #1990ff;
}

.c-monitor-card-value--danger {
  color: #f53f3f;
}

.c-monitor-device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  min-height: 0;
}

.c-monitor-device-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  position: relative;
  overflow: hidden;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  min-height: 64px;
  box-sizing: border-box;
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.c-monitor-device-label {
  font-size: 12px;
  color: #333333;
  font-family: 'Source Han Sans CN', sans-serif;
}

.c-monitor-device-value {
  display: flex;
  align-items: baseline;
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 18.75px;
  margin-top: 2px;
}

.c-monitor-device-num--danger {
  color: #f53f3f;
  font-weight: 700;
}

.c-monitor-device-num--success {
  color: #08a3a5;
  font-weight: 700;
}

.c-monitor-device-total {
  color: #999999;
  font-size: 12px;
}

.c-monitor-device-bracket {
  color: #999999;
  font-size: 12px;
}
</style>