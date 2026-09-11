<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="(device, index) in deviceList"
      :key="device.name"
      class="c-monitor-device-card"
      :style="{ backgroundImage: `url(${cardBg})` }"
    >
      <!-- 异常角标（仅摄像机显示） -->
      <div v-if="device.badge" class="c-monitor-device-badge">
        {{ device.badge }}
      </div>

      <!-- 设备图标 -->
      <div class="c-monitor-device-icon-wrapper">
        <img :src="device.icon" class="c-monitor-device-icon" alt="" />
      </div>

      <!-- 设备信息 -->
      <div class="c-monitor-device-info">
        <div class="c-monitor-device-name">{{ device.name }}</div>
        <div class="c-monitor-device-value">
          <span class="c-monitor-device-current">{{ device.current }}</span>
          <span class="c-monitor-device-separator">/</span>
          <span class="c-monitor-device-total">{{ device.total }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// 卡片背景图（3种背景循环使用）
const bgList = [bg10, bg11, bg12]

// 设备列表数据
const deviceList = ref([
  { name: '摄像机', current: 2, total: 484, icon: icon3, badge: 3 },
  { name: '风速风向仪', current: 1, total: 484, icon: icon4 },
  { name: '超高检测器', current: 0, total: 484, icon: icon5 },
  { name: '烟雾机器人', current: 0, total: 484, icon: icon6 },
  { name: '激光雷达', current: 0, total: 484, icon: icon7 },
  { name: 'CO/传感器', current: 0, total: 484, icon: icon8 },
  { name: 'CO/VI检测器', current: 0, total: 484, icon: icon9 },
  { name: '温湿度传感器', current: 0, total: 484, icon: icon10 },
  { name: '压力传感器', current: 0, total: 484, icon: icon11 },
  { name: '光照度变送器', current: 0, total: 484, icon: icon12 },
  { name: '紧急电话', current: 0, total: 484, icon: icon13 },
  { name: '水质监测设备', current: 0, total: 484, icon: icon14 }
])

// 卡片背景（循环使用3张背景图）
const cardBg = computed(() => {
  // 使用第1张背景图作为默认
  return bgList[0]
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
}

.c-monitor-device-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 12px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 8px;
  min-height: 64px;
}

.c-monitor-device-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: rgba(255, 77, 79, 1);
  color: rgba(255, 255, 255, 1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.c-monitor-device-icon-wrapper {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-device-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.c-monitor-device-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.c-monitor-device-name {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.85);
  text-align: center;
  line-height: 18px;
}

.c-monitor-device-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-family: 'Roboto', sans-serif;
}

.c-monitor-device-current {
  font-size: 18px;
  font-weight: bold;
  color: rgba(24, 144, 255, 1);
  line-height: 21px;
}

.c-monitor-device-separator {
  font-size: 14px;
  color: rgba(51, 51, 51, 0.65);
}

.c-monitor-device-total {
  font-size: 14px;
  color: rgba(51, 51, 51, 0.65);
  line-height: 18px;
}
</style>
