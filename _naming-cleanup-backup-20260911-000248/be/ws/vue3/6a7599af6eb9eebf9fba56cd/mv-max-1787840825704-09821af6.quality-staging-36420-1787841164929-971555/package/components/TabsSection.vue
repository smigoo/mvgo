<template>
  <div class="tabs-section">
    <!-- Tab 背景容器 -->
    <div 
      class="tabs-background"
      :style="{ backgroundImage: `url(${tabsBg})` }"
    >
      <!-- Tab 列表 -->
      <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <div
          v-for="(tab, index) in tabs"
          :key="index"
          class="tab-item"
          :class="{ 'tab-item-active': activeTab === index }"
          @click="handleTabClick(index)"
        >
          <!-- 激活态背景 -->
          <div 
            v-if="activeTab === index"
            class="tab-active-bg"
            :style="{ backgroundImage: `url(${tabActiveBg})` }"
          />
          <span class="tab-text">{{ tab }}</span>
        </div>
      </div>

      <!-- 右侧视图切换按钮 -->
      <div class="tabs-controls">
        <div 
          class="control-btn"
          :class="{ 'control-btn-active': viewMode === 'chart' }"
          @click="handleViewChange('chart')"
        >
          <img :src="icon1" class="control-icon" alt="图表视图" />
        </div>
        <div 
          class="control-btn"
          :class="{ 'control-btn-active': viewMode === 'list' }"
          @click="handleViewChange('list')"
        >
          <img :src="icon2" class="control-icon" alt="列表视图" />
        </div>
        
        <!-- 通知角标 -->
        <div class="notification-badge">
          <span class="badge-text">8</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

import { ref, defineProps, defineEmits} from 'vue'

// 图片资源（由系统自动注入）
import tabsBg from '../../resources/images/bg-7890.png'
import tabActiveBg from '../../resources/images/bg-tab-active-7891.png'

// #region 1. Props定义
const props = defineProps({
  activeTab: { type: Number, default: 0 },
  viewMode: { type: String, default: 'chart' } // 'chart' | 'list'
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['change', 'view-change'])
// #endregion

// #region 3. 响应式状态
// Tab 选项列表（对应 Figma 中的 4 个 Tab）
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])
// #endregion

// #region 4. 方法
// 处理 Tab 点击
const handleTabClick = (index) => {
  if (index !== props.activeTab) {
    emit('change', index) // 通知父组件切换 Tab
  }
}

// 处理视图模式切换
const handleViewChange = (mode) => {
  if (mode !== props.viewMode) {
    emit('view-change', mode) // 通知父组件切换视图
  }
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.tabs-section {
  width: 100%;
  padding: 0 20px;
  
  .tabs-background {
    width: 100%;
    height: 32px;
    background-size: 100% 100%;
    background-position: center center;
    background-repeat: no-repeat;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    position: relative;
  }

  .tabs-list {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
  }

  .tab-item {
    position: relative;
    padding: 5px 16px;
    font-size: 14px;
    font-weight: 500;
    line-height: 12px;
    color: #2c9bea; // 未选中态：蓝色半透明;
    cursor: pointer;
    transition: all 0.3s ease;
    user-select: none;
    min-width: 70px;
    text-align: center;

    // Tab 激活态背景（绝对定位铺底）
    .tab-active-bg {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-size: 100% 100%;
      background-position: center center;
      background-repeat: no-repeat;
      border-radius: 4px;
      z-index: 0;
    }

    .tab-text {
      position: relative;
      z-index: 1;
    }

    &:hover {
      opacity: 0.8;
    }

    &.tab-item-active {
      color: #ffffff; // 选中态：白色;
      text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1); // Figma 标注的文字阴影效果;
    }
  }

  .tabs-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    position: relative;
  }

  .control-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s ease;

    .control-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
    }

    &:hover {
      border-color: rgba(85, 158, 255, 1);
      box-shadow: 0 2px 4px rgba(85, 158, 255, 0.2);
    }

    &.control-btn-active {
      background: linear-gradient(180deg, rgba(85, 158, 255, 0.2) 0%, rgba(85, 158, 255, 0.05) 100%);
      border-color: rgba(85, 158, 255, 1);
    }
  }

  .notification-badge {
    width: 14px;
    height: 14px;
    background: #f53f3f; // 红色角标背景（直接使用 CSS 替代资源）;
    border-radius: 29px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 4px;

    .badge-text {
      font-size: 12px;
      font-weight: 500;
      line-height: 14px;
      color: #ffffff;
    }
  }
}</style>