<template>
  <div class="mv-max-1786171522186-97a8a50d" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 头部区域：标题 + 统计指标 -->
    <div class="header-section">
      <div class="header-top-row">
        <div class="title-text">设备监测</div>
        <img :src="icon2" class="header-icon" />
        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-label">设备类型</span>
            <span class="stat-value stat-value--blue">28</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">设备总数</span>
            <span class="stat-value stat-value--blue">68562</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">完好率</span>
            <span class="stat-value stat-value--green">98%</span>
          </div>
        </div>
        <div class="title-update">*数据实时更新</div>
      </div>
      <div class="header-bottom-row">
        <div class="title-decoration">
          <span class="deco-dot"></span>
          <span class="deco-line"></span>
        </div>
        <div class="header-line"></div>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="content-section">
      <!-- 顶部切换卡片 -->
      <div class="switch-cards">
        <div
          v-for="(card, idx) in summaryCards"
          :key="idx"
          :class="['switch-card', { 'switch-card--active': activeCard === idx }]"
          @click="activeCard = idx"
        >
          <div class="card-left">
            <img :src="card.icon" class="card-icon" />
            <div class="card-title">{{ card.title }}</div>
          </div>
          <div class="card-right">
            <div class="card-total-row">
              <span class="card-total-label">总数:</span>
              <span class="card-total-value">{{ card.total }}</span>
            </div>
            <div class="card-error-row">
              <span class="card-error-label">异常数:</span>
              <span class="card-error-value">{{ card.error }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 设备分类列表区域 -->
      <div class="device-section">
        <!-- 左侧Tab导航 -->
        <div class="left-tabs">
          <div
            v-for="(tab, idx) in tabs"
            :key="idx"
            :class="['tab-item', { 'tab-item--active': activeTab === idx }]"
            @click="activeTab = idx"
          >
            <span class="tab-text">{{ tab.name }}</span>
            <span v-if="tab.badge" :class="['tab-badge', { 'tab-badge--red': tab.name === '照明' }]">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="right-grid">
          <div
            v-for="(device, idx) in deviceList"
            :key="idx"
            class="device-card"
            :style="{ backgroundImage: `url(${device.bg})` }"
          >
            <img :src="device.icon" class="device-icon" />
            <div class="device-name">{{ device.name }}</div>
            <div class="device-value">{{ device.value }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-8418.png', import.meta.url).href
const icon2 = new URL('../resources/images/Frame-8856.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-8788.png', import.meta.url).href
const bg3 = new URL('../resources/images/bg-8807.png', import.meta.url).href
const bg4 = new URL('../resources/images/bg-8831.png', import.meta.url).href
const bg7 = new URL('../resources/images/bg-8847.png', import.meta.url).href
const bg8 = new URL('../resources/images/bg-8852.png', import.meta.url).href
const bg9 = new URL('../resources/images/bg-8468.png', import.meta.url).href
const bg10 = new URL('../resources/images/bg-8498.png', import.meta.url).href
const bg11 = new URL('../resources/images/bg-8527.png', import.meta.url).href
const bg12 = new URL('../resources/images/bg-8556.png', import.meta.url).href
const bg13 = new URL('../resources/images/bg-8585.png', import.meta.url).href
const bg14 = new URL('../resources/images/bg-8614.png', import.meta.url).href
const bg15 = new URL('../resources/images/bg-8643.png', import.meta.url).href
const bg16 = new URL('../resources/images/bg-8672.png', import.meta.url).href
const bg17 = new URL('../resources/images/bg-8701.png', import.meta.url).href
const bg18 = new URL('../resources/images/bg-8730.png', import.meta.url).href
const bg19 = new URL('../resources/images/bg-8759.png', import.meta.url).href
const icon5 = new URL('../resources/images/icon-8444.png', import.meta.url).href
const icon6 = new URL('../resources/images/icon-8473.png', import.meta.url).href
const icon7 = new URL('../resources/images/icon-8503.png', import.meta.url).href
const icon8 = new URL('../resources/images/icon-8532.png', import.meta.url).href
const icon9 = new URL('../resources/images/icon-8561.png', import.meta.url).href
const icon10 = new URL('../resources/images/icon-8590.png', import.meta.url).href
const icon11 = new URL('../resources/images/icon-8619.png', import.meta.url).href
const icon12 = new URL('../resources/images/icon-8648.png', import.meta.url).href
const icon13 = new URL('../resources/images/icon-8677.png', import.meta.url).href
const icon14 = new URL('../resources/images/icon-8706.png', import.meta.url).href
const icon15 = new URL('../resources/images/icon-8735.png', import.meta.url).href
const icon16 = new URL('../resources/images/icon-8764.png', import.meta.url).href
const icon3 = new URL('../resources/images/icon-8798.png', import.meta.url).href
const icon4 = new URL('../resources/images/icon-8817.png', import.meta.url).href
/**
 * 设备监测面板组件
 * 数据来源：Figma设计稿还原
 * 关键交互：
 * 1. 顶部两个卡片可切换（隧道设备/南北接线设备）
 * 2. 左侧垂直Tab可切换设备分类
 */
import { ref, computed} from 'vue'

// 背景图资源（系统自动注入）

const activeCard = ref(0)

// 当前激活的Tab
const activeTab = ref(0)

// 顶部切换卡片数据
const summaryCards = ref([
  {
    title: '隧道设备',
    name: '隧道设备',
    total: '56302',
    error: '5',
    icon: icon5,
    bg: bg2
  },
  {
    title: '南北接线设备',
    name: '南北接线设备',
    total: '1280',
    error: '3',
    icon: icon6,
    bg: bg3
  }
])

// 左侧Tab数据
const tabs = ref([
  { name: '监控', badge: '3/3740', bg: bg4 },
  { name: '照明', badge: '3', bg: bg4 },
  { name: '通风', badge: '', bg: bg4 },
  { name: '供配电', badge: '', bg: bg8 },
  { name: '消防', badge: '', bg: bg4 },
  { name: '交通诱导', badge: '', bg: bg7 }
])

// 设备网格数据
const deviceList = ref([
  { name: '摄像机', value: '(2/484)', icon: icon7, bg: bg9 },
  { name: '风速风向仪', value: '(1/484)', icon: icon8, bg: bg10 },
  { name: '超高检测器', value: '(0/484)', icon: icon9, bg: bg11 },
  { name: '烟道机器人', value: '(0/484)', icon: icon10, bg: bg12 },
  { name: '激光雷达', value: '(0/484)', icon: icon11, bg: bg13 },
  { name: 'CO₂传感器', value: '(0/484)', icon: icon12, bg: bg14 },
  { name: 'CO/VI检测器', value: '(0/484)', icon: icon13, bg: bg15 },
  { name: '温湿度传感器', value: '(0/484)', icon: icon14, bg: bg16 },
  { name: '压力传感器', value: '(0/484)', icon: icon15, bg: bg17 },
  { name: '光照度变送器', value: '(0/484)', icon: icon16, bg: bg18 },
  { name: '紧急电话', value: '(0/484)', icon: icon3, bg: bg19 },
  { name: '水质监测设备', value: '(0/484)', icon: icon4, bg: bg9 }
])
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* [Layout Refine] 根容器布局与背景精确还原 */
.mv-max-1786171522186-97a8a50d {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: rgb(237, 244, 251);
  background-size: 100% 100%; /* [Style Refine] 红线规则1：背景图精确还原 */
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  border-radius: 8px;
  overflow: hidden;
  padding: 12px 16px;
  box-sizing: border-box;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
}

/* [Layout Refine] 头部区域改为上下两行结构 */
.header-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.header-top-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.title-text {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(90deg, #1990ff 0%, rgba(90, 126, 255, 0.83) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
}

.header-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.stats-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 14px;
  color: #333333;
  line-height: 21px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
  line-height: 23px;

  &--blue {
    color: #1990ff;
  }

  &--green {
    color: #08a3a5;
  }
}

.title-update {
  font-size: 14px;
  font-weight: 400;
  background: linear-gradient(90deg, #1990ff 0%, rgba(90, 126, 255, 0.83) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-left: auto;
  white-space: nowrap;
}

.header-bottom-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.title-decoration {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
}

.deco-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2.4px;
    height: 2.4px;
    border-radius: 50%;
    background: #559eff;
  }
}

.deco-line {
  width: 362px;
  height: 6px;
  background: linear-gradient(90deg, rgba(85, 158, 255, 0.3) 0%, rgba(85, 158, 255, 0) 100%);
  border-radius: 3px;
}

.header-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, #559eff 0%, transparent 100%);
  opacity: 0.5;
}

