<template>
  <div class="c-env-monitor-controls">
    <div class="c-env-monitor-tabs">
      <div 
        v-for="tab in tabs" 
        :key="tab" 
        class="c-env-monitor-tab-item"
        :class="{ 'is-active': activeTab === tab }"
        @click="activeTab = tab"
      >
        <div v-if="activeTab === tab" class="c-env-monitor-tab-active-bg" :style="{ backgroundImage: 'url(' + bg2 + ')' }"></div>
        <span class="c-env-monitor-tab-text">{{ tab }}</span>
      </div>
    </div>
    <div class="c-env-monitor-view-icons">
      <img :src="icon1" class="c-env-monitor-icon" />
      <div class="c-env-monitor-icon-wrapper">
        <img :src="icon2" class="c-env-monitor-icon" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>