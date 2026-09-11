<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <span class="c-c-monitor-title-dot">
        <img :src="icon1" alt="" class="c-c-monitor-title-dot-outer" />
        <img :src="icon2" alt="" class="c-c-monitor-title-dot-inner" />
        <img :src="icon3" alt="" class="c-c-monitor-title-dot-core" />
      </span>
    </template>

    <template #header_right>
      <div class="c-c-monitor-header-metrics">
        <span class="c-c-monitor-update-text">*数据实时更新</span>
        <div class="c-c-monitor-header-metric">
          <span class="c-c-monitor-header-label">设备类型</span>
          <span class="c-c-monitor-header-value">28</span>
        </div>
        <div class="c-c-monitor-header-metric">
          <span class="c-c-monitor-header-label">设备总数</span>
          <span class="c-c-monitor-header-value">68562</span>
        </div>
        <div class="c-c-monitor-header-metric">
          <span class="c-c-monitor-header-label">完好率</span>
          <span class="c-c-monitor-header-value c-c-monitor-header-value--accent">98%</span>
        </div>
        <img :src="icon4" alt="" class="c-c-monitor-header-icon" />
      </div>
    </template>

    <div class="c-c-monitor-root">
      <section class="c-c-monitor-overview-section">
        <div class="c-c-monitor-overview-list">
          <button
            v-for="card in overviewCards"
            :key="card.key"
            type="button"
            :class="[
              'c-c-monitor-overview-card',
              { 'c-c-monitor-overview-card--active': activeOverview === card.key }
            ]"
            @click="handleOverviewChange(card.key)"
          >
            <span
              class="c-c-monitor-overview-bg"
              :style="{ backgroundImage: `url(${card.bg})` }"
              aria-hidden="true"
            ></span>
            <span class="c-c-monitor-overview-icon">
              <img
                v-for="part in card.decorations"
                :key="part.className"
                :src="part.src"
                alt=""
                :class="['c-c-monitor-overview-icon-part', part.className]"
              />
              <img :src="card.icon" alt="" class="c-c-monitor-overview-icon-main" />
            </span>
            <span class="c-c-monitor-overview-text">
              <span class="c-c-monitor-overview-name">{{ card.name }}</span>
              <span class="c-c-monitor-overview-line">
                <span class="c-c-monitor-overview-label">总数:</span>
                <span class="c-c-monitor-overview-number">{{ card.total }}</span>
              </span>
              <span class="c-c-monitor-overview-line">
                <span class="c-c-monitor-overview-label">异常数:</span>
                <span class="c-c-monitor-overview-number c-c-monitor-overview-number--danger">
                  {{ card.abnormal }}
                </span>
              </span>
            </span>
          </button>
        </div>
      </section>

      <section class="c-c-monitor-category-section">
        <a-tabs
          v-model:activeKey="activeCategory"
          tab-position="left"
          class="c-c-monitor-category-tabs"
          @change="handleCategoryChange"
        >
          <a-tab-pane v-for="tab in categoryTabs" :key="tab.key">
            <template #tab>
              <span class="c-c-monitor-category-tab">
                <span class="c-c-monitor-category-tab-name">{{ tab.label }}</span>
                <span v-if="tab.count" class="c-c-monitor-category-tab-count">{{ tab.count }}</span>
              </span>
            </template>

            <div class="c-c-monitor-device-grid">
              <article
                v-for="device in visibleDevices"
                :key="device.key"
                class="c-c-monitor-device-card"
              >
                <span
                  class="c-c-monitor-device-bg"
                  :style="{ backgroundImage: `url(${device.bg})` }"
                  aria-hidden="true"
                ></span>
                <div class="c-c-monitor-device-text">
                  <span class="c-c-monitor-device-name">{{ device.name }}</span>
                  <span class="c-c-monitor-device-value">{{ device.value }}</span>
                </div>
                <span class="c-c-monitor-device-icon">
                  <img
                    v-for="part in device.decorations"
                    :key="part.className"
                    :src="part.src"
                    alt=""
                    :class="['c-c-monitor-device-icon-part', part.className]"
                  />
                  <img :src="device.icon" alt="" class="c-c-monitor-device-icon-main" />
                </span>
              </article>
            </div>
          </a-tab-pane>
        </a-tabs>
      </section>
    </div>
  </base-panel>
</template>