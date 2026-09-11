<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 统计横幅 + 左侧导航区域 -->
      <div class="c-monitor-main-layout">
        <!-- 左侧导航 -->
        <LeftNav
          :active-tab="activeNavTab"
          @tab-change="handleNavTabChange"
        />
        <!-- 右侧内容区 -->
        <div class="c-monitor-content-area">
          <!-- 统计横幅 -->
          <StatsBanner
            :tunnel-stats="tunnelStats"
            :bridge-stats="bridgeStats"
          />
          <!-- 设备网格 -->
          <DeviceGrid
            :active-tab="activeNavTab"
            :devices="currentDevices"
          />
        </div>
      </div>
    </div>
  </base-panel>
</template>