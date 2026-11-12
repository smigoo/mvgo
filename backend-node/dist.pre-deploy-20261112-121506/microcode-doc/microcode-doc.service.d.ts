export declare class MicrocodeDocService {
    private readonly logger;
    generateConfigs(document: string): Promise<{
        success: boolean;
        configs?: {
            businessEvents: string;
            businessStatuses: string;
            businessConfig: string;
            cssVariableConfig: string;
        };
        merged?: string;
        error?: string;
    }>;
    private mergeDocument;
}
