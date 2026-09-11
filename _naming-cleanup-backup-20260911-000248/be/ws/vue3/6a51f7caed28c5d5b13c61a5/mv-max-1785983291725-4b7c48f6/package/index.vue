<template>
  <!-- 环境监测主组件：展示环境监测折线图，支持 Tab 切换（一氧化碳/洞内照明/洞外光强/能见度） -->
  <!--
    [Layout Refine] 根容器 Figma FRAME 420×186，纵向排列
    bg节点: fills SOLID rgb(237,244,251), DROP_SHADOW offset(0,4) radius=10
    内边距从 Figma bbox 推算: header x=1495 → left offset=20; y=875 → top offset=10
  -->
  <div class="mv-max-1785983291725-4b7c48f6" :style="{ backgroundImage: `url(${bg1})` }">

    <!--
      [Layout Refine] header GROUP bbox: x=1495,y=875,w=377,h=28
      → position relative to root: left=20px(1495-1475), top=10px(875-865)
      内含: 标题文字 + 装饰圆点(g) + 分隔线(Vector 1476/1484)
    -->
    <div class="env-header">
      <div class="env-header__left">
        <!--
          [Layout Refine] g GROUP bbox 8×8, 位于 header 底部 (y=895 相对 root y=865 → top≈30)
          实际是装饰性图标，用 img 渲染
        -->
        <span class="env-header__dot-wrap">
          <img :src="icon1" class="env-header__dot" alt="" />
        </span>
        <!--
          [Style Refine] 环境监测 TEXT typography: Noto Sans SC 16px/700 lineHeight=19.2px
          fills GRADIENT_LINEAR: stop0 rgb(25,144,255) → stop1 rgba(90,126,255,0.83)
        -->
        <span class="env-header__title">环境监测</span>
      </div>
    </div>

    <!--
      [Layout Refine] slot-con FRAME bbox: x=1495,y=898,w=380,h=145
      → top offset from root: 898-865=33px; 内部纵向排列
      子节点顺序（按 Figma bbox y 排序）: sub-t(y=898) → @echarts/line(y=930)
    -->
    <div class="env-content">
      <!--
        [Layout Refine] sub-t FRAME bbox: x=1495,y=898,w=380,h=32
        → flex-shrink:0, height=32px
        内部横向: tabs-list(w=295,h=27) + tabs-icon(w=52,h=24) + num(w=14,h=14)
      -->
      <div class="env-sub-tabs">
        <!--
          [Layout Refine] tabs-list GROUP bbox: x=1495,y=903,w=295,h=27
          [Style Refine] bg VECTOR fills GRADIENT_LINEAR stop0 rgb(181,222,255) stop1 rgb(210,236,255)
          stroke 0.72px solid #fff
          [AUTO-FIX] background-size: 100% 100%
        -->
        <div
          class="env-tabs-list"
          :style="{ backgroundImage: `url(${bg2})` }"
        >
          <div
            v-for="(tab, idx) in tabs"
            :key="tab.key"
            class="env-tab-item"
            :class="{ 'env-tab-item--active': activeTab === idx }"
            :style="activeTab === idx ? { backgroundImage: `url(${bgtabActive})` } : {}"
            @click="handleTabChange(idx)"
          >
            {{ tab.label }}
          </div>
        </div>

        <!--
          [Layout Refine] tabs-icon FRAME bbox: x=1816,y=905,w=52,h=24
          + num GROUP bbox: x=1861,y=898,w=14,h=14
          横向排列，align-items: center
        -->
        <div class="env-tabs-icons">
          <div class="env-tabs-icon-wrap">
            <img :src="icontabsIcon" class="env-tabs-icon" alt="tabs-icon" />
          </div>
          <!--
            [Style Refine] num/bg RECTANGLE fills SOLID rgb(245,63,63), cornerRadius=29
            num/6 TEXT: PingFang SC 12px/500 color #fff lineHeight=14px
          -->
          <div class="env-badge">
            <span class="env-badge__num">6</span>
          </div>
        </div>
      </div>

      <!--
        [Layout Refine] @echarts/line GROUP bbox: x=1495,y=930,w=380,h=113
        → flex:1, min-height:0, 图表容器撑满剩余空间
        Figma 中 sub-t h=32, echarts h=113, 总 slot-con h=145
        比例: sub-t flex-shrink:0 32px, echarts flex:1
      -->
      <div ref="chartRef" class="env-chart"></div>
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

