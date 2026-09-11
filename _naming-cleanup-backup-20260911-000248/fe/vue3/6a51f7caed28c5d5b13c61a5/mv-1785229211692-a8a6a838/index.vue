<template>
  <div :class="['mv-1785229211692-a8a6a838']">
    <div class="panel-surface">
      <header class="panel-header">
        <div class="header-left">
          <span class="panel-mark" aria-hidden="true"></span>
          <div class="header-copy">
            <div class="header-title-row">
              <h3 class="panel-title">{{ title }}</h3>
              <span class="panel-unit">{{ unit }}</span>
            </div>
            <div class="panel-subtitle">{{ subtitle }}</div>
          </div>
        </div>

        <div class="header-right">
          <div class="update-pill">
            <span class="update-dot"></span>
            <span>{{ updateTime }}</span>
          </div>

          <div class="tab-group" role="tablist" aria-label="时间维度切换">
            <button
              v-for="tab in tabList"
              :key="tab"
              type="button"
              class="tab-item"
              :class="{ 'is-active': activeTab === tab }"
              @click="setTab(tab)"
            >
              {{ tab }}
            </button>
          </div>
        </div>
      </header>

      <section class="panel-body">
        <div class="summary-grid">
          <article
            v-for="item in metricCards"
            :key="item.label"
            class="summary-card"
          >
            <div class="summary-card-bg"></div>
            <div class="summary-card-inner">
              <div class="summary-card-top">
                <span class="metric-icon" :class="item.iconClass" aria-hidden="true"></span>
                <span class="metric-label">{{ item.label }}</span>
              </div>

              <div class="metric-value-row">
                <div class="metric-value">{{ item.value }}</div>
                <div class="metric-change" :class="item.trend">
                  <span class="trend-arrow">{{ item.trend === 'up' ? '↑' : '↓' }}</span>
                  <span>{{ item.change }}</span>
                </div>
              </div>

              <div class="metric-desc">{{ item.desc }}</div>
            </div>
          </article>
        </div>

        <div class="content-grid">
          <article class="forecast-card panel-card">
            <div class="card-header">
              <div class="card-title-wrap">
                <span class="card-accent"></span>
                <h4 class="card-title">交通预测</h4>
              </div>
              <span class="card-tag">趋势</span>
            </div>

            <div class="forecast-main">
              <div class="forecast-value-wrap">
                <div class="forecast-value">{{ forecast.value }}</div>
                <div class="forecast-unit">{{ unit }}</div>
              </div>

              <div class="forecast-meta">
                <div class="forecast-rate" :class="forecast.trend">
                  <span class="trend-arrow">{{ forecast.trend === 'up' ? '↑' : '↓' }}</span>
                  <span>{{ forecast.change }}</span>
                </div>
                <div class="forecast-tip">{{ forecast.tip }}</div>
              </div>
            </div>

            <div class="forecast-bars">
              <div
                v-for="item in forecastBars"
                :key="item.label"
                class="bar-item"
              >
                <div class="bar-head">
                  <span class="bar-label">{{ item.label }}</span>
                  <span class="bar-value">{{ item.value }}</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: item.percent + '%' }"></div>
                </div>
              </div>
            </div>
          </article>

          <article class="alert-card panel-card">
            <div class="card-header">
              <div class="card-title-wrap">
                <span class="card-accent warning"></span>
                <h4 class="card-title">预警分布</h4>
              </div>
              <span class="card-tag warning">状态</span>
            </div>

            <div class="alert-summary">
              <div class="alert-total">
                <div class="alert-total-value">{{ alertSummary.total }}</div>
                <div class="alert-total-label">当前预警</div>
              </div>
              <div class="alert-levels">
                <div
                  v-for="level in alertSummary.levels"
                  :key="level.label"
                  class="level-item"
                >
                  <span class="level-dot" :class="level.type"></span>
                  <span class="level-label">{{ level.label }}</span>
                  <span class="level-value">{{ level.value }}</span>
                </div>
              </div>
            </div>

            <div class="alert-list">
              <div
                v-for="row in alertRows"
                :key="row.label"
                class="alert-row"
              >
                <div class="alert-row-left">
                  <span class="row-icon" :class="row.iconClass" aria-hidden="true"></span>
                  <div class="row-copy">
                    <div class="row-label">{{ row.label }}</div>
                    <div class="row-sub">{{ row.sub }}</div>
                  </div>
                </div>

                <div class="alert-row-right">
                  <div class="row-value">{{ row.value }}</div>
                  <div class="row-status" :class="row.status">{{ row.statusText }}</div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '运行态势概览' },
  subtitle: { type: String, default: '实时监测与预测趋势' },
  unit: { type: String, default: '车/次' },
  updateTime: { type: String, default: '更新时间 09:02:57' },
  tabList: {
    type: Array,
    default: () => ['今日', '本周', '本月']
  }
})

