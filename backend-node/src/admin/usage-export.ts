/**
 * 用户管理「生成日志」导出：时间窗内事件计数 + 等长对比。
 *
 * 口径（产品确认）：
 * - 计的是生成事件，不是组件库库存、不是注册用户数。
 * - 组件：tasks.json 中 taskType=component（缺省也算）；一次任务 = 1 次。
 * - 成功=completed，失败=failed，其余（running/cancelled/queued…）=进行中，不并进失败。
 * - 接口：apifox-tasks.json 一批=1 次；另给 apiCount 之和。账本无 status → 不报失败率。
 * - 对比窗 = 当前窗等长前移，避免「本周未过完 vs 完整上周」。
 * - 时区固定 Asia/Shanghai（无 DST，用 +08:00）。
 */

export const USAGE_TZ = 'Asia/Shanghai';
export const TASK_LEDGER_CAP = 2000;

export type UsagePreset = 'week' | 'd30' | 'd60' | 'custom';

export interface UsageWindow {
  fromMs: number;
  toMs: number;
  label: string;
}

export interface UsageMetrics {
  users: number;
  componentTotal: number;
  microcode: number;
  vue3: number;
  unlabeled: number;
  completed: number;
  failed: number;
  inProgress: number;
  apiBatches: number;
  apiCount: number;
}

export interface DeptUsageRow {
  dept: string;
  current: UsageMetrics;
  previous: UsageMetrics;
}

export interface DailyPoint {
  date: string;
  components: number;
  apiBatches: number;
}

export interface UsageCoverage {
  ledgerMinMs: number | null;
  ledgerMaxMs: number | null;
  truncated: boolean;
  persistedCap: number;
}

export interface ModelCount {
  model: string;
  count: number;
}

export interface DurationModelStats {
  sampleCount: number;
  p50Ms: number | null;
  p90Ms: number | null;
  textModels: ModelCount[];
  visionModels: ModelCount[];
}

export interface UsageExportReport {
  generatedAt: string;
  timezone: string;
  preset: UsagePreset;
  deptFilter: string | null;
  current: UsageWindow;
  previous: UsageWindow;
  coverage: UsageCoverage;
  currentMetrics: UsageMetrics;
  previousMetrics: UsageMetrics;
  byDept: DeptUsageRow[];
  daily: DailyPoint[];
  currentDuration: DurationModelStats;
  previousDuration: DurationModelStats;
  notes: string[];
}

export interface UserProfile {
  id: string;
  uid: string;
  username: string;
  name: string;
  dept: string;
}

export interface ResolveWindowInput {
  preset?: string;
  from?: string;
  to?: string;
  nowMs?: number;
}

const PRESET_LABEL: Record<UsagePreset, string> = {
  week: '本周',
  d30: '最近 30 天',
  d60: '最近 60 天',
  custom: '自定义',
};

const UNLABELED_DEPT = '未标注部门';

export function emptyMetrics(): UsageMetrics {
  return {
    users: 0,
    componentTotal: 0,
    microcode: 0,
    vue3: 0,
    unlabeled: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
    apiBatches: 0,
    apiCount: 0,
  };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymdShanghai(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: USAGE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

export function shanghaiMsFromYmd(ymd: string, h = 0, m = 0, s = 0, ms = 0): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`日期格式须为 YYYY-MM-DD：${ymd}`);
  }
  const t = Date.parse(`${ymd}T${pad2(h)}:${pad2(m)}:${pad2(s)}.${String(ms).padStart(3, '0')}+08:00`);
  if (!Number.isFinite(t)) throw new Error(`无法解析日期：${ymd}`);
  return t;
}

export function formatShanghai(ms: number): string {
  const d = new Date(ms);
  const ymd = ymdShanghai(ms);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: USAGE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return `${ymd} ${parts}`;
}

function weekdayShanghai(ms: number): number {
  const w = new Intl.DateTimeFormat('en-US', {
    timeZone: USAGE_TZ,
    weekday: 'short',
  }).format(new Date(ms));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? 0;
}

function startOfTodayShanghai(nowMs: number): number {
  return shanghaiMsFromYmd(ymdShanghai(nowMs));
}

function mondayOfWeekShanghai(nowMs: number): number {
  const daysFromMonday = (weekdayShanghai(nowMs) + 6) % 7;
  const today = startOfTodayShanghai(nowMs);
  return today - daysFromMonday * 86400000;
}

