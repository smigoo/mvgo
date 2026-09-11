<template>
  <!-- 根容器：承载整体背景与阴影，纵向布局 -->
  <div 
    class="env-monitor-root" 
    :style="{ backgroundImage: `url(${bg1})` }"
  >
    <!-- 顶部标题区：包含信号图标与标题文字 -->
    <SectionHeader />
    
    <!-- 标签页切换与工具栏：包含监测指标Tab与视图切换按钮 -->
    <SectionTabsTools />
    
    <!-- 浓度趋势图表区：包含CO浓度面积图与预警线 -->
    <SectionChart />
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7880.png'

import SectionHeader from './components/SectionHeader.vue'
import SectionTabsTools from './components/SectionTabsTools.vue'
import SectionChart from './components/SectionChart.vue'

</script>

<style scoped>
/* 根容器：承载整体面板背景、阴影与纵向布局 */
.env-monitor-root {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;

  /* Figma bg 节点填充色：浅灰蓝色背景 */
  background-color: #edf4fb;

  /* 背景图由模板 :style 注入 bg1，这里补齐铺满方式，避免压缩/平铺失真 */
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center center;

  /* Figma 根容器阴影：0px 4px 10px rgba(74,117,141,0.25) */
  box-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
}
</style>
