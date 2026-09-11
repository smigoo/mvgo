<template>
  <div class="equipment-monitor">
    <!-- 页面标题栏 -->
    <div class="equipment-monitor-header">
      <div class="equipment-monitor-header-left">
        <div class="equipment-monitor-menu-icon">
          <div class="menu-line"></div>
          <div class="menu-line"></div>
          <div class="menu-line"></div>
        </div>
        <span class="equipment-monitor-title">设备监测</span>
      </div>
      <div class="equipment-monitor-header-right">
        <div class="equipment-monitor-stat-item">
          <span class="stat-label">设备类型</span>
          <span class="stat-value">28</span>
        </div>
        <div class="equipment-monitor-stat-item">
          <span class="stat-label">设备总数</span>
          <span class="stat-value">68562</span>
        </div>
        <div class="equipment-monitor-stat-item">
          <span class="stat-label">完好率</span>
          <span class="stat-value-large">98%</span>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="equipment-monitor-main">
      <!-- 左侧导航栏 -->
      <div class="equipment-monitor-sidebar">
        <div class="equipment-monitor-badge">3/3740</div>
        <div class="equipment-monitor-nav-btn">
          <span class="nav-text">监</span>
          <span class="nav-text">控</span>
          <div class="nav-indicator">3</div>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="nav-text">照</span>
          <span class="nav-text">明</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="nav-text">通</span>
          <span class="nav-text">风</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="nav-text">供</span>
          <span class="nav-text">配</span>
          <span class="nav-text">电</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="nav-text">消</span>
          <span class="nav-text">防</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="nav-text">交</span>
          <span class="nav-text">通</span>
          <span class="nav-text">诱</span>
          <span class="nav-text">导</span>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="equipment-monitor-content">
        <!-- 统计卡片区 -->
        <div class="equipment-monitor-stats">
          <div class="equipment-monitor-stat-card card-tunnel">
            <div class="stat-card-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="16" fill="rgba(255,255,255,0.3)"/>
                <path d="M16 10 L16 22 M12 14 L16 10 L20 14" stroke="white" stroke-width="2" fill="none"/>
              </svg>
            </div>
            <div class="stat-card-info">
              <div class="stat-card-title">隧道设备</div>
              <div class="stat-card-row">
                <span class="stat-card-label">总</span>
                <span class="stat-card-label">数:</span>
                <span class="stat-card-total">56302</span>
              </div>
              <div class="stat-card-row">
                <span class="stat-card-label">异常数:</span>
                <span class="stat-card-error">5</span>
              </div>
            </div>
          </div>
          <div class="equipment-monitor-stat-card card-connection">
            <div class="stat-card-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="16" fill="rgba(255,255,255,0.3)"/>
                <path d="M12 16 C12 14 14 12 16 12 C18 12 20 14 20 16 C20 18 18 20 16 20 C14 20 12 18 12 16 Z" stroke="white" stroke-width="2" fill="none"/>
              </svg>
            </div>
            <div class="stat-card-info">
              <div class="stat-card-title">南北接线</div>
              <div class="stat-card-title">设备</div>
              <div class="stat-card-row">
                <span class="stat-card-label">总</span>
                <span class="stat-card-label">数:</span>
                <span class="stat-card-total">1280</span>
              </div>
              <div class="stat-card-row">
                <span class="stat-card-label">异常数:</span>
                <span class="stat-card-error">3</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 设备类型网格 -->
        <div class="equipment-monitor-grid">
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="6" width="8" height="10" rx="1" stroke="#4DA9F0" stroke-width="1.5" fill="none"/>
                <circle cx="12" cy="11" r="2" fill="#4DA9F0"/>
              </svg>
            </div>
            <div class="device-name">摄像机</div>
            <div class="device-status">(2/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 8 L12 16 M8 12 L12 8 L16 12" stroke="#4DA9F0" stroke-width="1.5" fill="none"/>
              </svg>
            </div>
            <div class="device-name">风速风向仪</div>
            <div class="device-status">(1/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="7" y="9" width="10" height="8" rx="1" stroke="#4DA9F0" stroke-width="1.5" fill="none"/>
                <line x1="9" y1="11" x2="15" y2="11" stroke="#4DA9F0" stroke-width="1"/>
              </svg>
            </div>
            <div class="device-name">超高检测器</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="10" width="8" height="6" rx="1" stroke="#22D3EE" stroke-width="1.5" fill="none"/>
                <circle cx="10" cy="13" r="0.8" fill="#22D3EE"/>
                <circle cx="14" cy="13" r="0.8" fill="#22D3EE"/>
              </svg>
            </div>
            <div class="device-name">烟道机器人</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" stroke="#22D3EE" stroke-width="1.5" fill="none"/>
                <path d="M12 8 L12 16 M8 12 L16 12" stroke="#22D3EE" stroke-width="1"/>
              </svg>
            </div>
            <div class="device-name">激光雷达</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" stroke="#22D3EE" stroke-width="1.5" fill="none"/>
                <text x="12" y="14" text-anchor="middle" fill="#22D3EE" font-size="6">CO₂</text>
              </svg>
            </div>
            <div class="device-name">CO₂传感器</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="9" width="8" height="7" rx="1" stroke="#F97316" stroke-width="1.5" fill="none"/>
                <text x="12" y="14" text-anchor="middle" fill="#F97316" font-size="5">CO</text>
              </svg>
            </div>
            <div class="device-name">CO/VI检测器</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="7" width="3" height="10" rx="1.5" stroke="#F97316" stroke-width="1.5" fill="none"/>
                <circle cx="10.5" cy="13" r="1.5" fill="#F97316"/>
              </svg>
            </div>
            <div class="device-name">温湿度传感器</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="5" stroke="#F97316" stroke-width="1.5" fill="none"/>
                <path d="M12 9 L12 12 L14 14" stroke="#F97316" stroke-width="1.5" fill="none"/>
              </svg>
            </div>
            <div class="device-name">压力传感器</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="10" r="2.5" stroke="#F59E0B" stroke-width="1.5" fill="none"/>
                <path d="M12 13 L10 16 M12 13 L14 16 M12 13 L11 17 M12 13 L13 17" stroke="#F59E0B" stroke-width="1"/>
              </svg>
            </div>
            <div class="device-name">光照度变送器</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="9" width="8" height="8" rx="1" stroke="#22D3EE" stroke-width="1.5" fill="none"/>
                <path d="M10 12 L12 14 L14 11" stroke="#22D3EE" stroke-width="1.5" fill="none"/>
              </svg>
            </div>
            <div class="device-name">紧急电话</div>
            <div class="device-status">(0/484)</div>
          </div>
          <div class="equipment-monitor-device-card">
            <div class="device-icon">
              <div class="device-base"></div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 8 C10 8 9 10 9 12 C9 14 10 16 12 16 C14 16 15 14 15 12 C15 10 14 8 12 8 Z" stroke="#22D3EE" stroke-width="1.5" fill="none"/>
                <circle cx="12" cy="12" r="1" fill="#22D3EE"/>
              </svg>
            </div>
            <div class="device-name">水质监测设备</div>
            <div class="device-status">(0/484)</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #A8B5BE;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 页面标题栏 */
.equipment-monitor-header {
  height: 40px;
  background: rgba(30, 40, 50, 0.6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.equipment-monitor-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.equipment-monitor-menu-icon {
  width: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.menu-line {
  width: 100%;
  height: 2px;
  background: #4DA9F0;
  border-radius: 1px;
}

.equipment-monitor-title {
  font-size: 16px;
  color: #4DA9F0;
  font-weight: normal;
}

.equipment-monitor-header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.equipment-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-label {
  font-size: 11px;
  color: #C8D4DC;
}

.stat-value {
  font-size: 14px;
  color: #4DA9F0;
  font-weight: bold;
}

.stat-value-large {
  font-size: 16px;
  color: #4DA9F0;
  font-weight: bold;
}

/* 主内容区 */
.equipment-monitor-main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
  padding: 12px 10px 10px 10px;
  overflow: hidden;
}

/* 左侧导航栏 */
.equipment-monitor-sidebar {
  width: 42px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.equipment-monitor-badge {
  height: 24px;
  background: rgba(255, 59, 59, 0.2);
  border: 1.5px solid #FF3B3B;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #FF3B3B;
  font-weight: bold;
  flex-shrink: 0;
}

.equipment-monitor-nav-btn {
  flex: 1;
  min-height: 0;
  background: rgba(77, 159, 232, 0.4);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 0;
  position: relative;
  cursor: pointer;
}

.nav-text {
  font-size: 13px;
  color: white;
  line-height: 1.3;
  letter-spacing: 2px;
}

.nav-indicator {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 14px;
  height: 14px;
  background: #FF3B3B;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: white;
  font-weight: bold;
}

/* 右侧内容区 */
.equipment-monitor-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

/* 统计卡片区 */
.equipment-monitor-stats {
  height: 75px;
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.equipment-monitor-stat-card {
  flex: 1;
  min-width: 0;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%);
}

.card-tunnel {
  background: linear-gradient(135deg, #3B8FD8 0%, #5FB5F5 100%);
}

.card-connection {
  background: linear-gradient(135deg, #6BA0C0 0%, #90C6E6 100%);
}

.stat-card-icon {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stat-card-title {
  font-size: 14px;
  color: white;
  line-height: 1.2;
}

.stat-card-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.stat-card-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
}

.stat-card-total {
  font-size: 24px;
  color: white;
  font-weight: bold;
  line-height: 1;
}

.stat-card-error {
  font-size: 28px;
  color: #FF3B3B;
  font-weight: bold;
  line-height: 1;
}

/* 设备类型网格 */
.equipment-monitor-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px 10px;
  overflow-y: auto;
  align-content: start;
}

.equipment-monitor-device-card {
  background: rgba(90, 122, 146, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.equipment-monitor-device-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(77, 169, 240, 0.3);
}

.device-icon {
  width: 48px;
  height: 48px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.device-base {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 8px;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.1));
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.device-name {
  font-size: 13px;
  color: #E8F0F5;
  text-align: center;
  line-height: 1.3;
}

.device-status {
  font-size: 15px;
  color: #00D4FF;
  font-weight: 500;
  line-height: 1.1;
}
</style>