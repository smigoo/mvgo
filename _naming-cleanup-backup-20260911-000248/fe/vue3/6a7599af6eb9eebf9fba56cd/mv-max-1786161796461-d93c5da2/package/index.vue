<template>
  <div class="mv-max-1786161796461-d93c5da2" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 顶部标题与统计区 -->
    <div class="header-section">
      <div class="header-left">
        <div class="title-decorator">
          <span class="decorator-dot"></span>
          <span class="decorator-line"></span>
        </div>
        <div class="title-text">设备监测</div>
        <div class="update-tip">*数据实时更新</div>
      </div>
      <div class="header-stats">
        <div class="stat-item">
          <span class="stat-label">设备类型</span>
          <span class="stat-value stat-value--primary">28</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">设备总数</span>
          <span class="stat-value stat-value--primary">68562</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">完好率</span>
          <span class="stat-value stat-value--success">98%</span>
        </div>
        <img :src="icon2" class="header-icon" />
      </div>
    </div>

    <!-- 内容区 -->
    <div class="content-section" :style="{ backgroundImage: `url(${bg2})` }">
      <!-- 区域设备统计切换卡片 -->
      <div class="switch-section">
        <div
          v-for="(card, idx) in areaCards"
          :key="card.name"
          :class="['area-card', { 'area-card--active': activeArea === idx }]"
          :style="{ backgroundImage: `url(${idx === 0 ? bg3 : bg9})` }"
          @click="activeArea = idx"
        >
          <div class="area-card__row">
            <img :src="card.icon" class="area-card__icon" />
            <div class="area-card__total">
              <span class="area-card__total-label">总 数:</span>
              <span class="area-card__total-value">{{ card.total }}</span>
            </div>
          </div>
          <div class="area-card__row">
            <span class="area-card__name">{{ card.name }}</span>
            <span class="area-card__error">异常数:{{ card.error }}</span>
          </div>
        </div>
      </div>

      <!-- 设备分类与列表 -->
      <div class="device-section">
        <!-- 左侧分类导航 -->
        <div class="sidebar-tabs">
          <div class="sidebar-count">3/3740</div>
          <div
            v-for="(tab, idx) in categoryTabs"
            :key="tab.name"
            :class="['sidebar-tab', { 'sidebar-tab--active': activeCategory === idx }]"
            :style="getTabBgStyle(idx)"
            @click="activeCategory = idx"
          >
            <span class="sidebar-tab__text">{{ tab.name }}</span>
            <span v-if="tab.badge" class="sidebar-tab__badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="device-grid">
          <div
            v-for="(device, idx) in currentDevices"
            :key="device.name"
            class="device-card"
            :style="{ backgroundImage: `url(${device.bg})` }"
          >
            <img :src="device.icon" class="device-card__icon" />
            <div class="device-card__info">
              <div class="device-card__name">{{ device.name }}</div>
              <div :class="['device-card__value', { 'device-card__value--error': device.abnormal > 0 }]">
                ({{ device.abnormal }}/{{ device.total }})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-8418.png', import.meta.url).href
const icon2 = new URL('../resources/images/Frame-8856.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-8788.png', import.meta.url).href
const bg3 = new URL('../resources/images/bg-8807.png', import.meta.url).href
const bg9 = new URL('../resources/images/bg-8439.png', import.meta.url).href
const bg20 = new URL('../resources/images/bg-8759.png', import.meta.url).href
const icon1 = new URL('../resources/images/g-8421.png', import.meta.url).href
const icon16 = new URL('../resources/images/icon-8764.png', import.meta.url).href
const icon3 = new URL('../resources/images/icon-8798.png', import.meta.url).href
const icon4 = new URL('../resources/images/icon-8817.png', import.meta.url).href
const icon7 = new URL('../resources/images/icon-8503.png', import.meta.url).href
const bg10 = new URL('../resources/images/bg-8468.png', import.meta.url).href
const icon8 = new URL('../resources/images/icon-8532.png', import.meta.url).href
const bg11 = new URL('../resources/images/bg-8498.png', import.meta.url).href
const icon9 = new URL('../resources/images/icon-8561.png', import.meta.url).href
const bg12 = new URL('../resources/images/bg-8527.png', import.meta.url).href
const icon10 = new URL('../resources/images/icon-8590.png', import.meta.url).href
const bg13 = new URL('../resources/images/bg-8556.png', import.meta.url).href
const icon11 = new URL('../resources/images/icon-8619.png', import.meta.url).href
const bg14 = new URL('../resources/images/bg-8585.png', import.meta.url).href
const icon12 = new URL('../resources/images/icon-8648.png', import.meta.url).href
const bg15 = new URL('../resources/images/bg-8614.png', import.meta.url).href
const icon13 = new URL('../resources/images/icon-8677.png', import.meta.url).href
const bg16 = new URL('../resources/images/bg-8643.png', import.meta.url).href
const icon14 = new URL('../resources/images/icon-8706.png', import.meta.url).href
const bg17 = new URL('../resources/images/bg-8672.png', import.meta.url).href
const icon15 = new URL('../resources/images/icon-8735.png', import.meta.url).href
const bg18 = new URL('../resources/images/bg-8701.png', import.meta.url).href
const bg19 = new URL('../resources/images/bg-8730.png', import.meta.url).href
const icon5 = new URL('../resources/images/icon-8444.png', import.meta.url).href
const icon6 = new URL('../resources/images/icon-8473.png', import.meta.url).href
import { ref, computed} from 'vue'

