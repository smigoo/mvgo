export interface SlimComponentTask {
    userId?: string;
    taskType?: string;
    target?: string;
    status?: string;
    startTime?: number;
    duration?: number;
    textModel?: string;
    visionModel?: string;
}
export interface SlimApiTask {
    ownerId?: string;
    createdAt?: string;
    apiCount?: number;
}
export declare function slimTaskModels(obj: any): {
    textModel?: string;
    visionModel?: string;
};
export declare function slimDuration(obj: any): number | undefined;
export declare function readJsonArrayObjects<T>(filePath: string, map: (obj: any) => T): Promise<T[]>;
export declare function loadSlimComponentTasks(): Promise<SlimComponentTask[]>;
export declare function loadSlimApiTasks(): SlimApiTask[];
