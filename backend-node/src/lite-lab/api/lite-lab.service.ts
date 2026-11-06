import { Injectable, Logger } from '@nestjs/common';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, normalize, sep } from 'path';
import {
  customComponentsDir,
  tempComponentsDir,
  vue3ComponentsDir,
} from '../../config/backend-root';
import { resolveFrontendWorkspace } from '../../config/workspace.config';
import { AiConfigService } from '../../config/config.service';
import type { GenerateLiteDto } from '../../lite/dto/generate-lite.dto';
import { LiteService } from '../../lite/lite.service';
import { ProgressService } from '../../progress/progress.service';
import { TasksService } from '../../tasks/tasks.service';
import { TaskCodeSnapshotService } from '../../tasks/task-code-snapshot.service';
import {
  aiAnchorBackgroundAssets,
  backfillContainerFill,
  backfillSfcFiles,
  backfillScriptOptionTruth,
  clearRootContentBackground,
  collectFigmaTruth,
  isBgClassAsset,
  mountAssetIcons,
  relocatePanelTitle,
  type BackfillOptions,
  type BgAiCandidate,
  type BgAiResult,
  type FigmaAssetTruth,
  type TruthInventory,
} from '../lib/truth-matcher';
import type { RunLabDto } from './dto/run-lab.dto';
import {
  buildE2nMap,
  mountBgByE2n,
  type BgE2nResult,
  type E2nMap,
} from '../lib/e2n-map';
import { buildBackfillPlan, renderPlanMarkdown, type BackfillPlan } from '../lib/backfill-plan';
import {
  detectUnsourcedStyles,
  countAutoApplicable,
  renderUnsourcedMarkdown,
  unsourcedStatsLine,
  type UnsourcedFinding,
  type UnsourcedStats,
} from '../lib/unsourced-style';
import {
  applyUnsourcedStyles,
  renderUnsourcedAppliedMarkdown,
  unsourcedApplyStatsLine,
  type AppliedUnsourcedEdit,
  type ApplyUnsourcedStats,
  type SkippedUnsourcedEdit,
} from '../lib/unsourced-apply';
import { readPngStatsMap } from '../lib/asset-opacity';
import {
  applyBackfillPlan,
  reconcileBgPlan,
  type PlanApplyResult,
  type PlanApplyStats,
  type PlanReconcileReport,
} from '../lib/backfill-plan-apply';

const REPORT_FILE = 'truth-backfill-report.json';
const TRUTH_FILE = 'figma-truth.json';
const E2N_FILE = 'e2n-map.json';
/** 只读回填计划（每次运行都留档：计划 + 人读版，供对账/复盘） */
const PLAN_FILE = 'backfill-plan.json';
const PLAN_MD_FILE = 'backfill-plan.md';

const ARTIFACT_EXT_WHITELIST = new Set([
  '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif',
  '.json', '.vue', '.less', '.css', '.txt',
]);

export interface LabReportSummary {
  status: 'done' | 'error';
  sessionId: string;
  fileKey?: string;
  nodeId?: string;
  stats?: Record<string, number>;
  /**
   * 回填计划（唯一执行源）摘要 + 与旧通道对账。
   * 明细不塞 stats：stats 是 Record<string, number>（看板口径），计划是结构化证据。
   */
  plan?: {
    entries: number;
    apply: number;
    satisfied: number;
    conflicts: number;
    gaps: number;
    byKind: Record<string, { candidates: number; apply: number; skip: number; satisfied: number }>;
    applyStats: PlanApplyStats;
    reconcile: { both: number; planOnly: string[]; legacyOnly: string[]; agree: boolean };
  };
  assets?: Array<{ nodeId: string; name: string; fileName?: string }>;
  /**
   * 闸④ · 无源样式检测结果（产物里无 Figma 真值来源的视觉声明）。
   * 明细走 `backfill-plan.md`，这里只放聚合 + 盲区清单——盲区必须能从报告直接读到，
   * 否则 `findings=0` 会被误读成「没有问题」。
   */
  unsourced?: {
    stats: UnsourcedStats;
    findings: Array<{
      cls: string;
      prop: string;
      value: string;
      verdict: string;
      figmaId: string;
      evidence: string;
    }>;
  };
  /**
   * 闸③ · 无源样式**落地**结果（v1-lite：删 `box-shadow` / 改 `border-radius`）。
   *
   * `remainingAuto` 是收敛断言：落地后重检仍「可落地」的条数，**必须为 0**；
   * 不为 0 说明检测与落地的判据分叉（实现缺陷），不是数据噪声。
   */
  unsourcedApplied?: {
    stats: ApplyUnsourcedStats;
    remainingAuto: number;
    applied: Array<{
      file: string;
      cls: string;
      rawProp: string;
      kind: string;
      from: string;
      to: string;
      figmaId: string;
    }>;
    skipped: Array<{ cls: string; rawProp: string; verdict: string; reason: string }>;
  };
  files?: Array<{ path: string; changed: boolean; editCount: number }>;
  /** 回填后已覆盖同步到 workspace（任务详情页预览可看回填后效果） */
  workspaceSynced?: boolean;
  outputPath?: string;
  error?: string;
  finishedAt?: string;
}

@Injectable()
export class LiteLabService {
  private readonly logger = new Logger(LiteLabService.name);

  constructor(
    private readonly liteService: LiteService,
    private readonly tasksService: TasksService,
    private readonly progressService: ProgressService,
    private readonly aiConfigService: AiConfigService,
    private readonly taskCodeSnapshotService: TaskCodeSnapshotService,
  ) {}

  /**
   * 解析 Figma token —— 与 lite 正式链（fetchFigmaImage :1694-1699）完全同口径：
   *   dto.config.figmaToken → 按用户 DB 配置 getMergedAiConfig(userId) → 环境变量 → data/ai-config.json 兜底
   * 🔴 不能只读 data/ai-config.json 顶层 figmaToken：那是静态旧值，
   *    真机实锤 mc-lab-1793861291047-28b3878d 因此 Figma 404（Stage A 用用户配置成功、Stage B 拿旧 token 404）。
   */
  private async resolveFigmaToken(dto: RunLabDto, userId?: string): Promise<string | undefined> {
    const fromDto = (dto.config as any)?.figmaToken;
    if (fromDto) return fromDto;
    try {
      const merged = await this.aiConfigService.getMergedAiConfig(userId);
      if (merged?.figmaToken) return merged.figmaToken;
    } catch (e: any) {
      this.logger.warn(`[lite-lab] getMergedAiConfig 失败（继续回落）: ${e?.message}`);
    }
    if (process.env.FIGMA_ACCESS_TOKEN) return process.env.FIGMA_ACCESS_TOKEN;
    try {
      const cfg = JSON.parse(
        readFileSync(join(process.cwd(), 'data', 'ai-config.json'), 'utf8'),
      );
      return cfg?.figma?.token || cfg?.figmaToken;
    } catch {
      return undefined;
    }
  }

  /**
   * 在 tempComponentsDir/{groupId}/{sessionId} 下定位产物目录。
   * 🔴 必须校验 probeFile 存在才算命中：`.task-code-snapshots/` 里存在同名 sessionId
   * 快照副本（真机实锤 mc-lab-1793861715204：按目录序先命中快照 ⇒ 报告 404）。
   */
  private locateOutputPath(sessionId: string, probeFile?: string): string | undefined {
    if (!existsSync(tempComponentsDir)) return undefined;
    for (const group of readdirSync(tempComponentsDir)) {
      const candidate = join(tempComponentsDir, group, sessionId);
      if (!existsSync(candidate)) continue;
      if (!probeFile || existsSync(join(candidate, probeFile))) return candidate;
    }
    return undefined;
  }

  async parseFigmaUrlLocal(url: string): Promise<{ fileKey?: string; nodeId?: string }> {
    // 复用 lite 同一解析器，保证口径一致
    const { parseFigmaUrl } = await import('../../ai-engine/utils/figma-url-parser.js');
    return parseFigmaUrl(url) || {};
  }

