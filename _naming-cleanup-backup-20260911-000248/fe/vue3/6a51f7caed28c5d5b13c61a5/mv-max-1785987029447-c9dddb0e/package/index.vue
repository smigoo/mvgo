<template>
  <!-- 环境监测主组件：含标题栏、Tab切换、折线图 -->
  <div class="mv-max-1785987029447-c9dddb0e" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 标题栏区域：Figma header GROUP bbox h=28px，在总高186px中占比 -->
    <div class="panel-header">
      <!-- 标题前装饰点图标（Figma g GROUP：8×8px） -->
      <img :src="icon1" class="header-dot" alt="" />
      <!-- 标题文字：Figma "环境监测" TEXT fills GRADIENT_LINEAR -->
      <span class="header-title">环境监测</span>
      <!-- 告警数量徽标：Figma num GROUP bbox 14×14px，红底白字 -->
      <div class="header-badge">
        <span class="badge-num">6</span>
      </div>
    </div>

    <!-- 主体内容区：Figma slot-con FRAME bbox 380×145px -->
    <div class="panel-body">
      <!-- 底部 Tab + 图标 区域：Figma sub-t FRAME bbox 380×32px，置顶显示 -->
      <div class="sub-toolbar">
        <!-- Tab 列表：Figma tabs-list GROUP bbox 295×27px -->
        <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
          <div
            v-for="(tab, idx) in tabs"
            :key="tab"
            class="tab-item"
            :class="{ 'tab-item--active': activeTab === idx }"
            :style="activeTab === idx ? { backgroundImage: `url(${bgtabActive})` } : {}"
            @click="handleTabSwitch(idx)"
          >
            {{ tab }}
          </div>
        </div>

        <!-- 右侧图标按钮组：Figma tabs-icon FRAME bbox 52×24px -->
        <div class="tabs-icon-area">
          <img :src="icontabsIcon" class="tabs-icon-img" alt="视图切换" />
        </div>
      </div>

      <!-- 折线图区域：Figma @echarts/line bbox 380×113px -->
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7880.png'
import icon1 from '../resources/images/g-7883.png'
import bg2 from '../resources/images/bg-7890.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'

import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 1. Props 定义
const props = defineProps({
  chartDataList: { type: Array, default: () => [] }
})
// #endregion

// #region 2. 响应式状态
const tabs = ref(['一氧化碳', '洞内照明', '洞外光强', '能见度'])
const activeTab = ref(0)

const chartSeriesData = ref({
  0: [120, 200, 180, 240, 300, 260, 180, 150, 200, 220, 260, 310],
  1: [80, 150, 200, 170, 140, 190, 220, 260, 300, 280, 240, 200],
  2: [300, 280, 260, 320, 400, 380, 350, 310, 290, 320, 360, 340],
  3: [200, 220, 260, 300, 280, 240, 200, 180, 210, 250, 280, 300]
})

// 预警线阈值（各 Tab 对应，Figma 预警线标注在 y=975 对应数值轴400处）
const warnLineValues = ref([400, 300, 500, 350])

