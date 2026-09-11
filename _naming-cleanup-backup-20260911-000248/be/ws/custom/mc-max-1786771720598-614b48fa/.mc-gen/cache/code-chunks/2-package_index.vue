<template>
  <base-panel panelKey="default-panel">
    <div class="c-traffic-monitor-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
      <div class="c-traffic-monitor-filter-bar">
        <div class="c-traffic-monitor-time-tabs">
          <span 
            v-for="tab in timeTabs" 
            :key="tab.key" 
            :class="['c-traffic-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </span>
        </div>
      </div>
      
      <div class="c-traffic-monitor-content" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
        <TrafficStatCards />
        <TrafficTrendChart />
      </div>
    </div>
  </base-panel>
</template>