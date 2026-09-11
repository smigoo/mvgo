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
      <!-- [Layout Refine] switch 区域独立为顶部，对应 Figma slot-con 垂直布局 -->
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

      <!-- [Layout Refine] 新增 main 区域包裹 sidebar 和 grid，对应 Figma @antd/tab -->
      <div class="c-monitor-main">
        <div class="c-monitor-sidebar">
          <div 
            v-for="(tab, index) in tabs" 
            :key="tab.label" 
            :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === index }]"
            :style="{ backgroundImage: activeTab === index ? 'none' : `url(${getTabBg(index)})` }"
            @click="activeTab = index"
          >
            <span class="c-monitor-tab-text">{{ tab.label }}</span>
            <!-- [Style Refine] 区分 info 和 danger 两种 badge 样式 -->
            <span v-if="tab.badge" :class="['c-monitor-tab-badge', tab.badgeType === 'info' ? 'c-monitor-tab-badge--info' : 'c-monitor-tab-badge--danger']">{{ tab.badge }}</span>
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
            <div class="c-monitor-device-text">
              <span class="c-monitor-device-label">{{ device.label }}</span>
              <!-- [Style Refine] Figma 中数值整体为白色带阴影，移除红/绿/灰的臆造拆分 -->
              <span class="c-monitor-device-value">({{ device.error }}/{{ device.total }})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon3 from '../resources/images/icon-8798.png'
import bg1 from '../resources/images/bg-8788.png'
import icon4 from '../resources/images/icon-8817.png'
import bg2 from '../resources/images/bg-8807.png'
import bg6 from '../resources/images/bg-8847.png'
import bg7 from '../resources/images/bg-8852.png'
import bg3 from '../resources/images/bg-8831.png'
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


let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const tabs = ref([
  { label: '监控', badge: '3/3740', badgeType: 'info' },
  { label: '照明', badge: '3', badgeType: 'danger' },
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

/* [Layout Refine] Figma slot-con layoutMode=VERTICAL → flex-direction: column */
.c-monitor-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

/* [Layout Refine] Figma switch height 64.8 */
.c-monitor-summary-cards {
  display: flex;
  flex-direction: row;
  gap: 10px;
  flex-shrink: 0;
  height: 65px;
  margin-bottom: -2px;
}

/* [Layout Refine] 新增 main 容器包裹 sidebar 和 grid */
.c-monitor-main {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  min-width: 0;
}

.c-monitor-sidebar {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  /* [Layout Refine] Figma tabs gap 约 3px */
  gap: 3px;
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
  flex-shrink: 0;

  &--active {
    background: linear-gradient(270deg, #318aff 0%, #70bfff 100%) !important;
    /* [Layout Refine] Figma tab-active height 54 */
    min-height: 54px;
    
    .c-monitor-tab-text {
      color: #ffffff;
      font-weight: 700;
    }
  }
}

.c-monitor-tab-text {
  font-size: 14px;
  /* [Style Refine] Figma fills r:0.231, g:0.500, b:0.904 → #3B80E6 */
  color: #3b80e6;
  font-family: 'Source Han Sans CN', sans-serif;
  text-align: center;
}

.c-monitor-tab-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  height: 14px;
  padding: 0 4px;
  /* [Style Refine] Figma cornerRadius 29 */
  border-radius: 29px;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Roboto', sans-serif;
  white-space: nowrap;

  &--danger {
    width: 14px;
    padding: 0;
    background: #f53f3f;
    color: #ffffff;
    border-radius: 50%;
  }

  &--info {
    background: #ffffff;
    color: #3b80e6;
    /* [Style Refine] Figma stroke r:0.144, g:0.554, b:0.784 → #258DC8 */
    border: 1px solid #258dc8;
    /* [Style Refine] Figma drop-shadow */
    box-shadow: 0 1px 2px rgba(51, 101, 144, 0.4);
  }
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

/* [Layout Refine] Figma cons grid 3 columns, item width 117, gap 13px 8px */
.c-monitor-device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 117px);
  gap: 13px 8px;
  min-width: 0;
  min-height: 0;
  align-content: start;
}

.c-monitor-device-item {
  width: 117px;
  height: 64px;
  /* [Layout Refine] Figma item layout HORIZONTAL (icon left, text right) */
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;
  background-size: 100% 100%;
  box-sizing: border-box;
  padding-left: 8px;
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  margin-right: 6px;
}

.c-monitor-device-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.c-monitor-device-label {
  font-size: 12px;
  color: #333333;
  font-family: 'Source Han Sans CN', sans-serif;
  line-height: 18px;
}

/* [Style Refine] Figma fills solid white, drop-shadow black 50% */
.c-monitor-device-value {
  font-size: 16px;
  font-weight: 500;
  font-family: 'Roboto', sans-serif;
  color: #ffffff;
  text-shadow: 0 0 0 rgba(0, 0, 0, 0.5);
  line-height: 21px;
}
</style>