import { Injectable, Logger } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { ComponentService } from '../component/component.service';
import { GeneratePageDto } from './dto/generate-page.dto';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import { tempComponentsDir, customComponentsDir, vue3ComponentsDir, projectRoot } from '../config/backend-root';
import { validateVueSfcDirectory } from '../ai-engine/utils/sfc-syntax-validation.js';

@Injectable()
export class PageGeneratorService {
  private readonly logger = new Logger(PageGeneratorService.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly progressService: ProgressService,
    private readonly componentService: ComponentService,
  ) {}

  /**
   * 启动页面级生成任务（异步执行）
   */
  async startPageGeneration(
    sessionId: string,
    dto: GeneratePageDto,
    groupId: string,
    userId?: string,
  ) {
    const { fileKey, nodeId, executionMode = 'parallel', concurrency = 2, config = {} } = dto;

    // 🆕 暂无分组概念时，按用户 uid 落到私人组（与 Lite/Phase2/Vue3 一致）
    groupId = await this.componentService.resolvePrivateGroupId(groupId, userId);

    // 创建页面级任务记录
    this.tasksService.createTask(sessionId, {
      componentId: sessionId,
      groupId,
      componentName: `page-${sessionId}`,
      nodeId,
      fileKey,
      taskType: 'page',
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });

    // 异步执行
    this.executePageGeneration(sessionId, {
      fileKey,
      nodeId,
      groupId,
      executionMode,
      concurrency,
      config,
      userId,
    }).catch((error) => {
      this.logger.error(`页面生成失败: ${error.message}`, error.stack);
      this.progressService.sendError(sessionId, {
        message: error.message,
        stack: error.stack,
      });
    });
  }

  /**
   * 执行页面级生成
   */
  private async executePageGeneration(
    sessionId: string,
    params: {
      fileKey: string;
      nodeId: string;
      groupId: string;
      executionMode: 'serial' | 'parallel';
      concurrency: number;
      config: any;
      userId?: string;
    },
  ) {
    const { fileKey, nodeId, groupId, executionMode, concurrency, config } = params;

    try {
      // 动态导入 PageDecomposer 和 BatchOrchestrator
      const decomposerModule = await import('../ai-engine/utils/page-decomposer.js');
      const orchestratorModule = await import('../ai-engine/utils/batch-orchestrator.js');

      const { BatchOrchestrator } = orchestratorModule;

      // 创建 BatchOrchestrator，传入 progressService 作为进度推送器
      const orchestrator = new BatchOrchestrator({
        sessionId,
        progressManager: this.progressService,
        concurrency,
        executionMode,
      });

      // 获取 Figma 节点树需要 FigmaConnector
      const figmaModule = await import('../ai-engine/roles/figma-connector.js');
      const { FigmaConnector } = figmaModule;

      const figmaConnector = new FigmaConnector({
        figmaToken: config.figmaToken || process.env.FIGMA_ACCESS_TOKEN,
      });

      // 给 orchestrator 注入 figmaConnector 和生成方法
      orchestrator.figmaConnector = figmaConnector;

      // 注入单组件生成方法（直接使用 runPhase2Generation）
      // 注意：BatchOrchestrator.runSingleComponent 先检查 phase2Service.startGeneration 是否存在，
      // 存在才调用 startGenerationAndWait(...)。必须同时提供这两个方法，否则抛
      // "phase2Service 未提供有效的生成方法"。
      const runSingle = async (compSessionId: string, compDto: any, compGroupId: string) =>
        this.generateSingleComponent(compSessionId, compDto, compGroupId, params.userId, sessionId);
      orchestrator.phase2Service = {
        startGeneration: runSingle,
        startGenerationAndWait: runSingle,
      };

      // 执行页面级生成
      const results = await orchestrator.generate(fileKey, nodeId, groupId, config);

      // 完成任务：广播 complete 事件（前端据此结束生成并渲染结果），sendComplete 内部会 completeTask
      // ⚠️ 只传前端需要的精简字段——完整 result 含 checkResult/reviewResult/generatedFiles 等大对象，
      //    JSON.stringify 可能因体积过大或序列化异常导致 SSE 消息发送失败（sendEvent catch 只 warn 不中断），
      //    前端永远收不到 complete 事件，结果列表不显示。
      const summaryResults = results.map((r: any) => ({
        childSessionId: r.childSessionId,
        taskId: r.taskId || r.childSessionId,
        componentId: r.componentId || r.childSessionId,
        groupId: r.groupId || groupId,
        target: r.target || 'microcode',
        component: r.component,
        figmaNodeName: r.figmaNodeName,
        folderName: r.folderName,
        componentName: r.componentName,
        panelKey: r.panelKey,
        componentType: r.componentType,
        figmaNodeId: r.figmaNodeId,
        success: r.success,
        error: r.error,
        outputPath: r.outputPath,
        iterations: r.iterations,
        duration: r.duration,
      }));

      // 页面级 summary：区分全成功/部分失败/全失败
      const successCount = summaryResults.filter((r) => r.success).length;
      const failedCount = summaryResults.filter((r) => !r.success).length;
      const summary = failedCount === 0
        ? 'all_success'
        : successCount === 0
          ? 'all_failed'
          : 'partial_failure';

      this.progressService.sendComplete(sessionId, {
        results: summaryResults,
        totalComponents: results.length,
        successCount,
        failedCount,
        summary,
      });

      this.logger.log(`页面生成完成: ${results.filter((r: any) => r.success).length}/${results.length} 成功`);
    } catch (error) {
      this.logger.error(`页面生成失败: ${error.message}`, error.stack);
      // 广播 error 事件（前端据此结束转圈并提示失败），sendError 内部会 failTask
      this.progressService.sendError(sessionId, error);
    }
  }

