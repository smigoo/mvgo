<template>
  <div class="mv-max-1785989472832-69de5a0d"
       :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 面板头部 -->
    <div class="panel-header">
      <!-- 装饰图标（g 区域小圆点装饰） -->
      <img :src="icon1" class="header-dot-icon" />
      <!-- 标题文字 -->
      <span class="header-title">设备监测</span>
      <!-- 统计信息区（设备类型 / 设备总数 / 完好率） -->
      <div class="header-stats">
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
          <span class="stat-value stat-value--teal">98%</span>
        </div>
      </div>
      <!-- 右侧图标按钮 -->
      <img :src="icon2" class="header-action-icon" />
      <!-- 数据实时更新文字 -->
      <span class="header-update-text">*数据实时更新</span>
    </div>

    <!-- 主内容区：switch 大卡片 + tab面板 -->
    <div class="slot-con">
      <!-- 顶部两个大切换卡片（隧道设备 / 南北接线设备） -->
      <div class="switch-bar">
        <!-- 激活状态：隧道设备 -->
        <div
          class="switch-card switch-card--active"
          :style="{ backgroundImage: `url(${bg2})` }"
          @click="handleSwitchTab(0)"
        >
          <div class="switch-card-top">
            <span class="switch-card-title switch-card-title--active">隧道设备</span>
            <div class="switch-card-icon">
              <!-- 隧道图标区域（icon3 = 隧道主icon） -->
              <img :src="icon3" class="switch-icon-img" />
            </div>
          </div>
          <div class="switch-card-stats">
            <div class="switch-stat-line">
              <span class="switch-stat-label">总数:</span>
              <span class="switch-stat-value">{{ tunnelData.total }}</span>
            </div>
            <div class="switch-stat-line">
              <span class="switch-stat-label">异常数:</span>
              <span class="switch-stat-value switch-stat-value--warning">{{ tunnelData.abnormal }}</span>
            </div>
          </div>
        </div>

        <!-- 默认状态：南北接线设备 -->
        <div
          class="switch-card switch-card--default"
          :style="{ backgroundImage: `url(${bg3})` }"
          @click="handleSwitchTab(1)"
        >
          <div class="switch-card-top">
            <span class="switch-card-title switch-card-title--default">南北接线 设备</span>
            <div class="switch-card-icon">
              <!-- 南北接线图标区域（icon4） -->
              <img :src="icon4" class="switch-icon-img" />
            </div>
          </div>
          <div class="switch-card-stats">
            <div class="switch-stat-line">
              <span class="switch-stat-label">总数:</span>
              <span class="switch-stat-value">{{ junctionData.total }}</span>
            </div>
            <div class="switch-stat-line">
              <span class="switch-stat-label">异常数:</span>
              <span class="switch-stat-value switch-stat-value--warning">{{ junctionData.abnormal }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 下方：左侧竖向 Tab + 右侧设备卡片网格 -->
      <div class="tab-content-area">
        <!-- 左侧竖向 Tab（@antd/tab 节点，使用 antd Tabs 纵向） -->
        <div class="vertical-tab-wrapper">
          <a-tabs
            v-model:activeKey="activeTabKey"
            tab-position="left"
            class="device-tabs"
            @change="handleTabChange"
          >
            <a-tab-pane key="monitor">
              <template #tab>
                <div class="tab-label-wrap">
                  <div
                    class="tab-bg-img"
                    :style="{ backgroundImage: `url(${activeTabKey === 'monitor' ? bg4 : bg4})` }"
                  ></div>
                  <span class="tab-text">监控</span>
                  <div class="tab-badge" v-if="activeTabKey === 'monitor'">
                    <span class="tab-badge-text">3/3740</span>
                  </div>
                  <div class="tab-badge-small" v-else>
                    <span class="tab-badge-small-text">3</span>
                  </div>
                </div>
              </template>
            </a-tab-pane>
            <a-tab-pane key="light">
              <template #tab>
                <div class="tab-label-wrap">
                  <div
                    class="tab-bg-img"
                    :style="{ backgroundImage: `url(${bg5})` }"
                  ></div>
                  <span class="tab-text">照明</span>
                  <div class="tab-badge-small">
                    <span class="tab-badge-small-text">3</span>
                  </div>
                </div>
              </template>
            </a-tab-pane>
            <a-tab-pane key="ventilation">
              <template #tab>
                <div class="tab-label-wrap">
                  <div
                    class="tab-bg-img"
                    :style="{ backgroundImage: `url(${bg6})` }"
                  ></div>
                  <span class="tab-text">通风</span>
                </div>
              </template>
            </a-tab-pane>
            <a-tab-pane key="fire">
              <template #tab>
                <div class="tab-label-wrap">
                  <div
                    class="tab-bg-img"
                    :style="{ backgroundImage: `url(${bg6})` }"
                  ></div>
                  <span class="tab-text">消防</span>
                </div>
              </template>
            </a-tab-pane>
            <a-tab-pane key="traffic">
              <template #tab>
                <div class="tab-label-wrap">
                  <div
                    class="tab-bg-img tab-bg-img--tall"
                    :style="{ backgroundImage: `url(${bg7})` }"
                  ></div>
                  <span class="tab-text">交通诱导</span>
                </div>
              </template>
            </a-tab-pane>
            <a-tab-pane key="power">
              <template #tab>
                <div class="tab-label-wrap">
                  <div
                    class="tab-bg-img tab-bg-img--medium"
                    :style="{ backgroundImage: `url(${bg8})` }"
                  ></div>
                  <span class="tab-text">供配电</span>
                </div>
              </template>
            </a-tab-pane>
          </a-tabs>
        </div>

        <!-- 右侧设备卡片网格（3列，多行） -->
        <div class="device-grid">
          <DeviceCard
            v-for="(device, index) in currentDeviceList"
            :key="device.id"
            :device="device"
            :bg-src="getDeviceBg(index)"
            :icon-src="getDeviceIcon(index)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>

const bg1 = new URL('../resources/images/bg-8418.png', import.meta.url).href
const icon1 = new URL('../resources/images/g-8421.png', import.meta.url).href
const icon2 = new URL('../resources/images/Frame-8856.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-8788.png', import.meta.url).href
const icon3 = new URL('../resources/images/icon-8798.png', import.meta.url).href
const bg3 = new URL('../resources/images/bg-8807.png', import.meta.url).href
const icon4 = new URL('../resources/images/icon-8817.png', import.meta.url).href
const bg4 = new URL('../resources/images/bg-8831.png', import.meta.url).href
const bg5 = new URL('../resources/images/bg-8831.png', import.meta.url).href
const bg6 = new URL('../resources/images/bg-8831.png', import.meta.url).href
const bg7 = new URL('../resources/images/bg-8847.png', import.meta.url).href
const bg8 = new URL('../resources/images/bg-8852.png', import.meta.url).href
const bg9 = new URL('../resources/images/bg-8439.png', import.meta.url).href
const bg20 = new URL('../resources/images/bg-8759.png', import.meta.url).href
const bg10 = new URL('../resources/images/bg-8468.png', import.meta.url).href
const bg11 = new URL('../resources/images/bg-8498.png', import.meta.url).href
const bg12 = new URL('../resources/images/bg-8527.png', import.meta.url).href
const bg13 = new URL('../resources/images/bg-8556.png', import.meta.url).href
const bg14 = new URL('../resources/images/bg-8585.png', import.meta.url).href
const bg15 = new URL('../resources/images/bg-8614.png', import.meta.url).href
const bg16 = new URL('../resources/images/bg-8643.png', import.meta.url).href
const bg17 = new URL('../resources/images/bg-8672.png', import.meta.url).href
const bg18 = new URL('../resources/images/bg-8701.png', import.meta.url).href
const bg19 = new URL('../resources/images/bg-8730.png', import.meta.url).href
const icon5 = new URL('../resources/images/icon-8444.png', import.meta.url).href
const icon16 = new URL('../resources/images/icon-8764.png', import.meta.url).href
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
/**
 * 设备监测主组件
 * 功能：展示隧道/南北接线设备的监控信息，支持左侧竖向Tab切换不同设备类型
 * 数据来源：静态初始化数据，支持API绑定覆盖
 * 关键交互：顶部大卡片切换（隧道/南北接线）+ 左侧Tab切换设备类型
 */

import { ref, computed, onMounted, onUnmounted} from 'vue'
import DeviceCard from './components/DeviceCard.vue'

// #region 1. 顶部大卡片切换状态
// 0 = 隧道设备（active），1 = 南北接线设备（default）
const activeSwitchIndex = ref(0)

// 隧道设备数据
const tunnelData = ref({
  total: 56302,
  abnormal: 5
})

// 南北接线设备数据
const junctionData = ref({
  total: 1280,
  abnormal: 3
})
// #endregion

// #region 2. 左侧竖向 Tab 状态
// 默认激活"监控"Tab，对应 Figma 中 tab-active 节点
const activeTabKey = ref('monitor')
// #endregion

// #region 3. 各 Tab 对应的设备卡片数据
// 监控设备列表（对应 cons 区域的 12 个 Group 节点）
const monitorDeviceList = ref([
  { id: 1,  name: '摄像机',     status: '(2/484)' },
  { id: 2,  name: '烟道机器人', status: '(0/484)' },
  { id: 3,  name: 'CO/VI检测器', status: '(0/484)' },
  { id: 4,  name: '光照度变送器', status: '(0/484)' },
  { id: 5,  name: '激光雷达',   status: '(0/484)' },
  { id: 6,  name: '风速风向仪', status: '(1/484)' },
  { id: 7,  name: '温湿度传感器', status: '(0/484)' },
  { id: 8,  name: '紧急电话',   status: '(0/484)' },
  { id: 9,  name: '超高检测器', status: '(0/484)' },
  { id: 10, name: 'CO2传感器',  status: '(0/484)' },
  { id: 11, name: '压力传感器', status: '(0/484)' },
  { id: 12, name: '水质监测设备', status: '(0/484)' }
])

const lightDeviceList = ref([
  { id: 1,  name: '隧道灯',     status: '(0/484)' },
  { id: 2,  name: '应急灯',     status: '(0/484)' },
  { id: 3,  name: '诱导灯',     status: '(0/484)' },
  { id: 4,  name: '标志灯',     status: '(0/484)' },
  { id: 5,  name: '洞口灯',     status: '(0/484)' },
  { id: 6,  name: '调光控制器', status: '(0/484)' }
])

const ventilationDeviceList = ref([
  { id: 1, name: '射流风机',   status: '(0/484)' },
  { id: 2, name: '轴流风机',   status: '(0/484)' },
  { id: 3, name: '风速检测器', status: '(0/484)' }
])

const fireDeviceList = ref([
  { id: 1, name: '消火栓',     status: '(0/484)' },
  { id: 2, name: '灭火器',     status: '(0/484)' },
  { id: 3, name: '火焰检测器', status: '(0/484)' },
  { id: 4, name: '喷淋系统',   status: '(0/484)' }
])

const trafficDeviceList = ref([
  { id: 1, name: '可变情报板', status: '(0/484)' },
  { id: 2, name: '车道指示器', status: '(0/484)' },
  { id: 3, name: '限速标志',   status: '(0/484)' }
])

const powerDeviceList = ref([
  { id: 1, name: '变压器',   status: '(0/484)' },
  { id: 2, name: '配电柜',   status: '(0/484)' },
  { id: 3, name: 'UPS电源',  status: '(0/484)' },
  { id: 4, name: '发电机组', status: '(0/484)' }
])
// #endregion

// #region 4. 计算当前 Tab 对应的设备列表
// 根据 activeTabKey 派生当前展示的设备列表
const currentDeviceList = computed(() => {
  const map = {
    monitor:     monitorDeviceList.value,
    light:       lightDeviceList.value,
    ventilation: ventilationDeviceList.value,
    fire:        fireDeviceList.value,
    traffic:     trafficDeviceList.value,
    power:       powerDeviceList.value
  }
  return map[activeTabKey.value] || monitorDeviceList.value
})
// #endregion

// #region 5. 背景图与图标资源映射
/**
 * 根据设备卡片 index 返回对应的背景图变量
 * 监控 Tab 下 12 张卡片分别对应 bg9~bg20
 * 其他 Tab 的卡片复用 bg9（统一样式兜底）
 */
const getDeviceBg = (index) => {
  // 监控 Tab 精确映射 bg9~bg20
  const bgMap = ref([bg9, bg10, bg11, bg12, bg13, bg14, bg15, bg16, bg17, bg18, bg19, bg20])
  if (activeTabKey.value === 'monitor' && index < bgMap.length) {
    return bgMap[index]
  }
  // 其他 Tab 统一用 bg9 作为卡片背景
  return bg9
}

/**
 * 根据设备卡片 index 返回对应的图标变量
 * 监控 Tab 下 12 张卡片分别对应 icon5~icon16
 * 其他 Tab 统一用 icon5 兜底
 */
const getDeviceIcon = (index) => {
  const iconMap = ref([icon5, icon6, icon7, icon8, icon9, icon10, icon11, icon12, icon13, icon14, icon15, icon16])
  if (activeTabKey.value === 'monitor' && index < iconMap.length) {
    return iconMap[index]
  }
  return icon5
}
// #endregion

// #region 6. 交互事件处理
/**
 * 切换顶部大卡片（隧道设备 / 南北接线设备）
 * 同时重置 Tab 到"监控"
 */
const handleSwitchTab = (index) => {
  activeSwitchIndex.value = index
  // 切换大卡片后重置左侧 Tab，避免内容不一致
  activeTabKey.value = 'monitor'
}

/**
 * 左侧竖向 Tab 切换事件
 * 联动刷新设备卡片区域（currentDeviceList 会自动 computed 更新）
 */
const handleTabChange = (key) => {
  activeTabKey.value = key
}
// #endregion

</script>


<style lang="less" scoped>
@import '../resources/styles/index.less';

/* 根容器：420×425 面板，背景图 + 阴影 */
.mv-max-1785989472832-69de5a0d {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 背景图由 :style 注入，这里设置背景尺寸和定位 */
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center center;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  overflow: hidden;
  position: relative;
  padding: 16px 16px 12px;
  box-sizing: border-box;
}

/* ===== 面板头部 ===== */
.panel-header {
  /* HORIZONTAL 布局，行内对齐 */
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 30px;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: 10px;
}

/* 装饰小圆点图标（8×8px） */
.header-dot-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  object-fit: contain;
}

