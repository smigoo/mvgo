<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 顶部设备统计概览 -->
      <DeviceStats />
      
      <!-- 下方主体内容区 -->
      <div class="c-monitor-main">
        <!-- 左侧：设备状态分布 -->
        <div class="c-monitor-status-panel">
          <div class="c-monitor-panel-header">
            <span class="c-monitor-panel-title">设备状态分布</span>
          </div>
          <div class="c-monitor-chart-wrapper">
            <DeviceStatusChart />
          </div>
        </div>
        
        <!-- 右侧：设备明细列表 -->
        <div class="c-monitor-detail-panel">
          <div class="c-monitor-panel-header">
            <span class="c-monitor-panel-title">设备运行明细</span>
          </div>
          <div class="c-monitor-list-wrapper">
            <DeviceList />
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>