// #region 1. Tab 数据
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'light-in', label: '洞内照明' },
  { key: 'light-out', label: '洞外光强' },
  { key: 'visibility', label: '能见度' }
])
const activeTab = ref(0)
// #endregion

// #region 2. 图表数据
const chartDataMap = ref({
  co: [120, 200, 280, 350, 420, 380, 300, 250, 180, 140, 160, 220],
  'light-in': [80, 150, 220, 300, 260, 200, 180, 140, 100, 90, 110, 160],
  'light-out': [200, 320, 400, 480, 520, 460, 380, 300, 240, 200, 180, 220],
  visibility: [300, 280, 340, 420, 460, 400, 360, 300, 250, 200, 230, 280]
})

// x 轴时间刻度：2, 4, 6, ... 24（对应 Figma Frame 2136636710 子节点）
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
// #endregion

// #region 3. 图表实例
const chartRef = ref(null)
let chartInstance = null

/*
 * [Style Refine] ECharts option 精修
 * - grid: 对应 Figma Frame 2136636709 bbox x=1515,y=958 相对 echarts区域 x=1495,y=930
 *   → left = 1515-1495 = 20px (含 y轴文字 "40 30 20 10 0" bbox w=14 + 辆 w=12 → left≈20)
 *   → bottom 对应 Frame 2136636710 y=1031, echarts底 = 930+113=1043 → bottom=1043-1031=12
 *   → right: 图表右侧到容器右侧 = (1495+380)-(1515+346) = 1875-1861=14px
 *   → top: Frame 2136636709 y=958 相对 echarts y=930 → 28px，但辆/预警线文字在y=930,所以top≈28
 * - xAxis label: Roboto 12px color rgb(51,51,51) → Figma "2"..."24" fills rgb(51,51,51)
 * - yAxis label: Roboto 9.6px color #fff → Figma "600/400/200/0" fills rgb(255,255,255)
 * - splitLine: 普通线 rgb(189,212,232), 预警线 rgb(211,47,47) dashed
 * - series line: stroke rgb(15,205,125) w=1; area: LinearGradient rgba(15,205,125,0.4)→rgba(15,205,125,0)
 * - legend: Frame 2136637694 bbox x=1779,y=934 相对容器 → top=4, right=0
 *   Rectangle 346241398 fill rgb(15,205,125) w=14,h=2; text rgb(51,51,51) Source Han Sans CN 9.6px
 * - markLine 预警线: y=400对应 Figma "400" row线 → color rgb(211,47,47), label "预警线"
 */