/* 标题文字：渐变色 #1990ff → #5a7eff */
.header-title {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 统计信息区：设备类型 / 设备总数 / 完好率 */
.header-stats {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex: 1;
  margin-left: 4px;
}

.stat-item {
  /* HORIZONTAL，交叉轴居中，gap: 1px */
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
  white-space: nowrap;
}

/* 数字值：蓝色渐变（设备类型、设备总数） */
.stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 20px;
  font-weight: 700;
  line-height: 23.4375px;
}

.stat-value--blue {
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 完好率：#08a3a5 色调 */
.stat-value--teal {
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: #08a3a5;
  color: #08a3a5;
}

/* 右侧图标按钮（16×16px Frame） */
.header-action-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  object-fit: contain;
}

/* 数据实时更新文字 */
.header-update-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
  text-align: right;
  flex-shrink: 0;
}

/* ===== 主内容区 ===== */
.slot-con {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  gap: 8px;
}

/* ===== 顶部两个大切换卡片 ===== */
.switch-bar {
  /* HORIZONTAL：两张卡片并排 */
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  flex-shrink: 0;
  height: 65px;
}

.switch-card {
  /* 每张卡片约 193×65px */
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 6px 10px 6px 12px;
  box-sizing: border-box;
  border-radius: 6px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  cursor: pointer;
  overflow: hidden;
  position: relative;
}

