import { ToolContext } from './workbench-tools';
export interface WorkbenchAgentState {
    conversationId: string;
    userId: string;
    messages: AgentMessage[];
    currentComponentId?: string;
    toolContext: ToolContext;
    iteration: number;
    maxIterations: number;
    finalResponse?: string;
    finalCards?: any[];
    llmConfig?: Record<string, any>;
}
export interface AgentMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: ToolCall[];
    toolCallId?: string;
    cards?: any[];
    metadata?: Record<string, any>;
}
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}
export declare function runWorkbenchAgent(initialState: Partial<WorkbenchAgentState>): Promise<{
    response: string;
    cards: any[];
    currentComponentId?: string;
}>;
