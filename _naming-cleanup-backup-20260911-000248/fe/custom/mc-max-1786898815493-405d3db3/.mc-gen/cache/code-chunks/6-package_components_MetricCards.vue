<template>
  <div class="c-env-monitor-metric-cards">
    <div
      v-for="card in cards"
      :key="card.id"
      class="c-env-monitor-metric-card"
      :class="`c-env-monitor-metric-card--${card.status || 'normal'}`"
    >
      <div class="c-env-monitor-metric-card__icon">
        <img
          v-if="card.iconType === 'icon1'"
          :src="icon1"
          alt=""
          class="c-env-monitor-metric-card__img"
        />
        <img
          v-else-if="card.iconType === 'icon2'"
          :src="icon2"
          alt=""
          class="c-env-monitor-metric-card__img"
        />
        <span
          v-else
          class="c-env-monitor-metric-card__icon-fallback"
        ></span>
      </div>

      <div class="c-env-monitor-metric-card__info">
        <div class="c-env-monitor-metric-card__label">{{ card.label }}</div>
        <div class="c-env-monitor-metric-card__value-row">
          <span class="c-env-monitor-metric-card__value">{{ card.value }}</span>
          <span
            v-if="card.unit"
            class="c-env-monitor-metric-card__unit"
          >{{ card.unit }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  cards: {
    type: Array,
    default: () => []
  },
  icon1: {
    type: String,
    default: ''
  },
  icon2: {
    type: String,
    default: ''
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>