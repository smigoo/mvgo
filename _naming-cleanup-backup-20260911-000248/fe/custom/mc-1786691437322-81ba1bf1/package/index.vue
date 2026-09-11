<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备类型</span>
          <span class="c-monitor-stat-value c-monitor-stat-value--blue">28</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备总数</span>
          <span class="c-monitor-stat-value c-monitor-stat-value--blue">68562</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">完好率</span>
          <span class="c-monitor-stat-value c-monitor-stat-value--cyan">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-root">
      <div class="c-monitor-top-cards" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
        <div class="c-monitor-card c-monitor-card--tunnel">
          <div class="c-monitor-card-left">
            <img :src="icon5" class="c-monitor-card-icon" />
            <span class="c-monitor-card-title">隧道设备</span>
          </div>
          <div class="c-monitor-card-right">
            <div class="c-monitor-card-row">
              <span class="c-monitor-card-label">总数:</span>
              <span class="c-monitor-card-value c-monitor-card-value--white">56302</span>
            </div>
            <div class="c-monitor-card-row">
              <span class="c-monitor-card-label">异常数:</span>
              <span class="c-monitor-card-value c-monitor-card-value--red">5</span>
            </div>
          </div>
        </div>
        <div class="c-monitor-card c-monitor-card--north-south">
          <div class="c-monitor-card-left">
            <img :src="icon6" class="c-monitor-card-icon" />
            <span class="c-monitor-card-title">南北接线设备</span>
          </div>
          <div class="c-monitor-card-right">
            <div class="c-monitor-card-row">
              <span class="c-monitor-card-label">总数:</span>
              <span class="c-monitor-card-value c-monitor-card-value--blue">1280</span>
            </div>
            <div class="c-monitor-card-row">
              <span class="c-monitor-card-label">异常数:</span>
              <span class="c-monitor-card-value c-monitor-card-value--red">3</span>
            </div>
          </div>
        </div>
      </div>

      <div class="c-monitor-main-content">
        <div class="c-monitor-sidebar">
          <div 
            v-for="(tab, index) in tabs" 
            :key="tab.label"
            :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === index }]"
            :style="{ backgroundImage: `url(${tab.bg})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
            @click="activeTab = index"
          >
            <span v-if="tab.pagination" class="c-monitor-tab-pagination">{{ tab.pagination }}</span>
            <span class="c-monitor-tab-text">{{ tab.label }}</span>
            <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <div class="c-monitor-device-grid">
          <div 
            v-for="device in devices" 
            :key="device.name"
            class="c-monitor-device-item"
            :style="{ backgroundImage: `url(${device.bg})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="device.icon" class="c-monitor-device-icon" />
            <div class="c-monitor-device-info">
              <span class="c-monitor-device-name">{{ device.name }}</span>
              <span class="c-monitor-device-value">
                ({{ device.value }}/{{ device.total }})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-8788.png'
import icon5 from '../resources/images/icon-8444.png'
import icon6 from '../resources/images/icon-8473.png'
import bg3 from '../resources/images/bg-8831.png'
import bg4 from '../resources/images/bg-8831.png'
import bg5 from '../resources/images/bg-8831.png'
import bg6 from '../resources/images/bg-8847.png'
import bg7 from '../resources/images/bg-8852.png'
import icon7 from '../resources/images/icon-8503.png'
import bg8 from '../resources/images/bg-8439.png'
import icon8 from '../resources/images/icon-8532.png'
import bg9 from '../resources/images/bg-8468.png'
import icon9 from '../resources/images/icon-8561.png'
import bg10 from '../resources/images/bg-8498.png'
import icon10 from '../resources/images/icon-8590.png'
import bg11 from '../resources/images/bg-8527.png'
import icon11 from '../resources/images/icon-8619.png'
import bg12 from '../resources/images/bg-8556.png'
import icon12 from '../resources/images/icon-8648.png'
import bg13 from '../resources/images/bg-8585.png'
import icon13 from '../resources/images/icon-8677.png'
import bg14 from '../resources/images/bg-8614.png'
import icon14 from '../resources/images/icon-8706.png'
import bg15 from '../resources/images/bg-8643.png'
import icon15 from '../resources/images/icon-8735.png'
import bg16 from '../resources/images/bg-8672.png'
import icon16 from '../resources/images/icon-8764.png'
import bg17 from '../resources/images/bg-8701.png'
import icon3 from '../resources/images/icon-8798.png'
import bg18 from '../resources/images/bg-8730.png'
import icon4 from '../resources/images/icon-8817.png'
import bg19 from '../resources/images/bg-8759.png'


