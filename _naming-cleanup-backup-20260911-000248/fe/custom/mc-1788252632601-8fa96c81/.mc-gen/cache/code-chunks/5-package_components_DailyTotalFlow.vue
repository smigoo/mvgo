<template>
  <div class="c-monitor-daily-total">
    <!-- 区块头部 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <i class="c-monitor-title-icon"></i>
        <span class="c-monitor-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-monitor-time-selector">
        <a-select-option value="24h">24小时</a-select-option>
        <a-select-option value="7d">7天</a-select-option>
        <a-select-option value="30d">30天</a-select-option>
      </a-select>
    </div>

    <!-- 流量卡片 -->
    <div class="c-monitor-flow-cards">
      <div 
        class="c-monitor-flow-card"
        :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-card-content">
          <div class="c-monitor-card-label">江阴靖江长江隧道</div>
          <div class="c-monitor-card-value">34,620</div>
          <img :src="icon1" class="c-monitor-card-icon" alt="icon" />
        </div>
      </div>

      <div 
        class="c-monitor-flow-card"
        :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-card-content">
          <div class="c-monitor-card-label">江阴大桥</div>
          <div class="c-monitor-card-value">82,379</div>
          <img :src="icon1" class="c-monitor-card-icon" alt="icon" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 引用资源
const bg1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const icon1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// 时间范围选择
const timeRange = ref('24h')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  background: linear-gradient(135deg, #1990ff 0%, #5a7eff 100%);
  transform: rotate(45deg);
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-time-selector {
  width: 100px;
}

:deep(.ant-select-selector) {
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  color: #333333;
  font-size: calc(@fontSize * 1);
}

:deep(.ant-select-arrow) {
  color: #a8abb2;
}

.c-monitor-flow-cards {
  display: flex;
  gap: 12px;
}

.c-monitor-flow-card {
  flex: 1;
  height: 91px;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
}

.c-monitor-card-content {
  width: 100%;
  height: 100%;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
}

.c-monitor-card-label {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  margin-bottom: 4px;
}

.c-monitor-card-value {
  font-size: calc(@fontSize * 1.71);
  font-weight: 900;
  color: #006fe3;
  line-height: 28px;
}

.c-monitor-card-icon {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 70px;
  height: 70px;
  object-fit: contain;
}
</style>
