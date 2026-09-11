<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1785972757159-c19b8cee-container">
      <!-- 左侧：设备状态统计 -->
      <div class="c-mc-max-1785972757159-c19b8cee-left-section">
        <div class="c-mc-max-1785972757159-c19b8cee-stat-grid">
          <div class="c-mc-max-1785972757159-c19b8cee-stat-item">
            <span class="c-mc-max-1785972757159-c19b8cee-stat-label">设备总数</span>
            <span class="c-mc-max-1785972757159-c19b8cee-stat-value">{{ deviceStats.total }}</span>
          </div>
          <div class="c-mc-max-1785972757159-c19b8cee-stat-item">
            <span class="c-mc-max-1785972757159-c19b8cee-stat-label">在线设备</span>
            <span class="c-mc-max-1785972757159-c19b8cee-stat-value online">{{ deviceStats.online }}</span>
          </div>
          <div class="c-mc-max-1785972757159-c19b8cee-stat-item">
            <span class="c-mc-max-1785972757159-c19b8cee-stat-label">离线设备</span>
            <span class="c-mc-max-1785972757159-c19b8cee-stat-value offline">{{ deviceStats.offline }}</span>
          </div>
          <div class="c-mc-max-1785972757159-c19b8cee-stat-item">
            <span class="c-mc-max-1785972757159-c19b8cee-stat-label">故障设备</span>
            <span class="c-mc-max-1785972757159-c19b8cee-stat-value error">{{ deviceStats.error }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧：设备列表 -->
      <div class="c-mc-max-1785972757159-c19b8cee-right-section">
        <div class="c-mc-max-1785972757159-c19b8cee-section-header">
          <span class="c-mc-max-1785972757159-c19b8cee-section-title">设备列表</span>
        </div>
        <div class="c-mc-max-1785972757159-c19b8cee-table-wrapper">
          <a-table
            :columns="columns"
            :data-source="deviceList"
            :pagination="false"
            size="small"
            row-key="deviceId"
            :scroll="{ y: '100%' }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <span :class="['c-mc-max-1785972757159-c19b8cee-status-tag', record.status]">
                  {{ statusMap[record.status] || record.status }}
                </span>
              </template>
            </template>
          </a-table>
        </div>
      </div>
    </div>
  </base-panel>
</template>