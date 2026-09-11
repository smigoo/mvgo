<template>
  <div class="c-monitor-device-grid-container">
    <div
      v-for="(device, index) in devices"
      :key="index"
      class="c-monitor-device-card"
    >
      <img
        :src="nameToIconMap[device.name]"
        class="c-monitor-device-icon"
        :alt="device.name"
      />
      <div class="c-monitor-device-info">
        <div class="c-monitor-device-name">{{ device.name }}</div>
        <div
          class="c-monitor-device-value"
          :class="device.errorCount > 0 ? 'c-monitor-device-value--error' : 'c-monitor-device-value--normal'"
        >
          ({{ device.errorCount }}/{{ device.totalCount }})
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  }
})

// 根据设备名称映射正确的 Figma 图标资源（修正 index.vue 中的 icon 字段映射错误）
const nameToIconMap = {
  '摄像机': icon3,
  '风速风向仪': icon8,
  '超高检测器': icon11,
  '烟雾机器人': icon4,
  '激光雷达': icon7,
  'CO传感器': icon12,
  'CO/VI检测器': icon5,
  '温湿度传感器': icon9,
  '压力传感器': icon13,
  '光照度变送器': icon6,
  '紧急电话': icon10,
  '水质监测设备': icon14
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
}

.c-monitor-device-card {
  position: relative;
  width: 100%;
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(230, 242, 255, 0.6) 100%);
  border-radius: 6px;
  border: 1px solid rgba(25, 144, 255, 0.15);
  box-sizing: border-box;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(25, 144, 255, 0.4);
    box-shadow: 0 2px 8px rgba(25, 144, 255, 0.1);
  }
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  margin-right: 8px;
  object-fit: contain;
}

.c-monitor-device-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  min-width: 0;
}

.c-monitor-device-name {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Source Han Sans CN', sans-serif;
}

.c-monitor-device-value {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 18.75px;
  margin-top: 2px;
}

.c-monitor-device-value--error {
  color: rgba(255, 77, 79, 1);
}

.c-monitor-device-value--normal {
  color: rgba(82, 196, 26, 1);
}
</style>