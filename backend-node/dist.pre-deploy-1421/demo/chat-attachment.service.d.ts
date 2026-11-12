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
export declare class ChatAttachmentService {
    private readonly logger;
    analyzeAttachments(attachments: ChatAttachment[] | undefined, options: {
        componentId: string;
        llmConfig?: {
            apiKey?: string;
            baseURL?: string;
            model?: string;
        };
    }): Promise<AttachmentAnalysisResult>;
    private normalizeAttachments;
    private parseDataUrl;
    private extensionFromMime;
    private safeFileName;
    private buildPrompt;
}
