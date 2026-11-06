export declare const PHASE2_TOPOLOGY: {
    name: string;
    label: string;
    description: string;
    isOriginal: boolean;
    entryNode: string;
    nodes: {
        id: string;
        label: string;
        type: string;
        handler: string;
        position: {
            x: number;
            y: number;
        };
        config: {};
    }[];
    edges: ({
        id: string;
        source: string;
        target: string;
        condition?: undefined;
        label?: undefined;
    } | {
        id: string;
        source: string;
        target: string;
        condition: string;
        label: string;
    })[];
};
export declare const VUE3_TOPOLOGY: {
    name: string;
    label: string;
    description: string;
    isOriginal: boolean;
    entryNode: string;
    nodes: {
        id: string;
        label: string;
        type: string;
        handler: string;
        position: {
            x: number;
            y: number;
        };
        config: {};
    }[];
    edges: ({
        id: string;
        source: string;
        target: string;
        condition?: undefined;
        label?: undefined;
    } | {
        id: string;
        source: string;
        target: string;
        condition: string;
        label: string;
    })[];
};
export declare const PAGE_GENERATION_TOPOLOGY: {
    name: string;
    label: string;
    description: string;
    isOriginal: boolean;
    entryNode: string;
    nodes: {
        id: string;
        label: string;
        type: string;
        handler: string;
        position: {
            x: number;
            y: number;
        };
        config: {};
    }[];
    edges: ({
        id: string;
        source: string;
        target: string;
        condition?: undefined;
        label?: undefined;
    } | {
        id: string;
        source: string;
        target: string;
        condition: string;
        label: string;
    })[];
};
export declare const APIFOX_GENERATION_TOPOLOGY: {
    name: string;
    label: string;
    description: string;
    isOriginal: boolean;
    entryNode: string;
    nodes: {
        id: string;
        label: string;
        type: string;
        handler: string;
        position: {
            x: number;
            y: number;
        };
        config: {};
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
    }[];
};
export declare const PROTECTED_WORKFLOW_NAMES: string[];
export declare function isProtectedWorkflow(name: string): boolean;
export declare const TOPOLOGY_MAP: Record<string, typeof PHASE2_TOPOLOGY>;
export declare function getAllOriginalTopologies(): {
    name: string;
    label: string;
    description: string;
    isOriginal: boolean;
    entryNode: string;
    nodes: {
        id: string;
        label: string;
        type: string;
        handler: string;
        position: {
            x: number;
            y: number;
        };
        config: {};
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
    }[];
}[];
