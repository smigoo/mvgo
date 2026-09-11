<template>
  <div class="section-controls">
    <!-- Tab 切换栏 -->
    <div class="tabs-container" :style="tabsBgStyle">
      <div
        v-for="(tab, index) in tabs"
        :key="index"
        :class="['tab-item', { active: activeTab === index }]"
        @click="handleTabClick(index)"
      >
        <!-- 选中态背景 -->
        <div v-if="activeTab === index" class="tab-active-bg" :style="tabActiveBgStyle"></div>
        <span class="tab-text">{{ tab }}</span>
      </div>
    </div>

    <!-- 视图切换按钮 -->
    <div class="view-switchers">
      <!-- 柱状图视图 -->
      <div class="icon-btn" @click="handleViewClick('chart')">
        <div class="icon-inner chart-icon"><span></span></div>
      </div>
      <!-- 列表视图（带 Badge） -->
      <div class="icon-btn" @click="handleViewClick('list')">
        <div class="icon-inner list-icon"><span></span></div>
        <div class="badge">6</div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg2 = new URL('../../resources/images/bg-7890.png', import.meta.url).href
const bgtabActive = new URL('../../resources/images/bg-tab-active-7891.png', import.meta.url).href
const icontabsIcon = new URL('../../resources/images/tabs-icon-43.png', import.meta.url).href
/**
 * 筛选与视图控制区 - 子组件
 * 功能：
 * 1. Tab 切换监测指标（一氧化碳/能见度/洞内照明/洞外光强）
 * 2. 视图切换（图表/列表），列表视图带红色 Badge 提示
 * 
 * 交互：
 * - 点击 Tab 切换当前监测指标，触发 tab-change 事件
 * - 点击右侧图标切换图表/列表视图，触发 view-toggle 事件
 */
import { ref, computed} from 'vue'

// 接收父组件传递的当前激活 Tab 和视图模式
const props = defineProps({
  activeTab: { type: Number, default: 0 },
  viewMode: { type: String, default: 'chart' }
})

// 触发事件
const emit = defineEmits(['tab-change', 'view-toggle'])

// Tab 列表数据（使用 ref 以支持 API 绑定）
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])

// 背景图样式（使用系统自动注入的变量 bg2, bgtabActive）
const tabsBgStyle = computed(() => ({
  backgroundImage: `url(${bg2})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat'
}))

const tabActiveBgStyle = computed(() => ({
  backgroundImage: `url(${bgtabActive})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat'
}))

// Tab 点击处理：切换激活索引
const handleTabClick = (index) => {
  if (props.activeTab !== index) {
    emit('tab-change', index)
  }
}

// 视图切换处理：切换 chart / list 模式
const handleViewClick = (mode) => {
  if (props.viewMode !== mode) {
    emit('view-toggle', mode)
  }
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 控制区根容器 - 水平布局，两端对齐
.section-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 20px;
  box-sizing: border-box;
}

// Tab 容器 - 承载背景图与边框
.tabs-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 295px;
  height: 27px;
  /* [Style Refine] 使用 Figma 渐变填充替代背景图 */
  background: linear-gradient(90deg, rgb(181, 222, 255), rgb(209, 236, 255));
  border: 0.72px solid #ffffff;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

// 单个 Tab 项 - 均分宽度，垂直居中
.tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  z-index: 1;
}

// 选中态背景层 - 绝对定位在 Tab 内部，垂直居中
.tab-active-bg {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 21px;
  transform: translateY(-50%);
  /* [Style Refine] 使用 Figma 渐变填充替代背景图 */
  background: linear-gradient(90deg, rgb(16, 153, 177), rgb(4, 143, 255));
  border: 0.6px solid #ffffff;
  border-radius: 3px;
  z-index: -1;
}

// Tab 文字默认样式
.tab-text {
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  transition: all 0.3s ease;
}

// Tab 文字选中态 - 白色 + 蓝色文字阴影
.tab-item.active .tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

// 视图切换按钮组
.view-switchers {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

// 单个图标按钮容器
.icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  /* [Style Refine] 还原 Figma 图标按钮样式：渐变填充、描边、圆角 */
  background: linear-gradient(180deg, #ffffff 0%, #e2efff 36%, #deeeff 69%, #ffffff 100%);
  border: 1px solid rgb(161, 206, 255);
  border-radius: 4px;
  box-sizing: border-box;
}

/* [Style Refine] 使用 CSS 绘制图标基础容器 */
.icon-inner {
  width: 16px;
  height: 16px;
  position: relative;
}

/* [Style Refine] 使用 CSS 绘制柱状图图标 */
.chart-icon {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  &::before, &::after {
    content: '';
    display: block;
    width: 3px;
    background: #2c9bea;
    border-radius: 1px;
  }
  &::before { height: 60%; }
  &::after { height: 100%; }
  & > span {
    display: block;
    width: 3px;
    height: 40%;
    background: #2c9bea;
    border-radius: 1px;
  }
}

/* [Style Refine] 使用 CSS 绘制列表图标 */
.list-icon {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 2px 0;
  &::before, &::after {
    content: '';
    display: block;
    width: 100%;
    height: 2px;
    background: #2c9bea;
    border-radius: 1px;
  }
  & > span {
    display: block;
    width: 100%;
    height: 2px;
    background: #2c9bea;
    border-radius: 1px;
  }
}

// 红色 Badge 提示 - 绝对定位在图标右上角
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  /* [Style Refine] 移除无依据的 box-shadow */
}</style>