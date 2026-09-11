<template>
  <div class="dashboard-container">
    <!-- 顶部总览区 -->
    <div class="section-header">
      <h1 class="main-title">流量监测</h1>
      <div class="sub-header-row">
        <div class="section-title">
          <span class="diamond-icon"></span>
          当日总流量
        </div>
        <div class="select-box">
          24小时 <span class="arrow">∨</span>
        </div>
      </div>
      
      <div class="overview-cards">
        <div class="overview-item left">
          <div class="location-name">江阴靖江长江隧道</div>
          <div class="big-number blue">34,620</div>
        </div>
        <div class="center-car-icon">
          <div class="glow-ring"></div>
          <div class="car-svg">🚗</div>
        </div>
        <div class="overview-item right">
          <div class="location-name">江阴大桥</div>
          <div class="big-number cyan">82,379</div>
        </div>
      </div>
    </div>

    <!-- 流量趋势图区 -->
    <div class="section-trend">
      <div class="chart-header">
        <div class="chart-title">
          <span class="bar-icon"></span> 江阴靖江长江隧道
        </div>
        <div class="legend">
          <span class="legend-item"><span class="dot blue"></span> 北京方向</span>
          <span class="legend-item"><span class="dot cyan"></span> 上海方向</span>
        </div>
      </div>
      <div ref="chartTunnelTrend" class="echart-container"></div>

      <div class="chart-header" style="margin-top: 20px;">
        <div class="chart-title">
          <span class="bar-icon"></span> 江阴大桥
        </div>
        <div class="legend">
          <span class="legend-item"><span class="dot blue"></span> 北京方向</span>
          <span class="legend-item"><span class="dot cyan"></span> 上海方向</span>
        </div>
      </div>
      <div ref="chartBridgeTrend" class="echart-container"></div>
    </div>

    <!-- 车型分布区 -->
    <div class="section-distribution">
      <div class="section-title-row">
        <span class="diamond-icon"></span>
        车型分布
      </div>
      
      <div class="dist-grid">
        <!-- 隧道分布 -->
        <div class="dist-card">
          <div class="dist-header">江阴靖江长江隧道</div>
          <div class="dist-content">
            <div class="dist-data left">
              <div class="label">客车</div>
              <div class="value blue">22350</div>
            </div>
            <div ref="chartDistTunnel" class="dist-chart"></div>
            <div class="dist-data right">
              <div class="label">货车</div>
              <div class="value orange">16270</div>
            </div>
          </div>
        </div>

        <!-- 大桥分布 -->
        <div class="dist-card">
          <div class="dist-header">江阴大桥</div>
          <div class="dist-content">
            <div class="dist-data left">
              <div class="label">客车</div>
              <div class="value blue">66109</div>
            </div>
            <div ref="chartDistBridge" class="dist-chart"></div>
            <div class="dist-data right">
              <div class="label">货车</div>
              <div class="value orange">16270</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 流量预测区 -->
    <div class="section-prediction">
      <div class="pred-header-row">
        <div class="section-title-row" style="margin-bottom: 0;">
          <span class="diamond-icon"></span>
          流量预测
        </div>
        <div class="tabs">
          <div class="tab active">江阴靖江长江隧道</div>
          <div class="tab">江阴大桥</div>
          <div class="tab link">节假日预测 &gt;</div>
        </div>
      </div>

      <div class="chart-header" style="margin-top: 10px;">
        <div class="legend" style="margin-left: auto;">
          <span class="legend-item"><span class="dot-line blue"></span> 实际流量</span>
          <span class="legend-item"><span class="dot-line cyan"></span> 预测流量</span>
        </div>
      </div>
      <div ref="chartPrediction" class="echart-container-pred"></div>
      
      <div class="accuracy-row">
        <div class="acc-item">
          <div class="acc-label">2小时前</div>
          <div class="acc-val green">准确率98%</div>
        </div>
        <div class="acc-item">
          <div class="acc-label">1小时前</div>
          <div class="acc-val green">准确率96%</div>
        </div>
        <div class="acc-item">
          <div class="acc-label">当前时间</div>
          <div class="acc-val green">准确率92%</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const chartTunnelTrend = ref(null);
const chartBridgeTrend = ref(null);
const chartDistTunnel = ref(null);
const chartDistBridge = ref(null);
const chartPrediction = ref(null);

let instances = [];

