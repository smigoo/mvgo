<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1786884069620-20cf038e-content">
      <div class="c-mc-lite-1786884069620-20cf038e-header">
        <div class="c-mc-lite-1786884069620-20cf038e-cube" aria-hidden="true">
          <span class="c-mc-lite-1786884069620-20cf038e-cube-face c-mc-lite-1786884069620-20cf038e-cube-face-top"></span>
          <span class="c-mc-lite-1786884069620-20cf038e-cube-face c-mc-lite-1786884069620-20cf038e-cube-face-left"></span>
          <span class="c-mc-lite-1786884069620-20cf038e-cube-face c-mc-lite-1786884069620-20cf038e-cube-face-right"></span>
        </div>
        <div class="c-mc-lite-1786884069620-20cf038e-title">当日总流量</div>
      </div>

      <div class="c-mc-lite-1786884069620-20cf038e-tabs">
        <button
          v-for="tab in tabs"
          :key="tab"
          type="button"
          :class="[
            'c-mc-lite-1786884069620-20cf038e-tab',
            activeTab === tab ? 'c-mc-lite-1786884069620-20cf038e-tab-active' : ''
          ]"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </div>

      <div class="c-mc-lite-1786884069620-20cf038e-list-wrap">
        <a-table
          :columns="columns"
          :data-source="dataSource"
          :pagination="false"
          :show-header="false"
          :row-key="record => record.key"
          class="c-mc-lite-1786884069620-20cf038e-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'event'">
              <div
                :class="[
                  'c-mc-lite-1786884069620-20cf038e-row-inner',
                  record.expanded ? 'c-mc-lite-1786884069620-20cf038e-row-inner-active' : ''
                ]"
                @click="toggleExpand(record.key)"
              >
                <div
                  :class="[
                    'c-mc-lite-1786884069620-20cf038e-line',
                    record.expanded ? 'c-mc-lite-1786884069620-20cf038e-line-active' : ''
                  ]"
                ></div>

                <button
                  type="button"
                  class="c-mc-lite-1786884069620-20cf038e-camera"
                  @click.stop="handleCamera(record)"
                  aria-label="camera"
                >
                  <span class="c-mc-lite-1786884069620-20cf038e-camera-mark">▣</span>
                </button>

                <div class="c-mc-lite-1786884069620-20cf038e-main">
                  <div class="c-mc-lite-1786884069620-20cf038e-main-line">
                    <span class="c-mc-lite-1786884069620-20cf038e-time">{{ record.time }}</span>
                    <span class="c-mc-lite-1786884069620-20cf038e-road">{{ record.road }}</span>
                    <span class="c-mc-lite-1786884069620-20cf038e-desc">{{ record.desc }}</span>
                  </div>
                  <div v-if="record.expanded" class="c-mc-lite-1786884069620-20cf038e-sub-line">
                    {{ record.detail }}
                  </div>
                </div>

                <div class="c-mc-lite-1786884069620-20cf038e-actions">
                  <button
                    v-for="action in actions"
                    :key="action.type"
                    type="button"
                    class="c-mc-lite-1786884069620-20cf038e-action"
                    @click.stop="handleAction(record, action.type)"
                    :aria-label="action.type"
                  >
                    <span class="c-mc-lite-1786884069620-20cf038e-action-icon">{{ action.icon }}</span>
                  </button>
                </div>
              </div>
            </template>
          </template>
        </a-table>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'
import { Table as ATable } from 'ant-design-vue'

const tabs = ['AI²', '交通态势', '协同上报', '相邻路段', '气象预警', '结构预警']
const activeTab = ref('AI²')

const actions = [
  { type: 'building', icon: '▥' },
  { type: 'trophy', icon: '♜' },
  { type: 'shield', icon: '★' }
]

const columns = [
  {
    title: '事件',
    dataIndex: 'event',
    key: 'event'
  }
]

const dataSource = ref([
  {
    key: '1',
    time: '15:32',
    road: 'G2京沪高速（隧道段）',
    desc: '上行 Yk2+9...检测出异常事件，',
    detail: '事件，普通车辆临时停驶',
    expanded: true
  },
  {
    key: '2',
    time: '15:32',
    road: 'G2京沪高速（隧道段）',
    desc: '上行 Yk2+9...',
    detail: '普通车辆临时停驶',
    expanded: false
  },
  {
    key: '3',
    time: '15:32',
    road: 'G2京沪高速（隧道段）',
    desc: '上行 Yk2+9...',
    detail: '普通车辆临时停驶',
    expanded: false
  },
  {
    key: '4',
    time: '15:32',
    road: 'G2京沪高速（隧道段）',
    desc: '上行 Yk2+9...',
    detail: '普通车辆临时停驶',
    expanded: false
  }
])

