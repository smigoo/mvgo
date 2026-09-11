<template>
  <base-panel panelKey="default-panel">
    <div class="c-c-monitor-root">
      <!-- 1. 当日总流量 -->
      <DailyTotal class="c-c-monitor-section-daily" />
      
      <!-- 2. 江阴靖江长江隧道小时流量 -->
      <TunnelFlowChart class="c-c-monitor-section-tunnel" />
      
      <!-- 3. 江阴大桥小时流量 -->
      <BridgeFlowChart class="c-c-monitor-section-bridge" />
      
      <!-- 4. 车型分布 -->
      <VehicleDistribution class="c-c-monitor-section-vehicle" />
      
      <!-- 5. 流量预测 -->
      <FlowPrediction class="c-c-monitor-section-prediction" />
    </div>
  </base-panel>
</template>