function parseInstant(raw: string): number {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return shanghaiMsFromYmd(s);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) throw new Error(`无法解析时间：${raw}`);
  return t;
}

function parseEndInstant(raw: string): number {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return shanghaiMsFromYmd(s) + 86400000;
  return parseInstant(s);
}

export function normalizePreset(raw?: string): UsagePreset {
  const p = String(raw || 'week').toLowerCase();
  if (p === 'week' || p === 'd30' || p === 'd60' || p === 'custom') return p;
  throw new Error(`不支持的时间快捷档：${raw}（week / d30 / d60 / custom）`);
}

export function resolveWindows(input: ResolveWindowInput): { current: UsageWindow; previous: UsageWindow } {
  const nowMs = input.nowMs ?? Date.now();
  const preset = normalizePreset(input.preset);
  let fromMs: number;
  let toMs = nowMs;
  if (preset === 'week') {
    fromMs = mondayOfWeekShanghai(nowMs);
  } else if (preset === 'd30') {
    fromMs = startOfTodayShanghai(nowMs) - 29 * 86400000;
  } else if (preset === 'd60') {
    fromMs = startOfTodayShanghai(nowMs) - 59 * 86400000;
  } else {
    if (!input.from || !input.to) {
      throw new Error('自定义时间必须同时提供 from、to（YYYY-MM-DD 或 ISO）');
    }
    fromMs = parseInstant(input.from);
    toMs = parseEndInstant(input.to);
  }
  if (!(toMs > fromMs)) throw new Error('结束时间必须晚于开始时间');
  const duration = toMs - fromMs;
  const prevTo = fromMs;
  const prevFrom = fromMs - duration;
  return {
    current: {
      fromMs,
      toMs,
      label: `${PRESET_LABEL[preset]} ${formatShanghai(fromMs)} ~ ${formatShanghai(toMs)}`,
    },
    previous: {
      fromMs: prevFrom,
      toMs: prevTo,
      label: `等长对比 ${formatShanghai(prevFrom)} ~ ${formatShanghai(prevTo)}`,
    },
  };
}

export function inWindow(ts: number, win: UsageWindow): boolean {
  return ts >= win.fromMs && ts < win.toMs;
}

export function windowDays(win: UsageWindow): number {
  return Math.max(win.toMs - win.fromMs, 1) / 86400000;
}

export function dailyAvg(count: number, win: UsageWindow): number {
  return count / windowDays(win);
}

