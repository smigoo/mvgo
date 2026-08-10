<template>
  <div class="mv3-mv-1785638525922-2516b1cd-root">
    <!-- 面板头部 -->
    <PanelHeader
      :device-type-count="headerData.deviceType"
      :device-total-count="headerData.deviceTotal"
      :integrity-rate="headerData.integrityRate"
      :icon1="icon1"
      :icon2="icon2"
      @refresh="handleRefresh"
    />

    <!-- 内容区域 -->
    <div class="mv3-mv-1785638525922-2516b1cd-content">
      <!-- 设备分类切换区域 -->
      <div class="mv3-mv-1785638525922-2516b1cd-switch-area">
        <!-- 隧道设备（激活态） -->
        <div
          class="mv3-mv-1785638525922-2516b1cd-switch-card"
          :class="{
            'mv3-mv-1785638525922-2516b1cd-switch-card--active': activeSwitch === 'tunnel',
            'mv3-mv-1785638525922-2516b1cd-switch-card--default': activeSwitch !== 'tunnel'
          }"
          @click="activeSwitch = 'tunnel'"
        >
          <div
            class="mv3-mv-1785638525922-2516b1cd-switch-card-bg"
            :style="{ backgroundImage: `url(${bg1})` }"
          ></div>
          <img :src="icon3" class="mv3-mv-1785638525922-2516b1cd-switch-icon" alt="隧道设备" />
          <div class="mv3-mv-1785638525922-2516b1cd-switch-text">
            <span class="mv3-mv-1785638525922-2516b1cd-switch-title">隧道设备</span>
            <div class="mv3-mv-1785638525922-2516b1cd-switch-info">
              <div class="mv3-mv-1785638525922-2516b1cd-switch-info-item">
                <span class="mv3-mv-1785638525922-2516b1cd-switch-info-label">总数:</span>
                <span class="mv3-mv-1785638525922-2516b1cd-switch-info-value">56302</span>
              </div>
              <div class="mv3-mv-1785638525922-2516b1cd-switch-info-item">
                <span class="mv3-mv-1785638525922-2516b1cd-switch-info-label">异常数:</span>
                <span class="mv3-mv-1785638525922-2516b1cd-switch-info-value">5</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 南北接线设备（默认态） -->
        <div
          class="mv3-mv-1785638525922-2516b1cd-switch-card"
          :class="{
            'mv3-mv-1785638525922-2516b1cd-switch-card--active': activeSwitch === 'junction',
            'mv3-mv-1785638525922-2516b1cd-switch-card--default': activeSwitch !== 'junction'
          }"
          @click="activeSwitch = 'junction'"
        >
          <div
            class="mv3-mv-1785638525922-2516b1cd-switch-card-bg"
            :style="{ backgroundImage: `url(${bg2})` }"
          ></div>
          <img :src="icon4" class="mv3-mv-1785638525922-2516b1cd-switch-icon" alt="南北接线设备" />
          <div class="mv3-mv-1785638525922-2516b1cd-switch-text">
            <span class="mv3-mv-1785638525922-2516b1cd-switch-title">南北接线设备</span>
            <div class="mv3-mv-1785638525922-2516b1cd-switch-info">
              <div class="mv3-mv-1785638525922-2516b1cd-switch-info-item">
                <span class="mv3-mv-1785638525922-2516b1cd-switch-info-label">总数:</span>
                <span class="mv3-mv-1785638525922-2516b1cd-switch-info-value">1280</span>
              </div>
              <div class="mv3-mv-1785638525922-2516b1cd-switch-info-item">
                <span class="mv3-mv-1785638525922-2516b1cd-switch-info-label">异常数:</span>
                <span class="mv3-mv-1785638525922-2516b1cd-switch-info-value">3</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 主内容区：左侧 Tab + 右侧设备网格 -->
      <div class="mv3-mv-1785638525922-2516b1cd-main-area">
        <!-- 左侧垂直 Tab 导航 -->
        <div class="mv3-mv-1785638525922-2516b1cd-side-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="mv3-mv-1785638525922-2516b1cd-tab-item"
            :class="{ 'mv3-mv-1785638525922-2516b1cd-tab-item--active': activeTab === tab.key }"
            @click="handleTabChange(tab.key)"
          >
            <span>{{ tab.label }}</span>
            <span v-if="tab.count" class="mv3-mv-1785638525922-2516b1cd-tab-count">{{ tab.count }}</span>
          </div>
        </div>

        <!-- 右侧设备卡片网格 -->
        <div class="mv3-mv-1785638525922-2516b1cd-device-grid">
          <DeviceCard
            v-for="(device, index) in currentDevices"
            :key="device.name"
            :name="device.name"
            :count="device.count"
            :bg-image="device.bgImage"
            :icon-image="device.iconImage"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../resources/images/g-8421.png'
