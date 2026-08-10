<template>
  <div class="device-card" :style="{ backgroundImage: `url(${bgImage})` }">
    <!-- 设备图标区域 -->
    <div class="device-card__icon-wrapper">
      <img :src="iconImage" :alt="name" class="device-card__icon" />
    </div>
    
    <!-- 设备文字信息区域 -->
    <div class="device-card__info">
      <div class="device-card__name">{{ name }}</div>
      <div class="device-card__count">{{ count }}</div>
    </div>
  </div>
</template>

<script setup>
// 设备卡片子组件
// 用于展示单个设备的名称、异常/总数统计及对应图标
// 背景与图标由父组件通过 props 传入，支持网格化批量渲染

import { defineProps } from 'vue'

// #region 1. Props 定义
const props = defineProps({ // 设备名称（如：摄像机、烟道机器人） name: { type: String, default: '' }, // 设备数量统计，严格保留括号格式（如：'(2/484)'） count: { type: String, default: '(0/0)' }, // 卡片背景图 URL（由父组件注入的图片变量） bgImage: { type: String, default: '' }, // 设备图标 URL（由父组件注入的图片变量） iconImage: { type: String, default: '' }
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 设备卡片容器：固定尺寸，背景图铺满，横向布局（图标在左，文字在右）
.device-card {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px 10px;
  box-sizing: border-box;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease;

  // 悬停时轻微上浮，增强交互感
  &:hover {
    transform: translateY(-2px);
  }
}

// 图标容器：固定尺寸，防止图标被压缩
.device-card__icon-wrapper {
  flex-shrink: 0;
  width: 28px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
}

// 图标本身：保持原始比例，包含在容器内
.device-card__icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

// 文字信息区域：纵向堆叠名称与数量
.device-card__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

// 设备名称：单行显示，溢出省略
.device-card__name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// 设备数量统计：使用 Roboto 字体，突出数字
.device-card__count {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 18.75px;
  color: #333333;
  white-space: nowrap;
}</style>