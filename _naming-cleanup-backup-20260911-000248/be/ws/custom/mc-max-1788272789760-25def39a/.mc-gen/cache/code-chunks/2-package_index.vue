<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 顶部统计栏 -->
      <HeaderStats class="c-monitor-header-stats" />

      <!-- 主体内容区：左侧分类 + 右侧设备网格 -->
      <div class="c-monitor-main-content">
        <!-- 左侧设备分类标签栏 -->
        <CategoryTabs class="c-monitor-category-tabs" />

        <!-- 右侧设备网格 -->
        <DeviceGrid class="c-monitor-device-grid" />
      </div>
    </div>
  </base-panel>
</template>
