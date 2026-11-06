"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ChatAttachmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatAttachmentService = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const crypto_1 = require("crypto");
const ai_defaults_js_1 = require("../ai-engine/utils/ai-defaults.js");
const backend_root_js_1 = require("../config/backend-root.js");
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
]);
let ChatAttachmentService = ChatAttachmentService_1 = class ChatAttachmentService {
    logger = new common_1.Logger(ChatAttachmentService_1.name);
    async analyzeAttachments(attachments = [], options) {
        if (!Array.isArray(attachments) || attachments.length === 0) {
            return { summary: '', warnings: [], analyzedCount: 0 };
        }
        const warnings = [];
        const normalized = this.normalizeAttachments(attachments, warnings);
        if (normalized.length === 0) {
            return { summary: '', warnings, analyzedCount: 0 };
        }
        const requestId = (0, crypto_1.randomUUID)();
        const tempDir = (0, path_1.join)(backend_root_js_1.chatAttachmentsDir, options.componentId, requestId);
        try {
            await (0, promises_1.mkdir)(tempDir, { recursive: true });
            const { VisionAgent } = await import('../ai-engine/agents/vision-agent.js');
            const visionConfig = (0, ai_defaults_js_1.resolveVisionConfig)({
                visionApiKey: options.llmConfig?.apiKey,
                visionBaseURL: options.llmConfig?.baseURL,
                visionModel: options.llmConfig?.model,
            });
            const visionAgent = new VisionAgent(visionConfig);
            const summaries = [];
            for (let index = 0; index < normalized.length; index += 1) {
                const attachment = normalized[index];
                const imagePath = (0, path_1.join)(tempDir, `${index + 1}-${this.safeFileName(attachment.name)}.${attachment.extension}`);
                await (0, promises_1.writeFile)(imagePath, attachment.buffer);
                try {
                    const summary = await visionAgent.analyzeImage(imagePath, this.buildPrompt(index + 1, attachment));
                    summaries.push(`### 截图 ${index + 1}: ${attachment.name}\n${summary}`);
                }
                catch (error) {
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
        }
        finally {
            await (0, promises_1.rm)(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }
    normalizeAttachments(attachments, warnings) {
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
    parseDataUrl(dataUrl) {
        const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
        if (!match)
            return null;
        try {
            return {
                mimeType: match[1],
                buffer: Buffer.from(match[2], 'base64'),
            };
        }
        catch {
            return null;
        }
    }
    extensionFromMime(mimeType) {
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg')
            return 'jpg';
        if (mimeType === 'image/webp')
            return 'webp';
        if (mimeType === 'image/gif')
            return 'gif';
        return 'png';
    }
    safeFileName(name) {
        return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/\.+/g, '.').slice(0, 80) || 'screenshot';
    }
    buildPrompt(index, attachment) {
        return `请分析这张 Playground 用户粘贴的截图，并输出结构化结果。\n\n## 截图信息\n- 序号：${index}\n- 文件名：${attachment.name}\n- 类型：${attachment.type}\n- 大小：${attachment.size} bytes\n\n## 输出要求\n请用中文返回以下结构，不要写无关寒暄：\n\n## 截图识别结果\n- 页面/区域：\n- 可见文字：\n- 用户可能关注的问题：\n- 视觉问题类型：布局 / 文案 / 状态 / 可访问性 / 交互 / 样式\n- 可能涉及的组件或文件：\n- 不确定项：\n- 建议给代码 Agent 的执行重点：\n\n## 判断规则\n1. 只描述截图中能直接观察到的信息，不要猜测看不见的业务逻辑。\n2. 如果截图显示的是错误、卡住、按钮不可用、布局异常、文案不清晰，请明确指出。\n3. 如果截图内容不足以判断，请在“不确定项”说明需要用户补充什么。`;
    }
};
exports.ChatAttachmentService = ChatAttachmentService;
exports.ChatAttachmentService = ChatAttachmentService = ChatAttachmentService_1 = __decorate([
    (0, common_1.Injectable)()
], ChatAttachmentService);
//# sourceMappingURL=chat-attachment.service.js.map