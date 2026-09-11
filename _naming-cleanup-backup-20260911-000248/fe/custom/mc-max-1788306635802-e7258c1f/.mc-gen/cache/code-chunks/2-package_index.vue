<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量区域 -->
      <DailyTotal class="c-monitor-daily-total" />

      <!-- 江阴靖江长江隧道流量图表 -->
      <TunnelFlowChart class="c-monitor-tunnel-flow-chart" />

      <!-- 江阴大桥流量图表 -->
      <BridgeFlowChart class="c-monitor-bridge-flow-chart" />

      <!-- 车型分布 -->
      <VehicleTypeDistribution class="c-monitor-vehicle-distribution" />

      <!-- 流量预测 -->
      <FlowPrediction class="c-monitor-flow-prediction" />
    </div>
  </base-panel>
</template>
