<template>
  <div class="c-mc-1785752098305-41f2ffab-section">
    <div class="c-mc-1785752098305-41f2ffab-sub-header">
      <div class="c-mc-1785752098305-41f2ffab-title-group">
        <img :src="icon54" class="c-mc-1785752098305-41f2ffab-title-icon" alt="icon" />
        <span class="c-mc-1785752098305-41f2ffab-title-text">车型分布</span>
      </div>
    </div>
    <div class="c-mc-1785752098305-41f2ffab-vehicle-row">
      <div
        v-for="item in vehicleList"
        :key="item.name"
        class="c-mc-1785752098305-41f2ffab-vehicle-card"
        :style="{ backgroundImage: `url(${item.cardBg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
      >
        <div
          class="c-mc-1785752098305-41f2ffab-vehicle-title"
          :style="{ backgroundImage: `url(${item.titleBg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <span>{{ item.name }}</span>
        </div>
        <div class="c-mc-1785752098305-41f2ffab-vehicle-stats">
          <div class="c-mc-1785752098305-41f2ffab-vehicle-item">
            <span class="c-mc-1785752098305-41f2ffab-vehicle-label">客车</span>
            <span class="c-mc-1785752098305-41f2ffab-vehicle-value passenger">{{ item.passenger }}</span>
          </div>
          <div class="c-mc-1785752098305-41f2ffab-vehicle-item">
            <span class="c-mc-1785752098305-41f2ffab-vehicle-label">货车</span>
            <span class="c-mc-1785752098305-41f2ffab-vehicle-value freight">{{ item.freight }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon54 from '../../resources/images/icon-3441.png'
import bg3 from '../../resources/images/bg-3475.png'
import bg5 from '../../resources/images/bg-3525.png'
import bgm_3 from '../../resources/images/bg-_m-36.png'
import bgm_4 from '../../resources/images/bg-_m-35.png'

const vehicleList = [
  { name: '江阴靖江长江隧道', cardBg: bgm_3, titleBg: bg3, passenger: 22350, freight: 16270 },
  { name: '江阴大桥', cardBg: bgm_4, titleBg: bg5, passenger: 66109, freight: 16270 }
]
</script>
