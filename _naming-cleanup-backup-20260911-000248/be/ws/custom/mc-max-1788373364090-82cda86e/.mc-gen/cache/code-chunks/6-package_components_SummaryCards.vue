<template>
  <div class="c-monitor-summary-cards">
    <!-- 隧道设备卡片 -->
    <div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-card-row">
        <img :src="icon1" class="c-monitor-card-icon" alt="隧道设备图标" />
        <div class="c-monitor-card-content">
          <div class="c-monitor-card-label">隧道设备</div>
          <div class="c-monitor-card-line">
            <span class="c-monitor-card-line-label">总数:</span>
            <span class="c-monitor-card-value c-monitor-card-value-primary">56302</span>
          </div>
          <div class="c-monitor-card-line">
            <span class="c-monitor-card-line-label">异常数:</span>
            <span class="c-monitor-card-value c-monitor-card-value-danger">5</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 南北接线设备卡片 -->
    <div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-card-row">
        <img :src="icon2" class="c-monitor-card-icon" alt="南北接线设备图标" />
        <div class="c-monitor-card-content">
          <div class="c-monitor-card-label">南北接线设备</div>
          <div class="c-monitor-card-line">
            <span class="c-monitor-card-line-label">总数:</span>
            <span class="c-monitor-card-value c-monitor-card-value-primary">1280</span>
          </div>
          <div class="c-monitor-card-line">
            <span class="c-monitor-card-line-label">异常数:</span>
            <span class="c-monitor-card-value c-monitor-card-value-danger">3</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量由系统注入
const bg2 = ref('')
const bg3 = ref('')
const icon1 = ref('')
const icon2 = ref('')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-summary-cards {
  display: flex;
  flex-direction: row;
  gap: 12px;
  width: 100%;
  flex-shrink: 0;
}

.c-monitor-summary-card {
  flex: 1;
  min-width: 0;
  border-radius: 6px;
  padding: 8px 12px;
  box-sizing: border-box;
}

.c-monitor-card-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.c-monitor-card-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.c-monitor-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-card-label {
  font-size: calc(@fontSize * 0.86);
  color: @color-text-base;
  line-height: 1.2;
}

.c-monitor-card-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  line-height: 1.2;
}

.c-monitor-card-line-label {
  font-size: calc(@fontSize * 0.86);
  color: @color-text-base;
}

.c-monitor-card-value {
  font-size: calc(@fontSize * 1.14);
  font-weight: 700;
  line-height: 1.2;
}

.c-monitor-card-value-primary {
  color: @color-primary;
}

.c-monitor-card-value-danger {
  color: @color-danger;
}
</style>
