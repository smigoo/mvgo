<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotalFlow />

      <!-- 江阴靖江长江隧道小时流量 -->
      <TunnelHourlyChart />

      <!-- 江阴大桥小时流量 -->
      <BridgeHourlyChart />

      <!-- 车型分布 -->
      <VehicleTypeDistribution />

      <!-- 流量预测 -->
      <FlowPrediction />
    </div>
  </base-panel>
</template>
