import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { TasksService } from './tasks.service';

/**
 * 视觉分析溯源（只读）。
 *
 * 目的：把「视觉 LLM 原始输出」与「管线处理后的 plan」并排暴露给前端，
 * 让「视觉模型问题」与「后续管线问题」可以靠事实区分，而不是靠翻日志。
 *
 * 🔴 边界（硬约束）：
 *   - 本服务**只读**产物目录下的缓存文件，不写、不改、不参与任何判定；
 *   - 不复制管线判据 —— `isPanelHeader` 等判据仍以 `subcomponent-planner.js` 为单一来源，
 *     这里只用 `hint` 指出「可能命中的判据位置（文件:行号）」，供人工核对；
 *   - 任何文件缺失/解析失败都降级为 available=false，绝不抛错影响任务接口。
 */

export interface VisionTraceChild {
  id: string;
  role?: string;
  type?: string;
  name?: string;
}

export interface VisionTraceSection {
  id: string;
  name: string;
  role?: string;
  headerRelation?: string;
  childCount: number;
  children: VisionTraceChild[];
  /** 该段 id 是否真实存在于 Figma 节点树（false = 视觉编造/语义 id） */
  inFigma: boolean | null;
  /** 该段是否被 plan 保留（false = 在 planner 阶段被丢弃） */
  keptInPlan: boolean;
  /** 丢弃提示（仅当 keptInPlan=false 且有可指出的判据位置） */
  dropHint?: string;
}

export interface VisionTraceChartRef {
  /** 视觉声明的图表类型 */
  type: string;
  /** 视觉声明的归属段 id（原样，不做归一） */
  section: string;
  title?: string;
  /** 该 id 是否在 Figma 树里 */
  inFigma: boolean | null;
  /** 该 id 在 Figma 里的真实节点形态 */
  figmaType?: string;
  figmaName?: string;
  /** 是否真的是图表真值节点（name/type 含 @echarts 或 chart 系） */
  isChartTruth: boolean | null;
  verdict: 'match-truth' | 'fake-id' | 'not-chart-node' | 'unknown';
}

export interface VisionTraceSignal {
  layer: 'vision' | 'pipeline' | 'aligned';
  level: 'error' | 'warn' | 'info';
  code: string;
  sectionId?: string;
  message: string;
}

export interface VisionTraceResult {
  success: boolean;
  available: boolean;
  sessionId: string;
  /** 产物目录尾段（不返回绝对路径） */
  artifactDir?: string;
  reason?: string;
  vision: {
    found: boolean;
    file?: string;
    cachedAt?: number | null;
    generatedAt?: string | null;
    summary?: string;
    sectionCount: number;
    chartCount: number;
    sections: VisionTraceSection[];
    /** 视觉 charts[] 的归属段与 Figma 真值对账 */
    chartRefs: VisionTraceChartRef[];
  };
  plan: {
    found: boolean;
    sectionCount: number;
    sectionIds: string[];
    droppedSectionIds: string[];
  };
  figma: {
    found: boolean;
    nodeCount: number;
    chartTruthNodes: Array<{ id: string; name: string; type: string }>;
  };
  artifact: {
    found: boolean;
    componentFiles: string[];
  };
  signals: VisionTraceSignal[];
}

const CACHE_TTL_MS = 60_000;
const CHART_REF_PATTERN = /echarts|chart/i;

@Injectable()
export class VisionTraceService {
  private readonly logger = new Logger(VisionTraceService.name);
  private readonly cache = new Map<string, { at: number; data: VisionTraceResult }>();

  constructor(private readonly tasksService: TasksService) {}

  /**
   * 构建某个任务的视觉溯源视图。只读，永不抛错。
   */
  buildTrace(sessionId: string): VisionTraceResult {
    const empty = this.emptyResult(sessionId, '任务不存在');
    const task = this.tasksService.getTask(sessionId);
    if (!task) return empty;

    const dir = this.tasksService.resolveTaskOutputDir(task);
    if (!dir) return this.emptyResult(sessionId, '未找到该任务的产物目录（可能已被清理）');

    const cached = this.cache.get(dir);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

    let result: VisionTraceResult;
    try {
      result = this.collect(sessionId, dir);
    } catch (err: any) {
      this.logger.warn(`视觉溯源读取失败 ${sessionId}: ${err?.message || err}`);
      result = this.emptyResult(sessionId, `读取失败：${err?.message || String(err)}`);
      result.artifactDir = this.tailDir(dir);
    }
    this.cache.set(dir, { at: Date.now(), data: result });
    return result;
  }

