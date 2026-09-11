<template>
  <div class="section-controls">
    <!-- 监测指标 Tab 切换栏 -->
    <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
<div v-for="(tab, index) in tabs" :key="tab.key" :class="['tab-item', { 'tab-item--active': activeTab === index }]" @click="handleTabClick(index)" >
        <!-- 选中态背景（使用系统注入的渐变背景图变量） -->
<div v-if="activeTab === index" class="tab-active-bg" :style="{ backgroundImage: `url(${bg3})` }" ></div>
        <span class="tab-text">{{ tab.name }}</span>
      </div>
    </div>

    <!-- 右侧操作图标区 -->
    <div class="action-icons">
      <div class="icon-group" @click="handleIconClick">
        <!-- 视图切换图标（包含图表与列表两个图标） -->
        <img :src="icon2" class="tabs-icon-img" alt="view-icons" />
        <!-- 列表视图的告警/数量 Badge -->
        <div class="badge">
          <span>6</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'
import bg3 from '../../resources/images/bg-tab-active-7891.png'
import icon2 from '../../resources/images/tabs-icon-43.png'

import { ref} from 'vue'

// 组件用途：环境监测面板的筛选与操作栏，包含监测指标 Tab 切换和右侧视图/告警图标。
// 数据来源：Tab 列表为静态配置（支持后续 API 绑定替换），Badge 数字为静态展示。
// 关键交互：点击 Tab 切换选中态，高亮背景跟随移动；点击右侧图标触发视图切换。

// #region 1. Props定义
// 无需外部 props，内部状态自管理
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-change'])
// #endregion

// #region 3. 响应式状态
// Tab 列表数据（使用 ref 以支持后续 API 绑定替换）
const tabs = ref([ { name: '一氧化碳', key: 'co' }, { name: '能见度', key: 'visibility' }, { name: '洞内照明', key: 'inner-light' }, { name: '洞外光强', key: 'outer-light' }
])

// 当前选中的 Tab 索引，默认选中第一个（一氧化碳）
const activeTab = ref(0)
// #endregion

// #region 4. 计算属性
// #endregion

// #region 5. 方法
// 处理 Tab 切换点击事件，联动刷新图表数据
const handleTabClick = (index) => { if (activeTab.value === index) return
  activeTab.value = index
  emit('tab-change', tabs.value[index].key)
}

// 处理右侧图标点击，切换至列表视图或查看告警列表
const handleIconClick = () => { emit('view-change')
}
// #endregion

// #region 6. 生命周期
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 筛选与操作栏根容器
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

// 监测指标 Tab 容器（使用系统注入的背景图变量）
.tabs-list {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 295px;
  height: 27px;
  border-radius: 13.5px;
  border: 0.72px solid #ffffff;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  box-sizing: border-box;
  overflow: hidden;
}

// 单个 Tab 项
.tab-item {
  position: relative;
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
}

// Tab 选中态背景（使用系统注入的渐变背景图变量）
.tab-active-bg {
  position: absolute;
  top: 3px;
  left: -2px;
  right: -2px;
  bottom: 3px;
  border-radius: 10.5px;
  border: 0.6px solid #ffffff;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  z-index: -1;
  transition: all 0.3s ease;
}

// Tab 文本
.tab-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  line-height: 12px;
  white-space: nowrap;
}

// 选中态文本样式
.tab-item--active .tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

// 右侧操作图标区
.action-icons {
  position: relative;
  width: 52px;
  height: 24px;
}

.icon-group {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

// 图标图片（包含图表与列表两个图标）
.tabs-icon-img {
  width: 52px;
  height: 24px;
  object-fit: contain;
  display: block;
}

// 告警/数量 Badge（定位在右侧列表图标的右上角）
.badge {
  position: absolute;
  top: -4px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 29px;
  background: #f53f3f;
  display: flex;
  align-items: center;
  justify-content: center;
  
  span {
    font-family: 'PingFang SC', sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: #ffffff;
    line-height: 14px;
  }
}</style>