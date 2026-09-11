<template>
  <div class="c-device-summary-root">
    <div class="c-device-summary-header">
      <div class="c-device-summary-stat">
        <span class="c-device-summary-label">设备类型</span>
        <span class="c-device-summary-value c-device-summary-value--blue">28</span>
      </div>
      <div class="c-device-summary-stat">
        <span class="c-device-summary-label">设备总数</span>
        <span class="c-device-summary-value c-device-summary-value--blue">68562</span>
      </div>
      <div class="c-device-summary-stat">
        <span class="c-device-summary-label">完好率</span>
        <span class="c-device-summary-value c-device-summary-value--green">98%</span>
      </div>
    </div>

    <div class="c-device-summary-cards">
      <div 
        :class="['c-device-summary-card', { 'c-device-summary-card--active': activeCard === 'tunnel' }]"
        @click="handleCardClick('tunnel')"
      >
        <div class="c-device-summary-card-icon">
          <img :src="icon5" alt="隧道设备" class="c-device-summary-card-img" />
          <span class="c-device-summary-card-title">隧道设备</span>
        </div>
        <div class="c-device-summary-card-data">
          <div class="c-device-summary-card-row">
            <span class="c-device-summary-card-label">总数:</span>
            <span class="c-device-summary-card-num">56302</span>
          </div>
          <div class="c-device-summary-card-row">
            <span class="c-device-summary-card-label">异常数:</span>
            <span class="c-device-summary-card-num c-device-summary-card-num--error">5</span>
          </div>
        </div>
      </div>

      <div 
        :class="['c-device-summary-card', { 'c-device-summary-card--active': activeCard === 'north-south' }]"
        @click="handleCardClick('north-south')"
      >
        <div class="c-device-summary-card-icon">
          <img :src="icon6" alt="南北接线设备" class="c-device-summary-card-img" />
          <span class="c-device-summary-card-title">南北接线设备</span>
        </div>
        <div class="c-device-summary-card-data">
          <div class="c-device-summary-card-row">
            <span class="c-device-summary-card-label">总数:</span>
            <span class="c-device-summary-card-num">1280</span>
          </div>
          <div class="c-device-summary-card-row">
            <span class="c-device-summary-card-label">异常数:</span>
            <span class="c-device-summary-card-num c-device-summary-card-num--error">3</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeCard = ref('tunnel')

const handleCardClick = (type) => {
  activeCard.value = type
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-summary-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-device-summary-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 24px;
}

.c-device-summary-stat {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-device-summary-label {
  font-size: 14px;
  color: #333333;
  font-family: 'Source Han Sans CN', sans-serif;
}

.c-device-summary-value {
  font-size: 20px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
  
  &--blue {
    color: #1990FF;
  }
  
  &--green {
    color: #08A3A5;
  }
}

.c-device-summary-cards {
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.c-device-summary-card {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 10px 15px;
  border-radius: 6px;
  background: #EDF4FB;
  cursor: pointer;
  transition: background 0.3s;
  
  &--active {
    background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
    
    .c-device-summary-card-title,
    .c-device-summary-card-label {
      color: #ffffff;
    }
    
    .c-device-summary-card-num {
      color: #ffffff;
    }

    .c-device-summary-card-num--error {
      color: #F53F3F;
    }
  }
}

.c-device-summary-card-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-device-summary-card-img {
  width: 27px;
  height: 32px;
}

.c-device-summary-card-title {
  font-size: 12px;
  color: #333333;
  font-family: 'YouSheBiaoTiHei', sans-serif;
  white-space: nowrap;
}

.c-device-summary-card-data {
  display: flex;
  flex-direction: column;
  margin-left: 15px;
  gap: 4px;
}

.c-device-summary-card-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-device-summary-card-label {
  font-size: 14px;
  color: #333333;
  font-family: 'Source Han Sans CN', sans-serif;
}

.c-device-summary-card-num {
  font-size: 20px;
  font-weight: 700;
  color: #1990FF;
  font-family: 'Roboto', sans-serif;
  
  &--error {
    color: #F53F3F;
  }
}
</style>