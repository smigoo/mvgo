<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-max-1786072591718-4d4c4b19-content"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 环境指标概览 -->
      <EnvStatCards 
        :icons="[icon1, icon2, icon3, icon4]" 
      />
      
      <!-- 环境趋势图表 -->
      <EnvTrendChart />
    </div>
  </base-panel>
</template>