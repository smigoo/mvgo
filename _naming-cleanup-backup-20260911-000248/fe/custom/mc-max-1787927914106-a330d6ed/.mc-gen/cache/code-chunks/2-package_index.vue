<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root" :class="componentProps?.themeType || 'light'">
      <!-- 当日总流量 -->
      <DailyTotalFlow />

      <!-- 江阴靖江长江隧道24小时流量 -->
      <TunnelHourlyFlow />

      <!-- 江阴大桥24小时流量 -->
      <BridgeHourlyFlow />

      <!-- 车型分布 -->
      <VehicleTypeDistribution />

      <!-- 流量预测 -->
      <FlowPrediction />
    </div>
  </base-panel>
</template>
