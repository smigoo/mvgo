<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <TotalFlow />
      <!-- 江阴靖江长江隧道流量 -->
      <ChartTunnel />
      <!-- 江阴大桥流量 -->
      <ChartBridge />
      <!-- 车型分布 -->
      <VehicleType />
      <!-- 流量预测 -->
      <Prediction />
    </div>
  </base-panel>
</template>