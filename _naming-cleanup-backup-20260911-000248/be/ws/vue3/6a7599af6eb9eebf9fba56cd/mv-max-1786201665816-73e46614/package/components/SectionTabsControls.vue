<template>
  <!-- Tab 切换与视图控制区 -->
  <div class="section-tabs-controls">
    <!-- 左侧监测指标 Tab 列表 -->
    <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
      <div
        v-for="(tab, index) in tabs"
        :key="index"
        :class="['tab-item', { 'tab-item--active': activeTab === index }]"
        @click="handleTabClick(index)"
      >
        <!-- 选中态渐变背景 -->
        <div
          v-if="activeTab === index"
          class="tab-item__bg"
          :style="{ backgroundImage: `url(${bgtabActive})` }"
        ></div>
        <span class="tab-item__text">{{ tab }}</span>
      </div>
    </div>

    <!-- 右侧视图切换图标组 -->
    <div class="view-icons">
      <!-- 图表视图图标 -->
      <div
        :class="['view-icon', { 'view-icon--active': viewMode === 'chart' }]"
        @click="handleViewClick('chart')"
        title="图表视图"
      >
        <div class="icon-chart">
          <div class="bar bar-1"></div>
          <div class="bar bar-2"></div>
          <div class="bar bar-3"></div>
        </div>
      </div>

      <!-- 列表视图图标（带未读/告警 Badge） -->
      <div
        :class="['view-icon', { 'view-icon--active': viewMode === 'list' }]"
        @click="handleViewClick('list')"
        title="列表视图"
      >
        <div class="icon-list">
          <div class="line"></div>
          <div class="line"></div>
          <div class="line"></div>
        </div>
        <!-- 红色告警数字 Badge -->
        <div v-if="badgeCount > 0" class="badge">
          {{ badgeCount }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg2 = new URL('../../resources/images/bg-7890.png', import.meta.url).href
const bgtabActive = new URL('../../resources/images/bg-tab-active-7891.png', import.meta.url).href
/**
 * 环境监测面板 - Tab 切换与视图控制子组件
 * 数据来源：主组件传入的 tabs、activeTab、viewMode、badgeCount
 * 关键交互：
 * 1. 点击 Tab 切换监测指标（一氧化碳、能见度、洞内照明、洞外光强）
 * 2. 点击右侧图标切换图表/列表视图，列表视图右上角显示告警 Badge
 */
import { ref} from 'vue'

// #region 1. Props定义
const props = defineProps({
  // 当前激活的 Tab 索引
  activeTab: { type: Number, default: 0 },
  // Tab 列表数据
  tabs: { type: Array, default: () => [] },
  // 当前视图模式：'chart' 或 'list'
  viewMode: { type: String, default: 'chart' },
  // 列表视图未读/告警数量
  badgeCount: { type: Number, default: 0 }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-change'])
// #endregion

// #region 3. 响应式状态
// 内部状态由 props 驱动，无需额外 ref
// #endregion

// #region 4. 计算属性
// 无派生计算
// #endregion

// #region 5. 方法
// 处理 Tab 点击切换
const handleTabClick = (index) => {
  if (props.activeTab !== index) {
    emit('tab-change', index)
  }
}

// 处理视图模式切换
const handleViewClick = (mode) => {
  if (props.viewMode !== mode) {
    emit('view-change', mode)
  }
}
// #endregion

// #region 6. 生命周期
// 无特殊生命周期逻辑
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* [Layout Refine] Figma sub-t bbox: width=380, height=32 */
.section-tabs-controls {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 32px;
  box-sizing: border-box;
}

/* [Layout Refine] Figma tabs-list bbox: width=295, height=27 */
/* [Style Refine] fills → gradient, strokes → border 0.72px solid white */
.tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 295px;
  height: 27px;
  border-radius: 4px;
  border: 0.72px solid rgb(255, 255, 255);
  background: linear-gradient(180deg, rgb(181, 222, 255) 0%, rgb(209, 236, 255) 100%);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  position: relative;
  overflow: hidden;
  padding: 3px;
  box-sizing: border-box;
}

.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  cursor: pointer;
  z-index: 1;

  /* [Style Refine] bg-tab-active fills → gradient, strokes → border 0.6px */
  &__bg {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 78px;
    height: 21px;
    border-radius: 2px;
    border: 0.6px solid rgb(255, 255, 255);
    background: linear-gradient(180deg, rgb(16, 153, 177) 0%, rgb(4, 143, 255) 100%);
    background-size: 100% 100%;
    background-repeat: no-repeat;
    z-index: -1;
  }

  /* [Style Refine] fills → rgb(44, 155, 234) for inactive */
  &__text {
    font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: rgb(44, 155, 234);
    line-height: 12px;
    white-space: nowrap;
  }

  /* [Style Refine] fills → white, effects → drop-shadow */
  &--active {
    .tab-item__text {
      color: rgb(255, 255, 255);
      text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
    }
  }
}

/* [Layout Refine] Figma tabs-icon bbox: width=52, height=24 */
.view-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

/* [Style Refine] Rectangle fills → white + gradient, strokes → border rgb(161,206,255) */
.view-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  border-radius: 4px;
  border: 1px solid rgb(161, 206, 255);
  background: linear-gradient(180deg, rgb(255, 255, 255) 0%, rgb(226, 239, 255) 36%, rgb(222, 237, 255) 69%, rgb(255, 255, 255) 100%);
  box-sizing: border-box;
}

/* [Style Refine] Vector fills → rgb(44, 155, 234) */
.icon-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  width: 16px;
  height: 15px;

  .bar {
    width: 4px;
    background: rgb(44, 155, 234);
    border-radius: 1px;
  }

  .bar-1 { height: 60%; }
  .bar-2 { height: 100%; }
  .bar-3 { height: 40%; }
}

.icon-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 14px;

  .line {
    width: 100%;
    height: 2px;
    background: rgb(44, 155, 234);
    border-radius: 1px;
  }
}

/* [Style Refine] Figma num bbox: width=14, height=14, cornerRadius=29 */
/* [Style Refine] fills → rgb(245, 63, 63) */
.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: rgb(245, 63, 63);
  border-radius: 29px;
  color: rgb(255, 255, 255);
  font-family: 'PingFang SC', 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  z-index: 10;
}
</style>