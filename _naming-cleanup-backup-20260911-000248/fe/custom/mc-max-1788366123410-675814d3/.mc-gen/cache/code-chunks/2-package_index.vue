<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotalFlow class="c-monitor-section" />

      <!-- 江阴靖江长江隧道24小时流量 -->
      <TunnelHourlyFlow class="c-monitor-section" />

      <!-- 江阴大桥24小时流量 -->
      <BridgeHourlyFlow class="c-monitor-section" />

      <!-- 车型分布 -->
      <VehicleTypeDistribution class="c-monitor-section" />

      <!-- 流量预测 -->
      <FlowPrediction class="c-monitor-section" />
    </div>
  </base-panel>
</template>
