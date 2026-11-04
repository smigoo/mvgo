'use strict';
/**
 * 运行监测大屏原型 · 本地 Mock 数据集与分页工具
 *
 * 口径来源：CONTRACT.md（唯一约定源）§1 响应信封 / §2 分页 / §4 接口清单，
 * 字段名对齐需求文档 D1–D10 的「响应示例」。
 * 纯函数 + 内存状态，可被 server.js require；无任何外部依赖。
 */

/* ------------------------------------------------------------------ *
 * 0. 基础工具（确定性伪随机 + 时间格式化）
 * ------------------------------------------------------------------ */

/** FNV-1a，把任意字符串映射到 [0,1)，保证同样的 key 每次造出同样的数 */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
function rnd(seed, min, max) {
  return min + hash(seed) * (max - min);
}
function rndInt(seed, min, max) {
  return Math.floor(rnd(seed, min, max + 0.999999));
}
function round(n, digits) {
  const p = Math.pow(10, digits || 0);
  return Math.round(n * p) / p;
}
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

function fmtDateTime(d) {
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
  );
}
function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function fmtHourPoint(d) {
  return fmtDate(d) + ' ' + pad2(d.getHours()) + ':00:00';
}
function fmtHourLabel(d) {
  return pad2(d.getHours()) + ':00';
}
function addHours(d, n) {
  const t = new Date(d.getTime());
  t.setHours(t.getHours() + n);
  return t;
}
function addDays(d, n) {
  const t = new Date(d.getTime());
  t.setDate(t.getDate() + n);
  return t;
}
function parseDate(str, fallback) {
  if (!str) return fallback;
  const s = String(str).trim().replace(' ', 'T');
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  return isNaN(d.getTime()) ? fallback : d;
}

/* ------------------------------------------------------------------ *
 * 1. 路段
 * ------------------------------------------------------------------ */

const SECTIONS = [
  { sectionNum: 'S001', sectionName: '江阴靖江长江隧道', upName: '北京方向', downName: '上海方向' },
  { sectionNum: 'S002', sectionName: '江阴大桥', upName: '北京方向', downName: '上海方向' }
];

/** 文档 D1/D2 里的历史编码，做别名映射，避免前端拿旧编号调不通 */
const SECTION_ALIAS = { 'S23-JY': 'S001', 'S23-JQ': 'S002' };

function resolveSection(sectionNum) {
  const code = SECTION_ALIAS[sectionNum] || sectionNum;
  return SECTIONS.find((s) => s.sectionNum === code) || null;
}

