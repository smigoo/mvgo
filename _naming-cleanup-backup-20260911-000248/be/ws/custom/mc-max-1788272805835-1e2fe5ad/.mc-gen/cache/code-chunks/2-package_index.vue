<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 1. 当日总流量：标题栏(24小时下拉) + 双隧道统计卡 -->
      <DailyTotalFlow
        class="c-monitor-section c-monitor-section-daily"
        :title-icon="icon1"
        :stat-bg="bg1"
      />

      <!-- 2. 江阴靖江长江隧道小时流量：柱状图 -->
      <TunnelHourlyFlow class="c-monitor-section c-monitor-section-tunnel" />

      <!-- 3. 江阴大桥小时流量：柱状图 -->
      <BridgeHourlyFlow class="c-monitor-section c-monitor-section-bridge" />

      <!-- 4. 车型分布：两张卡片（饼图 + 客车/货车数值） -->
      <VehicleDistribution
        class="c-monitor-section c-monitor-section-vehicle"
        :title-icon="icon2"
        :tunnel-card-bg="bg2"
        :bridge-card-bg="bg4"
      />

      <!-- 5. 流量预测：Tab 切换 + 面积图 + 节假日预测入口 -->
      <FlowPrediction class="c-monitor-section c-monitor-section-prediction" />
    </div>
  </base-panel>
</template>