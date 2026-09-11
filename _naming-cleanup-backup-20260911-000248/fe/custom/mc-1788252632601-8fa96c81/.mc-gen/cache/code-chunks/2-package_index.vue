<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotalFlow class="c-monitor-section c-monitor-section-total" />
      <!-- 江阴靖江长江隧道24小时流量 -->
      <TunnelHourlyChart class="c-monitor-section c-monitor-section-tunnel" />
      <!-- 江阴大桥24小时流量 -->
      <BridgeHourlyChart class="c-monitor-section c-monitor-section-bridge" />
      <!-- 车型分布 -->
      <VehicleTypeDistribution class="c-monitor-section c-monitor-section-vehicle" />
      <!-- 流量预测 -->
      <FlowPrediction class="c-monitor-section c-monitor-section-prediction" />
    </div>
  </base-panel>
</template>