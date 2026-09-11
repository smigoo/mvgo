<template>
  <section class="mv-lite-1786864812017-156cd269 dashboard">
    <div class="map-bg"></div>

    <header class="header">
      <h1 class="title">设备监测</h1>
      <div class="top-metrics">
        <div class="type-icon"><span></span><span></span><span></span></div>
        <div class="metric-item"><span>设备类型</span><strong>28</strong></div>
        <div class="metric-item"><span>设备总数</span><strong>68562</strong></div>
        <div class="metric-item"><span>完好率</span><strong class="green">98%</strong></div>
      </div>
    </header>

    <div class="decor-line"></div>

    <section class="summary-row">
      <button class="summary-card summary-primary" type="button" @click="handleCardClick('隧道设备')">
        <div class="summary-icon tunnel-icon"></div>
        <div class="summary-name">隧道设备</div>
        <div class="summary-data">
          <div>总&nbsp;&nbsp;&nbsp;&nbsp;数:<strong>56302</strong></div>
          <div>异常数:<em>5</em></div>
        </div>
      </button>

      <button class="summary-card summary-light" type="button" @click="handleCardClick('南北接线设备')">
        <div class="summary-icon cable-icon"></div>
        <div class="summary-name two-line">南北接线<br />设备</div>
        <div class="summary-data">
          <div>总&nbsp;&nbsp;&nbsp;&nbsp;数:<strong>1280</strong></div>
          <div>异常数:<em>3</em></div>
        </div>
      </button>
    </section>

    <main class="content">
      <aside class="tabs">
        <div class="float-count"><b>3</b>/3740</div>
        <button
          v-for="tab in tabs"
          :key="tab"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === tab }"
          @click="activeTab = tab"
        >
          <span>{{ tab }}</span>
          <i v-if="tab === '监控'" class="badge">3</i>
        </button>
      </aside>

      <section class="device-grid">
        <button
          v-for="device in devices"
          :key="device.name"
          type="button"
          class="device-card"
          @click="handleCardClick(device.name)"
        >
          <div class="device-icon-wrap">
            <div class="device-icon">{{ device.icon }}</div>
            <div class="halo"></div>
          </div>
          <div class="device-info">
            <div class="device-name">{{ device.name }}</div>
            <div class="device-count">(<em>{{ device.bad }}</em><span>/{{ device.total }}</span>)</div>
          </div>
        </button>
      </section>
    </main>
  </section>
</template>

<script setup>
import { ref } from 'vue'

defineOptions({ name: 'mv-lite-1786864812017-156cd269' })

const tabs = ['监控', '照明', '通风', '供配电', '消防', '交通诱导']
const activeTab = ref('监控')

const devices = [
  { name: '摄像机', bad: 2, total: 484, icon: '▰' },
  { name: '风速风向仪', bad: 1, total: 484, icon: '≋' },
  { name: '超高检测器', bad: 0, total: 484, icon: '▱' },
  { name: '烟道机器人', bad: 0, total: 484, icon: '♟' },
  { name: '激光雷达', bad: 0, total: 484, icon: '◎' },
  { name: 'CO₂传感器', bad: 0, total: 484, icon: 'CO₂' },
  { name: 'CO/VI检测器', bad: 0, total: 484, icon: 'CO' },
  { name: '温湿度传感器', bad: 0, total: 484, icon: '♨' },
  { name: '压力传感器', bad: 0, total: 484, icon: '⌁' },
  { name: '光照度变送器', bad: 0, total: 484, icon: '◐' },
  { name: '紧急电话', bad: 0, total: 484, icon: '☎' },
  { name: '水质监测设备', bad: 0, total: 484, icon: '♒' }
]

const handleCardClick = (name) => {
  console.log(name)
}
</script>

