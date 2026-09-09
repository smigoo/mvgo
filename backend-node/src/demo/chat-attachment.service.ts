import { Injectable, Logger } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { resolveVisionConfig } from '../ai-engine/utils/ai-defaults.js';
import { chatAttachmentsDir } from '../config/backend-root.js';

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export interface ChatAttachment {
  name?: string;
  type?: string;
  size?: number;
  dataUrl?: string;
}

export interface AttachmentAnalysisResult {
  summary: string;
  warnings: string[];
  analyzedCount: number;
}

interface NormalizedAttachment {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
  extension: string;
}

@Injectable()
export class ChatAttachmentService {
  private readonly logger = new Logger(ChatAttachmentService.name);

  async analyzeAttachments(
    attachments: ChatAttachment[] = [],
    options: {
      componentId: string;
      llmConfig?: { apiKey?: string; baseURL?: string; model?: string };
    },
  ): Promise<AttachmentAnalysisResult> {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return { summary: '', warnings: [], analyzedCount: 0 };
    }

    const warnings: string[] = [];
    const normalized = this.normalizeAttachments(attachments, warnings);
    if (normalized.length === 0) {
      return { summary: '', warnings, analyzedCount: 0 };
    }

    const requestId = randomUUID();
    const tempDir = join(chatAttachmentsDir, options.componentId, requestId);

    try {
      await mkdir(tempDir, { recursive: true });
      const { VisionAgent } = await import('../ai-engine/agents/vision-agent.js');
      const visionConfig = resolveVisionConfig({
        visionApiKey: options.llmConfig?.apiKey,
        visionBaseURL: options.llmConfig?.baseURL,
        visionModel: options.llmConfig?.model,
      });
      const visionAgent = new VisionAgent(visionConfig);
      const summaries: string[] = [];

      for (let index = 0; index < normalized.length; index += 1) {
        const attachment = normalized[index];
        const imagePath = join(tempDir, `${index + 1}-${this.safeFileName(attachment.name)}.${attachment.extension}`);
        await writeFile(imagePath, attachment.buffer);

        try {
          const summary = await visionAgent.analyzeImage(imagePath, this.buildPrompt(index + 1, attachment));
          summaries.push(`### 截图 ${index + 1}: ${attachment.name}\n${summary}`);
        } catch (error) {
          const message = `截图 ${index + 1} 分析失败：${error.message}`;
          warnings.push(message);
          this.logger.warn(message);
        }
      }

      return {
        summary: summaries.join('\n\n'),
        warnings,
        analyzedCount: summaries.length,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private normalizeAttachments(attachments: ChatAttachment[], warnings: string[]): NormalizedAttachment[] {
    return attachments.slice(0, MAX_ATTACHMENTS).flatMap((attachment, index) => {
      const parsed = this.parseDataUrl(attachment.dataUrl || '');
      if (!parsed) {
        warnings.push(`第 ${index + 1} 个附件不是有效图片 dataUrl，已跳过`);
        return [];
      }

      const type = attachment.type || parsed.mimeType;
      if (!ALLOWED_IMAGE_TYPES.has(type)) {
        warnings.push(`第 ${index + 1} 个附件类型 ${type} 不支持，已跳过`);
        return [];
      }

      if (parsed.buffer.length > MAX_ATTACHMENT_SIZE) {
        warnings.push(`第 ${index + 1} 个附件超过 5MB，已跳过`);
        return [];
      }

      return [{
        name: attachment.name || `screenshot-${index + 1}`,
        type,
        size: attachment.size || parsed.buffer.length,
        buffer: parsed.buffer,
        extension: this.extensionFromMime(type),
      }];
    });
  }

  private parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!match) return null;

    try {
      return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], 'base64'),
      };
    } catch {
      return null;
    }
  }

  private extensionFromMime(mimeType: string): string {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    return 'png';
  }

  private safeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/\.+/g, '.').slice(0, 80) || 'screenshot';
  }

  private buildPrompt(index: number, attachment: NormalizedAttachment): string {
    return `请分析这张 Playground 用户粘贴的截图，并输出结构化结果。\n\n## 截图信息\n- 序号：${index}\n- 文件名：${attachment.name}\n- 类型：${attachment.type}\n- 大小：${attachment.size} bytes\n\n## 输出要求\n请用中文返回以下结构，不要写无关寒暄：\n\n## 截图识别结果\n- 页面/区域：\n- 可见文字：\n- 用户可能关注的问题：\n- 视觉问题类型：布局 / 文案 / 状态 / 可访问性 / 交互 / 样式\n- 可能涉及的组件或文件：\n- 不确定项：\n- 建议给代码 Agent 的执行重点：\n\n## 判断规则\n1. 只描述截图中能直接观察到的信息，不要猜测看不见的业务逻辑。\n2. 如果截图显示的是错误、卡住、按钮不可用、布局异常、文案不清晰，请明确指出。\n3. 如果截图内容不足以判断，请在“不确定项”说明需要用户补充什么。`;
  }
}
