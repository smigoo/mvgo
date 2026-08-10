<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1786083023664-e8a5abac-container">
      <!-- 顶部操作区 -->
      <div class="c-mc-max-1786083023664-e8a5abac-header">
        <div class="c-mc-max-1786083023664-e8a5abac-header-right">
          <!-- 监测点选择下拉框 -->
          <div class="c-mc-max-1786083023664-e8a5abac-select-wrapper">
            <span class="c-mc-max-1786083023664-e8a5abac-select-label">监测点：</span>
            <div class="c-mc-max-1786083023664-e8a5abac-select-trigger" @click="showMonitorDropdown = !showMonitorDropdown">
              <span class="c-mc-max-1786083023664-e8a5abac-select-value">{{ currentMonitor.label }}</span>
              <span class="c-mc-max-1786083023664-e8a5abac-select-arrow" :class="{ 'c-mc-max-1786083023664-e8a5abac-select-arrow--up': showMonitorDropdown }"></span>
            </div>
            <div v-show="showMonitorDropdown" class="c-mc-max-1786083023664-e8a5abac-select-dropdown">
              <div 
                v-for="item in monitorOptions" 
                :key="item.value"
                class="c-mc-max-1786083023664-e8a5abac-select-option"
                :class="{ 'c-mc-max-1786083023664-e8a5abac-select-option--active': currentMonitor.value === item.value }"
                @click="selectMonitor(item)"
              >
                {{ item.label }}
              </div>
            </div>
          </div>

          <!-- 时间维度 Tab 切换 -->
          <div class="c-mc-max-1786083023664-e8a5abac-tabs">
            <span 
              v-for="tab in timeTabs" 
              :key="tab.key" 
              :class="['c-mc-max-1786083023664-e8a5abac-tab-item', { 'c-mc-max-1786083023664-e8a5abac-tab-item--active': activeTimeTab === tab.key }]"
              @click="handleTabChange(tab.key)"
            >
              {{ tab.label }}
            </span>
          </div>
        </div>
      </div>

      <!-- 主体内容区 -->
      <div class="c-mc-max-1786083023664-e8a5abac-body">
        <!-- 左侧：核心数据汇总 -->
        <div class="c-mc-max-1786083023664-e8a5abac-left">
          <StatSummary :stats="summaryStats" />
        </div>

        <!-- 右侧：图表分析区 -->
        <div class="c-mc-max-1786083023664-e8a5abac-right">
          <!-- 流量趋势卡片 -->
          <div 
            class="c-mc-max-1786083023664-e8a5abac-chart-card"
            :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
          >
            <div class="c-mc-max-1786083023664-e8a5abac-card-header">
              <img :src="icon1" class="c-mc-max-1786083023664-e8a5abac-card-icon" />
              <span class="c-mc-max-1786083023664-e8a5abac-card-title">流量趋势分析</span>
            </div>
            <div class="c-mc-max-1786083023664-e8a5abac-chart-wrapper">
              <FlowTrend ref="flowTrendRef" :time-tab="activeTimeTab" :monitor-id="currentMonitor.value" />
            </div>
          </div>

          <!-- 车型分布卡片 -->
          <div class="c-mc-max-1786083023664-e8a5abac-chart-card">
            <div class="c-mc-max-1786083023664-e8a5abac-card-header">
              <span class="c-mc-max-1786083023664-e8a5abac-card-title">车型分布统计</span>
            </div>
            <div class="c-mc-max-1786083023664-e8a5abac-chart-wrapper">
              <VehicleDistribution ref="vehicleDistRef" :monitor-id="currentMonitor.value" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>