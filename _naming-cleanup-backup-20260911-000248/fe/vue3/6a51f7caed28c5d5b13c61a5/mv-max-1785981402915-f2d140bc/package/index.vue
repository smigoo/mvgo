<template>
  <div class="mv-max-1785981402915-f2d140bc">
    <!-- 背景容器：Figma bg VECTOR fills solid #edf4fb + DROP_SHADOW -->
    <div class="bg-container" :style="{ backgroundImage: `url(${bg1})` }"></div>

    <!-- 标题栏：Figma header GROUP，bbox相对根容器 x=20,y=10，高度28px -->
    <div class="header">
      <div class="header-left">
        <!-- 图标：Figma g GROUP，尺寸8×8 -->
        <img :src="icon1" class="header-icon" alt="" />
        <!-- 标题文字：Figma 环境监测 TEXT，fontSize=16,fontWeight=700,渐变色 -->
        <span class="header-title">环境监测</span>
      </div>
      <!-- 分割线：Figma Vector 1476，渐变填充，高度6px -->
      <div class="header-line"></div>
    </div>

    <!-- slot-con：Figma slot-con FRAME，x=20,y=33，380×145，内容区 -->
    <div class="slot-con">
      <!-- sub-t：Figma sub-t FRAME，bbox高度32px，Tab栏固定在顶部 -->
      <div class="sub-t">
        <!-- tabs-list：Figma tabs-list GROUP，宽295×高27，背景图+渐变边框 -->
        <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
          <div
            v-for="(tab, index) in tabs"
            :key="index"
            class="tab-item"
            :class="{ 'tab-active': activeTab === index }"
            @click="handleTabChange(index)"
          >
            <!-- 激活态背景：Figma bg-tab-active，渐变填充+白色描边 -->
            <div
              v-if="activeTab === index"
              class="tab-active-bg"
              :style="{ backgroundImage: `url(${bgtabActive})` }"
            ></div>
            <span class="tab-text">{{ tab }}</span>
          </div>
        </div>

        <!-- tabs-icon：Figma tabs-icon FRAME，52×24，两个图标按钮 -->
        <div class="tabs-icon-wrap">
          <img :src="icontabsIcon" class="tabs-icon-img" alt="" />
          <!-- num：Figma num GROUP，14×14，红色圆形徽章，绝对定位于右上角 -->
          <div class="alert-badge">6</div>
        </div>
      </div>

      <!-- echarts区域：Figma @echarts/line GROUP，380×113，位于sub-t之下 -->
      <div class="chart-wrap">
        <div ref="chartRef" class="chart"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7880.png'
import icon1 from '../resources/images/g-7883.png'
import bg2 from '../resources/images/bg-7890.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'

import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// #region 2. 响应式状态
const tabs = ref(['一氧化碳', '洞内照明', '洞外光强', '能见度'])
const activeTab = ref(0)

const chartData = ref({
  xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  series: [
    {
      name: 'zk3+785CO浓度',
      data: [10, 15, 20, 25, 30, 28, 32, 35, 30, 25, 20, 15]
    }
  ],
  warningLine: 400
})

const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 3. 方法
const handleTabChange = (index) => {
  activeTab.value = index
}

