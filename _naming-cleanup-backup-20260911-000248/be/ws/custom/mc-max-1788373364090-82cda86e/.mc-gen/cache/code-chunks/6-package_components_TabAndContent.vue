<template>
  <div class="c-monitor-tab-content">
    <!-- 竖向标签页 + 设备卡片网格 -->
    <div class="c-monitor-tab-content-inner">
      <!-- 左侧竖向标签页 -->
      <div class="c-monitor-vertical-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.value }]"
          @click="handleTabChange(tab.value)"
        >
          <!-- 监控 tab 顶部角标 3/3740 -->
          <div v-if="tab.badge && activeTab === tab.value" class="c-monitor-tab-badge-top">
            {{ tab.badge }}
          </div>
          <!-- 照明 tab 右上角数字角标 -->
          <div v-if="tab.badgeCount && activeTab !== tab.value" class="c-monitor-tab-badge-count">
            {{ tab.badgeCount }}
          </div>
          <span class="c-monitor-tab-label">{{ tab.label }}</span>
        </div>
      </div>

      <!-- 右侧设备卡片网格 -->
      <div class="c-monitor-device-grid">
        <div
          v-for="(device, index) in currentDevices"
          :key="device.id"
          class="c-monitor-device-card"
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <!-- 设备图标 -->
          <img :src="device.icon" :alt="device.name" class="c-monitor-device-icon" />
          <!-- 设备名称 -->
          <span class="c-monitor-device-name">{{ device.name }}</span>
          <!-- 异常数/总数 -->
          <span
            :class="['c-monitor-device-value', { 'c-monitor-device-value--alert': hasAlert(device.valueText) }]"
          >{{ device.valueText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

// 系统注入的资源变量（背景图和图标）
// bg3 = 设备卡片背景图 (bg-8439.png)
// icon3~icon14 = 各设备图标

// 当前激活的 tab
const activeTab = ref('monitor')

// Tab 配置
const tabs = ref([
  { label: '监控', value: 'monitor', badge: '3/3740', badgeCount: null },
  { label: '照明', value: 'lighting', badge: null, badgeCount: 3 },
  { label: '通风', value: 'ventilation', badge: null, badgeCount: null },
  { label: '供配电', value: 'power', badge: null, badgeCount: null },
  { label: '消防', value: 'fire', badge: null, badgeCount: null },
  { label: '交通诱导', value: 'traffic', badge: null, badgeCount: null },
])

// 监控 tab 下的设备列表（12个）
const monitorDevices = [
  { id: 'device-1', name: '摄像机', valueText: '(2/484)', iconVar: 'icon3' },
  { id: 'device-2', name: '风速风向仪', valueText: '(1/484)', iconVar: 'icon4' },
  { id: 'device-3', name: '超高检测器', valueText: '(0/484)', iconVar: 'icon5' },
  { id: 'device-4', name: '烟道机器人', valueText: '(0/484)', iconVar: 'icon6' },
  { id: 'device-5', name: '激光雷达', valueText: '(0/484)', iconVar: 'icon7' },
  { id: 'device-6', name: 'CO2传感器', valueText: '(0/484)', iconVar: 'icon8' },
  { id: 'device-7', name: 'CO/VI检测器', valueText: '(0/484)', iconVar: 'icon9' },
  { id: 'device-8', name: '温湿度传感器', valueText: '(0/484)', iconVar: 'icon10' },
  { id: 'device-9', name: '压力传感器', valueText: '(0/484)', iconVar: 'icon11' },
  { id: 'device-10', name: '光照度变送器', valueText: '(0/484)', iconVar: 'icon12' },
  { id: 'device-11', name: '紧急电话', valueText: '(0/484)', iconVar: 'icon13' },
  { id: 'device-12', name: '水质监测设备', valueText: '(0/484)', iconVar: 'icon14' },
]

// 各 tab 占位设备数据（其他 tab 切换后展示空数据演示）
const otherDevices = [
  { id: 'device-placeholder-1', name: '设备1', valueText: '(0/100)', iconVar: 'icon3' },
  { id: 'device-placeholder-2', name: '设备2', valueText: '(0/100)', iconVar: 'icon4' },
  { id: 'device-placeholder-3', name: '设备3', valueText: '(0/100)', iconVar: 'icon5' },
]

// 根据 iconVar 名称映射到实际注入变量
// 系统会注入 icon3~icon14，通过 props 传入或直接在模板作用域访问
// 此处通过计算属性解析图标变量
const iconMap = computed(() => ({
  icon3,
  icon4,
  icon5,
  icon6,
  icon7,
  icon8,
  icon9,
  icon10,
  icon11,
  icon12,
  icon13,
  icon14,
}))

// 当前显示的设备列表（带解析后的 icon）
const currentDevices = computed(() => {
  const rawDevices = activeTab.value === 'monitor' ? monitorDevices : otherDevices
  return rawDevices.map(d => ({
    ...d,
    icon: iconMap.value[d.iconVar] || null,
  }))
})

// 判断是否有异常（异常数 > 0）
const hasAlert = (valueText) => {
  // 格式如 (2/484)，提取括号内第一个数字
  const match = valueText.match(/\((\d+)\//)
  return match ? parseInt(match[1], 10) > 0 : false
}

// Tab 切换处理
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tab-content {
  flex: 317 1 0;
  min-height: 0;
  overflow: hidden;
}

.c-monitor-tab-content-inner {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 8px;
}

/* 左侧竖向标签页 */
.c-monitor-vertical-tabs {
  display: flex;
  flex-direction: column;
  width: 46px;
  flex-shrink: 0;
  gap: 0;
}

.c-monitor-tab-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 34px;
  padding: calc(@fontSize * 0.57) calc(@fontSize * 0.29);
  cursor: pointer;
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border: 1px solid rgba(240, 245, 255, 1);
  border-radius: 6px 6px 0 0;
  margin-bottom: 2px;
  flex-shrink: 0;

  &--active {
    background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
    border-color: rgba(240, 245, 255, 1);
    border-radius: 0 6px 6px 0;
    width: 34px;

    .c-monitor-tab-label {
      color: #ffffff;
      font-weight: 700;
    }
  }
}

.c-monitor-tab-label {
  writing-mode: vertical-lr;
  text-orientation: upright;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #3b80e7;
  text-align: center;
  line-height: 1;
  letter-spacing: 2px;
  white-space: nowrap;
}

/* 监控 tab 顶部角标（3/3740） */
.c-monitor-tab-badge-top {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  background: #ffffff;
  border: 1px solid rgba(37, 141, 200, 1);
  border-radius: 4px 4px 4px 0;
  box-shadow: 0 1px 2px 0 rgba(51, 101, 144, 0.4);
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.86);
  font-weight: 500;
  color: #333333;
  padding: 0 2px;
  white-space: nowrap;
  line-height: calc(@fontSize * 1.29);
  text-align: center;
}

/* 照明 tab 角标数字（3） */
.c-monitor-tab-badge-count {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  border-radius: 29px;
  background: rgba(255, 77, 79, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 0.86);
  font-weight: 500;
  color: #ffffff;
  line-height: 1;
}

/* 右侧设备卡片网格 */
.c-monitor-device-grid {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 8px;
  overflow: hidden;
  align-content: start;
}

/* 单个设备卡片 */
.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 4px;
  min-height: 64px;
  box-sizing: border-box;
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
  margin-bottom: 2px;
}

.c-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.86);
  font-weight: 400;
  color: #333333;
  text-align: center;
  line-height: calc(@fontSize * 1.29);
  white-space: nowrap;
}

.c-monitor-device-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #ffffff;
  text-align: center;
  line-height: calc(@fontSize * 1.34);
  text-shadow: 0 0 0 rgba(0, 0, 0, 0.5);
  white-space: nowrap;

  &--alert {
    color: #ffffff;
    // 异常数 > 0 时整体文字保持白色，数值本身由父级渲染判断
    // 根据 Figma：(2/484) 整体为白色，带 drop-shadow
    text-shadow: 0 0 0 rgba(0, 0, 0, 0.5);
  }
}
</style>