  /**
   * 🆕 断点续跑：重新配置后重试失败任务
   * 自动检测产物文件跳过已完成阶段（figma/visual/analysis），仅重新执行代码生成+检查+修订
   */
  async retryGeneration(
    originalSessionId: string,
    config?: { model?: string; endpoint?: string; apiKey?: string },
    userId?: string,
  ) {
    const meta = this.tasksService.getRetryMetadata(originalSessionId, userId);
    if (!meta || 'error' in meta) {
      throw new Error((meta as any)?.error || '无法获取任务元数据');
    }

    const metadata = meta as ReturnType<typeof this.tasksService.getRetryMetadata> & {
      componentId: string;
      groupId?: string;
      fileKey: string;
      nodeId: string;
      componentName: string;
      target: string;
      panelKey: string;
    };

    // 生成新的 sessionId（重试会话）
    const { randomBytes } = await import('crypto');
    const retrySessionId = `retry-${Date.now()}-${randomBytes(4).toString('hex')}`;

    // 创建重试任务
    this.tasksService.createRetryTask(originalSessionId, retrySessionId, userId);

    this.logger.log(`断点续跑启动: original=${originalSessionId}, retry=${retrySessionId}`);

    // 异步执行重试
    this.executeRetry(retrySessionId, metadata, config, userId).catch((error) => {
      this.logger.error(`重试生成失败: ${error.message}`, error.stack);
      this.progressService.sendError(retrySessionId, error);
    });

    return {
      success: true,
      sessionId: retrySessionId,
      originalSessionId,
      message: '断点续跑已启动',
    };
  }

