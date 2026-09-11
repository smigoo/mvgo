<template>
  <base-panel class="c-mc-max-1789015051953-ec562fbc" panelKey="default-panel">
    <template #header-right>
      <div class="c-device-monitor-8bg3u6ns-c-device-monitor-header" :style="{ backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <div class="c-device-monitor-8bg3u6ns-c-device-monitor-frame-2136638825" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-label" :style="{ ...{ ...{ ...{ ...{ ...{ ...{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg11 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg12 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg13 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">设备类型</span>
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-primary" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">28</span>
        </div>
        <div class="c-device-monitor-8bg3u6ns-c-device-monitor-frame-2136638826" :style="{ backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-label">设备总数</span>
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-primary" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">68562</span>
        </div>
        <div class="c-device-monitor-8bg3u6ns-c-device-monitor-frame-2136638827" :style="{ backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-label">完好率</span>
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-success" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">98%</span>
        </div>
      </div>
    </template>

    <div class="c-device-monitor-8bg3u6ns-c-device-monitor-slot-con">
      <!-- 左侧垂直Tab切换栏 -->
      <div class="c-device-monitor-8bg3u6ns-c-device-monitor-switch">
        <!-- 监控Tab（active） -->
        <div
          class="c-device-monitor-8bg3u6ns-c-device-monitor-active"
          :class="{ 'is-active': activeTab === 'monitor' }"
          @click="activeTab = 'monitor'"
        >
          <div class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-content">
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">监控</span>
            </div>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-line2">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-badge-primary">3/3740</span>
            </div>
          </div>
        </div>
        <!-- 照明Tab -->
        <div
          class="c-device-monitor-8bg3u6ns-c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'lighting' }"
          @click="activeTab = 'lighting'"
        >
          <div class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-content">
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">照明</span>
            </div>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-line2">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-badge-error">3</span>
            </div>
          </div>
        </div>
        <!-- 通风Tab -->
        <div
          class="c-device-monitor-8bg3u6ns-c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'ventilation' }"
          @click="activeTab = 'ventilation'"
        >
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">通风</span>
        </div>
        <!-- 供配电Tab -->
        <div
          class="c-device-monitor-8bg3u6ns-c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'power' }"
          @click="activeTab = 'power'"
        >
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">供配电</span>
        </div>
        <!-- 消防Tab -->
        <div
          class="c-device-monitor-8bg3u6ns-c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'fire' }"
          @click="activeTab = 'fire'"
        >
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">消防</span>
        </div>
        <!-- 交通诱导Tab -->
        <div
          class="c-device-monitor-8bg3u6ns-c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'traffic' }"
          @click="activeTab = 'traffic'"
        >
          <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">交通诱导</span>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="c-device-monitor-8bg3u6ns-c-device-monitor-tab">
        <!-- 设备汇总卡片行 -->
        <div class="c-device-monitor-8bg3u6ns-c-device-monitor-cons" style="display:flex; flex-direction:row; gap:8px;">
          <!-- 隧道设备汇总卡 -->
          <div class="c-device-monitor-8bg3u6ns-c-device-monitor-active c-device-monitor-8bg3u6ns-c-device-monitor-summary-card" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-icon">
              <img class="c-device-monitor-隧道-1" alt="隧道设备" />
            </div>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-content">
              <div class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name c-device-monitor-8bg3u6ns-c-device-monitor-summary-title">隧道设备</div>
              <div class="c-device-monitor-line1">
                <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-label">总数:</span>
                <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-primary">56302</span>
              </div>
              <div class="c-device-monitor-8bg3u6ns-c-device-monitor-line2">
                <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-label">异常数:</span>
                <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-error">5</span>
              </div>
            </div>
          </div>
          <!-- 南北接线设备汇总卡 -->
          <div class="c-device-monitor-8bg3u6ns-c-device-monitor-default c-device-monitor-8bg3u6ns-c-device-monitor-summary-card">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-icon">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-extension-cord-1" alt="南北接线设备" />
            </div>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-content">
              <div class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name c-device-monitor-8bg3u6ns-c-device-monitor-summary-title">南北接线 设备</div>
              <div class="c-device-monitor-line1">
                <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-label">总数:</span>
                <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-primary">1280</span>
              </div>
              <div class="c-device-monitor-8bg3u6ns-c-device-monitor-line2">
                <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-label">异常数:</span>
                <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-error">3</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 设备类型监测网格 (3列×4行) -->
        <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321315882">
          <!-- 摄像机 -->
          <div class="c-device-monitor-group-2136637321">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="摄像机" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">摄像机</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970"><img :src="icon3" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" />
              <img :src="icon14" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon13" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon12" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon11" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon10" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon9" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon8" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon7" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon6" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon5" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><img :src="icon4" class="auto-mounted-icon" style="width:27px;height:32px;object-fit:contain" alt="icon" /><span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-error">(2/484)</span>
            </div>
          </div>
          <!-- 风速风向仪 -->
          <div class="c-device-monitor-group-2136637553">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="风速风向仪" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">风速风向仪</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-error">(1/484)</span>
            </div>
          </div>
          <!-- 超高检测器 -->
          <div class="c-device-monitor-group-2136637551">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="超高检测器" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">超高检测器</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- 烟道机器人 -->
          <div class="c-device-monitor-group-2136637552">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-robotman-1" alt="烟道机器人" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">烟道机器人</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- 激光雷达 -->
          <div class="c-device-monitor-group-2136637550">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="激光雷达" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">激光雷达</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- CO2传感器 -->
          <div class="c-device-monitor-group-2136637554">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="CO2传感器" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">CO2传感器</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- CO/VI检测器 -->
          <div class="c-device-monitor-group-2136637555">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="CO/VI检测器" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">CO/VI检测器</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- 温湿度传感器 -->
          <div class="c-device-monitor-group-2136637556">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="温湿度传感器" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">温湿度传感器</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- 压力传感器 -->
          <div class="c-device-monitor-group-2136637557">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="压力传感器" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">压力传感器</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- 光照度变送器 -->
          <div class="c-device-monitor-group-2136637558">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="光照度变送器" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">光照度变送器</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- 紧急电话 -->
          <div class="c-device-monitor-group-2136637559">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="紧急电话" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">紧急电话</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
          <!-- 水质监测设备 -->
          <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2136637560">
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-2">
              <img class="c-device-monitor-8bg3u6ns-c-device-monitor-frame" alt="水质监测设备" />
            </div>
            <span class="c-device-monitor-8bg3u6ns-c-device-monitor-tab-name">水质监测设备</span>
            <div class="c-device-monitor-8bg3u6ns-c-device-monitor-group-1321317970">
              <span class="c-device-monitor-8bg3u6ns-c-device-monitor-stat-value-normal">(0/484)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg8 from '../resources/images/bg-8439.png'