  async run(dto: RunLabDto, userId?: string) {
    const parsed = await this.parseFigmaUrlLocal(dto.figmaUrl);
    if (!parsed.fileKey || !parsed.nodeId) {
      throw Object.assign(new Error('Figma URL 无法解析出 fileKey/nodeId'), { status: 400 });
    }
    const componentType = dto.componentType || 'microcode';
    const groupId = dto.groupId || 'default-group';
    const typePrefix = componentType === 'microcode' ? 'mc' : 'mv';
    const sessionId = `${typePrefix}-lab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

    this.tasksService.createTask(
      sessionId,
      {
        componentId: sessionId,
        componentName: dto.componentName || sessionId,
        target: componentType,
        groupId,
        taskType: 'component',
        userId,
        sourceType: 'figma',
        generationTier: 'lite',
        // 🔴 2026-11-05：实验任务必须带 fileKey/nodeId —— 「最近使用」历史下拉
        //   （前端 figmaHistoryTasks）按 `t.fileKey` 重建 Figma 链接，缺这两字段
        //   ⇒ 实验跑过的链接永远不进历史，实验面板与正常入口就成了两套历史。
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        // lab 为实验标记字段，TaskMetadata 契约外 —— 宽类型透传，任务卡片按 lab 前缀识别
        lab: 'truth-backfill',
      } as any,
      'running',
    );

    // fire-and-forget：终态由 executeLab 的 sendComplete / sendError 落地
    this.executeLab(sessionId, dto, parsed.fileKey, parsed.nodeId, groupId, userId).catch(
      (e: any) => this.logger.error(`[lite-lab] ${sessionId} 异常结束: ${e?.message}`),
    );

    return {
      sessionId,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      componentType,
      progressUrl: `/api/progress/${sessionId}`,
      message: 'lite-lab 两阶段实验管线已启动：Stage A lite 布局 → Stage B/C Figma 真值匹配回填',
    };
  }

  private async executeLab(
    sessionId: string,
    dto: RunLabDto,
    fileKey: string,
    nodeId: string,
    groupId: string,
    userId?: string,
  ) {
    const componentType = dto.componentType || 'microcode';
    const outputPath = join(tempComponentsDir, groupId, sessionId);
    const cacheDir = join(outputPath, '.cache');
    const token = await this.resolveFigmaToken(dto, userId);

    try {
      // ---------- Stage A：lite 布局（复用 LiteService 完整链路） ----------
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'layout',
        status: 'running',
        message: 'Stage A：Lite 布局生成中（vision 分析 + LLM 单程直出）...',
      });
      const liteDto = {
        figmaUrl: dto.figmaUrl,
        componentName: dto.componentName,
        componentType,
        generationTier: 'lite',
        config: dto.config,
      } as GenerateLiteDto;
      await this.liteService.startGeneration(sessionId, liteDto, groupId, userId, {
        sourceType: 'figma',
        componentType,
        generationTier: 'lite',
      });

      // lite 内部已 completeTask + sendComplete；复活任务继续 lab 阶段
      this.tasksService.updateTask(sessionId, { status: 'running', labStage: 'truth-fetch' } as any);
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'truth-fetch',
        status: 'running',
        message: 'Stage B：拉取 Figma node 真值（颜色/字号/几何/图片）...',
      });

      if (!token) throw new Error('未找到 Figma token（config.figmaToken 或 data/ai-config.json）');
      const { FigmaConnector } = await import('../../ai-engine/roles/figma-connector.js');
      const connector = new FigmaConnector({ figmaToken: token });
      const nodeData = await connector.fetchNodeData(fileKey, nodeId);
      const truth: TruthInventory = collectFigmaTruth(nodeData);

      // 图片资源下载到 .cache/resources（清单化，不在本管线内自动注入 DOM）
      const assetsDir = join(cacheDir, 'resources');
      mkdirSync(assetsDir, { recursive: true });
      let downloadedAssets: any[] = [];
      try {
        downloadedAssets = await connector.downloadAssets(fileKey, nodeData, assetsDir);
        // 🔴 S3（2026-11-06）：truth 组装抽到 lib/truth-inventory#buildTruthInventory
        //   （纯函数：imageRef 三级对齐 + VECTOR 反哺 + parentMeta + S1 x/y）——
        //   lite 资源续跑（upgradeAssets 换芯）与 lab 共用同一组装层，判据单一来源。
        const { buildTruthInventory } = await import('../lib/truth-inventory.js');
        const { truth: inv, feed } = buildTruthInventory(nodeData, downloadedAssets);
        truth.assets = inv.assets;
        truth.texts = inv.texts;
        truth.containers = inv.containers;
        truth.containerCount = inv.containerCount;
        this.logger.log(
          `[lite-lab] ${sessionId} 真值清单组装：下载 ${feed.downloaded}，对齐 ${feed.aligned}，反哺 ${feed.fed}，未匹配 ${feed.unmatched}`,
        );
        if (feed.unmatched > 0) {
          this.logger.warn(`[lite-lab] ${sessionId} ${feed.unmatched} 个资产未对齐到下载文件（将计入 noFile）`);
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} 资源下载失败（不影响文本回填）: ${e?.message}`);
      }

      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        join(cacheDir, TRUTH_FILE),
        JSON.stringify({ fileKey, nodeId, fetchedAt: new Date().toISOString(), truth }, null, 2),
      );

      // ---------- Stage C：真值匹配回填 ----------
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'truth-match',
        status: 'running',
        message: 'Stage C：文本锚点匹配 + 真值回填（颜色/字号/尺寸）...',
      });

      const sfcFiles = this.collectSfcFiles(join(outputPath, 'package'));
      if (sfcFiles.length === 0) throw new Error('lite 产物中未找到 .vue 文件，无法回填');

      const opts: BackfillOptions = {
        applyColor: dto.applyColor !== false,
        applyFontSize: dto.applyFontSize !== false,
        applySizes: dto.applySizes === true,
      };
      const result = backfillSfcFiles(sfcFiles, truth, opts);

      // ---------- Stage C3：script 字面量真值回填（echarts option，全派生/保守放弃） ----------
      const scriptBf = backfillScriptOptionTruth(result.files, truth);

      // ---------- Stage C2：静态资源确定性挂载（兄弟文本锚点，不用 AI 定位） ----------
      // 拷贝下载好的图片到产物 resources/images/，再按 imageRef 去重挂载
      const prodImagesDir = join(outputPath, 'resources', 'images');
      mkdirSync(prodImagesDir, { recursive: true });
      let copiedCount = 0;
      for (const a of truth.assets) {
        if (!a.fileName) continue;
        const src = join(assetsDir, a.fileName);
        if (existsSync(src)) {
          copyFileSync(src, join(prodImagesDir, a.fileName));
          copiedCount += 1;
        }
      }

      // ---------- Stage C2a：E2N 结构映射 + 容器级 bg 挂载（2026-11-05 立项） ----------
      // 🔴 2026-11-05 决议：**E2N 提前到图标挂载之前**（原在之后）。旧口径落点由
      //   「哪条规则碰巧有 background 键」决定（6e59a0d4：bg-7890 挂到 .tab 而非 .tabs）；
      //   命名锚定通道一旦先挂，E2N 只能 skipAlreadyUrl 让位 ⇒ 错误落点被锁死。
      //   故结构判据先行、命名/尺寸启发式退居兜底（旧通道已加"已有 url 让位"保护）。
      // 安全前提：E2N 只读模板文本 + script 字面量，图标挂载只改 <img src>/尺寸，不改文本结构。
      // 🔴 授权纪律：产物 CSS 的 height/background 都是 LLM 视觉分析产物，**不作授权证据**，只作否决项。
      let e2n: E2nMap | undefined;
      let e2nBg: BgE2nResult | undefined;
      let plan: BackfillPlan | undefined;
      let planApply: PlanApplyResult | undefined;
      /**
       * 闸④ 检出（⚠️ 这份是 **回填后** 的快照，只用于计划阶段日志；报告口径以 C2f 的
       * `unsourcedFinal` 为准——C2c/C2e 之后产物又变过，用旧快照写报告会与落盘内容不符）。
       */
      let unsourced: { findings: UnsourcedFinding[]; stats: UnsourcedStats } | undefined;
      /** C2f 终检（报告口径）+ 闸③ 落地结果 */
      let unsourcedFinal: { findings: UnsourcedFinding[]; stats: UnsourcedStats } | undefined;
      let unsourcedApply:
        | {
            stats: ApplyUnsourcedStats;
            applied: AppliedUnsourcedEdit[];
            skipped: SkippedUnsourcedEdit[];
            /** 落地后重检仍可落地的条数（必须为 0，否则收敛断言失败） */
            remainingAuto: number;
          }
        | undefined;
      let planRecon: PlanReconcileReport | undefined;
      // 被改但不在 finalFiles 里的文件（预编译 resources/styles/index.css）——
      // 🔴 快照同源化只刷 finalFiles.changed + images，漏了它则任务详情页预览仍是旧样式。
      const extraChanged = new Set<string>();
      let sfcAfterE2n = scriptBf.files;
      try {
        const e2nProdFiles = [...scriptBf.files, ...this.collectPrecompiledCss(outputPath)];
        e2n = buildE2nMap(nodeData, e2nProdFiles);
        writeFileSync(
          join(cacheDir, E2N_FILE),
          JSON.stringify(
            {
              sessionId,
              fileKey,
              nodeId,
              builtAt: new Date().toISOString(),
              stats: e2n.stats,
              nodes: e2n.nodes,
              multi: e2n.multi,
              seeds: e2n.seeds,
              unmapped: e2n.unmapped,
              // prodNodes 只留结构骨架（不含全文，避免 json 膨胀到 MB 级）
              prodNodes: e2n.prodNodes.map((p) => ({
                key: p.key,
                path: p.path,
                tag: p.tag,
                classes: p.classes,
                vforCount: p.vforCount,
                renderTexts: p.renderTexts.length > 20 ? p.renderTexts.slice(0, 20) : p.renderTexts,
                instanceTexts: p.instanceTexts,
              })),
            },
            null,
            2,
          ),
        );
        // ① 旧通道先跑一遍，但**不写盘**——它只作校验基线（与计划对账用）。
        //    顺序很关键：一旦先写盘，旧通道在已改内容上会因「已有 url」全部让位，对账就恒等了。
        const legacyBg = mountBgByE2n(e2nProdFiles, truth.assets, e2n);
        // ② 计划是唯一执行源（2026-11-05 决议：8 条通道各扫各的 → 先规划再执行）
        //    assetOpacity 由本层读盘提供（plan 模块是纯函数）：alpha 决定「整块底图」还是「叠加层」
        const bgFileNames = truth.assets.map((x) => x.fileName).filter((n): n is string => !!n && /^bg-/.test(n));
        const assetOpacity = readPngStatsMap(assetsDir, bgFileNames);
        plan = buildBackfillPlan({ figmaRoot: nodeData, prodFiles: e2nProdFiles, truth, e2n, assetOpacity });
        planApply = applyBackfillPlan(e2nProdFiles, plan);
        planRecon = reconcileBgPlan(plan, legacyBg.anchoredAssets);
        for (const f of planApply.files) {
          if (f.changed) writeFileSync(join(outputPath, f.path), f.content, 'utf8');
        }
        // 闸④ · 无源样式检测：跑在**回填后**的内容上 —— 回填已尽力补过的值不该再报，
        // 剩下的才是「所有通道都没管、纯属臆造」的声明。背景被回填成 url(...) 后会自动
        // 让位给 bg 通道（isBackgroundManagedElsewhere），不会重复记账。
        unsourced = detectUnsourcedStyles({
          figmaRoot: nodeData,
          prodFiles: planApply.files.map((f) => ({ path: f.path, content: f.content })),
          e2n,
        });
        this.logger.log(`[lite-lab] ${sessionId} 无源样式: ${unsourcedStatsLine(unsourced.stats)}`);
        if (unsourced.stats.unmappedRiskClasses.length > 0) {
          this.logger.warn(
            `[lite-lab] ${sessionId} 闸④ 盲区 ${unsourced.stats.unmappedRiskClasses.length} 个类名无 E2N 映射` +
              `（未检查，不代表无问题）: ${unsourced.stats.unmappedRiskClasses.slice(0, 8).join(', ')}` +
              (unsourced.stats.unmappedRiskClasses.length > 8 ? ' …' : ''),
          );
        }
        writeFileSync(join(cacheDir, PLAN_FILE), JSON.stringify(plan, null, 2));
        // 🔴 人读版报告**推迟到 Stage C2f** 写：闸④ 在这里只是「回填后快照」，
        //   C2b~C2e 还会改产物，且闸③ 要落地。写在这里会让报告与落盘内容不符。
        if (!planRecon.agree) {
          this.logger.warn(
            `[lite-lab] ${sessionId} 计划与旧 bg 通道不一致：计划独有 ${planRecon.planOnly.length}，旧通道独有 ${planRecon.legacyOnly.length}`,
          );
        }
        // 报告统计沿用旧通道口径（保持既有大盘/看板可比），但写盘来自计划
        e2nBg = legacyBg;
        // 计划改后的 SFC 回灌（供后续图标挂载基于最新内容继续）；index.css 等非 SFC 记 extraChanged
        const planChanged = new Map(planApply.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
        if (planChanged.size > 0) {
          const sfcPaths = new Set(scriptBf.files.map((f) => f.path));
          for (const p of planChanged.keys()) if (!sfcPaths.has(p)) extraChanged.add(p);
          sfcAfterE2n = scriptBf.files.map((f) =>
            planChanged.has(f.path) ? { ...f, content: planChanged.get(f.path)! } : f,
          );
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} E2N 建图/挂载失败（非致命）: ${e?.message}`);
      }
      // 已消费的 bg：计划实际写盘的那些 + 旧通道锚定的那些（并集，宁多勿少——
      // 漏掉任一都会让 AI 兜底对同一 bg 再插一条 url，产成 `url(A) url(B)` 双图叠加）
      const e2nConsumedBgs = new Set([
        ...(e2nBg?.anchoredAssets ?? []).map((x) => x.fileName),
        ...(planApply?.consumedAssets ?? []).map((x) => x.fileName),
      ]);

      // ---------- Stage C2：静态资源确定性挂载（兄弟文本锚点，不用 AI 定位） ----------
      // 🔴 顺序：E2N 之后。命名/尺寸启发式只兜底 E2N 没覆盖的资源；已含 url 的规则让位。
      const mount = mountAssetIcons(sfcAfterE2n, truth.assets);
      for (const f of mount.files) {
        if (f.changed) {
          writeFileSync(join(outputPath, f.path), f.content, 'utf8');
        }
      }
      let finalFiles = mount.files;

      // ---------- Stage C2b：AI 背景图兜底（bgSkipNoClass>0 时才调 vision，非致命） ----------
      // AI 只给「资产↔可见文字」候选；落点走 aiAnchorBackgroundAssets 确定性通道
      // （文字→叶子→class→style 规则，与命名锚定同一套双闸门，不放宽判据）。
      let bgAi: BgAiResult | undefined;
      try {
        const imgDir = join(outputPath, 'resources', 'images');
        // E2N 已挂的直接剔除，避免 AI 通道重复消费同一 bg（重复插入会产生两条 url）
        // 🔴 S2（bfac46ac 实锤）：候选收口到 isBgClassAsset 单一来源——`bg-` 前缀
        //   之外的底图（image_313 459×29 footer 条带，走 bg 命名锚定因无 bg- 前缀
        //   拿不到 bgFileNameCore ⇒ 旧判据永远进不了本通道）按结构分类纳入。
        const noCoreBgs = truth.assets.filter(
          (a) =>
            a.fileName &&
            isBgClassAsset(a) &&
            !e2nConsumedBgs.has(a.fileName),
        );
        const shotPath = join(imgDir, 'source-screenshot.png');
        if (noCoreBgs.length > 0 && existsSync(shotPath)) {
          bgAi = await this.runBgAiFallback(shotPath, imgDir, noCoreBgs, cacheDir, userId);
          for (const f of bgAi.files) {
            if (f.changed) {
              writeFileSync(join(outputPath, f.path), f.content, 'utf8');
            }
          }
          // 合并 AI 命中的文件到 finalFiles（下游 changed 统计/快照刷新都看它）
          const aiChanged = new Map(bgAi.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
          if (aiChanged.size > 0) {
            const inFinal = new Set(finalFiles.map((f) => f.path));
            for (const p of aiChanged.keys()) if (!inFinal.has(p)) extraChanged.add(p);
            finalFiles = finalFiles.map((f) =>
              aiChanged.has(f.path) ? { ...f, content: aiChanged.get(f.path)!, changed: true } : f,
            );
          }
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} AI 背景图兜底失败（非致命）: ${e?.message}`);
        if (bgAi) bgAi.stats.errors += 1;
      }

      // ---------- Stage C2c：Q2 容器 fill 真值回填（icon-wrap 臆造底色 + 文本容器换色） ----------
      // mc-lab-1793876687382 实锤：lite 臆造 .card-icon-wrap 深蓝圆盘 + 图内自带浅色台阶底座
      // → 12 卡视觉趋同「一种样子」。Figma 父容器透明/真值色回填纠正（只换值不写几何）。
      let cf: ReturnType<typeof backfillContainerFill> | undefined;
      try {
        // 🔴 同步预编译 index.css（478f0758）：容器换色也必须落预览实际注入的样式源
        const cfFiles = [...finalFiles, ...this.collectPrecompiledCss(outputPath)];
        cf = backfillContainerFill(cfFiles, truth);
        for (const f of cf.files) {
          if (f.changed) {
            writeFileSync(join(outputPath, f.path), f.content, 'utf8');
          }
        }
        const cfChanged = new Map(cf.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
        if (cfChanged.size > 0) {
          const inFinal = new Set(finalFiles.map((f) => f.path));
          for (const p of cfChanged.keys()) if (!inFinal.has(p)) extraChanged.add(p);
          finalFiles = finalFiles.map((f) =>
            cfChanged.has(f.path) ? { ...f, content: cfChanged.get(f.path)!, changed: true } : f,
          );
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} 容器 fill 回填失败（非致命）: ${e?.message}`);
      }

      // ---------- Stage C2d：面板标题插槽归位（478f0758 实锤：标题渲染进内容区 + 头部插槽空置） ----------
      // 微码语义：base-panel 外壳渲染头部（#title-left 插槽，缺省回退 componentName），
      // 默认插槽 = 内容区。lite 把面板标题放进默认插槽 ⇒ 内容区出现标题、头部只剩英文名。
      // 判据：默认插槽内静态文本归一化 == 任务 displayName（lite 完成时已写任务记录）。
      let pt: ReturnType<typeof relocatePanelTitle> | undefined;
      try {
        const taskRec = this.tasksService.getTask(sessionId) as any;
        const panelDisplayName: string = taskRec?.displayName || '';
        pt = relocatePanelTitle(finalFiles, panelDisplayName);
        for (const f of pt.files) {
          if (f.changed) {
            writeFileSync(join(outputPath, f.path), f.content, 'utf8');
          }
        }
        const ptChanged = new Map(pt.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
        if (ptChanged.size > 0) {
          finalFiles = finalFiles.map((f) =>
            ptChanged.has(f.path) ? { ...f, content: ptChanged.get(f.path)!, changed: true } : f,
          );
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} 面板标题归位失败（非致命）: ${e?.message}`);
      }

      // ---------- Stage C2e：面板根内容容器背景清除（用户定性：内容区不该有背景） ----------
      // 微码语义：base-panel 外壳负责面板底色/圆角/阴影，默认插槽里的内容区必须透明。
      // lite 会给内容区编一层浅色（.c-…-content{background:#E3ECF8/#E4EEF5}）⇒ 与外壳双层叠加，
      // 且深色主题破色（外壳深、内容浅）。判据只认微码语义，不查 Figma 真值。
      // 🔴 放在最后：C2c 容器 fill 可能把颜色又写回来，顺序上必须由它兜底。
      let rc: ReturnType<typeof clearRootContentBackground> | undefined;
      try {
        const rcFiles = [...finalFiles, ...this.collectPrecompiledCss(outputPath)];
        rc = clearRootContentBackground(rcFiles);
        for (const f of rc.files) {
          if (f.changed) writeFileSync(join(outputPath, f.path), f.content, 'utf8');
        }
        const rcChanged = new Map(rc.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
        if (rcChanged.size > 0) {
          const inFinal = new Set(finalFiles.map((f) => f.path));
          for (const p of rcChanged.keys()) if (!inFinal.has(p)) extraChanged.add(p);
          finalFiles = finalFiles.map((f) =>
            rcChanged.has(f.path) ? { ...f, content: rcChanged.get(f.path)!, changed: true } : f,
          );
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} 根内容容器背景清除失败（非致命）: ${e?.message}`);
      }

      // ---------- Stage C2f：闸③ 无源样式落地（v1-lite） ----------
      // 🔴 位置必须在 C2e **之后**：它是本链最后一个 CSS 写盘者（C2c 容器 fill 会把颜色写回来、
      //   C2e 清根内容背景）。闸③ 提前落地会被后续阶段覆盖，且「报告 = 磁盘」不再成立。
      // 可落地集合 = `unsourced-style#isAutoApplicable`（单一来源），收敛断言也调它。
      try {
        const uaFiles = [...finalFiles, ...this.collectPrecompiledCss(outputPath)];
        const detectForApply = detectUnsourcedStyles({
          figmaRoot: nodeData,
          prodFiles: uaFiles.map((f) => ({ path: f.path, content: f.content })),
          e2n,
        });
        unsourcedFinal = detectForApply;
        const ua = applyUnsourcedStyles({
          findings: detectForApply.findings,
          prodFiles: uaFiles,
        });
        for (const f of ua.files) {
          if (f.changed) writeFileSync(join(outputPath, f.path), f.content, 'utf8');
        }
        const uaChanged = new Map(ua.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
        if (uaChanged.size > 0) {
          const inFinal = new Set(finalFiles.map((f) => f.path));
          for (const p of uaChanged.keys()) if (!inFinal.has(p)) extraChanged.add(p);
          finalFiles = finalFiles.map((f) =>
            uaChanged.has(f.path) ? { ...f, content: uaChanged.get(f.path)!, changed: true } : f,
          );
        }
        this.logger.log(`[lite-lab] ${sessionId} 闸③ 落地: ${unsourcedApplyStatsLine(ua.stats)}`);

        // 🔴 收敛自证：落地后重检，「可落地项」必须归零。不为 0 说明检测与落地口径分叉
        //   （实现缺陷，而非数据问题），必须吵出来而不是静默放过。
        const after = detectUnsourcedStyles({
          figmaRoot: nodeData,
          prodFiles: [...finalFiles, ...this.collectPrecompiledCss(outputPath)].map((f) => ({
            path: f.path,
            content: f.content,
          })),
          e2n,
        });
        const remainingAuto = countAutoApplicable(after.findings);
        unsourcedApply = { stats: ua.stats, applied: ua.applied, skipped: ua.skipped, remainingAuto };
        if (remainingAuto > 0) {
          this.logger.warn(
            `[lite-lab] ${sessionId} 闸③ 收敛断言失败：落地后仍有 ${remainingAuto} 条可落地项` +
              `（检测与落地口径不一致，需排查）`,
          );
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} 闸③ 落地失败（非致命）: ${e?.message}`);
      }

      // 人读版报告：计划 + 闸④ 终检 + 闸③ 落地（三者同源同刻，落盘内容即报告内容）
      try {
        const planMd = plan ? renderPlanMarkdown(plan) : '';
        const us = unsourcedFinal ?? unsourced;
        const usMd = us ? renderUnsourcedMarkdown(us.findings, us.stats) : '';
        const uaMd = unsourcedApply
          ? renderUnsourcedAppliedMarkdown(unsourcedApply.stats, unsourcedApply.applied, unsourcedApply.skipped)
          : '';
        writeFileSync(join(cacheDir, PLAN_MD_FILE), `${planMd}\n${usMd}${uaMd}`, 'utf8');
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} 计划报告写入失败（非致命）: ${e?.message}`);
      }
      // 报告口径改用终检结果（C2f 之后的产物状态）
      if (unsourcedFinal) unsourced = unsourcedFinal;

      // 🔴 回填后覆盖 workspace：任务详情页预览读 workspace，不同步则预览仍是回填前版本
      const changedCount = finalFiles.filter((f) => f.changed).length;
      const syncedTargets =
        changedCount > 0 || extraChanged.size > 0
          ? this.syncBackfillToWorkspace(outputPath, sessionId, groupId, componentType)
          : [];

      // 🔴 可辩驳计数行：0 也打；stats 单一来源 = truth-matcher，此处只透传
      const s = result.stats;
      const m = mount.stats;
      const sb = scriptBf.stats;

      // ---------- Stage C5：快照同源化（方案 I，mc-lab-1793873410979 实锤） ----------
      // 任务详情页预览优先走代码快照（last-good→candidate→workspace），快照打在
      // Stage A 完成时刻 = 回填前版本；回填只写 workspace ⇒ 详情页永远渲染 lite 原始版。
      // publishToWorkspace 对 completed 任务拒绝且 workspace 已有时幂等空转（不写快照），
      // 故复用平台自带「终态同源刷新」：把回填后文件刷进该 session 的全部 revision
      // （新文件——如反哺 png——也会登记进 manifest.files）。
      let snapshotSynced = 0;
      try {
        const relPaths = new Set<string>(
          finalFiles.filter((f) => f.changed).map((f) => f.path),
        );
        // E2N / 容器 fill / AI 兜底改到的预编译样式表不在 finalFiles 里，必须一并刷进快照
        for (const p of extraChanged) relPaths.add(p);
        const imgDir = join(outputPath, 'resources', 'images');
        if (existsSync(imgDir)) {
          for (const name of readdirSync(imgDir)) {
            // 跳过临时/隐藏文件（如 .bg-ai-composite.png AI 拼图中间产物）
            if (name.startsWith('.')) continue;
            if (existsSync(join(imgDir, name))) relPaths.add(`resources/images/${name}`);
          }
        }
        const revisions = new Set<string>();
        for (const mf of [
          this.taskCodeSnapshotService.getCandidateManifest(sessionId),
          this.taskCodeSnapshotService.getLastGoodManifest(sessionId),
          this.taskCodeSnapshotService.getLatestManifest(sessionId),
        ]) {
          if (mf?.revision) revisions.add(mf.revision);
        }
        for (const rev of revisions) {
          try {
            const refreshed = this.taskCodeSnapshotService.refreshRevisionFilesFromDisk(
              sessionId,
              rev,
              outputPath,
              [...relPaths],
            );
            snapshotSynced += refreshed.length;
          } catch (e: any) {
            this.logger.warn(`[lite-lab] ${sessionId} 快照刷新失败（非致命）rev=${rev}: ${e?.message}`);
          }
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} 快照同源化失败（非致命）: ${e?.message}`);
      }
      console.log(`snapshotSync: refreshedFiles=${snapshotSynced}`);

      console.log(
        `truthBackfill: evaluated=${s.evaluated},exact=${s.exact},substr=${s.substr},miss=${s.miss},` +
          `interpSkipped=${s.interpSkipped},shortSkipped=${s.shortSkipped},` +
          `colorApplied=${s.colorApplied},fontSizeApplied=${s.fontSizeApplied},sizeApplied=${s.sizeApplied},` +
          `scriptAxis=${sb.xAxisBackfilled}/${sb.yAxisBackfilled},markLine=${sb.markLineBackfilled},` +
          `scriptColor=${sb.scriptColorApplied},scriptFontSize=${sb.scriptFontSizeApplied},scriptSkipped=${sb.scriptSkipped},` +
          `assets=${truth.assets.length},assetsCopied=${copiedCount},` +
          `assetMounted=${m.mounted},assetNoAnchor=${m.noAnchor},assetNoSiblingTexts=${m.noSiblingTexts},assetNoFile=${m.noFile},` +
          `svgReplaced=${m.svgReplaced},dataUriReplaced=${m.dataUriReplaced},iconClassReplaced=${m.iconClassReplaced},` +
          `emptyVars=${m.emptyIconVarsReplaced},emptyFields=${m.emptyIconFieldsReplaced},` +
          `emptyObjProps=${m.emptyObjPropsReplaced},newEl=${m.newElementInserted},` +
          `newElSkipNoAnchor=${m.newElSkipNoAnchor},newElSkipAmbiguous=${m.newElSkipAmbiguous},` +
          `svgSkipped=${m.svgSkipped},` +
          `bgAnchored=${m.bgAnchored},bgSkipNoClass=${m.bgSkipNoClass},bgSkipAmbiguous=${m.bgSkipAmbiguous},bgSkipNoBgKey=${m.bgSkipNoBgKey},` +
          `bgSkipAlreadyUrl=${m.bgSkipAlreadyUrl},` +
          `rootBgPanels=${rc?.stats.panels ?? 0},rootBgClasses=${rc?.stats.rootClasses ?? 0},rootBgCleared=${rc?.stats.cleared ?? 0},` +
          `rootBgSkipAlreadyTransparent=${rc?.stats.skipAlreadyTransparent ?? 0},rootBgSkipNoBackground=${rc?.stats.skipNoBackground ?? 0},` +
          `rootBgSkipNoRootClass=${rc?.stats.skipNoRootClass ?? 0},` +
          `bgAiCalled=${bgAi?.stats.candidates ?? 0},bgAiAnchored=${bgAi?.stats.anchored ?? 0},` +
          `bgAiStructCand=${bgAi?.stats.structCandidates ?? 0},bgAiStructOverrides=${bgAi?.stats.structOverrides ?? 0},` +
          `bgAiSkipNoLabelHit=${bgAi?.stats.skipNoLabelHit ?? 0},bgAiSkipNoClass=${bgAi?.stats.skipNoClass ?? 0},` +
          `bgAiSkipClassAmbiguous=${bgAi?.stats.skipClassAmbiguous ?? 0},bgAiSkipNoRule=${bgAi?.stats.skipNoRule ?? 0},` +
          `bgAiSkipRuleAmbiguous=${bgAi?.stats.skipRuleAmbiguous ?? 0},bgAiSkipNoBgKey=${bgAi?.stats.skipNoBgKey ?? 0},` +
          `bgAiSkipAlreadyUrl=${bgAi?.stats.skipAlreadyUrl ?? 0},bgAiErrors=${bgAi?.stats.errors ?? 0},bgAiTokens=${bgAi?.stats.totalTokens ?? 0},` +
          `cfWrapTransparent=${cf?.stats.wrapTransparentized ?? 0},cfWrapColorFixed=${cf?.stats.wrapColorFixed ?? 0},` +
          `cfContainerColorFixed=${cf?.stats.containerColorFixed ?? 0},cfSkipNoRule=${cf?.stats.skipNoRule ?? 0},` +
          `cfSkipAmbiguous=${cf?.stats.skipAmbiguous ?? 0},cfSkipUrlOrGradient=${cf?.stats.skipUrlOrGradient ?? 0},` +
          `cfSkipSameColor=${cf?.stats.skipSameColor ?? 0},` +
          `ptPanels=${pt?.stats.panels ?? 0},ptRelocated=${pt?.stats.titleRelocated ?? 0},ptSkipNoTitle=${pt?.stats.skipNoTitle ?? 0},` +
          `e2nProdNodes=${e2n?.stats.prodNodes ?? 0},e2nFigmaTexts=${e2n?.stats.figmaTexts ?? 0},` +
          `e2nSeeds=${e2n?.stats.seeds ?? 0},e2nPartialSeeds=${e2n?.stats.partialSeeds ?? 0},` +
          `e2nAmbiguousSeeds=${e2n?.stats.ambiguousSeeds ?? 0},e2nMissSeeds=${e2n?.stats.missSeeds ?? 0},` +
          `e2nNodes=${e2n?.stats.nodes ?? 0},e2nMulti=${e2n?.stats.multi ?? 0},e2nFigmaContainers=${e2n?.stats.figmaContainers ?? 0},` +
          `e2nBgCand=${e2nBg?.stats.candidates ?? 0},e2nBgAnchored=${e2nBg?.stats.anchored ?? 0},` +
          `e2nBgInserted=${e2nBg?.stats.inserted ?? 0},e2nBgMergedColor=${e2nBg?.stats.mergedColor ?? 0},` +
          `e2nBgReplacedGradient=${e2nBg?.stats.replacedGradient ?? 0},e2nBgReplacedColor=${e2nBg?.stats.replacedColor ?? 0},` +
          `e2nBgSkipNoEdge=${e2nBg?.stats.skipNoEdge ?? 0},e2nBgSkipNoClass=${e2nBg?.stats.skipNoClass ?? 0},` +
          `e2nBgSkipNoRule=${e2nBg?.stats.skipNoRule ?? 0},e2nBgSkipMultiClass=${e2nBg?.stats.skipMultiClass ?? 0},` +
          `e2nBgSkipRuleAmbiguous=${e2nBg?.stats.skipRuleAmbiguous ?? 0},e2nBgSkipAlreadyUrl=${e2nBg?.stats.skipAlreadyUrl ?? 0},` +
          // 计划（唯一执行源）与旧通道对账：planOnly>0 说明旧通道漏做，legacyOnly>0 说明旧通道在猜落点
          `planEntries=${plan?.stats.entries ?? 0},planApply=${plan?.stats.apply ?? 0},planSatisfied=${plan?.stats.satisfied ?? 0},` +
          `planConflicts=${plan?.stats.conflicts ?? 0},planGaps=${plan?.gaps.length ?? 0},` +
          `planBgInserted=${planApply?.stats.bgInserted ?? 0},planBgReplacedGradient=${planApply?.stats.bgReplacedGradient ?? 0},` +
          `planBgReplacedColor=${planApply?.stats.bgReplacedColor ?? 0},planBgCleanup=${planApply?.stats.bgReplacedUrl ?? 0},` +
          `planFillApplied=${planApply?.stats.fillApplied ?? 0},planTextApplied=${planApply?.stats.textApplied ?? 0},planRuleEdits=${planApply?.stats.ruleEdits ?? 0},` +
          `planNoop=${planApply?.stats.noop ?? 0},planStale=${planApply?.stats.stale ?? 0},` +
          `planReconBoth=${planRecon?.both.length ?? 0},planReconPlanOnly=${planRecon?.planOnly.length ?? 0},` +
          `planReconLegacyOnly=${planRecon?.legacyOnly.length ?? 0},` +
          `sizeRestored=${m.sizeRestored},containerSizeFixed=${m.containerSizeFixed},` +
          `parentBoxRelaxed=${m.parentBoxRelaxed},` +
          `snapshotSynced=${snapshotSynced},` +
          `extraFilesChanged=${extraChanged.size},` +
          `filesChanged=${changedCount}`,
      );

      const report: LabReportSummary = {
        status: 'done',
        sessionId,
        fileKey,
        nodeId,
        stats: {
          ...s,
          assets: truth.assets.length,
          containers: truth.containerCount,
          assetsCopied: copiedCount,
          assetMounted: m.mounted,
          assetNoAnchor: m.noAnchor,
          assetNoSiblingTexts: m.noSiblingTexts,
          assetNoFile: m.noFile,
          svgReplaced: m.svgReplaced,
          dataUriReplaced: m.dataUriReplaced,
          iconClassReplaced: m.iconClassReplaced,
          emptyIconVarsReplaced: m.emptyIconVarsReplaced,
          emptyIconFieldsReplaced: m.emptyIconFieldsReplaced,
          emptyObjPropsReplaced: m.emptyObjPropsReplaced,
          newElementInserted: m.newElementInserted,
          newElSkipNoAnchor: m.newElSkipNoAnchor,
          newElSkipAmbiguous: m.newElSkipAmbiguous,
          svgSkipped: m.svgSkipped,
          bgAnchored: m.bgAnchored,
          bgSkipNoClass: m.bgSkipNoClass,
          bgSkipAmbiguous: m.bgSkipAmbiguous,
          bgSkipNoBgKey: m.bgSkipNoBgKey,
          bgSkipAlreadyUrl: m.bgSkipAlreadyUrl,
          rootBgPanels: rc?.stats.panels ?? 0,
          rootBgClasses: rc?.stats.rootClasses ?? 0,
          rootBgCleared: rc?.stats.cleared ?? 0,
          rootBgSkipAlreadyTransparent: rc?.stats.skipAlreadyTransparent ?? 0,
          rootBgSkipNoBackground: rc?.stats.skipNoBackground ?? 0,
          rootBgSkipNoRootClass: rc?.stats.skipNoRootClass ?? 0,
          bgAiCalled: bgAi?.stats.candidates ?? 0,
          bgAiAnchored: bgAi?.stats.anchored ?? 0,
          bgAiStructCand: bgAi?.stats.structCandidates ?? 0,
          bgAiStructOverrides: bgAi?.stats.structOverrides ?? 0,
          bgAiSkipNoLabelHit: bgAi?.stats.skipNoLabelHit ?? 0,
          bgAiSkipNoClass: bgAi?.stats.skipNoClass ?? 0,
          bgAiSkipClassAmbiguous: bgAi?.stats.skipClassAmbiguous ?? 0,
          bgAiSkipNoRule: bgAi?.stats.skipNoRule ?? 0,
          bgAiSkipRuleAmbiguous: bgAi?.stats.skipRuleAmbiguous ?? 0,
          bgAiSkipNoBgKey: bgAi?.stats.skipNoBgKey ?? 0,
          bgAiSkipAlreadyUrl: bgAi?.stats.skipAlreadyUrl ?? 0,
          bgAiErrors: bgAi?.stats.errors ?? 0,
          bgAiTokens: bgAi?.stats.totalTokens ?? 0,
          cfWrapTransparent: cf?.stats.wrapTransparentized ?? 0,
          cfWrapColorFixed: cf?.stats.wrapColorFixed ?? 0,
          cfContainerColorFixed: cf?.stats.containerColorFixed ?? 0,
          cfSkipNoRule: cf?.stats.skipNoRule ?? 0,
          cfSkipAmbiguous: cf?.stats.skipAmbiguous ?? 0,
          cfSkipUrlOrGradient: cf?.stats.skipUrlOrGradient ?? 0,
          cfSkipSameColor: cf?.stats.skipSameColor ?? 0,
          ptPanels: pt?.stats.panels ?? 0,
          ptRelocated: pt?.stats.titleRelocated ?? 0,
          ptSkipNoTitle: pt?.stats.skipNoTitle ?? 0,
          e2nProdNodes: e2n?.stats.prodNodes ?? 0,
          e2nFigmaTexts: e2n?.stats.figmaTexts ?? 0,
          e2nSeeds: e2n?.stats.seeds ?? 0,
          e2nPartialSeeds: e2n?.stats.partialSeeds ?? 0,
          e2nAmbiguousSeeds: e2n?.stats.ambiguousSeeds ?? 0,
          e2nMissSeeds: e2n?.stats.missSeeds ?? 0,
          e2nNodes: e2n?.stats.nodes ?? 0,
          e2nMulti: e2n?.stats.multi ?? 0,
          e2nFigmaContainers: e2n?.stats.figmaContainers ?? 0,
          e2nBgCand: e2nBg?.stats.candidates ?? 0,
          e2nBgAnchored: e2nBg?.stats.anchored ?? 0,
          e2nBgInserted: e2nBg?.stats.inserted ?? 0,
          e2nBgMergedColor: e2nBg?.stats.mergedColor ?? 0,
          e2nBgReplacedGradient: e2nBg?.stats.replacedGradient ?? 0,
          e2nBgReplacedColor: e2nBg?.stats.replacedColor ?? 0,
          e2nBgSkipNoEdge: e2nBg?.stats.skipNoEdge ?? 0,
          e2nBgSkipNoClass: e2nBg?.stats.skipNoClass ?? 0,
          e2nBgSkipNoRule: e2nBg?.stats.skipNoRule ?? 0,
          e2nBgSkipMultiClass: e2nBg?.stats.skipMultiClass ?? 0,
          e2nBgSkipRuleAmbiguous: e2nBg?.stats.skipRuleAmbiguous ?? 0,
          e2nBgSkipAlreadyUrl: e2nBg?.stats.skipAlreadyUrl ?? 0,
          // 计划执行（唯一写盘源）+ 与旧通道对账
          planEntries: plan?.stats.entries ?? 0,
          planApply: plan?.stats.apply ?? 0,
          planSatisfied: plan?.stats.satisfied ?? 0,
          planConflicts: plan?.stats.conflicts ?? 0,
          planGaps: plan?.gaps.length ?? 0,
          planBgInserted: planApply?.stats.bgInserted ?? 0,
          planBgReplacedGradient: planApply?.stats.bgReplacedGradient ?? 0,
          planBgReplacedColor: planApply?.stats.bgReplacedColor ?? 0,
          planBgCleanup: planApply?.stats.bgReplacedUrl ?? 0,planBgLayered: planApply?.stats.bgLayered ?? 0,
          planFillApplied: planApply?.stats.fillApplied ?? 0,
          planTextApplied: planApply?.stats.textApplied ?? 0,
          planRuleEdits: planApply?.stats.ruleEdits ?? 0,          planNoop: planApply?.stats.noop ?? 0,
          planStale: planApply?.stats.stale ?? 0,
          planReconBoth: planRecon?.both.length ?? 0,
          planReconPlanOnly: planRecon?.planOnly.length ?? 0,
          planReconLegacyOnly: planRecon?.legacyOnly.length ?? 0,
          planReconAgree: planRecon?.agree ? 1 : 0,
          // 闸④ 无源样式（产物里无 Figma 真值来源的视觉声明）
          unsourcedScanned: unsourced?.stats.classesScanned ?? 0,
          unsourcedFindings: unsourced?.stats.findings ?? 0,
          unsourcedDelete: unsourced?.stats.delete ?? 0,
          unsourcedOverride: unsourced?.stats.override ?? 0,
          unsourcedFanout: unsourced?.stats.fanout ?? 0,
          unsourcedUnmapped: unsourced?.stats.unmappedRiskClasses.length ?? 0,
          // 闸③ 落地（v1-lite）：删阴影 / 改圆角；其余按设计只报告
          unsourcedApplied: unsourcedApply?.stats.applied ?? 0,
          unsourcedAppliedDelete: unsourcedApply?.stats.delete ?? 0,
          unsourcedAppliedOverride: unsourcedApply?.stats.override ?? 0,
          unsourcedApplyReportOnly: unsourcedApply?.stats.reportOnly ?? 0,
          unsourcedApplySkipped: unsourcedApply?.stats.skipped ?? 0,
          unsourcedApplyStale: unsourcedApply?.stats.byReason['stale-offset'] ?? 0,
          unsourcedApplyRules: unsourcedApply?.stats.rulesRewritten ?? 0,
          // 收敛断言：必须为 0
          unsourcedRemainingAuto: unsourcedApply?.remainingAuto ?? 0,
          sizeRestored: m.sizeRestored,
          // tx 通道（2026-11-06）：图片专用壳按 Figma 容器真值改宽高 / 父容器抬 min-height
          containerSizeFixed: m.containerSizeFixed,
          parentBoxRelaxed: m.parentBoxRelaxed,
          snapshotSynced,
          extraFilesChanged: extraChanged.size,
          xAxisBackfilled: sb.xAxisBackfilled,
          yAxisBackfilled: sb.yAxisBackfilled,
          markLineBackfilled: sb.markLineBackfilled,
          scriptColorApplied: sb.scriptColorApplied,
          scriptFontSizeApplied: sb.scriptFontSizeApplied,
          scriptSkipped: sb.scriptSkipped,
        },
        assets: truth.assets.map((a) => ({ nodeId: a.nodeId, name: a.name, fileName: a.fileName })),
        ...(unsourced
          ? {
              unsourced: {
                stats: unsourced.stats,
                findings: unsourced.findings.map((f) => ({
                  cls: f.cls,
                  prop: f.prop,
                  value: f.value,
                  verdict: f.verdict,
                  figmaId: f.figmaId,
                  evidence: f.evidence,
                })),
              },
            }
          : {}),
        ...(unsourcedApply
          ? {
              unsourcedApplied: {
                stats: unsourcedApply.stats,
                remainingAuto: unsourcedApply.remainingAuto,
                applied: unsourcedApply.applied.map((a) => ({
                  file: a.file,
                  cls: a.cls,
                  rawProp: a.rawProp,
                  kind: a.kind,
                  from: a.from,
                  to: a.to,
                  figmaId: a.figmaId,
                })),
                skipped: unsourcedApply.skipped.map((s) => ({
                  cls: s.cls,
                  rawProp: s.rawProp,
                  verdict: s.verdict,
                  reason: s.reason,
                })),
              },
            }
          : {}),
        ...(plan
          ? {
              plan: {
                entries: plan.stats.entries,
                apply: plan.stats.apply,
                satisfied: plan.stats.satisfied,
                conflicts: plan.stats.conflicts,
                gaps: plan.gaps.length,
                byKind: plan.stats.byKind as unknown as Record<
                  string,
                  { candidates: number; apply: number; skip: number; satisfied: number }
                >,
                applyStats:
                  planApply?.stats ?? {
                    entries: 0,
                    appliedEntries: 0,
                    ruleEdits: 0,
                    bgInserted: 0,
                    bgReplacedGradient: 0,
                    bgReplacedColor: 0,
                    bgReplacedUrl: 0,
                    bgLayered: 0,
                    fillApplied: 0,
                    textApplied: 0,
                    noop: 0,
                    stale: 0,
                  },
                reconcile: {
                  both: planRecon?.both.length ?? 0,
                  planOnly: planRecon?.planOnly ?? [],
                  legacyOnly: planRecon?.legacyOnly ?? [],
                  agree: planRecon?.agree ?? false,
                },
              },
            }
          : {}),
        files: finalFiles.map((f) => ({
          path: f.path,
          changed: f.changed,
          editCount: f.edits.length,
        })),
        workspaceSynced: syncedTargets.length > 0,
        outputPath,
        finishedAt: new Date().toISOString(),
      };
      writeFileSync(join(cacheDir, REPORT_FILE), JSON.stringify({ ...report, edits: finalFiles }, null, 2));

      // ---------- Stage D：完成 ----------
      this.tasksService.updateTask(sessionId, {
        status: 'completed',
        labStage: 'done',
        labReportPath: join(cacheDir, REPORT_FILE),
        visualDegraded: false,
      } as any);
      await this.progressService.sendComplete(sessionId, {
        success: true,
        lab: true,
        report,
        message: `lite-lab 完成：匹配 ${s.exact + s.substr}/${s.evaluated}，回填颜色 ${s.colorApplied}、字号 ${s.fontSizeApplied}、尺寸 ${s.sizeApplied}，资源挂载 ${m.mounted}/${m.uniqueImageRefs}`,
      });
    } catch (e: any) {
      this.logger.error(`[lite-lab] ${sessionId} 失败: ${e?.message}`);
      try {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(
          join(cacheDir, REPORT_FILE),
          JSON.stringify(
            { status: 'error', sessionId, error: e?.message, finishedAt: new Date().toISOString() },
            null,
            2,
          ),
        );
      } catch {
        /* 报告写不进去就以 SSE 为准 */
      }
      const task = this.tasksService.getTask(sessionId);
      if (task?.status !== 'failed' && task?.status !== 'cancelled') {
        await this.progressService.sendError(sessionId, {
          code: 'LAB_FAILED',
          message: `lite-lab 失败：${e?.message || e}`,
        });
      }
    }
  }

  /**
   * 回填后同步 workspace：lite 的 publishValidatedLiteOutput 已把**回填前**版本
   * 发到 workspace（任务详情页预览读这里），本方法把回填后的 package/resources
   * 覆盖过去。
   * 🔴 2026-11-05 实锤（mc-lab-1793867201765）：microcode 的预览经
   *   GET /component/by-session 反查组件记录 componentId（语义 id，c-<kebab>-<8hex>，
   *   lite.service:3366 buildComponentId）→ resolveWorkspaceComponentId 解析到**语义目录**；
   *   只同步 sessionId 目录预览永远是回填前 lite 版本（「依旧是 lite 效果」实锤）。
   *   故 targets = sessionId 目录（历史兼容）+ declare.json 的 componentId 语义目录（预览正主）。
   */
  private syncBackfillToWorkspace(
    outputPath: string,
    sessionId: string,
    groupId: string,
    componentType: string,
  ): string[] {
    const isMicrocode = componentType === 'microcode';
    const targets = isMicrocode
      ? [join(customComponentsDir, sessionId), join(resolveFrontendWorkspace(), 'custom-components', sessionId)]
      : [
          join(vue3ComponentsDir, groupId, sessionId),
          join(resolveFrontendWorkspace(), 'vue3-components', groupId, sessionId),
        ];
    // 语义 componentId 目录：lite 微码发布正主（declare.json 由 lite 阶段4 写在 outputPath 根）
    if (isMicrocode) {
      try {
        const declare = JSON.parse(readFileSync(join(outputPath, 'declare.json'), 'utf8'));
        if (declare?.componentId && declare.componentId !== sessionId) {
          targets.push(join(customComponentsDir, declare.componentId));
          targets.push(join(resolveFrontendWorkspace(), 'custom-components', declare.componentId));
        }
      } catch {
        /* declare.json 读不到（非微码/异常）时按 sessionId 目录兜底 */
      }
    }
    const synced: string[] = [];
    for (const targetPath of targets) {
      try {
        const pkgSrc = join(outputPath, 'package');
        if (existsSync(pkgSrc)) {
          cpSync(pkgSrc, join(targetPath, 'package'), { recursive: true, force: true });
          synced.push(join(targetPath, 'package'));
        }
        const resSrc = join(outputPath, 'resources');
        if (existsSync(resSrc)) {
          cpSync(resSrc, join(targetPath, 'resources'), { recursive: true, force: true });
        }
      } catch (e: any) {
        this.logger.warn(`[lite-lab] ${sessionId} workspace 同步失败 ${targetPath}: ${e?.message}`);
      }
    }
    return synced;
  }

  /**
   * 背景图兜底（2026-11-05 立项，11-05 v2 加结构锚定通道）：bg-* 纯 id 命名无法命名
   * 锚定时，候选来自两条路——① Figma 真值 `parentTexts`/`siblingTexts`（确定性，不依赖
   * vision）；② vision 读设计截图给出「文件名→容器可见文字」（AI 只给候选）。候选统一
   * 交 aiAnchorBackgroundAssets 走确定性双闸门（不放宽判据）。
   * vision 未配置/调用失败 → stats.errors 计数，非致命（有结构候选时照常挂载）。
   */
  private async runBgAiFallback(
    shotPath: string,
    imgDir: string,
    assets: FigmaAssetTruth[],
    cacheDir: string,
    userId?: string,
  ): Promise<BgAiResult> {
    const { resolveVisionConfig } = await import('../../ai-engine/utils/ai-defaults.js');
    const cfg = resolveVisionConfig(await this.aiConfigService.getMergedAiConfig(userId));
    const emptyStats = () => ({
      candidates: assets.length, anchored: 0, skipNoLabelHit: 0, skipNoClass: 0,
      skipClassAmbiguous: 0, skipNoRule: 0, skipRuleAmbiguous: 0, skipNoBgKey: 0,
      skipAlreadyUrl: 0, errors: 0, totalTokens: 0,
    });
    const fileNames = assets.map((a) => a.fileName!).filter((n) => !!n);

    // 🆕 bg 结构锚定（83cfb20e 实锤）：整图 bg（卡底图/面板底图）的 siblingTexts 常为空
    // ——文本都在孙层、父容器下没有直接 TEXT 兄弟。Figma 真值里的 parentTexts（父容器
    // **整子树**文本，如设备卡 group 的 ['摄像机','(2/484)']）才是确定性结构锚点。
    // 无 parentTexts 时回退 siblingTexts（老口径），两者都没有则该资产无确定性候选。
    const structCand = new Map<string, string>();
    for (const a of assets) {
      const name = a.fileName;
      if (!name) continue;
      const src = a.parentTexts && a.parentTexts.length > 0 ? a.parentTexts : a.siblingTexts ?? [];
      const words = src.map((t) => String(t).trim()).filter((t) => t.length >= 2);
      if (words.length > 0) structCand.set(name, words.join(' '));
    }
    /** 确定性候选覆盖 AI 同名候选的次数（结构真值 > AI 读图） */
    let overrides = 0;

    // 落点统一走 aiAnchorBackgroundAssets（读 mount 写盘后的最新产物：shotPath 上两级 = outputPath）
    const anchor = (cands: BgAiCandidate[], tokens: number, errors = 0): BgAiResult => {
      const r = aiAnchorBackgroundAssets(
        this.collectSfcFiles(join(dirname(shotPath), '..', '..', 'package')).concat(
          // 🔴 预编译 index.css 同步（478f0758 实锤）：微码预览剥 SFC style 注入 index.css，
          // 只改 SFC 则预览永远纯色。裸 CSS 由 collectStyleRulesFromContent 回退口径解析。
          ...this.collectPrecompiledCss(join(dirname(shotPath), '..', '..')),
        ),
        cands,
      );
      r.stats.totalTokens = tokens;
      r.stats.structCandidates = structCand.size;
      r.stats.structOverrides = overrides;
      r.stats.errors += errors;
      return r;
    };

    if (!cfg?.apiKey) {
      if (structCand.size === 0) {
        this.logger.warn('[lite-lab] 背景图兜底：未配置 vision 模型且无结构锚点，跳过');
        return { files: [], stats: { ...emptyStats(), errors: 1 } };
      }
      // 确定性通道不需要 vision：结构锚点直接挂
      this.logger.log(
        `[lite-lab] 背景图兜底：未配置 vision，改走结构锚定 ${structCand.size} 条`,
      );
      return anchor([...structCand].map(([fileName, label]) => ({ fileName, label })), 0);
    }

    const compositePath = await this.buildBgAiComposite(shotPath, imgDir, fileNames);
    const { VisionAgent } = await import('../../ai-engine/agents/vision-agent.js');
    const agent = new VisionAgent(cfg as any);
    let tokens = 0;
    try {
      (agent as any).onTokenUsage = (u: any) => { tokens += u?.totalTokens || 0; };
    } catch { /* 钩子挂不上不影响主流程 */ }

    const prompt =
      '这是一张 UI 设计稿截图（左侧主体）。右侧竖排是若干带红框标注的背景图资产，红框下方标注了文件名。\n' +
      '请判断截图中哪个容器区域使用了每张背景图（整块铺满的纹理/渐变/图片背景），并输出该容器区域内或紧邻的可见文字。\n' +
      `严格输出 JSON，格式：{"文件名": "可见文字或null", ...}，不要输出任何其他内容。`;
    let content = '';
    try {
      content = await agent.analyzeImage(compositePath, prompt, {});
    } catch (e: any) {
      this.logger.warn(`[lite-lab] 背景图兜底 vision 调用失败: ${e?.message}`);
      // vision 挂了但结构候选还在 → 仍然挂，只记 error
      if (structCand.size > 0) {
        return anchor([...structCand].map(([fileName, label]) => ({ fileName, label })), tokens, 1);
      }
      return { files: [], stats: { ...emptyStats(), errors: 1, totalTokens: tokens } };
    }
    // token 钩子可能异步未及触发，再兜一次 usage（取不到就算了）
    const usageTokens = tokens > 0 ? tokens : Number((agent as any)?._lastTotalTokens || 0);

    const jsonM = /\{[\s\S]*\}/.exec(String(content || ''));
    let parsed: Record<string, unknown> = {};
    if (!jsonM) {
      this.logger.warn('[lite-lab] 背景图兜底：vision 输出无法解析出 JSON');
      if (structCand.size === 0) {
        return { files: [], stats: { ...emptyStats(), errors: 1, totalTokens: usageTokens } };
      }
    } else {
      try {
        parsed = JSON.parse(jsonM[0]);
      } catch {
        this.logger.warn('[lite-lab] 背景图兜底：vision JSON 解析失败');
        if (structCand.size === 0) {
          return { files: [], stats: { ...emptyStats(), errors: 1, totalTokens: usageTokens } };
        }
      }
    }

    // 合并候选：结构真值优先（AI 同 fileName 的 label 被覆盖），AI 补齐结构缺失项
    const candidates: BgAiCandidate[] = [];
    for (const name of fileNames) {
      const label = typeof parsed[name] === 'string' ? (parsed[name] as string).trim() : '';
      const st = structCand.get(name);
      if (st) {
        if (label) overrides += 1;
        candidates.push({ fileName: name, label: st });
      } else if (label) {
        candidates.push({ fileName: name, label });
      }
    }
    // 🔴 可辩驳观测：vision 原始返回 + 结构候选落盘 .cache（归因「候选从哪来、AI 给了什么」）
    // 🆕 c91f6190 实锤：原实现用 dirname(dirname(shotPath)) 算目录 → 落到
    // <output>/resources/.cache（与 figma-truth.json 不在同一处），排障时找不到；改为显式传会话 cacheDir。
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        join(cacheDir, 'bg-ai-response.json'),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            fileNames,
            struct: Object.fromEntries(structCand),
            raw: parsed,
            candidates,
            structOverrides: overrides,
          },
          null,
          2,
        ),
        'utf8',
      );
      if (candidates.length > 0) {
        this.logger.log(
          `[lite-lab] 背景图兜底候选: ${candidates.map((c) => `${c.fileName}→「${c.label}」`).join(', ')}`,
        );
      }
    } catch { /* 观测落盘失败不影响主流程 */ }
    return anchor(candidates, usageTokens, jsonM ? 0 : 1);
  }

  /** 截图 + 资产图拼图（资产列右侧竖排，红框 + 文件名标注），供单次 vision 调用 */
  private async buildBgAiComposite(
    shotPath: string,
    imgDir: string,
    fileNames: string[],
  ): Promise<string> {
    const sharp = (await import('sharp')).default;
    const shotBuf = await sharp(shotPath)
      .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const meta = await sharp(shotBuf).metadata();
    const W = meta.width ?? 1400;
    const H = meta.height ?? 900;
    const laneW = 260;
    const comps: Array<{ input: Buffer; left: number; top: number }> = [
      { input: shotBuf, left: 0, top: 0 },
    ];
    // 🆕 列高自适应：现有 N 张资产均分可视列高，资产等比缩小放下（修复 y>H-80 静默裁切
    // 导致 bgAiCalled=2 而非 3 的漏喂）
    const present = fileNames.filter((n) => existsSync(join(imgDir, n)));
    const slotH = present.length > 0 ? Math.floor((H - 40) / present.length) : H;
    const marks: string[] = [];
    let y = 14;
    for (const name of fileNames) {
      const p = join(imgDir, name);
      if (!existsSync(p)) continue;
      const maxH = Math.max(24, slotH - 46);
      const assetBuf = await sharp(p)
        .resize(laneW - 60, maxH, { fit: 'inside' })
        .png()
        .toBuffer();
      const am = await sharp(assetBuf).metadata();
      const aw = am.width ?? 100;
      const ah = am.height ?? 40;
      const ax = W + 24;
      marks.push(
        `<rect x="${ax - 4}" y="${y - 4}" width="${aw + 8}" height="${ah + 8}" fill="none" stroke="#ff3333" stroke-width="3"/>`,
        `<text x="${ax}" y="${y + ah + 22}" font-size="18" fill="#ffffff" font-family="monospace">${name.replace(/[<>&]/g, '')}</text>`,
      );
      comps.push({ input: assetBuf, left: ax, top: y });
      y += slotH;
    }
    const svg = Buffer.from(
      `<svg width="${W + laneW}" height="${H}" xmlns="http://www.w3.org/2000/svg">${marks.join('')}</svg>`,
    );
    comps.push({ input: svg, left: 0, top: 0 });
    const out = join(imgDir, '.bg-ai-composite.png');
    await sharp({ create: { width: W + laneW, height: H, channels: 3, background: { r: 24, g: 24, b: 24 } } })
      .composite(comps)
      .png()
      .toFile(out);
    return out;
  }

  /** 收集 package 根与 components/ 下的 .vue（相对路径，供 matcher 与写盘共用） */
  private collectSfcFiles(packageDir: string): Array<{ path: string; content: string }> {
    const out: Array<{ path: string; content: string }> = [];
    if (!existsSync(packageDir)) return out;
    for (const name of readdirSync(packageDir)) {
      const full = join(packageDir, name);
      if (name.endsWith('.vue')) {
        out.push({ path: `package/${name}`, content: readFileSync(full, 'utf8') });
      } else if (name === 'components') {
        const compDir = join(packageDir, 'components');
        for (const c of readdirSync(compDir)) {
          if (c.endsWith('.vue')) {
            out.push({
              path: `package/components/${c}`,
              content: readFileSync(join(compDir, c), 'utf8'),
            });
          }
        }
      }
    }
    return out;
  }

  /**
   * 收集预编译样式表（resources/styles/index.css，相对 outputPath）。
   * 🔴 478f0758 实锤：微码预览剥 SFC <style> 注入预编译 index.css——回填只改 SFC
   * 则预览永远看不到挂图/换色。返回相对路径 `resources/styles/index.css`，
   * matcher 端 importDepthFor 已按该位置解析 `../images/`。
   */
  /**
   * 收集「样式源」供后处理改写（E2N 容器级 bg 挂载 / 容器 fill 回填等）。
   *
   * 🔴 2026-11-05 真机实锤（1b5b72d0：DOM 里 `.summary-card--blue` 明明有 bg url，肉眼却没有背景图）：
   *   预览实际生效的样式来自 **SFC 内嵌 `<style lang="less">` 编译结果**（index.less → common.less
   *   → themes/*.less），而 `resources/styles/index.css` 只是预编译副本。二者同优先级时**后注入者赢**，
   *   SFC 那次注入在后 ⇒ 只改 index.css 会被 less 投影原样压掉（表现为「规则在，图没有」）。
   *   故这里必须把 less 源一并纳入，让**所有投影**都带上 bg url。
   *
   * 只收 `resources/styles/**` 下的 .css/.less：不碰 package/*.vue（由 finalFiles 负责），
   * 也不碰图片等二进制。
   */
  private collectPrecompiledCss(outputDir: string): Array<{ path: string; content: string }> {
    const out: Array<{ path: string; content: string }> = [];
    const walk = (relDir: string) => {
      const absDir = join(outputDir, relDir);
      if (!existsSync(absDir)) return;
      for (const ent of readdirSync(absDir, { withFileTypes: true })) {
        const rel = `${relDir}/${ent.name}`;
        if (ent.isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.(css|less)$/i.test(ent.name)) continue;
        out.push({ path: rel, content: readFileSync(join(outputDir, rel), 'utf8') });
      }
    };
    walk('resources/styles');
    return out;
  }

  /**
   * 产物读路径的**唯一归属入口**（2026-11-06 用户裁决「lab 生成任务也要 ownerId，每个人独立」）。
   *
   * 🔴 为什么读路径也必须过归属：
   *   `report` / `artifact` 返回的是**回填后的组件代码与报告**（Stage B/C/D 的产物）——那就是
   *   用户资产。此前这两个方法只有「目录/白名单/防穿越」三件事，**没有身份**，
   *   ⇒ 任何知道 sessionId 的人都能读到别人的产物。sessionId 虽随机，但会出现在
   *   前端 URL / 日志 / 分享截图里，等于一次「知道 ID 即可读全部」。
   *
   * 判据来源：`TasksService.getTask(sessionId).userId`（`run()` 建任务时由
   *   `createTask(..., { userId })` 写入，值就是 `session.guard.ts` 落的 24-hex 平台用户 ID）。
   *   **刻意不在本模块再引一份 owner 正则**：任务的 userId 是我方自己写入的，不是外部入参，
   *   多一份形态判据就多一处会漂移的真相源（与 project-pipeline 的取舍相反，因为那里
   *   `ownerId` 可来自 DTO，必须收敛形态）。
   *
   * 语义（两条，缺一不可）：
   *   ① 任务**无 userId** → 放行。lab 的 `run` 一直挂 SessionGuard ⇒ 正常不存在无主任务；
   *      此分支是为「历史/异常目录」兜底，避免把老任务对作者本人也锁死（可见性事故不可逆）。
   *   ② 越权一律 **404 而非 403**：403 等于承认「这个 sessionId 存在、只是不给你看」，
   *      与 dev-only 开关「不暴露存在性」的口径一致（生产本就连路由都没有）。
   */
  private assertLabAccess(sessionId: string, userId?: string): void {
    const task = this.tasksService.getTask(sessionId) as any;
    const owner = typeof task?.userId === 'string' ? task.userId.trim() : '';
    if (!owner) return; // ① 存量/无主任务：放行（见上）
    if (owner !== (userId ?? '').trim()) {
      this.logger.warn(
        `[lite-lab][owner] 拒绝访问 sessionId=${sessionId}：归属不一致（caller=${userId ?? 'anonymous'}）`,
      );
      throw Object.assign(new Error(`任务 ${sessionId} 不存在`), { status: 404 });
    }
  }

  getReport(sessionId: string, userId?: string): LabReportSummary & { edits?: any } {
    this.assertLabAccess(sessionId, userId);
    const outputPath = this.locateOutputPath(sessionId, join('.cache', REPORT_FILE));
    const reportPath = outputPath ? join(outputPath, '.cache', REPORT_FILE) : undefined;
    if (!reportPath || !existsSync(reportPath)) {
      // 🩺 诊断留痕：真机曾出现「文件在但服务端 404」，定位是哪一层判 false
      this.logger.warn(
        `[lite-lab] report 未找到: sessionId=${sessionId}, outputPath=${outputPath ?? 'NOT_LOCATED'}, reportExists=${reportPath ? existsSync(reportPath) : 'n/a'}`,
      );
      throw Object.assign(new Error(`任务 ${sessionId} 暂无 lab 报告`), { status: 404 });
    }
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  }

  getArtifact(sessionId: string, relPath: string, userId?: string): { buffer: Buffer; ext: string } {
    this.assertLabAccess(sessionId, userId);
    const outputPath = this.locateOutputPath(sessionId, relPath);
    if (!outputPath) throw Object.assign(new Error(`任务 ${sessionId} 产物目录不存在`), { status: 404 });
    const base = normalize(outputPath);
    const full = normalize(join(outputPath, relPath));
    if (!full.startsWith(base + sep)) {
      throw Object.assign(new Error('非法路径'), { status: 400 });
    }
    const ext = relPath.slice(relPath.lastIndexOf('.')).toLowerCase();
    if (!ARTIFACT_EXT_WHITELIST.has(ext)) {
      throw Object.assign(new Error(`不允许的文件类型: ${ext}`), { status: 400 });
    }
    if (!existsSync(full)) throw Object.assign(new Error('文件不存在'), { status: 404 });
    return { buffer: readFileSync(full), ext };
  }
}