/** 解析 sectionNum：支持 ?sectionNum=S001&sectionNum=S002 与 ?sectionNum=S001,S002 */
function parseSectionNums(raw) {
  const arr = Array.isArray(raw) ? raw : raw == null ? [] : [].concat(raw);
  const out = [];
  arr.forEach((v) => {
    String(v)
      .split(',')
      .forEach((one) => {
        const t = one.trim();
        if (t && out.indexOf(t) === -1) out.push(t);
      });
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. 统一分页（唯一实现，所有列表端点复用）
 * ------------------------------------------------------------------ */

/**
 * @param {Array} arr 全量数据
 * @param {number|string} pageNum 页码，1-based
 * @param {number|string} pageSize 每页条数
 * @returns {{list: Array, page: Object}} CONTRACT §2 分页对象
 */
function paginate(arr, pageNum, pageSize) {
  const rows = Array.isArray(arr) ? arr : [];
  const totalNum = rows.length;
  let currentPage = parseInt(pageNum, 10);
  let size = parseInt(pageSize, 10);
  if (!Number.isFinite(currentPage) || currentPage < 1) currentPage = 1;
  if (!Number.isFinite(size) || size < 1) size = 20;
  if (size > 500) size = 500;

  const totalPages = totalNum === 0 ? 0 : Math.ceil(totalNum / size);
  const startRow = totalNum === 0 ? 0 : (currentPage - 1) * size + 1;
  const endRow = totalNum === 0 ? 0 : Math.min(currentPage * size, totalNum);
  const list = rows.slice((currentPage - 1) * size, (currentPage - 1) * size + size);

  return {
    list,
    page: {
      totalNum,
      currentPage,
      pageSize: size,
      totalPages,
      firstPage: 1,
      lastPage: totalPages,
      startRow,
      endRow
    }
  };
}

/* ------------------------------------------------------------------ *
 * 3. 实时抖动状态（每 60s 由 server 调 tick()，模拟实时变化）
 * ------------------------------------------------------------------ */

const LIVE = { rev: 0, flowFactor: 1, realtimeFactor: 1 };

function tick() {
  LIVE.rev += 1;
  // 幅度 ±1.5%，保证轮询时数值可见变化但不会跳变到不合理区间
  LIVE.flowFactor = 1 + (hash('flow' + LIVE.rev) - 0.5) * 0.03;
  LIVE.realtimeFactor = 1 + (hash('rt' + LIVE.rev) - 0.5) * 0.06;
  return { rev: LIVE.rev, flowFactor: LIVE.flowFactor, realtimeFactor: LIVE.realtimeFactor };
}

/* ------------------------------------------------------------------ *
 * 4. 流量（D1 / D2 / D3）
 * ------------------------------------------------------------------ */

/** 24 小时形态系数：凌晨低谷、早晚高峰，保证曲线连续合理 */
const HOUR_SHAPE = [
  0.35, 0.25, 0.20, 0.18, 0.20, 0.30, 0.55, 0.85,
  1.05, 0.95, 0.85, 0.90, 1.00, 0.95, 0.90, 0.95,
  1.10, 1.25, 1.15, 0.95, 0.80, 0.70, 0.55, 0.45
];

const FLOW_THRESHOLD = 3000;

/** 单方向某小时的流量（base 使全天双方向合计约 4.5 万辆） */
function hourFlow(sectionNum, hour, dir) {
  const base = 1315;
  const shape = HOUR_SHAPE[hour];
  const wobble = 0.88 + hash(sectionNum + '|' + dir + '|' + hour) * 0.24;
  return Math.round(base * shape * wobble);
}

/** 某路段当日 0 点至当前小时的逐小时上下行流量 */
function buildHourlySeries(sectionNum, uptoHour) {
  const limited = typeof uptoHour === 'number' ? Math.max(0, Math.min(23, uptoHour)) : 23;
  const out = [];
  for (let h = 0; h <= limited; h++) {
    out.push({ hour: h, upFlow: hourFlow(sectionNum, h, 'up'), downFlow: hourFlow(sectionNum, h, 'down') });
  }
  return out;
}

/** 就近一小时：最近 4 个 15 分钟点 + 当前点，共 5 个，步长 15 分钟 */
function buildQuarterSeries(sectionNum, now) {
  const out = [];
  const base = addHours(new Date(now.getTime()), 0);
  base.setMinutes(Math.floor(base.getMinutes() / 15) * 15, 0, 0);
  for (let i = 4; i >= 0; i--) {
    const t = new Date(base.getTime() - i * 15 * 60 * 1000);
    const h = t.getHours();
    const shape = HOUR_SHAPE[h];
    const seed = sectionNum + '|q|' + t.getHours() + ':' + t.getMinutes();
    out.push({
      time: pad2(t.getHours()) + ':' + pad2(t.getMinutes()),
      upFlow: Math.round(1315 * shape * 0.26 * (0.85 + hash(seed + 'up') * 0.3)),
      downFlow: Math.round(1315 * shape * 0.26 * (0.85 + hash(seed + 'down') * 0.3))
    });
  }
  return out;
}

/**
 * GET /operation/flow/todayFlow
 * @param {string[]} sectionNums
 * @param {number} type 1=24小时（默认） 2=就近一小时
 */
function buildTodayFlow(sectionNums, type, now) {
  const t = now || new Date();
  const nums = (sectionNums && sectionNums.length ? sectionNums : [SECTIONS[0].sectionNum]);
  const items = nums.map((num) => {
    const sec = resolveSection(num);
    const sectionNum = sec ? sec.sectionNum : num;
    const sectionName = sec ? sec.sectionName : num;

    const hourly = buildHourlySeries(sectionNum, t.getHours());
    let upFlow = hourly.reduce((s, x) => s + x.upFlow, 0);
    let downFlow = hourly.reduce((s, x) => s + x.downFlow, 0);

    // 抖动只作用在累计值上，趋势序列跟随同一因子，保证两者自洽
    const f = LIVE.flowFactor;
    const trendList =
      type === 2
        ? buildQuarterSeries(sectionNum, t)
        : hourly.map((x) => ({
            time: pad2(x.hour) + ':00',
            upFlow: Math.round(x.upFlow * f),
            downFlow: Math.round(x.downFlow * f)
          }));

    upFlow = Math.round(upFlow * f);
    downFlow = Math.round(downFlow * f);

    return {
      sectionNum,
      sectionName,
      dailyTotalFlow: upFlow + downFlow,
      upFlow,
      downFlow,
      yoyChange: round(2.4 + hash(sectionNum + 'yoy') * 6.8, 1),
      trendList
    };
  });

  const peakTotal = items.reduce((m, it) => {
    const p = it.trendList.reduce((s, x) => Math.max(s, x.upFlow + x.downFlow), 0);
    return Math.max(m, p);
  }, 0);

  return {
    flowThreshold: FLOW_THRESHOLD,
    flowSuggestion: peakTotal >= FLOW_THRESHOLD ? '建议分流' : '通行正常',
    items
  };
}

/* -------------------------- 车型（D2） -------------------------- */

/** 文档 D2 的 10 个细分子类（k1~k4 客车、h1~h6 货车），趋势接口按此返回 */
const VEHICLE_SUB_TYPES = [
  { code: 'k1', name: '客1（小型客车）', cls: 'bus', weight: 26 },
  { code: 'k2', name: '客2（中型客车）', cls: 'bus', weight: 2.6 },
  { code: 'k3', name: '客3（大型客车）', cls: 'bus', weight: 8.1 },
  { code: 'k4', name: '客4（特大型客车）', cls: 'bus', weight: 0.1 },
  { code: 'h1', name: '货1（微型货车）', cls: 'truck', weight: 0.28 },
  { code: 'h2', name: '货2（轻型货车）', cls: 'truck', weight: 0.16 },
  { code: 'h3', name: '货3（中型货车）', cls: 'truck', weight: 0.68 },
  { code: 'h4', name: '货4（重型货车）', cls: 'truck', weight: 0.24 },
  { code: 'h5', name: '货5（集装箱车）', cls: 'truck', weight: 0.05 },
  { code: 'h6', name: '货6（专项作业车）', cls: 'truck', weight: 0.02 }
];

/**
 * 车型分布饼图的 7 个大类（占比合计 100%），由 10 个细分子类聚合而来：
 * 客1/客2/客3/客4 各自独立，货1/货2 独立，货3~货6 合并为「中重型货车」。
 */
const VEHICLE_DISPLAY_TYPES = [
  { code: 'k1', name: '小型客车' },
  { code: 'k2', name: '中型客车' },
  { code: 'k3', name: '大型客车' },
  { code: 'k4', name: '特大型客车' },
  { code: 'h1', name: '微型货车' },
  { code: 'h2', name: '轻型货车' },
  { code: 'h3', name: '中重型货车', mergeFrom: ['h3', 'h4', 'h5', 'h6'] }
];

/** 各细分子类的当日累计量 */
function buildSubTypeCounts(sectionNum) {
  const total = Math.round(38000 * (0.9 + hash(sectionNum + 'vt') * 0.2));
  const sumW = VEHICLE_SUB_TYPES.reduce((s, x) => s + x.weight, 0);
  const counts = {};
  VEHICLE_SUB_TYPES.forEach((x) => {
    const wob = 0.85 + hash(sectionNum + '|' + x.code) * 0.3;
    counts[x.code] = Math.max(0, Math.round((total * x.weight * wob) / sumW));
  });
  return counts;
}

/** 最大余数法分配百分比，保证合计恰好 100.0 */
function withRatios(list) {
  const total = list.reduce((s, x) => s + x.value, 0) || 1;
  const raw = list.map((x) => (x.value / total) * 1000);
  const floors = raw.map((v) => Math.floor(v));
  let rest = 1000 - floors.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && rest > 0; k++) {
    floors[order[k].i] += 1;
    rest -= 1;
  }
  return list.map((x, i) => ({
    typeCode: x.typeCode,
    typeName: x.typeName,
    count: x.value,
    ratio: round(floors[i] / 10, 1)
  }));
}

/**
 * GET /operation/flow/todayVehicleTypeStatic
 * 文档原文只返回 {busNum,truckNum}；CONTRACT §4 要求补 items[].sectionNum 归属。
 * 这里做超集：顶层保留 busNum/truckNum（单路段调用方兼容），items[] 带路段归属与 7 类占比。
 */
function buildVehicleType(sectionNums) {
  const nums = sectionNums && sectionNums.length ? sectionNums : [SECTIONS[0].sectionNum];
  let busTotal = 0;
  let truckTotal = 0;

  const items = nums.map((num) => {
    const sec = resolveSection(num);
    const sectionNum = sec ? sec.sectionNum : num;
    const sectionName = sec ? sec.sectionName : num;
    const counts = buildSubTypeCounts(sectionNum);

    const busNum = counts.k1 + counts.k2 + counts.k3 + counts.k4;
    const truckNum = counts.h1 + counts.h2 + counts.h3 + counts.h4 + counts.h5 + counts.h6;
    busTotal += busNum;
    truckTotal += truckNum;

    const display = VEHICLE_DISPLAY_TYPES.map((d) => ({
      typeCode: d.code,
      typeName: d.name,
      value: d.mergeFrom
        ? d.mergeFrom.reduce((s, c) => s + (counts[c] || 0), 0)
        : counts[d.code] || 0
    }));

    return {
      sectionNum,
      sectionName,
      busNum,
      truckNum,
      totalNum: busNum + truckNum,
      busRatio: round((busNum / (busNum + truckNum)) * 100, 1),
      truckRatio: round((truckNum / (busNum + truckNum)) * 100, 1),
      types: withRatios(display)
    };
  });

  return { busNum: busTotal, truckNum: truckTotal, items };
}

/**
 * GET /operation/flow/todayVehicleTypeTrend
 * 文档口径：顶层 k1~h6 + scatterData（按小时×方向）；CONTRACT 要求 sectionNum[] 支持多路段，
 * 因此额外给 items[]（多路段数组），单路段调用方可直接用顶层字段。
 */
function buildVehicleTypeTrend(sectionNums, type, now) {
  const t = now || new Date();
  const nums = sectionNums && sectionNums.length ? sectionNums : [SECTIONS[0].sectionNum];

  const items = nums.map((num) => {
    const sec = resolveSection(num);
    const sectionNum = sec ? sec.sectionNum : num;
    const sectionName = sec ? sec.sectionName : num;
    const counts = buildSubTypeCounts(sectionNum);

    const scatterData = [];
    const step = type === 2 ? 0.25 : 1;
    const points = type === 2 ? 5 : 24;
    for (let i = 0; i < points; i++) {
      const hour = type === 2 ? Math.max(0, t.getHours() - (points - 1 - i)) : i;
      const tt = new Date(t.getTime());
      tt.setHours(hour, type === 2 ? Math.round((i % 4) * 15) : 0, 0, 0);
      const shape = HOUR_SHAPE[hour];
      const scale = (shape / 13.9) * 0.06; // 24 小时份额按小时形态分配
      const mk = (dir) => {
        const o = {};
        VEHICLE_SUB_TYPES.forEach((v) => {
          const wob = 0.7 + hash(sectionNum + '|sc|' + hour + '|' + i + '|' + dir + v.code) * 0.6;
          o[v.code] = Math.round(counts[v.code] * scale * step * wob);
        });
        return o;
      };
      scatterData.push({
        time: fmtDate(tt) + ' ' + pad2(hour) + ':' + pad2(tt.getMinutes()) + ':00',
        upStatic: mk('up'),
        downStatic: mk('down')
      });
    }

    const out = { sectionNum, sectionName };
    VEHICLE_SUB_TYPES.forEach((v) => {
      out[v.code] = counts[v.code];
    });
    out.scatterData = scatterData;
    return out;
  });

  const first = items[0];
  const flat = Object.assign({}, first);
  delete flat.sectionNum;
  delete flat.sectionName;
  return Object.assign(flat, { items });
}

/* ------------------- 流量预测（D3，四接口） ------------------- */

/** GET /operation/forecast/realtime */
function buildRealtime(sectionNum, now) {
  const t = now || new Date();
  const sec = resolveSection(sectionNum) || { sectionNum: sectionNum, sectionName: sectionNum };
  const f = LIVE.realtimeFactor;
  const hourValue = (offset) => {
    const h = (t.getHours() + offset + 24) % 24;
    const base = hourFlow(sec.sectionNum, h, 'up') + hourFlow(sec.sectionNum, h, 'down');
    return Math.round(base * f);
  };
  const point = (offset, withActual) => {
    const d = addHours(t, offset);
    d.setMinutes(0, 0, 0);
    const predict = hourValue(offset);
    const o = { time: fmtHourPoint(d), predictFlow: predict };
    if (withActual) {
      const actual = Math.round(predict * (0.96 + hash(sec.sectionNum + 'acc' + offset) * 0.06));
      o.actualFlow = actual;
      o.accuracy = round(Math.min(99.9, (1 - Math.abs(actual - predict) / (actual || 1)) * 100 + 92), 1);
    }
    return o;
  };

  const prev2 = point(-2, true);
  const prev1 = point(-1, true);
  const cur = point(0, true);
  const nxt1 = point(1, false);
  const nxt2 = point(2, false);
  // 响应字段顺序按文档：time / actualFlow / predictFlow / accuracy
  const reorder = (o) => {
    const r = { time: o.time };
    if ('actualFlow' in o) r.actualFlow = o.actualFlow;
    r.predictFlow = o.predictFlow;
    if ('accuracy' in o) r.accuracy = o.accuracy;
    return r;
  };
  return {
    sectionNum: sec.sectionNum,
    sectionName: sec.sectionName,
    prevHour2: reorder(prev2),
    prevHour1: reorder(prev1),
    current: reorder(cur),
    nextHour1: reorder(nxt1),
    nextHour2: reorder(nxt2)
  };
}

/** GET /operation/forecast/staticsByHour */
function buildStaticsByHour(sectionNum, startTime, endTime, now) {
  const t = now || new Date();
  const sec = resolveSection(sectionNum) || { sectionNum: sectionNum };
  const start = parseDate(startTime, new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0));
  let end = parseDate(endTime, new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 0, 0));
  if (end.getTime() < start.getTime()) end = start;

  // 最多 24 个点，避免调用方传了跨天区间把响应撑爆
  const maxPoints = 24;
  const items = [];
  let cursor = new Date(start.getTime());
  cursor.setMinutes(0, 0, 0);
  const currentHour = t.getHours();
  while (cursor.getTime() <= end.getTime() && items.length < maxPoints) {
    const h = cursor.getHours();
    const isFuture = cursor.getTime() > t.getTime();
    const predict = Math.round((hourFlow(sec.sectionNum, h, 'up') + hourFlow(sec.sectionNum, h, 'down')) * 1.02);
    const item = { time: fmtHourPoint(cursor), predictFlow: predict };
    if (!isFuture) {
      const actual = Math.round(predict * (0.94 + hash(sec.sectionNum + 'h' + h) * 0.1));
      item.actualFlow = actual;
      item.lastYearFlow = Math.round(actual * (0.72 + hash(sec.sectionNum + 'ly' + h) * 0.18));
      item.historyMaxFlow = Math.round(actual * (1.15 + hash(sec.sectionNum + 'hm' + h) * 0.3));
    }
    items.push(item);
    cursor = addHours(cursor, 1);
  }
  return { sectionNum: sec.sectionNum, currentHour, items };
}