// 资源变量由系统自动注入
// bg1~bg20, icon1~icon16

// 当前选中的区域卡片索引（0=隧道设备，1=南北接线设备）
const activeArea = ref(0)

// 当前选中的分类导航索引
const activeCategory = ref(0)

// 区域统计卡片数据
const areaCards = ref([
  { name: '隧道设备', total: '56302', error: 5, icon: icon3 },
  { name: '南北接线设备', total: '1280', error: 3, icon: icon4 }
])

// 左侧分类导航
const categoryTabs = ref([
  { name: '监控' },
  { name: '照明', badge: '3' },
  { name: '通风' },
  { name: '供配电' },
  { name: '消防' },
  { name: '交通诱导' }
])

// 各分类对应的设备列表数据
const deviceDataMap = {
  0: [
    { name: '摄像机', abnormal: 2, total: 484, icon: icon7, bg: bg10 },
    { name: '风速风向仪', abnormal: 1, total: 484, icon: icon8, bg: bg11 },
    { name: '超高检测器', abnormal: 0, total: 484, icon: icon9, bg: bg12 },
    { name: '烟道机器人', abnormal: 0, total: 484, icon: icon10, bg: bg13 },
    { name: '激光雷达', abnormal: 0, total: 484, icon: icon11, bg: bg14 },
    { name: 'CO₂传感器', abnormal: 0, total: 484, icon: icon12, bg: bg15 },
    { name: 'CO/VI检测器', abnormal: 0, total: 484, icon: icon13, bg: bg16 },
    { name: '温湿度传感器', abnormal: 0, total: 484, icon: icon14, bg: bg17 },
    { name: '压力传感器', abnormal: 0, total: 484, icon: icon15, bg: bg18 },
    { name: '光照度变送器', abnormal: 0, total: 484, icon: icon16, bg: bg19 },
    { name: '紧急电话', abnormal: 0, total: 484, icon: icon5, bg: bg20 },
    { name: '水质监测设备', abnormal: 0, total: 484, icon: icon6, bg: bg10 }
  ],
  1: [
    { name: '隧道灯', abnormal: 1, total: 320, icon: icon7, bg: bg10 },
    { name: '应急灯', abnormal: 2, total: 180, icon: icon8, bg: bg11 },
    { name: '指示灯', abnormal: 0, total: 260, icon: icon9, bg: bg12 }
  ],
  2: [
    { name: '射流风机', abnormal: 0, total: 96, icon: icon10, bg: bg13 },
    { name: '轴流风机', abnormal: 0, total: 48, icon: icon11, bg: bg14 }
  ],
  3: [
    { name: '变压器', abnormal: 0, total: 24, icon: icon12, bg: bg15 },
    { name: '配电箱', abnormal: 0, total: 120, icon: icon13, bg: bg16 }
  ],
  4: [
    { name: '灭火器', abnormal: 0, total: 560, icon: icon14, bg: bg17 },
    { name: '消防栓', abnormal: 0, total: 280, icon: icon15, bg: bg18 }
  ],
  5: [
    { name: '可变情报板', abnormal: 0, total: 36, icon: icon16, bg: bg19 },
    { name: '车道指示器', abnormal: 0, total: 72, icon: icon5, bg: bg20 }
  ]
}

// 根据当前分类获取设备列表
const currentDevices = computed(() => {
  return deviceDataMap[activeCategory.value] || deviceDataMap[0]
})

// 获取侧边栏 tab 背景样式
const getTabBgStyle = (idx) => {
  if (activeCategory.value === idx) {
    return { background: 'linear-gradient(270deg, #318aff 0%, #70bfff 100%)' }
  }
  return {}
}
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器：铺满父级，浅蓝灰背景 + 阴影
/* [Layout Refine] Figma bbox padding: top:8, right:12, bottom:3, left:20 */
/* [Style Refine] fills[0].color → rgb(237, 244, 251) */
/* [Style Refine] effects[0] → box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25) */
/* [Style Refine] 删除无依据的 border-radius: 8px */
.mv-max-1786161796461-d93c5da2 {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: rgb(237, 244, 251);
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  overflow: hidden;
  padding: 8px 12px 3px 20px;
  box-sizing: border-box;
  gap: 0px;
}

