<template>
  <div class="c-monitor-daily-flow">
    <!-- 标题栏 -->
    <div class="c-monitor-daily-flow-header"><img :src="icon2" class="auto-mounted-icon" alt="icon" />
      <div class="c-monitor-daily-flow-title">
        <img :src="icon1" class="c-monitor-daily-flow-icon" />
        <span class="c-monitor-daily-flow-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-daily-flow-time-selector">
        <a-select v-model:value="selectedTime" :options="timeOptions" class="c-monitor-time-select" />
      </div>
    </div>

    <!-- 流量卡片容器 -->
    <div 
      class="c-monitor-daily-flow-cards" 
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 隧道流量卡片 -->
      <div class="c-monitor-flow-card">
        <span class="c-monitor-flow-card-label">江阴靖江长江隧道</span>
        <div class="c-monitor-flow-card-value">34,620</div>
      </div>

      <!-- 大桥流量卡片 -->
      <div class="c-monitor-flow-card">
        <span class="c-monitor-flow-card-label">江阴大桥</span>
        <div class="c-monitor-flow-card-value">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'


import { ref} from 'vue'

// 资源变量由系统注入

// 时间选择器
const selectedTime = ref('24小时')
const timeOptions = [
  { label: '24小时', value: '24小时' },
  { label: '7天', value: '7天' },
  { label: '30天', value: '30天' }
]
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 注意：区块级 flex 值由 common.less 统一管理，此处不重复声明 */
/* .c-monitor-daily-flow 的 flex: 156 1 0 在 common.less 中定义 */

.c-monitor-daily-flow {
  width: 100%;
  min-height: 0;
}

.c-monitor-daily-flow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 12px;
}

.c-monitor-daily-flow-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-daily-flow-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-flow-title-text {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
}

.c-monitor-daily-flow-time-selector {
  flex-shrink: 0;
}

:deep(.c-monitor-time-select) {
  width: 100px;
  
  :deep(.ant-select-selector) {
    background: transparent;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 4px;
  }
}

.c-monitor-daily-flow-cards {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
}

.c-monitor-flow-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 0;}

.c-monitor-flow-card-label {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
}

.c-monitor-flow-card-value {
  font-size: calc(var(--fontSize, 14px) * 1.71);
  font-weight: 900;
  color: #1890FF;
  font-family: Roboto, sans-serif;
}
</style>