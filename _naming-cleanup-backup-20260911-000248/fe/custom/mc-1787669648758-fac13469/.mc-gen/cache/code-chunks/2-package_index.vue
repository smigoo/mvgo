<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- ① 当日总流量：两个地点总流量统计 + 24小时时间筛选 -->
      <TotalTrafficSection
        :bg-image="bg1"
        :diamond-icon="icon5"
        :select-arrow="icon4"
      />

      <!-- ② 江阴靖江长江隧道流量柱状图 -->
      <TrafficBarSection
        section-key="tunnel"
        location-name="江阴靖江长江隧道"
      />

      <!-- ③ 江阴大桥流量柱状图 -->
      <TrafficBarSection
        section-key="bridge"
        location-name="江阴大桥"
      />

      <!-- ④ 车型分布：隧道 / 大桥 客车、货车数量与环形图 -->
      <VehicleTypeSection
        :tunnel-bg="bg2"
        :bridge-bg="bg4"
        :diamond-icon="icon6"
      />

      <!-- ⑤ 流量预测：实际 / 预测趋势折线图 + 地点切换 + 节假日预测入口 -->
      <ForecastSection :diamond-icon="icon7" />
    </div>
  </base-panel>
</template>