.content-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.switch-cards {
  display: flex;
  flex-direction: row;
  gap: 10px;
  height: 65px;
}

/* [Layout Refine] 卡片内部改为左右布局，匹配Figma结构 */
.switch-card {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: linear-gradient(270deg, rgba(147, 204, 255, 0.6) 0%, rgba(147, 204, 255, 0) 100%);
  border: 1px solid rgba(147, 204, 255, 0.4);

  &--active {
    background: linear-gradient(270deg, #2b9bff 0%, rgba(41, 154, 255, 0.6) 100%);
    border: 1px solid #2b9bff;

    .card-title,
    .card-total-label,
    .card-error-label {
      color: #ffffff;
    }

    .card-total-value {
      color: #ffffff;
    }

    .card-error-value {
      color: #e03434;
    }
  }
}

.card-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.card-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
}

.card-title {
  font-size: 12px;
  font-weight: 400;
  color: #333333;
  font-family: 'YouSheBiaoTiHei', sans-serif;
  white-space: nowrap;
}

.card-right {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 12px;
}

.card-total-row,
.card-error-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.card-total-label,
.card-error-label {
  font-size: 14px;
  color: #333333;
  line-height: 21px;
}

.card-total-value {
  font-size: 20px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
  color: #1990ff;
  line-height: 23px;
}