  /**
   * 🆕 执行断点续跑（内部方法）
   */
  private async executeRetry(
    retrySessionId: string,
    metadata: {
      componentId: string;
      groupId?: string;
      fileKey: string;
      nodeId: string;
      componentName: string;
      target: string;
      panelKey: string;
      outputPath?: string | null;
    },
    config?: { model?: string; endpoint?: string; apiKey?: string },
    userId?: string,
  ) {
    const {
      componentId,
      groupId,
      fileKey,
      nodeId,
      componentName,
      target,
      panelKey,
      outputPath: existingOutputPath,
    } = metadata;

    try {
      // 🆕 更新环境变量（如果提供了新配置）
      if (config?.apiKey) process.env.MC_GEN_TEXT_API_KEY = config.apiKey;
      if (config?.endpoint) process.env.MC_GEN_TEXT_ENDPOINT = config.endpoint;
      if (config?.model) process.env.MC_GEN_TEXT_MODEL = config.model;

      // 动态导入，并按原任务 target 选择生成图
      const aiDefaultsModule = await import('../ai-engine/utils/ai-defaults.js');
      const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;
      const runGeneration = target === 'vue3'
        ? (await import('../ai-engine/graphs/mc-component-graph-vue3.js')).runVue3Generation
        : (await import('../ai-engine/graphs/mc-component-graph-phase2.js')).runPhase2Generation;

      // 🔍 检测 checkpoint 文件，构建缓存数据
      const checkpointData: any = { stage: 'full' }; // 默认全量执行
      let detectedOutputPath = existingOutputPath;

      // 尝试找到 outputPath（如果原任务没有记录）
      if (!detectedOutputPath) {
        // 在 temp-components 中搜索
        const { globSync } = await import('glob');
        const candidates = globSync(`temp-components/**/${componentName}*/declare.json`, { cwd: projectRoot });
        if (candidates.length > 0) {
          detectedOutputPath = join(projectRoot, candidates[0].replace('/declare.json', ''));
        }
      }

      if (detectedOutputPath && existsSync(detectedOutputPath)) {
        const cpDir = join(detectedOutputPath, '.checkpoint');

        // Level 3: 代码已生成（跳过 figma + visual + analysis）
        if (existsSync(join(detectedOutputPath, 'package', 'index.vue'))) {
          checkpointData.stage = 'code-generated';
          checkpointData._uiCache = {};

          // 尝试加载 Figma 缓存
          const figmaCp = join(cpDir, 'figma.json');
          if (existsSync(figmaCp)) {
            try {
              const raw = readFileSync(figmaCp, 'utf-8');
              checkpointData._uiCache.figmaNodeData = JSON.parse(raw);
              this.logger.log('🔄 断点续跑: 已加载 Figma 缓存，跳过 Figma API 调用');
            } catch (e) { /* ignore */ }
          }

          // 尝试加载视觉分析缓存
          const visualCp = join(cpDir, 'visual.json');
          if (existsSync(visualCp)) {
            try {
              const raw = readFileSync(visualCp, 'utf-8');
              checkpointData._uiCache.previewAnalysis = JSON.parse(raw);
              this.logger.log('🔄 断点续跑: 已加载视觉分析缓存，跳过 Vision AI 调用');
            } catch (e) { /* ignore */ }
          }

          // 尝试加载分析缓存
          const analysisCp = join(cpDir, 'analysis.json');
          if (existsSync(analysisCp)) {
            try {
              const raw = readFileSync(analysisCp, 'utf-8');
              const analysisData = JSON.parse(raw);
              checkpointData._cachedReviewResult = analysisData.reviewResult;
              checkpointData._cachedStyleMappings = analysisData.styleMappings;
              this.logger.log('🔄 断点续跑: 已加载分析缓存，跳过 parallel-analysis');
            } catch (e) { /* ignore */ }
          }
        }
        // Level 2: Figma 数据已缓存
        else {
          const figmaCp = join(cpDir, 'figma.json');
          if (existsSync(figmaCp)) {
            checkpointData.stage = 'figma-cached';
            checkpointData._uiCache = {};
            try {
              const raw = readFileSync(figmaCp, 'utf-8');
              checkpointData._uiCache.figmaNodeData = JSON.parse(raw);
              this.logger.log('🔄 断点续跑: 已加载 Figma 缓存，跳过 Figma API 调用');
            } catch (e) { /* ignore */ }
          }
        }

        this.logger.log(`断点续跑 checkpoint 级别: ${checkpointData.stage}, outputPath: ${detectedOutputPath}`);
      }

      // 创建重试任务记录（用 retrySessionId）
      this.tasksService.createTask(retrySessionId, {
        componentId,
        groupId,
        componentName,
        nodeId,
        fileKey,
        target,
        outputPath: detectedOutputPath || join(tempComponentsDir, `retry-${retrySessionId}`, componentName),
        lastCompletedStage: checkpointData.stage || undefined,
        checkpointStatus: checkpointData.stage ? 'partial' : 'none',
        taskType: 'component',
        userId,
      });

      // 执行管线（传入 checkpoint 数据）
      const result = await runGeneration({
        componentName,
        fileKey,
        nodeId,
        outputPath: detectedOutputPath || join(tempComponentsDir, `retry-${retrySessionId}`, componentName),
        panelType: panelKey || 'aio-panel',
        target,
        figmaToken: process.env.FIGMA_ACCESS_TOKEN,
        visionAIConfig: resolveVisionConfig({}),
        textAIConfig: resolveTextConfig({}),
        aiConfig: {
          apiKey: process.env.MC_GEN_TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
          baseURL: process.env.MC_GEN_TEXT_ENDPOINT || process.env.ANTHROPIC_BASE_URL,
          model: process.env.MC_GEN_TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        },
        sessionId: retrySessionId,
        // 🆕 断点续跑数据
        uiCache: checkpointData._uiCache || null,
        _resumeData: {
          stage: checkpointData.stage,
          cachedReviewResult: checkpointData._cachedReviewResult || null,
          cachedStyleMappings: checkpointData._cachedStyleMappings || null,
        },
        onProgress: (data: any) => {
          this.progressService.sendProgress(retrySessionId, data);
        },
      });

      this.progressService.sendComplete(retrySessionId, {
        ...result,
        taskId: retrySessionId,
        componentId,
        groupId,
        target,
      });

      // 复制回原业务组件目录，避免 retry-* 被错误当成新组件号
      if (detectedOutputPath && componentName) {
        const hasEntry = existsSync(join(detectedOutputPath, 'package', 'index.vue'));
        if (hasEntry) {
          try {
            await this.copyToWorkspace(
              detectedOutputPath,
              componentId,
              target,
              groupId,
            );
          } catch (postErr: any) {
            this.logger.warn(`重试后复制到 workspace 失败: ${postErr.message}`);
          }
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`断点续跑执行失败: ${error.message}`, error.stack);
      this.progressService.sendError(retrySessionId, error);
      throw error;
    }
  }
  /**
   * 生成单个组件（复用 Phase2 管线）
   * 和 Phase2Service.executeGeneration 逻辑一致，但会推送组件级进度
   */
  private async generateSingleComponent(
    compSessionId: string,
    compDto: any,
    compGroupId: string,
    userId?: string,
    parentSessionId?: string,
  ) {
    const {
      componentName,
      fileKey,
      nodeId,
      componentId,
      panelType,
      target = 'microcode',
      config = {},
    } = compDto;

    // 生成输出路径
    // 🆕 A6修复：对齐 Phase2Service —— temp-components 位于项目根（cwd=backend/ 的上一级）。
    // 此前落在 backend/temp-components，与单组件管线产物链分裂。
    // 业务组件号固定为 compSessionId，确保任务映射、temp 产物和 workspace 一致。
    // DTO componentId 只是 Figma 子键，不能作为最终组件目录号。
    const folderName = componentName
      ? `${compSessionId}-${componentName}`
      : compSessionId;
    const tempRoot = join(
      tempComponentsDir,
      compGroupId,
      folderName,
    );
    const outputPath = config.outputPath || tempRoot;

    // 创建子任务记录（关联父任务）
    this.tasksService.createTask(compSessionId, {
      componentId: compSessionId,
      groupId: compGroupId,
      componentName,
      nodeId,
      fileKey,
      target,
      outputPath,
      checkpointStatus: 'none',
      taskType: 'component',
      parentId: parentSessionId,
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });

    try {
      // 按子任务 target 选择生成图
      const runGeneration = target === 'vue3'
        ? (await import('../ai-engine/graphs/mc-component-graph-vue3.js')).runVue3Generation
        : (await import('../ai-engine/graphs/mc-component-graph-phase2.js')).runPhase2Generation;

      // 动态导入配置工具
      const aiDefaultsModule = await import('../ai-engine/utils/ai-defaults.js');
      const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;

      const result = await runGeneration({
        componentName,
        fileKey,
        nodeId,
        outputPath,
        panelType: panelType || 'aio-panel',
        target,
        figmaToken: config.figmaToken || process.env.FIGMA_ACCESS_TOKEN,
        visionAIConfig: resolveVisionConfig(config),
        textAIConfig: resolveTextConfig(config),
        aiConfig: {
          apiKey: config.aiApiKey || process.env.ANTHROPIC_API_KEY,
          baseURL: config.aiBaseURL || process.env.ANTHROPIC_BASE_URL,
          model: config.aiModel || process.env.ANTHROPIC_MODEL,
        },
        onProgress: (data: any) => {
          // 推送组件级进度到子 session
          this.progressService.sendProgress(compSessionId, data);

          // 🆕 转发关键进度到页面级 session（仅关键阶段，避免消息洪泛）
          if (parentSessionId && data.stage) {
            const keyStages = ['complete', 'error', 'failed', 'figma-connector', 'visual-parser', 'microcode-engineer', 'code-structure-validator', 'adversarial-checker'];
            const isKey = keyStages.some(s => data.stage?.includes?.(s)) || data.status === 'failed' || data.status === 'warning';
            if (isKey) {
              this.progressService.sendProgress(parentSessionId, {
                type: 'progress',
                stage: `[${componentName}] ${data.stage}`,
                message: data.message || '',
                status: data.status || 'info',
                childSessionId: compSessionId,
                componentName,
                timestamp: Date.now(),
              });
            }
          }
        },
      });

      // 🆕 广播子组件级终态事件（sendComplete 内部会 completeTask 持久化并结束 SSE 连接），
      // 确保前端订阅该子组件 session 时能实时退出“生成中”。
      this.progressService.sendComplete(compSessionId, {
        ...result,
        taskId: compSessionId,
        componentId: compSessionId,
        groupId: compGroupId,
        target,
      });

      // 复制到 workspace（和 Phase2Service 一致）
      const hasEntry = existsSync(join(outputPath, 'package', 'index.vue'));
      if (outputPath && componentName && hasEntry) {
        try {
          if (target !== 'vue3') {
            await this.precompileCss(outputPath);
          }
          await this.copyToWorkspace(
            outputPath,
            compSessionId,
            target,
            compGroupId,
          );
        } catch (postErr: any) {
          // 预处理失败不应阻断（子组件仍可用，页面级进度由 orchestrator 统一处理）
          this.logger.warn(
            `Preview post-processing failed for ${compSessionId}: ${postErr.message}`,
          );
        }
      }

      return result;
    } catch (error) {
      // 🆕 子组件失败也广播终态，再向上抛出，由 executePageGeneration 统一广播页面级 error
      this.progressService.sendError(compSessionId, error);
      throw error;
    }
  }

  /**
   * 仅分析页面结构（不生成），返回组件列表
   */
  async analyzePage(fileKey: string, nodeId: string, config: any = {}) {
    // 获取 Figma 节点树
    const figmaModule = await import('../ai-engine/roles/figma-connector.js');
    const { FigmaConnector } = figmaModule;

    const figmaConnector = new FigmaConnector({
      figmaToken: config.figmaToken || process.env.FIGMA_ACCESS_TOKEN,
    });

    const nodeTree = await figmaConnector.fetchNodeData(fileKey, nodeId);

    if (!nodeTree) {
      throw new Error('Figma API 返回数据为空（节点可能不存在或无权限访问）');
    }

    // fetchNodeData 已返回 document 节点本体，无需再取 .document
    const decomposerModule = await import('../ai-engine/utils/page-decomposer.js');
    const { findCpComponents } = decomposerModule;

    return findCpComponents(nodeTree);
  }

  // 以下两个方法从 Phase2Service 复制过来
  private async precompileCss(outputPath: string) {
    // 同 Phase2Service 的逻辑
    try {
      const { exec } = require('child_process');
      const lessEntry = join(outputPath, 'resources', 'styles', 'index.less');
      const cssOutput = join(outputPath, 'resources', 'styles', 'index.css');

      if (existsSync(lessEntry)) {
        exec(`lessc "${lessEntry}" "${cssOutput}"`, (error: any) => {
          if (error) {
            this.logger.warn(`LESS 编译失败: ${error.message}`);
          }
        });
      }
    } catch (error) {
      this.logger.warn(`CSS 预编译跳过: ${error.message}`);
    }
  }

  private async copyToWorkspace(
    outputPath: string,
    componentId: string,
    target: string = 'microcode',
    groupId?: string,
  ) {
    try {
      const { cp, mkdir, writeFile } = require('fs/promises');
      if (target === 'vue3' && !groupId) {
        throw new Error('Vue3 组件复制缺少 groupId');
      }
      const resolvedGroupId = groupId || '';
      const packageDir = join(outputPath, 'package');
      const syntaxErrors = validateVueSfcDirectory(packageDir);
      if (syntaxErrors.length > 0) {
        throw new Error(`拒绝复制不可编译页面组件产物: ${syntaxErrors.slice(0, 5).join('; ')}`);
      }

      const backendWsPath = target === 'vue3'
        ? join(vue3ComponentsDir, resolvedGroupId, componentId)
        : join(customComponentsDir, componentId);
      const frontendWsPath = target === 'vue3'
        ? join(resolveFrontendWorkspace(), 'vue3-components', resolvedGroupId, componentId)
        : join(resolveFrontendWorkspace(), 'custom-components', componentId);

      for (const targetPath of [backendWsPath, frontendWsPath]) {
        await mkdir(targetPath, { recursive: true });

        if (target === 'vue3') {
          await cp(join(outputPath, 'package'), join(targetPath, 'package'), { recursive: true });
          const resourcesDir = join(outputPath, 'resources');
          if (existsSync(resourcesDir)) {
            await cp(resourcesDir, join(targetPath, 'resources'), { recursive: true });
          }
          continue;
        }

        await cp(outputPath, targetPath, {
          recursive: true,
          filter: (src: string) => !src.endsWith('index.html'),
        });

        const hasCss = existsSync(join(outputPath, 'resources', 'styles', 'index.css'));
        const hasLess = existsSync(join(outputPath, 'resources', 'styles', 'index.less'));
        const styleImport = hasCss
          ? "import './resources/styles/index.css'"
          : hasLess
            ? "import './resources/styles/index.less'"
            : '// No CSS/LESS file found';
        const componentJs = `import component from './package/index.vue'
${styleImport}
export default component
`;
        await writeFile(join(targetPath, 'component.js'), componentJs, 'utf-8');
      }

      this.logger.log(
        `组件已复制到 workspace（backend+frontend）: ${componentId} (${target})`,
      );
    } catch (error) {
      this.logger.warn(`复制到 workspace 失败: ${error.message}`);
    }
  }
}
