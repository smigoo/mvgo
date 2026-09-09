<template>
  <div
    class="pannel"
    :class="{
      'component-box': type === 'component',
      'dycomponent-box': type === 'dynamic-component'
    }"
  >
    <div class="component-header" v-if="type === 'component'">
      <div class="header">
        <div class="title-left" v-if="slot['title-left']">
          <slot name="title-left"></slot>
        </div>
        <div class="header-title">{{ componentName }}</div>
        <div class="title-right" v-if="slot['title-right']">
          <slot name="title-right"></slot>
        </div>
        <div class="header-right" v-if="slot['header-right']">
          <slot name="header-right"></slot>
        </div>
      </div>
      <div class="bottom">
        <div class="bottom-icon">
          <img src="../../../assets/images/circle.png" />
        </div>
        <div class="bottom-hr"></div>
      </div>
    </div>
    <div class="dycomponent-header" v-else>
      <div class="header">
        <div class="title-left" v-if="slot['title-left']">
          <slot name="title-left"></slot>
        </div>
        <div class="header-title">{{ componentName }}</div>
        <div class="title-right" v-if="slot['title-right']">
          <slot name="title-right"></slot>
        </div>
        <div class="header-right" v-if="slot['header-right']">
          <slot name="header-right"></slot>
        </div>
        <slot name="close">
          <div class="header-icon" @click="close">
            <CloseOutlined />
          </div>
        </slot>
      </div>
      <div class="bottom-hr"></div>
    </div>
    <div class="pannel-content" id="pannel-content">
      <slot></slot>
    </div>
  </div>
</template>
<script setup>
import { CloseOutlined } from '@ant-design/icons-vue'
const basePanelProp = inject('basePanelProp')
const slot = defineSlots()
defineProps({
  // 组件名称
  componentName: {
    type: String
  },
  // 组件类型
  type: {
    type: String,
    default: 'component'
  }
})
// 关闭弹框方法
const close = () => {
  basePanelProp.close()
}
</script>
<style lang="less" scoped>
// 面板通用样式
.pannel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  .pannel-title {
    width: 100%;
    height: 38px;
  }
  .pannel-header {
    width: 100%;
    height: 38px;
  }
  .pannel-content {
    height: calc(100% - 38px);
    padding: 5px 10px 5px 10px;
    flex: 1;
  }
  // 常态组件面板头部
  .component-header {
    .header {
      display: flex;
      align-items: center;
      padding: 0 15px;
      color: #1990ff;
      font-size: 16px;
      font-family:
        Noto Sans SC,
        Noto Sans SC-700;
      font-weight: 700;
      text-align: bottom;
      line-height: 38px;
      position: relative;
      &-title {
        flex-shrink: 0;
      }
      .title-left,
      .title-right {
        padding: 0 5px;
      }
      &-right {
        margin: 0 0 0 auto;
        display: flex;
        align-items: center;
      }
      &-icon {
        width: 13px;
        height: 13px;
      }
    }
    .bottom {
      display: flex;
      position: relative;
      &-icon {
        width: 9px;
        height: 9px;
        position: absolute;
        top: -15px;
        left: 15px;
      }
      &-hr {
        width: 88%;
        height: 0px;
        border: 1px solid;
        border-image: linear-gradient(90deg, #84b8ff 89%, rgba(132, 184, 255, 0) 100%) 1 1;
        margin-left: 20px;
      }
    }
    .header-icon-text {
      position: absolute;
      right: 30px;
      font-size: 12px;
      font-weight: 400;
    }
  }
  // 动态组件面板头
  .dycomponent-header {
    .header {
      display: flex;
      align-items: center;
      width: 100%;
      height: 38px;
      padding: 0 12px;
      color: #1990ff;
      font-size: 16px;
      font-family:
        Noto Sans SC,
        Noto Sans SC-700;
      font-weight: 700;
      text-align: LEFT;
      line-height: 38px;
      position: relative;
      &-title {
        flex-shrink: 0;
      }
      .title-left,
      .title-right {
        padding: 0 5px;
      }
      &-right {
        margin: 0 5px 0 auto;
        display: flex;
        align-items: center;
      }
      &-icon {
        cursor: pointer;
      }
    }
    .bottom-hr {
      width: 94%;
      border: 1px solid;
      border-image: linear-gradient(90deg, #027cfb 0%, #b7daff 100%) 1 1;
      box-shadow: 1px 1px 0px 0px #ffffff;
      margin-left: 12px;
    }
    .pannel-content {
      height: calc(100% - 38px - 20px);
      padding: 10px 20px;
    }
  }
}

// 动态组件背景色
.dycomponent-box {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0px 4px 10px 0px rgba(74, 117, 141, 0.25);
}

// 常态组件背景色
.component-box {
  background: rgba(237, 244, 251, 1);
  box-shadow: 0px 4px 10px 0px rgba(74, 117, 141, 0.25);
}
</style>
