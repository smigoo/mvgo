<template>
  <div class="env-monitor-root" :style="{ backgroundImage: `url(${bg1})` }">
    <ControlBar v-model:activeTab="activeTab" />
    <ChartArea :activeTab="activeTab" />
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7880.png'
import { ref} from 'vue'

// 导入子组件
// 🎯 面板标题「环境监测」由预览/宿主外壳渲染，组件内不生成标题（PanelHeader 已移除）
import ControlBar from './components/ControlBar.vue'
import ChartArea from './components/ChartArea.vue'

// 导入背景图资源（系统自动注入变量，此处按规范引入）

const activeTab = ref('一氧化碳')
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* 根容器：承载背景图、阴影及整体 flex 纵向布局
 * 🎯 尺寸兜底：Figma 原 420×186 → width/height 锚定原比例，max-* 保证不撑爆父容器 */
.env-monitor-root {
  width: 420px;
  height: 186px;
  max-width: 100%;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #edf4fb; /* Figma 面板底色 */;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25); /* Figma 面板投影 */;
  overflow: hidden;
}</style>