<template>
  <base-panel panelKey="default-panel">
    <!-- 头部右侧：设备统计指标（设备类型 / 设备总数 / 完好率） -->
    <template #header_right>
      <HeaderStats />
    </template>

    <!-- 内容区 -->
    <div class="c-monitor-root">
      <!-- 主要设备统计卡片：隧道设备 / 南北接线设备 -->
      <SummaryCards />

      <!-- 设备列表区：左侧分类导航 + 右侧设备网格 -->
      <div class="c-monitor-device-area">
        <SidebarNav />
        <DeviceListArea />
      </div>
    </div>
  </base-panel>
</template>