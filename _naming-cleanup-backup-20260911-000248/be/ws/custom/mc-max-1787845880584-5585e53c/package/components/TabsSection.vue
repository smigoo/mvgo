<template>
  <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-tabs-section" :style="{ ...{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
    <!-- Tab 列表容器 -->
    <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-tabs-list" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div
        v-for="(tab, index) in tabs"
        :key="index"
        :class="['c-env-monitor-tab-item', { active: activeTab === index }]"
        @click="handleTabChange(index)"
      >
        {{ tab }}
      </div>
    </div>

    <!-- 视图切换图标 -->
    <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-tabs-icons">
      <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon-wrapper">
        <img :src="icon1" alt="柱状图视图" class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon" />
      </div>
      <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon-wrapper c-mc-max-1787845880584-5585e53c-c-env-monitor-icon-wrapper-badge">
        <img :src="icon2" alt="列表视图" class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon" />
        <span class="c-mc-max-1787845880584-5585e53c-c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-tab-active-7891.png'
import bg2 from '../../resources/images/bg-7890.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

import { ref} from 'vue'

// 资源变量由系统注入，不要手写 import

// Tab 选项（从设计稿文字清单提取）
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])

// 当前激活的 tab（默认第一个）
const activeTab = ref(0)

// Tab 切换处理
const handleTabChange = (index) => {
  if (activeTab.value === index) return
  activeTab.value = index
  // TODO: 根据 activeTab 更新下方图表数据
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-section {  width: 100%;

  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  flex-shrink: 0;
  gap: 12px;
}

.c-env-monitor-tabs-list {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  min-width: 0;
  height: 27px;
  position: relative;
  background: linear-gradient(to right, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  padding: 3px;
}

.c-env-monitor-tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.3s;
  position: relative;
  border-radius: 2px;

  &:hover {
    opacity: 0.8;
  }

  &.active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
    background: linear-gradient(to right, #1099b1 0%, #038fff 100%);
    border: 0.6px solid rgba(255, 255, 255, 1);
  }
}

.c-env-monitor-tabs-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon-wrapper {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(to bottom, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;

  &:hover {
    background: linear-gradient(to bottom, #f0f8ff 0%, #d0e8ff 36%, #cce6ff 69%, #f0f8ff 100%);
  }

  &-badge {
    position: relative;
  }
}

.c-env-monitor-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-env-monitor-badge {
  position: absolute;
  top: -7px;
  right: -7px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f53f3f;
  border-radius: 29px;
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  color: #ffffff;
}
</style>