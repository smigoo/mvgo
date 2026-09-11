<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotalFlow 
        :tunnel-traffic="tunnelTraffic"
        :bridge-traffic="bridgeTraffic"
      />

      <!-- 江阴靖江长江隧道24小时流量 -->
      <TunnelHourlyChart 
        :chart-data="tunnelHourlyData"
      />

      <!-- 江阴大桥24小时流量 -->
      <BridgeHourlyChart 
        :chart-data="bridgeHourlyData"
      />

      <!-- 车型分布 -->
      <VehicleTypeDistribution 
        :tunnel-vehicle-data="tunnelVehicleData"
        :bridge-vehicle-data="bridgeVehicleData"
      />

      <!-- 流量预测 -->
      <FlowPrediction 
        :prediction-data="predictionData"
        :active-location="activeLocation"
        @location-change="handleLocationChange"
      />
    </div>
  </base-panel>
</template>
