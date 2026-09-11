<template>
  <div class="control-bar-root">
    <!-- 监测项目 Tab 切换区 -->
    <div class="tabs-container" :style="{ backgroundImage: `url(${bg2})` }">
      <div
        v-for="(tab, index) in tabs"
        :key="index"
        :class="['tab-item', { active: activeTab === index }]"
        :style="activeTab === index ? { backgroundImage: `url(${bg3})` } : {}"
        @click="handleTabClick(index)"
      >
        {{ tab.name }}
      </div>
    </div>

    <!-- 右侧视图切换图标区 -->
    <div class="view-icons">
      <!-- 柱状图视图 -->
      <div class="view-icon-wrapper" @click="handleViewClick('chart')">
        <img :src="icon2" class="view-icon" style="object-position: 0 0;" />
      </div>
      <!-- 列表视图（带 Badge） -->
      <div class="view-icon-wrapper" @click="handleViewClick('list')">
        <img :src="icon2" class="view-icon" style="object-position: -28px 0;" />
        <div class="badge">6</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'
import bg3 from '../../resources/images/bg-tab-active-7891.png'
import icon2 from '../../resources/images/tabs-icon-43.png'
/**
 * ControlBar 子组件
 * 功能：环境监测面板的监测项目 Tab 切换（一氧化碳、能见度等）及右侧视图模式切换（图表/列表）
 * 交互：点击 Tab 切换当前监测指标，点击右侧图标切换视图模式
 */
import { ref} from 'vue'

// 资源变量由系统自动注入（bg2: Tab容器背景, bg3: 选中Tab背景, icon2: 视图图标）

// #region 1. Props 定义
const props = defineProps({
  // 当前激活的 Tab 索引，由父组件通过 v-model 控制
  activeTab: {
    type: Number,
    default: 0
  }
})
// #endregion

// #region 2. Emits 定义
const emit = defineEmits(['update:activeTab'])
// #endregion

// #region 3. 响应式状态
// 监测项目 Tab 列表数据
const tabs = ref([
  { name: '一氧化碳' },
  { name: '能见度' },
  { name: '洞内照明' },
  { name: '洞外光强' }
])

// 当前视图模式：'chart'（柱状图）或 'list'（列表）
const viewMode = ref('chart')
// #endregion

// #region 5. 方法
// 处理 Tab 点击切换，向父组件同步状态
const handleTabClick = (index) => {
  emit('update:activeTab', index)
}

// 处理视图模式切换
const handleViewClick = (mode) => {
  viewMode.value = mode
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 控制栏根容器：水平排列，两端对齐 */
.control-bar-root {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 20px;
  box-sizing: border-box;
}

/* Tab 列表容器：承载渐变背景与边框（🎯 防挤压：占满主轴剩余空间） */
.tabs-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 3px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  box-sizing: border-box;
}

/* 单个 Tab 项样式（🎯 防挤压：等宽均分 + 禁止压缩换行） */
.tab-item {
  flex: 1;
  flex-shrink: 0;
  padding: 4px 6px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Source Han Sans CN', sans-serif;
  color: #2c9bea;
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 1.6px;
  transition: all 0.3s;
  box-sizing: border-box;

  /* 选中态：应用激活背景图、白色文字及文字阴影 */
  &.active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
    background-size: 100% 100%;
    background-repeat: no-repeat;
    border: 0.6px solid rgba(255, 255, 255, 1);
  }
}

/* 右侧视图图标容器（🎯 防挤压：固定占位不被压缩） */
.view-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 8px;
}

/* 图标包裹器：用于定位 Badge */
.view-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 图标本体：通过 object-position 裁剪出对应的单个图标 */
.view-icon {
  width: 24px;
  height: 24px;
  object-fit: cover;
}

/* 列表图标右上角的红色数字 Badge */
.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 29px;
  background: #f53f3f;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  font-family: 'PingFang SC', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 1;
}</style>