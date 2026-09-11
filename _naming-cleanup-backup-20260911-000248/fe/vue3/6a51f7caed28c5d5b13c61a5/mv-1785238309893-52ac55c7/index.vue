<template>
  <div class="mv-1785238309893-52ac55c7">
    <div class="mv-1785238309893-52ac55c7__glow mv-1785238309893-52ac55c7__glow--left"></div>
    <div class="mv-1785238309893-52ac55c7__glow mv-1785238309893-52ac55c7__glow--right"></div>

    <div class="mv-1785238309893-52ac55c7__header">
      <div class="mv-1785238309893-52ac55c7__header-left">
        <div class="mv-1785238309893-52ac55c7__icon" aria-hidden="true"></div>

        <div class="mv-1785238309893-52ac55c7__title-group">
          <div class="mv-1785238309893-52ac55c7__title-row">
            <h3 class="mv-1785238309893-52ac55c7__title">{{ title }}</h3>
            <span class="mv-1785238309893-52ac55c7__subtitle">{{ subtitle }}</span>
          </div>
          <div class="mv-1785238309893-52ac55c7__meta">
            <span class="mv-1785238309893-52ac55c7__meta-item">更新时间：{{ updateTime }}</span>
            <span class="mv-1785238309893-52ac55c7__meta-divider"></span>
            <span class="mv-1785238309893-52ac55c7__meta-item">单位：{{ unit }}</span>
          </div>
        </div>
      </div>

      <div class="mv-1785238309893-52ac55c7__header-right">
        <div class="mv-1785238309893-52ac55c7__tabs" role="tablist" aria-label="数据维度切换">
          <button
            v-for="tab in tabList"
            :key="tab.value"
            type="button"
            class="mv-1785238309893-52ac55c7__tab"
            :class="{ 'is-active': currentTab === tab.value }"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="mv-1785238309893-52ac55c7__header-chip">
          <span class="mv-1785238309893-52ac55c7__header-chip-label">当前态势</span>
          <strong class="mv-1785238309893-52ac55c7__header-chip-value">正常</strong>
        </div>
      </div>
    </div>

    <div class="mv-1785238309893-52ac55c7__content">
      <div class="mv-1785238309893-52ac55c7__overview">
        <div class="mv-1785238309893-52ac55c7__overview-main">
          <div class="mv-1785238309893-52ac55c7__overview-label">综合运行指数</div>
          <div class="mv-1785238309893-52ac55c7__overview-value-row">
            <div class="mv-1785238309893-52ac55c7__overview-value">{{ overviewValue }}</div>
            <div class="mv-1785238309893-52ac55c7__overview-unit">{{ unit }}</div>
          </div>
          <div class="mv-1785238309893-52ac55c7__overview-desc">
            结合在线、告警、处理效率等多项指标综合计算
          </div>

          <div class="mv-1785238309893-52ac55c7__progress">
            <div class="mv-1785238309893-52ac55c7__progress-track">
              <div
                class="mv-1785238309893-52ac55c7__progress-fill"
                :style="{ width: overviewRate + '%' }"
              ></div>
            </div>
            <div class="mv-1785238309893-52ac55c7__progress-labels">
              <span>0</span>
              <span>100</span>
            </div>
          </div>
        </div>

        <div class="mv-1785238309893-52ac55c7__overview-side">
          <div
            v-for="item in sideStats"
            :key="item.label"
            class="mv-1785238309893-52ac55c7__stat-card"
          >
            <div class="mv-1785238309893-52ac55c7__stat-top">
              <span class="mv-1785238309893-52ac55c7__stat-label">{{ item.label }}</span>
              <span class="mv-1785238309893-52ac55c7__stat-tag" :class="`is-${item.status}`">
                {{ item.trendText }}
              </span>
            </div>

            <div class="mv-1785238309893-52ac55c7__stat-value-row">
              <strong class="mv-1785238309893-52ac55c7__stat-value">{{ item.value }}</strong>
              <span class="mv-1785238309893-52ac55c7__stat-unit">{{ item.unit }}</span>
            </div>

            <div class="mv-1785238309893-52ac55c7__stat-bar">
              <div
                class="mv-1785238309893-52ac55c7__stat-bar-fill"
                :class="`is-${item.status}`"
                :style="{ width: item.rate + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div class="mv-1785238309893-52ac55c7__detail-grid">
        <div
          v-for="item in detailStats"
          :key="item.label"
          class="mv-1785238309893-52ac55c7__detail-card"
        >
          <div class="mv-1785238309893-52ac55c7__detail-icon" :class="`is-${item.status}`"></div>
          <div class="mv-1785238309893-52ac55c7__detail-body">
            <div class="mv-1785238309893-52ac55c7__detail-top">
              <span class="mv-1785238309893-52ac55c7__detail-label">{{ item.label }}</span>
              <span class="mv-1785238309893-52ac55c7__detail-trend" :class="`is-${item.status}`">
                {{ item.trendText }}
              </span>
            </div>
            <div class="mv-1785238309893-52ac55c7__detail-value-row">
              <strong class="mv-1785238309893-52ac55c7__detail-value">{{ item.value }}</strong>
              <span class="mv-1785238309893-52ac55c7__detail-unit">{{ item.unit }}</span>
            </div>
            <div class="mv-1785238309893-52ac55c7__detail-desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>

      <div class="mv-1785238309893-52ac55c7__footer">
        <div class="mv-1785238309893-52ac55c7__legend">
          <span class="mv-1785238309893-52ac55c7__legend-item">
            <i class="mv-1785238309893-52ac55c7__legend-dot is-normal"></i>
            正常
          </span>
          <span class="mv-1785238309893-52ac55c7__legend-item">
            <i class="mv-1785238309893-52ac55c7__legend-dot is-warning"></i>
            预警
          </span>
          <span class="mv-1785238309893-52ac55c7__legend-item">
            <i class="mv-1785238309893-52ac55c7__legend-dot is-danger"></i>
            异常
          </span>
        </div>

        <div class="mv-1785238309893-52ac55c7__footer-tip">
          数据按当前选择维度实时刷新，支持快速查看运行状态
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '设备监控'
  },
  subtitle: {
    type: String,
    default: 'Device Monitoring'
  },
  updateTime: {
    type: String,
    default: '2026-07-28 11:35:31'
  },
  unit: {
    type: String,
    default: '%'
  },
  activeTab: {
    type: String,
    default: 'today'
  },
  tabs: {
    type: Array,
    default: () => ([
      { label: '实时', value: 'realtime' },
      { label: '今日', value: 'today' },
      { label: '本周', value: 'week' }
    ])
  }
})