const buildChartOption = () => {
  const tabKey = tabs.value[activeTab.value].key
  const data = chartDataMap.value[tabKey] || []
  return {
    // [Layout Refine] grid 从 Figma bbox 推算
    grid: {
      top: 28,
      bottom: 12,
      left: 20,
      right: 14,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0]
        return `${p.axisValue}时<br/>${tabs.value[activeTab.value].label}：${p.value}`
      }
    },
    // [Style Refine] legend 对应 Frame 2136637694 bbox: x=1779,y=934 w=89,h=14
    // 相对 echarts 容器(x=1495,y=930): left=1779-1495=284, top=934-930=4
    // Rectangle fill rgb(15,205,125) w=14 h=2; text "zk3+785CO浓度" Source Han Sans CN 9.6px rgb(51,51,51)
    legend: {
      show: true,
      top: 4,
      right: 0,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        // [Style Refine] zk3+785CO浓度 TEXT fills SOLID rgb(51,51,51)
        color: 'rgb(51, 51, 51)',
        fontSize: 9.6,
        fontFamily: 'Source Han Sans CN'
      },
      data: [{ name: 'zk3+785CO浓度', icon: 'rect' }]
    },
    xAxis: {
      type: 'category',
      data: xAxisData.value,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      // [Style Refine] Frame 2136636710 子 TEXT fills SOLID rgb(51,51,51), Roboto 12px
      axisLabel: {
        color: 'rgb(51, 51, 51)',
        fontSize: 12,
        fontFamily: 'Roboto',
        lineHeight: 12
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 600,
      // [Style Refine] Frame 2136636709 5条横线间距: 17.6px → interval对应数值150
      interval: 150,
      axisLabel: {
        // [Style Refine] yAxis label "600/400/200/0" TEXT fills SOLID rgb(255,255,255), Roboto 9.6px
        color: 'rgb(255, 255, 255)',
        fontSize: 9.6,
        fontFamily: 'Roboto',
        align: 'right'
      },
      // [Style Refine] 普通辅助线: Line 1 stroke SOLID rgb(189,212,232) w=0.8
      // 预警线(row "4"对应400): stroke SOLID rgb(211,47,47) w=0.8 → 用 markLine 处理，splitLine 仅显示普通线
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgb(189, 212, 232)',
          width: 0.8,
          type: 'solid'
        }
      },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: false,
        // [Style Refine] Vector 1304 fills GRADIENT_LINEAR:
        // stop0 rgba(15,205,125,0.4) stop1 rgba(15,205,125,0)
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        },
        // [Style Refine] Vector 1303 strokes SOLID rgb(15,205,125) strokeWeight=1
        lineStyle: {
          color: 'rgb(15, 205, 125)',
          width: 1
        },
        itemStyle: { color: 'rgb(15, 205, 125)' },
        symbol: 'none'
      },
      // [Style Refine] 预警线 markLine: y=400
      // 对应 row "4" Line 1 stroke SOLID rgb(211,47,47) w=0.8
      // label "预警线" TEXT fills SOLID rgb(211,47,47) Source Han Sans CN 12px
      {
        name: '预警线',
        type: 'line',
        data: [],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgb(211, 47, 47)',
            width: 0.8,
            type: 'solid'
          },
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: 'rgb(211, 47, 47)',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN'
          },
          data: [{ yAxis: 400 }]
        }
      }
    ]
  }
}

const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(buildChartOption())
}

const refreshChart = () => {
  if (!chartInstance) return
  chartInstance.setOption(buildChartOption(), { notMerge: false })
}

watch(activeTab, () => {
  refreshChart()
})

let resizeObserver = null
const handleResize = () => {
  chartInstance && chartInstance.resize()
}
// #endregion

// #region 4. 事件处理
const handleTabChange = (idx) => {
  activeTab.value = idx
}
// #endregion

// #region 5. 生命周期
onMounted(async () => {
  await nextTick()
  initChart()
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(chartRef.value)
  }
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/*
 * [Layout Refine] 根容器 Figma FRAME 420×186
 * width/height: 100% (由预览 iframe aspect-ratio 维护)
 * flex-direction: column (纵向: header + content)
 * [Style Refine] bg VECTOR fills SOLID rgb(237,244,251)
 * [Style Refine] DROP_SHADOW offset(0,4) radius=10 rgb(74,117,141,0.25)
 * [AUTO-FIX] background-size: 100% 100%
 */
.mv-max-1785983291725-4b7c48f6 {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* [Style Refine] bg fills SOLID: r=0.929→237, g=0.957→244, b=0.984→251 */
  background-color: rgb(237, 244, 251);
  /* [AUTO-FIX] 严禁 cover/contain，必须 100% 100% */
  background-size: 100% 100%;
  background-position: left top;
  /* [Style Refine] DROP_SHADOW: offset(0,4) radius=10 color rgb(74,117,141) alpha=0.25 */
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  overflow: hidden;
  box-sizing: border-box;
  /* [Layout Refine] 内边距从 Figma bbox 推算:
     header x=1495→left=20; y=875→top=10; slot-con bottom=1043, root bottom=1051→bottom=8; right=1875,root right=1895→right=20 */
  padding: 10px 20px 8px 20px;
  position: relative;
}

/*
 * [Layout Refine] header GROUP bbox: w=377, h=28
 * 横向排列: 标题文字(左) + 分隔线(右)
 * flex-shrink: 0, height 固定 28px
 */
.env-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  /* [Layout Refine] header h=28.09px */
  height: 28px;
  flex-shrink: 0;
  position: relative;
}

