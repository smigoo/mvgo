<template>
  <div class="c-vehicle-type-root">
    <div class="c-vehicle-type-header">
      <img :src="icon3" class="c-vehicle-type-header-icon" />
      <span class="c-vehicle-type-header-title">车型分布</span>
    </div>
    <div class="c-vehicle-type-body">
      <div class="c-vehicle-type-card" :style="{ backgroundImage: `url(${bgm_3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
        <div class="c-vehicle-type-card-title-wrapper">
          <div class="c-vehicle-type-card-title-bg" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"></div>
          <span class="c-vehicle-type-card-title">江阴靖江长江隧道</span>
        </div>
        <div class="c-vehicle-type-card-content">
          <div class="c-vehicle-type-stat">
            <span class="c-vehicle-type-stat-label">客车</span>
            <span class="c-vehicle-type-stat-value c-vehicle-type-stat-value--blue">22350</span>
          </div>
          <img :src="icon5" class="c-vehicle-type-icon" />
          <div class="c-vehicle-type-stat">
            <span class="c-vehicle-type-stat-label">货车</span>
            <span class="c-vehicle-type-stat-value c-vehicle-type-stat-value--orange">16270</span>
          </div>
        </div>
      </div>
      <div class="c-vehicle-type-card" :style="{ backgroundImage: `url(${bgm_4})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
        <div class="c-vehicle-type-card-title-wrapper">
          <div class="c-vehicle-type-card-title-bg" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"></div>
          <span class="c-vehicle-type-card-title">江阴大桥</span>
        </div>
        <div class="c-vehicle-type-card-content">
          <div class="c-vehicle-type-stat">
            <span class="c-vehicle-type-stat-label">客车</span>
            <span class="c-vehicle-type-stat-value c-vehicle-type-stat-value--blue">66109</span>
          </div>
          <img :src="icon5" class="c-vehicle-type-icon" />
          <div class="c-vehicle-type-stat">
            <span class="c-vehicle-type-stat-label">货车</span>
            <span class="c-vehicle-type-stat-value c-vehicle-type-stat-value--orange">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统自动注入，无需手动 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-vehicle-type-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.c-vehicle-type-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-vehicle-type-header-icon {
  width: 18px;
  height: 18px;
}

.c-vehicle-type-header-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-vehicle-type-body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.c-vehicle-type-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 12px 8px 8px;
  min-width: 0;
}

.c-vehicle-type-card-title-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 24px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-vehicle-type-card-title-bg {
  position: absolute;
  width: 130px;
  height: 9px;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.c-vehicle-type-card-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  position: relative;
  z-index: 1;
}

.c-vehicle-type-card-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: 1;
  min-height: 0;
}

.c-vehicle-type-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-vehicle-type-stat-label {
  font-size: 12px;
  color: #333333;
}

.c-vehicle-type-stat-value {
  font-size: 18px;
  font-weight: 700;
  font-family: Roboto, sans-serif;
}

.c-vehicle-type-stat-value--blue {
  color: #1399ff;
}

.c-vehicle-type-stat-value--orange {
  color: #ff6a00;
}

.c-vehicle-type-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}
</style>