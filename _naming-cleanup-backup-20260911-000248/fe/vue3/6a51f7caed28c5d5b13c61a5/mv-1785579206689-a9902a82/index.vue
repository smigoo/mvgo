<template>
  <div class="mv-1785579206689-a9902a82">
    <div class="header">
      <img src="../resources/images/g-3552.png" class="header-icon" />
      <span class="header-title">流量监测</span>
    </div>

    <div class="section total-traffic">
      <div class="section-bg"><img src="../resources/images/bg-_m-34.png" class="section-bg-img" /></div>
      <div class="section-header">
        <span class="section-title">当日总流量</span>
        <div class="section-right">
          <select class="custom-select" v-model="timeRange">
            <option value="24">24小时</option>
            <option value="12">12小时</option>
          </select>
        </div>
      </div>
      <div class="stats-group">
        <div class="stat-item">
          <div class="stat-label">江阴靖江长江隧道</div>
          <div class="stat-value" style="color: #1990ff">34,620</div>
          <img src="../resources/images/Group_2136636847-7493.png" class="stat-icon" />
        </div>
        <div class="stat-item">
          <div class="stat-label">江阴大桥</div>
          <div class="stat-value" style="color: #00b4d8">82,379</div>
        </div>
      </div>
      <div class="charts-row">
        <div class="chart-container">
          <div class="chart-title">江阴靖江长江隧道</div>
          <div ref="chart1Ref" class="chart"></div>
          <img src="../resources/images/Group_2136638523-7500.png" class="chart-decor" />
        </div>
        <div class="chart-container">
          <div class="chart-title">江阴大桥</div>
          <div ref="chart2Ref" class="chart"></div>
          <img src="../resources/images/Group_2136638522-7503.png" class="chart-decor" />
        </div>
      </div>
    </div>

    <div class="section vehicle-distribution">
      <div class="section-header">
        <div class="title-left">
          <img src="../resources/images/icon-3561.png" class="title-icon" />
          <span class="section-title">车型分布</span>
        </div>
      </div>
      <div class="distribution-row">
        <div class="distribution-card">
          <div class="card-title">江阴靖江长江隧道</div>
          <div class="card-content">
            <div class="stat-text"><span class="label">客车</span><span class="value" style="color: #1990ff">22350</span></div>
            <img src="../resources/images/echarts-31.png" class="ring-decor" />
            <div class="stat-text"><span class="label">货车</span><span class="value" style="color: #ff9900">16270</span></div>
          </div>
        </div>
        <div class="distribution-card">
          <div class="card-title">江阴大桥</div>
          <div class="card-content">
            <div class="stat-text"><span class="label">客车</span><span class="value" style="color: #1990ff">66109</span></div>
            <img src="../resources/images/echarts-31.png" class="ring-decor" />
            <div class="stat-text"><span class="label">货车</span><span class="value" style="color: #ff9900">16270</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="section traffic-prediction">
      <div class="section-header">
        <span class="section-title">流量预测</span>
        <div class="section-right">
          <div class="tabs">
            <div class="tab" :class="{ active: activeTab === tab }" v-for="tab in tabs" :key="tab" @click="activeTab = tab">{{ tab }}</div>
          </div>
          <a class="link" href="#">节假日预测></a>
        </div>
      </div>
      <div class="chart-container prediction-chart">
        <div ref="chart3Ref" class="chart"></div>
        <img src="../resources/images/echarts-31.png" class="chart-bg-decor" />
        <img src="../resources/images/Group_2136638521-7506.png" class="chart-decor-1" />
        <img src="../resources/images/Group_2136638520-7509.png" class="chart-decor-2" />
      </div>
      <div class="footer-stats">
        <span class="footer-stat" style="color: #52c41a">准确率98%</span>
        <span class="footer-stat" style="color: #52c41a">准确率96%</span>
        <span class="footer-stat" style="color: #52c41a">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const timeRange = ref('24')
const activeTab = ref('江阴靖江长江隧道')
const tabs = ['江阴靖江长江隧道', '江阴大桥']

const chart1Ref = ref(null)
const chart2Ref = ref(null)
const chart3Ref = ref(null)
let chart1 = null, chart2 = null, chart3 = null

