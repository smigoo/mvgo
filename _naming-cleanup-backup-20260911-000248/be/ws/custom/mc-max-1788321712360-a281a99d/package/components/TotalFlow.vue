<template>
  <div class="c-monitor-total-flow">
    <!-- 头部区域 -->
    <div class="c-monitor-total-flow-header">
      <div class="c-monitor-total-flow-title">
        <img :src="icon1" class="c-monitor-total-flow-icon" alt="icon" />
        <span class="c-monitor-total-flow-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-total-flow-selector">
        <a-select v-model:value="timeValue" :bordered="false" class="c-monitor-time-select">
          <a-select-option value="24">24小时</a-select-option>
        </a-select>
      </div>
    </div>
    
    <!-- 内容统计区域 -->
    <div class="c-monitor-total-flow-body" :style="{ backgroundImage: `url(${bg1})` }">
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-value">34,620</div>
      </div>
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-value">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'


import { ref} from 'vue'

// 时间选择器默认值
const timeValue = ref('24')
</script>

<style lang="less" scoped>
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-total-flow {
flex: 1 1 0;

  display: flex;
  flex-direction: column;
  width: 100%;
  // 根容器 flex 比例交由 common.less 统一控制，避免 FLEX-003 冲突
}

.c-monitor-total-flow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
  padding: 0 4px;
}

.c-monitor-total-flow-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-total-flow-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-total-flow-title-text {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-total-flow-selector {
  width: 100px;
}

:deep(.c-monitor-time-select) {
  :deep(.ant-select-selector) {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%) !important;
    border: 1px solid rgba(161, 206, 255, 1) !important;
    border-radius: 4px !important;
    height: 30px !important;
    min-height: 30px !important;
    padding: 0 8px !important;
  }
  :deep(.ant-select-selection-item) {
    font-size: @fontSize;
    color: #333333;
    line-height: 28px !important;
  }
  :deep(.ant-select-arrow) {
    color: #a8abb2;
  }
}

.c-monitor-total-flow-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  padding: 10px 0;
}

.c-monitor-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-label {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-stat-value {
  font-size: calc(@fontSize * 1.7143);
  font-weight: 900;
  color: #1990ff;
  line-height: 28px;
  font-family: Roboto, sans-serif;
}
</style>