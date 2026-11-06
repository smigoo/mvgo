import type { Response } from 'express';
import { McSpecService } from './mc-spec.service';
import { AdminService } from '../admin/admin.service';
export declare class McSpecController {
    private readonly svc;
    private readonly adminService;
    constructor(svc: McSpecService, adminService: AdminService);
    listSkills(): Promise<{
        success: boolean;
        skills: import("./mc-spec.service").McSpecSkillMeta[];
    }>;
    check(body: Record<string, any>, userId: string): Promise<{
        success: boolean;
        userId: string;
        result: import("./mc-spec.service").McSpecCheckResult;
    }>;
    uploadSkill(file: any, body: Record<string, any>, userId: string): Promise<{
        success: boolean;
        skill: import("./mc-spec.service").McSpecSkillMeta;
    }>;
    removeSkill(skillId: string, userId: string): Promise<{
        removed: boolean;
        skillId: string;
        success: boolean;
    }>;
    scoreQuality(body: Record<string, any>, userId: string): Promise<{
        success: boolean;
        result: any;
    }>;
    readQuality(componentId: string, userId: string): Promise<{
        success: boolean;
        result: {
            componentDir: any;
            componentId: string;
            quality: any;
        };
    }>;
    fixQuality(body: Record<string, any>, userId: string): Promise<{
        success: boolean;
        result: {
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
        };
    }>;
    report(componentId: string, stamp: string, res: Response): Promise<void>;
}
