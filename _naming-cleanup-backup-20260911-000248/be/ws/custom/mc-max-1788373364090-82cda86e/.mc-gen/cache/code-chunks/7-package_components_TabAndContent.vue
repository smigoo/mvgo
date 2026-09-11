<template>
  <div class="c-monitor-tab-content">
    <!-- 竖向标签页 + 设备卡片网格 -->
    <div class="c-monitor-tab-area">
      <!-- 竖向标签列 -->
      <div class="c-monitor-tabs-list">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.value"
          :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.value }]"
          @click="handleTabChange(tab.value)"
        >
          <!-- 激活态角标（监控 tab 顶部 3/3740） -->
          <div v-if="tab.badge && activeTab === tab.value" class="c-monitor-tab-badge-top">
            {{ tab.badge }}
          </div>
          <!-- 非激活态数字角标（照明 tab 右上角 3） -->
          <div v-if="tab.alertCount && activeTab !== tab.value" class="c-monitor-tab-alert-badge">
            {{ tab.alertCount }}
          </div>
          <span class="c-monitor-tab-label">{{ tab.name }}</span>
        </div>
      </div>

      <!-- 设备卡片网格区域 -->
      <div class="c-monitor-device-grid">
        <div
          v-for="(device, idx) in currentDevices"
          :key="device.id"
          class="c-monitor-device-card"
          :style="{ backgroundImage: `url(${getDeviceBg(idx)})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <!-- 设备图标 -->
          <img
            :src="getDeviceIcon(idx)"
            class="c-monitor-device-icon"
            :alt="device.name"
          />
          <!-- 设备名称 -->
          <span class="c-monitor-device-name">{{ device.name }}</span>
          <!-- 异常数/总数 -->
          <div class="c-monitor-device-value">
            <span
              :class="['c-monitor-device-abnormal', device.abnormal > 0 ? 'c-monitor-device-abnormal--red' : 'c-monitor-device-abnormal--normal']"
            >{{ device.abnormal }}</span>
            <span class="c-monitor-device-total">/{{ device.total }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

// 系统自动注入这些资源变量（禁止手写 import）
// bg3 ~ bg14 为设备卡片背景（bg3 对应 bg-8439.png，12张设备卡片共用）
// icon3 ~ icon14 为设备图标

// 标签页数据（来自 Figma 设计稿真值）
const tabs = ref([
  { name: '监控', value: 'monitor', badge: '3/3740', alertCount: null },
  { name: '照明', value: 'lighting', badge: null, alertCount: '3' },
  { name: '通风', value: 'ventilation', badge: null, alertCount: null },
  { name: '消防', value: 'fire', badge: null, alertCount: null },
  { name: '交通诱导', value: 'traffic', badge: null, alertCount: null },
  { name: '供配电', value: 'power', badge: null, alertCount: null },
])

const activeTab = ref('monitor')

// 监控 tab 的 12 个设备（来自 Figma 设计稿真值，设备文字取自清单）
const monitorDevices = [
  { id: 'device-1', name: '摄像机', abnormal: 2, total: 484 },
  { id: 'device-2', name: '风速风向仪', abnormal: 1, total: 484 },
  { id: 'device-3', name: '超高检测器', abnormal: 0, total: 484 },
  { id: 'device-4', name: '烟道机器人', abnormal: 0, total: 484 },
  { id: 'device-5', name: '激光雷达', abnormal: 0, total: 484 },
  { id: 'device-6', name: 'CO2传感器', abnormal: 0, total: 484 },
  { id: 'device-7', name: 'CO/VI检测器', abnormal: 0, total: 484 },
  { id: 'device-8', name: '温湿度传感器', abnormal: 0, total: 484 },
  { id: 'device-9', name: '压力传感器', abnormal: 0, total: 484 },
  { id: 'device-10', name: '光照度变送器', abnormal: 0, total: 484 },
  { id: 'device-11', name: '紧急电话', abnormal: 0, total: 484 },
  { id: 'device-12', name: '水质监测设备', abnormal: 0, total: 484 },
]

// 其他 tab 占位数据（切换演示用）
const otherDevices = [
  { id: 'other-1', name: '设备A', abnormal: 0, total: 100 },
  { id: 'other-2', name: '设备B', abnormal: 1, total: 100 },
  { id: 'other-3', name: '设备C', abnormal: 0, total: 100 },
]

const currentDevices = computed(() => {
  if (activeTab.value === 'monitor') return monitorDevices
  return otherDevices
})

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

// 设备卡片背景图：12 张卡片均使用 bg3（对应 bg-8439.png）
// 资源白名单：bg3~bg14 可用，这里统一使用 bg3
const getDeviceBg = (idx) => {
  // 12 个设备卡片共用同一背景图 bg3（bg-8439.png）
  return bg3
}

// 设备图标：icon3~icon14 分别对应设备 1~12
const deviceIcons = computed(() => [
  icon3, icon4, icon5, icon6, icon7, icon8,
  icon9, icon10, icon11, icon12, icon13, icon14
])

const getDeviceIcon = (idx) => {
  return deviceIcons.value[idx] || icon3
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tab-content {
  flex: 317 1 0;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-tab-area {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 0;
}

/* 竖向标签列 */
.c-monitor-tabs-list {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.c-monitor-tab-item {
  position: relative;
  width: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  cursor: pointer;
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border: 1px solid rgba(240, 245, 255, 1);
  border-radius: 6px 6px 0 0;
  min-height: 40px;

  &--active {
    background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
    border: 1px solid rgba(240, 245, 255, 1);
    border-radius: 0 6px 6px 0;
    width: 34px;
  }
}

.c-monitor-tab-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: #3b80e7;
  text-align: center;
  writing-mode: vertical-lr;
  letter-spacing: 2px;
  line-height: 16px;

  .c-monitor-tab-item--active & {
    font-weight: 700;
    color: #ffffff;
  }
}

/* 激活态顶部角标（3/3740） */
.c-monitor-tab-badge-top {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  background: #ffffff;
  border: 1px solid rgba(37, 141, 200, 1);
  border-radius: 4px 4px 4px 0;
  box-shadow: 0px 1px 2px 0px rgba(51, 101, 144, 0.4);
  padding: 0 3px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  color: #333333;
  line-height: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 非激活态数字角标（如照明 tab 右上角 3） */
.c-monitor-tab-alert-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 77, 79, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  color: #ffffff;
  line-height: 14px;
}

/* 设备卡片网格 */
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
  gap: 2px;
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: rgba(51, 51, 51, 1);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.c-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 0;
}

.c-monitor-device-abnormal {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  line-height: 18.75px;
  text-shadow: 0px 0px 0px rgba(0, 0, 0, 0.5);

  &--red {
    color: rgba(255, 77, 79, 1);
  }

  &--normal {
    color: rgba(51, 51, 51, 1);
  }
}

.c-monitor-device-total {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 18.75px;
}
</style>