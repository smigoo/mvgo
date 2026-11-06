"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MicrocodeDocService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicrocodeDocService = void 0;
const common_1 = require("@nestjs/common");
let MicrocodeDocService = MicrocodeDocService_1 = class MicrocodeDocService {
    logger = new common_1.Logger(MicrocodeDocService_1.name);
    async generateConfigs(document) {
        this.logger.log('开始生成文档配置...');
        try {
            const { DocAnalyzerAgent } = await import('../ai-engine/agents/doc-analyzer-agent.js');
            const { ConfigGeneratorAgent } = await import('../ai-engine/agents/config-generator-agent.js');
            this.logger.log('步骤 1/2：分析文档内容...');
            const analyzer = new DocAnalyzerAgent();
            const analysisResult = await analyzer.analyze(document);
            this.logger.log(`文档分析完成：提取到 ${analysisResult.pageElements?.length || 0} 个页面元素、${analysisResult.interactions?.length || 0} 个交互`);
            this.logger.log('步骤 2/2：生成配置章节...');
            const generator = new ConfigGeneratorAgent();
            const configs = await generator.generate(analysisResult, document);
            this.logger.log('配置章节生成完成');
            const merged = this.mergeDocument(document, configs);
            return {
                success: true,
                configs,
                merged,
            };
        }
        catch (error) {
            this.logger.error(`生成配置失败: ${error.message}`, error.stack);
            return {
                success: false,
                error: error.message || '生成配置失败',
            };
        }
    }
    mergeDocument(originalDoc, configs) {
        let doc = originalDoc;
        const sectionMarkers = [
            '## businessEvents',
            '## 业务事件（businessEvents）',
            '## businessStatuses',
            '## 业务状态（businessStatuses）',
            '## businessConfig',
            '## 业务配置（businessConfig）',
            '## cssVariableConfig',
            '## CSS变量配置（cssVariableConfig）',
        ];
        for (const marker of sectionMarkers) {
            const idx = doc.indexOf(marker);
            if (idx !== -1) {
                const nextIdx = doc.indexOf('\n## ', idx + 1);
                doc =
                    doc.substring(0, idx).trimEnd() +
                        (nextIdx !== -1 ? '\n\n' + doc.substring(nextIdx).trimStart() : '');
            }
        }
        const sections = [];
        if (configs.businessEvents?.trim()) {
            sections.push(`## 业务事件（businessEvents）\n\n${configs.businessEvents.trim()}`);
        }
        if (configs.businessStatuses?.trim()) {
            sections.push(`## 业务状态（businessStatuses）\n\n${configs.businessStatuses.trim()}`);
        }
        if (configs.businessConfig?.trim()) {
            sections.push(`## 业务配置（businessConfig）\n\n${configs.businessConfig.trim()}`);
        }
        if (configs.cssVariableConfig?.trim()) {
            sections.push(`## CSS变量配置（cssVariableConfig）\n\n${configs.cssVariableConfig.trim()}`);
        }
        if (sections.length > 0) {
            doc = doc.trimEnd() + '\n\n---\n\n' + sections.join('\n\n---\n\n');
        }
        return doc;
    }
};
exports.MicrocodeDocService = MicrocodeDocService;
exports.MicrocodeDocService = MicrocodeDocService = MicrocodeDocService_1 = __decorate([
    (0, common_1.Injectable)()
], MicrocodeDocService);
//# sourceMappingURL=microcode-doc.service.js.map