<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 顶部 Tab 切换 -->
      <div class="c-env-monitor-tabs">
        <div 
          v-for="tab in tabs" 
          :key="tab.key" 
          class="c-env-monitor-tab-item"
          :class="{ 'is-active': activeTab === tab.key }"
          :style="activeTab === tab.key ? { backgroundImage: `url(${bgtabActive})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : {}"
          @click="activeTab = tab.key"
        >
          <img :src="icontabsIcon" class="c-env-monitor-tab-icon" />
          <span>{{ tab.label }}</span>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="c-env-monitor-content">
        <!-- 左侧：环境参数概览 -->
        <div class="c-env-monitor-params-section">
          <div class="c-env-monitor-param-card">
            <img :src="icon1" class="c-env-monitor-param-icon" />
            <div class="c-env-monitor-param-info">
              <span class="c-env-monitor-param-label">CO浓度</span>
              <span class="c-env-monitor-param-value">12.5 <small>ppm</small></span>
            </div>
          </div>
          <div class="c-env-monitor-param-card">
            <img :src="icon2" class="c-env-monitor-param-icon" />
            <div class="c-env-monitor-param-info">
              <span class="c-env-monitor-param-label">能见度</span>
              <span class="c-env-monitor-param-value">850 <small>m</small></span>
            </div>
          </div>
        </div>
        
        <!-- 右侧：趋势与状态 -->
        <div class="c-env-monitor-right-section">
          <!-- 趋势图表 -->
          <div class="c-env-monitor-trend-card" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
            <div class="c-env-monitor-trend-header">
              <span class="c-env-monitor-trend-title">环境趋势</span>
            </div>
            <div ref="trendChartRef" class="c-env-monitor-trend-chart"></div>
          </div>
          
          <!-- 设备状态 -->
          <div class="c-env-monitor-status-card" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
            <div class="c-env-monitor-status-header">
              <span class="c-env-monitor-status-title">设备状态</span>
            </div>
            <div class="c-env-monitor-status-list">
              <div class="c-env-monitor-status-item">
                <span class="c-env-monitor-status-name">CO检测器</span>
                <span class="c-env-monitor-status-tag is-normal">正常</span>
              </div>
              <div class="c-env-monitor-status-item">
                <span class="c-env-monitor-status-name">能见度仪</span>
                <span class="c-env-monitor-status-tag is-warning">预警</span>
              </div>
              <div class="c-env-monitor-status-item">
                <span class="c-env-monitor-status-name">温湿度计</span>
                <span class="c-env-monitor-status-tag is-normal">正常</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>