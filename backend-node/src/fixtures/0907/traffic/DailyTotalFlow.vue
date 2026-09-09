<template>
  <div class="c-traffic-monitor-es3tegsc-c-traffic-monitor-daily-flow">
    <!-- 标题栏 + 时间选择器 -->
    <div class="c-traffic-monitor-es3tegsc-c-traffic-monitor-flow-header"><img :src="icon2" class="auto-mounted-icon" style="width:18px;height:18px;object-fit:contain" alt="icon" />
      <div class="c-traffic-monitor-es3tegsc-c-traffic-monitor-flow-title"><img :src="icon3" class="auto-mounted-icon" style="width:18px;height:18px;object-fit:contain" alt="icon" />
        <img :src="icon1" class="c-traffic-monitor-es3tegsc-c-traffic-monitor-title-icon" alt="" />
        <span class="c-traffic-monitor-es3tegsc-c-traffic-monitor-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-traffic-monitor-es3tegsc-c-traffic-monitor-time-selector">
        <a-select-option value="24h">24小时</a-select-option>
      </a-select>
    </div>

    <!-- 流量统计卡片区 -->
    <div class="c-traffic-monitor-es3tegsc-c-traffic-monitor-flow-cards">
      <!-- 隧道卡片 -->
      <div 
        class="c-traffic-monitor-es3tegsc-c-traffic-monitor-flow-card" 
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <span class="c-traffic-monitor-es3tegsc-c-traffic-monitor-card-label">江阴靖江长江隧道</span>
        <span class="c-traffic-monitor-es3tegsc-c-traffic-monitor-card-value">{{ tunnelFlow }}</span>
      </div>

      <!-- 大桥卡片 -->
      <div 
        class="c-traffic-monitor-es3tegsc-c-traffic-monitor-flow-card" 
        :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <span class="c-traffic-monitor-es3tegsc-c-traffic-monitor-card-label">江阴大桥</span>
        <span class="c-traffic-monitor-es3tegsc-c-traffic-monitor-card-value">{{ bridgeFlow }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3561.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'
const icon3 = icon2
const icon1 = icon2


import { ref, onMounted, onUnmounted, watch} from 'vue'

// 资源变量（系统自动注入，不需要 import）

// 时间范围
const timeRange = ref('24h')

// 流量数据
const tunnelFlow = ref('34,620')
const bridgeFlow = ref('82,379')

// 加载数据（示例 Mock 数据）
const loadData = () => {
  // 实际应调用 componentApi.getCommonApiFindList() 等接口
  tunnelFlow.value = '34,620'
  bridgeFlow.value = '82,379'
}

// 监听时间范围变化
watch(timeRange, () => {
  loadData()
})

onMounted(() => {
  loadData()
})
</script>

<style lang="less" scoped>
@fontWeightStrong: var(--fontWeightStrong, 400);
@colorTextBase: var(--colorTextBase, #333333);
@colorPrimary: var(--colorPrimary, #409EFF);

@import '../../resources/styles/index.less';

.c-traffic-monitor-daily-flow {
flex: 91 1 0;
  min-height: 0;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-traffic-monitor-flow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-traffic-monitor-flow-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-traffic-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-traffic-monitor-title-text {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: @fontWeightStrong;
  color: @colorTextBase;
}

.c-traffic-monitor-time-selector {
  width: 100px;
  
  :deep(.ant-select-selector) {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
  }
  
  :deep(.ant-select-selection-item) {
    font-size: calc(var(--fontSize, 14px) * 1);
    color: #333333;
  }
}

.c-traffic-monitor-flow-cards {
  display: flex;
  gap: 12px;
}

.c-traffic-monitor-flow-card {
  flex: 1;
  min-width: 0;
  height: 91px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;}

.c-traffic-monitor-card-label {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: @fontWeightStrong;
  color: #333333;
}

.c-traffic-monitor-card-value {
  font-size: calc(var(--fontSize, 14px) * 2);
  font-weight: 900;
  color: @colorPrimary;
  line-height: 1.2;
}
</style>