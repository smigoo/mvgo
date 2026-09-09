<template>
  <div class="detail-box box-top-color">
    <!-- top -->
    <div class="detail-box-top" v-if="second">
      <!-- left -->
      <div class="detail-box-top-left">
        <div class="title">
          <slot name="title">{{ componentName }}</slot>
        </div>
      </div>
      <!-- right -->
      <div class="detail-box-top-right">
        <!--        <svg-icon icon-class="close" class="close" @click="close"></svg-icon>-->
      </div>
    </div>
    <!-- content -->
    <div class="detail-box-content">
      <div
        class="pannel"
        :class="{
          'component-box': type === 'component',
          'dycomponent-box': type === 'dynamic-component'
        }"
      >
        <div
          v-if="type === 'component'"
          class="mz-panel"
          :class="{
            second
          }"
        >
          <!-- top -->
          <div class="mz-panel-top" v-if="!second">
            <!-- left -->
            <div class="mz-panel-top-left">
              <div class="icon-left">
                <slot name="icon-left">
                  <i class="icon-left-img"></i>
                  <!-- <img src="./images/dot.png" alt="" /> -->
                </slot>
              </div>
              <div class="title">
                <slot name="title"></slot>
              </div>
              <div class="icon-info">
                <slot name="icon-info"></slot>
              </div>
            </div>
            <!-- right -->
            <div class="mz-panel-top-right">
              <slot name="top-right"></slot>
            </div>
            <!-- bg -->
            <div class="bg-box">
              <div class="left no-rem"></div>
              <div class="center"></div>
              <div class="right"></div>
            </div>
          </div>
          <!-- content -->
          <div class="mz-panel-content">
            <div class="title" v-if="second">
              <slot name="title"></slot>
            </div>
            <div class="mz-panel-content-main">
              <slot></slot>
            </div>
            <!-- bg -->
            <div class="mz-panel-bg no-rem">
              <div class="bg-box top no-rem">
                <div class="left"></div>
                <div class="center"></div>
                <div class="right"></div>
              </div>
              <div class="bg-box center no-rem">
                <div class="left"></div>
                <div class="center"></div>
                <div class="right"></div>
              </div>
              <div class="bg-box bottom no-rem">
                <div class="left"></div>
                <div class="center"></div>
                <div class="right"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-panel" ref="dialogPanel" v-else>
          <slot name="header">
            <div class="header">
              <div class="header-title" :title="componentName">{{ componentName }}</div>
              <!--              <div class="header-icon" @click="close">X</div>-->
            </div>
          </slot>
          <div class="pannel-content">
            <slot></slot>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
const basePanelProp = inject('basePanelProp')
defineProps({
  // 组件名称
  componentName: {
    type: String
  },
  // 组件类型
  type: {
    type: String,
    default: 'component'
  },
  second: {
    type: Boolean,
    default: true
  }
})
// 关闭弹框方法
const close = () => {
  console.log(11111)

  basePanelProp.close()
}
</script>
<style lang="less" scoped>
.detail-box {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: rgba(233, 240, 253, 0.5);
  border: 1px solid rgba(131, 163, 226, 0.5);
  padding: 5px 10px 10px;

  &-top {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
    overflow: hidden;

    &-left {
      display: flex;
      align-items: center;
      overflow: hidden;
      margin-right: 5px;
      z-index: 1;
      .title {
        .subhead();
      }
    }

    &-right {
      flex-shrink: 0;
      z-index: 1;
      .close {
        cursor: pointer;
      }
    }
  }

  &-content {
    position: relative;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  // 内容面板的间距
  /deep/.mz-panel {
    margin-right: 10px;
    &:last-child {
      margin: 0;
    }
  }
}
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
}
@import './styles/light.less';
.ellipsis() {
  white-space: nowrap; /* 防止文本换行 */
  overflow: hidden; /* 隐藏溢出的内容 */
  text-overflow: ellipsis; /* 显示省略号来代表被修剪的文本 */
}
// 副标题样式
.subhead() {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 14px;
  font-weight: 600;
}
.mz-panel {
  position: relative;
  // flex: 1;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  // overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  &-top {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 3px;
    margin-bottom: 5px;
    height: 32px;
    overflow: hidden;
    padding: 0 5px 4px 26px;

    &-left {
      display: flex;
      align-items: center;
      overflow: hidden;
      margin-right: 5px;
      z-index: 1;

      .icon-left {
        display: flex;

        .icon-left-img {
          width: 18px;
          height: 18px;
        }
      }

      .componentName {
        .ellipsis();
        // font-size: 16px;
        // font-family: @font-componentName-family;
        // font-weight: 400;
        padding-right: 2px;
        display: inline-block;
        margin-right: 3px;
        color: var(--text-inverse);
        // line-height: 21px;
        letter-spacing: 1.44px;
        // text-shadow: 0px 2px 1px rgba(62, 80, 118, 0.69);

        // background: #266bf4;
        font-size: 16px;
        font-weight: 700;
        text-align: LEFT;
        line-height: 20px;
        color: #266bf4;
        letter-spacing: 3px;
        // background-clip: text;
      }

      .icon-info {
        display: flex;

        img {
          width: 23.5px;
        }
      }
    }

    &-right {
      flex-shrink: 0;
      z-index: 1;
    }

    .bg-box {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      font-size: 0;
    }
  }

  @contentLeft: 5.4px; // 距离左边的距离

  &-content {
    position: relative;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    &-main {
      display: flex;
      height: 100%;
      margin-left: @contentLeft;
      position: relative;
      overflow: hidden;
      z-index: 1;
      padding: 5px 10px 0 10px;
    }
  }

  // background
  .mz-panel-bg {
    position: absolute;
    top: 0;
    left: @contentLeft;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    font-size: 0;
    // z-index: -1;
  }

  .bg-box {
    display: flex;

    > div {
      height: 100%;
    }
  }
}
.dialog-panel {
  .header {
    display: flex;
    width: 100%;
    height: 38px;
    background: linear-gradient(180deg, #bed9ff, #f9fcff 100%);
    position: relative;
    line-height: 38px;
    font-size: 16px;
    &-title {
      height: 100%;
      width: 86%;
      margin-left: 12px;
      font-family:
        Source Han Sans CN,
        Source Han Sans CN-500;
      font-weight: 700;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    &-icon {
      height: 100%;
      color: #4b81ff;
      position: absolute;
      right: 15px;
      cursor: pointer;
      font-weight: 700;
    }
  }
  .pannel-content {
    height: calc(100% - 38px - 20px);
    padding: 10px 20px;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid #dceaff;
    box-shadow:
      10px 10px 10px 0px var(--shadow-dropdown),
      0px 0px 5px 0px rgba(75, 129, 255, 0.39) inset;
  }
}
</style>