  // ---------------------------------------------------------------- 采集

  private collect(sessionId: string, dir: string): VisionTraceResult {
    const visionRaw = this.readVision(dir);
    const plan = this.readPlan(dir);
    const figma = this.readFigmaIndex(dir);
    const artifact = this.readArtifact(dir);

    const planIds = new Set(plan.sectionIds);
    const visionSections = this.normalizeSections(visionRaw);
    const sections: VisionTraceSection[] = visionSections.map((sec) => {
      const kept = plan.found ? planIds.has(sec.id) : false;
      const row: VisionTraceSection = {
        ...sec,
        inFigma: figma.found ? figma.ids.has(sec.id) : null,
        keptInPlan: kept,
      };
      if (plan.found && !kept) {
        // 只给「可能命中的判据位置」，不复制判据、不替下游下结论
        if (String(sec.headerRelation || '') === 'title-itself') {
          row.dropHint =
            '该段 headerRelation=title-itself，命中 subcomponent-planner.js:894 的一票判据（isPanelHeader 直接判 chrome）';
        } else {
          row.dropHint = '该段在视觉输出中存在、但未进入 plan；下游过滤原因需查 planner 日志';
        }
      }
      return row;
    });

    const chartRefs = this.buildChartRefs(visionRaw, figma);
    const droppedSectionIds = sections.filter((s) => !s.keptInPlan).map((s) => s.id);
    const signals = this.buildSignals({
      visionFound: visionRaw.found,
      planFound: plan.found,
      sections,
      droppedSectionIds,
      chartRefs,
      figmaFound: figma.found,
      planSectionCount: plan.sectionIds.length,
    });

    return {
      success: true,
      available: visionRaw.found || plan.found,
      sessionId,
      artifactDir: this.tailDir(dir),
      vision: {
        found: visionRaw.found,
        file: visionRaw.file,
        cachedAt: visionRaw.cachedAt,
        generatedAt: visionRaw.generatedAt,
        summary: visionRaw.summary,
        sectionCount: sections.length,
        chartCount: chartRefs.length,
        sections,
        chartRefs,
      },
      plan: {
        found: plan.found,
        sectionCount: plan.sectionIds.length,
        sectionIds: plan.sectionIds,
        droppedSectionIds,
      },
      figma: {
        found: figma.found,
        nodeCount: figma.nodeCount,
        chartTruthNodes: figma.chartTruthNodes,
      },
      artifact,
      signals,
    };
  }

  /** 视觉原始输出：优先 .mc-gen/cache/vision-cache/*.json（取最新），退回 .checkpoint/visual.json */
  private readVision(dir: string): {
    found: boolean;
    file?: string;
    cachedAt?: number | null;
    generatedAt?: string | null;
    summary?: string;
    layout?: any;
    charts?: any[];
    raw?: any;
  } {
    const cacheDir = join(dir, '.mc-gen', 'cache', 'vision-cache');
    const candidates: Array<{ file: string; at: number }> = [];
    if (existsSync(cacheDir)) {
      for (const name of readdirSync(cacheDir)) {
        if (!name.endsWith('.json')) continue;
        const full = join(cacheDir, name);
        try {
          const at = statSync(full).mtimeMs;
          candidates.push({ file: full, at });
        } catch {
          /* ignore */
        }
      }
    }
    candidates.sort((a, b) => b.at - a.at);
    const fallback = join(dir, '.checkpoint', 'visual.json');
    if (candidates.length === 0 && existsSync(fallback)) {
      candidates.push({ file: fallback, at: statSync(fallback).mtimeMs });
    }
    if (candidates.length === 0) return { found: false };

    for (const cand of candidates) {
      const parsed = this.tryReadJson(cand.file);
      if (!parsed) continue;
      const v = parsed.data || parsed;
      const layout = v.layoutStructure?.layout || v.layout || null;
      if (!layout) continue;
      return {
        found: true,
        file: cand.file.split('/').pop(),
        cachedAt: typeof v._cachedAt === 'number' ? v._cachedAt : null,
        generatedAt: typeof v.generatedAt === 'string' ? v.generatedAt : null,
        summary: typeof v.summary === 'string' ? v.summary : undefined,
        layout,
        charts: Array.isArray(v.charts) ? v.charts : [],
        raw: v,
      };
    }
    return { found: false };
  }

