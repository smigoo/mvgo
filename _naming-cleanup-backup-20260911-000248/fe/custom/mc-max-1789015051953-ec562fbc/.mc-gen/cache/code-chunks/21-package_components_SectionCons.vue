<template>
  <div class="c-device-monitor-cons">
    <!-- 摄像机卡片 -->
    <div
      class="c-device-monitor-group-2136637321"
      :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon3" class="c-device-monitor-device-icon" alt="摄像机" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">摄像机</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-error">(2/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 风速风向仪卡片 -->
    <div
      class="c-device-monitor-group-2136637553"
      :style="{ backgroundImage: `url(${bg8})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon8" class="c-device-monitor-device-icon" alt="风速风向仪" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">风速风向仪</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-error">(1/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 超高检测器卡片 -->
    <div
      class="c-device-monitor-group-2136637551"
      :style="{ backgroundImage: `url(${bg11})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon11" class="c-device-monitor-device-icon" alt="超高检测器" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">超高检测器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 烟道机器人卡片 -->
    <div
      class="c-device-monitor-group-2136637552"
      :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon4" class="c-device-monitor-device-icon" alt="烟道机器人" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">烟道机器人</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 激光雷达卡片 -->
    <div
      class="c-device-monitor-group-2136637550"
      :style="{ backgroundImage: `url(${bg7})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon7" class="c-device-monitor-device-icon" alt="激光雷达" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">激光雷达</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- CO2传感器卡片 -->
    <div
      class="c-device-monitor-group-2136637554"
      :style="{ backgroundImage: `url(${bg12})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon12" class="c-device-monitor-device-icon" alt="CO2传感器" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">CO2传感器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- CO/VI检测器卡片 -->
    <div
      class="c-device-monitor-group-2136637555"
      :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon5" class="c-device-monitor-device-icon" alt="CO/VI检测器" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">CO/VI检测器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 温湿度传感器卡片 -->
    <div
      class="c-device-monitor-group-2136637556"
      :style="{ backgroundImage: `url(${bg9})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon9" class="c-device-monitor-device-icon" alt="温湿度传感器" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">温湿度传感器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 压力传感器卡片 -->
    <div
      class="c-device-monitor-group-2136637557"
      :style="{ backgroundImage: `url(${bg13})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon13" class="c-device-monitor-device-icon" alt="压力传感器" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">压力传感器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 光照度变送器卡片 -->
    <div
      class="c-device-monitor-group-2136637558"
      :style="{ backgroundImage: `url(${bg6})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon6" class="c-device-monitor-device-icon" alt="光照度变送器" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">光照度变送器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 紧急电话卡片 -->
    <div
      class="c-device-monitor-group-2136637559"
      :style="{ backgroundImage: `url(${bg10})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon10" class="c-device-monitor-device-icon" alt="紧急电话" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">紧急电话</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 水质监测设备卡片 -->
    <div
      class="c-device-monitor-group-2136637560"
      :style="{ backgroundImage: `url(${bg14})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-bg">
        <img :src="icon14" class="c-device-monitor-device-icon" alt="水质监测设备" />
        <div class="c-device-monitor-group-1321317970">
          <span class="c-device-monitor-device-name">水质监测设备</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/* 设备类型监测网格 — 12 张卡片，3 列布局 */
/* 资源变量由系统自动注入，禁止手写 import */
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-cons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

/* 每张卡片公共样式 */
.c-device-monitor-group-2136637321,
.c-device-monitor-group-2136637552,
.c-device-monitor-group-2136637555,
.c-device-monitor-group-2136637558,
.c-device-monitor-group-2136637550,
.c-device-monitor-group-2136637553,
.c-device-monitor-group-2136637556,
.c-device-monitor-group-2136637559,
.c-device-monitor-group-2136637551,
.c-device-monitor-group-2136637554,
.c-device-monitor-group-2136637557,
.c-device-monitor-group-2136637560 {
  width: 117px;
  height: 64px;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;

  .c-device-monitor-bg {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 100%;
    padding: 4px 6px;
    box-sizing: border-box;
  }
}

.c-device-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-device-monitor-group-1321317970 {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.c-device-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: var(--colorTextBase, #333333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.c-device-monitor-device-num-error {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorError, #ff4d4f);
  white-space: nowrap;
}

.c-device-monitor-device-num-secondary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorTextSecondary, #666666);
  white-space: nowrap;
}
</style>