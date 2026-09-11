<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-1785977550903-5ec08759-container"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-mc-1785977550903-5ec08759-stats-wrapper">
        <div class="c-mc-1785977550903-5ec08759-stat-item">
          <img :src="icon1" class="c-mc-1785977550903-5ec08759-stat-icon" />
          <div class="c-mc-1785977550903-5ec08759-stat-text">
            <span class="c-mc-1785977550903-5ec08759-stat-label">设备总数</span>
            <span class="c-mc-1785977550903-5ec08759-stat-value">{{ deviceStats.total }}</span>
          </div>
        </div>
        
        <div class="c-mc-1785977550903-5ec08759-stat-item">
          <img :src="icon2" class="c-mc-1785977550903-5ec08759-stat-icon" />
          <div class="c-mc-1785977550903-5ec08759-stat-text">
            <span class="c-mc-1785977550903-5ec08759-stat-label">在线设备</span>
            <span class="c-mc-1785977550903-5ec08759-stat-value c-mc-1785977550903-5ec08759-stat-value--success">{{ deviceStats.online }}</span>
          </div>
        </div>
        
        <div class="c-mc-1785977550903-5ec08759-stat-item">
          <img :src="icon3" class="c-mc-1785977550903-5ec08759-stat-icon" />
          <div class="c-mc-1785977550903-5ec08759-stat-text">
            <span class="c-mc-1785977550903-5ec08759-stat-label">离线设备</span>
            <span class="c-mc-1785977550903-5ec08759-stat-value c-mc-1785977550903-5ec08759-stat-value--warning">{{ deviceStats.offline }}</span>
          </div>
        </div>
        
        <div class="c-mc-1785977550903-5ec08759-stat-item">
          <img :src="icon4" class="c-mc-1785977550903-5ec08759-stat-icon" />
          <div class="c-mc-1785977550903-5ec08759-stat-text">
            <span class="c-mc-1785977550903-5ec08759-stat-label">故障设备</span>
            <span class="c-mc-1785977550903-5ec08759-stat-value c-mc-1785977550903-5ec08759-stat-value--danger">{{ deviceStats.fault }}</span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>