const initChart = () => {
  if (!chartRef.value) return
  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)

  const option = {
    // [Layout Refine] Figma Frame 2136636709 grid：左侧Y轴标签区约20px，右侧约17px，顶部图例约28px，底部X轴标签12px
    grid: {
      left: 34,
      right: 17,
      top: 28,
      bottom: 22
    },
    xAxis: {
      type: 'category',
      data: chartData.value.xAxis,
      // [Style Refine] Figma Frame 2136636710 X轴标签文字 fills solid rgb(51,51,51), fontSize=12, Roboto
      axisLine: {
        show: false
      },
      axisLabel: {
        // [Style Refine] fills[0].color r=0.2,g=0.2,b=0.2 → rgb(51,51,51)
        color: 'rgb(51, 51, 51)',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      axisTick: { show: false },
      // [Style Refine] Figma 时 TEXT 追加在X轴末尾，color rgb(102,102,102)
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: 'rgb(102, 102, 102)',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      }
    },
    yAxis: {
      type: 'value',
      // [Style Refine] Figma 辆 TEXT fills solid r=0.4,g=0.4,b=0.4 → rgb(102,102,102)
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: 'rgb(102, 102, 102)',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        align: 'right'
      },
      axisLine: { show: false },
      axisTick: { show: false },
      // [Style Refine] Figma Y轴数值标签 fills solid r=1,g=1,b=1 → #ffffff, fontSize=9.6, Roboto
      axisLabel: {
        color: '#ffffff',
        fontSize: 9.6,
        fontFamily: 'Roboto'
      },
      // [Style Refine] Figma Frame 3/5/6/8 Line1 stroke solid r=0.741,g=0.831,b=0.910 → rgb(189,212,232)
      // Figma Frame 4 Line1 stroke solid r=0.827,g=0.184,b=0.184 → rgb(211,47,47)（预警线层，单独series处理）
      splitLine: {
        lineStyle: {
          color: 'rgb(189, 212, 232)',
          width: 0.8,
          type: 'solid'
        }
      },
      // [Layout Refine] Figma Y轴刻度值：600/400/200/0，间距约17.6px → min=0,max=600,interval=200
      min: 0,
      max: 600,
      interval: 200
    },
    // [Style Refine] Figma Frame 2136637694 图例：x=1779相对slot-con x=1495 → 偏移284px，top=4px相对chart区域
    // Figma legend HORIZONTAL，counterAxisAlignItems=CENTER，itemSpacing=16
    // [RED-LINE] legend必须生成，位置对齐Figma右上方
    legend: {
      data: [
        {
          name: 'zk3+785CO浓度',
          // [Style Refine] Rectangle 346241398 fills solid r=0.060,g=0.804,b=0.492 → rgb(15,205,125)
          icon: 'rect',
          itemStyle: { color: 'rgb(15, 205, 125)' }
        }
      ],
      // [Layout Refine] Figma Frame 2136637694 bbox x=1779,y=934 相对slot-con(1495,930)→ right对齐，top=4
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 2,
      // [Style Refine] zk3+785CO浓度 TEXT fills solid r=0.2,g=0.2,b=0.2 → rgb(51,51,51)，fontSize=9.6
      textStyle: {
        color: 'rgb(51, 51, 51)',
        fontSize: 9.6,
        fontFamily: 'Source Han Sans CN'
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartData.value.series[0].data,
        smooth: true,
        // [Style Refine] Vector 1303 stroke solid r=0.060,g=0.804,b=0.492 → rgb(15,205,125), strokeWeight=1
        lineStyle: {
          color: 'rgb(15, 205, 125)',
          width: 1
        },
        itemStyle: {
          color: 'rgb(15, 205, 125)'
        },
        symbol: 'none',
        // [Style Refine] Vector 1304 fills GRADIENT_LINEAR：stop0 rgba(15,205,125,0.4) → stop1 rgba(15,205,125,0)
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        }
      },
      {
        // [Style Refine] 预警线：Figma Frame 4 Line1 stroke solid r=0.827,g=0.184,b=0.184 → rgb(211,47,47)
        // Figma 预警线 TEXT fills solid r=0.827,g=0.184,b=0.184 → rgb(211,47,47)
        name: '预警线',
        type: 'line',
        data: Array(chartData.value.xAxis.length).fill(chartData.value.warningLine),
        lineStyle: {
          color: 'rgb(211, 47, 47)',
          width: 0.8,
          type: 'solid'
        },
        itemStyle: {
          color: 'rgb(211, 47, 47)'
        },
        symbol: 'none',
        // 预警线标注文字
        markPoint: {
          data: [
            {
              coord: [chartData.value.xAxis[chartData.value.xAxis.length - 1], chartData.value.warningLine],
              label: {
                show: true,
                formatter: '预警线',
                color: 'rgb(211, 47, 47)',
                fontSize: 12,
                fontFamily: 'Source Han Sans CN',
                position: 'insideTopRight'
              },
              symbol: 'none'
            }
          ]
        }
      }
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'transparent',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        let result = `时间: ${params[0].axisValue}时<br/>`
        params.forEach(item => {
          if (item.seriesName !== '预警线') {
            result += `${item.seriesName}: ${item.value}辆<br/>`
          }
        })
        return result
      }
    }
  }

  chartInstance.setOption(option)
}

const updateChart = () => {
  if (chartInstance) {
    initChart()
  }
}
// #endregion

// #region 4. 生命周期
onMounted(() => {
  initChart()
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (chartInstance) {
        chartInstance.resize()
      }
    })
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

// #region 5. 监听器
watch(activeTab, () => {
  updateChart()
})

