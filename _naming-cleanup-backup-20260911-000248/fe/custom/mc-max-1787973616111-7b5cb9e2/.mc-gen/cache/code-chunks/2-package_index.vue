<template>
  <base-panel panelKey="default-panel">
    <!-- 地点切换Tab区 - 放入header_right插槽 -->
    <template #header_right>
      <div class="c-monitor-location-tabs">
        <div
          v-for="location in locations"
          :key="location.value"
          :class="['c-monitor-location-tab', { active: activeLocation === location.value }]"
          @click="activeLocation = location.value"
        >
          {{ location.label }}
        </div>
      </div>
    </template>

    <!-- 主内容区 -->
    <div class="c-monitor-root">
      <!-- 当日总流量区域 -->
      <DailyTotalSection
        :active-location="activeLocation"
        :tunnel-data="tunnelTotalData"
        :bridge-data="bridgeTotalData"
      />

      <!-- 江阴靖江长江隧道小时流量图表 -->
      <TunnelChartSection
        :chart-data="tunnelChartData"
        :active-location="activeLocation"
      />

      <!-- 江阴大桥小时流量图表 -->
      <BridgeChartSection
        :chart-data="bridgeChartData"
        :active-location="activeLocation"
      />

      <!-- 车型分布区域 -->
      <VehicleDistributionSection
        :tunnel-vehicle-data="tunnelVehicleData"
        :bridge-vehicle-data="bridgeVehicleData"
        :active-location="activeLocation"
      />

      <!-- 流量预测区域 -->
      <FlowPredictionSection
        :prediction-data="predictionData"
        :active-location="activeLocation"
      />
    </div>
  </base-panel>
</template>