/** GET /operation/forecast/staticsByDay */
function buildStaticsByDay(sectionNum, startDate, endDate, now) {
  const t = now || new Date();
  const sec = resolveSection(sectionNum) || { sectionNum: sectionNum };
  let start = parseDate(startDate, addDays(t, -6));
  let end = parseDate(endDate, t);
  if (end.getTime() < start.getTime()) end = start;

  const items = [];
  let cursor = new Date(start.getTime());
  cursor.setHours(0, 0, 0, 0);
  const todayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 60) {
    guard += 1;
    const isFuture = cursor.getTime() > todayStart;
    const dow = cursor.getDay();
    const weekendBoost = dow === 0 || dow === 6 ? 1.12 : 1;
    const predict = Math.round((60000 * weekendBoost + hash(sec.sectionNum + 'd' + fmtDate(cursor)) * 8000) * 1.0);
    const item = { date: fmtDate(cursor), predictFlow: predict };
    if (!isFuture) {
      const actual = Math.round(predict * (0.95 + hash(sec.sectionNum + 'da' + fmtDate(cursor)) * 0.09));
      item.actualFlow = actual;
      item.lastYearFlow = Math.round(actual * (0.78 + hash(sec.sectionNum + 'dl' + fmtDate(cursor)) * 0.14));
      item.historyMaxFlow = Math.round(actual * (1.18 + hash(sec.sectionNum + 'dh' + fmtDate(cursor)) * 0.22));
    }
    items.push(item);
    cursor = addDays(cursor, 1);
  }
  return { sectionNum: sec.sectionNum, items };
}

