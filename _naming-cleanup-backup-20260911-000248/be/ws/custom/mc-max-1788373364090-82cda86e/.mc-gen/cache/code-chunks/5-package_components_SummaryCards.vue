<template>
  <div class="c-monitor-summary-cards">
    <!-- 隧道设备卡片 -->
    <div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-summary-card-row">
        <img :src="icon1" class="c-monitor-summary-card-icon" alt="隧道设备" />
        <div class="c-monitor-summary-card-content">
          <div class="c-monitor-summary-card-label">隧道设备</div>
          <div class="c-monitor-summary-card-item">
            <span class="c-monitor-summary-card-item-label">总数:</span>
            <span class="c-monitor-summary-card-item-value c-monitor-summary-card-item-value--primary">56302</span>
          </div>
          <div class="c-monitor-summary-card-item">
            <span class="c-monitor-summary-card-item-label">异常数:</span>
            <span class="c-monitor-summary-card-item-value c-monitor-summary-card-item-value--danger">5</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 南北桥线设备卡片 -->
    <div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-summary-card-row">
        <img :src="icon2" class="c-monitor-summary-card-icon" alt="南北桥线设备" />
        <div class="c-monitor-summary-card-content">
          <div class="c-monitor-summary-card-label">南北桥线设备</div>
          <div class="c-monitor-summary-card-item">
            <span class="c-monitor-summary-card-item-label">总数:</span>
            <span class="c-monitor-summary-card-item-value c-monitor-summary-card-item-value--primary">1280</span>
          </div>
          <div class="c-monitor-summary-card-item">
            <span class="c-monitor-summary-card-item-label">异常数:</span>
            <span class="c-monitor-summary-card-item-value c-monitor-summary-card-item-value--danger">3</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量由系统自动注入（bg2, bg3, icon1, icon2）
const bg2 = ref(null)
const bg3 = ref(null)
const icon1 = ref(null)
const icon2 = ref(null)
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-summary-cards {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.c-monitor-summary-card {
  flex: 1;
  min-width: 0;
  border-radius: 6px;
  padding: 8px 12px;
  box-sizing: border-box;
}

.c-monitor-summary-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-summary-card-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.c-monitor-summary-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-summary-card-label {
  font-size: calc(@fontSize * 0.857);
  color: @color-text-base;
  line-height: 1.2;
}

.c-monitor-summary-card-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
  line-height: 1.2;
}

.c-monitor-summary-card-item-label {
  font-size: calc(@fontSize * 0.857);
  color: @color-text-base;
}

.c-monitor-summary-card-item-value {
  font-size: calc(@fontSize * 1.143);
  font-weight: 700;
  line-height: 1.2;
}

.c-monitor-summary-card-item-value--primary {
  color: @color-primary;
}

.c-monitor-summary-card-item-value--danger {
  color: @color-danger;
}
</style>
