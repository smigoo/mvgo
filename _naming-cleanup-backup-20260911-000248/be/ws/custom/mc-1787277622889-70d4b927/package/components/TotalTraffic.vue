<template>
  <div class="total-traffic-panel">
    <div class="panel-title">总流量统计</div>
    <div class="traffic-data">
      <div class="data-item">
        <span class="label">今日总流量</span>
        <span class="value">{{ totalVolume }}</span>
      </div>
      <div class="data-item">
        <span class="label">昨日总流量</span>
        <span class="value">{{ yesterdayVolume }}</span>
      </div>
    </div>
    <div class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

let runtimeBuilder = null
let businessProps = null
let componentProps = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  businessProps = builder?.businessProps || {}
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[TotalTraffic] $mcComponentBuilder 初始化失败:', e)
}

const totalVolume = ref(0)
const yesterdayVolume = ref(0)

onMounted(() => {
  runtimeBuilder?.publishEvent('TotalTraffic-onload', {
    componentId: 'TotalTraffic',
    timestamp: Date.now()
  })
  totalVolume.value = 12580
  yesterdayVolume.value = 11200
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
.total-traffic-panel {
  width: 100%;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(0, 20, 40, 0.6);
  border: 1px solid rgba(0, 150, 255, 0.3);
  border-radius: 4px;
  color: #fff;

  .panel-title {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 12px;
    color: #00e5ff;
  }

  .traffic-data {
    display: flex;
    justify-content: space-around;
    margin-bottom: 16px;

    .data-item {
      text-align: center;
      .label { font-size: 12px; color: #aaa; display: block; }
      .value { font-size: 24px; color: #fff; font-weight: bold; }
    }
  }

  .chart-container {
    width: 100%;
    height: calc(100% - 100px);
  }
}
</style>