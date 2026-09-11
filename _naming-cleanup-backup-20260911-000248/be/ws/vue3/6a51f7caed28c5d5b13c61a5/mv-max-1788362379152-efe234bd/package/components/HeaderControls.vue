<template>
  <div class="header-controls">
    <!-- 图表图标 -->
    <div class="control-item">
      <img :src="icon1" alt="图表" class="control-icon" />
    </div>
    
    <!-- 列表图标（带角标） -->
    <div class="control-item control-item--with-badge">
      <img :src="icon2" alt="列表" class="control-icon" />
      <span class="badge">8</span>
    </div>
  </div>
</template>

<script setup>
// 图标资源由系统自动注入
// import icon1 from '../../resources/images/icon-7941.png'
// import icon2 from '../../resources/images/icon-7945.png'
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 右侧控件容器
.header-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  position: absolute;
  top: 6px;
  right: 16px;
}

// 单个控件项
.control-item {
  width: 24px;
  height: 24px;
  cursor: pointer;
  position: relative;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.8;
  }
}

// 图标样式
.control-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

// 角标容器（带通知数字的控件项）
.control-item--with-badge {
  // 预留角标空间
}

// 通知角标
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  background: #f53f3f;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>