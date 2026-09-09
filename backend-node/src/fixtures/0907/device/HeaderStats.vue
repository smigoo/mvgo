<template>
  <div class="c-device-monitor-malvtjd5-c-device-monitor-header-stats">
    <div class="c-device-monitor-malvtjd5-c-device-monitor-title-group" :style="{ ...{ ...{ ...{ ...{ ...{ ...{ ...{ ...{ ...{ ...{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg11 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg12 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg13 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
    </div>
    
    <div class="c-device-monitor-stat-type">
      <span class="c-device-monitor-malvtjd5-c-device-monitor-stat-label">设备类型</span>
      <span class="c-device-monitor-malvtjd5-c-device-monitor-stat-value">28</span>
    </div>
    
    <div class="c-device-monitor-stat-total">
      <span class="c-device-monitor-malvtjd5-c-device-monitor-stat-label">设备总数</span>
      <span class="c-device-monitor-malvtjd5-c-device-monitor-stat-value">68562</span>
    </div>
    
    <div class="c-device-monitor-malvtjd5-c-device-monitor-stat-rate">
      <span class="c-device-monitor-malvtjd5-c-device-monitor-stat-label">完好率</span>
      <span class="c-device-monitor-stat-value c-device-monitor-malvtjd5-c-device-monitor-stat-value-success">98%</span>
    </div>
  </div>
</template>

<script setup>
import bg4 from '../../resources/images/bg-8439.png'
const bg5 = bg4
const bg6 = bg4
const bg7 = bg4
const bg8 = bg4
const bg9 = bg4
const bg10 = bg4
const bg11 = bg4
const bg12 = bg4
const bg13 = bg4
const bg14 = bg4


// 无需额外逻辑，纯展示组件
</script>

<style lang="less" scoped>
@fontSize: var(--fontSize);

@import '../../resources/styles/index.less';

.c-device-monitor-header-stats {
flex: 30 1 0;
  min-height: 0;
  width: 100%;

  display: flex;
  align-items: center;
  gap: 24px;
  flex-shrink: 0;
}

.c-device-monitor-title-group {
  display: flex;
  align-items: center;
}

.c-device-monitor-title {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 700;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.c-device-monitor-stat-type,
.c-device-monitor-stat-total,
.c-device-monitor-stat-rate {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-device-monitor-stat-label {
  font-size: @fontSize;
  font-weight: 400;
  color: var(--textColor, #333333);
}

.c-device-monitor-stat-value {
  font-size: calc(@fontSize * 1.4286);
  font-weight: 700;
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.c-device-monitor-stat-value-success {
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: #08a3a5;
}
</style>