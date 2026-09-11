<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotal />
      <!-- 江阴靖江长江隧道小时流量 -->
      <HourlyFlowTunnel />
      <!-- 江阴大桥小时流量 -->
      <HourlyFlowBridge />
      <!-- 车型分布 -->
      <VehicleType />
      <!-- 流量预测 -->
      <FlowForecast />
    </div>
  </base-panel>
</template>