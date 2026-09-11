<template>
  <div class="c-env-monitor-toolbar">
    <div class="c-env-monitor-tabs" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.value }]"
        :style="activeTab === tab.value ? { backgroundImage: 'url(' + bg2 + ')' } : {}"
        @click="$emit('update:activeTab', tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>
    <div class="c-env-monitor-icons">
      <div class="c-env-monitor-icon-wrapper">
        <img :src="icon1" class="c-env-monitor-icon" />
      </div>
      <div class="c-env-monitor-icon-wrapper">
        <img :src="icon2" class="c-env-monitor-icon" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>