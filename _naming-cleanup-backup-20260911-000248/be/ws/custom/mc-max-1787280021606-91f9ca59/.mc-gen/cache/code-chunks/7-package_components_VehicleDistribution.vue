<template>
  <div class="c-vehicle-distribution-root">
    <div class="c-vehicle-distribution-header">
      <span class="c-vehicle-distribution-diamond"></span>
      <span class="c-vehicle-distribution-title">车型分布</span>
    </div>
    <div class="c-vehicle-distribution-cards">
      <div class="c-vehicle-card">
        <div
          class="c-vehicle-card-bg"
          :style="{
            backgroundImage: `url(${bg2})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat'
          }"
        ></div>
        <div class="c-vehicle-card-content">
          <div class="c-vehicle-card-name">江阴靖江长江隧道</div>
          <div class="c-vehicle-card-stats">
            <div class="c-vehicle-stat">
              <span class="c-vehicle-stat-label">客车</span>
              <span class="c-vehicle-stat-value c-vehicle-stat-value-blue">22350</span>
            </div>
            <div class="c-vehicle-stat">
              <span class="c-vehicle-stat-label">货车</span>
              <span class="c-vehicle-stat-value c-vehicle-stat-value-orange">16270</span>
            </div>
          </div>
        </div>
      </div>
      <div class="c-vehicle-card">
        <div
          class="c-vehicle-card-bg"
          :style="{
            backgroundImage: `url(${bg4})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat'
          }"
        ></div>
        <div class="c-vehicle-card-content">
          <div class="c-vehicle-card-name">江阴大桥</div>
          <div class="c-vehicle-card-stats">
            <div class="c-vehicle-stat">
              <span class="c-vehicle-stat-label">客车</span>
              <span class="c-vehicle-stat-value c-vehicle-stat-value-blue">66109</span>
            </div>
            <div class="c-vehicle-stat">
              <span class="c-vehicle-stat-label">货车</span>
              <span class="c-vehicle-stat-value c-vehicle-stat-value-orange">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 车型分布卡片为静态展示，后续可由父组件注入数据扩展
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-vehicle-distribution-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.c-vehicle-distribution-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 24px;
  margin-bottom: 4px;
}

.c-vehicle-distribution-diamond {
  width: 10px;
  height: 10px;
  background: linear-gradient(135deg, #1990ff 0%, #5a7eff 100%);
  transform: rotate(45deg);
  border-radius: 2px;
  margin-right: 6px;
  flex-shrink: 0;
}

.c-vehicle-distribution-title {
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0px 5.0479px 5.0479px rgba(255, 255, 255, 0.8);
}

.c-vehicle-distribution-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 3px;
}

.c-vehicle-card {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  box-sizing: border-box;
}

.c-vehicle-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 80px;
  pointer-events: none;
  z-index: 0;
}

.c-vehicle-card-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  box-sizing: border-box;
  padding-bottom: 8px;
}

.c-vehicle-card-name {
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  color: #333333;
  text-align: center;
  margin-bottom: 6px;
}

.c-vehicle-card-stats {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 14px;
}

.c-vehicle-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 38px;
}

.c-vehicle-stat-label {
  font-family: 'Alibaba PuHuiTi', 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}

.c-vehicle-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.c-vehicle-stat-value-blue {
  color: #1399ff;
}

.c-vehicle-stat-value-orange {
  color: #ff6a00;
}
</style>