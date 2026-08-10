<template>
  <base-panel panelKey="default-panel">
    <!-- Fixed: 问题65 - 使用 base-panel 插槽替代自定义 header -->
    <template #title-left>
      <!-- Fixed: 问题8 - 装饰性图标 alt 设为空 -->
      <img :src="icon1" alt="" class="c-mc-1785475573337-bf006e44-title-decor" />
    </template>

    <template #header-right>
      <div class="c-mc-1785475573337-bf006e44-tabs">
        <div
          class="c-mc-1785475573337-bf006e44-tab c-mc-1785475573337-bf006e44-tab-active"
          role="tab"
          tabindex="0"
          aria-selected="true"
        >
          江阴靖江长江隧道
        </div>
        <div
          class="c-mc-1785475573337-bf006e44-tab c-mc-1785475573337-bf006e44-tab-inactive"
          role="tab"
          tabindex="0"
          aria-selected="false"
        >
          江阴大桥
        </div>
      </div>
    </template>

    <!-- Fixed: 问题4 - 补充完整内容区域 DOM 结构 -->
    <div class="c-mc-1785475573337-bf006e44-content">
      <!-- 今日累计 -->
      <div class="c-mc-1785475573337-bf006e44-sub-header">
        <img :src="icon2" alt="" class="c-mc-1785475573337-bf006e44-sub-header-icon" />
        <span class="c-mc-1785475573337-bf006e44-sub-header-text">今日累计</span>
      </div>

      <!-- 数据卡片行 -->
      <div class="c-mc-1785475573337-bf006e44-cards-row">
        <!-- 危化品车 -->
        <div
          class="c-mc-1785475573337-bf006e44-card"
          :style="{
            backgroundImage: `url(${bg2})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }"
        >
          <div class="c-mc-1785475573337-bf006e44-card-top">
            <img :src="icon4" alt="" class="c-mc-1785475573337-bf006e44-card-icon" />
            <span class="c-mc-1785475573337-bf006e44-card-label">危化品车</span>
          </div>
          <div class="c-mc-1785475573337-bf006e44-card-bottom">
            <span class="c-mc-1785475573337-bf006e44-card-value-red">51</span>
            <span class="c-mc-1785475573337-bf006e44-card-unit">次</span>
          </div>
        </div>

        <!-- 重型货车 -->
        <div
          class="c-mc-1785475573337-bf006e44-card"
          :style="{
            backgroundImage: `url(${bg3})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }"
        >
          <div class="c-mc-1785475573337-bf006e44-card-top">
            <img :src="icon5" alt="" class="c-mc-1785475573337-bf006e44-card-icon" />
            <span class="c-mc-1785475573337-bf006e44-card-label">重型货车</span>
          </div>
          <div class="c-mc-1785475573337-bf006e44-card-bottom">
            <span class="c-mc-1785475573337-bf006e44-card-value-blue">2</span>
            <span class="c-mc-1785475573337-bf006e44-card-unit">次</span>
          </div>
        </div>

        <!-- 超高车辆 -->
        <div
          class="c-mc-1785475573337-bf006e44-card"
          :style="{
            backgroundImage: `url(${bg1})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }"
        >
          <div class="c-mc-1785475573337-bf006e44-card-top">
            <img :src="icon3" alt="" class="c-mc-1785475573337-bf006e44-card-icon" />
            <span class="c-mc-1785475573337-bf006e44-card-label">超高车辆</span>
          </div>
          <div class="c-mc-1785475573337-bf006e44-card-bottom">
            <span class="c-mc-1785475573337-bf006e44-card-value-orange">19</span>
            <span class="c-mc-1785475573337-bf006e44-card-unit">次</span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7961.png'
import icon2 from '../resources/images/icon-123.png'
import bg2 from '../resources/images/bg-124.png'
import icon4 from '../resources/images/icon-8036.png'
import bg3 from '../resources/images/bg-125.png'
import icon5 from '../resources/images/icon-8070.png'
import bg1 from '../resources/images/bg-126.png'
import icon3 from '../resources/images/icon-8049.png'

import { onMounted } from 'vue'

const componentProps = {}

let runtimeBuilder = null try {
const builder = window.$mcComponentBuilder({ componentId: 'mc-1785475573337-bf006e44', componentProps, componentName: '重点车辆监测面板' }) runtimeBuilder = builder.runtimeBuilder } catch (e) { console.warn('[mc-1785475573337-bf006e44] $mcComponentBuilder 失败:', e) }

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785475573337-bf006e44-onload', {
      componentId: 'mc-1785475573337-bf006e44',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* Fixed: 问题10 - 补充内容区背景色及圆角 */
.c-mc-1785475573337-bf006e44-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(237, 244, 251, 0.7);
  border-radius: 4px;
}

.c-mc-1785475573337-bf006e44-title-decor {
  width: 8px;
  height: 8px;
}

.c-mc-1785475573337-bf006e44-tabs {
  display: flex;
  gap: 8px;
}

.c-mc-1785475573337-bf006e44-tab {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 21px;
}

.c-mc-1785475573337-bf006e44-tab-active {
  background: #1990ff;
  color: #ffffff;
  border: 0.73px solid rgba(199, 224, 255, 1);
}

.c-mc-1785475573337-bf006e44-tab-inactive {
  background: #6680a0;
  color: #333333;
  border: 0.73px solid rgba(172, 196, 225, 1);
}

.c-mc-1785475573337-bf006e44-sub-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Fixed: 问题11(部分) - 补充 sub-header icon 尺寸 */
.c-mc-1785475573337-bf006e44-sub-header-icon {
  width: 18px;
  height: 18px;
}

.c-mc-1785475573337-bf006e44-sub-header-text {
  color: #333333;
  font-size: 14px;
  font-weight: bold;
}

.c-mc-1785475573337-bf006e44-cards-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

/* Fixed: 问题14, 18, 22 等 - 卡片基础样式及背景图应用 */
.c-mc-1785475573337-bf006e44-card {
  width: 120px;
  height: 74px;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.c-mc-1785475573337-bf006e44-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Fixed: 问题11, 15, 19 等 - 补充卡片 icon 尺寸 */
.c-mc-1785475573337-bf006e44-card-icon {
  width: 32px;
  height: 24px;
}

.c-mc-1785475573337-bf006e44-card-label {
  color: #333333;
  font-size: 12px;
}

.c-mc-1785475573337-bf006e44-card-bottom {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

/* Fixed: 问题12, 24, 36 等 - 为不同颜色数值定义独立 class，禁止使用伪类 */
.c-mc-1785475573337-bf006e44-card-value-red {
  color: #ff3333;
  font-size: 20px;
  font-weight: bold;
}

/* Fixed: 问题16, 28, 46 等 */
.c-mc-1785475573337-bf006e44-card-value-blue {
  color: #1990ff;
  font-size: 20px;
  font-weight: bold;
}

/* Fixed: 问题20, 32, 56 等 */
.c-mc-1785475573337-bf006e44-card-value-orange {
  color: #ff9900;
  font-size: 20px;
  font-weight: bold;
}

/* Fixed: 问题13, 17, 21 等 - 统一单位文本样式 */
.c-mc-1785475573337-bf006e44-card-unit {
  color: #666666;
  font-size: 12px;
}
</style>