<template>
  <div class="c-monitor-equipment-grid">
    <div
      v-for="card in cards"
      :key="card.id"
      class="c-monitor-equipment-card"
    >
      <div class="c-monitor-card-icon-wrapper">
        <div class="c-monitor-card-icon-decor"></div>
        <div class="c-monitor-card-icon-inner"></div>
      </div>
      <div class="c-monitor-card-info">
        <div class="c-monitor-card-title">{{ card.title }}</div>
        <div class="c-monitor-card-count">({{ card.count }})</div>
      </div>
    </div>
  </div>
</template>