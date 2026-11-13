export declare const HANDLER_REGISTRY: {
    'figma-connector': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
    'hello-agent': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {
            greeting: {
                type: string;
                label: string;
                default: string;
                help: string;
            };
        };
    };
    'url-parser-agent': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {};
    };
    'layout-refiner': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {};
    };
    'style-refiner': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {};
    };
    'layout-style-refiner': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {};
    };
    'vue3-engineer': {
        label: string;
        description: string;
        category: string;
        configSchema: {};
    };
    'screenshot-renderer': {
        label: string;
        description: string;
        category: string;
        configSchema: {};
    };
    'visual-comparator': {
        label: string;
        description: string;
        category: string;
        configSchema: {};
    };
    'subcomponent-planner': {
        label: string;
        description: string;
        category: string;
        configSchema: {};
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
export declare const SKILL_REGISTRY: {
    'figma-connector': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
        inputs: string[];
        outputs: string[];
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
    'hello-agent': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {
            greeting: {
                type: string;
                label: string;
                default: string;
                help: string;
            };
        };
    };
    'url-parser-agent': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {};
    };
    'layout-refiner': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {};
    };
    'style-refiner': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {};
    };
    'layout-style-refiner': {
        label: string;
        description: string;
        category: string;
        inputs: string[];
        outputs: string[];
        configSchema: {};
    };
    'vue3-engineer': {
        label: string;
        description: string;
        category: string;
        configSchema: {};
    };
    'screenshot-renderer': {
        label: string;
        description: string;
        category: string;
        configSchema: {};
    };
    'visual-comparator': {
        label: string;
        description: string;
        category: string;
        configSchema: {};
    };
    'subcomponent-planner': {
        label: string;
        description: string;
        category: string;
        configSchema: {};
    };
};