const emit = defineEmits(['change'])

const tabList = computed(() => {
  return Array.isArray(props.tabList) && props.tabList.length ? props.tabList : ['今日', '本周', '本月']
})

const activeTab = ref(tabList.value[0])

const periodMap = {
  今日: {
    metrics: [
      { label: '累计流量', value: '12.8万', change: '+8.6%', trend: 'up', desc: '较昨日同期增长', iconClass: 'icon-flow' },
      { label: '平均速度', value: '56.4', change: '-3.2%', trend: 'down', desc: '单位路段实时均速', iconClass: 'icon-speed' },
      { label: '排队长度', value: '1.7km', change: '+1.1%', trend: 'up', desc: '重点节点拥堵指数', iconClass: 'icon-queue' }
    ],
    forecast: { value: '13.6万', change: '+6.1%', trend: 'up', tip: '未来 2 小时保持缓增，峰值预计出现在 18:00 - 19:00' },
    bars: [
      { label: '早高峰', value: '82%', percent: 82 },
      { label: '平峰期', value: '54%', percent: 54 },
      { label: '晚高峰', value: '91%', percent: 91 }
    ],
    alerts: {
      total: 6,
      levels: [
        { label: '高', value: 1, type: 'danger' },
        { label: '中', value: 2, type: 'warning' },
        { label: '低', value: 3, type: 'success' }
      ],
      rows: [
        { label: '隧道入口拥堵', sub: '车流密度偏高', value: '87%', status: 'danger', statusText: '紧急', iconClass: 'row-icon-a' },
        { label: '匝道并线缓行', sub: '局部速度下降', value: '63%', status: 'warning', statusText: '关注', iconClass: 'row-icon-b' },
        { label: '主线通行平稳', sub: '运行状态正常', value: '15%', status: 'success', statusText: '正常', iconClass: 'row-icon-c' }
      ]
    }
  },
  本周: {
    metrics: [
      { label: '累计流量', value: '78.2万', change: '+4.3%', trend: 'up', desc: '较上周同期增长', iconClass: 'icon-flow' },
      { label: '平均速度', value: '58.1', change: '+1.4%', trend: 'up', desc: '周均通行效率提升', iconClass: 'icon-speed' },
      { label: '排队长度', value: '1.2km', change: '-7.8%', trend: 'down', desc: '拥堵排队明显回落', iconClass: 'icon-queue' }
    ],
    forecast: { value: '81.5万', change: '+3.9%', trend: 'up', tip: '周末客流增加，建议加强入口分流与车道引导' },
    bars: [
      { label: '周一至周三', value: '68%', percent: 68 },
      { label: '周四至周五', value: '76%', percent: 76 },
      { label: '周末', value: '89%', percent: 89 }
    ],
    alerts: {
      total: 9,
      levels: [
        { label: '高', value: 2, type: 'danger' },
        { label: '中', value: 3, type: 'warning' },
        { label: '低', value: 4, type: 'success' }
      ],
      rows: [
        { label: '施工区域限速', sub: '请保持车距', value: '92%', status: 'warning', statusText: '提示', iconClass: 'row-icon-a' },
        { label: '事故风险点', sub: '需持续观察', value: '71%', status: 'danger', statusText: '预警', iconClass: 'row-icon-b' },
        { label: '巡检完成率', sub: '设施状态良好', value: '96%', status: 'success', statusText: '达标', iconClass: 'row-icon-c' }
      ]
    }
  },
  本月: {
    metrics: [
      { label: '累计流量', value: '312万', change: '+9.8%', trend: 'up', desc: '月度流量持续增长', iconClass: 'icon-flow' },
      { label: '平均速度', value: '55.7', change: '-0.8%', trend: 'down', desc: '受多次降雨影响', iconClass: 'icon-speed' },
      { label: '排队长度', value: '1.4km', change: '+2.4%', trend: 'up', desc: '极端天气下波动上升', iconClass: 'icon-queue' }
    ],
    forecast: { value: '328万', change: '+5.1%', trend: 'up', tip: '月末车流将进入高位平台，建议提前部署保畅措施' },
    bars: [
      { label: '工作日', value: '73%', percent: 73 },
      { label: '节假日', value: '88%', percent: 88 },
      { label: '极端天气', value: '61%', percent: 61 }
    ],
    alerts: {
      total: 12,
      levels: [
        { label: '高', value: 3, type: 'danger' },
        { label: '中', value: 4, type: 'warning' },
        { label: '低', value: 5, type: 'success' }
      ],
      rows: [
        { label: '重点节点预警', sub: '流量超阈值', value: '94%', status: 'danger', statusText: '预警', iconClass: 'row-icon-a' },
        { label: '设备在线率', sub: '运行稳定', value: '98%', status: 'success', statusText: '正常', iconClass: 'row-icon-b' },
        { label: '异常事件闭环', sub: '处理效率提升', value: '89%', status: 'warning', statusText: '关注', iconClass: 'row-icon-c' }
      ]
    }
  }
}