const initCharts = () => {
  const barOption = (data1, data2) => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['北京方向', '上海方向'], top: 0, right: 0, textStyle: { color: '#666', fontSize: 12 } },
    grid: { top: 30, left: 10, right: 10, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: ['8时', '10时', '12时', '14时', '16时', '18时'], axisLine: { lineStyle: { color: '#eee' } }, axisLabel: { color: '#999' } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f5f5f5' } }, axisLabel: { color: '#999' } },
    series: [
      { name: '北京方向', type: 'bar', data: data1, itemStyle: { color: '#1990ff', borderRadius: [4, 4, 0, 0] }, barWidth: 12 },
      { name: '上海方向', type: 'bar', data: data2, itemStyle: { color: '#00b4d8', borderRadius: [4, 4, 0, 0] }, barWidth: 12 }
    ]
  })

  chart1 = echarts.init(chart1Ref.value)
  chart1.setOption(barOption([300, 400, 500, 600, 825, 700], [350, 450, 550, 650, 831, 750]))

  chart2 = echarts.init(chart2Ref.value)
  chart2.setOption(barOption([400, 500, 600, 700, 825, 900], [450, 550, 650, 750, 831, 950]))

  chart3 = echarts.init(chart3Ref.value)
  chart3.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['实际流量', '预测流量'], top: 0, right: 0, textStyle: { color: '#666', fontSize: 12 } },
    grid: { top: 30, left: 10, right: 10, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'], boundaryGap: false, axisLine: { lineStyle: { color: '#eee' } }, axisLabel: { color: '#999' } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f5f5f5' } }, axisLabel: { color: '#999' } },
    series: [
      { name: '实际流量', type: 'line', data: [500, 600, 700, '-', '-'], smooth: true, symbol: 'circle', symbolSize: 8, itemStyle: { color: '#1990ff' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(25,144,255,0.4)' }, { offset: 1, color: 'rgba(25,144,255,0.05)' }]) } },
      { name: '预测流量', type: 'line', data: ['-', '-', 700, 800, 900], smooth: true, symbol: 'circle', symbolSize: 8, itemStyle: { color: '#00b4d8' }, lineStyle: { type: 'dashed' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(0,180,216,0.4)' }, { offset: 1, color: 'rgba(0,180,216,0.05)' }]) } }
    ]
  })
}

const handleResize = () => {
  chart1?.resize()
  chart2?.resize()
  chart3?.resize()
}

onMounted(() => {
  initCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart1?.dispose()
  chart2?.dispose()
  chart3?.dispose()
})
</script>

<style lang="less" scoped>
.mv-1785579206689-a9902a82 {
  width: 100%; height: 100%; background: #edf4fb; padding: 16px;
  display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; overflow: hidden;
}
.header { display: flex; align-items: center; gap: 8px;
  .header-icon { width: 24px; height: 24px; object-fit: contain; }
  .header-title { font-size: 18px; font-weight: bold; background: linear-gradient(180deg, #388dff, #388dff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
}
.section { background: #fff; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px; position: relative; overflow: hidden;
  .section-header { display: flex; justify-content: space-between; align-items: center;
    .title-left { display: flex; align-items: center; gap: 8px;
      .title-icon { width: 20px; height: 20px; object-fit: contain; }
    }
    .section-title { font-size: 16px; font-weight: bold; color: #333; }
    .section-right { display: flex; align-items: center; gap: 12px;
      .custom-select { background: #fff; border: 1px solid #d9d9d9; border-radius: 4px; padding: 4px 8px; font-size: 14px; outline: none; }
      .tabs { display: flex; gap: 8px;
        .tab { padding: 4px 12px; border-radius: 4px; font-size: 14px; color: #666; cursor: pointer;
          &.active { background: #e6f0ff; color: #1990ff; }
        }
      }
      .link { font-size: 14px; color: #1990ff; text-decoration: none; }
    }
  }
}
.total-traffic { background: #edf4fbb2;
  .section-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;
    .section-bg-img { width: 100%; height: 100%; object-fit: cover; opacity: 0.3; }
  }
  > * { position: relative; z-index: 1; }
  .stats-group { display: flex; justify-content: space-between; align-items: center; background: rgba(237, 244, 251, 0.7); border-radius: 8px; padding: 16px;
    .stat-item { display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative;
      .stat-label { font-size: 14px; color: #666; }
      .stat-value { font-size: 24px; font-weight: bold; }
      .stat-icon { width: 40px; height: 40px; object-fit: contain; position: absolute; right: -20px; top: 50%; transform: translateY(-50%); }
    }
  }
  .charts-row { display: flex; gap: 16px;
    .chart-container { flex: 1; display: flex; flex-direction: column; gap: 8px; position: relative;
      .chart-title { font-size: 14px; color: #333; }
      .chart { width: 100%; flex: 1; min-height: 120px; }
      .chart-decor { position: absolute; bottom: 10px; right: 10px; width: 30px; height: 30px; object-fit: contain; opacity: 0.3; }
    }
  }
}
.vehicle-distribution {
  .distribution-row { display: flex; gap: 16px;
    .distribution-card { flex: 1; background: rgba(237, 244, 251, 0.7); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
      .card-title { font-size: 14px; color: #333; }
      .card-content { display: flex; justify-content: space-between; align-items: center;
        .stat-text { display: flex; flex-direction: column; align-items: center; gap: 4px;
          .label { font-size: 12px; color: #666; }
          .value { font-size: 18px; font-weight: bold; }
        }
        .ring-decor { width: 60px; height: 60px; object-fit: contain; }
      }
    }
  }
}
.traffic-prediction {
  .prediction-chart { position: relative;
    .chart { width: 100%; height: 200px; }
    .chart-bg-decor { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100px; height: 100px; object-fit: contain; opacity: 0.1; z-index: 0; }
    .chart-decor-1, .chart-decor-2 { position: absolute; width: 20px; height: 20px; object-fit: contain; opacity: 0.5; }
    .chart-decor-1 { top: 20px; right: 20px; }
    .chart-decor-2 { bottom: 20px; left: 20px; }
  }
  .footer-stats { display: flex; justify-content: space-around;
    .footer-stat { font-size: 14px; font-weight: bold; }
  }
}</style>