/** GET /operation/forecast/holiday */
const HOLIDAYS = [
  { holidayName: '春运', startDate: '2026-01-14', endDate: '2026-02-22' },
  { holidayName: '清明', startDate: '2026-04-04', endDate: '2026-04-06' },
  { holidayName: '劳动', startDate: '2026-05-01', endDate: '2026-05-05' },
  { holidayName: '端午', startDate: '2026-05-30', endDate: '2026-06-01' },
  { holidayName: '中秋', startDate: '2026-09-25', endDate: '2026-09-27' },
  { holidayName: '国庆', startDate: '2026-10-01', endDate: '2026-10-07' }
];
function buildHoliday() {
  return { items: HOLIDAYS.map((x) => Object.assign({}, x)) };
}

/* ------------------------------------------------------------------ *
 * 5. 重点车辆（D5 / D6 / D7）
 * ------------------------------------------------------------------ */

const PROVINCE = ['苏', '沪', '浙', '皖', '鲁'];
const PLATE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DRIVERS = ['张建国', '李国虎', '王海涛', '陈志强', '刘洪波', '赵明', '孙立新', '周文斌'];
const PHONE_PREFIX = ['138', '139', '150', '158', '177', '186', '189'];

function makePlate(seed) {
  const p = PROVINCE[rndInt(seed + 'p', 0, PROVINCE.length - 1)];
  const c = PLATE_CHARS[rndInt(seed + 'c', 0, PLATE_CHARS.length - 1)];
  const num = String(rndInt(seed + 'n', 10000, 99999));
  return p + c + '·' + num;
}

/** 危化品运送类型（D6 饼图口径） */
const HAZARDOUS_TYPES = ['爆炸品', '气体', '易燃液体', '易燃固体', '腐蚀性物品', '其他'];

/**
 * GET /operation/point/pointTypeStatics
 * 文档只给 hazardousCount / truckCount，字段名严格照抄。
 */
function buildPointTypeStatics(sectionNum) {
  const sec = resolveSection(sectionNum) || { sectionNum: sectionNum };
  return {
    sectionNum: sec.sectionNum,
    hazardousCount: rndInt(sec.sectionNum + 'hz', 8, 26),
    truckCount: rndInt(sec.sectionNum + 'tk', 60, 120)
  };
}

/**
 * GET /operation/point/pointCarDetail 的全量数据（62 条/类型，供真分页）
 * carType: 1=重型货车 2=超高车辆（CONTRACT §4 口径）
 * 未驶离记录：exitTime / avgSpeed 均为字符串 "-"，driveStatus="0"
 */
function buildCarDetailRows(sectionNum, carType, direction, licensePlate) {
  const sec = resolveSection(sectionNum) || { sectionNum: sectionNum };
  const typeCode = String(carType);
  const rows = [];
  const now = new Date();
  const total = 62;

  for (let i = 0; i < total; i++) {
    const seed = sec.sectionNum + '|car|' + typeCode + '|' + i;
    const dir = direction ? String(direction) : hash(seed + 'dir') > 0.5 ? '1' : '2';
    const plate = makePlate(seed + 'plate');
    const entry = new Date(now.getTime() - (i * 23 + 7) * 60 * 1000);
    // 尾部约 1/4 记录为「未驶离」，让 driveStatus 0/1 与 "-" 都能被前端覆盖到
    const notExited = i % 4 === 3;
    const driveMinutes = rndInt(seed + 'dur', 4, 26);
    const exit = new Date(entry.getTime() + driveMinutes * 60 * 1000);
    const avgSpeed = notExited ? '-' : round(rnd(seed + 'spd', 48, 96), 0);
    const driverIdx = rndInt(seed + 'drv', 0, DRIVERS.length - 1);

    rows.push({
      id: 'cd-' + typeCode + '-' + pad2(i + 1) + '-' + (sec.sectionNum || 'S001'),
      plateNo: plate,
      entryTime: fmtDateTime(entry),
      exitTime: notExited ? '-' : fmtDateTime(exit),
      avgSpeed: avgSpeed,
      driverName: DRIVERS[driverIdx],
      driverPhone: PHONE_PREFIX[rndInt(seed + 'ph', 0, PHONE_PREFIX.length - 1)] + String(rndInt(seed + 'phn', 10000000, 99999999)),
      driveStatus: notExited ? '0' : '1',
      // 以下为筛选用的内部字段，返回前剔除
      _direction: dir,
      _carType: typeCode
    });
  }

  let filtered = rows;
  if (licensePlate) {
    const kw = String(licensePlate).trim().toUpperCase();
    filtered = filtered.filter((r) => r.plateNo.toUpperCase().indexOf(kw) >= 0);
  }
  return filtered.map((r) => {
    const { _direction, _carType, ...rest } = r;
    return rest;
  });
}

