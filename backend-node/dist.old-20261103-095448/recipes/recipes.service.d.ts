export interface RecipeSaveDto {
    name: string;
    label: string;
    description?: string;
    scenario?: string;
    workflow: {
        entryNode: string;
        nodes: any[];
        edges: any[];
    };
}
export declare class RecipesService {
    private readonly logger;
    constructor();
    list(): Promise<any[]>;
    private pick;
    get(name: string): Promise<any>;
    saveRecipe(dto: RecipeSaveDto, userId?: string): Promise<{
        success: boolean;
        data: {
            name: any;
            label: any;
            description: any;
            scenario: any;
            source: any;
            author: any;
            version: any;
            nodeCount: any;
        };
    }>;
    remove(name: string, userId?: string): Promise<{
        success: boolean;
    }>;
}
