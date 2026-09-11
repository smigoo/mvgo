<template>
  <!-- 图表控制栏：右侧视图切换图标（统计/列表）+ 通知徽章，纯展示组件 -->
  <div class="chart-controls-bar">
    <!-- 左侧占位，让图标靠右 -->
    <div class="controls-spacer"></div>

    <!-- 右侧控制区：视图切换图标 + 通知徽章 -->
    <div class="controls-right">
      <!-- 视图切换图标组（统计图标 + 列表图标） -->
      <div class="view-toggle-group">
        <!-- 统计图表图标：激活态高亮 -->
        <div
          class="view-icon-btn"
          :class="{ 'view-icon-btn--active': activeViewMode === 'chart' }"
        >
          <!-- 图标下载失败，使用 CSS 伪元素绘制柱状图形状 -->
          <span class="icon-chart"></span>
        </div>

        <!-- 列表图标：非激活态 -->
        <div
          class="view-icon-btn"
          :class="{ 'view-icon-btn--active': activeViewMode === 'list' }"
        >
          <!-- 图标下载失败，使用 CSS 伪元素绘制列表线条 -->
          <span class="icon-list" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"></span>
        </div>
      </div>

      <!-- 通知徽章：红色圆形 + 数字 -->
      <div class="notification-badge">
        {{ notificationCount }}
      </div>
    </div>
  </div>
</template>

<script setup>
// 图表控制栏子组件：展示右上角视图切换图标与通知徽章
// 交互（视图切换）由父组件 HeaderTabs 统一处理，此组件仅做展示
// Props 来自主组件 index.vue 透传

// #region 1. Props定义
const props = defineProps({
  // 当前激活的tab索引（用于关联图表状态展示）
  activeTab: { type: Number, default: 0 },
  // 当前视图模式：'chart' | 'list'（控制图标激活状态）
  activeViewMode: { type: String, default: 'chart' },
  // 通知徽章数字（默认8，来自 Figma num/6 节点）
  notificationCount: { type: Number, default: 8 }
})
// #endregion
</script>

<style lang="less" scoped>
@color-primary: #409EFF;

@import '../../resources/styles/index.less';

// 图表控制栏：横向布局，让右侧控件靠右对齐
.chart-controls-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 4px 8px;
  flex-shrink: 0;
}

// 左侧占位撑开，使右侧控件靠右
.controls-spacer {
  flex: 1;
}

// 右侧控制区：图标组 + 徽章横向排列，间距对齐 Figma tabs-icon 布局
.controls-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

// 视图切换图标组（两个图标并排，Figma tabs-icon 容器 52×24）
.view-toggle-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

// 单个图标按钮容器（Figma icon group 24×24，不加 border/border-radius/background——图标自带样式）
.view-icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.5; // 非激活态半透明;

  // 激活态：不透明高亮
  &--active {
    opacity: 1;
  }
}

// CSS绘制柱状图图标（Figma 柱状图_filled，16×15.5，图标下载失败用伪元素替代）
.icon-chart {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  width: 16px;
  height: 14px;

  // 用三条竖线模拟柱状图形状
  &::before,
  &::after {
    content: '';
    display: block;
    width: 4px;
    background: @color-primary;
    border-radius: 1px;
  }

  &::before {
    height: 14px;
  }

  &::after {
    height: 8px;
  }
}

// 给 .icon-chart 中间一根柱子（伪元素只能两根，用 box-shadow 补第三根）
.icon-chart::before {
  box-shadow: 6px 6px 0 0 @color-primary;
}

// CSS绘制列表图标（Figma 属性_列表_详情2，14.625×14.625，图标下载失败用伪元素替代）
.icon-list {
  display: inline-block;
  width: 14px;
  height: 12px;
  // 三条横线模拟列表图标
  background: linear-gradient(
    to bottom,
    @color-primary 0px,
    @color-primary 2px,
    transparent 2px,
    transparent 6px,
    @color-primary 6px,
    @color-primary 8px,
    transparent 8px,
    transparent 12px
  );
  // 第三条线用 box-shadow 补充，不占布局空间
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 2px;
    background: @color-primary;
    border-radius: 1px;
  }
}

// 通知徽章：红色圆形 14×14，白色数字12px（Figma num 节点：bg #f53f3f，cornerRadius 29px）
.notification-badge {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  // CSS替代方案（Figma num/bg 节点 SOLID #f53f3f，资源下载失败）
  background: #f53f3f;
  color: #ffffff;
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>