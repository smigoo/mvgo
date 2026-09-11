<template>
  <div class="header-section">
    <div class="header-icon">
      <img :src="icon1" alt="装饰图标" class="icon-img" />
    </div>
    <div class="header-title">环境监测</div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'

import { ref} from 'vue'

// #region 1. 图片资源
// 注意：这些变量由系统自动注入，组件内部不需要 import
// 系统会在父级作用域注入：import icon1 from '../../resources/images/icon-7941.png'
// 子组件通过 props 或全局注入接收，这里直接使用变量名

// #endregion

// #region 2. 组件说明
/**
 * HeaderSection - 面板标题区组件
 * 
 * 功能：展示环境监测面板的标题与装饰图标
 * 布局：横向排列（图标左 + 标题右）
 * 数据来源：静态标题文字 + 图标资源注入
 * 
 * 样式特点：
 * - 标题使用蓝色渐变色（#1990ff → #5a7eff）
 * - 左侧圆形装饰图标（8×8px）
 * - 水平排列，间距 8px
 */
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.header-section {
  display: flex;
  flex-direction: row; // Figma 标注 HORIZONTAL;
  align-items: center;
  gap: 8px;
  padding: 14px 0 10px;
  
  .header-icon {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    
    .icon-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }
  
  .header-title {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 16px;
    font-weight: 700;
    line-height: 19.2px;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent; // 兜底：渐变文字失效时显示透明（避免黑色文本）;
  }
}</style>