/* 激活卡片：隧道设备（带高亮渐变背景） */
.switch-card--active {
  /* 背景图由 :style 注入 */
}

/* 默认卡片：南北接线设备 */
.switch-card--default {
  /* 背景图由 :style 注入 */
}

.switch-card-top {
  /* HORIZONTAL：标题在左，图标在右 */
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.switch-card-title {
  font-family: 'YouSheBiaoTiHei', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 15.6px;
  white-space: pre-wrap;
}

.switch-card-title--active {
  color: #ffffff;
}

.switch-card-title--default {
  color: #333333;
  text-align: center;
  line-height: 10px;
}

.switch-card-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.switch-icon-img {
  width: 35px;
  height: 28px;
  object-fit: contain;
}

.switch-card-stats {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.switch-stat-line {
  /* HORIZONTAL，gap: 1px，交叉轴居中 */
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.switch-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
}

.switch-card--default .switch-stat-label {
  color: #555555;
}

.switch-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 20px;
  font-weight: 700;
  line-height: 23.4375px;
  color: #ffffff;
}

.switch-card--default .switch-stat-value {
  color: #333333;
}

.switch-stat-value--warning {
  color: #f53f3f;
}

/* ===== Tab + 设备卡片区域 ===== */
.tab-content-area {
  /* HORIZONTAL：左侧 tab + 右侧网格 */
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  gap: 4px;
  overflow: hidden;
}

/* 左侧竖向 Tab 包装器 */
.vertical-tab-wrapper {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 覆盖 antd Tabs 左侧竖向样式 */
:deep(.device-tabs) {
  width: 46px;
  height: 100%;

  &.ant-tabs-left {
    flex-direction: row;
  }

  /* 隐藏右侧内容区（内容由右边 device-grid 承载） */
  .ant-tabs-content-holder {
    display: none;
  }

  /* 左侧 tab 条 */
  .ant-tabs-nav {
    width: 46px;
    margin: 0;
  }

  .ant-tabs-nav-wrap {
    overflow: visible;
  }

  .ant-tabs-nav-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* 每个 Tab 条目 */
  .ant-tabs-tab {
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
  }

  /* 激活态 Tab 条目 */
  .ant-tabs-tab-active {
    background: transparent;
  }

  /* 去掉 antd 默认的激活蓝色下划线 */
  .ant-tabs-ink-bar {
    display: none;
  }
}

/* Tab 标签内容包装 */
.tab-label-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 38px;
  min-height: 40px;
  gap: 2px;
}

/* Tab 背景图（由 :style 注入） */
.tab-bg-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 34px;
  height: 40px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  border-radius: 3px;
  z-index: 0;
}