import bg1 from '../resources/images/bg-8788.png'
import bg2 from '../resources/images/bg-8807.png'
import icon3 from '../resources/images/icon-8444.png'
import icon14 from '../resources/images/icon-8764.png'
import icon13 from '../resources/images/icon-8735.png'
import icon12 from '../resources/images/icon-8706.png'
import icon11 from '../resources/images/icon-8677.png'
import icon10 from '../resources/images/icon-8648.png'
import icon9 from '../resources/images/icon-8619.png'
import icon8 from '../resources/images/icon-8590.png'
import icon7 from '../resources/images/icon-8561.png'
import icon6 from '../resources/images/icon-8532.png'
import icon5 from '../resources/images/icon-8503.png'
import icon4 from '../resources/images/icon-8473.png'
const bg5 = bg8
const bg9 = bg8
const bg10 = bg8
const bg11 = bg8
const bg12 = bg8
const bg13 = bg8
const bg14 = bg8
const bg6 = bg8
const bg4 = bg8
const bg7 = bg8
const bg3 = bg8


import {ref, onMounted} from 'vue'

// === $mcComponentBuilder 调用（仅此一次，直接解构） ===

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// === 左侧 Tab 切换状态 ===

// === onMounted 触发 onload 事件（在第2/3部分执行，此处仅定义触发函数） ===

const emitOnload = () => {
  runtimeBuilder.publishEvent('device-monitor-onload', {
    componentId: 'c-device-monitor-8bg3u6ns',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitOnload()
})

import {onUnmounted, watch} from 'vue'

// === $mcComponentBuilder 初始化（直接解构，只能调用一次）===

// === Tab 切换状态（主组件持有，template 中已绑定）===

const activeTab = ref('monitor')

// === Tab 切换处理函数 ===

const handleTabChange = (tabKey) => {
  if (activeTab.value === tabKey) return
  activeTab.value = tabKey
}

// === 监听 Tab 切换（预留：未来可按 tab 加载不同数据）===

watch(activeTab, (newTab) => {
  // 目前为静态展示，切换 Tab 时仅更新 active 样式
  // 若后续接入 API，在此处调用 componentApi.getCommonApiFindList
  console.log('[设备监测] Tab 切换至:', newTab)
})

// === 生命周期：onMounted ===

// === 生命周期：onUnmounted ===

onUnmounted(() => {
  // 当前无需清理的定时器或监听器
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>