/**
 * GET /operation/point/hazardousTypeDistribution
 * 文档示例的 data 是数组；CONTRACT §4 统一为 { data: [...] } 包在 envelope.data 内。
 */
function buildHazardousTypeDistribution(sectionNum, direction) {
  const sec = resolveSection(sectionNum) || { sectionNum: sectionNum };
  const dirKey = direction ? String(direction) : 'all';
  const list = HAZARDOUS_TYPES.map((name, i) => ({
    typeName: name,
    count: rndInt(sec.sectionNum + '|hztype|' + dirKey + '|' + i, 2, 28)
  }));
  return { data: list.sort((a, b) => b.count - a.count) };
}

/** 危化品名录（D7 运单） */
const DANGEROUS_GOODS = [
  { name: '氮气，冷冻液体', type: '2.2' },
  { name: '汽油', type: '3' },
  { name: '液化石油气', type: '2.1' },
  { name: '硫酸', type: '8' },
  { name: '甲醇', type: '3' },
  { name: '硝酸铵', type: '5.1' },
  { name: '液氨', type: '2.3' },
  { name: '氢氧化钠溶液', type: '8' }
];
const CITIES = ['江苏省南京市江宁区', '江苏省镇江市京口区', '江苏省泰州市泰兴市', '江苏省苏州市相城区', '江苏省无锡市惠山区', '江苏省南通市海门区', '上海市嘉定区'];

/**
 * GET /operation/point/wayBillRecord 全量数据（62 条，供真分页）
 * 车牌可选：不传返回全部运单（大屏 / 弹窗通用），传了则精确匹配。
 * 字段 15 个（含 id），与 D7 响应参数表逐字段一致。
 */
