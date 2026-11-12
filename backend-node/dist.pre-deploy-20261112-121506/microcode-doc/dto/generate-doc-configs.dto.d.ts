export declare class GenerateDocConfigsDto {
    document: string;
}
export declare class GenerateDocConfigsResponse {
    success: boolean;
    configs?: {
        businessEvents: string;
        businessStatuses: string;
        businessConfig: string;
        cssVariableConfig: string;
    };
    merged?: string;
    error?: string;
}
