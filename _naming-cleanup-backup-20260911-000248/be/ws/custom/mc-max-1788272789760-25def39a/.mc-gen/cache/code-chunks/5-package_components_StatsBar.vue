<template>
  <div class="c-monitor-stats-bar">
    <div
      v-for="card in switchCards"
      :key="card.key"
      class="c-monitor-stats-card"
      :class="{ 'c-monitor-stats-card--active': activeKey === card.key }"
      :style="{
        backgroundImage: `url(${activeKey === card.key ? bg1 : bg2})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }"
      @click="handleSwitch(card.key)"
    >
      <!-- 卡片图标（PNG 自带装饰，容器禁止加边框/背景） -->
      <img :src="card.icon" class="c-monitor-stats-card-icon" :alt="card.titleLines.join('')" />
      <!-- 卡片文字区：标题 + 总数行 + 异常数行（纵向堆叠） -->
      <div class="c-monitor-stats-card-body">
        <div class="c-monitor-stats-card-title">
          <span
            v-for="(line, idx) in card.titleLines"
            :key="idx"
            class="c-monitor-stats-card-title-line"
          >{{ line }}</span>
        </div>
        <div class="c-monitor-stats-card-line">
          <span class="c-monitor-stats-card-label">总数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--total">{{ card.total }}</span>
        </div>
        <div class="c-monitor-stats-card-line">
          <span class="c-monitor-stats-card-label">异常数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--abnormal">{{ card.abnormal }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// bg1/bg2/icon1/icon2 由系统自动注入（禁止手写 import）
// bg1 → switch-active 卡片背景（深蓝色渐变，193×65，圆角 6px 已画在图内）
// bg2 → switch-default 卡片背景（浅色，193×65）
// icon1 → 隧道设备图标（35×28） icon2 → 南北接线设备图标（35×28）

// 当前选中卡片（默认选中「隧道设备」，对应 Figma active 组）
const activeKey = ref('tunnel')

// 两张统计切换卡片（文案逐字来自设计稿文字清单）
const switchCards = [
  {
    key: 'tunnel',
    titleLines: ['隧道设备'],
    total: '56302',
    abnormal: '5',
    icon: icon1
  },
  {
    key: 'bridge',
    // Figma 原文「南北接线 / 设备」为两行排版（45×20，居中）
    titleLines: ['南北接线', '设备'],
    total: '1280',
    abnormal: '3',
    icon: icon2
  }
]

// 点击切换选中卡片（active/default 背景与配色随状态交换）
const handleSwitch = (key) => {
  if (activeKey.value === key) return
  activeKey.value = key
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* === 顶部统计切换栏（Figma switch 节点，396×65，两张卡片并排） === */
.c-monitor-stats-bar {
  width: 100%;
  height: 65px;
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  gap: 10px;
}

/* 单张统计卡片：背景图已含圆角/渐变，禁止再加 background/border-radius/border */
.c-monitor-stats-card {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  box-sizing: border-box;
  cursor: pointer;
}

/* 图标：Figma 35×28，PNG 自带边框底色，容器禁止任何装饰 */
.c-monitor-stats-card-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
  display: block;
}

/* 文字列：标题 + 两行数据，纵向堆叠（16 + 23 + 23 ≈ 卡片内容高） */
.c-monitor-stats-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.c-monitor-stats-card-title {
  display: flex;
  flex-direction: column;
}

/* 标题：YouSheBiaoTiHei 12px（Figma t-隧道设备 / t-南北接线 设备） */
.c-monitor-stats-card-title-line {
  display: block;
  font-family: 'YouSheBiaoTiHei', 'Source Han Sans CN', 'PingFang SC', sans-serif;
  font-size: calc(@fontSize * 0.86);
  line-height: 1.3;
  white-space: nowrap;
  color: #333333; /* Figma fills（default 组标题） */
}

/* 数据行：label + value 横向排列，垂直居中 */
.c-monitor-stats-card-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

/* label：Source Han Sans CN 14px（Figma t-总数: / t-异常数:） */
.c-monitor-stats-card-label {
  font-size: @fontSize;
  line-height: 1.5;
  color: #333333;
}

/* value：Roboto 20px bold（Figma d-56302 / d-1280 / d-5 / d-3） */
.c-monitor-stats-card-value {
  font-family: 'Roboto', 'PingFang SC', sans-serif;
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  line-height: 1.2;
}

/* 非选中卡片：总数蓝色（layoutStructure rgba(100,181,246,1)），异常数红色 */
.c-monitor-stats-card-value--total {
  color: rgba(100, 181, 246, 1);
}
.c-monitor-stats-card-value--abnormal {
  color: rgba(255, 77, 79, 1);
}

/* 选中卡片（深蓝渐变底）：标题纯白、label 白色 0.9、总数白色，异常数保持红色 */
.c-monitor-stats-card--active {
  .c-monitor-stats-card-title-line {
    color: #ffffff; /* Figma fills（active 组 t-隧道设备） */
  }
  .c-monitor-stats-card-label {
    color: rgba(255, 255, 255, 0.9);
  }
  .c-monitor-stats-card-value--total {
    color: #ffffff;
  }
}
</style>