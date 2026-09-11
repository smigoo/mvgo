<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="device in devices"
      :key="device.id"
      class="c-monitor-device-card"
      @click="handleCardClick(device)"
    >
      <div class="c-monitor-device-icon-wrapper">
        <!-- 图标占位容器 -->
        <div class="c-monitor-device-icon-placeholder" />
      </div>
      <div class="c-monitor-device-info">
        <div class="c-monitor-device-label">{{ device.label }}</div>
        <div class="c-monitor-device-value">
          <span class="c-monitor-device-online">{{ device.online }}</span>
          <span class="c-monitor-device-separator">/</span>
          <span class="c-monitor-device-total">{{ device.total }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  activeTab: {
    type: String,
    default: '监控'
  },
  devices: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['card-click'])

const handleCardClick = (device) => {
  emit('card-click', device)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  height: 100%;
  padding: 0;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(24, 144, 255, 0.08);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(24, 144, 255, 0.15);
  }
}

.c-monitor-device-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.c-monitor-device-icon-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: rgba(24, 144, 255, 0.1);
}

.c-monitor-device-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.c-monitor-device-label {
  font-size: calc(@fontSize * 0.857);
  color: rgba(51, 51, 51, 0.85);
  font-weight: 400;
  text-align: center;
  white-space: nowrap;
}

.c-monitor-device-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-family: Roboto, sans-serif;
}

.c-monitor-device-online {
  font-size: calc(@fontSize * 1.429);
  font-weight: bold;
  color: #1890ff;
  line-height: 1.2;
}

.c-monitor-device-separator {
  font-size: calc(@fontSize * 1);
  color: rgba(51, 51, 51, 0.65);
  margin: 0 2px;
}

.c-monitor-device-total {
  font-size: calc(@fontSize * 1);
  color: rgba(51, 51, 51, 0.65);
  line-height: 1.2;
}
</style>