const emit = defineEmits(['update:activeTab', 'change'])

const currentTab = ref(props.activeTab)

watch(
  () => props.activeTab,
  (val) => {
    currentTab.value = val
  }
)

const tabList = computed(() => props.tabs || [])

const overviewValue = computed(() => {
  if (currentTab.value === 'realtime') return '98.6'
  if (currentTab.value === 'week') return '97.2'
  return '98.1'
})

const overviewRate = computed(() => {
  const value = Number(overviewValue.value)
  return Number.isFinite(value) ? value : 0
})

const sideStats = computed(() => {
  const map = {
    realtime: [
      { label: '在线设备', value: '186', unit: '台', rate: 92, status: 'normal', trendText: '↑ 3.2%' },
      { label: '异常告警', value: '12', unit: '条', rate: 36, status: 'warning', trendText: '↑ 1.8%' },
      { label: '待处理', value: '5', unit: '项', rate: 22, status: 'danger', trendText: '↓ 2.1%' }
    ],
    today: [
      { label: '在线设备', value: '192', unit: '台', rate: 95, status: 'normal', trendText: '↑ 4.1%' },
      { label: '异常告警', value: '8', unit: '条', rate: 24, status: 'warning', trendText: '↓ 0.6%' },
      { label: '待处理', value: '3', unit: '项', rate: 14, status: 'danger', trendText: '↓ 3.0%' }
    ],
    week: [
      { label: '在线设备', value: '181', unit: '台', rate: 90, status: 'normal', trendText: '↑ 1.7%' },
      { label: '异常告警', value: '19', unit: '条', rate: 52, status: 'warning', trendText: '↑ 5.2%' },
      { label: '待处理', value: '7', unit: '项', rate: 29, status: 'danger', trendText: '↑ 1.4%' }
    ]
  }

  return map[currentTab.value] || map.today
})

