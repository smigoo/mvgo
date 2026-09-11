<template>
  <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stats">
    <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-header-update">*数据实时更新</span>

    <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-group" :style="{ background: '#f53f3f' }">
      <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-label">设备类型</span>
      <span class="c-monitor-header-stat-value c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-value--blue">28</span>
    </div>

    <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-group" :style="{ backgroundImage: `url(${bg9})`, backgroundSize: '117px 64px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-label">设备总数</span>
      <span class="c-monitor-header-stat-value c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-value--blue">68562</span>
    </div>

    <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-group" :style="{ backgroundImage: `url(${bg10})`, backgroundSize: '117px 64px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-label">完好率</span>
      <span class="c-monitor-header-stat-value c-mc-max-1787814814517-5a36c1ea-c-monitor-header-stat-value--cyan">98%</span>
    </div>
  </div>
</template>

<script setup>
// HeaderStats 为纯展示组件，无交互逻辑
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>