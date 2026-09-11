<template>
  <section class="mv-lite-1786873878417-690a1c73 dashboard-panel">
    <header class="panel-header">
      <div class="header-icon" aria-hidden="true">
        <span class="cube cube-top"></span>
        <span class="cube cube-mid"></span>
        <span class="cube cube-bottom"></span>
      </div>
      <h1 class="panel-title">当日总流量</h1>
    </header>

    <nav class="tab-bar" aria-label="导航标签">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="tab-button"
        :class="{ active: activeTab === tab }"
        type="button"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </nav>

    <main class="event-list-wrap">
      <a-table
        class="event-table"
        :columns="columns"
        :data-source="data"
        :pagination="false"
        :show-header="false"
        :row-class-name="rowClassName"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'status'">
            <div class="status-cell">
              <span class="state-line" :class="{ active: index === 0 }"></span>
              <button class="alarm-icon" type="button" @click="handleIconClick('alarm', record)">
                <span class="calendar-top"></span>
                <span class="calendar-dot"></span>
              </button>
            </div>
          </template>

          <template v-if="column.key === 'content'">
            <div class="content-cell" :class="{ expanded: index === 0 }">
              <div class="content-line">
                <span class="time-badge">{{ record.time }}</span>
                <span class="road-badge">{{ record.road }}</span>
                <span class="event-text">{{ record.desc }}</span>
              </div>
              <div v-if="index === 0 && expanded" class="content-line second-line">
                <span class="event-text continuation">{{ record.more }}</span>
              </div>
            </div>
          </template>

          <template v-if="column.key === 'actions'">
            <div class="action-cell">
              <button class="action-btn" type="button" aria-label="道路设施" @click="handleIconClick('building', record)">
                <span class="icon-building"></span>
              </button>
              <button class="action-btn" type="button" aria-label="设备" @click="handleIconClick('device', record)">
                <span class="icon-device"></span>
              </button>
              <button class="action-btn" type="button" aria-label="预警" @click="handleIconClick('shield', record)">
                <span class="icon-shield"></span>
              </button>
            </div>
          </template>
        </template>
      </a-table>
    </main>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { Table as ATable } from 'ant-design-vue'

defineOptions({
  name: 'mv-lite-1786873878417-690a1c73',
})

const tabs = ['AI²', '交通态势', '协同上报', '相邻路段', '气象预警', '结构预警']
const activeTab = ref('AI²')
const expanded = ref(true)

const columns = [
  { title: '状态', key: 'status', width: '7%' },
  { title: '内容', key: 'content', width: '80%' },
  { title: '操作', key: 'actions', width: '13%' },
]

const data = [
  {
    key: '1',
    time: '15:32',
    road: 'G2京沪高速（隧道段）',
    desc: '上行 YK2+9...检测出异常事件，',
    more: '事件，普通车辆临时停驶',
  },
  {
    key: '2',
    time: '15:32',
    road: 'G2京沪高速（隧道段）',
    desc: '上行 YK2+9...',
    more: '',
  },
  {
    key: '3',
    time: '15:32',
    road: 'G2京沪高速（隧道段）',
    desc: '上行 YK2+9...',
    more: '',
  },
  {
    key: '4',
    time: '15:32',
    road: 'G2京沪高速（隧道段）',
    desc: '上行 YK2+9...',
    more: '',
  },
]

const rowClassName = (_record, index) => (index === 0 ? 'selected-row' : 'normal-row')

const handleIconClick = (type, record) => {
  if (type === 'alarm' && record.key === '1') {
    expanded.value = !expanded.value
  }
  console.log(type, record.key)
}
</script>

<style scoped>
.mv-lite-1786873878417-690a1c73,
.dashboard-panel {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  color: #ffffff;
  background:
    radial-gradient(circle at 18% 3%, rgba(42, 255, 220, 0.22), transparent 30%),
    linear-gradient(180deg, #033c3b 0%, #032e2f 34%, #03292b 100%);
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

.panel-header {
  position: relative;
  height: 13.2%;
  min-height: 48px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding: 0 4.1%;
  border-top: 2px solid rgba(35, 230, 209, 0.75);
  border-bottom: 2px solid rgba(35, 230, 209, 0.68);
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.06) 0 18px, transparent 18px 54px),
    linear-gradient(90deg, rgba(0, 255, 210, 0.34), rgba(4, 57, 57, 0.7) 37%, rgba(3, 44, 47, 0.15) 100%);
  box-shadow:
    inset 0 0 18px rgba(35, 230, 209, 0.5),
    0 0 12px rgba(35, 230, 209, 0.36);
}

