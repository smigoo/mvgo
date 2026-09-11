<template>
  <div class="c-monitor-eq-grid">
    <div v-for="(item, index) in equipmentList" :key="index" class="c-monitor-eq-card">
      <div class="c-monitor-eq-icon">
        <img :src="item.icon" :alt="item.name" />
      </div>
      <div class="c-monitor-eq-info">
        <div class="c-monitor-eq-name" :style="{ backgroundImage: 'url(' + bg11 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ item.name }}</div>
        <div class="c-monitor-eq-value" :style="{ backgroundImage: 'url(' + bg12 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          (<span class="c-monitor-eq-online" :style="{ backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ item.online }}</span><span class="c-monitor-eq-total" :style="{ backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">/{{ item.total }}</span>)
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg12 from '../../resources/images/bg-8701.png'
import bg11 from '../../resources/images/bg-8672.png'
import bg8 from '../../resources/images/bg-8585.png'
import bg7 from '../../resources/images/bg-8556.png'
import icon3 from '../../resources/images/icon-8444.png'
import icon4 from '../../resources/images/icon-8473.png'
import icon5 from '../../resources/images/icon-8503.png'
import icon6 from '../../resources/images/icon-8532.png'
import icon7 from '../../resources/images/icon-8561.png'
import icon8 from '../../resources/images/icon-8590.png'
import icon9 from '../../resources/images/icon-8619.png'
import icon10 from '../../resources/images/icon-8648.png'
import icon11 from '../../resources/images/icon-8677.png'
import icon12 from '../../resources/images/icon-8706.png'
import icon13 from '../../resources/images/icon-8735.png'
import icon14 from '../../resources/images/icon-8764.png'


// 资源变量由系统自动注入，无需 import

const equipmentList = [
  { name: '摄像机', online: 2, total: 484, icon: icon3 },
  { name: '烟道机器人', online: 0, total: 484, icon: icon4 },
  { name: 'CO/VI检测器', online: 0, total: 484, icon: icon5 },
  { name: '光照度变送器', online: 0, total: 484, icon: icon6 },
  { name: '激光雷达', online: 0, total: 484, icon: icon7 },
  { name: '风速风向仪', online: 1, total: 484, icon: icon8 },
  { name: '温湿度传感器', online: 0, total: 484, icon: icon9 },
  { name: '紧急电话', online: 0, total: 484, icon: icon10 },
  { name: '超高检测器', online: 0, total: 484, icon: icon11 },
  { name: 'CO2传感器', online: 0, total: 484, icon: icon12 },
  { name: '压力传感器', online: 0, total: 484, icon: icon13 },
  { name: '水质监测设备', online: 0, total: 484, icon: icon14 },
]
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-eq-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  height: 100%;
  align-content: start;
}

.c-monitor-eq-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(100, 181, 246, 0.5);
  border-radius: 6px;
  padding: 8px 12px;
  box-sizing: border-box;
  min-height: 64px;
}

.c-monitor-eq-icon {
  flex-shrink: 0;
  width: 27px;
  height: 32px;
  
  img {
    width: 100%;
    height: 100%;
    display: block;
  }
}

.c-monitor-eq-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-eq-name {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #333333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-eq-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.143);
  font-weight: 500;
  color: #333333;
}

.c-monitor-eq-online {
  color: #64B5F6;
  font-weight: 700;
}

.c-monitor-eq-total {
  color: rgba(0, 0, 0, 0.45);
}
</style>