const toggleExpand = key => {
  dataSource.value = dataSource.value.map(item => ({
    ...item,
    expanded: item.key === key ? !item.expanded : item.expanded
  }))
}

const handleCamera = record => {
  console.log('camera', record.key)
}

const handleAction = (record, type) => {
  console.log('action', type, record.key)
}
</script>

<style scoped>
.c-mc-lite-1786884069620-20cf038e-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
  container-type: size;
  color: #ffffff;
  background:
    radial-gradient(circle at 18% 8%, rgba(32, 230, 210, 0.34), transparent 24%),
    linear-gradient(180deg, rgba(0, 83, 80, 0.98) 0%, rgba(0, 49, 51, 0.98) 34%, rgba(0, 42, 43, 0.98) 100%);
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

.c-mc-lite-1786884069620-20cf038e-header {
  position: relative;
  height: 13.3%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding-left: 2.7%;
  padding-right: 4%;
  border-top: 0.7cqh solid rgba(32, 230, 210, 0.85);
  border-bottom: 0.45cqh solid rgba(32, 220, 206, 0.95);
  background:
    repeating-linear-gradient(45deg, transparent 0 8%, rgba(32, 230, 210, 0.08) 8% 13%),
    linear-gradient(90deg, rgba(0, 95, 88, 0.92) 0%, rgba(0, 69, 67, 0.74) 36%, rgba(0, 50, 50, 0.24) 100%);
  box-shadow: inset 0 0 2.6cqh rgba(32, 230, 210, 0.52), 0 0 2cqh rgba(32, 230, 210, 0.4);
}

.c-mc-lite-1786884069620-20cf038e-header::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -0.45cqh;
  width: 5.2%;
  height: 0.9cqh;
  background: #20e6d2;
  box-shadow: 0 0 1.6cqh #20e6d2;
  clip-path: polygon(12% 0, 100% 0, 92% 100%, 0 100%);
}

.c-mc-lite-1786884069620-20cf038e-cube {
  position: relative;
  width: 4.8cqw;
  height: 6.6cqh;
  margin-right: 1.5%;
  filter: drop-shadow(0 0 1cqh rgba(61, 231, 255, 0.9));
}

.c-mc-lite-1786884069620-20cf038e-cube-face {
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 0, 100% 25%, 50% 50%, 0 25%);
  background: linear-gradient(135deg, #d4ffff, #35cce7);
}

