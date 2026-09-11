<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-device-monitor-header-stats">
        <!-- 设备类型 -->
        <div class="c-device-monitor-frame-2136638825">
          <span class="c-device-monitor-stat-label">设备类型</span>
          <span class="c-device-monitor-stat-value-primary">28</span>
        </div>
        <!-- 设备总数 -->
        <div class="c-device-monitor-frame-2136638826">
          <span class="c-device-monitor-stat-label">设备总数</span>
          <span class="c-device-monitor-stat-value-primary">68562</span>
        </div>
        <!-- 完好率 -->
        <div class="c-device-monitor-frame-2136638827">
          <span class="c-device-monitor-stat-label">完好率</span>
          <span class="c-device-monitor-stat-value-success">98%</span>
        </div>
      </div>
    </template>

    <!-- 主内容区：左侧Tab + 右侧内容 -->
    <div class="c-device-monitor-slot-con">

      <!-- 左侧垂直Tab切换栏 -->
      <div class="c-device-monitor-switch">
        <!-- 监控 Tab（active） -->
        <div
          class="c-device-monitor-active"
          :class="{ 'is-active': activeTab === 'monitor' }"
          :style="activeTab === 'monitor' ? { backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}"
          @click="activeTab = 'monitor'"
        >
          <div class="c-device-monitor-tab-text-group">
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-tab-name">监控</span>
            </div>
            <div class="c-device-monitor-line2">
              <span class="c-device-monitor-tab-badge-primary">3/3740</span>
            </div>
          </div>
          <div class="c-device-monitor-icon">
            <img :src="icon1" class="c-device-monitor-tab-icon" alt="监控" />
          </div>
        </div>

        <!-- 照明 Tab（default） -->
        <div
          class="c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'lighting' }"
          :style="activeTab === 'lighting' ? { backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}"
          @click="activeTab = 'lighting'"
        >
          <div class="c-device-monitor-tab-text-group">
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-tab-name">照明</span>
            </div>
            <div class="c-device-monitor-line2">
              <span class="c-device-monitor-tab-badge-error">3</span>
            </div>
          </div>
          <div class="c-device-monitor-icon">
            <img :src="icon2" class="c-device-monitor-tab-icon" alt="照明" />
          </div>
        </div>

        <!-- 通风 Tab -->
        <div
          class="c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'ventilation' }"
          @click="activeTab = 'ventilation'"
        >
          <div class="c-device-monitor-tab-text-group">
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-tab-name">通风</span>
            </div>
          </div>
        </div>

        <!-- 供配电 Tab -->
        <div
          class="c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'power' }"
          @click="activeTab = 'power'"
        >
          <div class="c-device-monitor-tab-text-group">
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-tab-name">供配电</span>
            </div>
          </div>
        </div>

        <!-- 消防 Tab -->
        <div
          class="c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'fire' }"
          @click="activeTab = 'fire'"
        >
          <div class="c-device-monitor-tab-text-group">
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-tab-name">消防</span>
            </div>
          </div>
        </div>

        <!-- 交通诱导 Tab -->
        <div
          class="c-device-monitor-default"
          :class="{ 'is-active': activeTab === 'traffic' }"
          @click="activeTab = 'traffic'"
        >
          <div class="c-device-monitor-tab-text-group">
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-tab-name">交通诱导</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="c-device-monitor-tab">

        <!-- 设备汇总卡片行（switch区域） -->
        <div class="c-device-monitor-cons-header">
          <!-- 隧道设备汇总卡（active） -->
          <div
            class="c-device-monitor-group-2136637321"
            :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <div class="c-device-monitor-bg">
              <img :src="icon3" class="c-device-monitor-summary-icon" alt="隧道设备" />
            </div>
            <div class="c-device-monitor-group-1321317970">
              <span class="c-device-monitor-summary-title">隧道设备</span>
              <div class="c-device-monitor-line1">
                <span class="c-device-monitor-summary-label">总 数:</span>
                <span class="c-device-monitor-summary-value-primary">56302</span>
              </div>
              <div class="c-device-monitor-line2">
                <span class="c-device-monitor-summary-label">异常数:</span>
                <span class="c-device-monitor-summary-value-error">5</span>
              </div>
            </div>
          </div>

          <!-- 南北接线设备汇总卡（default） -->
          <div class="c-device-monitor-group-2136637552"
            :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <div class="c-device-monitor-bg">
              <img :src="icon4" class="c-device-monitor-summary-icon" alt="南北接线设备" />
            </div>
            <div class="c-device-monitor-group-1321317970">
              <span class="c-device-monitor-summary-title">南北接线 设备</span>
              <div class="c-device-monitor-line1">
                <span class="c-device-monitor-summary-label">总 数:</span>
                <span class="c-device-monitor-summary-value-primary">1280</span>
              </div>
              <div class="c-device-monitor-line2">
                <span class="c-device-monitor-summary-label">异常数:</span>
                <span class="c-device-monitor-summary-value-error">3</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 设备类型监测网格（3列×4行） -->
        <div class="c-device-monitor-cons">

          <!-- 摄像机 -->
          <div
            class="c-device-monitor-group-2136637555"
            :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon5" class="c-device-monitor-device-icon" alt="摄像机" />
            <span class="c-device-monitor-device-name">摄像机</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-error">2</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 风速风向仪 -->
          <div
            class="c-device-monitor-group-2136637558"
            :style="{ backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon6" class="c-device-monitor-device-icon" alt="风速风向仪" />
            <span class="c-device-monitor-device-name">风速风向仪</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-error">1</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 超高检测器 -->
          <div
            class="c-device-monitor-group-2136637550"
            :style="{ backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon7" class="c-device-monitor-device-icon" alt="超高检测器" />
            <span class="c-device-monitor-device-name">超高检测器</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 烟道机器人 -->
          <div
            class="c-device-monitor-group-2136637553"
            :style="{ backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon8" class="c-device-monitor-device-icon" alt="烟道机器人" />
            <span class="c-device-monitor-device-name">烟道机器人</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 激光雷达 -->
          <div
            class="c-device-monitor-group-2136637556"
            :style="{ backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon9" class="c-device-monitor-device-icon" alt="激光雷达" />
            <span class="c-device-monitor-device-name">激光雷达</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- CO2传感器 -->
          <div
            class="c-device-monitor-group-2136637559"
            :style="{ backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon10" class="c-device-monitor-device-icon" alt="CO2传感器" />
            <span class="c-device-monitor-device-name">CO2传感器</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- CO/VI检测器 -->
          <div
            class="c-device-monitor-group-2136637551"
            :style="{ backgroundImage: 'url(' + bg11 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon11" class="c-device-monitor-device-icon" alt="CO/VI检测器" />
            <span class="c-device-monitor-device-name">CO/VI检测器</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 温湿度传感器 -->
          <div
            class="c-device-monitor-group-2136637554"
            :style="{ backgroundImage: 'url(' + bg12 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon12" class="c-device-monitor-device-icon" alt="温湿度传感器" />
            <span class="c-device-monitor-device-name">温湿度传感器</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 压力传感器 -->
          <div
            class="c-device-monitor-group-2136637557"
            :style="{ backgroundImage: 'url(' + bg13 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon13" class="c-device-monitor-device-icon" alt="压力传感器" />
            <span class="c-device-monitor-device-name">压力传感器</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 光照度变送器 -->
          <div
            class="c-device-monitor-group-2136637560"
            :style="{ backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="icon14" class="c-device-monitor-device-icon" alt="光照度变送器" />
            <span class="c-device-monitor-device-name">光照度变送器</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 紧急电话 -->
          <div class="c-device-monitor-group-2136637321-extra">
            <span class="c-device-monitor-device-name">紧急电话</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

          <!-- 水质监测设备 -->
          <div class="c-device-monitor-group-2136637552-extra">
            <span class="c-device-monitor-device-name">水质监测设备</span>
            <div class="c-device-monitor-device-value">
              <span class="c-device-monitor-device-num-secondary">0</span>
              <span class="c-device-monitor-device-num-secondary">/484</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  </base-panel>
</template>