import icon2 from '../resources/images/Frame-8856.png'
import bg1 from '../resources/images/bg-8788.png'
import icon3 from '../resources/images/icon-8798.png'
import bg2 from '../resources/images/bg-8807.png'
import icon4 from '../resources/images/icon-8817.png'
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
import bg3 from '../resources/images/bg-8439.png'
import bg4 from '../resources/images/bg-8468.png'
import bg5 from '../resources/images/bg-8498.png'
import bg6 from '../resources/images/bg-8527.png'
import bg7 from '../resources/images/bg-8556.png'
import bg8 from '../resources/images/bg-8585.png'
import bg9 from '../resources/images/bg-8614.png'
import bg10 from '../resources/images/bg-8643.png'
import bg11 from '../resources/images/bg-8672.png'
import bg12 from '../resources/images/bg-8701.png'
import bg13 from '../resources/images/bg-8730.png'
import bg14 from '../resources/images/bg-8759.png'

// 设备监测面板主组件
// 功能：展示隧道/南北接线设备的分类统计与各类设备异常数
// 交互：Tab 切换不同设备类别，switch 切换隧道/南北接线视图，刷新按钮更新数据

import { ref, computed, onMounted, onUnmounted} from 'vue'
import PanelHeader from './components/PanelHeader.vue'
import DeviceCard from './components/DeviceCard.vue'

// 引入图片资源变量（系统自动注入）

// #region 1. Props 定义
const props = defineProps({
  // 外部传入的头部统计数据
  headerData: {
    type: Object,
    default: () => ({
      deviceType: '28',
      deviceTotal: '68562',
      integrityRate: '98%'
    })
  }
})
// #endregion

// #region 2. Emits 定义
const emit = defineEmits(['refresh', 'tab-change', 'switch-change'])
// #endregion

// #region 3. 响应式状态
// 当前激活的 switch（隧道设备 / 南北接线设备）
const activeSwitch = ref('tunnel')
// 当前激活的 Tab
const activeTab = ref('monitor')
// 定时器引用（用于自动刷新）
let refreshTimer = null
// #endregion

// #region 4. 数据定义
// 头部统计数据（使用 props 默认值或外部传入）
const headerData = computed(() => props.headerData)

// Tab 列表数据
const tabs = ref([
  { key: 'monitor', label: '监控', count: '3/3740' },
  { key: 'lighting', label: '照明', count: '3' },
  { key: 'ventilation', label: '通风', count: '' },
  { key: 'fire', label: '消防', count: '' },
  { key: 'traffic', label: '交通诱导', count: '' },
  { key: 'power', label: '供配电', count: '' }
])

// 隧道设备列表（监控 Tab 下的设备卡片）
const tunnelMonitorDevices = ref([
  { name: '摄像机', count: '(2/484)', bgImage: bg3, iconImage: icon5 },
  { name: '烟道机器人', count: '(0/484)', bgImage: bg4, iconImage: icon6 },
  { name: 'CO/VI检测器', count: '(0/484)', bgImage: bg5, iconImage: icon7 },
  { name: '光照度变送器', count: '(0/484)', bgImage: bg6, iconImage: icon8 },
  { name: '激光雷达', count: '(0/484)', bgImage: bg7, iconImage: icon9 },
  { name: '风速风向仪', count: '(1/484)', bgImage: bg8, iconImage: icon10 },
  { name: '温湿度传感器', count: '(0/484)', bgImage: bg9, iconImage: icon11 },
  { name: '紧急电话', count: '(0/484)', bgImage: bg10, iconImage: icon12 },
  { name: '超高检测器', count: '(0/484)', bgImage: bg11, iconImage: icon13 },
  { name: 'CO2传感器', count: '(0/484)', bgImage: bg12, iconImage: icon14 },
  { name: '压力传感器', count: '(0/484)', bgImage: bg13, iconImage: icon15 },
  { name: '水质监测设备', count: '(0/484)', bgImage: bg14, iconImage: icon16 }
])

// 南北接线设备列表
const junctionMonitorDevices = ref([
  { name: '摄像机', count: '(1/120)', bgImage: bg3, iconImage: icon5 },
  { name: '烟道机器人', count: '(0/120)', bgImage: bg4, iconImage: icon6 },
  { name: 'CO/VI检测器', count: '(0/120)', bgImage: bg5, iconImage: icon7 },
  { name: '光照度变送器', count: '(0/120)', bgImage: bg6, iconImage: icon8 },
  { name: '激光雷达', count: '(0/120)', bgImage: bg7, iconImage: icon9 },
  { name: '风速风向仪', count: '(0/120)', bgImage: bg8, iconImage: icon10 },
  { name: '温湿度传感器', count: '(1/120)', bgImage: bg9, iconImage: icon11 },
  { name: '紧急电话', count: '(0/120)', bgImage: bg10, iconImage: icon12 },
  { name: '超高检测器', count: '(0/120)', bgImage: bg11, iconImage: icon13 },
  { name: 'CO2传感器', count: '(0/120)', bgImage: bg12, iconImage: icon14 },
  { name: '压力传感器', count: '(0/120)', bgImage: bg13, iconImage: icon15 },
  { name: '水质监测设备', count: '(0/120)', bgImage: bg14, iconImage: icon16 }
])
// #endregion

