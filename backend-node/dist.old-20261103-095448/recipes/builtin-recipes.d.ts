export interface BuiltinRecipe {
    name: string;
    label: string;
    description: string;
    scenario: string;
    source: 'builtin';
    workflow: {
        entryNode: string;
        nodes: any[];
        edges: any[];
    };
}
export declare const BUILTIN_RECIPES: BuiltinRecipe[];