const detailStats = computed(() => {
  const map = {
    realtime: [
      { label: '设备在线率', value: '98.6', unit: props.unit, status: 'normal', trendText: '↑ 0.8%', desc: '当前在线设备占比稳定' },
      { label: '告警响应时长', value: '12.4', unit: 'min', status: 'warning', trendText: '↓ 1.3%', desc: '平均处理速度持续优化' },
      { label: '故障闭环率', value: '96.2', unit: props.unit, status: 'danger', trendText: '↑ 2.0%', desc: '闭环效率保持较高水平' }
    ],
    today: [
      { label: '设备在线率', value: '98.1', unit: props.unit, status: 'normal', trendText: '↑ 0.5%', desc: '今日运行整体平稳' },
      { label: '告警响应时长', value: '11.8', unit: 'min', status: 'warning', trendText: '↓ 0.9%', desc: '响应效率较昨日提升' },
      { label: '故障闭环率', value: '95.7', unit: props.unit, status: 'danger', trendText: '↑ 1.5%', desc: '处理流程趋于稳定' }
    ],
    week: [
      { label: '设备在线率', value: '97.2', unit: props.unit, status: 'normal', trendText: '↑ 0.2%', desc: '周内波动幅度较小' },
      { label: '告警响应时长', value: '13.6', unit: 'min', status: 'warning', trendText: '↑ 1.6%', desc: '个别时段存在堆积' },
      { label: '故障闭环率', value: '94.8', unit: props.unit, status: 'danger', trendText: '↓ 0.7%', desc: '闭环能力仍可提升' }
    ]
  }

  return map[currentTab.value] || map.today
})

const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  emit('update:activeTab', value)
  emit('change', value)
}
</script>

<style scoped>
.mv-1785238309893-52ac55c7 {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 18px 20px 20px;
  border: 1px solid rgba(109, 161, 255, 0.22);
  border-radius: 16px;
    linear-gradient(180deg, rgba(12, 23, 43, 0.96) 0%, rgba(7, 15, 28, 0.98) 100%);
    0 12px 36px rgba(0, 0, 0, 0.28);
  color: #dbe8ff;
}

.mv-1785238309893-52ac55c7__glow {
  position: absolute;
  pointer-events: none;
  border-radius: 999px;
  filter: blur(24px);
  opacity: 0.55;
}

.mv-1785238309893-52ac55c7__glow--left {
  top: -40px;
  left: -50px;
  width: 160px;
  height: 160px;
  background: rgba(49, 138, 255, 0.16);
}

.mv-1785238309893-52ac55c7__glow--right {
  right: -46px;
  top: 22px;
  width: 140px;
  height: 140px;
  background: rgba(133, 186, 255, 0.12);
}

.mv-1785238309893-52ac55c7__header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.mv-1785238309893-52ac55c7__header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.mv-1785238309893-52ac55c7__icon {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(133, 186, 255, 0.22);
    url('../resources/images/icon-8503.png') center/24px 24px no-repeat;
    0 6px 16px rgba(0, 0, 0, 0.18);
}

.mv-1785238309893-52ac55c7__title-group {
  min-width: 0;
}

.mv-1785238309893-52ac55c7__title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

.mv-1785238309893-52ac55c7__title {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #f2f7ff;
}

