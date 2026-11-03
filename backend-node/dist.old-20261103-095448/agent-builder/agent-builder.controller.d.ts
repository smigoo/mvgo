import { AgentBuilderService } from './agent-builder.service';
export declare class AgentBuilderController {
    private readonly agentBuilderService;
    constructor(agentBuilderService: AgentBuilderService);
    upload(file: any): Promise<{
        success: boolean;
        data?: import("./agent-builder.service").AgentReferenceFile;
        error?: string;
    }>;
    create(dto: any, userId?: string): Promise<{
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
    feedback(body: any, userId?: string): Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;
    test(body: any): Promise<{
        ok: boolean;
        data?: any;
        error?: string;
    }>;
    list(): Promise<any[]>;
    templates(): {
        success: boolean;
        data: {
            tool: {
                id: any;
                label: any;
                description: any;
                resources: any;
            }[];
            llm: {
                id: any;
                label: any;
                description: any;
                resources: any;
            }[];
        };
    };
    remove(name: string, userId?: string): Promise<{
        success: boolean;
    }>;
}
