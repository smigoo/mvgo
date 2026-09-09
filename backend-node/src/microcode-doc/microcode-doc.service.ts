import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MicrocodeDocService {
  private readonly logger = new Logger(MicrocodeDocService.name);

  /**
   * 生成微码文档配置
   * 调用 DocAnalyzerAgent 分析文档 → ConfigGeneratorAgent 生成四个配置章节
   * → 合并回原始文档
   */
  async generateConfigs(document: string): Promise<{
    success: boolean;
    configs?: {
      businessEvents: string;
      businessStatuses: string;
      businessConfig: string;
      cssVariableConfig: string;
    };
    merged?: string;
    error?: string;
  }> {
    this.logger.log('开始生成文档配置...');

    try {
      // 动态导入 LangGraph Server 的 Agent（ESM 模块）
      const { DocAnalyzerAgent } = await import(
        '../ai-engine/agents/doc-analyzer-agent.js'
      );
      const { ConfigGeneratorAgent } = await import(
        '../ai-engine/agents/config-generator-agent.js'
      );

      // 第 1 步：分析文档
      this.logger.log('步骤 1/2：分析文档内容...');
      const analyzer = new DocAnalyzerAgent();
      const analysisResult = await analyzer.analyze(document);
      this.logger.log(
        `文档分析完成：提取到 ${analysisResult.pageElements?.length || 0} 个页面元素、${analysisResult.interactions?.length || 0} 个交互`,
      );

      // 第 2 步：生成配置
      this.logger.log('步骤 2/2：生成配置章节...');
      const generator = new ConfigGeneratorAgent();
      const configs = await generator.generate(analysisResult, document);
      this.logger.log('配置章节生成完成');

      // 第 3 步：合并到原始文档
      const merged = this.mergeDocument(document, configs);

      return {
        success: true,
        configs,
        merged,
      };
    } catch (error) {
      this.logger.error(`生成配置失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || '生成配置失败',
      };
    }
  }

  /**
   * 将生成的四个配置章节合并到原始文档中
   * 规则：在文档末尾追加配置章节（如果文档已有这些章节则替换）
   */
  private mergeDocument(
    originalDoc: string,
    configs: {
      businessEvents: string;
      businessStatuses: string;
      businessConfig: string;
      cssVariableConfig: string;
    },
  ): string {
    // 移除文档中可能已存在的旧配置章节
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
        // 找到下一个 ## 或文档结尾
        const nextIdx = doc.indexOf('\n## ', idx + 1);
        doc =
          doc.substring(0, idx).trimEnd() +
          (nextIdx !== -1 ? '\n\n' + doc.substring(nextIdx).trimStart() : '');
      }
    }

    // 追加新配置章节
    const sections: string[] = [];
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
}