function buildWaybillRows(licensePlate) {
  const rows = [];
  const now = new Date();
  const fixedPlate = licensePlate || '苏A·D12345';

  for (let i = 0; i < 62; i++) {
    const seed = 'wb|' + fixedPlate + '|' + i;
    const goods = DANGEROUS_GOODS[rndInt(seed + 'g', 0, DANGEROUS_GOODS.length - 1)];
    const departure = new Date(now.getTime() - (i * 97 + 30) * 60 * 1000);
    const finished = i % 3 !== 0;
    const mileage = rndInt(seed + 'm', 80, 420);
    const hours = round(mileage / rnd(seed + 'v', 45, 65), 1);
    const driverIdx = rndInt(seed + 'd', 0, DRIVERS.length - 1);
    const plate = licensePlate ? fixedPlate : makePlate(seed + 'plate');

    rows.push({
      id: ((hash(seed + 'id') * 1e16).toFixed(0) + 'abcdef0123456789').slice(0, 32),
      wayBillNo: '3206030014' + fmtDate(departure).replace(/-/g, '') + pad2(rndInt(seed + 'no1', 0, 23)) + pad2(rndInt(seed + 'no2', 0, 59)) + pad2(rndInt(seed + 'no3', 0, 59)),
      dangerousGoodsName: goods.name,
      dangerousGoodsType: goods.type,
      origin: CITIES[rndInt(seed + 'o', 0, CITIES.length - 1)],
      destination: CITIES[rndInt(seed + 'de', 0, CITIES.length - 1)],
      departureTime: fmtDateTime(departure),
      arrivalTime: finished ? fmtDateTime(new Date(departure.getTime() + hours * 3600 * 1000)) : null,
      estimatedTravelTime: hours.toFixed(1),
      fullLoad: hash(seed + 'f') > 0.35 ? '1' : '2',
      transportStatus: finished ? '2' : '1',
      transportMileage: mileage,
      totalWeight: round(rnd(seed + 'w', 8, 32), 2),
      driverName: DRIVERS[driverIdx],
      driverPhone: PHONE_PREFIX[rndInt(seed + 'p', 0, PHONE_PREFIX.length - 1)] + String(rndInt(seed + 'pn', 10000000, 99999999))
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * 6. 智能侦测事件（D8 / D9）
 * ------------------------------------------------------------------ */

const EVENT_TYPES = [
  { code: 'OVER_HEIGHT', name: '超高车辆', contents: ['检测到超高车辆通行', '车辆载物超过限高', '入口超高检测触发'] },
  { code: 'ILLEGAL', name: '违法行为', contents: ['检测到车辆违停', '检测到车辆逆行', '检测到车辆占用应急车道'] },
  { code: 'ABNORMAL_EVENT', name: '异常事件', contents: ['检测到隧道内抛洒物', '检测到行人进入隧道', '检测到车辆异常停驶'] },
  { code: 'ABNORMAL_WEATHER', name: '异常天气', contents: ['隧道口团雾能见度低', '强降雨路面湿滑', '大风预警'] },
  { code: 'ABNORMAL_REPORT', name: '异常上报', contents: ['巡查上报路面坑槽', '上报隧道照明异常', '上报消防设施缺失'] },
  { code: 'ENV_ABNORMAL', name: '环境异常', contents: ['隧道内CO浓度超限', '隧道内能见度低于安全阈值', '洞内照度不足'] },
  { code: 'STRUCT_ABNORMAL', name: '结构异常', contents: ['隧道结构沉降超限', '衬砌裂缝扩展超限', '渗漏水监测异常'] }
];

const EVENT_LEVELS = ['HIGH', 'MEDIUM', 'LOW'];
const EVENT_STATUS = ['PENDING', 'PROCESSING', 'DONE', 'FALSE_ALARM', 'IGNORED'];
const DIRECTIONS = ['上行', '下行'];

function makePileNumber(seed) {
  const k = rndInt(seed + 'k', 24, 30);
  const m = rndInt(seed + 'm', 0, 9) * 100 + rndInt(seed + 'mm', 0, 99);
  return 'K' + k + '+' + pad2(Math.floor(m / 100)) + pad2(m % 100);
}

function buildEventRow(seed, sectionName, eventType) {
  const type = eventType
    ? EVENT_TYPES.find((t) => t.code === eventType) || EVENT_TYPES[0]
    : EVENT_TYPES[rndInt(seed + 'et', 0, EVENT_TYPES.length - 1)];
  const now = new Date();
  const minutesAgo = rndInt(seed + 'ago', 0, 600);
  const alertTime = new Date(now.getTime() - minutesAgo * 60 * 1000);
  const seq = String(rndInt(seed + 'seq', 100, 999));
  const ymd = fmtDate(alertTime).replace(/-/g, '');

  return {
    id: 'ev' + ymd + seq,
    eventNo: 'EV' + ymd + seq,
    eventType: type.code,
    eventTypeName: type.name,
    alertTime: fmtDateTime(alertTime),
    sectionName: sectionName,
    direction: DIRECTIONS[rndInt(seed + 'dir', 0, 1)],
    pileNumber: makePileNumber(seed),
    alertContent: type.contents[rndInt(seed + 'ct', 0, type.contents.length - 1)],
    // 文档 WS 示例里的 CRITICAL 是笔误，CONTRACT §4 统一为 HIGH/MEDIUM/LOW
    eventLevel: EVENT_LEVELS[rndInt(seed + 'lv', 0, 2)],
    status: EVENT_STATUS[rndInt(seed + 'st', 0, 4)]
  };
}

/**
 * GET /operation/detection/eventList 全量数据（64 条，供真分页）
 * eventType 不传 = 全部类型。
 */
function buildEventRows(sectionNum, eventType) {
  const sec = resolveSection(sectionNum);
  const sectionName = sec ? sec.sectionName : '江阴靖江长江隧道';
  const rows = [];
  for (let i = 0; i < 64; i++) {
    const seed = (sec ? sec.sectionNum : sectionNum) + '|ev|' + (eventType || 'ALL') + '|' + i;
    rows.push(buildEventRow(seed, sectionName, eventType || null));
  }
  return rows.sort((a, b) => (a.alertTime < b.alertTime ? 1 : -1));
}

/** WS /ws/detection/event 每 5s 推送一条，字段集与 eventList item 完全一致 */
function buildRandomEvent() {
  const rev = LIVE.rev;
  const seed = 'ws|' + Date.now() + '|' + rev + '|' + Math.random();
  const sec = SECTIONS[Math.floor(Math.random() * SECTIONS.length)];
  return buildEventRow(seed, sec.sectionName, null);
}

/**
 * GET /operation/detection/alertDetail
 * alertInfo 为 eventList item 的超集：按 eventType 追加差异化字段（文档 D9）。
 */
function buildAlertDetail(eventId) {
  const seed = 'detail|' + eventId;
  const base = buildEventRow(seed, '江阴靖江长江隧道', null);
  const alertInfo = {
    id: eventId,
    eventNo: 'EV' + fmtDate(new Date()).replace(/-/g, '') + String(rndInt(seed + 'no', 100, 999)),
    eventType: base.eventType,
    eventTypeName: base.eventTypeName,
    alertTime: base.alertTime,
    sectionName: base.sectionName,
    direction: base.direction,
    pileNumber: base.pileNumber,
    alertContent: base.alertContent,
    eventLevel: base.eventLevel,
    status: base.status
  };

  // 差异化字段：超高/结构异常给阈值与实时值，环境异常给告警类型与处理结果
  if (base.eventType === 'OVER_HEIGHT') {
    alertInfo.alertThreshold = '4.3m';
    alertInfo.realtimeValue = round(4.3 + hash(seed + 'rv') * 0.35, 2) + 'm';
    alertInfo.abnormalReason = '车辆载物超高';
  } else if (base.eventType === 'STRUCT_ABNORMAL') {
    alertInfo.monitorPoint = '沉降ZYNG-' + rndInt(seed + 'mp', 1, 9);
    alertInfo.alertThreshold = '-5~5cm';
    alertInfo.realtimeValue = (rndInt(seed + 'sv', 1, 8) > 5 ? '-' : '') + rndInt(seed + 'sv2', 2, 8) + 'cm';
    alertInfo.abnormalReason = '隧道结构沉降超限';
  } else if (base.eventType === 'ENV_ABNORMAL') {
    alertInfo.alertType = ['CO浓度异常', '能见度异常', '照度异常'][rndInt(seed + 'at', 0, 2)];
    alertInfo.abnormalReason = base.alertContent;
    alertInfo.processingResult = '已联动情报板发布限速提示，已通知养护部门';
  } else if (base.eventType === 'ABNORMAL_WEATHER') {
    alertInfo.abnormalReason = base.alertContent;
    alertInfo.processingResult = '已发布天气预警并加密巡查';
  }

  const cameraCount = rndInt(seed + 'cam', 1, 3);
  const cameras = [];
  for (let i = 0; i < cameraCount; i++) {
    const isImage = hash(seed + 'mt' + i) > 0.6;
    const id = 'CAM' + pad2(rndInt(seed + 'cid' + i, 1, 40));
    cameras.push({
      deviceId: id,
      deviceName: '隧道' + (base.direction === '上行' ? '入口' : '出口') + '摄像机' + (i + 1),
      mediaType: isImage ? 'IMAGE' : 'VIDEO',
      mediaUrl: isImage
        ? 'https://mock.local/snap/' + id + '.jpg'
        : 'https://mock.local/video/' + id + '.m3u8'
    });
  }

  const timeline = [
    { time: base.alertTime, action: '系统预警', operator: '系统' }
  ];
  if (base.status === 'PROCESSING' || base.status === 'DONE') {
    const d1 = new Date(new Date(base.alertTime.replace(' ', 'T')).getTime() + 120 * 1000);
    timeline.push({ time: fmtDateTime(d1), action: '调度员确认事件，通知路政核查', operator: '张建国' });
  }
  if (base.status === 'DONE') {
    const d2 = new Date(new Date(base.alertTime.replace(' ', 'T')).getTime() + 900 * 1000);
    timeline.push({ time: fmtDateTime(d2), action: '现场处置完毕，交通恢复', operator: '李国虎' });
  }

  return { alertInfo, cameras, disposalTimeline: timeline };
}

/* ------------------------------------------------------------------ *
 * 7. 环境监测（D10）与设备（#18~#20）
 * ------------------------------------------------------------------ */

/** productCode + monitorType → 量纲与阈值（INNER_ILLUM 两阈值均为 null） */
const MONITOR_PROFILE = {
  CO_SENSOR: { monitorType: 'CO', unit: 'ppm', max: 10.0, min: null, base: 3.2, label: 'CO传感器' },
  VI_SENSOR: { monitorType: 'VI', unit: 'm', max: null, min: 1.5, base: 4.5, label: 'VI能见度检测' },
  INNER_ILLUM_SENSOR: { monitorType: 'INNER_ILLUM', unit: 'lux', max: null, min: null, base: 120, label: '洞内亮度检测' },
  OUTER_ILLUM_SENSOR: { monitorType: 'OUTER_ILLUM', unit: 'lux', max: 20000, min: 500, base: 8600, label: '洞外光强检测' }
};

/**
 * GET /operation/device/monitor
 * 按 monitorType 返回该路段下多设备的 24 小时序列 + 各自阈值。
 */
function buildDeviceMonitor(sectionNum, productCode, monitorType, now) {
  const t = now || new Date();
  const sec = resolveSection(sectionNum) || { sectionNum: sectionNum, sectionName: sectionNum };
  const profile =
    MONITOR_PROFILE[productCode] ||
    Object.values(MONITOR_PROFILE).find((p) => p.monitorType === monitorType) ||
    { monitorType: monitorType, unit: '', max: null, min: null, base: 10, label: monitorType };

  const piles = [
    { pile: 25300, dir: '1', dirName: '上行' },
    { pile: 26100, dir: '2', dirName: '下行' },
    { pile: 25500, dir: '3', dirName: '上下行' }
  ];

  const deviceList = piles.map((p, idx) => {
    const devId = 'env_' + String(monitorType).toLowerCase() + '_' + pad2(idx + 1);
    const seed = sec.sectionNum + '|' + devId;
    const historyData = [];
    for (let h = 0; h <= t.getHours(); h++) {
      const wob = 0.82 + hash(seed + '|h|' + h) * 0.36;
      const daylight = profile.monitorType.indexOf('ILLUM') >= 0 ? 0.35 + (HOUR_SHAPE[h] - 0.18) * 0.9 : 1;
      const value = round(profile.base * wob * Math.max(0.2, daylight), 2);
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate(), h, 0, 0);
      historyData.push({ time: fmtDate(d) + ' ' + pad2(h) + ':00', value });
    }

    return {
      deviceId: devId,
      deviceName: 'K' + Math.floor(p.pile / 1000) + '+' + pad2(p.pile % 1000) + ' ' + profile.label,
      pileNumber: p.pile,
      pileNumberStr: 'K' + Math.floor(p.pile / 1000) + '+' + String(p.pile % 1000).padStart(3, '0'),
      direction: p.dir,
      directionName: p.dirName,
      unit: profile.unit,
      maxThreshold: profile.max,
      minThreshold: profile.min,
      currentValue: historyData.length ? historyData[historyData.length - 1].value : 0,
      historyData
    };
  });

  return { sectionNum: sec.sectionNum, sectionName: sec.sectionName, monitorType, productCode, deviceList };
}

const DEVICE_NAMES = [
  ['CO_SENSOR', 'CO传感器'],
  ['VI_SENSOR', 'VI能见度检测'],
  ['INNER_ILLUM_SENSOR', '洞内亮度检测'],
  ['OUTER_ILLUM_SENSOR', '洞外光强检测'],
  ['CAMERA', '高清摄像机'],
  ['FAN', '射流风机'],
  ['PUMP', '排水泵'],
  ['FIRE', '消防栓']
];
const DEVICE_STATUS = ['ONLINE', 'ONLINE', 'ONLINE', 'OFFLINE', 'FAULT'];

/** #18 GET /operation/device/list 全量数据（48 条，供真分页） */
function buildDeviceRows(sectionNum) {
  const sec = resolveSection(sectionNum) || SECTIONS[0];
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 48; i++) {
    const seed = sec.sectionNum + '|dev|' + i;
    const type = DEVICE_NAMES[i % DEVICE_NAMES.length];
    const status = DEVICE_STATUS[rndInt(seed + 'st', 0, DEVICE_STATUS.length - 1)];
    const hb = new Date(now.getTime() - (status === 'ONLINE' ? rndInt(seed + 'hb', 1, 90) : rndInt(seed + 'hb', 120, 7200)) * 1000);
    const pile = rndInt(seed + 'pile', 24000, 30500);
    rows.push({
      deviceId: 'dev_' + pad2(i + 1),
      deviceName: type[1] + '-' + pad2(i + 1),
      deviceCode: type[0] + '-' + sec.sectionNum + '-' + pad2(i + 1),
      productCode: type[0],
      sectionNum: sec.sectionNum,
      sectionName: sec.sectionName,
      pileNumberStr: 'K' + (pile / 1000).toFixed(3).replace('.', '+'),
      direction: hash(seed + 'd') > 0.5 ? '1' : '2',
      directionName: hash(seed + 'd') > 0.5 ? '上行' : '下行',
      status,
      lastHeartbeat: fmtDateTime(hb)
    });
  }
  return rows;
}

/** #19 GET /operation/device/detail */
function buildDeviceDetail(deviceId, now) {
  const t = now || new Date();
  const rows = buildDeviceRows('S001');
  const found = rows.find((r) => r.deviceId === deviceId) || rows[0];
  const metrics = [];
  for (let h = 0; h <= t.getHours(); h++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate(), h, 0, 0);
    metrics.push({
      time: fmtDate(d) + ' ' + pad2(h) + ':00',
      value: round(30 + hash(deviceId + '|m|' + h) * 60, 1)
    });
  }
  return Object.assign({}, found, {
    installDate: '2024-06-18',
    vendor: '江苏交控智能装备有限公司',
    model: 'JY-' + found.productCode + '-V2',
    repairCount: rndInt(deviceId + 'rc', 0, 4),
    metrics
  });
}

/* ------------------------------------------------------------------ *
 * 8. 文档缺失端点（#21~#25）
 * ------------------------------------------------------------------ */

const WEATHER_KINDS = ['团雾', '强降雨', '大风', '道路结冰', '高温'];
/** #21 GET /operation/detection/weatherAlarmList（30 条） */
function buildWeatherAlarms() {
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const seed = 'wx|' + i;
    const t = new Date(now.getTime() - (i * 137 + 60) * 60 * 1000);
    const kind = WEATHER_KINDS[rndInt(seed + 'k', 0, WEATHER_KINDS.length - 1)];
    rows.push({
      id: 'wa' + pad2(i + 1),
      alarmNo: 'WA' + fmtDate(t).replace(/-/g, '') + pad2(i + 1),
      weatherType: kind,
      weatherTypeName: kind + '预警',
      level: EVENT_LEVELS[rndInt(seed + 'lv', 0, 2)],
      sectionNum: SECTIONS[0].sectionNum,
      sectionName: SECTIONS[rndInt(seed + 'sec', 0, 1)].sectionName,
      publishTime: fmtDateTime(t),
      effectiveTime: fmtDateTime(new Date(t.getTime() + 3 * 3600 * 1000)),
      content: kind + '影响通行，建议降低车速、开启雾灯',
      source: '气象台',
      status: hash(seed + 'st') > 0.4 ? 'ACTIVE' : 'EXPIRED'
    });
  }
  return rows;
}