.card-error-value {
  font-size: 20px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
  color: #e03434;
  line-height: 23px;
}

.device-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 8px;
}

.left-tabs {
  width: 46px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* [Style Refine] Tab样式精确还原Figma渐变与Badge */
.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 40px;
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border: 1px solid #f0f5ff;

  &--active {
    background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
    border: 1px solid #f0f5ff;

    .tab-text {
      color: #ffffff;
      font-weight: 700;
    }

    .tab-badge {
      background: #ffffff;
      color: #3b82f6;
      border: 1px solid #2563eb;
      box-shadow: 0px 1px 2px rgba(52, 101, 144, 0.4);
    }
  }
}

.tab-text {
  font-size: 14px;
  color: #3b82f6;
  text-align: center;
  line-height: 18px;
}

.tab-badge {
  font-size: 12px;
  font-weight: 500;
  color: #ffffff;
  text-align: center;
  line-height: 14px;
  margin-top: 2px;
  font-family: 'Roboto', sans-serif;
  background: #f53f3f;
  border-radius: 29px;
  padding: 0 4px;
}

.right-grid {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 8px;
}

/* [Style Refine] 设备卡片背景图尺寸修正为100% 100% */
.device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 4px;
  background-size: 100% 100%; /* [Style Refine] 红线规则1：背景图精确还原 */
  background-position: center;
  background-repeat: no-repeat;
  gap: 4px;
}

.device-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
}

.device-name {
  font-size: 12px;
  color: #333333;
  text-align: center;
  line-height: 18px;
}

/* [Style Refine] 设备数值颜色与阴影还原 */
.device-value {
  font-size: 16px;
  font-weight: 500;
  color: #ffffff;
  font-family: 'Roboto', sans-serif;
  line-height: 19px;
  text-shadow: 0px 0px 0px rgba(0, 0, 0, 0.5);
}
</style>