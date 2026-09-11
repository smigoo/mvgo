<template>
  <base-panel panelKey="default-panel">
    <div :class="['c-monitor-root', theme]">
      <!-- 区块一：当日总流量（统计卡片 + 两条流量图） -->
      <TotalTraffic class="c-monitor-section" />
      <!-- 区块二：车型分布（隧道/大桥车型对比） -->
      <VehicleType class="c-monitor-section" />
      <!-- 区块三：流量预测（预测趋势图） -->
      <FlowForecast class="c-monitor-section" />
    </div>
  </base-panel>
</template>