/* 较高的 Tab 背景（交通诱导：34×72） */
.tab-bg-img--tall {
  height: 72px;
}

/* 中等高度的 Tab 背景（供配电：34×56） */
.tab-bg-img--medium {
  height: 56px;
}

.tab-text {
  position: relative;
  z-index: 1;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 16px;
  color: #333333;
  text-align: center;
  writing-mode: vertical-rl;
  letter-spacing: 1px;
}

/* 激活 Tab 文字加粗白色 */
:deep(.ant-tabs-tab-active) .tab-text {
  font-weight: 700;
  color: #ffffff;
}

/* 激活状态下的大 badge（如"3/3740"） */
.tab-badge {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 18px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9px;
}

.tab-badge-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  color: #ffffff;
  white-space: nowrap;
  font-size: 10px;
}

/* 非激活状态的小 badge（红点数字） */
.tab-badge-small {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-badge-small-text {
  font-family: 'Roboto', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  color: #ffffff;
}

/* ===== 右侧设备卡片网格 ===== */
.device-grid {
  flex: 1;
  min-width: 0;
  display: grid;
  /* 3 列，每列等宽约 117px */
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 64px;
  gap: 2px;
  overflow-y: auto;
  align-content: start;

  /* 隐藏滚动条 */
  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  scrollbar-width: none;
}</style>