<template>
  <!-- Tab切换栏：包含左侧tab列表（含背景图+激活态背景图）和右侧图标按钮区 -->
  <div class="tabs-section">
    <!-- 左侧 tab 列表容器，整体背景为 bg1 -->
    <div
      class="tabs-list"
      :style="{ backgroundImage: `url(${bg1})` }"
    >
      <!-- 逐项渲染 tab，激活态挂载 bg2 背景图 -->
      <div
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === tab.key }"
        :style="activeTab === tab.key ? { backgroundImage: `url(${bg2})` } : {}"
        @click="handleTabClick(tab.key)"
      >
        <span class="tab-item__text">{{ tab.label }}</span>
      </div>
    </div>

    <!-- 右侧图标按钮区（图表工具 + 通知角标） -->
    <div class="tabs-icons">
      <!-- 图表工具按钮：使用 icon1 图标图片，PNG 已自带边框底色 -->
      <div class="tabs-icon-btn" @click="handleChartIconClick">
        <img :src="icon1" class="tabs-icon-img" alt="图表工具" />
      </div>

      <!-- 通知按钮：使用 icon2 图标图片，红色角标显示未读数 -->
      <div class="tabs-icon-btn tabs-icon-btn--notify" @click="handleNotifyClick" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <img :src="icon2" class="tabs-icon-img" alt="通知" />
        <!-- 红色角标，CSS 纯色实现（资源已标注 CSS 替代：#f53f3f） -->
        <span v-if="badgeCount > 0" class="tabs-notify-badge">{{ badgeCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

// TabsSection：Tab切换栏组件
// 负责渲染四个监测指标标签（一氧化碳/能见度/洞内照明/洞外光强）及右侧操作图标
// bg1 挂载整体背景图，bg2 挂载激活态子项背景图（由系统自动注入，禁止手写 import）

import { ref} from 'vue'

// #region 1. Props 定义
const props = defineProps({
  // 当前激活的 tab key
  activeTab: {
    type: String,
    default: 'co'
  }
})
// #endregion

// #region 2. Emits 定义
const emit = defineEmits(['tab-change'])
// #endregion

// #region 3. 响应式状态
// tab 列表，label 与 Figma 文本逐字对应
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'inner-light', label: '洞内照明' },
  { key: 'outer-light', label: '洞外光强' }
])

// 通知角标数量（Figma 标注为 6，对应 num 节点文字 "6"）
const badgeCount = ref(6)
// #endregion

// #region 4. 方法
// 点击 tab 触发切换事件，由父组件 index.vue 维护 activeTab 状态
const handleTabClick = (key) => {
  emit('tab-change', key)
}

// 图表工具按钮点击（交互占位，不臆造下拉菜单）
const handleChartIconClick = () => {
  // 图表相关操作，具体行为由父级接管
}

// 通知按钮点击（交互占位，不臆造弹窗内容）
const handleNotifyClick = () => {
  // 查看通知，具体行为由父级接管
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// tabs-section：整行水平布局，左侧 tab 列表 + 右侧图标区
.tabs-section {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  // 高度取自 Figma sub-t 节点：32px
  height: 32px;
  flex-shrink: 0;
}

// tabs-list：Tab 标签列表容器，背景图由 bg1 变量注入
// 尺寸取自 Figma tabs-list（295×27），背景图精确对应
.tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  // Figma 标注宽 295px，但需随容器自适应；高度固定 27px 对应背景图比例
  height: 27px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 2px;
  overflow: hidden;
  flex: 1;
}

// tab-item：单个 tab 标签项，水平居中对齐文本
// Figma 每个 tab 宽约 78px（295/4 ≈ 73px，激活态 bg2 尺寸 78px）
.tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  cursor: pointer;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 0 4px;

  // 激活态：文字白色（对应 Figma 一氧化碳节点 #ffffff + DROP_SHADOW）
  &--active .tab-item__text {
    color: #ffffff;
    font-weight: 500;
    // DROP_SHADOW 效果：对应 Figma effects offset(0, 0.6) rgba(0,111,227,1)
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

// tab 文本：Figma font-size 14px，非激活态颜色 #2c9bea
.tab-item__text {
  font-family: 'Source Han Sans CN', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  font-weight: 500;
  // 非激活态颜色取自 Figma 洞内照明/洞外光强/能见度节点：#2c9bea
  color: #2c9bea;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}

// tabs-icons：右侧图标按钮区，水平排列两个图标
// 取自 Figma tabs-icon 节点尺寸 52×24，两图标间距 gap
.tabs-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  flex-shrink: 0;
}

// 单个图标按钮容器
// ⚠️ 禁止加 border/border-radius/background，图标 PNG 已自带边框与底色
.tabs-icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  // 通知按钮相对定位，供角标绝对定位
  &--notify {
    position: relative;
  }
}

// 图标图片：24×24px（Figma icon 节点尺寸），object-fit: contain 防拉伸
.tabs-icon-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
  display: block;
}

// 通知角标：红色圆形，CSS 纯色实现（对应 Figma num 节点：bg #f53f3f, 文字 #ffffff）
// 尺寸 14×14px，圆角 29px，字体 PingFang SC 12px
.tabs-notify-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 2px;
  background: #f53f3f;
  color: #ffffff;
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
</style>