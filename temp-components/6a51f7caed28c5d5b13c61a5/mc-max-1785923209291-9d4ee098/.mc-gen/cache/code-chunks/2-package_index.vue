<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1785923209291-9d4ee098-container">
      <!-- 环境指标卡片区 -->
      <div class="c-mc-max-1785923209291-9d4ee098-stats-section">
        <div 
          v-for="stat in envStats" 
          :key="stat.key" 
          class="c-mc-max-1785923209291-9d4ee098-stat-card"
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="stat.icon" class="c-mc-max-1785923209291-9d4ee098-stat-icon" :alt="stat.label" />
          <div class="c-mc-max-1785923209291-9d4ee098-stat-text">
            <span class="c-mc-max-1785923209291-9d4ee098-stat-label">{{ stat.label }}</span>
            <div class="c-mc-max-1785923209291-9d4ee098-stat-value-row">
              <span class="c-mc-max-1785923209291-9d4ee098-stat-value">{{ stat.value }}</span>
              <span class="c-mc-max-1785923209291-9d4ee098-stat-unit">{{ stat.unit }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 趋势图表区 -->
      <div class="c-mc-max-1785923209291-9d4ee098-chart-section" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
        <div class="c-mc-max-1785923209291-9d4ee098-chart-header">
          <span class="c-mc-max-1785923209291-9d4ee098-chart-title">环境数据趋势</span>
          <div class="c-mc-max-1785923209291-9d4ee098-chart-tabs">
            <span 
              v-for="tab in chartTabs" 
              :key="tab.key"
              :class="['c-mc-max-1785923209291-9d4ee098-tab-item', { 'is-active': activeTab === tab.key }]"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </span>
          </div>
        </div>
        <div class="c-mc-max-1785923209291-9d4ee098-chart-wrapper">
          <div ref="chartRef" class="c-mc-max-1785923209291-9d4ee098-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>