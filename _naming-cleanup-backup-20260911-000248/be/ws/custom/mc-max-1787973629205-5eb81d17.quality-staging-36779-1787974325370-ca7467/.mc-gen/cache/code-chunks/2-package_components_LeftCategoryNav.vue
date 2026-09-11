<template>
  <div class="c-monitor-left-nav">
    <div
      v-for="item in navItems"
      :key="item.id"
      :class="['c-monitor-nav-item', { 'is-active': activeNav === item.id }]"
      @click="activeNav = item.id"
    >
      <span class="c-monitor-nav-label">{{ item.label }}</span>
      <span v-if="item.badge" class="c-monitor-nav-badge">{{ item.badge }}</span>
    </div>
  </div>
</template>