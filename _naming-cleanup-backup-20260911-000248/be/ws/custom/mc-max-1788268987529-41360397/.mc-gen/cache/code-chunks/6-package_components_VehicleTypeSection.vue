<template>
  <div class="c-monitor-vehicle-type-section">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <img :src="iconTitle" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-section-title">车型分布</span>
      </div>
    </div>

    <!-- Section Body -->
    <div class="c-monitor-vehicle-type-body">
      <!-- 江阴靖江长江隧道 -->
      <div 
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: `url(${bgTunnel})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-vehicle-group">
          <span class="c-monitor-vehicle-label">客车</span>
          <span class="c-monitor-vehicle-value c-monitor-vehicle-value-primary">{{ tunnelData.passenger }}</span>
        </div>
        <img :src="iconTunnel" class="c-monitor-vehicle-icon" alt="vehicle" />
        <div class="c-monitor-vehicle-group">
          <span class="c-monitor-vehicle-label">货车</span>
          <span class="c-monitor-vehicle-value c-monitor-vehicle-value-warning">{{ tunnelData.freight }}</span>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div 
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: `url(${bgBridge})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-vehicle-group">
          <span class="c-monitor-vehicle-label">客车</span>
          <span class="c-monitor-vehicle-value c-monitor-vehicle-value-primary">{{ bridgeData.passenger }}</span>
        </div>
        <img :src="iconBridge" class="c-monitor-vehicle-icon" alt="vehicle" />
        <div class="c-monitor-vehicle-group">
          <span class="c-monitor-vehicle-label">货车</span>
          <span class="c-monitor-vehicle-value c-monitor-vehicle-value-warning">{{ bridgeData.freight }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import icon3561 from '../../resources/images/icon-3561.png'
import icon3573 from '../../resources/images/icon-3573.png'

const props = defineProps({
  bgTunnel: { type: String, required: true },
  bgBridge: { type: String, required: true },
  iconTitle: { type: String, required: true }
})

const iconTunnel = ref(icon3561)
const iconBridge = ref(icon3573)

const tunnelData = computed(() => ({
  passenger: '22350',
  freight: '16270'
}))

const bridgeData = computed(() => ({
  passenger: '66109',
  freight: '16270'
}))
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-type-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 1.5;
}

.c-monitor-vehicle-type-body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.c-monitor-vehicle-card {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  min-height: 0;
}

.c-monitor-vehicle-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-vehicle-label {
  font-size: calc(@fontSize * 0.86);
  color: #666666;
  line-height: 1.5;
}

.c-monitor-vehicle-value {
  font-size: calc(@fontSize * 1.29);
  font-weight: bold;
  line-height: 1.2;
}

.c-monitor-vehicle-value-primary {
  color: #1990ff;
}

.c-monitor-vehicle-value-warning {
  color: #fa8c16;
}

.c-monitor-vehicle-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}
</style>
