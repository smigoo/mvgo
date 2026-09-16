<template>
  <div class="cl-root">
    <header class="cl-header">
      <div>
        <h1 class="cl-title">更新日志</h1>
        <p class="cl-sub">平台的新功能与修复记录，按时间倒序排列</p>
      </div>
      <span v-if="CURRENT_VERSION" class="cl-version-badge">当前版本 v{{ CURRENT_VERSION }}</span>
    </header>

    <ol class="cl-list">
      <li
        v-for="(entry, index) in CHANGELOG"
        :key="entry.version"
        class="cl-item"
        :class="{ 'is-latest': index === 0 }"
      >
        <div class="cl-rail" aria-hidden="true">
          <span class="cl-dot"></span>
          <span v-if="index !== CHANGELOG.length - 1" class="cl-line"></span>
        </div>

        <section class="cl-card">
          <div class="cl-card-head">
            <span class="cl-ver">v{{ entry.version }}</span>
            <span v-if="index === 0" class="cl-latest-tag">最新</span>
            <time class="cl-date">{{ entry.date }}</time>
          </div>
          <ul class="cl-points">
            <li v-for="(item, i) in entry.items" :key="i" class="cl-point">{{ item }}</li>
          </ul>
        </section>
      </li>
    </ol>

    <p class="cl-foot-note">想了解更早的版本或有其他建议，请通过页脚「建议反馈」联系我们。</p>
  </div>
</template>

<script setup lang="ts">
import { CHANGELOG, CURRENT_VERSION } from '@/config/changelog'
</script>

<style scoped>
/* 与全站其他内容区（组件库 / 任务中心 / 操作日志）一致：全宽 + 统一内边距 */
.cl-root {
  padding: 0.75rem 1.5rem 0.5rem;
}

/* ── 头部：与 .mg-header 同构 ── */
.cl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.cl-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.cl-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.cl-version-badge {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--brand-bg, #e8f3ff);
  color: var(--brand);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

/* ── 列表（时间线布局，保持不变） ── */
.cl-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.cl-item {
  display: flex;
  gap: 14px;
}

.cl-rail {
  position: relative;
  flex-shrink: 0;
  width: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 18px;
}

.cl-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border-secondary, #cbd5e1);
}

.cl-item.is-latest .cl-dot {
  background: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-bg, #e8f3ff);
}

.cl-line {
  flex: 1;
  width: 1px;
  margin-top: 4px;
  background: var(--border-light, var(--border-default));
}

/* ── 卡片（仅视觉样式） ── */
.cl-card {
  flex: 1;
  min-width: 0;
  margin-bottom: 12px;
  padding: 14px 18px 15px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light, var(--border-default));
  border-radius: var(--radius-lg, 12px);
  transition: border-color 0.2s;
}

.cl-card:hover {
  border-color: var(--border-secondary, var(--brand));
}

.cl-item.is-latest .cl-card {
  border-color: var(--brand);
}

.cl-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 9px;
  border-bottom: 1px dashed var(--border-light, var(--border-default));
}

.cl-ver {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-mono, ui-monospace, Menlo, monospace);
  letter-spacing: 0.2px;
}

.cl-latest-tag {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
}

.cl-date {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cl-points {
  margin: 0;
  padding: 0;
  list-style: none;
}

.cl-point {
  position: relative;
  padding-left: 14px;
  font-size: 13px;
  line-height: 1.85;
  color: var(--text-secondary);
}

.cl-point::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 9px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--border-secondary, #cbd5e1);
}

.cl-item.is-latest .cl-point::before {
  background: var(--brand);
}

.cl-foot-note {
  margin: 4px 0 0 26px;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
