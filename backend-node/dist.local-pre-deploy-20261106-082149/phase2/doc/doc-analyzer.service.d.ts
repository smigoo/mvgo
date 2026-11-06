export interface AnalyzeDocDto {
    document: string;
    source?: 'upload' | 'paste' | 'file';
    aiConfig?: {
        textApiKey?: string;
        textBaseURL?: string;
        textModel?: string;
    };
}
export interface AnalyzeDocResult {
    success: boolean;
    analysis: any;
    fromCache: boolean;
    llmUsed: string[];
    degraded: boolean;
}
export declare class DocAnalyzerService {
    private readonly logger;
    private readonly cache;
    private readonly CACHE_TTL;
    analyzeDocument(dto: AnalyzeDocDto): Promise<AnalyzeDocResult>;
    private buildInvokeLLM;
}