<style scoped>
.mv-lite-1786864812017-156cd269 {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.dashboard {
  position: relative;
  overflow: hidden;
  padding: 3.4% 2.5% 1.9% 3.7%;
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
  color: #1f2a35;
  background: #eaf4fb;
}

.map-bg {
  position: absolute;
  inset: 0;
  opacity: 0.72;
  background:
    linear-gradient(115deg, transparent 0 17%, rgba(230, 204, 118, 0.3) 17.3% 18.3%, transparent 18.6% 100%),
    linear-gradient(76deg, transparent 0 13%, rgba(226, 199, 115, 0.24) 13.2% 14.2%, transparent 14.5% 100%),
    linear-gradient(172deg, transparent 0 53%, rgba(126, 181, 212, 0.2) 53.2% 53.7%, transparent 54% 100%),
    radial-gradient(circle at 26% 34%, rgba(255,255,255,0.85), transparent 22%),
    radial-gradient(circle at 79% 9%, rgba(255,255,255,0.75), transparent 24%),
    repeating-linear-gradient(0deg, rgba(112, 170, 204, 0.08) 0 2px, transparent 2px 86px),
    repeating-linear-gradient(90deg, rgba(112, 170, 204, 0.07) 0 2px, transparent 2px 102px);
}

.map-bg::after {
  content: "澄鹿路";
  position: absolute;
  left: 8%;
  bottom: 2%;
  color: rgba(70, 88, 103, 0.28);
  font-size: clamp(24px, 3vw, 42px);
  font-weight: 700;
  transform: rotate(-12deg);
}

.header,
.decor-line,
.summary-row,
.content {
  position: relative;
  z-index: 1;
}

.header {
  display: flex;
  align-items: center;
  height: 7.2%;
  min-height: 68px;
}

.title {
  margin: 0;
  color: #237fe9;
  font-size: clamp(30px, 3.35vw, 42px);
  font-weight: 800;
  letter-spacing: 1px;
  white-space: nowrap;
}

.top-metrics {
  display: flex;
  align-items: center;
  margin-left: 5.1%;
  gap: clamp(14px, 1.8vw, 26px);
  font-size: clamp(25px, 2.65vw, 36px);
  white-space: nowrap;
}

.type-icon {
  width: clamp(34px, 4vw, 48px);
}

.type-icon span {
  display: block;
  height: 8px;
  margin: 4px 0;
  border-radius: 3px;
  background: #168fe8;
}

.metric-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.metric-item strong {
  color: #168fe8;
  font-size: clamp(40px, 4.45vw, 54px);
  line-height: 1;
}

.metric-item .green {
  color: #0aa7a9;
}

.decor-line {
  height: 2.6%;
  min-height: 18px;
  border-top: 3px solid rgba(77, 164, 239, 0.48);
}

.decor-line::before {
  content: "";
  position: absolute;
  left: 0;
  top: -8px;
  width: 11px;
  height: 11px;
  border: 2px solid #6ba9ef;
  border-radius: 50%;
  background: #eaf4fb;
  box-shadow: 16px 3px 0 -4px #6ba9ef;
}

.summary-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3.8%;
  width: 96%;
  height: 15.7%;
  min-height: 150px;
}

.summary-card {
  position: relative;
  display: grid;
  grid-template-columns: 29% 1fr;
  grid-template-rows: 58% 42%;
  align-items: center;
  overflow: hidden;
  padding: 3.2% 8% 3.2% 3.8%;
  border: 3px solid rgba(68, 179, 235, 0.72);
  border-radius: 16px;
  clip-path: polygon(0 0, 93% 0, 100% 50%, 93% 100%, 0 100%);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.summary-primary {
  color: #fff;
  background: linear-gradient(110deg, rgba(71, 184, 249, 0.82), rgba(20, 142, 233, 0.95));
}

.summary-light {
  color: #182231;
  background: rgba(221, 240, 252, 0.72);
}

.summary-icon {
  grid-row: 1;
  width: clamp(68px, 8.5vw, 96px);
  height: clamp(68px, 8.5vw, 96px);
  justify-self: center;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 0 38%, rgba(183, 229, 255, 0.75) 39% 61%, transparent 62%),
    conic-gradient(from 0deg, transparent 0 12%, rgba(255,255,255,.8) 12% 14%, transparent 14% 36%, rgba(255,255,255,.8) 36% 38%, transparent 38% 100%);
}

.tunnel-icon::after,
.cable-icon::after {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #168fe8;
  font-size: clamp(34px, 4vw, 48px);
  font-weight: 800;
}

.tunnel-icon::after { content: "∩"; }
.cable-icon::after { content: "▭"; }

.summary-name {
  grid-row: 2;
  justify-self: center;
  font-size: clamp(24px, 2.7vw, 34px);
  font-weight: 900;
  line-height: 1.05;
}

.summary-primary .summary-name {
  text-shadow: 0 2px 2px rgba(0,0,0,0.12);
}

.summary-data {
  grid-column: 2;
  grid-row: 1 / 3;
  font-size: clamp(27px, 3.15vw, 40px);
  line-height: 1.95;
}

