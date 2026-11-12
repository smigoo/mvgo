export declare class McpApiKeyDto {
    method: string;
    path: string;
}
export declare class McpAddApifoxDto {
    catalogId: string;
    apifoxProjectId: string;
    moduleName: string;
    apifoxToken?: string;
    refresh?: boolean;
    keys?: McpApiKeyDto[];
    ownerId?: string;
}