const initCharts = () => {
  // 1. 隧道趋势图
  if (chartTunnelTrend.value) {
    const chart = echarts.init(chartTunnelTrend.value);
    instances.push(chart);
    chart.setOption({
      grid: { top: 30, right: 20, bottom: 20, left: 40, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#ccc',
        textStyle: { color: '#333' },
        formatter: function (params) {
          return `<div style="padding: 5px;">
            <div style="font-weight:bold; margin-bottom:5px;">16时</div>
            <div><span style="display:inline-block;width:10px;height:10px;background:#1890FF;margin-right:5px;"></span>北京方向 825 辆</div>
            <div><span style="display:inline-block;width:10px;height:10px;background:#00BCD4;margin-right:5px;"></span>上海方向 831 辆</div>
          </div>`;
        }
      },
      xAxis: {
        type: 'category',
        data: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
        axisLine: { lineStyle: { color: '#ccc' } },
        axisLabel: { color: '#666' }
      },
      yAxis: {
        type: 'value',
        max: 4000,
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
        axisLabel: { color: '#666' }
      },
      series: [
        {
          name: '北京方向',
          type: 'bar',
          data: [200, 300, 200, 400, 500, 1200, 1800, 1500, 825, 1200, 2000, 1500, 800],
          itemStyle: { color: '#1890FF' },
          barWidth: '30%'
        },
        {
          name: '上海方向',
          type: 'bar',
          data: [200, 300, 200, 400, 500, 1000, 1500, 1200, 831, 1000, 1800, 1200, 600],
          itemStyle: { color: '#00BCD4' },
          barWidth: '30%'
        }
      ],
      graphic: {
        elements: [
          {
            type: 'text',
            left: 50,
            top: 40,
            style: { text: '建议分流', fill: '#fa8c16', fontSize: 12, opacity: 0.6 }
          },
          {
            type: 'line',
            shape: { x1: 40, y1: 50, x2: 300, y2: 50 }, //  approximate position
            style: { stroke: '#fa8c16', lineDash: [4, 4], opacity: 0.6 }
          }
        ]
      }
    });
    // 强制显示 tooltip 在 16时 (index 8)
    setTimeout(() => {
      chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 8 });
    }, 100);
  }

  // 2. 大桥趋势图 (复用配置，数据类似)
  if (chartBridgeTrend.value) {
    const chart = echarts.init(chartBridgeTrend.value);
    instances.push(chart);
    chart.setOption({
      grid: { top: 30, right: 20, bottom: 20, left: 40, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#ccc',
        textStyle: { color: '#333' },
        formatter: function (params) {
          return `<div style="padding: 5px;">
            <div style="font-weight:bold; margin-bottom:5px;">16时</div>
            <div><span style="display:inline-block;width:10px;height:10px;background:#1890FF;margin-right:5px;"></span>北京方向 825 辆</div>
            <div><span style="display:inline-block;width:10px;height:10px;background:#00BCD4;margin-right:5px;"></span>上海方向 831 辆</div>
          </div>`;
        }
      },
      xAxis: {
        type: 'category',
        data: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
        axisLine: { lineStyle: { color: '#ccc' } },
        axisLabel: { color: '#666' }
      },
      yAxis: {
        type: 'value',
        max: 4000,
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
        axisLabel: { color: '#666' }
      },
      series: [
        {
          name: '北京方向',
          type: 'bar',
          data: [200, 300, 200, 400, 500, 1200, 1800, 1500, 825, 1200, 2200, 1500, 800],
          itemStyle: { color: '#1890FF' },
          barWidth: '30%'
        },
        {
          name: '上海方向',
          type: 'bar',
          data: [200, 300, 200, 400, 500, 1000, 1500, 1200, 831, 1000, 2000, 1200, 600],
          itemStyle: { color: '#00BCD4' },
          barWidth: '30%'
        }
      ]
    });
    setTimeout(() => {
      chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 8 });
    }, 100);
  }

  // 3. 车型分布 - 隧道
  if (chartDistTunnel.value) {
    const chart = echarts.init(chartDistTunnel.value);
    instances.push(chart);
    chart.setOption({
      series: [
        {
          type: 'pie',
          radius: ['50%', '70%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          data: [
            { value: 22350, itemStyle: { color: '#1890FF' } },
            { value: 16270, itemStyle: { color: '#FA8C16' } }
          ]
        }
      ]
    });
  }

  // 4. 车型分布 - 大桥
  if (chartDistBridge.value) {
    const chart = echarts.init(chartDistBridge.value);
    instances.push(chart);
    chart.setOption({
      series: [
        {
          type: 'pie',
          radius: ['50%', '70%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          data: [
            { value: 66109, itemStyle: { color: '#1890FF' } },
            { value: 16270, itemStyle: { color: '#FA8C16' } }
          ]
        }
      ]
    });
  }

  // 5. 流量预测
  if (chartPrediction.value) {
    const chart = echarts.init(chartPrediction.value);
    instances.push(chart);
    chart.setOption({
      grid: { top: 30, right: 20, bottom: 30, left: 40, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
        axisLine: { lineStyle: { color: '#ccc' } },
        axisLabel: { color: '#666' }
      },
      yAxis: {
        type: 'value',
        max: 4000,
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
        axisLabel: { color: '#666' }
      },
      series: [
        {
          name: '实际流量',
          type: 'line',
          data: [500, 2000, 2800, null, null],
          itemStyle: { color: '#1890FF' },
          lineStyle: { color: '#1890FF' },
          symbol: 'circle',
          symbolSize: 6
        },
        {
          name: '预测流量',
          type: 'line',
          data: [500, 2500, 3200, 2200, 800],
          itemStyle: { color: '#00BCD4' },
          lineStyle: { color: '#00BCD4' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0, 188, 212, 0.5)' },
              { offset: 1, color: 'rgba(0, 188, 212, 0.1)' }
            ])
          },
          symbol: 'circle',
          symbolSize: 6
        }
      ]
    });
  }
};

