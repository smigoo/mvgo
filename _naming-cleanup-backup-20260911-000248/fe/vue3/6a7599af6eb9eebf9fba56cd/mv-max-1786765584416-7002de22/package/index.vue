<template>
  <!-- 流量监测面板根容器 -->
  <div class="flow-monitor-root">
    <!-- 面板头部：标题 + 装饰元素 + 更新时间 -->
    <div class="flow-panel-header">
      <div class="header-left">
        <!-- 装饰圆点 -->
        <span class="header-dot"></span>
        <!-- 渐变装饰线 -->
        <span class="header-line"></span>
        <!-- 面板主标题 -->
        <h1 class="header-title">流量监测</h1>
      </div>
      <!-- 数据更新提示 -->
      <span class="header-subtitle">*数据实时更新</span>
    </div>

    <!-- 内容区域：四个业务区块 -->
    <div class="flow-panel-content">
      <!-- 区块1：当日总流量 -->
      <SectionDailyTotal />
      <!-- 区块2：分地点小时流量 -->
      <SectionHourlyFlow />
      <!-- 区块3：车型分布 -->
      <SectionVehicleType />
      <!-- 区块4：流量预测 -->
      <SectionFlowPrediction />
    </div>
  </div>
</template>

<script setup>
/**
 * 流量监测面板 - 主组件
 * 功能：展示高速公路/桥梁的实时流量监测数据
 * 包含四个区块：当日总流量、分地点小时流量、车型分布、流量预测
 * 整体为浅色科技监测风格，背景色 #edf4fb
 */
import { ref, onMounted, onUnmounted } from 'vue'

// 引入四个业务子组件（各区块独立管理自身数据与交互）
import SectionDailyTotal from './components/SectionDailyTotal.vue'
import SectionHourlyFlow from './components/SectionHourlyFlow.vue'
import SectionVehicleType from './components/SectionVehicleType.vue'
import SectionFlowPrediction from './components/SectionFlowPrediction.vue'

// #region 1. Props定义
// 主组件无外部 props，所有数据由子组件自行管理或通过 API 绑定
// #endregion

// #region 2. Emits定义
// 主组件无需向外部 emit 事件
// #endregion

// #region 3. 响应式状态
// 面板是否已挂载完成
const isMounted = ref(false) // #endregion

// #region 4. 计算属性
// 无需派生计算
// #endregion

// #region 5. 方法
// 无需主组件级别的方法，交互逻辑由各子组件自行处理
// #endregion

// #region 6. 生命周期
onMounted(() => {
  // 标记面板挂载完成
  isMounted.value = true
  console.log('[TrafficMonitor] 流量监测面板已挂载')
})

onUnmounted(() => {
  // 清理资源
  isMounted.value = false
  console.log('[TrafficMonitor] 流量监测面板已卸载')
})
// #endregion
</script>

<style lang="less" scoped>
/* 引入共享样式（主题变量 + 业务 class） */
@import '../resources/styles/index.less';

/* 根容器样式覆盖 — 确保背景色直接落地，不依赖 CSS 变量 */
.flow-monitor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 根背景：直接写 Figma 对应值 #edf4fb，禁止使用 var(--color-bg) */
  background: #edf4fb;
  /* 面板阴影：取自 Figma DROP_SHADOW offset(0,4) radius=10 rgba(74,117,141,0.25) */
  box-shadow: 0 4px 10px 0 rgba(74, 117, 141, 0.25);
  overflow: hidden;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  box-sizing: border-box;
}

/* [Layout Refine] Figma header y=119.1, root y=109 → padding-top: 10px */
/* 面板头部 */
.flow-panel-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 0;
  min-height: 33px;
  flex-shrink: 0;

  .header-left {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }

  /* 装饰圆点：8x8 渐变圆 */
  .header-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
    flex-shrink: 0;
    position: relative;

    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: #559eff;
    }
  }

  /* [Style Refine] Figma Vector 1476 width=362 → width: 362px */
  /* 渐变装饰线：从蓝色渐变到透明 */
  .header-line {
    width: 362px;
    height: 6px;
    background: linear-gradient(90deg, #559eff 0%, rgba(85, 158, 255, 0.05) 100%);
    border-radius: 3px;
    flex-shrink: 0;
  }

  /* 面板主标题：渐变文字 */
  .header-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0;
    padding: 0;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 19px;
    white-space: nowrap;
  }

  /* 副标题/更新时间提示 */
  .header-subtitle {
    font-size: 14px;
    font-weight: 400;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 21px;
    white-space: nowrap;
  }
}

/* [Layout Refine] Figma slot x=10, root x=10 → padding: 0 */
/* 内容区域：纵向堆叠四个区块 */
.flow-panel-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 6px;
  overflow-y: auto;
  overflow-x: hidden;

  /* 隐藏滚动条但保持可滚动 */
  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
}</style>