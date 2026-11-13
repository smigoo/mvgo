import { ToolContext } from './workbench-tools';
export declare function runWorkbenchLLM(params: {
    messages: Array<{
        role: string;
        content: string;
    }>;
    currentComponentId?: string;
    toolContext: ToolContext;
    llmConfig?: Record<string, any>;
}): Promise<{
    response: string;
    cards: any[];
    currentComponentId?: string;
}>;
