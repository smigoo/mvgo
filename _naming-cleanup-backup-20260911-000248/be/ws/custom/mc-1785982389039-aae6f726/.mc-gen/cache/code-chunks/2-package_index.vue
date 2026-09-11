<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-1785982389039-aae6f726-content"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-mc-1785982389039-aae6f726-stat-list">
        <div v-for="(item, index) in statList" :key="index" class="c-mc-1785982389039-aae6f726-stat-item">
          <img :src="item.icon" class="c-mc-1785982389039-aae6f726-stat-icon" />
          <div class="c-mc-1785982389039-aae6f726-text-group">
            <span class="c-mc-1785982389039-aae6f726-stat-label">{{ item.label }}</span>
            <span class="c-mc-1785982389039-aae6f726-stat-value">{{ item.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>