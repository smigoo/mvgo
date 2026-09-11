<template>
  <!-- 标签页导航区：tabs-list 整体背景图 + 各 tab 按钮（激活态使用 bg2 背景图） -->
  <div class="header-tabs-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <!-- tabs-list：整体背景图容器 -->
    <div
      class="tabs-list"
      :style="{ backgroundImage: `url(${bg1})` }"
    >
      <!-- 各 tab 按钮，激活态使用 bg2 背景图 -->
      <button
        v-for="(tab, index) in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ 'is-active': activeTab === index }"
        :style="activeTab === index ? { backgroundImage: `url(${bg2})` } : {}"
        @click="handleTabClick(index)"
      >
        {{ tab.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-tab-active-7891.png'
import bg1 from '../../resources/images/bg-7890.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

// 标签页导航子组件
// 负责渲染四个监测指标 tab（一氧化碳/能见度/洞内照明/洞外光强）
// 整体背景使用 bg1 图片，激活态 tab 使用 bg2 图片
// bg1/bg2/icon1/icon2 由系统自动注入，禁止手写 import

import { ref} from 'vue'

// #region 1. Props 定义
const props = defineProps({
  // 当前激活的 tab 索引，由父组件传入
  activeTab: {
    type: Number,
    default: 0
  }
})
// #endregion

// #region 2. Emits 定义
const emit = defineEmits(['tab-change'])
// #endregion

// #region 3. 响应式状态
// tab 列表数据，按 Figma 标注顺序排列
// 标签文字：Figma 节点标注为"一氧化碳/能见度/洞内照明/洞外光强"
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'light-intensity', label: '洞外光强' }
])
// #endregion

// #region 4. 方法
// 点击 tab 按钮，向父组件 emit 切换事件
const handleTabClick = (index) => {
  emit('tab-change', index)
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 标签页导航根容器
// 横向排列，撑满宽度
.header-tabs-root {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  width: 100%;
  // 不加任何背景/阴影/圆角，由 tabs-list 子容器承载背景图
}

// tabs-list 容器：承载整体背景图 bg1（295×27px）
// 横向排列各 tab 按钮，背景图按 Figma 精确还原尺寸
.tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  // 按 Figma 节点 bg 尺寸 295×27 渲染，禁止拉伸铺满
  width: 295px;
  height: 27px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  // border/background/border-radius 均由背景图承载，不额外添加
  overflow: hidden;
}

// tab 按钮基础样式
// 非激活态：透明背景 + 蓝色文字
.tab-item {
  // 重置按钮默认样式
  border: none;
  outline: none;
  cursor: pointer;

  // 布局：flex 等分，撑满 tabs-list
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  // 字体：Figma 标注 font-size 14px font-weight 500
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  font-family: 'Source Han Sans CN', sans-serif;

  // 非激活态文字色：Figma 标注 #2c9bea
  color: #2c9bea;
  // 非激活态背景透明
  background-color: transparent;
  background-image: none;

  padding: 0;
  white-space: nowrap;

  // 过渡动画
  transition: color 0.2s;
}

// 激活态 tab：使用 bg2 背景图 + 白色文字
// bg2 尺寸 78×21px，挂到当前激活项
.tab-item.is-active {
  // 背景图由 :style 绑定 bg2 变量，此处补充背景属性
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  // 激活态文字色：Figma 标注白色 #ffffff，带蓝色阴影
  color: #ffffff;
  // Figma 节点 DROP_SHADOW：offset(0, 0.6) radius=0 rgba(0,111,227,1)
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  font-weight: 500;
}
</style>