watch(chartData, () => {
  updateChart()
}, { deep: true })
// #endregion
</script>

<style scoped>
/* [Layout Refine] 根容器：Figma cp-环境监测 FRAME 420×186，响应式保持100% */
.mv-max-1785981402915-f2d140bc {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* [Style Refine] 背景容器：Figma bg VECTOR fills solid r=0.929,g=0.957,b=0.984 → rgb(237,244,251)
   effects DROP_SHADOW radius=10, offset(0,4), color rgba(74,117,141,0.25)
   [RED-LINE] background-size必须用100% 100% */
.bg-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* [Style Refine] fills[0].color → rgb(237, 244, 251) */
  background-color: rgb(237, 244, 251);
  /* [RED-LINE] AUTO-FIX: background-size必须100% 100%，禁止cover/contain */
  background-size: 100% 100%;
  background-position: unset;
  /* [Style Refine] effects DROP_SHADOW radius=10, offset x=0,y=4, color r=0.291,g=0.458,b=0.551,a=0.25 → rgba(74,117,141,0.25) */
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  z-index: 0;
}

/* [Layout Refine] header：Figma header GROUP bbox x=1495,y=875，相对根容器 padding-left=20px, padding-top=10px
   高度=28px（bbox.height=28.09），flex-direction=row（横向排列标题与装饰线区域） */
.header {
  position: relative;
  /* [Layout Refine] Figma header bbox y=875，根容器y=865 → top偏移10px → padding-top:10px */
  padding: 10px 20px 0 20px;
  /* [Layout Refine] Figma header bbox height=28.09 → 固定高度28px，含padding */
  height: 38px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 1;
}

/* [Layout Refine] header-left：Figma 标题文字与图标横向排列，align-items=CENTER */
.header-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

/* [Style Refine] header-icon：Figma g GROUP，圆形装饰图标，bbox 8×8 */
.header-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  object-fit: contain;
}

/* [Style Refine] header-title：Figma 环境监测 TEXT
   typography: fontFamily=Noto Sans SC, fontSize=16, fontWeight=700, lineHeight=19.2
   fills GRADIENT_LINEAR: stop0 r=0.097,g=0.564,b=1 → rgb(25,144,255), stop1 r=0.352,g=0.495,b=1,a=0.83 → rgba(90,126,255,0.83) */
.header-title {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  background: linear-gradient(
    to bottom,
    rgb(25, 144, 255) 0%,
    rgba(90, 126, 255, 0.83) 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* [Style Refine] header-line：Figma Vector 1476 fills GRADIENT_LINEAR
   stop0: r=0.335,g=0.618,b=1,a=0.3 → rgba(85,158,255,0.3)
   stop1: r=0.333,g=0.620,b=1,a=0 → rgba(85,158,255,0)
   bbox height=6，水平渐变从左到右 */
.header-line {
  width: 100%;
  height: 6px;
  background: linear-gradient(
    to right,
    rgba(85, 158, 255, 0.3) 0%,
    rgba(85, 158, 255, 0) 100%
  );
}

/* [Layout Refine] slot-con：Figma slot-con FRAME bbox 380×145，相对根容器 left=20px(x=1495-1475)，top=33px(y=898-865)
   flex-direction=VERTICAL（默认），包含 sub-t(32px) + chart区域(113px) */
.slot-con {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  /* [Layout Refine] slot-con内部子元素纵向排列：sub-t在上，echarts在下 */
  flex-direction: column;
  padding: 0 20px 8px 20px;
  z-index: 1;
}

/* [Layout Refine] sub-t：Figma sub-t FRAME bbox 380×32，flex横向，space-between分布 */
.sub-t {
  /* [Layout Refine] Figma sub-t FRAME height=32px，固定高度 */
  height: 32px;
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  position: relative;
}

/* [Style Refine] tabs-list：Figma tabs-list GROUP
   bg VECTOR fills GRADIENT_LINEAR: stop0 rgb(181,222,255) stop1 rgb(209,236,255)
   strokes SOLID rgb(255,255,255), strokeWeight=0.72
   [RED-LINE] background-size必须100% 100% */
.tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  /* [Layout Refine] Figma tabs-list bbox 295×27，内部Tab项横向排列 */
  height: 27px;
  /* [Style Refine] bg VECTOR fills GRADIENT_LINEAR stop0 r=0.709,g=0.870,b=1 → rgb(181,222,255) */
  background: linear-gradient(
    to right,
    rgb(181, 222, 255) 0%,
    rgb(209, 236, 255) 100%
  );
  /* [RED-LINE] AUTO-FIX */
  background-size: 100% 100%;
  /* [Style Refine] strokes SOLID r=1,g=1,b=1 → rgb(255,255,255), strokeWeight=0.72 */
  border: 0.72px solid rgb(255, 255, 255);
  border-radius: 3px;
  padding: 3px;
  gap: 0;
}

/* [Layout Refine] tab-item：Figma 各Tab文字相对tabs-list均匀分布，每项宽约(295-8)/4=71.75px */
.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  /* [Layout Refine] Figma bg-tab-active bbox 78×21，tab激活项宽78px */
  padding: 4px 9px;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* [Style Refine] tab-active-bg：Figma bg-tab-active VECTOR fills GRADIENT_LINEAR
   stop0: r=0.062,g=0.600,b=0.695 → rgb(16,153,177)
   stop1: r=0.014,g=0.560,b=1 → rgb(4,143,255)
   strokes SOLID rgb(255,255,255), strokeWeight=0.6
   [RED-LINE] background-size必须100% 100% */
.tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* [Style Refine] bg-tab-active fills GRADIENT_LINEAR */
  background: linear-gradient(
    to right,
    rgb(16, 153, 177) 0%,
    rgb(4, 143, 255) 100%
  );
  /* [RED-LINE] AUTO-FIX */
  background-size: 100% 100%;
  /* [Style Refine] strokes SOLID r=1,g=1,b=1, strokeWeight=0.6 */
  border: 0.6px solid rgb(255, 255, 255);
  border-radius: 3px;
  z-index: 0;
}

