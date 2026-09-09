import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { ComponentService } from './component.service';
import { AiConfigService } from '../config/config.service';

type AnalysisConfig = {
  visionApiKey?: string;
  visionBaseURL?: string;
  visionModel?: string;
};

type RuntimeIssue = {
  id?: string;
  severity?: string;
  category?: string;
  message?: string;
  evidence?: any;
};

type VisualIssue = {
  severity: 'high' | 'medium' | 'low';
  category: string;
  region: string;
  description: string;
  suggestion: string;
};

@Injectable()
export class ComponentAnalysisService {
  private readonly logger = new Logger(ComponentAnalysisService.name);

  constructor(
    private readonly componentService: ComponentService,
    private readonly aiConfigService: AiConfigService,
  ) {}

  async analyzeComponent(componentId: string, userId: string, config: AnalysisConfig = {}) {
    const authorized = await this.componentService.authorizeWorkspaceComponent(
      componentId,
      userId,
      'read',
    );

    const resolvedComponentId = authorized.componentId;
    const target = authorized.target || 'microcode';
    // 🆕 暂无分组概念时，按用户 uid 落到私人组（与 Lite/Phase2/Vue3 一致）
    const groupId = await this.componentService.resolvePrivateGroupId(authorized.groupId, userId);
    const fileRecord = authorized.component;
    const metadata = fileRecord?.metadata || {};
    const figmaFileKey = metadata.figmaFileKey || authorized.figmaFileKey;
    const figmaNodeId = metadata.figmaNodeId || authorized.figmaNodeId;
    const componentName = fileRecord?.name || authorized.componentName || resolvedComponentId;

    if (!figmaFileKey || !figmaNodeId) {
      throw new BadRequestException('当前组件缺少 Figma 元数据，无法执行 AI 对比分析');
    }

    const figmaPreviewPath = await this.resolveFigmaPreviewPath(resolvedComponentId, userId);
    if (!figmaPreviewPath || !existsSync(figmaPreviewPath)) {
      throw new BadRequestException('未找到标准 Figma 预览图 resources/images/mc-preview.png');
    }

    const outputPath = await this.resolveAnalysisOutputPath(resolvedComponentId, userId);
    const screenshotDir = join(outputPath, '.mc-gen', 'analysis');
    await rm(screenshotDir, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(screenshotDir, { recursive: true });

    try {
      const { renderScreenshot } = await import('../ai-engine/roles/screenshot-renderer.js');
      const renderResult = await renderScreenshot({
        outputPath,
        sessionId: resolvedComponentId,
        componentName,
        target,
        groupId,
        previewImage: figmaPreviewPath,
        hardGate: true,
        allowMissingAssetSelfHeal: false,
      });

      const runtimeGate = renderResult?.runtimeGate || { status: 'BLOCK', issues: [] };
      const runtimeSummary = this.summarizeRuntimeIssues(runtimeGate.issues || []);

      let visualReport: any = null;
      if (renderResult?.renderedImage && runtimeGate.status === 'PASS') {
        const visionConfig = this.resolveVisionConfig(config);
        if (!visionConfig.apiKey) {
          throw new BadRequestException('缺少视觉模型配置，无法执行图片对比分析');
        }
        const { VisualComparator } = await import('../ai-engine/roles/visual-comparator.js');
        const comparator = new VisualComparator(visionConfig);
        visualReport = await comparator.compare(figmaPreviewPath, renderResult.renderedImage);
      }

      return {
        success: true,
        component: {
          id: fileRecord?._id?.toString?.() || componentId,
          componentId: resolvedComponentId,
          name: componentName,
          target,
          groupId,
        },
        figma: {
          fileKey: figmaFileKey,
          nodeId: figmaNodeId,
          previewPath: 'resources/images/mc-preview.png',
        },
        runtime: {
          status: runtimeGate.status,
          pass: runtimeGate.status === 'PASS',
          summary: runtimeSummary,
          issues: runtimeGate.issues || [],
          previewUrl: runtimeGate.previewUrl || '',
        },
        visual: this.buildVisualSection(visualReport),
        recommendation: this.buildRecommendation(runtimeGate.status, runtimeGate.issues || [], visualReport),
      };
    } catch (error: any) {
      this.logger.error(`组件对比分析失败: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(`组件对比分析失败: ${error.message}`);
    }
  }

  private async resolveFigmaPreviewPath(componentId: string, userId: string): Promise<string | null> {
    const candidates = [
      'resources/images/mc-preview.png',
      'package/resources/images/mc-preview.png',
    ];

    for (const candidate of candidates) {
      try {
        const resolved = await this.componentService.resolveComponentFilePath(componentId, candidate, userId);
        if (resolved && existsSync(resolved)) {
          return resolved;
        }
      } catch {
        // continue
      }
    }

    return null;
  }

  private async resolveAnalysisOutputPath(componentId: string, userId: string): Promise<string> {
    const primaryCandidates = ['package/index.vue'];

    for (const candidate of primaryCandidates) {
      try {
        const fullPath = await this.componentService.resolveComponentFilePath(componentId, candidate, userId);
        if (fullPath) {
          return fullPath.replace(/\/package\/index\.vue$/, '');
        }
      } catch {
        // continue
      }
    }

    throw new BadRequestException('无法定位组件工作目录，分析终止');
  }

  private resolveVisionConfig(config: AnalysisConfig) {
    const saved = this.aiConfigService.getAiConfig() || {};
    return {
      apiKey:
        this.pick(config.visionApiKey, saved.visionApiKey, saved.unifiedApiKey) || undefined,
      baseURL:
        this.pick(config.visionBaseURL, saved.visionBaseURL, saved.unifiedBaseURL) || undefined,
      model:
        this.pick(config.visionModel, saved.visionModel, saved.unifiedModel) || undefined,
    };
  }

  private pick(...values: Array<string | undefined>) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  private summarizeRuntimeIssues(issues: RuntimeIssue[]) {
    if (!issues.length) {
      return '真实预览通过，未检测到运行时问题';
    }
    return issues
      .slice(0, 3)
      .map((issue) => `[${issue.id || 'UNKNOWN'}] ${issue.message || '未提供说明'}`)
      .join('；');
  }

  private buildVisualSection(report: any) {
    if (!report || report.degraded) {
      return {
        available: false,
        overallSimilarity: null,
        pass: false,
        summary: report?.error
          ? `视觉比对暂不可用：${report.error}`
          : '组件尚未通过真实预览门禁，未执行视觉比对',
        issues: [],
      };
    }

    const issues: VisualIssue[] = Array.isArray(report.issues)
      ? report.issues.map((issue: any) => ({
          severity: issue.severity || 'medium',
          category: issue.category || 'layout',
          region: issue.region || '未指定区域',
          description: issue.description || '未提供描述',
          suggestion: issue.suggestion || '无具体建议',
        }))
      : [];

    return {
      available: true,
      overallSimilarity:
        typeof report.overallSimilarity === 'number' ? report.overallSimilarity : 0,
      pass: !!report.pass,
      summary: this.buildVisualSummary(report.overallSimilarity, issues),
      issues,
    };
  }

  private buildVisualSummary(similarity: number, issues: VisualIssue[]) {
    const score = Number.isFinite(similarity) ? similarity : 0;
    if (!issues.length) {
      return `视觉相似度 ${score}，未发现需要报告的差异`;
    }
    const highCount = issues.filter((issue) => issue.severity === 'high').length;
    const mediumCount = issues.filter((issue) => issue.severity === 'medium').length;
    return `视觉相似度 ${score}，发现 ${issues.length} 个差异，其中高优 ${highCount} 个，中优 ${mediumCount} 个`;
  }

  private buildRecommendation(runtimeStatus: string, runtimeIssues: RuntimeIssue[], visualReport: any) {
    if (runtimeStatus !== 'PASS') {
      return {
        nextStep: '先修复运行时问题，再重新执行 AI 对比分析',
        rationale: this.summarizeRuntimeIssues(runtimeIssues),
      };
    }

    const visualIssues: VisualIssue[] = Array.isArray(visualReport?.issues)
      ? visualReport.issues
      : [];
    const highIssue = visualIssues.find((issue) => issue.severity === 'high');
    if (highIssue) {
      return {
        nextStep: '进入第二阶段前，先根据高优视觉差异做人工确认',
        rationale: `${highIssue.region} 存在高优差异：${highIssue.description}`,
      };
    }

    if ((visualReport?.overallSimilarity || 0) >= 85) {
      return {
        nextStep: '可以进入第二阶段“按分析优化”',
        rationale: '真实预览通过，且视觉相似度已达到基准线',
      };
    }

    return {
      nextStep: '建议先处理中低优视觉差异，再决定是否自动优化',
      rationale: this.buildVisualSummary(visualReport?.overallSimilarity || 0, visualIssues),
    };
  }
}
