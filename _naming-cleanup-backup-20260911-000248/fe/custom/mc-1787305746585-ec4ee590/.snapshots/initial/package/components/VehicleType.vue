<template>
  <div class="c-monitor-vehicle-type">
    <!-- 章节标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-group">
        <img :src="icon1" class="c-monitor-section-deco" alt="装饰图标" />
        <span class="c-monitor-section-title">车型分布</span>
      </div>
    </div>

    <!-- 卡片区 -->
    <div class="c-monitor-vehicle-cards">
      <!-- 江阴靖江长江隧道车型卡片 -->
      <div
        class="c-monitor-vehicle-card"
        :style="{
          backgroundImage: `url(${bg4})`,
          backgroundSize: '100% auto',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div class="c-monitor-vehicle-stat">
          <span class="c-monitor-vehicle-label">客车</span>
          <span class="c-monitor-vehicle-value c-monitor-vehicle-value-blue">22350</span>
        </div>
        <img :src="icon5" class="c-monitor-vehicle-icon" alt="车型图标" />
        <div class="c-monitor-vehicle-stat">
          <span class="c-monitor-vehicle-label">货车</span>
          <span class="c-monitor-vehicle-value c-monitor-vehicle-value-orange">16270</span>
        </div>
      </div>

      <!-- 江阴大桥车型卡片 -->
      <div
        class="c-monitor-vehicle-card"
        :style="{
          backgroundImage: `url(${bg2})`,
          backgroundSize: '100% auto',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div class="c-monitor-vehicle-stat">
          <span class="c-monitor-vehicle-label">客车</span>
          <span class="c-monitor-vehicle-value c-monitor-vehicle-value-blue">66109</span>
        </div>
        <img :src="icon5" class="c-monitor-vehicle-icon" alt="车型图标" />
        <div class="c-monitor-vehicle-stat">
          <span class="c-monitor-vehicle-label">货车</span>
          <span class="c-monitor-vehicle-value c-monitor-vehicle-value-orange">16270</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/g-3552.png'
import bg4 from '../../resources/images/bg-_m-35.png'
import icon5 from '../../resources/images/icon-3573.png'
import bg2 from '../../resources/images/bg-_m-36.png'

</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>