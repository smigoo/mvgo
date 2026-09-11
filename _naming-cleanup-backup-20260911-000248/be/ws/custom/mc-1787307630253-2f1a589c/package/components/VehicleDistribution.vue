<template>
  <div class="vehicle-distribution">
    <div class="vd-header">
      <span class="vd-title">车型分布</span>
      <span class="vd-subtitle">实时</span>
    </div>
    <div class="vd-content">
      <div class="vd-chart">
        <div class="vd-donut" :style="donutStyle">
          <div class="vd-donut-center">
            <span class="vd-total">{{ total }}</span>
            <span class="vd-total-label">辆</span>
          </div>
        </div>
      </div>
      <div class="vd-legend">
        <div v-for="item in vehicleListWithPercent" :key="item.type" class="vd-legend-item">
          <span class="vd-dot" :style="{ backgroundColor: item.color }"></span>
          <span class="vd-type">{{ item.label }}</span>
          <span class="vd-count">{{ item.value }}</span>
          <span class="vd-percent">{{ item.percent }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

let runtimeBuilder = null
let componentProps = {}
let businessProps = {}
let componentId = 'vehicle-distribution'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  if (builder) {
    runtimeBuilder = builder.runtimeBuilder || null
    componentProps = builder.componentProps || {}
    businessProps = builder.businessProps || {}
    componentId = builder.componentId || componentId
  }
} catch (e) {
  console.warn('[vehicle-distribution] $mcComponentBuilder 初始化失败:', e)
}

const defaultList = [
  { type: 'small', label: '小型车', value: 1240, color: '#3d7eff' },
  { type: 'medium', label: '中型车', value: 862, color: '#36d6b2' },
  { type: 'large', label: '大型车', value: 536, color: '#ffb64d' },
  { type: 'oversize', label: '超大型车', value: 210, color: '#ff6c6c' }
]

const vehicleList = ref(
  Array.isArray(businessProps.vehicleDistribution) && businessProps.vehicleDistribution.length
    ? businessProps.vehicleDistribution
    : defaultList
)

const total = computed(() => vehicleList.value.reduce((sum, item) => sum + Number(item.value || 0), 0))

const vehicleListWithPercent = computed(() => {
  const safeTotal = total.value || 1
  return vehicleList.value.map(item => ({
    ...item,
    percent: ((item.value / safeTotal) * 100).toFixed(1)
  }))
})

const donutStyle = computed(() => {
  let start = 0
  const segments = vehicleListWithPercent.value.map(item => {
    const angle = Number(item.percent) * 3.6
    const segment = `${item.color} ${start}deg ${start + angle}deg`
    start += angle
    return segment
  })
  return { background: `conic-gradient(${segments.join(',')})` }
})

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('VehicleDistribution-onload', {
      componentId,
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
.vehicle-distribution {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 16px;
  color: #e6f0ff;
  background: linear-gradient(135deg, rgba(12, 22, 48, 0.92), rgba(6, 14, 34, 0.88));
  border: 1px solid rgba(61, 126, 255, 0.25);
  border-radius: 8px;

  .vd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;

    .vd-title {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 2px;
    }

    .vd-subtitle {
      font-size: 12px;
      color: rgba(230, 240, 255, 0.6);
    }
  }

  .vd-content {
    display: flex;
    align-items: center;
    height: calc(100% - 40px);

    .vd-chart {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 50%;

      .vd-donut {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 140px;
        height: 140px;
        border-radius: 50%;
        transition: background 0.3s;
      }

      .vd-donut-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 88px;
        height: 88px;
        border-radius: 50%;
        background: #0b1630;

        .vd-total {
          font-size: 28px;
          font-weight: 700;
          line-height: 1;
          color: #fff;
        }

        .vd-total-label {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(230, 240, 255, 0.6);
        }
      }
    }

    .vd-legend {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 10px;

      .vd-legend-item {
        display: flex;
        align-items: center;
        font-size: 13px;

        .vd-dot {
          flex-shrink: 0;
          width: 8px;
          height: 8px;
          margin-right: 8px;
          border-radius: 50%;
        }

        .vd-type {
          width: 64px;
          color: rgba(230, 240, 255, 0.85);
        }

        .vd-count {
          flex: 1;
          font-weight: 600;
          color: #fff;
        }

        .vd-percent {
          width: 52px;
          text-align: right;
          color: #7fa8ff;
          font-variant-numeric: tabular-nums;
        }
      }
    }
  }
}
</style>