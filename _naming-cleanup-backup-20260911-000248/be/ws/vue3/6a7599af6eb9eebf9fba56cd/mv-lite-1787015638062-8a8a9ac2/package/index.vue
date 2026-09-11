<template>
  <div class="container">
    <div class="header">
      <div class="icon-box">
        <div class="icon-shape"></div>
      </div>
      <span class="title">流量监测</span>
    </div>
    <div class="chart-wrapper">
      <div class="base-effect"></div>
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const chartRef = ref(null);
let chart = null;
let resizeObserver = null;

// Mock data based on screenshot
const xData = ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22'];
const beijingData = [150, 175, 200, 225, 220, 200, 180, 180, 180, 190, 180, 110];
const shanghaiData = [210, 150, 120, 131, 140, 160, 180, 190, 180, 170, 180, 250];

const initChart = () => {
  if (!chartRef.value || chart) return;
  if (chartRef.value.clientWidth === 0 || chartRef.value.clientHeight === 0) return;

  chart = echarts.init(chartRef.value);

  const option = {
    color: ['#1E90FF', '#00FA9A'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(6, 46, 46, 0.9)',
      borderColor: '#008B8B',
      borderWidth: 1,
      textStyle: {
        color: '#fff',
        fontSize: 14
      },
      formatter: function (params) {
        let time = params[0].axisValue + ':00';
        let html = `<div style="font-size: 16px; margin-bottom: 8px; color: #fff;">${time}</div>`;
        params.forEach(p => {
          let color = p.color;
          let name = p.seriesName;
          let value = p.value;
          html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; min-width: 140px;">
                     <span style="color: #ccc; margin-right: 10px;">${name}</span>
                     <span style="color: ${color}; font-size: 16px;">${value}辆</span>
                   </div>`;
        });
        return html;
      },
      // Force show tooltip at specific index to mimic screenshot if needed, 
      // but standard interaction is better. 
      // To mimic the screenshot exactly which shows tooltip at 06:00 (index 3):
      // We can't easily force it permanently without 'alwaysShowContent' which might look weird on resize.
      // I will leave it as standard hover, but style it to match.
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 10,
      textStyle: {
        color: '#fff',
        fontSize: 12
      },
      itemWidth: 12,
      itemHeight: 12
    },
    grid: {
      top: 50,
      left: 40,
      right: 20,
      bottom: 30,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData,
      axisLine: {
        lineStyle: { color: '#004D4D' }
      },
      axisLabel: {
        color: '#fff',
        margin: 10
      },
      axisTick: { show: false },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#fff',
        padding: [0, 0, 0, 10]
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 300,
      interval: 100,
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#004D4D'
        }
      },
      axisLabel: {
        color: '#fff'
      },
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#fff',
        padding: [0, 0, 20, 0],
        align: 'right'
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#1E90FF'
        },
        lineStyle: {
          width: 2,
          shadowColor: 'rgba(30, 144, 255, 0.5)',
          shadowBlur: 10
        },
        data: beijingData
      },
      {
        name: '上海方向',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#00FA9A'
        },
        lineStyle: {
          width: 2,
          shadowColor: 'rgba(0, 250, 154, 0.5)',
          shadowBlur: 10
        },
        data: shanghaiData
      }
    ]
  };

  chart.setOption(option);
  
  // To mimic the screenshot showing the tooltip at 06:00 (index 3)
  // We can dispatch action, but usually this is for interaction.
  // I'll dispatch it once after init to match the visual.
  setTimeout(() => {
    chart.dispatchAction({
      type: 'showTip',
      seriesIndex: 0,
      dataIndex: 3
    });
  }, 100);
};

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        if (!chart) {
          initChart();
        } else {
          chart.resize();
        }
      }
    }
  });
  
  if (chartRef.value) {
    resizeObserver.observe(chartRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (chart) {
    chart.dispose();
    chart = null;
  }
});
</script>

<style scoped>
.container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #001A1A;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: sans-serif;
}

.header {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  background: linear-gradient(90deg, #003333 0%, #004D4D 50%, #003333 100%);
  border-bottom: 1px solid #006666;
  box-shadow: 0 2px 10px rgba(0, 255, 255, 0.1);
  position: relative;
}

/* Decorative background for header */
.header::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    rgba(255, 255, 255, 0.03) 10px,
    rgba(255, 255, 255, 0.03) 20px
  );
  pointer-events: none;
}

.icon-box {
  margin-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-shape {
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #00BFFF 0%, #008B8B 100%);
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  box-shadow: 0 0 5px #00BFFF;
}

.title {
  color: #fff;
  font-size: 20px;
  font-weight: bold;
  letter-spacing: 2px;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.5);
}

.chart-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  padding: 10px;
}

.chart {
  width: 100%;
  height: 100%;
}

/* Bottom base effect */
.base-effect {
  position: absolute;
  bottom: 20px;
  left: 10%;
  right: 10%;
  height: 20px;
  background: linear-gradient(to bottom, #004D4D, transparent);
  clip-path: polygon(0 0, 100% 0, 90% 100%, 10% 100%);
  opacity: 0.6;
  pointer-events: none;
  z-index: 0;
}
</style>