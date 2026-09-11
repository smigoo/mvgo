<template>
  <div class="c-device-alarm-root">
    <!-- 左侧分类Tab -->
    <div class="c-device-alarm-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.key"
        :class="['c-device-alarm-tab-item', { 'is-active': activeTab === tab.key }]"
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
        :style="{ backgroundImage: `url(${device.bg})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
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
import icon7 from '../../resources/images/icon-8503.png'
import bg8 from '../../resources/images/bg-8439.png'
import icon8 from '../../resources/images/icon-8532.png'
import bg9 from '../../resources/images/bg-8468.png'
import icon9 from '../../resources/images/icon-8561.png'
import bg10 from '../../resources/images/bg-8498.png'
import icon10 from '../../resources/images/icon-8590.png'
import bg11 from '../../resources/images/bg-8527.png'
import icon11 from '../../resources/images/icon-8619.png'
import bg12 from '../../resources/images/bg-8556.png'
import icon12 from '../../resources/images/icon-8648.png'
import bg13 from '../../resources/images/bg-8585.png'
import icon13 from '../../resources/images/icon-8677.png'
import bg14 from '../../resources/images/bg-8614.png'
import icon14 from '../../resources/images/icon-8706.png'
import bg15 from '../../resources/images/bg-8643.png'
import icon15 from '../../resources/images/icon-8735.png'
import bg16 from '../../resources/images/bg-8672.png'
import icon16 from '../../resources/images/icon-8764.png'
import bg17 from '../../resources/images/bg-8701.png'
import icon3 from '../../resources/images/icon-8798.png'
import bg18 from '../../resources/images/bg-8730.png'
import icon4 from '../../resources/images/icon-8817.png'
import bg19 from '../../resources/images/bg-8759.png'
import bg3 from '../../resources/images/bg-8831.png'
import bg4 from '../../resources/images/bg-8831.png'
import bg5 from '../../resources/images/bg-8831.png'
import bg6 from '../../resources/images/bg-8847.png'
import bg7 from '../../resources/images/bg-8852.png'

import { ref, watch} from 'vue'

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

// Tab 背景样式已移至 CSS 类中通过渐变实现，移除了不必要的背景图引用
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

/* [Style Refine] Figma fills -> 渐变背景替代背景图 */
.c-device-alarm-tab-item {
  width: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  padding: 4px 0;
  background: linear-gradient(180deg, #85bafe 0%, #c0e2ff 100%);
  border: 1px solid #f0f6ff;
  border-radius: 4px;
  transition: all 0.3s;
  
  &.is-active {
    background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
    border: 1px solid #f0f6ff;
    .c-device-alarm-tab-text {
      color: #ffffff;
      font-weight: 700;
    }
  }
}

.c-device-alarm-tab-text {
  font-size: 14px;
  color: #3b80e6;
  text-align: center;
  line-height: 1.2;
}

/* [Style Refine] Figma cornerRadius: 29 -> border-radius: 29px (胶囊形) */
.c-device-alarm-tab-badge {
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
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
  background-size: 100% 100%
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