// 顶部标题区
/* [Layout Refine] Figma header bbox height: 30 */
.header-section {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

// 标题装饰：圆点 + 渐变线
.title-decorator {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
}

.decorator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
  position: relative;
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2.4px;
    height: 2.4px;
    border-radius: 50%;
    background: #559eff;
  }
}

.decorator-line {
  width: 60px;
  height: 6px;
  background: linear-gradient(90deg, #559eff 0%, #559eff 100%);
  border-radius: 3px;
  opacity: 0.6;
}

.title-text {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 19px;
}

.update-tip {
  font-size: 14px;
  font-weight: 400;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 21px;
  margin-left: 12px;
}

// 头部统计指标
.header-stats {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.stat-label {
  font-size: 14px;
  color: #333333;
  line-height: 21px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 23px;
  font-family: 'Roboto', sans-serif;

  /* [Style Refine] Figma stat value fills gradient */
  &--primary {
    background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  /* [Style Refine] Figma success value fills */
  &--success {
    color: #08a3a5;
  }
}

.header-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

// 内容区
/* [Layout Refine] Figma slot-con gap: 0 */
.content-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0px;
}

// 区域切换卡片
/* [Layout Refine] Figma switch bbox height: 64.8 */
.switch-section {
  display: flex;
  flex-direction: row;
  gap: 10px;
  height: 65px;
  flex-shrink: 0;
}

.area-card {
  flex: 1;
  min-width: 0;
  height: 65px;
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  /* [Style Refine] 红线1: 背景图精确还原 */
  background-size: 100% 100%;
  transition: all 0.2s ease;

  &--active {
    // 激活态样式通过背景图区分
  }

  &__row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  &__icon {
    width: 28px;
    height: 28px;
    object-fit: contain;
    flex-shrink: 0;
  }

  &__total {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1px;
  }

  &__total-label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
    line-height: 21px;
  }

  &__total-value {
    font-size: 20px;
    font-weight: 700;
    color: #ffffff;
    line-height: 23px;
    font-family: 'Roboto', sans-serif;
  }

  &__name {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 16px;
  }

  &__error {
    font-size: 14px;
    font-weight: 700;
    color: #f53f3f;
    line-height: 21px;
    font-family: 'Roboto', sans-serif;
  }

  // 非激活卡片文字颜色
  &:not(.area-card--active) {
    .area-card__total-label {
      color: rgba(51, 51, 51, 0.9);
    }
    .area-card__total-value {
      color: #1990ff;
    }
    .area-card__name {
      color: #333333;
    }
  }
}

// 设备分类与列表区
.device-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 8px;
}

// 左侧分类导航
.sidebar-tabs {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 12px;
}

.sidebar-count {
  font-size: 10px;
  color: #333333;
  line-height: 14px;
  text-align: center;
  margin-bottom: 4px;
}

.sidebar-tab {
  width: 34px;
  min-height: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 2px;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  /* [Style Refine] Figma inactive tab fills */
  background: linear-gradient(180deg, #85b9ff 0%, #c0e2ff 100%);
  /* [Style Refine] Figma inactive tab strokes */
  border: 1px solid #f0f5ff;
  transition: all 0.2s ease;

  &--active {
    /* [Style Refine] Figma active tab fills */
    background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
    border: 1px solid #f0f5ff;
    .sidebar-tab__text {
      color: #ffffff;
      font-weight: 700;
    }
  }

  &__text {
    font-size: 14px;
    /* [Style Refine] Figma inactive tab text fills */
    color: #3b80e7;
    line-height: 16px;
    text-align: center;
    writing-mode: horizontal-tb;
  }

  &__badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 14px;
    height: 14px;
    background: #f53f3f;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 500;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    line-height: 14px;
    font-family: 'Roboto', sans-serif;
  }
}

// 设备网格
/* [Layout Refine] Figma cons grid gap: row 13px, col 8px */
.device-grid {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 64px;
  gap: 13px 8px;
  overflow-y: auto;
  align-content: start;

  // 隐藏滚动条
  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
}

.device-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  /* [Style Refine] 红线1: 背景图精确还原 */
  background-size: 100% 100%;
  /* [Style Refine] 删除无依据的 background-color 和 border */

  &__icon {
    width: 27px;
    height: 32px;
    object-fit: contain;
    flex-shrink: 0;
  }

  &__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__name {
    font-size: 12px;
    color: #333333;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__value {
    font-size: 16px;
    font-weight: 500;
    /* [Style Refine] Figma device value fills */
    color: #ffffff;
    line-height: 19px;
    font-family: 'Roboto', sans-serif;
    /* [Style Refine] Figma device value effects */
    text-shadow: 0px 0px 0px rgba(0, 0, 0, 0.5);

    &--error {
      /* [Style Refine] Figma error value fills */
      color: #e03434;
    }
  }
}</style>