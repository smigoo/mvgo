export declare class AnalyzeFromDocDto {
    componentId: string;
    groupId: string;
    catalogId: string;
    requirementsDoc: string;
    aiConfig?: {
        textApiKey?: string;
        textBaseURL?: string;
        textModel?: string;
    };
}
