<template>
  <base-panel panelKey="default-panel" :class="['c-monitor-root', componentProps.themeType]">
    <!-- 1. 头部统计栏 -->
    <HeaderStats />

    <!-- 2. 汇总统计卡片 -->
    <SummaryCards />

    <!-- 3. 设备分类网格 -->
    <DeviceGrid />

    <!-- 4. 左侧导航栏 -->
    <SidebarNav />
  </base-panel>
</template>
