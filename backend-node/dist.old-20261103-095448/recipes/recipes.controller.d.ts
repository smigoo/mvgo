import { RecipesService } from './recipes.service';
export declare class RecipesController {
    private readonly recipesService;
    constructor(recipesService: RecipesService);
    list(): Promise<any[]>;
    get(name: string): Promise<any>;
    save(dto: any, userId?: string): Promise<{
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