const REPORT_TYPES = ['路面病害', '设施损坏', '照明异常', '积水', '交通事故', '其他'];
/** #22 GET /operation/detection/reportList（32 条） */
function buildReportRows() {
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 32; i++) {
    const seed = 'rp|' + i;
    const t = new Date(now.getTime() - (i * 91 + 15) * 60 * 1000);
    const kind = REPORT_TYPES[rndInt(seed + 'k', 0, REPORT_TYPES.length - 1)];
    rows.push({
      id: 'rp' + pad2(i + 1),
      reportNo: 'RP' + fmtDate(t).replace(/-/g, '') + pad2(i + 1),
      reportType: kind,
      reportTypeName: kind,
      sectionNum: SECTIONS[0].sectionNum,
      sectionName: SECTIONS[rndInt(seed + 'sec', 0, 1)].sectionName,
      direction: DIRECTIONS[rndInt(seed + 'd', 0, 1)],
      pileNumber: makePileNumber(seed),
      content: '巡查发现' + kind + '，已设置警示标志',
      reportTime: fmtDateTime(t),
      reporter: DRIVERS[rndInt(seed + 'u', 0, DRIVERS.length - 1)],
      reporterPhone: '138' + String(rndInt(seed + 'p', 10000000, 99999999)),
      status: EVENT_STATUS[rndInt(seed + 'st', 0, 2)]
    });
  }
  return rows;
}