.summary-data strong {
  margin-left: 8px;
  color: #168fe8;
  font-size: clamp(46px, 5.3vw, 60px);
  line-height: 1;
}

.summary-primary .summary-data strong { color: #fff; }
.summary-data em {
  margin-left: 8px;
  color: #e72d43;
  font-size: clamp(42px, 4.9vw, 56px);
  font-style: normal;
  font-weight: 900;
}

.content {
  display: grid;
  grid-template-columns: 7.1% 1fr;
  gap: 1.7%;
  height: 72%;
  margin-top: 2.6%;
}

.tabs {
  position: relative;
  padding-top: 1.2%;
}

.float-count {
  position: absolute;
  top: -5.2%;
  left: -30%;
  z-index: 4;
  padding: 4px 9px;
  border: 3px solid #1398d6;
  border-radius: 8px;
  color: #5d6268;
  background: #fff;
  font-size: clamp(22px, 2.5vw, 31px);
  line-height: 1.15;
  box-shadow: 0 2px 5px rgba(0, 88, 142, 0.22);
}

.float-count b { color: #ef3046; }

.tab-btn {
  position: relative;
  display: block;
  width: 100%;
  height: 11.8%;
  min-height: 72px;
  margin-bottom: 17%;
  border: 0;
  border-radius: 0 12px 12px 0;
  color: #267ee1;
  background: rgba(147, 199, 244, 0.72);
  cursor: pointer;
  font: inherit;
  font-size: clamp(26px, 3vw, 36px);
  line-height: 1.05;
  letter-spacing: 4px;
}

.tab-btn span {
  display: inline-block;
  writing-mode: vertical-rl;
  text-orientation: upright;
}

.tab-btn.active {
  color: #fff;
  background: linear-gradient(180deg, #1599ef, #168fe8);
  font-weight: 900;
}

.badge {
  position: absolute;
  right: -15%;
  bottom: -18%;
  display: grid;
  place-items: center;
  width: clamp(30px, 3.35vw, 40px);
  height: clamp(30px, 3.35vw, 40px);
  border-radius: 50%;
  color: #fff;
  background: #ef3046;
  font-size: clamp(22px, 2.5vw, 30px);
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0;
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 5.2% 4.3%;
}

.device-card {
  position: relative;
  display: grid;
  grid-template-columns: 31% 1fr;
  align-items: center;
  overflow: hidden;
  padding: 4.5% 5.4%;
  border: 2px solid rgba(99, 202, 235, 0.68);
  border-radius: 2px;
  clip-path: polygon(0 0, 97.2% 0, 100% 12%, 100% 88%, 97.2% 100%, 0 100%);
  background: rgba(226, 243, 253, 0.66);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.device-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.02));
  pointer-events: none;
}

.device-icon-wrap {
  position: relative;
  width: clamp(74px, 8.2vw, 100px);
  height: clamp(74px, 8.2vw, 100px);
  justify-self: center;
}

.device-icon {
  position: absolute;
  inset: 0 0 30% 0;
  z-index: 2;
  display: grid;
  place-items: center;
  color: #168fe8;
  font-size: clamp(28px, 3.2vw, 40px);
  font-weight: 900;
}

.halo {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 4%;
  height: 40%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.92) 0 28%, rgba(105,204,255,.55) 35% 58%, rgba(31,145,225,.16) 66%, transparent 68%);
  box-shadow: 0 8px 14px rgba(22, 143, 232, 0.28);
}

.device-info {
  position: relative;
  z-index: 1;
}

.device-name {
  font-size: clamp(25px, 2.78vw, 34px);
  line-height: 1.15;
  white-space: nowrap;
}

.device-count {
  margin-top: 8%;
  color: #168fe8;
  font-size: clamp(34px, 4vw, 46px);
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.device-count em {
  color: #0aa7a9;
  font-style: normal;
}

.device-card:nth-child(1) .device-count em,
.device-card:nth-child(2) .device-count em {
  color: #e72d43;
}

@media (max-aspect-ratio: 1/1) {
  .dashboard { padding-left: 2.5%; }
  .top-metrics { margin-left: 2%; gap: 10px; }
  .summary-row { width: 100%; gap: 2%; }
  .content { grid-template-columns: 8% 1fr; gap: 1.2%; }
  .device-grid { gap: 4% 2.2%; }
  .device-card { grid-template-columns: 30% 1fr; padding-inline: 3%; }
}
</style>