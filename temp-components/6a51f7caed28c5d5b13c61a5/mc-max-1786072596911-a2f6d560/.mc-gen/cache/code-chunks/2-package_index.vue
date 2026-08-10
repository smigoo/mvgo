<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-max-1786072596911-a2f6d560-env-monitor"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-mc-max-1786072596911-a2f6d560-indicator-list">
        <div 
          v-for="(item, index) in envIndicators" 
          :key="index" 
          class="c-mc-max-1786072596911-a2f6d560-indicator-item"
        >
          <img :src="item.icon" class="c-mc-max-1786072596911-a2f6d560-indicator-icon" :alt="item.label" />
          <div class="c-mc-max-1786072596911-a2f6d560-indicator-content">
            <span class="c-mc-max-1786072596911-a2f6d560-indicator-label">{{ item.label }}</span>
            <span class="c-mc-max-1786072596911-a2f6d560-indicator-value">
              {{ item.value }}<small class="c-mc-max-1786072596911-a2f6d560-indicator-unit">{{ item.unit }}</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>