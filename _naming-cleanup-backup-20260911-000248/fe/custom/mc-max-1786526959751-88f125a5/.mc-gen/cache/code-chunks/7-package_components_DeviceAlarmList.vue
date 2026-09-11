<template>
  <div class="c-device-alarm-root">
    <!-- 左侧分类Tab -->
    <div class="c-device-alarm-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.key"
        :class="['c-device-alarm-tab-item', { 'is-active': activeTab === tab.key }]"
        :style="getTabBgStyle(tab)"
        @click="activeTab = tab.key"
      >
        <span class="c-device-alarm-tab-text">{{ tab.label }}</span>
        <span v-if="tab.badge" class="c-device-alarm-tab-badge">{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 右侧设备网格列表 -->
    <div class="c-device-alarm-grid">
      <div
        v-for="device in devices"
        :key="device.label"
        class="c-device-alarm-card"
        :style="{ backgroundImage: `url(${device.bg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
      >
        <img :src="device.icon" class="c-device-alarm-card-icon" :alt="device.label" />
        <div class="c-device-alarm-card-info">
          <span class="c-device-alarm-card-label">{{ device.label }}</span>
          <span class="c-device-alarm-card-value">
            <span :class="device.error > 0 ? 'is-error' : 'is-normal'">({{ device.error }}</span>
            <span class="is-total">/{{ device.total }})</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

// --- Tab 配置 ---
const tabs = ref([
  { key: 'monitor', label: '监控' },
  { key: 'lighting', label: '照明', badge: '3' },
  { key: 'ventilation', label: '通风' },
  { key: 'power', label: '供配电' },
  { key: 'fire', label: '消防' },
  { key: 'traffic', label: '交通诱导' }
])

const activeTab = ref('monitor')

// --- 设备基础配置（图标与背景映射） ---
const baseDevices = [
  { label: '摄像机', icon: icon7, bg: bg8 },
  { label: '风速风向仪', icon: icon8, bg: bg9 },
  { label: '超高检测器', icon: icon9, bg: bg10 },
  { label: '烟道机器人', icon: icon10, bg: bg11 },
  { label: '激光雷达', icon: icon11, bg: bg12 },
  { label: 'CO2传感器', icon: icon12, bg: bg13 },
  { label: 'CO/VI检测器', icon: icon13, bg: bg14 },
  { label: '温湿度传感器', icon: icon14, bg: bg15 },
  { label: '压力传感器', icon: icon15, bg: bg16 },
  { label: '光照度变送器', icon: icon16, bg: bg17 },
  { label: '紧急电话', icon: icon3, bg: bg18 },
  { label: '水质监测设备', icon: icon4, bg: bg19 }
]

// --- 数据生成与状态 ---
const generateMockData = (tabKey) => {
  if (tabKey === 'monitor') {
    return baseDevices.map((d, i) => ({
      ...d,
      error: i === 0 ? 2 : i === 1 ? 1 : 0,
      total: 484
    }))
  }
  
  // 其他分类的 Mock 数据演示
  return baseDevices.map(d => ({
    ...d,
    error: 0,
    total: Math.floor(Math.random() * 100) + 50
  }))
}

const devices = ref(generateMockData('monitor'))

// --- Tab 切换联动 ---
watch(activeTab, (newTab) => {
  devices.value = generateMockData(newTab)
})

// --- Tab 背景样式计算 ---
const getTabBgStyle = (tab) => {
  if (activeTab.value === tab.key) {
    return {
      background: 'linear-gradient(270deg, #318aff 0%, #70bfff 100%)',
      backgroundSize: '100% 100%'
    }
  }
  
  const bgMap = {
    'lighting': bg3,
    'ventilation': bg4,
    'fire': bg5,
    'traffic': bg6,
    'power': bg7
  }
  
  const bg = bgMap[tab.key]
  if (bg) {
    return {
      backgroundImage: `url(${bg})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }
  }
  
  return {}
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-alarm-root {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  gap: 12px;
  min-height: 0;
}

.c-device-alarm-tabs {
  display: flex;
  flex-direction: column;
  width: 46px;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
}

.c-device-alarm-tab-item {
  width: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  padding: 4px 0;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  transition: all 0.3s;
  
  &.is-active {
    .c-device-alarm-tab-text {
      color: #ffffff;
      font-weight: 700;
    }
  }
}

.c-device-alarm-tab-text {
  font-size: 14px;
  color: #333333;
  text-align: center;
  line-height: 1.2;
}

.c-device-alarm-tab-badge {
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
  margin-top: 2px;
}

.c-device-alarm-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 8px;
  min-width: 0;
  min-height: 0;
}

.c-device-alarm-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px;
  gap: 8px;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  min-width: 0;
}

.c-device-alarm-card-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
}

.c-device-alarm-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.c-device-alarm-card-label {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-device-alarm-card-value {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 18.75px;
  
  .is-error {
    color: #f53f3f;
  }
  
  .is-normal {
    color: #08a3a5;
  }
  
  .is-total {
    color: #999999;
  }
}
</style>