<template>
  <base-panel panelKey="default-panel">
    <template #default>
      <div
        class="c-device-monitor-root"
        :class="themeType"
        :style="{
          backgroundImage: `url(${bg1})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div class="c-device-monitor-overview">
          <div
            v-for="item in overviewStats"
            :key="item.key"
            class="c-device-monitor-stat-card"
            :style="{
              backgroundImage: `url(${item.bg})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <img v-if="item.icon" :src="item.icon" class="c-device-monitor-stat-icon" :alt="item.label" />
            <div class="c-device-monitor-stat-text">
              <span class="c-device-monitor-stat-label">{{ item.label }}</span>
              <span class="c-device-monitor-stat-value">
                {{ item.value }}<small>{{ item.unit }}</small>
              </span>
            </div>
          </div>
        </div>

        <div class="c-device-monitor-body">
          <section
            class="c-device-monitor-section c-device-monitor-device-section"
            :style="{
              backgroundImage: `url(${bg6})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <div class="c-device-monitor-section-header">
              <span class="c-device-monitor-section-title">设备在线状态</span>
              <div class="c-device-monitor-tab-group">
                <button
                  v-for="tab in statusTabs"
                  :key="tab.key"
                  type="button"
                  class="c-device-monitor-tab-item"
                  :class="{ 'is-active': activeStatusTab === tab.key }"
                  @click="handleStatusTabChange(tab.key)"
                >
                  {{ tab.label }}
                </button>
              </div>
            </div>
            <div class="c-device-monitor-device-content">
              <div class="c-device-monitor-ring-panel">
                <div ref="deviceStatusChartRef" class="c-device-monitor-chart-container"></div>
              </div>
              <div class="c-device-monitor-status-list">
                <div
                  v-for="item in deviceStatusList"
                  :key="item.key"
                  class="c-device-monitor-status-item"
                  :style="{
                    backgroundImage: `url(${item.bg})`,
                    backgroundSize: '100% 100%',
                    backgroundPosition: 'center center',
                    backgroundRepeat: 'no-repeat'
                  }"
                >
                  <span class="c-device-monitor-status-name">{{ item.name }}</span>
                  <span class="c-device-monitor-status-count">{{ item.count }}</span>
                  <span class="c-device-monitor-status-unit">{{ item.unit }}</span>
                </div>
              </div>
            </div>
          </section>

          <section
            class="c-device-monitor-section c-device-monitor-alarm-section"
            :style="{
              backgroundImage: `url(${bg10})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <div class="c-device-monitor-section-header">
              <span class="c-device-monitor-section-title">设备告警统计</span>
              <div class="c-device-monitor-select-wrapper">
                <div class="c-device-monitor-select-trigger" @click="toggleAlarmDropdown">
                  <span class="c-device-monitor-select-value">{{ selectedAlarmRangeLabel }}</span>
                  <span class="c-device-monitor-select-arrow" :class="{ 'is-open': alarmDropdownVisible }"></span>
                </div>
                <div v-show="alarmDropdownVisible" class="c-device-monitor-select-dropdown">
                  <div
                    v-for="option in alarmRangeOptions"
                    :key="option.value"
                    class="c-device-monitor-select-option"
                    :class="{ 'is-active': selectedAlarmRange === option.value }"
                    @click="handleAlarmRangeSelect(option.value)"
                  >
                    {{ option.label }}
                  </div>
                </div>
              </div>
            </div>
            <div class="c-device-monitor-alarm-content">
              <div ref="alarmTrendChartRef" class="c-device-monitor-chart-container"></div>
            </div>
          </section>
        </div>

        <div class="c-device-monitor-bottom">
          <section
            class="c-device-monitor-section c-device-monitor-category-section"
            :style="{
              backgroundImage: `url(${bg11})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <div class="c-device-monitor-section-header">
              <span class="c-device-monitor-section-title">设备类型分布</span>
            </div>
            <div class="c-device-monitor-category-content">
              <div ref="deviceTypeChartRef" class="c-device-monitor-chart-container"></div>
            </div>
          </section>

          <section
            class="c-device-monitor-section c-device-monitor-health-section"
            :style="{
              backgroundImage: `url(${bg12})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <div class="c-device-monitor-section-header">
              <span class="c-device-monitor-section-title">设备健康度</span>
            </div>
            <div class="c-device-monitor-health-content">
              <div
                v-for="item in healthCards"
                :key="item.key"
                class="c-device-monitor-health-card"
                :style="{
                  backgroundImage: `url(${item.bg})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center center',
                  backgroundRepeat: 'no-repeat'
                }"
              >
                <img v-if="item.icon" :src="item.icon" class="c-device-monitor-health-icon" :alt="item.label" />
                <div class="c-device-monitor-health-text">
                  <span class="c-device-monitor-health-label">{{ item.label }}</span>
                  <span class="c-device-monitor-health-value">{{ item.value }}</span>
                  <span class="c-device-monitor-health-trend" :class="item.trendType">{{ item.trend }}</span>
                </div>
              </div>
            </div>
          </section>

          <section
            class="c-device-monitor-section c-device-monitor-maintenance-section"
            :style="{
              backgroundImage: `url(${bg15})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <div class="c-device-monitor-section-header">
              <span class="c-device-monitor-section-title">运维任务</span>
            </div>
            <div class="c-device-monitor-task-list">
              <div
                v-for="task in maintenanceTasks"
                :key="task.id"
                class="c-device-monitor-task-item"
                :style="{
                  backgroundImage: `url(${task.bg})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center center',
                  backgroundRepeat: 'no-repeat'
                }"
              >
                <div class="c-device-monitor-task-info">
                  <span class="c-device-monitor-task-name">{{ task.name }}</span>
                  <span class="c-device-monitor-task-desc">{{ task.desc }}</span>
                </div>
                <span class="c-device-monitor-task-status" :class="task.statusType">{{ task.status }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </base-panel>
</template>