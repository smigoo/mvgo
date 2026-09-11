<template>
  <base-panel panelKey="default-panel">
    <!-- 头部统计指标插槽 -->
    <template #header_right>
      <HeaderStats />
    </template>

    <!-- 主体内容区域 -->
    <div class="c-monitor-root">
      <!-- 左侧导航栏 -->
      <LeftNav />

      <!-- 右侧内容区 -->
      <div class="c-monitor-content">
        <!-- 突出显示设备 -->
        <FeaturedDevices />

        <!-- 设备网格 -->
        <DeviceGrid />
      </div>
    </div>
  </base-panel>
</template>
