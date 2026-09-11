<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <img :src="icon1" class="c-mc-max-1786157158062-528cf980-title-decor" />
    </template>
    <template #header-right>
      <div class="c-mc-max-1786157158062-528cf980-header-stats">
        <div class="c-mc-max-1786157158062-528cf980-stat-item">
          <span class="c-mc-max-1786157158062-528cf980-stat-label">设备类型</span>
          <span class="c-mc-max-1786157158062-528cf980-stat-value c-mc-max-1786157158062-528cf980-stat-value-blue">28</span>
        </div>
        <div class="c-mc-max-1786157158062-528cf980-stat-item">
          <span class="c-mc-max-1786157158062-528cf980-stat-label">设备总数</span>
          <span class="c-mc-max-1786157158062-528cf980-stat-value c-mc-max-1786157158062-528cf980-stat-value-blue">68562</span>
        </div>
        <div class="c-mc-max-1786157158062-528cf980-stat-item">
          <span class="c-mc-max-1786157158062-528cf980-stat-label">完好率</span>
          <span class="c-mc-max-1786157158062-528cf980-stat-value c-mc-max-1786157158062-528cf980-stat-value-green">98%</span>
        </div>
        <img :src="icon2" class="c-mc-max-1786157158062-528cf980-header-icon" />
      </div>
    </template>

    <div class="c-mc-max-1786157158062-528cf980-content">
      <div class="c-mc-max-1786157158062-528cf980-switch-container">
        <div 
          v-for="(item, index) in switchData" 
          :key="index"
          :class="['c-mc-max-1786157158062-528cf980-switch-card', { 'c-mc-max-1786157158062-528cf980-switch-card--active': activeSwitch === index }]"
          :style="{ backgroundImage: `url(${activeSwitch === index ? bg1 : bg2})` }"
          @click="activeSwitch = index"
        >
          <img :src="index === 0 ? icon3 : icon4" class="c-mc-max-1786157158062-528cf980-switch-icon" />
          <div class="c-mc-max-1786157158062-528cf980-switch-info">
            <div class="c-mc-max-1786157158062-528cf980-switch-title">{{ item.title }}</div>
            <div class="c-mc-max-1786157158062-528cf980-switch-row">
              <span class="c-mc-max-1786157158062-528cf980-switch-text">总数:</span>
              <span class="c-mc-max-1786157158062-528cf980-switch-num">{{ item.total }}</span>
            </div>
            <div class="c-mc-max-1786157158062-528cf980-switch-row">
              <span class="c-mc-max-1786157158062-528cf980-switch-text">异常数:</span>
              <span class="c-mc-max-1786157158062-528cf980-switch-num">{{ item.error }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="c-mc-max-1786157158062-528cf980-main-content">
        <div class="c-mc-max-1786157158062-528cf980-tab-sidebar">
          <div 
            v-for="(tab, index) in tabs" 
            :key="index"
            :class="['c-mc-max-1786157158062-528cf980-tab-item', { 'c-mc-max-1786157158062-528cf980-tab-item--active': activeTab === index }]"
            :style="{ backgroundImage: `url(${tabBgs[index]})` }"
            @click="activeTab = index"
          >
            {{ tab }}
          </div>
        </div>

        <div class="c-mc-max-1786157158062-528cf980-card-grid">
          <div 
            v-for="(card, index) in deviceCards" 
            :key="index"
            class="c-mc-max-1786157158062-528cf980-device-card"
            :style="{ backgroundImage: `url(${cardBgs[index]})` }"
          >
            <img :src="card.icon" class="c-mc-max-1786157158062-528cf980-device-icon" />
            <div class="c-mc-max-1786157158062-528cf980-device-info">
              <div class="c-mc-max-1786157158062-528cf980-device-name">{{ card.name }}</div>
              <div class="c-mc-max-1786157158062-528cf980-device-status">{{ card.status }}</div>
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
import bg1 from '../resources/images/bg-8788.png'
import bg2 from '../resources/images/bg-8807.png'
import icon3 from '../resources/images/icon-8798.png'
import icon4 from '../resources/images/icon-8817.png'
import bg3 from '../resources/images/bg-8831.png'
import bg4 from '../resources/images/bg-8831.png'
import bg5 from '../resources/images/bg-8831.png'
import bg6 from '../resources/images/bg-8847.png'
import bg7 from '../resources/images/bg-8852.png'
import icon5 from '../resources/images/icon-8444.png'
import icon6 from '../resources/images/icon-8473.png'
import icon7 from '../resources/images/icon-8503.png'
import icon8 from '../resources/images/icon-8532.png'
import icon9 from '../resources/images/icon-8561.png'
import icon10 from '../resources/images/icon-8590.png'
import icon11 from '../resources/images/icon-8619.png'
import icon12 from '../resources/images/icon-8648.png'
import icon13 from '../resources/images/icon-8677.png'
import icon14 from '../resources/images/icon-8706.png'
import icon15 from '../resources/images/icon-8735.png'
import icon16 from '../resources/images/icon-8764.png'
import bg8 from '../resources/images/bg-8439.png'
import bg9 from '../resources/images/bg-8468.png'
import bg10 from '../resources/images/bg-8498.png'
import bg11 from '../resources/images/bg-8527.png'
import bg12 from '../resources/images/bg-8556.png'
import bg13 from '../resources/images/bg-8585.png'
import bg14 from '../resources/images/bg-8614.png'
import bg15 from '../resources/images/bg-8643.png'
import bg16 from '../resources/images/bg-8672.png'
import bg17 from '../resources/images/bg-8701.png'
import bg18 from '../resources/images/bg-8730.png'
import bg19 from '../resources/images/bg-8759.png'


let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const activeSwitch = ref(0)
const activeTab = ref(0)

const switchData = [
  { title: '隧道设备', total: 56302, error: 5 },
  { title: '南北接线设备', total: 1280, error: 3 }
]

const tabs = ['监控', '照明', '通风', '消防', '交通诱导', '供配电']
const tabBgs = [bg3, bg4, bg5, bg3, bg6, bg7]

const deviceCards = [
  { name: '摄像机', status: '(2/484)', icon: icon5 },
  { name: '烟道机器人', status: '(0/484)', icon: icon6 },
  { name: 'CO/VI检测器', status: '(0/484)', icon: icon7 },
  { name: '光照度变送器', status: '(0/484)', icon: icon8 },
  { name: '激光雷达', status: '(0/484)', icon: icon9 },
  { name: '风速风向仪', status: '(1/484)', icon: icon10 },
  { name: '温湿度传感器', status: '(0/484)', icon: icon11 },
  { name: '紧急电话', status: '(0/484)', icon: icon12 },
  { name: '超高检测器', status: '(0/484)', icon: icon13 },
  { name: 'CO2传感器', status: '(0/484)', icon: icon14 },
  { name: '压力传感器', status: '(0/484)', icon: icon15 },
  { name: '水质监测设备', status: '(0/484)', icon: icon16 }
]
const cardBgs = [bg8, bg9, bg10, bg11, bg12, bg13, bg14, bg15, bg16, bg17, bg18, bg19]

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1786157158062-528cf980-onload', {
      componentId: 'mc-max-1786157158062-528cf980',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-mc-max-1786157158062-528cf980-title-decor {
  width: 8px;
  height: 8px;
}

.c-mc-max-1786157158062-528cf980-header-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-mc-max-1786157158062-528cf980-stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-mc-max-1786157158062-528cf980-stat-label {
  font-size: 14px;
  color: #333333;
  line-height: 21px;
}

.c-mc-max-1786157158062-528cf980-stat-value {
  font-size: 20px;
  font-weight: 700;
  font-family: Roboto, sans-serif;
  line-height: 23px;
}

.c-mc-max-1786157158062-528cf980-stat-value-blue {
  color: #1990ff;
}

.c-mc-max-1786157158062-528cf980-stat-value-green {
  color: #08a3a5;
}

.c-mc-max-1786157158062-528cf980-header-icon {
  width: 16px;
  height: 16px;
  margin-left: 8px;
}

.c-mc-max-1786157158062-528cf980-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.c-mc-max-1786157158062-528cf980-switch-container {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.c-mc-max-1786157158062-528cf980-switch-card {
  flex: 1;
  height: 65px;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  cursor: pointer;
  box-sizing: border-box;
  /* [Style Refine] cornerRadius → 6px */
  border-radius: 6px;
}

.c-mc-max-1786157158062-528cf980-switch-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
}

.c-mc-max-1786157158062-528cf980-switch-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-mc-max-1786157158062-528cf980-switch-title {
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  color: #333333;
}

.c-mc-max-1786157158062-528cf980-switch-card--active .c-mc-max-1786157158062-528cf980-switch-title {
  color: #ffffff;
}

.c-mc-max-1786157158062-528cf980-switch-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-mc-max-1786157158062-528cf980-switch-text {
  font-size: 14px;
  color: #333333;
  line-height: 21px;
}

.c-mc-max-1786157158062-528cf980-switch-card--active .c-mc-max-1786157158062-528cf980-switch-text {
  color: #ffffff;
}

.c-mc-max-1786157158062-528cf980-switch-num {
  font-size: 20px;
  font-weight: 700;
  font-family: Roboto, sans-serif;
  color: #333333;
  line-height: 23px;
}

.c-mc-max-1786157158062-528cf980-switch-card--active .c-mc-max-1786157158062-528cf980-switch-num {
  color: #ffffff;
}

.c-mc-max-1786157158062-528cf980-main-content {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

.c-mc-max-1786157158062-528cf980-tab-sidebar {
  width: 46px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.c-mc-max-1786157158062-528cf980-tab-item {
  width: 34px;
  height: 40px;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  /* [Style Refine] fills[0].color → rgb(59,128,230) → #3b80e6 */
  color: #3b80e6;
  /* [Style Refine] typography.lineHeightPx → 16px */
  line-height: 16px;
  cursor: pointer;
  box-sizing: border-box;
}

.c-mc-max-1786157158062-528cf980-tab-item--active {
  color: #ffffff;
  font-weight: 700;
}

.c-mc-max-1786157158062-528cf980-card-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  align-content: start;
  min-width: 0;
}

.c-mc-max-1786157158062-528cf980-device-card {
  height: 64px;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  padding: 12px;
  gap: 8px;
  box-sizing: border-box;
}

.c-mc-max-1786157158062-528cf980-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
}

.c-mc-max-1786157158062-528cf980-device-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.c-mc-max-1786157158062-528cf980-device-name {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-mc-max-1786157158062-528cf980-device-status {
  font-size: 16px;
  font-weight: 500;
  font-family: Roboto, sans-serif;
  /* [Style Refine] fills[0].color → rgb(255,255,255) → #ffffff */
  color: #ffffff;
  /* [Style Refine] effects[0] → text-shadow: 0 0 0 rgba(0,0,0,0.5) */
  text-shadow: 0 0 0 rgba(0,0,0,0.5);
  line-height: 19px;
}
</style>