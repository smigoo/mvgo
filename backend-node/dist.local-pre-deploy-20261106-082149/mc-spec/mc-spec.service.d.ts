export interface McSpecSkillMeta {
    id: string;
    name: string;
    builtin: boolean;
    available: boolean;
    description?: string;
    version?: string;
    uploadedAt?: string;
}
export interface McSpecItem {
    id: string;
    name: string;
    level: string;
    passed: boolean;
    message: string;
}
export interface McSpecCheckResult {
    specVersion: string;
    checkedAt: string;
    componentId: string;
    dirName: string;
    passCount: number;
    failCount: number;
    warningCount: number;
    canRelease: boolean;
    items: McSpecItem[];
    errors: McSpecItem[];
    warnings: McSpecItem[];
    reportUrl?: string;
    skillId: string;
}
export declare class McSpecService {
    private readonly logger;
    private readonly builtinSkillsDir;
    private readonly userSkillsDir;
    private readonly reportsDir;
    private static readonly ENTRY_REL;
    private entryOf;
    private resolveSkillDir;
    listSkills(): McSpecSkillMeta[];
    private readSkillMeta;
    private readInstalledAt;
    private safeEntryParts;
    installSkillFromZip(buffer: Buffer, opts?: {
        skillId?: string;
        overwrite?: boolean;
        fileName?: string;
    }): Promise<McSpecSkillMeta>;
    removeSkill(skillId: string): {
        removed: boolean;
        skillId: string;
    };
    checkComponent(componentId: string, skillId?: string): Promise<McSpecCheckResult>;
    resolveReportPath(componentId: string, stamp: string): string | null;
    scoreQualityV1(componentId: string, opts?: {
        persist?: boolean;
    }): Promise<any>;
    private persistQualityToReplicas;
    readQualityV1(componentId: string): Promise<{
        componentDir: any;
        componentId: string;
        quality: any;
    }>;
    fixQualityIssues(componentId: string, options?: {
        dimensions?: string[];
    }): Promise<{
        componentId: string;
        fixed: never[];
        summary: {
            code008: number;
            themeVarMismatch: number;
            code025Warn: number;
            styleColor: number;
            styleNumeric: number;
        };
        message: string;
        unfixable?: undefined;
        newQuality?: undefined;
    } | {
        componentId: string;
        fixed: any[];
        unfixable: any[];
        summary: any;
        newQuality: any;
        message?: undefined;
    }>;
    private hasStyleFixable;
}
