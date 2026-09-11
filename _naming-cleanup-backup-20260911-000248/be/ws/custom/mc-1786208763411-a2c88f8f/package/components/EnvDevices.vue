<template>
  <div class="c-ff0ff1-devices-wrapper">
    <div class="c-ff0ff1-devices-title-row">
      <span class="c-ff0ff1-devices-label">设备状态</span>
      <div class="c-ff0ff1-devices-badge">
        <span class="c-ff0ff1-badge-text">6</span>
      </div>
    </div>
    <div class="c-ff0ff1-devices-content">
      <div class="c-ff0ff1-device-item">
        <div class="c-ff0ff1-device-indicator c-ff0ff1-indicator-normal"></div>
        <span class="c-ff0ff1-device-name">CO传感器</span>
        <span class="c-ff0ff1-device-status-text">在线</span>
      </div>
      <div class="c-ff0ff1-device-item">
        <div class="c-ff0ff1-device-indicator c-ff0ff1-indicator-alarm"></div>
        <span class="c-ff0ff1-device-name">能见度仪</span>
        <span class="c-ff0ff1-device-status-text c-ff0ff1-text-alarm">告警</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[ff0ff1-EnvDevices] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const alarmCount = ref(6)

// --- 生命周期 ---
onMounted(() => {
  // 组件挂载逻辑
})

onUnmounted(() => {
  // 清理逻辑
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-ff0ff1-devices-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-ff0ff1-devices-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-ff0ff1-devices-label {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.c-ff0ff1-devices-badge {
  background: #f53f3f;
  border-radius: 29px;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-ff0ff1-badge-text {
  font-family: PingFang SC, sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #ffffff;
  line-height: 14px;
}

.c-ff0ff1-devices-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.c-ff0ff1-device-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 4px;
}

.c-ff0ff1-device-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-ff0ff1-indicator-normal {
  background: #52c41a;
}

.c-ff0ff1-indicator-alarm {
  background: #f53f3f;
}

.c-ff0ff1-device-name {
  font-size: 12px;
  color: #333333;
  flex: 1;
}

.c-ff0ff1-device-status-text {
  font-size: 12px;
  color: #52c41a;
}

.c-ff0ff1-text-alarm {
  color: #f53f3f;
}
</style>