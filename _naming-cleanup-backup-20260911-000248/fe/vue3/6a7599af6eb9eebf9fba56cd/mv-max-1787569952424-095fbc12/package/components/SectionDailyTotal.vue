<template>
  <div class="daily-total-section">
    <!-- 头部：标题与时间选择 -->
    <div class="daily-total-header">
      <div class="header-title">
        <img :src="icon3" class="title-icon" />
        <span class="title-text">当日总流量</span>
      </div>
      <div class="header-control">
        <a-select v-model:value="timeRange" class="time-select" :bordered="false">
          <a-select-option value="24小时">24小时</a-select-option>
        </a-select>
      </div>
    </div>
    
    <!-- 数据卡片区域：背景图 + 隧道/大桥数据 -->
    <div class="daily-total-cards" :style="{ backgroundImage: `url(${bg1})` }">
      <div class="card-item left-card">
        <div class="card-value tunnel-value">34,620</div>
        <div class="card-label tunnel-label">江阴靖江长江隧道</div>
      </div>
      <div class="card-item right-card">
        <div class="card-label bridge-label">江阴大桥</div>
        <div class="card-value bridge-value">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
const icon3 = new URL('../../resources/images/icon-3561.png', import.meta.url).href
const bg1 = new URL('../../resources/images/bg-_m-34.png', import.meta.url).href
// 当日总流量统计组件：展示隧道与大桥的当日总流量数据，支持时间范围筛选
import { ref} from 'vue'

// 时间范围筛选状态（API 可绑定替换）
const timeRange = ref('24小时')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.daily-total-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.daily-total-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 30px;
}

.header-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.title-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
}

.title-text {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
  font-family: 'Source Han Sans CN', sans-serif;
}

.header-control {
  display: flex;
  align-items: center;
  
  // 覆盖 antd select 样式以匹配设计稿
  :deep(.ant-select) {
    width: 100px;
    height: 30px;
    
    :deep(.ant-select-selector) {
      height: 30px !important;
      background: #ffffff !important;
      border: none !important;
      border-radius: 4px !important;
      box-shadow: none !important;
      padding: 0 8px !important;
    }
    
    :deep(.ant-select-selection-item) {
      font-size: 14px;
      color: #333333;
      line-height: 30px !important;
      font-family: 'Source Han Sans CN', sans-serif;
    }
    
    :deep(.ant-select-arrow) {
      color: #333333;
    }
  }
}

.daily-total-cards {
  width: 100%;
  height: 91px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  box-sizing: border-box;
  // 背景图精确还原，禁止无脑 cover
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
}

.card-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.left-card {
  align-items: flex-start;
}

.right-card {
  align-items: flex-end;
}

.card-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  font-family: 'Source Han Sans CN', sans-serif;
}

.tunnel-label {
  text-align: right;
  width: 100%;
}

.bridge-label {
  text-align: left;
}

.card-value {
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
  font-family: 'Roboto', sans-serif;
  font-variant-numeric: tabular-nums;
}

.tunnel-value {
  color: #006fe3;
  text-align: left;
}

.bridge-value {
  color: #0c9dbe;
  text-align: left;
}</style>