.mv-1785238309893-52ac55c7__subtitle {
  font-size: 12px;
  line-height: 1.2;
  color: rgba(206, 222, 255, 0.62);
}

.mv-1785238309893-52ac55c7__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: rgba(206, 222, 255, 0.58);
}

.mv-1785238309893-52ac55c7__meta-divider {
  width: 1px;
  height: 10px;
  background: rgba(255, 255, 255, 0.12);
}

.mv-1785238309893-52ac55c7__header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.mv-1785238309893-52ac55c7__tabs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid rgba(109, 161, 255, 0.16);
  border-radius: 12px;
  background: rgba(9, 19, 35, 0.7);
}

.mv-1785238309893-52ac55c7__tab {
  min-width: 52px;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(219, 232, 255, 0.72);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.mv-1785238309893-52ac55c7__tab:hover {
  color: #ffffff;
}

.mv-1785238309893-52ac55c7__tab.is-active {
  color: #fff;
  background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
  box-shadow: 0 6px 14px rgba(49, 138, 255, 0.26);
}

.mv-1785238309893-52ac55c7__header-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(109, 161, 255, 0.16);
  border-radius: 12px;
  background: rgba(9, 19, 35, 0.7);
  font-size: 12px;
}

.mv-1785238309893-52ac55c7__header-chip-label {
  color: rgba(206, 222, 255, 0.62);
}

.mv-1785238309893-52ac55c7__header-chip-value {
  font-weight: 600;
  color: #dff2ff;
}

.mv-1785238309893-52ac55c7__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
}

.mv-1785238309893-52ac55c7__overview {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
}

.mv-1785238309893-52ac55c7__overview-main,
.mv-1785238309893-52ac55c7__stat-card,
.mv-1785238309893-52ac55c7__detail-card {
  border: 1px solid rgba(109, 161, 255, 0.14);
  background: rgba(11, 22, 40, 0.82);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.015);
}

.mv-1785238309893-52ac55c7__overview-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px;
  border-radius: 16px;
}

.mv-1785238309893-52ac55c7__overview-label {
  font-size: 13px;
  line-height: 1;
  color: rgba(206, 222, 255, 0.7);
}

.mv-1785238309893-52ac55c7__overview-value-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.mv-1785238309893-52ac55c7__overview-value {
  font-size: 44px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #f4fbff;
}

.mv-1785238309893-52ac55c7__overview-unit {
  padding-bottom: 6px;
  font-size: 14px;
  color: rgba(206, 222, 255, 0.65);
}

.mv-1785238309893-52ac55c7__overview-desc {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(206, 222, 255, 0.58);
}

.mv-1785238309893-52ac55c7__progress {
  margin-top: 18px;
}

.mv-1785238309893-52ac55c7__progress-track {
  width: 100%;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.mv-1785238309893-52ac55c7__progress-fill {
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
  box-shadow: 0 0 12px rgba(49, 138, 255, 0.32);
}

.mv-1785238309893-52ac55c7__progress-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: rgba(206, 222, 255, 0.42);
}

.mv-1785238309893-52ac55c7__overview-side {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.mv-1785238309893-52ac55c7__stat-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 14px 16px;
  border-radius: 14px;
}

.mv-1785238309893-52ac55c7__stat-top,
.mv-1785238309893-52ac55c7__detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.mv-1785238309893-52ac55c7__stat-label,
.mv-1785238309893-52ac55c7__detail-label {
  font-size: 13px;
  color: rgba(219, 232, 255, 0.84);
}

.mv-1785238309893-52ac55c7__stat-tag,
.mv-1785238309893-52ac55c7__detail-trend {
  flex: 0 0 auto;
  font-size: 12px;
  color: rgba(219, 232, 255, 0.7);
}

.mv-1785238309893-52ac55c7__stat-tag.is-normal,
.mv-1785238309893-52ac55c7__detail-trend.is-normal {
  color: #86d3ff;
}

