<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1785972203029-cf5fa0f8-content">
      <div class="c-mc-max-1785972203029-cf5fa0f8-device-list">
        <!-- 设备卡片 1：摄像机 -->
        <div 
          class="c-mc-max-1785972203029-cf5fa0f8-device-card" 
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon1" class="c-mc-max-1785972203029-cf5fa0f8-device-icon" />
          <div class="c-mc-max-1785972203029-cf5fa0f8-device-info">
            <span class="c-mc-max-1785972203029-cf5fa0f8-device-name">摄像机</span>
            <div class="c-mc-max-1785972203029-cf5fa0f8-device-stats">
              <span class="c-mc-max-1785972203029-cf5fa0f8-device-online">128</span>
              <span class="c-mc-max-1785972203029-cf5fa0f8-device-total">/130</span>
            </div>
          </div>
        </div>
        
        <!-- 设备卡片 2：情报板 -->
        <div 
          class="c-mc-max-1785972203029-cf5fa0f8-device-card" 
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon2" class="c-mc-max-1785972203029-cf5fa0f8-device-icon" />
          <div class="c-mc-max-1785972203029-cf5fa0f8-device-info">
            <span class="c-mc-max-1785972203029-cf5fa0f8-device-name">情报板</span>
            <div class="c-mc-max-1785972203029-cf5fa0f8-device-stats">
              <span class="c-mc-max-1785972203029-cf5fa0f8-device-online">45</span>
              <span class="c-mc-max-1785972203029-cf5fa0f8-device-total">/48</span>
            </div>
          </div>
        </div>

        <!-- 设备卡片 3：气象检测器 -->
        <div 
          class="c-mc-max-1785972203029-cf5fa0f8-device-card" 
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon3" class="c-mc-max-1785972203029-cf5fa0f8-device-icon" />
          <div class="c-mc-max-1785972203029-cf5fa0f8-device-info">
            <span class="c-mc-max-1785972203029-cf5fa0f8-device-name">气象检测器</span>
            <div class="c-mc-max-1785972203029-cf5fa0f8-device-stats">
              <span class="c-mc-max-1785972203029-cf5fa0f8-device-online">22</span>
              <span class="c-mc-max-1785972203029-cf5fa0f8-device-total">/24</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>