// X 轴时间刻度：Figma Frame 2136636710 children: 2,4,6,8,10,12,14,16,18,20,22,24
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 3. 图表配置生成
const buildChartOption = () => {
  const tabIdx = activeTab.value
  const seriesData = chartSeriesData.value[tabIdx] || []
  // [Style Refine] 预警线值对应 Figma "预警线" TEXT 在 y=975（400刻度线位置）
  const warnVal = warnLineValues.value[tabIdx] || 400

  return {
    backgroundColor: 'transparent',
    // [Layout Refine] Figma Frame 2136636709 left=1515, slot-con left=1495
    // 左侧留20px给Y轴标签，右侧留12px，顶部28px(单位标签区)，底部12px(X轴标签)
    grid: {
      left: 20,
      right: 8,
      top: 28,
      bottom: 12,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0]
        return `${p.name}时<br/>${tabs.value[tabIdx]}：${p.value}`
      },
      // [Style Refine] 保持可读性的 tooltip 样式，Figma 无 tooltip 数据，保留功能性设置
      backgroundColor: 'rgba(20,40,80,0.85)',
      borderColor: 'rgba(85,158,255,0.5)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    // [Layout Refine] Figma Frame 2136637694 legend bbox: x=1779,y=934,w=89,h=14
    // 位于图表右上方，left偏右，top对应slot-con顶部偏移4px
    legend: {
      show: true,
      top: 0,
      right: 0,
      data: [tabs.value[tabIdx]],
      // [Style Refine] "zk3+785CO浓度" TEXT fills solid rgb(51,51,51)，fontSize=9.6
      textStyle: {
        color: 'rgb(51, 51, 51)',
        fontSize: 9.6,
        fontFamily: 'Source Han Sans CN'
      },
      // [Style Refine] Rectangle 346241398 fills solid rgb(15,205,125)，14×2px
      itemWidth: 14,
      itemHeight: 2,
      // [Style Refine] Rectangle 346241398 cornerRadius=1.6
      itemStyle: {
        borderRadius: 1.6
      }
    },
    xAxis: {
      type: 'category',
      data: xAxisData.value,
      // [Style Refine] X轴线：Figma Frame 2136636709中的 Line 1 stroke rgba(189,212,232,1)
      axisLine: {
        lineStyle: {
          // rgb(176,200,222) ≈ rgba(0.69×255, 0.79×255, 0.87×255)
          color: 'rgb(176, 200, 222)',
          width: 0.8
        }
      },
      axisTick: { show: false },
      // [Style Refine] X轴标签：Figma Frame 2136636710 children TEXT fills solid rgb(51,51,51)
      // fontSize=12，fontFamily=Roboto
      axisLabel: {
        color: 'rgb(51, 51, 51)',
        fontSize: 12,
        fontFamily: 'Roboto',
        // [Layout Refine] Figma "时" TEXT 位于x轴末端右侧，用 formatter 在最后一项加"时"
        formatter: (val, idx) => val
      },
      splitLine: { show: false },
      // [Style Refine] Figma "时" TEXT 在x轴右侧外，用 nameGap 还原
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        // [Style Refine] "时" TEXT fills solid rgb(102,102,102)，fontSize=12，fontFamily=Source Han Sans CN
        color: 'rgb(102, 102, 102)',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        padding: [0, 0, 0, 4]
      }
    },
    yAxis: {
      type: 'value',
      // [Layout Refine] Figma Y轴刻度值：0,200,400,600（Frame 2136636709 rows: 0,200,400,600）
      min: 0,
      max: 600,
      interval: 200,
      // [Style Refine] Y轴标签：Figma "600"等 TEXT fills solid rgb(255,255,255)
      // fontSize=9.6，fontFamily=Roboto
      axisLabel: {
        color: 'rgb(255, 255, 255)',
        fontSize: 9.6,
        fontFamily: 'Roboto',
        formatter: (val) => String(val)
      },
      axisLine: { show: false },
      axisTick: { show: false },
      // [Style Refine] 分割线：Figma Frame 2136636709 "Line 1" stroke
      // 普通线 rgb(189,212,232)，预警线(row4) rgb(211,47,47)
      splitLine: {
        lineStyle: {
          color: 'rgb(189, 212, 232)',
          width: 0.8
        }
      },
      // [Style Refine] "辆" TEXT fills solid rgb(102,102,102)，fontSize=12，fontFamily=Source Han Sans CN
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: 'rgb(102, 102, 102)',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        align: 'right',
        padding: [0, 0, 4, 0]
      }
    },
    series: [
      {
        name: tabs.value[tabIdx],
        type: 'line',
        data: seriesData,
        smooth: true,
        // [Style Refine] Vector 1303 stroke solid rgb(15,205,125)，strokeWeight=1
        lineStyle: {
          color: 'rgb(15, 205, 125)',
          width: 1
        },
        itemStyle: { color: 'rgb(15, 205, 125)' },
        symbol: 'circle',
        symbolSize: 4,
        // [Style Refine] Vector 1304 fills GRADIENT_LINEAR:
        // stop0: rgba(15,205,125,0.4) → stop1: rgba(15,205,125,0)
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        },
        // [Style Refine] 预警线：Figma row4 "Line 1" stroke solid rgb(211,47,47)
        // "预警线" TEXT fills solid rgb(211,47,47)，fontSize=12，fontFamily=Source Han Sans CN
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgb(211, 47, 47)',
            type: 'dashed',
            width: 0.8
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: 'rgb(211, 47, 47)',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN'
          },
          data: [{ yAxis: warnVal }]
        }
      }
    ]
  }
}
// #endregion

// #region 4. 图表初始化与更新
const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value, null, { renderer: 'canvas' })
  chartInstance.setOption(buildChartOption())

  resizeObserver = new ResizeObserver(() => {
    chartInstance && chartInstance.resize()
  })
  resizeObserver.observe(chartRef.value)
}

watch(activeTab, () => {
  if (chartInstance) {
    chartInstance.setOption(buildChartOption(), { notMerge: false })
  }
})
// #endregion

// #region 5. 交互处理
const handleTabSwitch = (idx) => {
  activeTab.value = idx
}
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  await nextTick()
  initChart()
})

