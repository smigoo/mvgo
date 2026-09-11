<template>
  <div class="c-traffic-stat-cards">
    <!-- 当日总流量 -->
    <div class="c-traffic-stat-section">
      <div class="c-traffic-stat-header">
        <span class="c-traffic-stat-title">当日总流量</span>
        <div class="c-traffic-stat-selector">
          <span>24小时</span>
          <span class="c-traffic-stat-arrow">▼</span>
        </div>
      </div>
      <div 
        class="c-traffic-daily-body" 
        :style="{ 
          backgroundImage: `url(${bgm_2})`, 
          backgroundSize: '100% 100%', 
          backgroundPosition: 'center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-traffic-stat-card">
          <span class="c-traffic-stat-label">江阴靖江长江隧道</span>
          <span class="c-traffic-stat-value c-traffic-stat-value--tunnel">34,620</span>
        </div>
        <div class="c-traffic-stat-card">
          <span class="c-traffic-stat-label">江阴大桥</span>
          <span class="c-traffic-stat-value c-traffic-stat-value--bridge">82,379</span>
        </div>
      </div>
    </div>

    <!-- 车型分布 -->
    <div class="c-traffic-stat-section">
      <div class="c-traffic-stat-header">
        <img :src="icon3" class="c-traffic-stat-title-icon" />
        <span class="c-traffic-stat-title">车型分布</span>
      </div>
      <div class="c-traffic-vehicle-body">
        <!-- 隧道车型 -->
        <div 
          class="c-traffic-vehicle-card" 
          :style="{ 
            backgroundImage: `url(${bgm_3})`, 
            backgroundSize: '100% 100%', 
            backgroundPosition: 'center', 
            backgroundRepeat: 'no-repeat' 
          }"
        >
          <div 
            class="c-traffic-vehicle-title-wrapper" 
            :style="{ 
              backgroundImage: `url(${bg3})`, 
              backgroundSize: '100% 100%', 
              backgroundPosition: 'center', 
              backgroundRepeat: 'no-repeat' 
            }"
          >
            <span class="c-traffic-vehicle-title">江阴靖江长江隧道</span>
          </div>
          <div class="c-traffic-vehicle-content">
            <div class="c-traffic-vehicle-stat">
              <span class="c-traffic-vehicle-stat-label">客车</span>
              <span class="c-traffic-vehicle-stat-value c-traffic-vehicle-stat-value--passenger">22350</span>
            </div>
            <img :src="icon4" class="c-traffic-vehicle-stat-icon" />
            <div class="c-traffic-vehicle-stat">
              <span class="c-traffic-vehicle-stat-label">货车</span>
              <span class="c-traffic-vehicle-stat-value c-traffic-vehicle-stat-value--truck">16270</span>
            </div>
          </div>
        </div>
        
        <!-- 大桥车型 -->
        <div 
          class="c-traffic-vehicle-card" 
          :style="{ 
            backgroundImage: `url(${bgm_4})`, 
            backgroundSize: '100% 100%', 
            backgroundPosition: 'center', 
            backgroundRepeat: 'no-repeat' 
          }"
        >
          <div 
            class="c-traffic-vehicle-title-wrapper" 
            :style="{ 
              backgroundImage: `url(${bg5})`, 
              backgroundSize: '100% 100%', 
              backgroundPosition: 'center', 
              backgroundRepeat: 'no-repeat' 
            }"
          >
            <span class="c-traffic-vehicle-title">江阴大桥</span>
          </div>
          <div class="c-traffic-vehicle-content">
            <div class="c-traffic-vehicle-stat">
              <span class="c-traffic-vehicle-stat-label">客车</span>
              <span class="c-traffic-vehicle-stat-value c-traffic-vehicle-stat-value--passenger">66109</span>
            </div>
            <img :src="icon5" class="c-traffic-vehicle-stat-icon" />
            <div class="c-traffic-vehicle-stat">
              <span class="c-traffic-vehicle-stat-label">货车</span>
              <span class="c-traffic-vehicle-stat-value c-traffic-vehicle-stat-value--truck">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统自动注入，无需 import
</script>