onMounted(() => {
  initCharts();
  window.addEventListener('resize', () => {
    instances.forEach(c => c.resize());
  });
});

onUnmounted(() => {
  instances.forEach(c => c.dispose());
});
</script>

<style scoped>
.dashboard-container {
  background-color: #eef1f5; /* 浅灰蓝背景，贴近截图 */
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 20px;
  overflow: auto;
  box-shadow: 0 0 20px rgba(0,0,0,0.1);
}

/* 通用样式 */
.section-title-row {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: bold;
  color: #1890FF;
  margin-bottom: 15px;
}

.diamond-icon {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid #1890FF;
  transform: rotate(45deg);
  margin-right: 8px;
  background: #fff;
}

.bar-icon {
  display: inline-block;
  width: 4px;
  height: 14px;
  background: #1890FF;
  margin-right: 6px;
  vertical-align: middle;
}

/* 顶部总览 */
.main-title {
  color: #1890FF;
  font-size: 20px;
  margin: 0 0 15px 0;
}

.sub-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.select-box {
  background: #fff;
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  font-size: 14px;
  color: #333;
  display: flex;
  align-items: center;
  gap: 5px;
}

.overview-cards {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255,255,255,0.5);
  padding: 15px;
  border-radius: 8px;
  position: relative;
}

.overview-item {
  flex: 1;
  text-align: center;
}

.location-name {
  font-size: 16px;
  color: #333;
  margin-bottom: 5px;
}

.big-number {
  font-size: 28px;
  font-weight: bold;
}

.big-number.blue { color: #1890FF; }
.big-number.cyan { color: #00BCD4; }

.center-car-icon {
  width: 80px;
  height: 80px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 20px;
}

.glow-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(24,144,255,0.2) 70%, transparent 100%);
  box-shadow: 0 0 15px rgba(24,144,255,0.3);
  border: 1px solid rgba(24,144,255,0.3);
}

.car-svg {
  font-size: 30px;
  z-index: 2;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}

/* 趋势图 */
.section-trend {
  margin-top: 20px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.chart-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  display: flex;
  align-items: center;
}

.legend {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #666;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.dot.blue { background: #1890FF; }
.dot.cyan { background: #00BCD4; }

.dot-line {
  width: 15px;
  height: 2px;
  position: relative;
}
.dot-line.blue { background: #1890FF; }
.dot-line.blue::after { content:''; position:absolute; right:-2px; top:-3px; width:6px; height:6px; border-radius:50%; background:#1890FF; border:1px solid #fff;}
.dot-line.cyan { background: #00BCD4; }
.dot-line.cyan::after { content:''; position:absolute; right:-2px; top:-3px; width:6px; height:6px; border-radius:50%; background:#00BCD4; border:1px solid #fff;}

.echart-container {
  width: 100%;
  height: 200px;
}

/* 车型分布 */
.section-distribution {
  margin-top: 30px;
}

.dist-grid {
  display: flex;
  gap: 20px;
}

.dist-card {
  flex: 1;
  background: rgba(255,255,255,0.3);
  border-radius: 8px;
  padding: 10px;
}

.dist-header {
  text-align: center;
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  color: #333;
}

.dist-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dist-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 80px;
}

.dist-data.left { align-items: flex-start; }
.dist-data.right { align-items: flex-end; }

.dist-data .label {
  font-size: 14px;
  color: #666;
  margin-bottom: 5px;
}

.dist-data .value {
  font-size: 20px;
  font-weight: bold;
}
.dist-data .value.blue { color: #1890FF; background: rgba(24,144,255,0.1); padding: 2px 8px; border-radius: 4px;}
.dist-data .value.orange { color: #FA8C16; background: rgba(250,140,22,0.1); padding: 2px 8px; border-radius: 4px;}

.dist-chart {
  width: 100px;
  height: 100px;
}

/* 流量预测 */
.section-prediction {
  margin-top: 30px;
}

.pred-header-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.tab {
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 14px;
  cursor: pointer;
  background: #e0e0e0;
  color: #666;
}

.tab.active {
  background: #1890FF;
  color: #fff;
}

.tab.link {
  background: transparent;
  color: #1890FF;
}

.echart-container-pred {
  width: 100%;
  height: 250px;
  margin-top: 10px;
}

.accuracy-row {
  display: flex;
  justify-content: space-around;
  margin-top: 10px;
  padding: 0 40px;
}

.acc-item {
  text-align: center;
}

.acc-label {
  font-size: 14px;
  color: #333;
  margin-bottom: 5px;
}

.acc-val {
  font-size: 14px;
  font-weight: bold;
}
.acc-val.green { color: #52c41a; }

</style>