onUnmounted(() => {
  if (resizeObserver && chartRef.value) {
    resizeObserver.unobserve(chartRef.value)
  }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// [Layout Refine] 根容器：width/height 100%，flex column，背景来自 Figma bg VECTOR
// [Style Refine] bg VECTOR fills solid rgb(237,244,251)；effects DROP_SHADOW y=4,radius=10
// color: rgba(74,117,141,0.25) ≈ rgb(0.291×255,0.458×255,0.551×255) = rgb(74,117,141)
.mv-max-1785987029447-c9dddb0e {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* [AUTO-FIX] bg-size 必须使用 100% 100%，禁止 cover/contain */
  background-size: 100% 100%
  /* [Style Refine] bg VECTOR fills solid: rgb(237,244,251) 作为兜底背景色 */
  background-color: rgb(237, 244, 251);
  /* [Style Refine] bg VECTOR effects DROP_SHADOW: offset(0,4), radius=10,
     color rgba(74,117,141,0.25) */
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  overflow: hidden;
  position: relative;
}

// [Layout Refine] panel-header：Figma header GROUP bbox h=28px
// 从总高186px中，header 上边距 y=875-865=10px，header 高度28px
// 占比 (10+28)/186 ≈ 20.4%，使用固定高度更精准
// [Style Refine] header 内部横向排列，align-items: center 对齐装饰点与文字
.panel-header {
  /* [Layout Refine] Figma header GROUP bbox height=28px，padding top=10px（875-865）left=20px（1495-1475）*/
  height: 38px;
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  padding: 0 20px 0 20px;
  padding-bottom: 5px;
  gap: 6px;
  position: relative;

  // [Style Refine] Vector 1484 stroke GRADIENT_LINEAR → 渐变分割线伪元素
  // Vector 1476 fills GRADIENT_LINEAR stops: rgba(85,158,255,0.3)→rgba(85,158,255,0)
  &::after {
    content: '';
    position: absolute;
    /* [Layout Refine] Vector 1476 left offset: 1502-1495=7px from slot-con left，
       相对根容器: 1502-1475=27px，width=362px */
    left: 27px;
    bottom: 0;
    width: calc(100% - 27px - 20px);
    height: 6px;
    /* [Style Refine] Vector 1476 fills GRADIENT_LINEAR:
       stop0 rgba(85,158,255,0.3)，stop1 rgba(85,158,255,0) */
    background: linear-gradient(90deg, rgba(85, 158, 255, 0.3) 0%, rgba(85, 158, 255, 0) 100%);
    pointer-events: none;
  }
}

// [Style Refine] header-dot：Figma g GROUP bbox 8×8px（圆形装饰图标）
.header-dot {
  /* [Layout Refine] Figma g GROUP bbox: w=8,h=8，与文字基线对齐 */
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  object-fit: contain;
  /* [Layout Refine] g GROUP y=895，"环境监测" TEXT y=875，差值20px；
     header bottom padding=5px，图标上移对齐文字中线 */
  margin-bottom: 2px;
}

// [Style Refine] header-title：Figma "环境监测" TEXT
// fills GRADIENT_LINEAR stops:
//   stop0 rgb(25,144,255) = rgb(0.097×255,0.564×255,1×255) ≈ rgb(25,144,255)
//   stop1 rgba(90,126,255,0.83) = rgb(0.352×255,0.495×255,1×255) ≈ rgb(90,126,255)
// fontSize=16，fontWeight=700，fontFamily=Noto Sans SC，lineHeight=19.2
.header-title {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  /* [Style Refine] fills GRADIENT_LINEAR: rgb(25,144,255) → rgb(90,126,255) */
  background: linear-gradient(90deg, rgb(25, 144, 255) 0%, rgba(90, 126, 255, 0.83) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex: 1;
}

// [Style Refine] header-badge：Figma num GROUP bbox 14×14px
// bg RECTANGLE fills solid rgb(245,63,63)，cornerRadius=29
.header-badge {
  /* [Layout Refine] Figma num GROUP bbox: w=14,h=14，position relative to header */
  width: 14px;
  height: 14px;
  /* [Style Refine] bg RECTANGLE cornerRadius=29 */
  border-radius: 29px;
  /* [Style Refine] bg RECTANGLE fills solid: rgb(0.961×255,0.247×255,0.247×255) = rgb(245,63,63) */
  background: rgb(245, 63, 63);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  /* [Layout Refine] num GROUP y=898，header GROUP y=875，相对偏移23px，在header顶部对齐 */
  align-self: flex-start;

  .badge-num {
    /* [Style Refine] "6" TEXT fills solid rgb(255,255,255)，fontSize=12，fontWeight=500
       fontFamily=PingFang SC，lineHeight=14 */
    font-family: 'PingFang SC', sans-serif;
    font-size: 12px;
    font-weight: 500;
    line-height: 14px;
    color: rgb(255, 255, 255);
  }
}

// [Layout Refine] panel-body：Figma slot-con FRAME bbox 380×145px
// 占根容器剩余高度，flex column
.panel-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* [Layout Refine] slot-con left=1495，根容器 left=1475，padding left=20px
     slot-con right=1495+380=1875，根容器 right=1475+420=1895，padding right=