<template>
  <!-- Tab切换栏与操作区：四个监测指标Tab + 右侧图表/表格视图切换图标（含badge） -->
  <div class="section-tabs-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <!-- Tab标签组：使用bg1作为整体背景图，激活tab使用bg2背景图 -->
    <div
      class="tabs-list"
      :style="{ backgroundImage: `url(${bg1})` }"
    >
      <div
        v-for="(tab, index) in tabList"
        :key="tab.key"
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === index }"
        :style="activeTab === index ? { backgroundImage: `url(${bg2})` } : {}"
        @click="handleTabClick(index)"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 右侧图表/表格切换图标区域 -->
    <div class="tabs-icon-area">
      <!-- 图表视图图标 -->
      <div
        class="icon-btn"
        :class="{ 'icon-btn--active': activeView === 'chart' }"
        @click="handleViewChange('chart')"
      >
        <img :src="icon1" class="icon-img" alt="图表视图" />
      </div>

      <!-- 表格视图图标（带badge） -->
      <div
        class="icon-btn icon-btn--badge-wrap"
        :class="{ 'icon-btn--active': activeView === 'table' }"
        @click="handleViewChange('table')"
      >
        <img :src="icon2" class="icon-img" alt="表格视图" />
        <!-- badge红色数字 -->
        <span class="badge-num" :style="{ background: '#f53f3f' }">{{ badgeCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

// Tab切换栏与操作区子组件
// 负责渲染四个监测指标Tab（一氧化碳/能见度/洞内照明/洞外光强）
// 以及右侧图表/表格视图切换图标（含badge数字）
// bg1 = tabs-list整体背景图，bg2 = 激活态tab背景图
// icon1 = 图表视图图标，icon2 = 表格视图图标（带badge）

import { ref} from 'vue'

// #region 1. Props定义
const props = defineProps({
  activeTab: { type: Number, default: 0 },
  activeView: { type: String, default: 'chart' },
  bg1: { type: String, default: '' },
  bg2: { type: String, default: '' },
  icon1: { type: String, default: '' },
  icon2: { type: String, default: '' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-change'])
// #endregion

// #region 3. 响应式状态
// Tab列表数据，与Figma设计稿一致
const tabList = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'indoor-light', label: '洞内照明' },
  { key: 'outdoor-light', label: '洞外光强' }
])

// badge数字（告警数量）
const badgeCount = ref(6)
// #endregion

// #region 4. 方法
// 点击Tab时通知父组件切换
const handleTabClick = (index) => {
  emit('tab-change', index)
}

// 点击视图切换图标时通知父组件
const handleViewChange = (view) => {
  emit('view-change', view)
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// Tab切换栏与操作区整体布局
// 水平排列：左侧Tab组 + 右侧图标操作区
.section-tabs-root {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  flex-shrink: 0;
}

// Tab标签组容器：使用bg1背景图（295x27px），内部水平排列各Tab项
.tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 4px;
  padding: 3px 4px;
  position: relative;
}

// 单个Tab项：默认透明背景，激活态使用bg2背景图
.tab-item {
  padding: 3px 14px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Source Han Sans CN', sans-serif;
  color: @color-tab-default-text;
  cursor: pointer;
  border-radius: 4px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  transition: color 0.2s;
  white-space: nowrap;
  line-height: 1;

  // 激活态：文字变白，背景由bg2图片提供
  &--active {
    color: @color-tab-active-text;
    font-weight: 500;
    // drop-shadow模拟Figma的文字投影效果
    filter: drop-shadow(0 0.6px 0 rgba(0, 111, 227, 1));
  }
}

// 右侧图标操作区：水平排列图表/表格切换图标
.tabs-icon-area {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

// 图标按钮容器：图标PNG已自带边框与底色，不额外添加描边
.icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  // badge包裹容器（表格视图图标需要相对定位承载badge）
  &--badge-wrap {
    position: relative;
  }
}

// 图标图片：24x24，contain防止拉伸
.icon-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
  display: block;
}

// badge红色圆形数字（绝对定位悬浮在图标右上角）
// 背景使用CSS直接定义 #f53f3f（Figma标注值）
.badge-num {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f53f3f;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  font-family: 'PingFang SC', sans-serif;
  line-height: 14px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
</style>