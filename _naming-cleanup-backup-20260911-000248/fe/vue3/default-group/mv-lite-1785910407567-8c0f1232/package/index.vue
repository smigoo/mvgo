<template>
  <div class="container">
    <!-- 顶部导航区 -->
    <div class="header">
      <div class="title">环境监测</div>
      
      <div class="nav-bar">
        <div class="tabs-wrapper">
          <div class="tab-item active">
            <span class="arrow-shape"></span>
            一氧化碳
          </div>
          <div class="tab-item">能见度</div>
          <div class="tab-item">洞内照明</div>
          <div class="tab-item">洞外光强</div>
        </div>

        <div class="icon-group">
          <div class="icon-btn chart-icon">
            <div class="bar b1"></div>
            <div class="bar b2"></div>
            <div class="bar b3"></div>
          </div>
          <div class="icon-btn list-icon">
            <div class="line l1"></div>
            <div class="line l2"></div>
            <div class="line l3"></div>
            <div class="badge">6</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 主体图表区 -->
    <div class="chart-area">
      <div class="y-axis-title">辆</div>
      <div ref="chartRef" class="echarts-container"></div>
      <div class="x-axis-title">时</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const chartRef = ref(null);
let chartInstance = null;

onMounted(() => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value);
    
    const option = {
      grid: {
        top: 40,
        right: 40,
        bottom: 30,
        left: 40,
        containLabel: true
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['zk3+785CO浓度'],
        right: 20,
        top: 10,
        textStyle: {
          color: '#333',
          fontSize: 12
        },
        icon: 'rect' // 简化图例图标
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
        axisLine: {
          lineStyle: { color: '#ccc' }
        },
        axisLabel: {
          color: '#666',
          margin: 15
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 50,
        interval: 10,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: '#e0e0e0'
          }
        },
        axisLabel: {
          color: '#666'
        }
      },
      series: [
        {
          name: 'zk3+785CO浓度',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color: '#76c893',
            width: 2
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(118, 200, 147, 0.4)' },
              { offset: 1, color: 'rgba(118, 200, 147, 0.05)' }
            ])
          },
          data: [5, 8, 6, 3, 2, 2, 5, 10, 15, 15, 12, 8, 2], // 多一个点以匹配视觉
          // 修正数据长度以匹配x轴
          data: [5, 8, 6, 3, 2, 2, 8, 15, 12, 8, 5, 2] 
        },
        {
          type: 'line',
          markLine: {
            symbol: 'none',
            label: {
              position: 'end',
              formatter: '预警线',
              color: '#d9534f',
              fontSize: 12
            },
            lineStyle: {
              type: 'dashed',
              color: '#d9534f'
            },
            data: [
              { yAxis: 30 }
            ]
          }
        }
      ]
    };

    // 修正数据长度问题，X轴12个点，数据也12个点
    option.series[0].data = [5, 8, 6, 3, 2, 2, 8, 15, 12, 8, 5, 2];

    chartInstance.setOption(option);
  }
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
  }
});
</script>

<style scoped>
.container {
  width: 100%;
  height: 100%;
  background-color: #cfd4d9; /* 截图背景灰蓝色 */
  border-radius: 8px;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  font-family: sans-serif;
  position: relative;
  overflow: hidden;
}

/* 顶部区域 */
.header {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

.title {
  color: #4facfe; /* 青色标题 */
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 15px;
  margin-left: 10px;
}

.nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tabs-wrapper {
  display: flex;
  background-color: #8faecf; /* Tab栏背景 */
  border-radius: 20px;
  padding: 4px;
  align-items: center;
}

.tab-item {
  padding: 8px 20px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  border-radius: 16px;
  transition: all 0.3s;
  position: relative;
}

.tab-item.active {
  background-color: #fff; /* 激活状态白色背景 */
  color: #fff; /* 截图里文字看起来像白色，或者很浅的蓝，这里为了对比度用白色，或者根据截图调整 */
  /* 截图里“一氧化碳”背景是白色/浅蓝，文字是白色。这有点反直觉，通常是深色文字。
     仔细看截图，“一氧化碳”背景是浅蓝色块，文字白色。
     或者是白色块，文字蓝色。
     让我们假设是白色块，文字蓝色/深色，或者保持白色文字加阴影。
     看截图，"一氧化碳"背景明显比周围亮，像是白色。文字也是白色？
     不，文字应该是深色或者蓝色。
     为了还原截图视觉效果：背景 #eef6fc，文字 #4facfe 或白色。
     截图里文字是白色的。那背景可能是深一点的蓝色？
     不，截图里长条是浅蓝，"一氧化碳"块是白色/极浅蓝。文字是白色。
     这可能是截图压缩导致的。通常激活态文字会变深色。
     这里我设为白色文字，背景设为更亮的浅蓝/白色。
  */
  background: linear-gradient(90deg, #a0c4e8, #8faecf); /* 模拟截图的高亮块 */
  color: #fff;
  font-weight: bold;
  display: flex;
  align-items: center;
}

/* 模拟左边的箭头形状 */
.arrow-shape {
  display: inline-block;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 8px solid #4facfe; /* 蓝色箭头 */
  margin-right: 5px;
}

.icon-group {
  display: flex;
  gap: 10px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  background-color: #4a90e2;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  position: relative;
}

/* 柱状图图标模拟 */
.chart-icon {
  flex-direction: row;
  gap: 3px;
  align-items: flex-end;
  padding-bottom: 6px;
}
.bar {
  width: 4px;
  background-color: #fff;
  border-radius: 1px;
}
.b1 { height: 10px; }
.b2 { height: 16px; }
.b3 { height: 12px; }

/* 列表图标模拟 */
.list-icon {
  gap: 3px;
  padding: 8px 6px;
  box-sizing: border-box;
}
.line {
  width: 18px;
  height: 2px;
  background-color: #fff;
  border-radius: 1px;
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #e74c3c;
  color: #fff;
  font-size: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

/* 图表区域 */
.chart-area {
  flex: 1;
  position: relative;
  background-color: transparent;
}

.y-axis-title {
  position: absolute;
  top: 10px;
  left: 10px;
  color: #666;
  font-size: 12px;
  z-index: 10;
}

.x-axis-title {
  position: absolute;
  bottom: 10px;
  right: 20px;
  color: #666;
  font-size: 12px;
  z-index: 10;
}

.echarts-container {
  width: 100%;
  height: 100%;
}
</style>