<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>

    <div class="c-monitor-root">
      <!-- 左侧导航菜单 -->
      <LeftNav class="c-monitor-left-nav-wrapper" />

      <!-- 主体内容区 -->
      <div class="c-monitor-main-content">
        <!-- 设备类型网格 -->
        <DeviceGrid />
      </div>
    </div>
  </base-panel>
</template>