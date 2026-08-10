"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ComponentAnalysisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentAnalysisService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const component_service_1 = require("./component.service");
const config_service_1 = require("../config/config.service");
let ComponentAnalysisService = ComponentAnalysisService_1 = class ComponentAnalysisService {
    componentService;
    aiConfigService;
    logger = new common_1.Logger(ComponentAnalysisService_1.name);
    constructor(componentService, aiConfigService) {
        this.componentService = componentService;
        this.aiConfigService = aiConfigService;
    }
    async analyzeComponent(componentId, userId, config = {}) {
        const authorized = await this.componentService.authorizeWorkspaceComponent(componentId, userId, 'read');
        const resolvedComponentId = authorized.componentId;
        const target = authorized.target || 'microcode';
        const groupId = authorized.groupId || 'default-group';
        const fileRecord = authorized.component;
        const metadata = fileRecord?.metadata || {};
        const figmaFileKey = metadata.figmaFileKey;
        const figmaNodeId = metadata.figmaNodeId;
        if (!figmaFileKey || !figmaNodeId) {
            throw new common_1.BadRequestException('当前组件缺少 Figma 元数据，无法执行 AI 对比分析');
        }
        const figmaPreviewPath = await this.resolveFigmaPreviewPath(resolvedComponentId, userId);
        if (!figmaPreviewPath || !(0, fs_1.existsSync)(figmaPreviewPath)) {
            throw new common_1.BadRequestException('未找到标准 Figma 预览图 resources/images/mc-preview.png');
        }
        const outputPath = await this.resolveAnalysisOutputPath(resolvedComponentId, userId);
        const screenshotDir = (0, path_1.join)(outputPath, '.mc-gen', 'analysis');
        await (0, promises_1.rm)(screenshotDir, { recursive: true, force: true }).catch(() => undefined);
        await (0, promises_1.mkdir)(screenshotDir, { recursive: true });
        try {
            const { renderScreenshot } = await import('../ai-engine/roles/screenshot-renderer.js');
            const renderResult = await renderScreenshot({
                outputPath,
                sessionId: resolvedComponentId,
                componentName: fileRecord?.name || resolvedComponentId,
                target,
                groupId,
                previewImage: figmaPreviewPath,
                hardGate: true,
                allowMissingAssetSelfHeal: false,
            });
            const runtimeGate = renderResult?.runtimeGate || { status: 'BLOCK', issues: [] };
            const runtimeSummary = this.summarizeRuntimeIssues(runtimeGate.issues || []);
            let visualReport = null;
            if (renderResult?.renderedImage && runtimeGate.status === 'PASS') {
                const visionConfig = this.resolveVisionConfig(config);
                if (!visionConfig.apiKey) {
                    throw new common_1.BadRequestException('缺少视觉模型配置，无法执行图片对比分析');
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
                    name: fileRecord?.name || resolvedComponentId,
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
        }
        catch (error) {
            this.logger.error(`组件对比分析失败: ${error.message}`, error.stack);
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException(`组件对比分析失败: ${error.message}`);
        }
    }
    async resolveFigmaPreviewPath(componentId, userId) {
        const candidates = [
            'resources/images/mc-preview.png',
            'package/resources/images/mc-preview.png',
        ];
        for (const candidate of candidates) {
            try {
                const resolved = await this.componentService.resolveComponentFilePath(componentId, candidate, userId);
                if (resolved && (0, fs_1.existsSync)(resolved)) {
                    return resolved;
                }
            }
            catch {
            }
        }
        return null;
    }
    async resolveAnalysisOutputPath(componentId, userId) {
        const primaryCandidates = ['package/index.vue'];
        for (const candidate of primaryCandidates) {
            try {
                const fullPath = await this.componentService.resolveComponentFilePath(componentId, candidate, userId);
                if (fullPath) {
                    return fullPath.replace(/\/package\/index\.vue$/, '');
                }
            }
            catch {
            }
        }
        throw new common_1.BadRequestException('无法定位组件工作目录，分析终止');
    }
    resolveVisionConfig(config) {
        const saved = this.aiConfigService.getAiConfig() || {};
        return {
            apiKey: this.pick(config.visionApiKey, saved.visionApiKey, saved.unifiedApiKey) || undefined,
            baseURL: this.pick(config.visionBaseURL, saved.visionBaseURL, saved.unifiedBaseURL) || undefined,
            model: this.pick(config.visionModel, saved.visionModel, saved.unifiedModel) || undefined,
        };
    }
    pick(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return '';
    }
    summarizeRuntimeIssues(issues) {
        if (!issues.length) {
            return '真实预览通过，未检测到运行时问题';
        }
        return issues
            .slice(0, 3)
            .map((issue) => `[${issue.id || 'UNKNOWN'}] ${issue.message || '未提供说明'}`)
            .join('；');
    }
    buildVisualSection(report) {
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
        const issues = Array.isArray(report.issues)
            ? report.issues.map((issue) => ({
                severity: issue.severity || 'medium',
                category: issue.category || 'layout',
                region: issue.region || '未指定区域',
                description: issue.description || '未提供描述',
                suggestion: issue.suggestion || '无具体建议',
            }))
            : [];
        return {
            available: true,
            overallSimilarity: typeof report.overallSimilarity === 'number' ? report.overallSimilarity : 0,
            pass: !!report.pass,
            summary: this.buildVisualSummary(report.overallSimilarity, issues),
            issues,
        };
    }
    buildVisualSummary(similarity, issues) {
        const score = Number.isFinite(similarity) ? similarity : 0;
        if (!issues.length) {
            return `视觉相似度 ${score}，未发现需要报告的差异`;
        }
        const highCount = issues.filter((issue) => issue.severity === 'high').length;
        const mediumCount = issues.filter((issue) => issue.severity === 'medium').length;
        return `视觉相似度 ${score}，发现 ${issues.length} 个差异，其中高优 ${highCount} 个，中优 ${mediumCount} 个`;
    }
    buildRecommendation(runtimeStatus, runtimeIssues, visualReport) {
        if (runtimeStatus !== 'PASS') {
            return {
                nextStep: '先修复运行时问题，再重新执行 AI 对比分析',
                rationale: this.summarizeRuntimeIssues(runtimeIssues),
            };
        }
        const visualIssues = Array.isArray(visualReport?.issues)
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
};
exports.ComponentAnalysisService = ComponentAnalysisService;
exports.ComponentAnalysisService = ComponentAnalysisService = ComponentAnalysisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [component_service_1.ComponentService,
        config_service_1.AiConfigService])
], ComponentAnalysisService);
//# sourceMappingURL=component-analysis.service.js.map