// #region 5. 计算属性
// 根据当前 switch 和 tab 状态计算显示的设备列表
const currentDevices = computed(() => {
  if (activeSwitch.value === 'tunnel') {
    return tunnelMonitorDevices.value
  }
  return junctionMonitorDevices.value
})
// #endregion

// #region 6. 方法
// 处理 Tab 切换
const handleTabChange = (tabKey) => {
  activeTab.value = tabKey
  emit('tab-change', tabKey)
}

// 处理刷新
const handleRefresh = () => {
  // 模拟刷新数据（实际项目中应调用接口）
  emit('refresh')
}
// #endregion

// #region 7. 生命周期
onMounted(() => {
  // 设置定时自动刷新（30秒一次）
  refreshTimer = setInterval(() => {
    handleRefresh()
  }, 30000)
})

onUnmounted(() => {
  // 清理定时器，防止内存泄漏
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
// #endregion
</script>

<style lang="less" scoped>
@import './resources/styles/index.less';

// 根容器：填满父容器，纵向布局
.mv3-mv-1785638525922-2516b1cd-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #edf4fb;
  box-shadow: 0 4px 10px 0 rgba(74, 117, 141, 0.25);
  border-radius: 4px;
  overflow: hidden;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
}

// 内容区域：自适应填充剩余空间
.mv3-mv-1785638525922-2516b1cd-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 8px 8px;
  gap: 8px;
}

// 设备分类切换区域：横向排列两张卡片
.mv3-mv-1785638525922-2516b1cd-switch-area {
  display: flex;
  flex-direction: row;
  gap: 6px;
  min-height: 65px;
}

// 切换卡片基础样式
.mv3-mv-1785638525922-2516b1cd-switch-card {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  min-width: 0;
  transition: all 0.3s;

  // 激活态：蓝色渐变背景
  &--active {
    background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
    color: #ffffff;

    .mv3-mv-1785638525922-2516b1cd-switch-title {
      color: #ffffff;
    }
    .mv3-mv-1785638525922-2516b1cd-switch-info-label {
      color: rgba(255, 255, 255, 0.85);
    }
    .mv3-mv-1785638525922-2516b1cd-switch-info-value {
      color: #ffffff;
    }
  }

  // 默认态：浅蓝渐变背景
  &--default {
    background: linear-gradient(270deg, #85baff 0%, #bfe2ff 100%);
    color: #333333;

    .mv3-mv-1785638525922-2516b1cd-switch-title {
      color: #333333;
    }
    .mv3-mv-1785638525922-2516b1cd-switch-info-label {
      color: #333333;
    }
    .mv3-mv-1785638525922-2516b1cd-switch-info-value {
      color: #333333;
    }
  }
}

// 切换卡片背景图层
.mv3-mv-1785638525922-2516b1cd-switch-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.3;
}

// 切换卡片图标
.mv3-mv-1785638525922-2516b1cd-switch-icon {
  flex-shrink: 0;
  width: 35px;
  height: 28px;
  object-fit: contain;
  margin-right: 8px;
  position: relative;
  z-index: 1;
}

// 切换卡片文字区域
.mv3-mv-1785638525922-2516b1cd-switch-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.mv3-mv-1785638525922-2516b1cd-switch-title {
  font-size: 12px;
  font-family: 'YouSheBiaoTiHei', 'Source Han Sans CN', sans-serif;
  white-space: nowrap;
}

// 切换卡片统计信息行
.mv3-mv-1785638525922-2516b1cd-switch-info {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.mv3-mv-1785638525922-2516b1cd-switch-info-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.mv3-mv-1785638525922-2516b1cd-switch-info-label {
  font-size: 14px;
  font-family: 'Source Han Sans CN', sans-serif;
}

.mv3-mv-1785638525922-2516b1cd-switch-info-value {
  font-family: 'Roboto', sans-serif;
  font-size: 20px;
  font-weight: 700;
}

// 主内容区：左侧 Tab + 右侧设备网格
.mv3-mv-1785638525922-2516b1cd-main-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 4px;
}

// 左侧垂直 Tab 导航
.mv3-mv-1785638525922-2516b1cd-side-tabs {
  display: flex;
  flex-direction: column;
  width: 46px;
  min-width: 46px;
  gap: 2px;
}

// Tab 项样式
.mv3-mv-1785638525922-2516b1cd-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-family: 'Source Han Sans CN', sans-serif;
  color: #333333;
  transition: all 0.2s;
  min-height: 40px;

  // 激活态 Tab
  &--active {
    background: rgba(25, 144, 255, 0.15);
    color: #1990ff;
    font-weight: 700;
  }

  &:hover:not(&--active) {
    background: rgba(25, 144, 255, 0.08);
  }
}

// Tab 上的数字标记
.mv3-mv-1785638525922-2516b1cd-tab-count {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #1990ff;
  line-height: 18px;
}

// 右侧设备卡片网格：3列4行
.mv3-mv-1785638525922-2516b1cd-device-grid {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, auto);
  gap: 4px;
  align-content: start;
}</style>