import { ref, onMounted} from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[设备监测] $mcComponentBuilder 失败:', e)
}

const activeTab = ref(0)

const tabs = ref([
  { label: '监控', bg: bg3, pagination: '3/3740' },
  { label: '照明', bg: bg4, badge: '3' },
  { label: '通风', bg: bg5 },
  { label: '消防', bg: bg5 },
  { label: '交通诱导', bg: bg6 },
  { label: '供配电', bg: bg7 }
])

const devices = ref([
  { name: '摄像机', value: '2', total: '484', color: 'blue', icon: icon7, bg: bg8 },
  { name: '风速风向仪', value: '1', total: '484', color: 'red', icon: icon8, bg: bg9 },
  { name: '超高检测器', value: '0', total: '484', color: 'cyan', icon: icon9, bg: bg10 },
  { name: '烟道机器人', value: '0', total: '484', color: 'cyan', icon: icon10, bg: bg11 },
  { name: '激光雷达', value: '0', total: '484', color: 'cyan', icon: icon11, bg: bg12 },
  { name: 'CO2传感器', value: '0', total: '484', color: 'cyan', icon: icon12, bg: bg13 },
  { name: 'CO/VI检测器', value: '0', total: '484', color: 'cyan', icon: icon13, bg: bg14 },
  { name: '温湿度传感器', value: '0', total: '484', color: 'cyan', icon: icon14, bg: bg15 },
  { name: '压力传感器', value: '0', total: '484', color: 'cyan', icon: icon15, bg: bg16 },
  { name: '光照度变送器', value: '0', total: '484', color: 'cyan', icon: icon16, bg: bg17 },
  { name: '紧急电话', value: '0', total: '484', color: 'cyan', icon: icon3, bg: bg18 },
  { name: '水质监测设备', value: '0', total: '484', color: 'cyan', icon: icon4, bg: bg19 }
])

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

.c-monitor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.c-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-label {
  font-size: 14px;
  color: #333333;
  font-family: Source Han Sans CN, sans-serif;
}

.c-monitor-stat-value {
  font-size: 20px;
  font-weight: 700;
  font-family: Roboto, sans-serif;
  line-height: 23px;
  
  &--blue {
    color: #1990ff;
  }
  &--cyan {
    color: #08a3a5;
  }
}

.c-monitor-top-cards {
  display: flex;
  gap: 10px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
}

.c-monitor-card {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 6px;
  gap: 12px;
  
  &--tunnel {
    background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
  }
  
  &--north-south {
    background: rgba(230, 235, 240, 1);
  }
}

.c-monitor-card-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
}

.c-monitor-card-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-card-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-card-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  font-family: Source Han Sans CN, sans-serif;
  
  .c-monitor-card--north-south & {
    color: rgba(51, 51, 51, 0.8);
  }
}

.c-monitor-card-value {
  font-size: 20px;
  font-weight: 700;
  font-family: Roboto, sans-serif;
  line-height: 23px;
  
  &--white {
    color: #ffffff;
  }
  &--red {
    color: #f53f3f;
  }
  &--blue {
    color: #1990ff;
  }
}

.c-monitor-main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 0 10px 10px 10px;
  gap: 10px;
}

.c-monitor-sidebar {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  padding: 10px 0;
  background-size: 100% 100%
  transition: opacity 0.2s;
  
  &:hover {
    opacity: 0.9;
  }
}

.c-monitor-tab-text {
  font-size: 14px;
  color: #333333;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
  font-family: Source Han Sans CN, sans-serif;
  
  .c-monitor-tab-item--active & {
    color: #ffffff;
    font-weight: 700;
  }
}

.c-monitor-tab-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  font-weight: 500;
  font-family: Roboto, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.c-monitor-tab-pagination {
  font-size: 12px;
  color: #ffffff;
  margin-top: 4px;
  font-family: Source Han Sans CN, sans-serif;
  font-weight: 500;
}

.c-monitor-device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 6px;
  min-width: 0;
}

.c-monitor-device-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
  background-size: 100% 100%
  box-sizing: border-box;
}

.c-monitor-device-icon {
  width: 26px;
  height: 32px;
  flex-shrink: 0;
}

.c-monitor-device-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.c-monitor-device-name {
  font-size: 12px;
  color: #333333;
  font-family: Source Han Sans CN, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 18px;
}

.c-monitor-device-value {
  font-size: 16px;
  font-weight: 500;
  font-family: Roboto, sans-serif;
  line-height: 19px;
  
  &--blue {
    color: #1990ff;
  }
  &--red {
    color: #f53f3f;
  }
  &--cyan {
    color: #08a3a5;
  }
}
</style>