  /** plan：.checkpoint/analysis.json → subComponentPlan.effectiveSections */
  private readPlan(dir: string): { found: boolean; sectionIds: string[] } {
    const file = join(dir, '.checkpoint', 'analysis.json');
    const parsed = this.tryReadJson(file);
    if (!parsed) return { found: false, sectionIds: [] };
    const v = parsed.data || parsed;
    const plan = v.subComponentPlan || v;
    const effective = Array.isArray(plan?.effectiveSections) ? plan.effectiveSections : [];
    return {
      found: effective.length > 0,
      sectionIds: effective.map((s: any) => String(s?.id ?? '')).filter(Boolean),
    };
  }

  /** Figma 真值索引：只保留 id→形态 与 @echarts 节点清单，不返回整棵树 */
  private readFigmaIndex(dir: string): {
    found: boolean;
    nodeCount: number;
    ids: Set<string>;
    byId: Map<string, { type: string; name: string }>;
    chartTruthNodes: Array<{ id: string; name: string; type: string }>;
  } {
    const file = join(dir, '.mc-gen', 'cache', 'figma-node-data.json');
    const parsed = this.tryReadJson(file);
    if (!parsed) {
      return { found: false, nodeCount: 0, ids: new Set(), byId: new Map(), chartTruthNodes: [] };
    }
    const root = parsed.document || parsed;
    const ids = new Set<string>();
    const byId = new Map<string, { type: string; name: string }>();
    const chartTruthNodes: Array<{ id: string; name: string; type: string }> = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      const id = node.id != null ? String(node.id) : '';
      const type = String(node.type || '');
      const name = String(node.name || '');
      if (id) {
        ids.add(id);
        byId.set(id, { type, name });
        if (CHART_REF_PATTERN.test(name) || CHART_REF_PATTERN.test(type)) {
          chartTruthNodes.push({ id, name, type });
        }
      }
      const kids = node.children;
      if (Array.isArray(kids)) for (const k of kids) walk(k);
    };
    walk(root);
    return { found: true, nodeCount: ids.size, ids, byId, chartTruthNodes };
  }

  /** 产物子组件文件清单 */
  private readArtifact(dir: string): { found: boolean; componentFiles: string[] } {
    const compDir = join(dir, 'package', 'components');
    if (!existsSync(compDir)) return { found: false, componentFiles: [] };
    try {
      const files = readdirSync(compDir)
        .filter((n) => n.endsWith('.vue'))
        .sort();
      return { found: files.length > 0, componentFiles: files };
    } catch {
      return { found: false, componentFiles: [] };
    }
  }

  // ---------------------------------------------------------------- 归一

  private normalizeSections(visionRaw: {
    found: boolean;
    layout?: any;
  }): Array<Omit<VisionTraceSection, 'inFigma' | 'keptInPlan' | 'dropHint'>> {
    const list = Array.isArray(visionRaw.layout?.sections) ? visionRaw.layout.sections : [];
    return list.map((sec: any) => {
      const bodyKids = Array.isArray(sec?.body?.children) ? sec.body.children : [];
      const headerKids = Array.isArray(sec?.header?.controls) ? sec.header.controls : [];
      const children: VisionTraceChild[] = [...bodyKids, ...headerKids].map((c: any) => ({
        id: String(c?.id ?? ''),
        role: c?.role != null ? String(c.role) : undefined,
        type: c?.type != null ? String(c.type) : undefined,
        name: c?.name != null ? String(c.name).slice(0, 40) : undefined,
      }));
      return {
        id: String(sec?.id ?? ''),
        name: String(sec?.name ?? '').slice(0, 60),
        role: sec?.role != null ? String(sec.role) : undefined,
        headerRelation: sec?.headerRelation != null ? String(sec.headerRelation) : undefined,
        childCount: children.length,
        children,
      };
    });
  }

  private buildChartRefs(
    visionRaw: { charts?: any[] },
    figma: {
      found: boolean;
      ids: Set<string>;
      byId: Map<string, { type: string; name: string }>;
    },
  ): VisionTraceChartRef[] {
    const charts = Array.isArray(visionRaw.charts) ? visionRaw.charts : [];
    return charts.map((c: any) => {
      const section = String(c?.section ?? c?.nodeId ?? c?.sectionId ?? '');
      const node = section && figma.found ? figma.byId.get(section) : undefined;
      const inFigma = figma.found ? Boolean(node) : null;
      const isChartTruth =
        node == null ? null : CHART_REF_PATTERN.test(node.name) || CHART_REF_PATTERN.test(node.type);
      let verdict: VisionTraceChartRef['verdict'] = 'unknown';
      if (figma.found) {
        if (!node) verdict = 'fake-id';
        else if (isChartTruth) verdict = 'match-truth';
        else verdict = 'not-chart-node';
      }
      return {
        type: String(c?.type ?? c?.chartType ?? ''),
        section,
        title: c?.title != null ? String(c.title).slice(0, 40) : undefined,
        inFigma,
        figmaType: node?.type,
        figmaName: node?.name,
        isChartTruth,
        verdict,
      };
    });
  }

  /**
   * 事实差异 → signals。
   * layer 的语义：`vision` = 视觉输出自身可判定的问题；`pipeline` = 视觉给了、下游没接住。
   * 只陈述已观察到的差异，不推断成因（成因以 src 判据位置提示，供人工核对）。
   */
  private buildSignals(input: {
    visionFound: boolean;
    planFound: boolean;
    sections: VisionTraceSection[];
    droppedSectionIds: string[];
    chartRefs: VisionTraceChartRef[];
    figmaFound: boolean;
    planSectionCount: number;
  }): VisionTraceSignal[] {
    const signals: VisionTraceSignal[] = [];

    if (!input.visionFound) {
      signals.push({
        layer: 'vision',
        level: 'warn',
        code: 'VISION_CACHE_MISSING',
        message: '未找到视觉分析缓存（vision-cache / .checkpoint/visual.json），无法对照',
      });
    }
    if (input.visionFound && !input.planFound) {
      signals.push({
        layer: 'pipeline',
        level: 'warn',
        code: 'PLAN_MISSING',
        message: '未找到 subComponentPlan.effectiveSections（.checkpoint/analysis.json）',
      });
    }

    for (const id of input.droppedSectionIds) {
      const sec = input.sections.find((s) => s.id === id);
      signals.push({
        layer: 'pipeline',
        level: 'error',
        code: 'SECTION_DROPPED_IN_PLAN',
        sectionId: id,
        message:
          `视觉有该段但 plan 没有：${sec?.name || id}` +
          (sec?.headerRelation ? `（headerRelation=${sec.headerRelation}）` : '') +
          (sec?.dropHint ? ` — ${sec.dropHint}` : ''),
      });
    }

    for (const ref of input.chartRefs) {
      if (ref.verdict === 'fake-id') {
        signals.push({
          layer: 'vision',
          level: 'error',
          code: 'CHART_REF_FAKE_ID',
          sectionId: ref.section,
          message: `视觉声明的图表归属段 ${ref.section} 在 Figma 中不存在（编造 id）`,
        });
      } else if (ref.verdict === 'not-chart-node') {
        signals.push({
          layer: 'vision',
          level: 'warn',
          code: 'CHART_REF_NOT_CHART_NODE',
          sectionId: ref.section,
          message: `视觉把图表归属到非图表节点 ${ref.section}（真实为 ${ref.figmaType} "${ref.figmaName}"）`,
        });
      }
    }

    const fakeSections = input.sections.filter((s) => s.inFigma === false);
    for (const sec of fakeSections) {
      signals.push({
        layer: 'vision',
        level: 'warn',
        code: 'SECTION_ID_NOT_IN_FIGMA',
        sectionId: sec.id,
        message: `视觉段 id ${sec.id} 在 Figma 中不存在（语义 id，需下游 anchor 归一）`,
      });
    }

    if (signals.length === 0) {
      signals.push({
        layer: 'aligned',
        level: 'info',
        code: 'ALIGNED',
        message: `视觉段与 plan 段一致（${input.sections.length} 段），未发现引用异常`,
      });
    }
    return signals;
  }

  // ---------------------------------------------------------------- 工具

  private tryReadJson(file: string): any | null {
    try {
      if (!existsSync(file)) return null;
      const text = readFileSync(file, 'utf8');
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /** 只回目录尾两段，避免把绝对路径透给前端 */
  private tailDir(dir: string): string {
    const parts = dir.split('/').filter(Boolean);
    return parts.slice(-2).join('/');
  }

  private emptyResult(sessionId: string, reason: string): VisionTraceResult {
    return {
      success: true,
      available: false,
      sessionId,
      reason,
      vision: {
        found: false,
        sectionCount: 0,
        chartCount: 0,
        sections: [],
        chartRefs: [],
      },
      plan: { found: false, sectionCount: 0, sectionIds: [], droppedSectionIds: [] },
      figma: { found: false, nodeCount: 0, chartTruthNodes: [] },
      artifact: { found: false, componentFiles: [] },
      signals: [
        { layer: 'vision', level: 'warn', code: 'TRACE_UNAVAILABLE', message: reason },
      ],
    };
  }
}
