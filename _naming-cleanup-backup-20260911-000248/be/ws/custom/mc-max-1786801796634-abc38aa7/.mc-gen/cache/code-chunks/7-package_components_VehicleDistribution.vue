<template>
  <div class="c-monitor-vehicle-root">
    <div class="c-monitor-vehicle-header">
      <img :src="icon3" alt="标题装饰图标" class="c-monitor-vehicle-header-icon" />
      <span class="c-monitor-vehicle-title">车型分布</span>
    </div>

    <div class="c-monitor-vehicle-cards">
      <div 
        class="c-monitor-vehicle-card" 
        :style="{ 
          backgroundImage: `url(${bgm_3})`, 
          backgroundSize: '100% 100%', 
          backgroundPosition: 'center center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-monitor-vehicle-card-title">江阴靖江长江隧道</div>
        <div class="c-monitor-vehicle-card-content">
          <div class="c-monitor-vehicle-stat">
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--blue">22350</span>
          </div>
          <img :src="icon5" alt="车型图标" class="c-monitor-vehicle-card-icon" />
          <div class="c-monitor-vehicle-stat">
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--orange">16270</span>
          </div>
        </div>
      </div>

      <div 
        class="c-monitor-vehicle-card" 
        :style="{ 
          backgroundImage: `url(${bgm_4})`, 
          backgroundSize: '100% 100%', 
          backgroundPosition: 'center center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-monitor-vehicle-card-title">江阴大桥</div>
        <div class="c-monitor-vehicle-card-content">
          <div class="c-monitor-vehicle-stat">
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--blue">66109</span>
          </div>
          <img :src="icon5" alt="车型图标" class="c-monitor-vehicle-card-icon" />
          <div class="c-monitor-vehicle-stat">
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--orange">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

defineProps({
  businessConfig: {
    type: Object,
    default: () => ({})
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.c-monitor-vehicle-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-monitor-vehicle-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-vehicle-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-vehicle-cards {
  display: flex;
  flex-direction: row;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.c-monitor-vehicle-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  position: relative;
  min-width: 0;
}

.c-monitor-vehicle-card-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  margin-bottom: 8px;
  text-align: center;
  width: 100%;
}

.c-monitor-vehicle-card-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  flex: 1;
  padding: 0 4px;
}

.c-monitor-vehicle-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-vehicle-stat-label {
  font-size: 12px;
  font-weight: 400;
  color: #333333;
}

.c-monitor-vehicle-stat-value {
  font-size: 18px;
  font-weight: 700;
  font-family: Roboto, sans-serif;
}

.c-monitor-vehicle-stat-value--blue {
  color: #1399ff;
}

.c-monitor-vehicle-stat-value--orange {
  color: #ff6a00;
}

.c-monitor-vehicle-card-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}
</style>