const current = computed(() => periodMap[activeTab.value] || periodMap[tabList.value[0]])

const metricCards = computed(() => current.value.metrics)
const forecast = computed(() => current.value.forecast)
const forecastBars = computed(() => current.value.bars)
const alertSummary = computed(() => current.value.alerts)
const alertRows = computed(() => current.value.alerts.rows)

const setTab = (tab) => {
  if (activeTab.value === tab) return
  activeTab.value = tab
  emit('change', tab)
}
</script>

<style scoped>
.mv-1785229211692-a8a6a838 {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: #eaf3ff;
    url('./resources/images/bg-126.png');
  background-repeat: no-repeat, no-repeat;
  background-position: center center, center center;
  background-size: 100% 100%, 100% 100%;
}

.panel-surface {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 18px 18px 16px;
  box-sizing: border-box;
  background: rgba(7, 15, 31, 0.22);
  border: 1px solid rgba(120, 173, 255, 0.22);
  border-radius: 16px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03), 0 10px 30px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(2px);
}

.panel-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.header-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.panel-mark {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  background: url('./resources/images/g-7961.png') center center / contain no-repeat;
  filter: drop-shadow(0 0 8px rgba(78, 164, 255, 0.45));
}

.header-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.header-title-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.panel-title {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #f3f8ff;
}

.panel-unit {
  font-size: 12px;
  color: rgba(180, 211, 255, 0.74);
}

.panel-subtitle {
  font-size: 12px;
  line-height: 1.4;
  color: rgba(170, 201, 242, 0.72);
}

.header-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 0;
}

.update-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(8, 18, 38, 0.65);
  border: 1px solid rgba(128, 178, 255, 0.2);
  color: rgba(205, 226, 255, 0.88);
  font-size: 12px;
  white-space: nowrap;
}

.update-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #53b8ff;
  box-shadow: 0 0 10px rgba(83, 184, 255, 0.9);
}

.tab-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(8, 16, 33, 0.58);
  border: 1px solid rgba(128, 178, 255, 0.16);
}

.tab-item {
  height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgba(190, 214, 246, 0.78);
  font-size: 12px;
  cursor: pointer;
  transition: 0.18s ease;
}

.tab-item:hover {
  color: #ffffff;
  background: rgba(93, 155, 255, 0.12);
}

.tab-item.is-active {
  color: #0f1f3d;
  background: linear-gradient(180deg, #7bd0ff 0%, #4f9bff 100%);
  box-shadow: 0 6px 14px rgba(78, 146, 255, 0.28);
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}

.summary-card {
  position: relative;
  overflow: hidden;
  min-width: 0;
  border-radius: 14px;
  border: 1px solid rgba(122, 176, 255, 0.2);
  background: rgba(7, 15, 31, 0.58);
}

.summary-card-bg {
  position: absolute;
  inset: 0;
  background: url('./resources/images/bg-124.png') center center / 100% 100% no-repeat;
  opacity: 0.34;
  pointer-events: none;
}

.summary-card:nth-child(2) .summary-card-bg {
  background-image: url('./resources/images/bg-125.png');
}

.summary-card:nth-child(3) .summary-card-bg {
  background-image: url('./resources/images/bg-124.png');
  opacity: 0.28;
}

.summary-card-inner {
  position: relative;
  z-index: 1;
  padding: 14px 14px 12px;
}

.summary-card-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.metric-icon {
  width: 20px;
  height: 20px;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: contain;
  flex: 0 0 auto;
}

.icon-flow { background-image: url('./resources/images/icon-123.png'); }
.icon-speed { background-image: url('./resources/images/icon-8049.png'); }
.icon-queue { background-image: url('./resources/images/icon-8036.png'); }

.metric-label {
  font-size: 12px;
  color: rgba(189, 217, 247, 0.78);
}

.metric-value-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.metric-value {
  font-size: 26px;
  line-height: 1;
  font-weight: 600;
  color: #f7fbff;
  letter-spacing: 0.02em;
}

.metric-change {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.metric-change.up {
  color: #60d39e;
}

.metric-change.down {
  color: #ff887d;
}

.metric-desc {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(171, 203, 240, 0.68);
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  gap: 12px;
  min-height: 0;
}

.panel-card {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(122, 176, 255, 0.18);
  background: linear-gradient(180deg, rgba(8, 16, 33, 0.82) 0%, rgba(8, 17, 35, 0.72) 100%);
}

.panel-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(237, 244, 251, 0.05) 0%, rgba(237, 244, 251, 0.01) 100%);
  pointer-events: none;
}

