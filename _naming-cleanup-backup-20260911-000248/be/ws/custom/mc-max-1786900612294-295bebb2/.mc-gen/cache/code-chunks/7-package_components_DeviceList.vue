<template>
  <div class="c-device-list-root">
    <div class="c-device-list-grid">
      <div
        v-for="(item, index) in deviceList"
        :key="index"
        class="c-device-list-card"
      >
        <div class="c-device-list-card-body">
          <img
            :src="item.icon"
            :alt="item.name"
            class="c-device-list-card-icon"
          />
          <div class="c-device-list-card-content">
            <span class="c-device-list-card-label">{{ item.name }}</span>
            <span class="c-device-list-card-value">
              <span class="c-device-list-card-value-danger">{{ item.abnormal }}</span>
              <span class="c-device-list-card-value-unit">{{ item.unit }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 设备列表数据：文本与 Figma 逐字符保持一致，含括号
const deviceList = ref([
  { name: '摄像机', abnormal: '(2', unit: '/484)', icon: icon5 },
  { name: '风速风向仪', abnormal: '(1', unit: '/484)', icon: icon6 },
  { name: '超高检测器', abnormal: '(0', unit: '/484)', icon: icon7 },
  { name: '烟道机器人', abnormal: '(0', unit: '/484)', icon: icon8 },
  { name: '激光雷达', abnormal: '(0', unit: '/484)', icon: icon9 },
  { name: 'CO2传感器', abnormal: '(0', unit: '/484)', icon: icon10 },
  { name: 'CO/VI检测器', abnormal: '(0', unit: '/484)', icon: icon11 },
  { name: '温湿度传感器', abnormal: '(0', unit: '/484)', icon: icon12 },
  { name: '压力传感器', abnormal: '(0', unit: '/484)', icon: icon13 },
  { name: '光照度变送器', abnormal: '(0', unit: '/484)', icon: icon14 },
  { name: '紧急电话', abnormal: '(0', unit: '/484)', icon: icon15 },
  { name: '水质监测设备', abnormal: '(0', unit: '/484)', icon: icon16 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-list-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.c-device-list-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 64px;
  gap: 8px;
}

.c-device-list-card {
  height: 64px;
  min-width: 0;
  box-sizing: border-box;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(25, 144, 255, 0.10);
  border: 1px solid rgba(25, 144, 255, 0.08);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 10px;
}

.c-device-list-card-body {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.c-device-list-card-icon {
  width: 26px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-device-list-card-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.c-device-list-card-label {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-device-list-card-value {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 2px;
}

.c-device-list-card-value-danger {
  font-size: 18px;
  color: #f53f3f;
  font-weight: 700;
  line-height: 21px;
  font-family: 'Roboto', 'Source Han Sans CN', sans-serif;
}

.c-device-list-card-value-unit {
  font-size: 14px;
  color: #1990ff;
  font-weight: 500;
  line-height: 21px;
  font-family: 'Roboto', 'Source Han Sans CN', sans-serif;
}
</style>