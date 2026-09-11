<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 顶部时间筛选 -->
      <div class="c-monitor-header">
        <div class="c-monitor-tabs">
          <span 
            v-for="tab in timeTabs" 
            :key="tab.value" 
            :class="['c-monitor-tab-item', { 'is-active': activeTimeTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </span>
        </div>
      </div>

      <!-- 核心指标统计区 -->
      <div class="c-monitor-stats-section" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
        <MonitorStats :stats="statsData" :icons="[icon1, icon2, icon3]" />
      </div>

      <!-- 下方图表区 -->
      <div class="c-monitor-body">
        <div class="c-monitor-trend-panel">
          <div class="c-monitor-panel-header">
            <span class="c-monitor-panel-title">流量趋势分析</span>
          </div>
          <div class="c-monitor-chart-box">
            <MonitorTrend ref="trendRef" :time-tab="activeTimeTab" />
          </div>
        </div>
        
        <div class="c-monitor-distribution-panel">
          <div class="c-monitor-panel-header">
            <span class="c-monitor-panel-title">车型构成比例</span>
          </div>
          <div class="c-monitor-chart-box">
            <MonitorDistribution ref="distributionRef" :time-tab="activeTimeTab" />
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>