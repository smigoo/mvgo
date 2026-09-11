<template>
  <!-- Tab切换控件：氧化碳/能见度/洞内照明/洞外光强 -->
  <div class="header-controls">
<div class="header-controls__bg" :style="{ backgroundImage: `url(${bg1})` }" >
<div v-for="(tab, index) in tabs" :key="index" class="header-controls__tab" :class="{ 'header-controls__tab--active': index === activeTab }" :style="index === activeTab ? { backgroundImage: `url(${bg2})` } : {}" @click="handleTabClick(index)" >
        {{ tab }}
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'

// Tab切换控件子组件
// 职责：渲染四个 Tab（一氧化碳、能见度、洞内照明、洞外光强），管理选中态高亮，点击时通知父组件
// 数据来源：tabs 数组为静态配置，activeTab 由父组件传入控制选中态

import { ref} from 'vue'

// #region Props定义
const props = defineProps({ // 当前激活的 Tab 索引 activeTab: { type: Number, default: 0 }, // 背景图1：整体 tabs-list 容器背景 bg1: { type: String, required: true }, // 背景图2：激活态 tab 的背景 bg2: { type: String, required: true }
})
// #endregion

// #region Emits定义
const emit = defineEmits(['tab-change'])
// #endregion

// #region 响应式状态

// Tab 选项数组（对应 Figma 设计：一氧化碳、能见度、洞内照明、洞外光强）
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])

// #endregion

// #region 方法

// Tab 点击处理：通知父组件切换 activeTab，父组件联动刷新图表数据
const handleTabClick = (index) => { if (index === props.activeTab) return // 点击当前 tab 不重复触发 emit('tab-change', index)
}

// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// Tab控件容器
.header-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
}

// 背景容器：挂载 bg1（整体背景图）
.header-controls__bg {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0;
  // 背景图：bg1（295×27px，Figma 节点 tabs-list - bg）
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 3.5px 8px;
  border-radius: 4px;
  // 白色描边（Figma stroke 0.72px）
  border: 0.72px solid rgba(255, 255, 255, 1);
}

// 单个 Tab 项
.header-controls__tab {
  padding: 4px 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea; // 未激活态文字：蓝色（Figma "能见度/洞内照明/洞外光强" 节点 fill）;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  flex-shrink: 0;
  user-select: none;

  &:hover {
    opacity: 0.8;
  }

  // 激活态：挂载 bg2（78×21px，Figma bg-tab-active）+ 白色文字
  &--active {
    color: #ffffff; // 激活态文字：白色（Figma "一氧化碳" 节点 fill）;
    background-size: 100% 100%;
    background-position: center center;
    background-repeat: no-repeat;
    // 白色描边（Figma stroke 0.6px）
    border: 0.6px solid rgba(255, 255, 255, 1);
    // 投影：蓝色底光（Figma effect DROP_SHADOW offset(0, 0.6) radius=0 #006fe3）
    box-shadow: 0 0.6px 0 0 rgba(0, 111, 227, 1);
  }
}
</style>