.panel-header::after {
  content: "";
  position: absolute;
  right: 2.2%;
  bottom: -2px;
  width: 64%;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(35, 230, 209, 0.9), transparent);
}

.header-icon {
  position: relative;
  width: 4.7%;
  min-width: 32px;
  height: 60%;
  margin-right: 2.1%;
  filter: drop-shadow(0 0 8px rgba(35, 230, 209, 0.72));
}

.cube {
  position: absolute;
  left: 0;
  width: 100%;
  height: 36%;
  clip-path: polygon(50% 0, 100% 28%, 50% 100%, 0 28%);
  background: linear-gradient(135deg, #f1ffff 0%, #79dff1 42%, #0d7fc0 100%);
}

.cube-top { top: 0; opacity: 0.95; }
.cube-mid { top: 27%; transform: scaleX(0.95); opacity: 0.82; }
.cube-bottom { top: 54%; transform: scaleX(0.9); opacity: 0.9; }

.panel-title {
  margin: 0;
  font-size: clamp(26px, 6.6vh, 47px);
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #ffffff;
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.45),
    0 0 10px rgba(255, 255, 255, 0.62),
    0 0 18px rgba(35, 230, 209, 0.55);
}

.tab-bar {
  width: 93%;
  height: 17.5%;
  box-sizing: border-box;
  margin: 2.7% auto 1.4%;
  display: flex;
  align-items: center;
  gap: 0.9%;
}

.tab-button {
  height: 78%;
  flex: 1 1 auto;
  padding: 0 1.05%;
  border: 2px solid #20d8c9;
  border-radius: 7px;
  color: #23e6d1;
  background: rgba(4, 63, 65, 0.42);
  box-shadow: inset 0 0 10px rgba(35, 230, 209, 0.16);
  font-size: clamp(20px, 4.9vh, 37px);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.tab-button.active {
  color: #ffffff;
  background: linear-gradient(180deg, rgba(35, 230, 209, 0.72), rgba(8, 127, 124, 0.82));
  box-shadow:
    inset 0 0 14px rgba(255, 255, 255, 0.18),
    0 0 12px rgba(35, 230, 209, 0.36);
}

.event-list-wrap {
  width: 93%;
  height: 64%;
  margin: 0 auto;
  box-sizing: border-box;
}

.event-table {
  width: 100%;
  height: 100%;
}

.status-cell {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.state-line {
  width: 4px;
  height: 84%;
  min-height: 42px;
  background: rgba(194, 220, 218, 0.82);
  box-shadow: 0 0 5px rgba(174, 224, 219, 0.22);
}

.state-line.active {
  background: #20f2d0;
  box-shadow: 0 0 10px rgba(32, 242, 208, 0.75);
}

.alarm-icon {
  position: relative;
  width: clamp(30px, 5.3vh, 50px);
  height: clamp(30px, 5.3vh, 50px);
  border: 0;
  border-radius: 4px;
  background: #e17600;
  box-shadow: inset 0 0 7px rgba(75, 29, 0, 0.35), 0 0 6px rgba(255, 123, 0, 0.28);
  cursor: pointer;
}

.alarm-icon::before {
  content: "";
  position: absolute;
  left: 23%;
  top: 26%;
  width: 54%;
  height: 50%;
  border: 4px solid #ffffff;
  border-radius: 4px;
  box-sizing: border-box;
}

.calendar-top {
  position: absolute;
  left: 27%;
  top: 21%;
  width: 46%;
  height: 5px;
  border-radius: 3px;
  background: #ffffff;
}

.calendar-dot {
  position: absolute;
  left: 45%;
  top: 42%;
  width: 10%;
  height: 10%;
  border-radius: 50%;
  background: #ffffff;
}

.content-cell {
  min-width: 0;
  color: #ffffff;
  font-size: clamp(18px, 4.25vh, 34px);
  line-height: 1.2;
  font-weight: 500;
}

.content-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 1.2%;
  white-space: nowrap;
}

.second-line {
  margin-top: 7px;
  padding-left: 0;
}

.time-badge,
.road-badge {
  display: inline-flex;
  align-items: center;
  height: clamp(31px, 5.4vh, 54px);
  box-sizing: border-box;
  border-radius: 4px;
  color: #ffffff;
  line-height: 1;
  white-space: nowrap;
}

.time-badge {
  padding: 0 2.2%;
  background: rgba(14, 158, 147, 0.95);
  font-size: clamp(19px, 4.55vh, 36px);
}

.road-badge {
  padding: 0 2.6%;
  background: rgba(51, 135, 0, 0.95);
}

.event-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 0 4px rgba(255, 255, 255, 0.22);
}

