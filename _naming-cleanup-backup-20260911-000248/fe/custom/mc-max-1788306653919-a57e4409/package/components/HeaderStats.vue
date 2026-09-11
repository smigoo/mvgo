<template>
  <div class="c-monitor-header-stats">
    <!-- 设备监测统计 -->
    <div class="c-monitor-stat-group" :style="{ ...{ ...{ ...{ ...{ ...{ ...{ ...{ ...{ ...{ ...{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg11 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg12 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg13 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
      <div class="c-monitor-stat-items">
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">设备类型</span>
          <span class="c-monitor-stat-item-value" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">28</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label">设备总数</span>
          <span class="c-monitor-stat-item-value">68562</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label">完好率</span>
          <span class="c-monitor-stat-item-value c-monitor-stat-value-success">98%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg14 from '../../resources/images/bg-8439.png'
import bg13 from '../../resources/images/bg-8439.png'
import bg12 from '../../resources/images/bg-8439.png'
import bg11 from '../../resources/images/bg-8439.png'
import bg10 from '../../resources/images/bg-8439.png'
import bg9 from '../../resources/images/bg-8439.png'
import bg7 from '../../resources/images/bg-8439.png'
import bg6 from '../../resources/images/bg-8439.png'
import bg5 from '../../resources/images/bg-8439.png'
import bg4 from '../../resources/images/bg-8439.png'
import bg3 from '../../resources/images/bg-8439.png'
import bg2 from '../../resources/images/bg-8807.png'
import bg1 from '../../resources/images/bg-8788.png'
// 无需额外逻辑，纯静态展示
</script>

<style lang="less" scoped>
@color-text-primary: #409EFF;
@color-success: #52c41a;

@import '../../resources/styles/index.less';

.c-monitor-header-stats {
flex: 1 1 0;
  width: 100%;

  display: flex;
  align-items: center;
  gap: 24px;
}

.c-monitor-stat-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-stat-label {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 700;
  color: @color-text-primary;
}

.c-monitor-stat-items {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-item-label {
  font-size: calc(var(--fontSize, 14px) * 1);
  color: var(--color-text-secondary, #666666);
}

.c-monitor-stat-item-value {
  font-size: calc(var(--fontSize, 14px) * 1.43);
  font-weight: 700;
  color: var(--color-primary, #1890ff);
}

.c-monitor-stat-value-success {
  color: @color-success;
}
</style>