export function parseTaskTime(task: any): number | null {
  const n = Number(task?.startTime);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

export function parseApiTime(task: any): number | null {
  if (!task?.createdAt) return null;
  const n = Date.parse(String(task.createdAt));
  return Number.isFinite(n) ? n : null;
}

export function isComponentTask(task: any): boolean {
  const tt = task?.taskType;
  return tt === 'component' || tt === undefined || tt === null || tt === '';
}

export function classifyTarget(target: any): 'microcode' | 'vue3' | 'unlabeled' {
  if (target === 'microcode' || target === 'vue3') return target;
  return 'unlabeled';
}

export function classifyStatus(status: any): 'completed' | 'failed' | 'inProgress' {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return 'inProgress';
}

export function whichWindow(ts: number, current: UsageWindow, previous: UsageWindow): 'current' | 'previous' | null {
  if (inWindow(ts, current)) return 'current';
  if (inWindow(ts, previous)) return 'previous';
  return null;
}

type MutableBucket = UsageMetrics & { userSet: Set<string> };

function newBucket(): MutableBucket {
  return { ...emptyMetrics(), userSet: new Set() };
}

function freezeBucket(b: MutableBucket): UsageMetrics {
  const { userSet, ...rest } = b;
  return { ...rest, users: userSet.size };
}

export function buildUserIndex(users: any[]): Map<string, UserProfile> {
  const map = new Map<string, UserProfile>();
  for (const u of users || []) {
    const id = String(u._id || u.id || '');
    if (!id) continue;
    const portal = u.portalInfo || {};
    const uid = String(u.uid || portal.uid || '');
    const profile: UserProfile = {
      id,
      uid,
      username: u.username || id,
      name: portal.name || portal.fullName || u.username || id,
      dept: String(portal.deptName || '').trim() || UNLABELED_DEPT,
    };
    map.set(id, profile);
    if (uid) map.set(uid, profile);
  }
  return map;
}

export function resolveDept(ownerId: string, index: Map<string, UserProfile>): string {
  const p = index.get(String(ownerId));
  return p?.dept || UNLABELED_DEPT;
}

function touchUser(bucket: MutableBucket, ownerId: string) {
  if (ownerId) bucket.userSet.add(ownerId);
}

function addComponent(bucket: MutableBucket, task: any, ownerId: string) {
  touchUser(bucket, ownerId);
  bucket.componentTotal += 1;
  const t = classifyTarget(task.target);
  bucket[t] += 1;
  const st = classifyStatus(task.status);
  bucket[st] += 1;
}

function addApi(bucket: MutableBucket, task: any, ownerId: string) {
  touchUser(bucket, ownerId);
  bucket.apiBatches += 1;
  const n = Number(task.apiCount);
  if (Number.isFinite(n) && n > 0) bucket.apiCount += n;
}

export interface AggregateInput {
  componentTasks: any[];
  apiTasks: any[];
  userIndex: Map<string, UserProfile>;
  current: UsageWindow;
  previous: UsageWindow;
  deptFilter?: string | null;
}

export interface AggregateResult {
  currentMetrics: UsageMetrics;
  previousMetrics: UsageMetrics;
  currentDuration: DurationModelStats;
  previousDuration: DurationModelStats;
  byDept: DeptUsageRow[];
  daily: DailyPoint[];
  coverage: UsageCoverage;
}

export function emptyDurationStats(): DurationModelStats {
  return { sampleCount: 0, p50Ms: null, p90Ms: null, textModels: [], visionModels: [] };
}

/** nearest-rank：ceil(p/100 * n) - 1，空数组返回 null */
export function percentileMs(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function topModels(counter: Map<string, number>, limit = 10): ModelCount[] {
  return [...counter.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model))
    .slice(0, limit);
}

function freezeDuration(durations: number[], text: Map<string, number>, vision: Map<string, number>): DurationModelStats {
  return {
    sampleCount: durations.length,
    p50Ms: percentileMs(durations, 50),
    p90Ms: percentileMs(durations, 90),
    textModels: topModels(text),
    visionModels: topModels(vision),
  };
}

export function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function deptAllowed(dept: string, filter?: string | null): boolean {
  if (!filter) return true;
  return dept === filter;
}

function bumpModel(counter: Map<string, number>, model?: string) {
  const m = String(model || '').trim();
  if (!m) return;
  counter.set(m, (counter.get(m) || 0) + 1);
}

export function aggregateUsage(input: AggregateInput): AggregateResult {
  const cur = newBucket();
  const prev = newBucket();
  const curDur: number[] = [];
  const prevDur: number[] = [];
  const curText = new Map<string, number>();
  const curVision = new Map<string, number>();
  const prevText = new Map<string, number>();
  const prevVision = new Map<string, number>();
  const deptBuckets = new Map<string, { current: MutableBucket; previous: MutableBucket }>();
  const dailyMap = new Map<string, DailyPoint>();
  const ensureDept = (dept: string) => {
    let row = deptBuckets.get(dept);
    if (!row) {
      row = { current: newBucket(), previous: newBucket() };
      deptBuckets.set(dept, row);
    }
    return row;
  };

  let ledgerMin: number | null = null;
  let ledgerMax: number | null = null;
  const bumpLedger = (ts: number) => {
    ledgerMin = ledgerMin == null ? ts : Math.min(ledgerMin, ts);
    ledgerMax = ledgerMax == null ? ts : Math.max(ledgerMax, ts);
  };

  for (const task of input.componentTasks || []) {
    if (!isComponentTask(task)) continue;
    const ts = parseTaskTime(task);
    if (ts == null) continue;
    bumpLedger(ts);
    const ownerId = String(task.userId || '');
    if (!ownerId) continue;
    const dept = resolveDept(ownerId, input.userIndex);
    if (!deptAllowed(dept, input.deptFilter)) continue;
    const side = whichWindow(ts, input.current, input.previous);
    if (!side) continue;
    const bucket = side === 'current' ? cur : prev;
    addComponent(bucket, task, ownerId);
    addComponent(ensureDept(dept)[side], task, ownerId);
    const d = Number((task as any).duration);
    const durArr = side === 'current' ? curDur : prevDur;
    if (Number.isFinite(d) && d > 0) durArr.push(d);
    bumpModel(side === 'current' ? curText : prevText, (task as any).textModel);
    bumpModel(side === 'current' ? curVision : prevVision, (task as any).visionModel);
    if (side === 'current') {
      const day = ymdShanghai(ts);
      const p = dailyMap.get(day) || { date: day, components: 0, apiBatches: 0 };
      p.components += 1;
      dailyMap.set(day, p);
    }
  }

  for (const task of input.apiTasks || []) {
    const ts = parseApiTime(task);
    if (ts == null) continue;
    const ownerId = String(task.ownerId || '');
    if (!ownerId) continue;
    const dept = resolveDept(ownerId, input.userIndex);
    if (!deptAllowed(dept, input.deptFilter)) continue;
    const side = whichWindow(ts, input.current, input.previous);
    if (!side) continue;
    const bucket = side === 'current' ? cur : prev;
    addApi(bucket, task, ownerId);
    addApi(ensureDept(dept)[side], task, ownerId);
    if (side === 'current') {
      const day = ymdShanghai(ts);
      const p = dailyMap.get(day) || { date: day, components: 0, apiBatches: 0 };
      p.apiBatches += 1;
      dailyMap.set(day, p);
    }
  }

  const byDept: DeptUsageRow[] = [...deptBuckets.entries()]
    .map(([dept, row]) => ({
      dept,
      current: freezeBucket(row.current),
      previous: freezeBucket(row.previous),
    }))
    .sort((a, b) => b.current.componentTotal - a.current.componentTotal || a.dept.localeCompare(b.dept, 'zh-CN'));

  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const truncated = ledgerMin != null && input.current.fromMs < ledgerMin;

  return {
    currentMetrics: freezeBucket(cur),
    previousMetrics: freezeBucket(prev),
    currentDuration: freezeDuration(curDur, curText, curVision),
    previousDuration: freezeDuration(prevDur, prevText, prevVision),
    byDept,
    daily,
    coverage: {
      ledgerMinMs: ledgerMin,
      ledgerMaxMs: ledgerMax,
      truncated,
      persistedCap: TASK_LEDGER_CAP,
    },
  };
}

export function deltaAbs(cur: number, prev: number): number {
  return cur - prev;
}

export function deltaRateText(cur: number, prev: number): string {
  const d = cur - prev;
  const sign = d > 0 ? '+' : '';
  if (prev === 0) {
    if (d === 0) return '0';
    return `${sign}${d}（新发生）`;
  }
  const pct = (d / prev) * 100;
  const pctText = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return `${sign}${d}（${pctText}）`;
}

export function formatAvg(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

function metricRows(cur: UsageMetrics, prev: UsageMetrics, win: UsageWindow) {
  const days = windowDays(win);
  const row = (label: string, key: keyof UsageMetrics) => {
    const c = Number(cur[key] || 0);
    const p = Number(prev[key] || 0);
    return {
      label,
      current: c,
      previous: p,
      delta: deltaRateText(c, p),
      avg: formatAvg(c / days),
    };
  };
  return [
    row('生成用户数', 'users'),
    row('组件生成次数', 'componentTotal'),
    row('微码组件', 'microcode'),
    row('Vue3 组件', 'vue3'),
    row('未标注类型', 'unlabeled'),
    row('组件成功', 'completed'),
    row('组件失败', 'failed'),
    row('组件进行中', 'inProgress'),
    row('接口生成批数', 'apiBatches'),
    row('接口条数', 'apiCount'),
  ];
}

export function buildNotes(report: Pick<UsageExportReport, 'coverage' | 'current'>): string[] {
  const notes = [
    '组件生成次数 = 时间窗内 component 任务数（一次任务计 1 次，含失败与进行中），不是组件库库存。',
    '成功 = status completed；失败 = failed；进行中 = running / cancelled / queued 等，不并进失败。',
    '接口生成批数来自 apifox-tasks.json；该账本无失败字段，故不报接口失败率。',
    `对比窗与当前窗等长（${formatAvg(windowDays(report.current))} 天），不是「完整上一自然周/月」。`,
    `组件任务磁盘台账最多保留 ${TASK_LEDGER_CAP} 条（含 progress/configSnapshot，文件可能很大）。`,
    `时区 ${USAGE_TZ}。`,
  ];
  if (report.coverage.truncated) {
    const min = report.coverage.ledgerMinMs != null ? formatShanghai(report.coverage.ledgerMinMs) : '-';
    notes.unshift(
      `⚠️ 当前窗起点早于组件任务台账最早记录（${min}）。更早数据可能已被 2000 条上限裁掉，对比会偏低。`,
    );
  }
  return notes;
}

export function buildReport(opts: {
  preset: UsagePreset;
  deptFilter?: string | null;
  current: UsageWindow;
  previous: UsageWindow;
  agg: AggregateResult;
  nowMs?: number;
}): UsageExportReport {
  const report: UsageExportReport = {
    generatedAt: formatShanghai(opts.nowMs ?? Date.now()),
    timezone: USAGE_TZ,
    preset: opts.preset,
    deptFilter: opts.deptFilter || null,
    current: opts.current,
    previous: opts.previous,
    coverage: opts.agg.coverage,
    currentMetrics: opts.agg.currentMetrics,
    previousMetrics: opts.agg.previousMetrics,
    currentDuration: opts.agg.currentDuration || emptyDurationStats(),
    previousDuration: opts.agg.previousDuration || emptyDurationStats(),
    byDept: opts.agg.byDept,
    daily: opts.agg.daily,
    notes: [],
  };
  report.notes = buildNotes(report);
  return report;
}

function mdEscape(s: string): string {
  return String(s).replace(/\|/g, '\\|');
}

export function renderMarkdown(report: UsageExportReport): string {
  const rows = metricRows(report.currentMetrics, report.previousMetrics, report.current);
  const cd = report.currentDuration;
  const pd = report.previousDuration;
  const lines: string[] = [];
  lines.push(`# 生成使用报告`);
  lines.push('');
  lines.push(`- 生成时间：${report.generatedAt}（${report.timezone}）`);
  lines.push(`- 当前窗口：${report.current.label}`);
  lines.push(`- 对比窗口：${report.previous.label}`);
  lines.push(`- 部门筛选：${report.deptFilter || '全部部门'}`);
  if (cd.sampleCount) {
    lines.push(`- 当前耗时：p50 ${formatDurationMs(cd.p50Ms)} · p90 ${formatDurationMs(cd.p90Ms)} · 样本 ${cd.sampleCount}`);
  }
  if (pd.sampleCount) {
    lines.push(`- 上期耗时：p50 ${formatDurationMs(pd.p50Ms)} · p90 ${formatDurationMs(pd.p90Ms)} · 样本 ${pd.sampleCount}`);
  }
  lines.push('');
  lines.push(`## 全量对照`);
  lines.push('');
  lines.push(`| 指标 | 本期 | 上期 | 增减 | 本期日均 |`);
  lines.push(`| --- | ---: | ---: | --- | ---: |`);
  for (const r of rows) {
    lines.push(`| ${r.label} | ${r.current} | ${r.previous} | ${r.delta} | ${r.avg} |`);
  }
  lines.push('');
  lines.push(`## 耗时统计（仅组件任务）`);
  lines.push('');
  if (cd.sampleCount > 0) {
    lines.push(`| 指标 | 当前 | 上期 |`);
    lines.push(`| --- | ---: | ---: |`);
    lines.push(`| p50（中位数） | ${formatDurationMs(cd.p50Ms)} | ${formatDurationMs(pd.p50Ms)} |`);
    lines.push(`| p90（90分位） | ${formatDurationMs(cd.p90Ms)} | ${formatDurationMs(pd.p90Ms)} |`);
  } else {
    lines.push('（无耗时数据）');
  }
  lines.push('');
  lines.push(`## 模型分布（实际调用模型）`);
  lines.push('');
  if (cd.textModels.length || cd.visionModels.length) {
    lines.push('| 模型 | 当前 | 上期 |');
    lines.push('| --- | ---: | ---: |');
    const all = new Set([...cd.textModels.map(m => m.model), ...cd.visionModels.map(m => m.model), ...pd.textModels.map(m => m.model), ...pd.visionModels.map(m => m.model)]);
    for (const m of [...all].sort()) {
      const cText = cd.textModels.find(x => x.model === m)?.count || 0;
      const pText = pd.textModels.find(x => x.model === m)?.count || 0;
      const cVision = cd.visionModels.find(x => x.model === m)?.count || 0;
      const pVision = pd.visionModels.find(x => x.model === m)?.count || 0;
      lines.push(`| ${m} | ${cText + cVision} | ${pText + pVision} |`);
    }
  } else {
    lines.push('（无模型数据）');
  }
  lines.push('');
  lines.push(`## 按部门`);
  lines.push('');
  if (!report.byDept.length) {
    lines.push('（窗口内无生成记录）');
  } else {
    lines.push(`| 部门 | 用户 | 组件 | 微码 | Vue3 | 成功 | 失败 | 进行中 | 接口批 | 较上期组件 |`);
    lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |`);
    for (const d of report.byDept) {
      const c = d.current;
      lines.push(
        `| ${mdEscape(d.dept)} | ${c.users} | ${c.componentTotal} | ${c.microcode} | ${c.vue3} | ${c.completed} | ${c.failed} | ${c.inProgress} | ${c.apiBatches} | ${deltaRateText(c.componentTotal, d.previous.componentTotal)} |`,
      );
    }
  }
  lines.push('');
  lines.push(`## 本期逐日`);
  lines.push('');
  if (!report.daily.length) {
    lines.push('（无）');
  } else {
    lines.push(`| 日期 | 组件次数 | 接口批数 |`);
    lines.push(`| --- | ---: | ---: |`);
    for (const p of report.daily) {
      lines.push(`| ${p.date} | ${p.components} | ${p.apiBatches} |`);
    }
  }
  lines.push('');
  lines.push(`## 口径说明`);
  lines.push('');
  for (const n of report.notes) lines.push(`- ${n}`);
  lines.push('');
  return lines.join('\n');
}

function htmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deltaClass(cur: number, prev: number): string {
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function renderHtml(report: UsageExportReport): string {
  const rows = metricRows(report.currentMetrics, report.previousMetrics, report.current);
  const maxDaily = Math.max(1, ...report.daily.map((d) => d.components + d.apiBatches));
  const deptRows = report.byDept
    .map((d) => {
      const c = d.current;
      const cls = deltaClass(c.componentTotal, d.previous.componentTotal);
      return `<tr>
        <td>${htmlEscape(d.dept)}</td>
        <td class="num">${c.users}</td>
        <td class="num">${c.componentTotal}</td>
        <td class="num">${c.microcode}</td>
        <td class="num">${c.vue3}</td>
        <td class="num">${c.completed}</td>
        <td class="num">${c.failed}</td>
        <td class="num">${c.inProgress}</td>
        <td class="num">${c.apiBatches}</td>
        <td class="${cls}">${htmlEscape(deltaRateText(c.componentTotal, d.previous.componentTotal))}</td>
      </tr>`;
    })
    .join('');

  const metricTr = rows
    .map((r) => {
      const key = r.label;
      const cur = r.current;
      const prev = r.previous;
      return `<tr>
        <td>${htmlEscape(key)}</td>
        <td class="num">${cur}</td>
        <td class="num">${prev}</td>
        <td class="${deltaClass(cur, prev)}">${htmlEscape(r.delta)}</td>
        <td class="num">${r.avg}</td>
      </tr>`;
    })
    .join('');

  const dailyBars = report.daily
    .map((p) => {
      const w = Math.max(2, Math.round(((p.components + p.apiBatches) / maxDaily) * 100));
      return `<div class="day">
        <span class="d">${p.date.slice(5)}</span>
        <span class="bar"><i style="width:${w}%"></i></span>
        <span class="n">${p.components} / ${p.apiBatches}</span>
      </div>`;
    })
    .join('');

  const warn = report.coverage.truncated
    ? `<div class="warn">${htmlEscape(report.notes[0])}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>生成使用报告</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC",sans-serif;color:#1f1f1f;margin:24px;background:#fff;}
  h1{font-size:22px;margin:0 0 8px;}
  .meta{color:#666;font-size:13px;line-height:1.7;margin-bottom:20px;}
  h2{font-size:16px;margin:24px 0 10px;}
  table{border-collapse:collapse;width:100%;font-size:13px;}
  th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;}
  th{background:#f8fafc;font-weight:600;}
  .num{text-align:right;font-variant-numeric:tabular-nums;}
  .up{color:#cf1322;text-align:right;}
  .down{color:#389e0d;text-align:right;}
  .flat{color:#8c8c8c;text-align:right;}
  .warn{background:#fff2f0;border:1px solid #ffccc7;color:#a8071a;padding:10px 12px;border-radius:8px;margin:12px 0;font-size:13px;}
  .day{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px;}
  .d{width:44px;color:#666;}
  .bar{flex:1;height:8px;background:#f0f0f0;border-radius:99px;overflow:hidden;}
  .bar i{display:block;height:100%;background:#1677ff;}
  .n{width:72px;text-align:right;color:#444;}
  ul{font-size:13px;color:#555;line-height:1.7;}
  @media print{body{margin:12px;}}
</style>
</head>
<body>
  <h1>生成使用报告</h1>
  <div class="meta">
    生成时间：${htmlEscape(report.generatedAt)}（${htmlEscape(report.timezone)}）<br/>
    当前窗口：${htmlEscape(report.current.label)}<br/>
    对比窗口：${htmlEscape(report.previous.label)}<br/>
    部门筛选：${htmlEscape(report.deptFilter || '全部部门')}
  </div>
  ${warn}
  <h2>全量对照</h2>
  <table>
    <thead><tr><th>指标</th><th>本期</th><th>上期</th><th>增减</th><th>本期日均</th></tr></thead>
    <tbody>${metricTr}</tbody>
  </table>
  <h2>耗时统计（仅组件任务）</h2>
  ${
    report.currentDuration.sampleCount
      ? `<table>
    <thead><tr><th>指标</th><th>当前</th><th>上期</th></tr></thead>
    <tbody>
      <tr><td>p50（中位数）</td><td class="num">${formatDurationMs(report.currentDuration.p50Ms)}</td><td class="num">${formatDurationMs(report.previousDuration.p50Ms)}</td></tr>
      <tr><td>p90（90分位）</td><td class="num">${formatDurationMs(report.currentDuration.p90Ms)}</td><td class="num">${formatDurationMs(report.previousDuration.p90Ms)}</td></tr>
      <tr><td>样本数</td><td class="num">${report.currentDuration.sampleCount}</td><td class="num">${report.previousDuration.sampleCount}</td></tr>
    </tbody>
  </table>`
      : '<p>无耗时数据</p>'
  }
  <h2>模型分布（实际调用模型）</h2>
  ${
    report.currentDuration.textModels.length || report.currentDuration.visionModels.length
      ? `<table>
    <thead><tr><th>模型</th><th>当前</th><th>上期</th></tr></thead>
    <tbody>${(() => {
      const all = new Set([
        ...report.currentDuration.textModels.map((m) => m.model),
        ...report.currentDuration.visionModels.map((m) => m.model),
        ...report.previousDuration.textModels.map((m) => m.model),
        ...report.previousDuration.visionModels.map((m) => m.model),
      ]);
      return [...all]
        .sort()
        .map((m) => {
          const c =
            (report.currentDuration.textModels.find((x) => x.model === m)?.count || 0) +
            (report.currentDuration.visionModels.find((x) => x.model === m)?.count || 0);
          const p =
            (report.previousDuration.textModels.find((x) => x.model === m)?.count || 0) +
            (report.previousDuration.visionModels.find((x) => x.model === m)?.count || 0);
          return `<tr><td>${htmlEscape(m)}</td><td class="num">${c}</td><td class="num">${p}</td></tr>`;
        })
        .join('');
    })()}</tbody>
  </table>`
      : '<p>无模型数据</p>'
  }
  <h2>按部门</h2>
  ${
    report.byDept.length
      ? `<table>
    <thead><tr><th>部门</th><th>用户</th><th>组件</th><th>微码</th><th>Vue3</th><th>成功</th><th>失败</th><th>进行中</th><th>接口批</th><th>较上期组件</th></tr></thead>
    <tbody>${deptRows}</tbody>
  </table>`
      : '<p>窗口内无生成记录</p>'
  }
  <h2>本期逐日</h2>
  ${report.daily.length ? dailyBars : '<p>无</p>'}
  <h2>口径说明</h2>
  <ul>${report.notes.map((n) => `<li>${htmlEscape(n)}</li>`).join('')}</ul>
</body>
</html>`;
}

export function exportFilename(report: UsageExportReport, format: 'md' | 'html'): string {
  const ymd = report.generatedAt.slice(0, 10);
  const preset = report.preset;
  const dept = report.deptFilter ? `-${report.deptFilter}` : '';
  return `usage-${preset}${dept}-${ymd}.${format}`;
}