.env-header__left {
  display: flex;
  flex-direction: row;
  align-items: center;
  /* [Layout Refine] g(icon) w=8 + 间距 + title，g bbox x=1496 title x=1495 → icon在title左侧约6px */
  gap: 6px;
}

/*
 * [Layout Refine] g GROUP bbox: 8×8px
 */
.env-header__dot-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
}

.env-header__dot {
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex-shrink: 0;
}

/*
 * [Style Refine] 环境监测 TEXT:
 * typography: Noto Sans SC, 16px, weight=700, lineHeight=19.2px
 * fills GRADIENT_LINEAR:
 *   stop0 rgb(25,144,255) pos=0 → r=0.097→25, g=0.564→144, b=1.0→255
 *   stop1 rgba(90,126,255,0.83) pos=1 → r=0.352→90, g=0.495→126, b=1→255, a=0.83
 * Figma gradient 方向为 vertical (从上到下) → 180deg
 */
.env-header__title {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  /* [Style Refine] GRADIENT_LINEAR vertical 180deg */
  background: linear-gradient(180deg, rgb(25, 144, 255) 0%, rgba(90, 126, 255, 0.83) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/*
 * [Layout Refine] slot-con FRAME bbox: w=380, h=145
 * flex:1, min-height:0, 纵向排列
 */
.env-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
}

/*
 * [Layout Refine] sub-t FRAME bbox: w=380, h=32
 * 横向排列: tabs-list(flex:1) + tabs-icons(flex-shrink:0)
 */
.env-sub-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 32px;
  flex-shrink: 0;
}

/*
 * [Layout Refine] tabs-list GROUP bbox: w=295, h=27
 * [AUTO-FIX] background-size: 100% 100%
 */
.env-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex: 1;
  height: 27px;
  background-size: 100% 100%;
  background-position: left top;
  background-repeat: no-repeat;
  overflow: hidden;
}

/*
 * [Style Refine] tab item TEXT: Source Han Sans CN 12px rgb(51,51,51)
 * active tab: bg-tab-active background, color rgb(25,144,255) or white
 */
.env-tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Source Han Sans CN', 'PingFang SC', sans-serif;
  font-size: 12px;
  color: rgb(51, 51, 51);
  cursor: pointer;
  background-size: 100% 100%;
  background-position: left top;
  background-repeat: no-repeat;
  user-select: none;
}

.env-tab-item--active {
  color: rgb(25, 144, 255);
  font-weight: 500;
}

/*
 * [Layout Refine] tabs-icons: tabs-icon(w=52,h=24) + num(w=14,h=14)
 * 横向排列，align-items: center
 */
.env-tabs-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  margin-left: 4px;
  position: relative;
}

.env-tabs-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 24px;
}

.env-tabs-icon {
  width: 52px;
  height: 24px;
  object-fit: contain;
}

/*
 * [Style Refine] num/bg RECTANGLE fills SOLID rgb(245,63,63), cornerRadius=29
 * num/6 TEXT: PingFang SC 12px/500 color #fff lineHeight=14px
 */
.env-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background-color: rgb(245, 63, 63);
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.env-badge__num {
  font-family: 'PingFang SC', sans-serif;
  font-size: 9px;
  font-weight: 500;
  color: #fff;
  line-height: 14px;
}

/*
 * [Layout Refine] @echarts/line GROUP bbox: w=380, h=113
 * flex:1, min-height:0
 */
.env-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>
