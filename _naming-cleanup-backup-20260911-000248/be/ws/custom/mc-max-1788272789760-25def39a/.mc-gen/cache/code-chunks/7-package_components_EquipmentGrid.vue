<template>
  <div class="c-monitor-eq-grid">
    <div v-for="(item, index) in equipmentList" :key="index" class="c-monitor-eq-card">
      <div class="c-monitor-eq-icon">
        <img :src="item.icon" :alt="item.name" />
      </div>
      <div class="c-monitor-eq-info">
        <div class="c-monitor-eq-name">{{ item.name }}</div>
        <div class="c-monitor-eq-value">
          (<span class="c-monitor-eq-online">{{ item.online }}</span><span class="c-monitor-eq-total">/{{ item.total }}</span>)
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
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
  font-size: calc(@fontSize * 0.857);
  color: #333333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-eq-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
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