<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 顶部统计栏 -->
      <header-stats class="c-monitor-header-stats" />

      <!-- 主内容区 -->
      <div class="c-monitor-main-content">
        <!-- 左侧分类导航 -->
        <left-category-nav class="c-monitor-left-nav" />

        <!-- 右侧内容区 -->
        <div class="c-monitor-right-content">
          <!-- 设备类型切换 Tab -->
          <device-tabs class="c-monitor-device-tabs" />

          <!-- 设备监测网格 -->
          <equipment-grid class="c-monitor-equipment-grid" />
        </div>
      </div>
    </div>
  </base-panel>
</template>
