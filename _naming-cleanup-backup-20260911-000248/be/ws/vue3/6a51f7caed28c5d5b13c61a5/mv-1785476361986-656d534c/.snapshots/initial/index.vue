<template>
  <div class="mv-1785476361986-656d534c">
    <!-- 面板头部 -->
    <div class="panel-header">
      <div class="header-left">
        <span class="title-text">重点车辆监测</span>
      </div>
      <div class="header-right" role="tablist" @keydown="handleTabKeydown">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'tunnel', inactive: activeTab !== 'tunnel' }"
          role="tab"
          :aria-selected="activeTab === 'tunnel'"
          :tabindex="activeTab === 'tunnel' ? 0 : -1"
          @click="activeTab = 'tunnel'"
        >
          江阴靖江长江隧道
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'bridge', inactive: activeTab !== 'bridge' }"
          role="tab"
          :aria-selected="activeTab === 'bridge'"
          :tabindex="activeTab === 'bridge' ? 0 : -1"
          @click="activeTab = 'bridge'"
        >
          江阴大桥
        </button>
      </div>
    </div>

    <!-- 面板内容区 -->
    <div class="panel-content">
      <!-- 小标题区 -->
      <div class="subtitle-row">
        <img src="../resources/images/icon-123.png" alt="今日累计图标" class="subtitle-icon" />
        <span class="subtitle-text">今日累计</span>
      </div>

      <!-- 数据卡片区 -->
      <div class="cards-row">
        <div class="stat-card">
          <img src="../resources/images/icon-8049.png" alt="危化品车图标" class="card-icon" />
          <span class="card-label">危化品车</span>
          <span class="card-value value-danger">51 次</span>
        </div>
        <div class="stat-card">
          <img src="../resources/images/icon-8036.png" alt="重型货车图标" class="card-icon" />
          <span class="card-label">重型货车</span>
          <span class="card-value value-primary">2 次</span>
        </div>
        <div class="stat-card">
          <img src="../resources/images/icon-8070.png" alt="超高车辆图标" class="card-icon" />
          <span class="card-label">超高车辆</span>
          <span class="card-value value-warning">19 次</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const activeTab = ref('tunnel');

const handleTabKeydown = (e) => {
  const tabs = e.currentTarget.querySelectorAll('[role="tab"]');
  const currentIndex = Array.from(tabs).findIndex((tab) => tab === e.target);

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    const nextIndex = (currentIndex + 1) % tabs.length;
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    tabs[prevIndex].focus();
    tabs[prevIndex].click();
  }
};
</script>

<style scoped lang="less">
.mv-1785476361986-656d534c {
  background: #edf4fbb2;
  border-radius: 4px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-left {
      .title-text {
        color: #1990ff;
        font-size: 16px;
        font-weight: bold;
      }
    }

    .header-right {
      display: flex;
      gap: 8px;

      .tab-btn {
        border: none;
        outline: none;
        cursor: pointer;
        border-radius: 12px;
        padding: 4px 12px;
        font-size: 14px;
        transition: all 0.3s;
        line-height: 1.5;

        &.active {
          background: #1990ff;
          color: #ffffff;
        }

        &.inactive {
          background: transparent;
          color: #6680a0;
          border: 1px solid #6680a0;
        }
      }
    }
  }

  .panel-content {
    display: flex;
    flex-direction: column;

    .subtitle-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;

      .subtitle-icon {
        width: 18px;
        height: 18px;
        display: block;
      }

      .subtitle-text {
        color: #333333;
        font-size: 14px;
      }
    }

    .cards-row {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      gap: 12px;

      .stat-card {
        background: rgba(255, 255, 255, 0.5);
        border-radius: 8px;
        padding: 12px;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;

        .card-icon {
          width: 40px;
          height: 30px;
          display: block;
        }

        .card-label {
          color: #666666;
          font-size: 12px;
          margin-top: 8px;
        }

        .card-value {
          font-size: 20px;
          font-weight: bold;
          margin-top: 4px;

          &.value-danger {
            color: #ff4d4f;
          }

          &.value-primary {
            color: #1890ff;
          }

          &.value-warning {
            color: #fa8c16;
          }
        }
      }
    }
  }
}</style>