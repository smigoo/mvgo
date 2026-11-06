import { WorkflowService } from './workflow.service';
export declare class WorkflowController {
    private readonly workflowService;
    constructor(workflowService: WorkflowService);
    getMetaHandlers(): Promise<{
        success: boolean;
        data: {
            handlers: Record<string, any>;
            nodeTypes: {
                agent: {
                    label: string;
                    color: string;
                    description: string;
                };
                condition: {
                    label: string;
                    color: string;
                    description: string;
                };
                gate: {
                    label: string;
                    color: string;
                    description: string;
                };
                start: {
                    label: string;
                    color: string;
                    description: string;
                };
                end: {
                    label: string;
                    color: string;
                    description: string;
                };
            };
        };
    }>;
    getGraphTopology(type: string): {
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: string;
        data?: undefined;
    };
    listWorkflows(): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data?: undefined;
    }>;
    getNodeSnapshots(sessionId: string): any[];
    getWorkflow(name: string): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data?: undefined;
    }>;
    saveWorkflow(workflow: any): Promise<{
        success: boolean;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
    }>;
    loadWorkflow(body: {
        name: string;
    }): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data?: undefined;
    }>;
    deleteWorkflow(name: string): Promise<{
        success: boolean;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
    }>;
    runWorkflow(name: string, params: {
        componentName: string;
        fileKey: string;
        nodeId: string;
        config?: Record<string, any>;
    }, req: any): Promise<{
        success: boolean;
        error: string;
        sessionId?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        sessionId: string;
        message: string;
        error?: undefined;
    }>;
}
