export declare const HANDLER_REGISTRY: {
    'figma-connector': {
        label: string;
        description: string;
        category: string;
        configSchema: {
            model: {
                type: string;
                label: string;
                default: string;
            };
            temperature: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
        };
    };
    'visual-parser': {
        label: string;
        description: string;
        category: string;
        configSchema: {
            model: {
                type: string;
                label: string;
                default: string;
            };
            temperature: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
        };
    };
    'layout-reviewer': {
        label: string;
        description: string;
        category: string;
        configSchema: {
            model: {
                type: string;
                label: string;
                default: string;
            };
            temperature: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
        };
    };
    'style-mapper': {
        label: string;
        description: string;
        category: string;
        configSchema: {
            model: {
                type: string;
                label: string;
                default: string;
            };
            temperature: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
        };
    };
    'microcode-engineer': {
        label: string;
        description: string;
        category: string;
        configSchema: {
            model: {
                type: string;
                label: string;
                default: string;
            };
            temperature: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
            maxTokens: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
        };
    };
    'adversarial-checker': {
        label: string;
        description: string;
        category: string;
        configSchema: {
            model: {
                type: string;
                label: string;
                default: string;
            };
            temperature: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
        };
    };
    'doc-analyzer': {
        label: string;
        description: string;
        category: string;
        configSchema: {
            model: {
                type: string;
                label: string;
                default: string;
            };
            temperature: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
        };
    };
    'config-generator': {
        label: string;
        description: string;
        category: string;
        configSchema: {
            model: {
                type: string;
                label: string;
                default: string;
            };
            temperature: {
                type: string;
                label: string;
                default: number;
                min: number;
                max: number;
                help: string;
            };
        };
    };
};
export declare const NODE_TYPES: {
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
