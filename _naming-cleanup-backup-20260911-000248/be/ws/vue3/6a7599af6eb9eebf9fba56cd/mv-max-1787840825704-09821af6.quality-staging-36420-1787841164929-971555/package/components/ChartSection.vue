<template>
  <!-- 图表展示区根容器，应用背景图 bg2 -->
  <div class="chart-section-root" :style="{ backgroundImage: `url(${bg2})` }">
    <!-- 顶部控制栏：视图切换与通知角标 -->
    <div class="chart-header">
      <div class="chart-header-controls">
        <!-- 视图切换按钮组 -->
        <div class="view-toggle">
          <div 
            :class="['view-btn', { active: viewMode === 'chart' }]" 
            @click="handleViewChange('chart')"
          >
            <img :src="icon1" class="view-icon" alt="图表视图" />
          </div>
          <div 
            :class="['view-btn', { active: viewMode === 'list' }]" 
            @click="handleViewChange('list')"
          >
            <img :src="icon2" class="view-icon" alt="列表视图" />
          </div>
        </div>
        <!-- 通知角标 -->
        <div class="notification-badge">8</div>
      </div>
    </div>

    <!-- 图表主体区域 -->
    <div class="chart-body">
      <!-- 图表元信息/图例区 -->
      <div class="chart-meta">
        <span class="y-unit">辆</span>
        <div class="chart-legend">
          <div class="legend-item">
            <span class="legend-line legend-line--co"></span>
            <span class="legend-text">zk3+785CO浓度</span>
          </div>
          <div class="legend-item">
            <span class="legend-line legend-line--warning"></span>
            <span class="legend-text">预警线</span>
          </div>
        </div>
        <span class="x-unit">时</span>
      </div>

      <!-- ECharts 图表容器 -->
      <div class="chart-container" ref="chartRef"></div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

/**
 * ChartSection - 环境监测图表展示区子组件
 * 负责渲染面积图表、图例信息、预警线标注，以及右上角的视图切换和通知角标。
 * 接收父组件传入的 viewMode 控制视图状态，chartData 驱动图表数据更新。
 */
import { ref, onMounted, onUnmounted, nextTick, computed, watch} from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
const props = defineProps({
  // 当前视图模式：'chart' 图表视图 | 'list' 列表视图
  viewMode: { type: String, default: 'chart' },
  // 图表数据，由 API 绑定注入
  chartData: { type: Array, default: () => [] }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['view-change'])
// #endregion

// #region 3. 响应式状态
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 默认模拟数据（当 API 未注入数据时使用，呈现波动趋势，12-16时段有峰值）
const defaultChartData = ref([5, 8, 12, 15, 18, 25, 35, 38, 32, 20, 15, 10])

// 计算实际渲染的图表数据
const seriesData = computed(() => {
  return props.chartData && props.chartData.length > 0 ? props.chartData : defaultChartData.value
})
// #endregion

// #region 4. 方法
// 处理视图切换点击
const handleViewChange = (mode) => {
  if (props.viewMode !== mode) {
    emit('view-change', mode)
  }
}

// 初始化 ECharts 实例
const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  updateChart()
  
  // 挂载 ResizeObserver 监听容器尺寸变化，确保图表自适应
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

// 更新图表配置
const updateChart = () => {
  if (!chartInstance) return
  
  const option = {
    // 配置基础 tooltip，悬停显示详情
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#559eff',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      formatter: (params) => {
        const data = params[0]
        return `${data.name}时<br/>${data.seriesName}: ${data.value} 辆`
      }
    },
    // 网格布局，留出轴单位和图例的空间
    grid: {
      top: 20,
      right: 30,
      bottom: 20,
      left: 30,
      containLabel: true
    },
    // X轴：时间刻度 2-24
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    // Y轴：浓度值 0-40
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: seriesData.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { color: '#559eff', width: 2 },
        itemStyle: { color: '#559eff' },
        // 面积图填充半透明蓝色渐变
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(85, 158, 255, 0.4)' },
            { offset: 1, color: 'rgba(85, 158, 255, 0.05)' }
          ])
        },
        // 红色虚线标注预警线（值为30）
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f53f3f', type: 'dashed', width: 1.5 },
          data: [
            { yAxis: 30, label: { show: false } }
          ]
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
}
// #endregion

// #region 5. 监听器
// 监听 chartData 变化，联动刷新图表数据
watch(() => props.chartData, () => {
  updateChart()
}, { deep: true })
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  // 必须等待 DOM 更新且 flex 布局 settle 后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理 ResizeObserver 和 ECharts 实例，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 图表展示区根容器
.chart-section-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 8px 12px;
  box-sizing: border-box;
  
  // 顶部控制栏
  .chart-header {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 4px;
    
    .chart-header-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      
      // 视图切换按钮组
      .view-toggle {
        display: flex;
        gap: 8px;
        
        .view-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.4;
          transition: all 0.3s ease;
          border-radius: 4px;
          
          // 选中态高亮
          &.active {
            opacity: 1;
            background: rgba(85, 158, 255, 0.1);
          }
          
          .view-icon {
            width: 18px;
            height: 18px;
            object-fit: contain;
          }
        }
      }
      
      // 通知角标
      .notification-badge {
        width: 14px;
        height: 14px;
        background: #f53f3f;
        border-radius: 50%;
        color: #ffffff;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
        line-height: 1;
      }
    }
  }
  
  // 图表主体区域
  .chart-body {
    flex: 1;
    min-height: 0; // flex 子项关键属性，防止内容撑破容器;
    display: flex;
    flex-direction: column;
    
    // 图表元信息/图例区
    .chart-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
      margin-bottom: 4px;
      
      .y-unit, .x-unit {
        font-size: 12px;
        color: #666666;
        font-family: 'Source Han Sans CN', sans-serif;
      }
      
      .chart-legend {
        display: flex;
        gap: 16px;
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          
          .legend-line {
            width: 14px;
            height: 2px;
            
            // CO浓度图例线条
            &--co {
              background: #559eff;
            }
            
            // 预警线图例虚线
            &--warning {
              background: transparent;
              border-top: 1.5px dashed #f53f3f;
              height: 0;
            }
          }
          
          .legend-text {
            font-size: 10px;
            color: #333333;
            font-family: 'Source Han Sans CN', sans-serif;
          }
        }
      }
    }
    
    // ECharts 图表容器
    .chart-container {
      flex: 1;
      min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */; // 关键属性，让 flex 自然拉伸;
      width: 100%;
    }
  }
}</style>