const ENV_ALARM_KINDS = ['CO浓度超限', '能见度不足', '照度不足', '温湿度异常'];
/** #23 GET /operation/detection/envAlarmList（36 条） */
function buildEnvAlarms() {
  const rows = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const seed = 'env|' + i;
    const t = new Date(now.getTime() - (i * 73 + 25) * 60 * 1000);
    const kind = ENV_ALARM_KINDS[rndInt(seed + 'k', 0, ENV_ALARM_KINDS.length - 1)];
    const isCo = kind.indexOf('CO') >= 0;
    rows.push({
      id: 'ea' + pad2(i + 1),
      alarmNo: 'EA' + fmtDate(t).replace(/-/g, '') + pad2(i + 1),
      monitorType: isCo ? 'CO' : kind.indexOf('能见度') >= 0 ? 'VI' : 'INNER_ILLUM',
      alarmType: kind,
      deviceId: 'env_' + pad2(i + 1),
      deviceName: 'K25+' + pad2(300 + i * 10) + ' 监测设备',
      sectionNum: SECTIONS[0].sectionNum,
      sectionName: SECTIONS[rndInt(seed + 'sec', 0, 1)].sectionName,
      pileNumber: makePileNumber(seed),
      realtimeValue: isCo ? round(10 + hash(seed + 'v') * 4, 1) : round(0.6 + hash(seed + 'v') * 1.2, 2),
      threshold: isCo ? 10 : 1.5,
      unit: isCo ? 'ppm' : 'm',
      alarmTime: fmtDateTime(t),
      level: EVENT_LEVELS[rndInt(seed + 'lv', 0, 2)],
      status: EVENT_STATUS[rndInt(seed + 'st', 0, 2)]
    });
  }
  return rows;
}

/** #24 GET /operation/monitor/route：路段 + 门架拓扑点位 */
function buildRoute(sectionNum) {
  const nums = sectionNum ? [SECTION_ALIAS[sectionNum] || sectionNum] : SECTIONS.map((s) => s.sectionNum);
  const list = nums
    .map((n) => resolveSection(n))
    .filter(Boolean)
    .map((sec, idx) => {
      const gantries = [];
      for (let i = 0; i < 6; i++) {
        const seed = sec.sectionNum + '|g|' + i;
        gantries.push({
          gantryId: 'G' + sec.sectionNum + pad2(i + 1),
          gantryName: 'K' + (24 + i) + '+000 门架',
          pileNumber: (24000 + i * 1000),
          pileNumberStr: 'K' + (24 + i) + '+000',
          direction: i % 2 === 0 ? '1' : '2',
          directionName: i % 2 === 0 ? '上行' : '下行',
          longitude: round(120.2 + hash(seed + 'lng') * 0.3, 6),
          latitude: round(31.9 + hash(seed + 'lat') * 0.25, 6),
          status: hash(seed + 'st') > 0.15 ? 'ONLINE' : 'OFFLINE'
        });
      }
      return {
        sectionNum: sec.sectionNum,
        sectionName: sec.sectionName,
        upName: sec.upName,
        downName: sec.downName,
        startPile: 'K24+000',
        endPile: 'K30+500',
        lengthKm: round(6.5 + idx * 1.2, 1),
        gantries
      };
    });
  return { sections: list };
}

module.exports = {
  hash, rnd, rndInt, round, pad2,
  fmtDateTime, fmtDate, fmtHourPoint, addHours, addDays, parseDate,
  SECTIONS, SECTION_ALIAS, resolveSection, parseSectionNums,
  paginate, tick, LIVE,
  buildTodayFlow, buildVehicleType, buildVehicleTypeTrend,
  buildRealtime, buildStaticsByHour, buildStaticsByDay, buildHoliday,
  VEHICLE_SUB_TYPES, VEHICLE_DISPLAY_TYPES, HOUR_SHAPE, HOLIDAYS,
  // 重点车辆（D5/D6/D7）
  buildPointTypeStatics, buildCarDetailRows, buildHazardousTypeDistribution, buildWaybillRows,
  // 智能侦测（D8/D9）
  EVENT_TYPES, EVENT_LEVELS, EVENT_STATUS, buildEventRows, buildRandomEvent, buildAlertDetail,
  // 环境监测 + 设备
  MONITOR_PROFILE, buildDeviceMonitor, buildDeviceRows, buildDeviceDetail,
  // 文档缺失端点
  buildWeatherAlarms, buildReportRows, buildEnvAlarms, buildRoute
};
