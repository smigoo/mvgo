<template>
  <!-- 当日总流量区块根容器 -->
  <div class="section-daily-total-root">
    <!-- 头部区域：标题 + 时间选择下拉 -->
    <div class="section-header">
      <div class="header-title-wrap">
        <!-- 标题装饰图标 -->
        <img :src="icon3" class="header-icon" alt="icon" />
        <!-- 区块标题 -->
        <span class="header-title">当日总流量</span>
      </div>
      <div class="header-control">
        <!-- 时间范围选择器 -->
        <a-select
          v-model:value="timeRange"
          :options="timeOptions"
          class="time-select"
          :bordered="false"
        />
      </div>
    </div>

    <!-- 统计卡片区域：带背景图 -->
    <div class="section-body">
      <div class="stat-bg-wrap" :style="{ backgroundImage: `url(${bgm_2})` }">
        <div class="stat-cards">
          <!-- 江阴大桥统计卡片 -->
          <div class="stat-card">
            <span class="stat-label">江阴大桥</span>
            <span class="stat-value stat-value--bridge">82,379</span>
          </div>
          <!-- 江阴靖江长江隧道统计卡片 -->
          <div class="stat-card">
            <span class="stat-label">江阴靖江长江隧道</span>
            <span class="stat-value stat-value--tunnel">34,620</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const icon3 = new URL('../../resources/images/icon-3561.png', import.meta.url).href
const bgm_2 = new URL('../../resources/images/bg-_m-34.png', import.meta.url).href
/**
 * 当日总流量区块
 * 展示江阴大桥和江阴靖江长江隧道的当日总流量数据
 * 包含时间范围下拉选择（默认24小时）
 */
import { ref} from 'vue'

// #region 1. Props定义
// 无外部 props，数据由组件内部管理或通过 API 绑定
// #endregion

// #region 2. Emits定义
// 无外部 emits
// #endregion

// #region 3. 响应式状态
// 时间范围选择（默认24小时）
const timeRange = ref('24小时')
// 时间范围选项列表
const timeOptions = ref([
  { label: '24小时', value: '24小时' }
])
// #endregion

// #region 4. 计算属性
// 无需派生计算
// #endregion

// #region 5. 方法
// 无需额外方法
// #endregion

// #region 6. 生命周期
// 无需额外生命周期处理
// #endregion
</script>

<style lang="less" scoped>
/* 引入共享样式（主题变量 + 业务 class） */
@import '../../resources/styles/index.less';

/* [Layout Refine] Figma sub-header x=35.8, root x=10 → padding: 0 25px */
/* 区块根容器 */
.section-daily-total-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 25px;
}

/* 头部区域：标题与控件 */
.section-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  height: 30px;
  flex-shrink: 0;

  .header-title-wrap {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;

    /* 标题前装饰图标 */
    .header-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
      flex-shrink: 0;
    }

    /* 区块标题文本 */
    .header-title {
      font-size: 16px;
      font-weight: 500;
      color: #333333;
      /* 白色文字阴影，增强浅色背景下的可读性 */
      text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
      line-height: 24px;
    }
  }

  .header-control {
    /* 时间选择下拉框容器 */
    .time-select {
      width: 100px;
    }
  }
}

/* antd select 样式覆盖（必须使用 :deep） */
:deep(.ant-select) {
  &.time-select {
    .ant-select-selector {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      height: 30px !important;
      padding: 0 20px 0 0 !important;
    }
    .ant-select-selection-item {
      font-size: 14px;
      color: #333333;
      line-height: 30px !important;
      font-weight: 400;
    }
    .ant-select-arrow {
      color: #333333;
      font-size: 12px;
      right: 0;
    }
  }
}

/* 内容区域：统计卡片 */
.section-body {
  width: 100%;
  flex-shrink: 0;

  /* [Layout Refine] Figma Group 2136636802 h=91.4 → height: 91.4px */
  /* 背景图容器 */
  .stat-bg-wrap {
    width: 100%;
    height: 91.4px;
    /* 背景图精确还原：尺寸与容器一致，禁止无脑 cover */
    background-size: 100% 100%position: relative;
    display: flex;
    align-items: center;
    justify-content: center;

    /* 卡片横向排列容器 */
    .stat-cards {
      display: flex;
      flex-direction: row;
      justify-content: space-around;
      align-items: center;
      width: 100%;
      height: 100%;

      /* 单个统计卡片 */
      .stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;

        /* 地点名称标签 */
        .stat-label {
          font-size: 16px;
          font-weight: 500;
          color: #333333;
          line-height: 24px;
          white-space: nowrap;
        }

        /* 流量数值 */
        .stat-value {
          font-size: 24px;
          font-weight: 900;
          font-family: 'Roboto', sans-serif;
          line-height: 28px;
          white-space: nowrap;

          /* 江阴大桥数值颜色 */
          &--bridge {
            color: #0c9dbe;
          }

          /* 江阴靖江长江隧道数值颜色 */
          &--tunnel {
            color: #006fe3;
          }
        }
      }
    }
  }
}</style>