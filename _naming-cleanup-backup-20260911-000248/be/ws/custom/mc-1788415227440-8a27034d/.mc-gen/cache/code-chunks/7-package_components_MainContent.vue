<template>
  <div class="c-monitor-main-content">
    <!-- 顶部统计卡片区 -->
    <div class="c-monitor-stats-row">
      <!-- 隧道设备统计卡 -->
      <div
        class="c-monitor-stat-card c-monitor-stat-card--active"
        :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <img :src="icon1" class="c-monitor-stat-card-icon" alt="隧道设备图标" />
        <div class="c-monitor-stat-card-content">
          <span class="c-monitor-stat-card-title">隧道设备</span>
          <div class="c-monitor-stat-card-values">
            <div class="c-monitor-stat-card-value-row">
              <span class="c-monitor-stat-card-label">总数:</span>
              <span class="c-monitor-stat-card-number c-monitor-stat-card-number--white">56302</span>
            </div>
            <div class="c-monitor-stat-card-value-row">
              <span class="c-monitor-stat-card-label">异常数:</span>
              <span class="c-monitor-stat-card-number c-monitor-stat-card-number--danger">5</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 南北接线设备统计卡 -->
      <div
        class="c-monitor-stat-card c-monitor-stat-card--default"
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <img :src="icon2" class="c-monitor-stat-card-icon" alt="南北接线设备图标" />
        <div class="c-monitor-stat-card-content">
          <span class="c-monitor-stat-card-title c-monitor-stat-card-title--dark">南北接线 / 设备</span>
          <div class="c-monitor-stat-card-values">
            <div class="c-monitor-stat-card-value-row">
              <span class="c-monitor-stat-card-label c-monitor-stat-card-label--dark">总数:</span>
              <span class="c-monitor-stat-card-number c-monitor-stat-card-number--primary">1280</span>
            </div>
            <div class="c-monitor-stat-card-value-row">
              <span class="c-monitor-stat-card-label c-monitor-stat-card-label--dark">异常数:</span>
              <span class="c-monitor-stat-card-number c-monitor-stat-card-number--danger">3</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 设备网格 -->
    <div class="c-monitor-device-grid">
      <div
        v-for="device in deviceList"
        :key="device.id"
        class="c-monitor-device-card"
        :style="{ backgroundImage: `url(${device.bg})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        @click="handleDeviceClick(device)"
      >
        <img :src="device.icon" class="c-monitor-device-card-icon" :alt="device.name" />
        <span class="c-monitor-device-card-name">{{ device.name }}</span>
        <span
          :class="[
            'c-monitor-device-card-status',
            device.online > 0 ? 'c-monitor-device-card-status--active' : 'c-monitor-device-card-status--inactive'
          ]"
        >{{ device.status }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 系统自动注入以下变量（禁止手写 import）：
// bg1, bg2, bg3, bg4, bg5, bg6, bg7, bg8, bg9, bg10, bg11, bg12, bg13, bg14
// icon1, icon2, icon3, icon4, icon5, icon6, icon7, icon8, icon9, icon10, icon11, icon12, icon13, icon14

// 设备列表数据 —— 文字严格逐字取自 Figma 设计稿真值
const deviceList = ref([
  { id: 1,  name: '摄像机',     status: '(2/484)', online: 2,  bg: bg3,  icon: icon3  },
  { id: 2,  name: '风速风向仪', status: '(1/484)', online: 1,  bg: bg4,  icon: icon4  },
  { id: 3,  name: '超高检测器', status: '(0/484)', online: 0,  bg: bg5,  icon: icon5  },
  { id: 4,  name: '烟道机器人', status: '(0/484)', online: 0,  bg: bg6,  icon: icon6  },
  { id: 5,  name: '激光雷达',   status: '(0/484)', online: 0,  bg: bg7,  icon: icon7  },
  { id: 6,  name: 'CO2传感器',  status: '(0/484)', online: 0,  bg: bg8,  icon: icon8  },
  { id: 7,  name: 'CO/VI检测器',status: '(0/484)', online: 0,  bg: bg9,  icon: icon9  },
  { id: 8,  name: '温湿度传感器',status: '(0/484)', online: 0, bg: bg10, icon: icon10 },
  { id: 9,  name: '压力传感器', status: '(0/484)', online: 0,  bg: bg11, icon: icon11 },
  { id: 10, name: '光照度变送器',status: '(0/484)', online: 0, bg: bg12, icon: icon12 },
  { id: 11, name: '紧急电话',   status: '(0/484)', online: 0,  bg: bg13, icon: icon13 },
  { id: 12, name: '水质监测设备',status: '(0/484)', online: 0, bg: bg14, icon: icon14 },
])

// 设备卡片点击
const handleDeviceClick = (device) => {
  console.log('[MainContent] 点击设备卡片:', device.name)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 主内容区根容器 */
.c-monitor-main-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}

/* 顶部统计卡片横排 */
.c-monitor-stats-row {
  display: flex;
  flex-direction: row;
  gap: 6px;
  flex-shrink: 0;
}

/* 统计卡片 */
.c-monitor-stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}

/* 统计卡片图标 */
.c-monitor-stat-card-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

/* 统计卡片内容区 */
.c-monitor-stat-card-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 卡片标题 —— active 版（白字，隧道设备） */
.c-monitor-stat-card-title {
  font-family: YouSheBiaoTiHei, sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: #ffffff;
  white-space: nowrap;
}

/* 卡片标题 —— default 版（深色，南北接线设备） */
.c-monitor-stat-card-title--dark {
  color: #333333;
}

/* 数值行 */
.c-monitor-stat-card-value-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

/* 标签文字（总数: / 异常数:） */
.c-monitor-stat-card-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize);
  font-weight: 400;
  line-height: 21px;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.c-monitor-stat-card-label--dark {
  color: rgba(51, 51, 51, 0.8);
}

/* 数值 —— 白色版 */
.c-monitor-stat-card-number {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  line-height: 23px;
  white-space: nowrap;
}

.c-monitor-stat-card-number--white {
  color: #ffffff;
}

.c-monitor-stat-card-number--primary {
  color: rgba(74, 144, 226, 1);
}

.c-monitor-stat-card-number--danger {
  color: rgba(255, 85, 85, 1);
}

/* 设备网格：3列 */
.c-monitor-device-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  overflow-y: auto;
  align-content: start;
}

/* 单个设备卡片 */
.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px;
  cursor: pointer;
  border-radius: 4px;
  overflow: hidden;
  min-height: 64px;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.85;
  }
}

/* 设备图标 */
.c-monitor-device-card-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

/* 设备名称 */
.c-monitor-device-card-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: rgba(51, 51, 51, 1);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 在线/总数状态 —— 有在线（蓝色） */
.c-monitor-device-card-status {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  line-height: 18.75px;
  text-align: center;
}

.c-monitor-device-card-status--active {
  color: rgba(74, 144, 226, 1);
}

.c-monitor-device-card-status--inactive {
  color: rgba(153, 153, 153, 1);
}
</style>