.continuation {
  padding-left: 0.6%;
}

.action-cell {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 7px;
}

.action-btn {
  position: relative;
  width: clamp(22px, 3.65vh, 36px);
  height: clamp(22px, 3.65vh, 36px);
  border: 2px solid rgba(236, 255, 251, 0.95);
  border-radius: 5px;
  background: linear-gradient(180deg, rgba(34, 224, 207, 0.92), rgba(9, 128, 124, 0.94));
  box-shadow: 0 0 7px rgba(35, 230, 209, 0.45);
  cursor: pointer;
}

.icon-building::before {
  content: "";
  position: absolute;
  left: 19%;
  top: 24%;
  width: 62%;
  height: 48%;
  border-top: 4px solid #ffffff;
  border-bottom: 4px solid #ffffff;
  background: repeating-linear-gradient(90deg, #ffffff 0 3px, transparent 3px 8px);
}

.icon-building::after {
  content: "";
  position: absolute;
  left: 14%;
  top: 17%;
  width: 72%;
  height: 8px;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  background: #ffffff;
}

.icon-device::before {
  content: "";
  position: absolute;
  left: 32%;
  top: 17%;
  width: 36%;
  height: 36%;
  border-radius: 50%;
  border: 3px solid #ffffff;
  box-sizing: border-box;
}

.icon-device::after {
  content: "";
  position: absolute;
  left: 24%;
  top: 55%;
  width: 52%;
  height: 25%;
  border-radius: 50% 50% 4px 4px;
  background: #ffffff;
}

.icon-shield::before {
  content: "";
  position: absolute;
  left: 24%;
  top: 17%;
  width: 52%;
  height: 62%;
  clip-path: polygon(50% 0, 88% 12%, 84% 58%, 50% 100%, 16% 58%, 12% 12%);
  background: #ffffff;
}

.icon-shield::after {
  content: "★";
  position: absolute;
  left: 0;
  right: 0;
  top: 24%;
  color: #159f96;
  font-size: 11px;
  line-height: 1;
  text-align: center;
}

:deep(.event-table .ant-table) {
  height: 100%;
  color: #ffffff;
  background: transparent;
  font-family: inherit;
}

:deep(.event-table .ant-table-container),
:deep(.event-table .ant-table-content),
:deep(.event-table table) {
  height: 100%;
}

:deep(.event-table .ant-table-tbody > tr > td) {
  height: 21.4%;
  padding: 0;
  border: 0;
  background: rgba(5, 70, 72, 0.48);
  vertical-align: middle;
}

:deep(.event-table .ant-table-tbody > tr.selected-row > td) {
  height: 33%;
  border-top: 2px solid #20d8c9;
  border-bottom: 2px solid #20d8c9;
  background: rgba(5, 77, 78, 0.62);
}

:deep(.event-table .ant-table-tbody > tr.selected-row > td:first-child) {
  border-left: 2px solid #20d8c9;
}

:deep(.event-table .ant-table-tbody > tr.selected-row > td:last-child) {
  border-right: 2px solid #20d8c9;
}

:deep(.event-table .ant-table-tbody > tr.normal-row > td) {
  border-top: 12px solid transparent;
  background-clip: padding-box;
}

:deep(.event-table .ant-table-tbody > tr:hover > td) {
  background: rgba(5, 77, 78, 0.62) !important;
}

:deep(.event-table .ant-empty) {
  display: none;
}

@media (max-width: 620px) {
  .tab-button {
    font-size: clamp(14px, 4vh, 24px);
  }

  .content-cell {
    font-size: clamp(14px, 3.5vh, 24px);
  }

  .action-cell {
    gap: 4px;
  }
}
/* Ant Design Vue Table 内部背景层：避免透明单元格透出默认白底 */
:deep(.event-table .ant-table-container),
:deep(.event-table .ant-table-content),
:deep(.event-table table) {
  background: transparent;
  color: inherit;
}

/* Ant Design Vue 4 通过单元格状态类控制行悬浮背景 */
:deep(.event-table .ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: rgba(5, 77, 78, 0.62) !important;
}

</style>