/* [Style Refine] tab-text非激活态：Figma 洞内照明/洞外光强/能见度 TEXT
   fills solid r=0.173,g=0.608,b=0.918 → rgb(44,155,234)
   typography: fontFamily=Source Han Sans CN, fontSize=14, fontWeight=500 */
.tab-text {
  position: relative;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: rgb(44, 155, 234);
  z-index: 1;
  white-space: nowrap;
}

/* [Style Refine] tab激活态文字：Figma 一氧化碳 TEXT fills solid rgb(255,255,255)
   effects DROP_SHADOW offset(0,0.6), color rgb(0,111,227) */
.tab-active .tab-text {
  color: rgb(255, 255, 255);
  text-shadow: 0px 0.6px 0px rgb(0, 111, 227);
}

/* [Layout Refine] tabs-icon-wrap：Figma tabs-icon FRAME + num GROUP 组合
   tabs-icon FRAME bbox 52×24，num GROUP bbox 14×14，num相对tabs-icon右上角定位
   整体区域相对 sub-t 右对齐 */
.tabs-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* [Layout Refine] tabs-icon-img：Figma tabs-icon FRAME bbox 52×24，包含两个icon按钮 */
.tabs-icon-img {
  width: 52px;
  height: 24px;
  object-fit: contain;
  /* [RED-LINE] 图片不用background-size，保留object-fit */
  display: block;
}

/* [Style Refine] alert-badge：Figma num GROUP
   bg RECTANGLE fills solid r=0.961,g=0.247,b=0.247 → rgb(245,63,63)
   cornerRadius=29 → border-radius:29px
   bbox 14×14，绝对定位于 tabs-icon 右上角 */
.alert-badge {
  position: absolute;
  /* [Layout Refine] Figma num bbox x=1861, tabs-icon bbox x=1816+width=52=1868 → num右侧超出约7px → top=-7px,right=-7px */
  top: -7px;
  right: -7px;
  width: 14px;
  height: 14px;
  /* [Style Refine] bg fills solid r=0.961,g=0.247,b=0.247 → rgb(245,63,63) */
  background: rgb(245, 63, 63);
  /* [Style Refine] cornerRadius=29 */
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* [Style Refine] 6 TEXT fills solid rgb(255,255,255) */
  color: rgb(255, 255, 255);
  font-size: 9px;
  font-family: 'Roboto', sans-serif;
  font-weight: 500;
}

/* [Layout Refine] chart-wrap：echarts容器，flex:1撑满剩余空间 */
.chart-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* [Layout Refine] chart：echarts实际挂载节点，100%填充chart-wrap */
.chart {
  width: 100%;
  height: 100%;
}
</style>
