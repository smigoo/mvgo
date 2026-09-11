<template>
  <!-- 顶部tab栏：包含tab切换组+视图切换图标+通知徽章 -->
  <div class="header-tabs-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <!-- tab切换区域：带背景图的分段控件 -->
    <div 
      class="tabs-list-container" 
      :style="{ backgroundImage: `url(${bg1})` }"
    >
      <div
        v-for="(tab, index) in tabs"
        :key="index"
        class="tab-item"
        :class="{ 'tab-active': index === activeTab }"
        :style="index === activeTab ? { backgroundImage: `url(${bg2})` } : {}"
        @click="handleTabClick(index)"
      >
        {{ tab }}
      </div>
    </div>

    <!-- 右侧控制区域：统计/列表图标 + 通知徽章 -->
    <div class="tabs-controls" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <!-- 统计图标按钮 -->
      <div 
        class="control-icon-btn"
        :class="{ 'control-active': activeViewMode === 'chart' }"
        @click="handleViewClick('chart')"
      >
        <img :src="icon1" class="control-icon" alt="统计视图" />
      </div>

      <!-- 列表图标按钮 -->
      <div 
        class="control-icon-btn"
        :class="{ 'control-active': activeViewMode === 'list' }"
        @click="handleViewClick('list')"
      >
        <img :src="icon1" class="control-icon" alt="列表视图" />
      </div>

      <!-- 通知徽章 -->
      <div class="notification-badge">{{ notificationCount }}</div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'
import icon1 from '../../resources/images/icon-7945.png'


// 顶部tab栏子组件：渲染tab切换按钮、视图切换图标、通知徽章，响应用户点击并向主组件emit事件

// #region 1. Props定义
const props = defineProps({
  // tab列表数组（如 ['一氧化碳', '能见度', '洞内照明', '洞外光强']）
  tabs: { type: Array, default: () => [] },
  // 当前激活的tab索引
  activeTab: { type: Number, default: 0 },
  // 当前视图模式：'chart' | 'list'
  activeViewMode: { type: String, default: 'chart' },
  // 通知徽章数字
  notificationCount: { type: Number, default: 0 },
  // 背景图资源（系统注入的静态字符串）
  bg1: { type: String, default: '' },
  bg2: { type: String, default: '' },
  icon1: { type: String, default: '' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-mode-change'])
// #endregion

// #region 3. 方法

// 处理tab点击（向主组件emit tab索引）
const handleTabClick = (index) => {
  if (index !== props.activeTab) {
    emit('tab-change', index)
  }
}

// 处理视图模式切换（向主组件emit mode）
const handleViewClick = (mode) => {
  if (mode !== props.activeViewMode) {
    emit('view-mode-change', mode)
  }
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 根容器：横向布局，左侧tab组+右侧控制按钮
.header-tabs-root {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px 16px;
  flex-shrink: 0;
}

// tab列表容器：Figma tabs-list节点，带背景图bg1（295×27px渐变背景）
// layoutMode: 未明确标注，但多个tab横向排列 → row
.tabs-list-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0;
  // 背景图：bg1 (bg-7890.png, 295×27, linear-gradient(#b5deff→#d1ecff))
  // 禁止用CSS渐变替代，必须用图片
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 4px;
  padding: 3px;
  box-sizing: border-box;
}

// 单个tab项：Figma tab-1/tab-2/tab-3/tab-4节点
// 非激活态：灰色文字#2c9bea，透明背景
// 激活态：白色文字#ffffff，蓝色渐变背景图bg2（78×21px, linear-gradient(#1099b1→#038fff)）
.tab-item {
  flex-shrink: 0;
  padding: 6px 16px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  text-align: center;
  color: #2c9bea;
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  box-sizing: border-box;

  // Figma tab-1: border-radius: 4px 0 0 4px（左侧第一个tab圆角）
  &:first-child {
    border-radius: 4px 0 0 4px;
  }

  // Figma tab-4: border-radius: 0 4px 4px 0（右侧最后一个tab圆角）
  &:last-child {
    border-radius: 0 4px 4px 0;
  }

  &:hover {
    opacity: 0.8;
  }
}

// 激活态tab：白色文字+背景图bg2（78×21px渐变背景）
// Figma bg-tab-active节点：GRADIENT_LINEAR #1099b1→#038fff + stroke 0.6px #ffffff
.tab-active {
  color: #ffffff;
  // 背景图：bg2 (bg-tab-active-7891.png, 78×21, linear-gradient(#1099b1→#038fff))
  // 禁止用CSS渐变替代，必须用图片
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  // Figma标注有白色描边0.6px，但PNG图片已内含描边，不额外添加border
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

// 右侧控制区域：图标按钮+徽章，横向布局
.tabs-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

// 图标按钮容器：Figma tabs-icon - icon节点（24×24）
// layoutMode: 未标注，但单个图标居中 → 用flex居中
.control-icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.3s ease;
  flex-shrink: 0;

  &:hover {
    opacity: 0.7;
  }
}

// 激活态图标：高亮显示（实际通过图标本身颜色区分，这里仅占位）
.control-active {
  opacity: 1;
}

// 图标图片：24×24，禁止给容器加border/background（图片已自带）
.control-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

// 通知徽章：Figma num节点（14×14圆形，红色背景#f53f3f，白色数字）
// Figma bg节点：SOLID #f53f3f（已标注为CSS替代资源，直接用background）
.notification-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  // Figma bg: SOLID #f53f3f（CSS替代，无需图片）
  background: #f53f3f;
  color: #ffffff;
  border-radius: 50%;
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  flex-shrink: 0;
  box-sizing: border-box;
}
</style>