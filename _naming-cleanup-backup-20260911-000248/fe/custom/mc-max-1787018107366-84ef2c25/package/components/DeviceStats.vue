<template>
  <div class="c-device-stats-root">
    <!-- 顶部统计行 -->
    <div class="c-device-stats-summary">
<div v-for="item in summaryStats" :key="item.label" class="c-device-stats-summary-item" >
        <span class="c-device-stats-summary-label">{{ item.label }}</span>
<span class="c-device-stats-summary-value" :class="item.valueClass" >{{ item.value }}</span>
      </div>
<img :src="icon2" alt="" class="c-device-stats-summary-icon" />
    </div>

    <!-- 两个设备分类卡片 -->
    <div class="c-device-stats-cards">
<div v-for="card in deviceCards" :key="card.title" class="c-device-stats-card" :class="card.cardClass" >
<img :src="card.icon" alt="" class="c-device-stats-card-icon" />
        <div class="c-device-stats-card-content">
          <span class="c-device-stats-card-title">{{ card.title }}</span>
          <div class="c-device-stats-card-row">
            <span class="c-device-stats-card-label">总数:</span>
<span class="c-device-stats-card-total" :style="{ color: card.totalColor }" >{{ card.totalValue }}</span>
          </div>
          <div class="c-device-stats-card-row">
            <span class="c-device-stats-card-label">异常数:</span>
            <span class="c-device-stats-card-abnormal">{{ card.abnormalValue }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/Frame-8856.png'
import icon5 from '../../resources/images/icon-8444.png'
import icon6 from '../../resources/images/icon-8473.png'

// 资源变量由系统自动注入（icon2, icon5, icon6）

const summaryStats = [ { label: '设备类型', value: '28', valueClass: 'c-device-stats-value-primary'
  },
  {
    label: '设备总数',
    value: '68562',
    valueClass: 'c-device-stats-value-primary'
  },
  {
    label: '完好率',
    value: '98%',
    valueClass: 'c-device-stats-value-success'
  }
]

const deviceCards = [ { title: '隧道设备', icon: icon5, cardClass: 'c-device-stats-card-active', totalValue: '56302', abnormalValue: '5', totalColor: '#000000'
  },
  {
    title: '南北接线 / 设备',
    icon: icon6,
    cardClass: 'c-device-stats-card-default',
    totalValue: '1280',
    abnormalValue: '3',
    totalColor: '#1990FF'
  }
]
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-stats-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

// --- 顶部统计行 ---
.c-device-stats-summary {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  width: 100%;
  min-width: 0;
}

.c-device-stats-summary-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-stats-summary-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
  white-space: nowrap;
}

.c-device-stats-summary-value {
  font-family: 'Roboto', sans-serif;
  font-size: 20px;
  font-weight: 700;
  line-height: 23.4375px;
  white-space: nowrap;
}

.c-device-stats-value-primary {
  color: #1990ff;
}

.c-device-stats-value-success {
  color: #08a3a5;
}

.c-device-stats-summary-icon {
  width: 16px;
  height: 16px;
  margin-left: auto;
  flex-shrink: 0;
}

// --- 设备分类卡片区域 ---
.c-device-stats-cards {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.c-device-stats-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 15px;
  border-radius: 8px;
  flex: 1 1 260px;
  min-width: 0;
  box-sizing: border-box;
}

.c-device-stats-card-active {
  background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
}

.c-device-stats-card-default {
  background: #f0f5ff;
}

.c-device-stats-card-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-device-stats-card-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.c-device-stats-card-title {
  font-family: 'YouSheBiaoTiHei', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 15.6px;
  color: #ffffff;
  white-space: nowrap;
}

.c-device-stats-card-default .c-device-stats-card-title {
  color: #333333;
}

.c-device-stats-card-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-stats-card-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #ffffff;
  white-space: nowrap;
}

.c-device-stats-card-default .c-device-stats-card-label {
  color: #666666;
}

.c-device-stats-card-total {
  font-family: 'Roboto', sans-serif;
  font-size: 20px;
  font-weight: 700;
  line-height: 23.4375px;
  white-space: nowrap;
}

.c-device-stats-card-abnormal {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 18.75px;
  color: #f53f3f;
  white-space: nowrap;
}
</style>