.c-mc-lite-1786884069620-20cf038e-cube-face-left {
  transform: translateY(25%);
  clip-path: polygon(0 0, 50% 25%, 50% 100%, 0 72%);
  background: linear-gradient(135deg, #62e7ff, #2483ba);
}

.c-mc-lite-1786884069620-20cf038e-cube-face-right {
  transform: translateY(25%);
  clip-path: polygon(50% 25%, 100% 0, 100% 72%, 50% 100%);
  background: linear-gradient(135deg, #8effff, #38a8d5);
}

.c-mc-lite-1786884069620-20cf038e-title {
  color: #ffffff;
  font-size: clamp(1rem, 6.1cqh, 3rem);
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-shadow: 0 0 0.8cqh rgba(255, 255, 255, 0.76), 0 0 1.8cqh rgba(32, 230, 210, 0.7);
}

.c-mc-lite-1786884069620-20cf038e-tabs {
  height: 24.8%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 1%;
  padding: 2.8% 3.3% 1.9% 4.35%;
}

.c-mc-lite-1786884069620-20cf038e-tab {
  height: 62%;
  box-sizing: border-box;
  padding: 0 1.1%;
  border: 0.35cqh solid #20dcce;
  border-radius: 0.9cqh;
  color: #31f0d8;
  background: rgba(0, 61, 61, 0.42);
  font-size: clamp(0.75rem, 5.2cqh, 2.2rem);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: inset 0 0 1.2cqh rgba(32, 230, 210, 0.22), 0 0 0.7cqh rgba(32, 230, 210, 0.25);
}

.c-mc-lite-1786884069620-20cf038e-tab-active {
  color: #ffffff;
  background: linear-gradient(180deg, rgba(29, 211, 199, 0.92), rgba(0, 127, 124, 0.74));
  box-shadow: inset 0 0 1.6cqh rgba(255, 255, 255, 0.2), 0 0 1.2cqh rgba(32, 230, 210, 0.45);
}

.c-mc-lite-1786884069620-20cf038e-list-wrap {
  width: 92.5%;
  height: 61%;
  margin-left: 4.15%;
  min-height: 0;
}

.c-mc-lite-1786884069620-20cf038e-table {
  width: 100%;
  height: 100%;
}

.c-mc-lite-1786884069620-20cf038e-row-inner {
  position: relative;
  min-height: 17.9cqh;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 1%;
  padding: 0.9% 2.1% 0.9% 1.1%;
  background: linear-gradient(90deg, rgba(0, 82, 82, 0.92), rgba(0, 61, 62, 0.62));
  color: #ffffff;
  overflow: hidden;
  cursor: pointer;
}

.c-mc-lite-1786884069620-20cf038e-row-inner-active {
  min-height: 22.2cqh;
  align-items: flex-start;
  padding-top: 1.4%;
  border: 0.25cqh solid rgba(32, 220, 206, 0.86);
  box-shadow: inset 0 0 1cqh rgba(32, 230, 210, 0.14);
}

.c-mc-lite-1786884069620-20cf038e-line {
  position: absolute;
  left: -1.25%;
  top: 0;
  width: 0.45%;
  height: 100%;
  background: rgba(214, 236, 233, 0.78);
}

.c-mc-lite-1786884069620-20cf038e-line-active {
  background: #20e6d2;
  box-shadow: 0 0 1cqh rgba(32, 230, 210, 0.92);
}

.c-mc-lite-1786884069620-20cf038e-camera {
  flex: 0 0 5.8%;
  aspect-ratio: 1.08 / 1;
  border: 0;
  border-radius: 0.8cqh;
  color: #ffffff;
  background: linear-gradient(180deg, #f48910, #a85908);
  box-shadow: inset 0 0 0 0.35cqh rgba(68, 42, 9, 0.32);
  cursor: pointer;
}

.c-mc-lite-1786884069620-20cf038e-camera-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: clamp(0.7rem, 4.2cqh, 1.8rem);
  font-weight: 900;
}

.c-mc-lite-1786884069620-20cf038e-main {
  flex: 1;
  min-width: 0;
  padding-right: 1%;
}

.c-mc-lite-1786884069620-20cf038e-main-line {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 1%;
  white-space: nowrap;
}

.c-mc-lite-1786884069620-20cf038e-time,
.c-mc-lite-1786884069620-20cf038e-road {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 7.8cqh;
  border-radius: 0.7cqh;
  box-sizing: border-box;
  color: #ffffff;
  font-size: clamp(0.72rem, 4.7cqh, 2rem);
  line-height: 1;
}

.c-mc-lite-1786884069620-20cf038e-time {
  flex: 0 0 12.5%;
  background: rgba(20, 160, 146, 0.92);
}

.c-mc-lite-1786884069620-20cf038e-road {
  flex: 0 0 42.5%;
  background: rgba(52, 134, 4, 0.98);
  padding: 0 1.2%;
}

.c-mc-lite-1786884069620-20cf038e-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #ffffff;
  font-size: clamp(0.72rem, 4.65cqh, 2rem);
  line-height: 1.18;
  text-shadow: 0 0 0.45cqh rgba(255, 255, 255, 0.25);
}

.c-mc-lite-1786884069620-20cf038e-sub-line {
  margin-top: 1.35%;
  color: #ffffff;
  font-size: clamp(0.72rem, 4.65cqh, 2rem);
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.c-mc-lite-1786884069620-20cf038e-actions {
  flex: 0 0 12.5%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5.5%;
  padding-top: 5.2cqh;
}

.c-mc-lite-1786884069620-20cf038e-row-inner:not(.c-mc-lite-1786884069620-20cf038e-row-inner-active) .c-mc-lite-1786884069620-20cf038e-actions {
  padding-top: 0;
}

.c-mc-lite-1786884069620-20cf038e-action {
  width: 23%;
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  border: 0.25cqh solid #d8fff8;
  border-radius: 0.55cqh;
  background: linear-gradient(180deg, rgba(30, 190, 174, 0.95), rgba(17, 143, 134, 0.9));
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 0 0.45cqh rgba(32, 230, 210, 0.45);
}

.c-mc-lite-1786884069620-20cf038e-action-icon {
  display: inline-flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.5rem, 2.8cqh, 1.2rem);
  line-height: 1;
}

.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table),
.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table-container),
.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table-content),
.c-mc-lite-1786884069620-20cf038e-content :deep(table) {
  width: 100%;
  height: 100%;
  background: transparent;
  color: inherit;
}

.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table-wrapper),
.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-spin-nested-loading),
.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-spin-container) {
  height: 100%;
}

.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table-tbody > tr),
.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table-tbody > tr > td),
.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table-tbody > tr:hover > td) {
  background: transparent !important;
}

.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table-tbody > tr > td) {
  padding: 0 0 2.2cqh 1.2%;
  border: 0;
}

.c-mc-lite-1786884069620-20cf038e-content :deep(.ant-table-tbody > tr:last-child > td) {
  padding-bottom: 0;
}
</style>