.mv-1785238309893-52ac55c7__stat-tag.is-warning,
.mv-1785238309893-52ac55c7__detail-trend.is-warning {
  color: #9dc0ff;
}

.mv-1785238309893-52ac55c7__stat-tag.is-danger,
.mv-1785238309893-52ac55c7__detail-trend.is-danger {
  color: #ff8383;
}

.mv-1785238309893-52ac55c7__stat-value-row,
.mv-1785238309893-52ac55c7__detail-value-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-top: 8px;
}

.mv-1785238309893-52ac55c7__stat-value,
.mv-1785238309893-52ac55c7__detail-value {
  font-size: 28px;
  line-height: 1;
  font-weight: 700;
  color: #f4fbff;
}

.mv-1785238309893-52ac55c7__stat-unit,
.mv-1785238309893-52ac55c7__detail-unit {
  padding-bottom: 3px;
  font-size: 12px;
  color: rgba(206, 222, 255, 0.6);
}

.mv-1785238309893-52ac55c7__stat-bar {
  margin-top: 10px;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.mv-1785238309893-52ac55c7__stat-bar-fill {
  height: 100%;
  border-radius: inherit;
}

.mv-1785238309893-52ac55c7__stat-bar-fill.is-normal {
  background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
}

.mv-1785238309893-52ac55c7__stat-bar-fill.is-warning {
  background: linear-gradient(270deg, #85baff 0%, #bfe2ff 100%);
}

.mv-1785238309893-52ac55c7__stat-bar-fill.is-danger {
  background: #f53f3f;
}

.mv-1785238309893-52ac55c7__detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  min-width: 0;
}

.mv-1785238309893-52ac55c7__detail-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  border-radius: 14px;
}

.mv-1785238309893-52ac55c7__detail-icon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-top: 4px;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.03);
}

.mv-1785238309893-52ac55c7__detail-icon.is-normal {
  background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
}

.mv-1785238309893-52ac55c7__detail-icon.is-warning {
  background: linear-gradient(270deg, #85baff 0%, #bfe2ff 100%);
}

.mv-1785238309893-52ac55c7__detail-icon.is-danger {
  background: #f53f3f;
}

.mv-1785238309893-52ac55c7__detail-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.mv-1785238309893-52ac55c7__detail-desc {
  margin-top: 8px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(206, 222, 255, 0.56);
}

.mv-1785238309893-52ac55c7__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding-top: 2px;
}

.mv-1785238309893-52ac55c7__legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  min-width: 0;
  font-size: 12px;
  color: rgba(206, 222, 255, 0.66);
}

.mv-1785238309893-52ac55c7__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mv-1785238309893-52ac55c7__legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mv-1785238309893-52ac55c7__legend-dot.is-normal {
  background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
}

.mv-1785238309893-52ac55c7__legend-dot.is-warning {
  background: linear-gradient(270deg, #85baff 0%, #bfe2ff 100%);
}

.mv-1785238309893-52ac55c7__legend-dot.is-danger {
  background: #f53f3f;
}

.mv-1785238309893-52ac55c7__footer-tip {
  flex: 0 0 auto;
  font-size: 12px;
  color: rgba(206, 222, 255, 0.52);
}

@media (max-width: 1200px) {
  .mv-1785238309893-52ac55c7__overview,
  .mv-1785238309893-52ac55c7__detail-grid {
    grid-template-columns: 1fr;
  }

  .mv-1785238309893-52ac55c7__footer {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 768px) {
  .mv-1785238309893-52ac55c7 {
    padding: 16px;
  }

  .mv-1785238309893-52ac55c7__header {
    flex-direction: column;
  }

  .mv-1785238309893-52ac55c7__header-right {
    width: 100%;
    justify-content: flex-start;
  }

  .mv-1785238309893-52ac55c7__tabs {
    width: 100%;
  }

  .mv-1785238309893-52ac55c7__tab {
    flex: 1;
  }
}</style>