export interface AgentReferenceFile {
    name: string;
    url: string;
    type: string;
    size: number;
}
export interface AgentCreateDto {
    name: string;
    label: string;
    description?: string;
    category?: string;
    logicType: 'tool' | 'llm';
    templateId: string;
    inputs?: Array<{
        key: string;
        type: string;
        required?: boolean;
    }>;
    outputs?: Array<{
        key: string;
        type: string;
    }>;
    params?: Record<string, any>;
    model?: string;
    referenceFiles?: AgentReferenceFile[];
}
export declare class AgentBuilderService {
    private readonly logger;
    constructor();
    private rebuildMissingRoles;
    uploadResource(file: any): Promise<{
        success: boolean;
        data?: AgentReferenceFile;
        error?: string;
    }>;
    private validateDef;
    renderCode(def: any): string;
    create(dto: AgentCreateDto, userId?: string): Promise<{
        success: boolean;
        data: {
            name: string;
            label: string;
            logicType: "tool" | "llm";
            modulePath: string;
            smoke: string;
            smokeDetail: {
                ok: boolean;
                error?: string;
                output?: any;
            };
        };
    }>;
    list(): Promise<any[]>;
    getDefinition(name: string): Promise<any>;
    remove(name: string, userId?: string): Promise<{
        success: boolean;
    }>;
    private validateSyntax;
    smokeTest(def: any): Promise<{
        ok: boolean;
        error?: string;
        output?: any;
    }>;
    testAgent(name: string, input?: Record<string, any>): Promise<{
        ok: boolean;
        data?: any;
        error?: string;
    }>;
    submitFeedback(body: any, userId?: string): Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;
    importDynamic(name: string): Promise<any>;
}
