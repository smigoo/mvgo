"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var AiConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiConfigService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const CONFIG_FILE = path.resolve(process.cwd(), 'data', 'ai-config.json');
const numberField = (min, max) => zod_1.z.preprocess((value) => {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return undefined;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
}, zod_1.z.number().int().min(min).max(max).optional());
const stringField = zod_1.z
    .preprocess((value) => {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'string')
        return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}, zod_1.z.string().optional());
const AI_CONFIG_BASE_SCHEMA = {
    figmaToken: stringField,
    apifoxToken: stringField,
    textApiKey: stringField,
    textBaseURL: stringField,
    textModel: stringField,
    visionApiKey: stringField,
    visionBaseURL: stringField,
    visionModel: stringField,
    unifiedApiKey: stringField,
    unifiedBaseURL: stringField,
    unifiedModel: stringField,
    modelMode: zod_1.z
        .preprocess((value) => {
        if (value === undefined || value === null)
            return undefined;
        if (typeof value !== 'string')
            return value;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }, zod_1.z.enum(['text', 'vision', 'unified', 'separate']).optional()),
    outputPath: stringField,
    requestConcurrency: numberField(1, 10),
    requestQueueTimeoutMs: numberField(1_000, 300_000),
    requestTimeoutMs: numberField(10_000, 900_000),
    requestMaxRetries: numberField(0, 5),
};
const AI_CONFIG_SCHEMA = zod_1.z.object(AI_CONFIG_BASE_SCHEMA).strict();
const TASK_CONFIG_SNAPSHOT_SCHEMA = zod_1.z
    .object({
    ...AI_CONFIG_BASE_SCHEMA,
    target: zod_1.z.enum(['microcode', 'vue3']).optional(),
    panelType: stringField,
})
    .strict();
const AI_CONFIG_DEFAULTS = {
    requestConcurrency: 2,
    requestQueueTimeoutMs: 120_000,
    requestTimeoutMs: 300_000,
    requestMaxRetries: 1,
};
let AiConfigService = AiConfigService_1 = class AiConfigService {
    logger = new common_1.Logger(AiConfigService_1.name);
    getAiConfig() {
        try {
            return this.applyDefaults(this.readRawConfig());
        }
        catch (e) {
            this.logger.warn(`[AiConfigService] 读取 AI 配置失败: ${e.message}`);
            return this.applyDefaults({});
        }
    }
    saveAiConfig(input) {
        try {
            const existing = this.readRawConfig();
            const patch = this.normalizeConfigInput(input || {}, '保存 AI 配置');
            const merged = this.applyDefaults({
                ...existing,
                ...patch,
            });
            this.atomicWrite(merged);
            this.logger.log('[AiConfigService] AI 配置已保存到服务端 (data/ai-config.json)');
            return merged;
        }
        catch (e) {
            this.logger.error(`[AiConfigService] 保存 AI 配置失败: ${e.message}`);
            throw e;
        }
    }
    buildTaskConfigSnapshot(input = {}) {
        const existing = this.getAiConfig();
        const patch = this.normalizeTaskSnapshotInput(input || {}, '构建任务配置快照');
        return {
            ...this.applyDefaults({
                ...existing,
                ...patch,
            }),
            ...(patch.target ? { target: patch.target } : {}),
            ...(patch.panelType ? { panelType: patch.panelType } : {}),
        };
    }
    readRawConfig() {
        if (!fs.existsSync(CONFIG_FILE))
            return {};
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        if (!raw.trim())
            return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        return this.normalizeConfigInput(parsed, '读取 AI 配置');
    }
    normalizeConfigInput(input, scene) {
        return this.safeParseSchema(AI_CONFIG_SCHEMA, input, scene);
    }
    normalizeTaskSnapshotInput(input, scene) {
        return this.safeParseSchema(TASK_CONFIG_SNAPSHOT_SCHEMA, input, scene);
    }
    safeParseSchema(schema, input, scene) {
        const result = schema.safeParse(input || {});
        if (!result.success) {
            const message = result.error.issues
                .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
                .join('; ');
            throw new common_1.BadRequestException(`${scene}失败，配置字段不合法：${message}`);
        }
        return result.data;
    }
    applyDefaults(config) {
        return {
            ...AI_CONFIG_DEFAULTS,
            ...config,
        };
    }
    atomicWrite(config) {
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const tmpFile = `${CONFIG_FILE}.${process.pid}.${Date.now()}.${Math.random()
            .toString(16)
            .slice(2)}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8');
        fs.renameSync(tmpFile, CONFIG_FILE);
    }
};
exports.AiConfigService = AiConfigService;
exports.AiConfigService = AiConfigService = AiConfigService_1 = __decorate([
    (0, common_1.Injectable)()
], AiConfigService);
//# sourceMappingURL=config.service.js.map