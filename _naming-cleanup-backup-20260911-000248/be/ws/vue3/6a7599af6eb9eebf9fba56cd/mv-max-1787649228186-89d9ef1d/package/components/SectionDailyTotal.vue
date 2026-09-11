<template>
  <div class="daily-total-section">
    <!-- 子标题区：标题 + 时间选择下拉 -->
    <div class="daily-total-header">
      <div class="header-title">
        <img :src="icon5" class="title-icon" alt="" />
        <span class="title-text">当日总流量</span>
      </div>
      <div class="header-control">
        <a-select
          v-model:value="timeRange"
          :options="timeOptions"
          class="time-select"
          :bordered="false"
          size="small"
        />
      </div>
    </div>
    
    <!-- 数据卡片区域：带背景装饰 -->
    <div class="daily-total-body">
      <!-- 背景装饰层 -->
      <div class="body-bg" :style="{ backgroundImage: `url(${bg1})` }"></div>
      
      <!-- 统计卡片 -->
      <div class="stat-cards">
        <div class="stat-card tunnel-card">
          <div class="stat-label">江阴靖江长江隧道</div>
          <div class="stat-value tunnel-value">34,620</div>
        </div>
        <div class="stat-card bridge-card">
          <div class="stat-label">江阴大桥</div>
          <div class="stat-value bridge-value">82,379</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon5 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

/**
 * SectionDailyTotal - 当日总流量统计模块
 * 展示江阴靖江长江隧道和江阴大桥的当日总流量数据
 * 包含时间范围选择交互（24小时）
 */
import { ref} from 'vue'

// 引入背景图资源（系统自动注入）

// 时间范围选择（数据槽位，可被 API 绑定）
const timeRange = ref('24小时')

// 时间选项列表
const timeOptions = ref([
  { label: '24小时', value: '24小时' }
])
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 当日总流量模块根容器
.daily-total-section {
  display: flex;
  flex-direction: column;
  width: 100%;
}

// 子标题区：横向排列标题和控件
.daily-total-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

// 标题区域
.header-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

// 标题图标
.title-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
}

// 标题文字
.title-text {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

// 时间选择控件容器
.header-control {
  display: flex;
  align-items: center;
}

// 时间选择下拉框样式覆盖
.time-select {
  width: 100px;
  
  :deep(.ant-select-selector) {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%) !important;
    border: 1px solid rgba(161, 206, 255, 1) !important;
    border-radius: 4px !important;
    height: 30px !important;
    padding: 0 12px !important;
  }
  
  :deep(.ant-select-selection-item) {
    font-size: 14px;
    color: #333333;
    line-height: 28px !important;
  }
  
  :deep(.ant-select-arrow) {
    color: #a8abb2;
  }
}

// 数据卡片区域：相对定位用于背景层
.daily-total-body {
  position: relative;
  width: 100%;
  min-height: 91px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

// 背景装饰层
.body-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  z-index: 0;
}

// 统计卡片容器
.stat-cards {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  padding: 12px 20px;
}

// 单个统计卡片
.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

// 标签文字
.stat-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

// 数值通用样式
.stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
}

// 隧道数值颜色
.tunnel-value {
  color: #006fe3;
}

// 大桥数值颜色
.bridge-value {
  color: #0c9dbe;
}</style>