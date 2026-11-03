export declare const USAGE_TZ = "Asia/Shanghai";
export declare const TASK_LEDGER_CAP = 2000;
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
export declare function emptyMetrics(): UsageMetrics;
export declare function pad2(n: number): string;
export declare function ymdShanghai(ms: number): string;
export declare function shanghaiMsFromYmd(ymd: string, h?: number, m?: number, s?: number, ms?: number): number;
export declare function formatShanghai(ms: number): string;
export declare function normalizePreset(raw?: string): UsagePreset;
export declare function resolveWindows(input: ResolveWindowInput): {
    current: UsageWindow;
    previous: UsageWindow;
};
export declare function inWindow(ts: number, win: UsageWindow): boolean;
export declare function windowDays(win: UsageWindow): number;
export declare function dailyAvg(count: number, win: UsageWindow): number;
export declare function parseTaskTime(task: any): number | null;
export declare function parseApiTime(task: any): number | null;
export declare function isComponentTask(task: any): boolean;
export declare function classifyTarget(target: any): 'microcode' | 'vue3' | 'unlabeled';
export declare function classifyStatus(status: any): 'completed' | 'failed' | 'inProgress';
export declare function whichWindow(ts: number, current: UsageWindow, previous: UsageWindow): 'current' | 'previous' | null;
export declare function buildUserIndex(users: any[]): Map<string, UserProfile>;
export declare function resolveDept(ownerId: string, index: Map<string, UserProfile>): string;
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
export declare function emptyDurationStats(): DurationModelStats;
export declare function percentileMs(values: number[], p: number): number | null;
export declare function formatDurationMs(ms: number | null): string;
export declare function aggregateUsage(input: AggregateInput): AggregateResult;
export declare function deltaAbs(cur: number, prev: number): number;
export declare function deltaRateText(cur: number, prev: number): string;
export declare function formatAvg(n: number): string;
export declare function buildNotes(report: Pick<UsageExportReport, 'coverage' | 'current'>): string[];
export declare function buildReport(opts: {
    preset: UsagePreset;
    deptFilter?: string | null;
    current: UsageWindow;
    previous: UsageWindow;
    agg: AggregateResult;
    nowMs?: number;
}): UsageExportReport;
export declare function renderMarkdown(report: UsageExportReport): string;
export declare function renderHtml(report: UsageExportReport): string;
export declare function exportFilename(report: UsageExportReport, format: 'md' | 'html'): string;