.card-header {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.card-title-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.card-accent {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #54b8ff;
  box-shadow: 0 0 12px rgba(84, 184, 255, 0.9);
}

.card-accent.warning {
  background: #ffb84e;
  box-shadow: 0 0 12px rgba(255, 184, 78, 0.9);
}

.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f6faff;
}

.card-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(86, 162, 255, 0.12);
  color: #86c6ff;
  font-size: 12px;
  border: 1px solid rgba(86, 162, 255, 0.16);
}

.card-tag.warning {
  background: rgba(255, 184, 78, 0.12);
  color: #ffc86f;
  border-color: rgba(255, 184, 78, 0.18);
}

.forecast-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 12px 10px;
  margin-bottom: 12px;
  border-radius: 12px;
    url('./resources/images/bg-126.png');
  background-repeat: no-repeat, no-repeat;
  background-position: center center, center center;
  background-size: 100% 100%, 100% 100%;
  border: 1px solid rgba(104, 155, 255, 0.18);
}

.forecast-value-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.forecast-value {
  font-size: 30px;
  line-height: 1;
  font-weight: 600;
  color: #f8fcff;
}

.forecast-unit {
  font-size: 12px;
  color: rgba(187, 215, 248, 0.72);
}

.forecast-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  min-width: 0;
}

.forecast-rate {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.forecast-rate.up {
  color: #60d39e;
}

.forecast-rate.down {
  color: #ff887d;
}

.forecast-tip {
  max-width: 250px;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(174, 205, 241, 0.74);
  text-align: right;
}

.forecast-bars {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.bar-label,
.bar-value {
  font-size: 12px;
  color: rgba(194, 221, 251, 0.82);
}

.bar-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(107, 149, 210, 0.18);
}

.bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #79d6ff 0%, #4f9bff 100%);
  box-shadow: 0 0 10px rgba(89, 168, 255, 0.35);
}

.alert-summary {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: row;
  gap: 12px;
  padding: 12px;
  margin-bottom: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 184, 78, 0.14);
  background: linear-gradient(180deg, rgba(255, 184, 78, 0.08) 0%, rgba(255, 184, 78, 0.03) 100%);
}

.alert-total {
  flex: 0 0 auto;
  width: 92px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.alert-total-value {
  font-size: 30px;
  line-height: 1;
  font-weight: 600;
  color: #fff4de;
}

.alert-total-label {
  font-size: 12px;
  color: rgba(252, 228, 184, 0.74);
}

.alert-levels {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.level-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: rgba(201, 221, 248, 0.82);
}

.level-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.level-dot.danger { background: #ff6a6a; box-shadow: 0 0 8px rgba(255, 106, 106, 0.8); }
.level-dot.warning { background: #ffb84e; box-shadow: 0 0 8px rgba(255, 184, 78, 0.8); }
.level-dot.success { background: #60d39e; box-shadow: 0 0 8px rgba(96, 211, 158, 0.8); }

.level-label {
  flex: 0 0 auto;
}

.level-value {
  margin-left: auto;
  color: #f5fbff;
}

.alert-list {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.alert-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(10, 20, 40, 0.54);
  border: 1px solid rgba(116, 171, 251, 0.15);
}

.alert-row-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.row-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 10px;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: 16px 16px;
  background-color: rgba(237, 244, 251, 0.07);
  border: 1px solid rgba(116, 171, 251, 0.12);
}

.row-icon-a { background-image: url('./resources/images/icon-8070.png'); }
.row-icon-b { background-image: url('./resources/images/icon-8036.png'); }
.row-icon-c { background-image: url('./resources/images/icon-8049.png'); }

.row-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.row-label {
  font-size: 12px;
  color: #f5faff;
}

.row-sub {
  font-size: 12px;
  color: rgba(173, 203, 241, 0.68);
}

.alert-row-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: 0 0 auto;
}

.row-value {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.row-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
}

.row-status.danger {
  color: #ff8f8f;
  background: rgba(255, 106, 106, 0.12);
}

.row-status.warning {
  color: #ffc86f;
  background: rgba(255, 184, 78, 0.12);
}

.row-status.success {
  color: #73dfaf;
  background: rgba(96, 211, 158, 0.12);
}

@media (max-width: 1200px) {
  .panel-header,
  .header-right,
  .forecast-main,
  .content-grid {
    flex-direction: column;
    align-items: stretch;
  }

  .panel-header,
  .content-grid {
    gap: 12px;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .forecast-tip {
    max-width: none;
    text-align: left;
  }

  .alert-summary {
    flex-direction: column;
  }

  .alert-total {
    width: auto;
  }
}</style>