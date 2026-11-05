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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AiConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiConfigService = exports.AI_CONFIG_SCHEMA = void 0;
exports.resolveBindingToLegacy = resolveBindingToLegacy;
exports.migrateLegacyToModels = migrateLegacyToModels;
const common_1 = require("@nestjs/common");
const user_ai_config_service_1 = require("./user-ai-config.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const backend_root_1 = require("./backend-root");
const figma_token_projection_1 = require("./figma-token-projection");
const CONFIG_FILE = path.resolve(backend_root_1.dataDir, 'ai-config.json');
const numericField = (min, max, integer = false) => zod_1.z.preprocess((value) => {
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
}, (integer ? zod_1.z.number().int() : zod_1.z.number()).min(min).max(max).optional());
const numberField = (min, max) => numericField(min, max, false);
const temperatureField = numericField(0, 2);
const stringField = zod_1.z
    .preprocess((value) => {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'string')
        return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}, zod_1.z.string().optional());
const MODEL_ENTRY_SCHEMA = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: stringField,
    apiKey: stringField,
    baseURL: stringField,
    model: stringField,
    providerType: zod_1.z
        .preprocess((value) => (value === undefined || value === null || value === '' ? undefined : value), zod_1.z.enum(['openai-compatible', 'anthropic', 'auto']).optional()),
    capability: zod_1.z
        .preprocess((value) => (value === undefined || value === null || value === '' ? undefined : value), zod_1.z.enum(['both', 'text', 'vision']).optional()),
    verified: zod_1.z.boolean().optional(),
    temperature: temperatureField,
    rpm: numberField(0, 1_000_000),
    tpm: numberField(0, 1_000_000_000),
    weight: numberField(0, 10_000),
});
const SLOT_BINDING_SCHEMA = zod_1.z.object({
    primaryId: stringField,
    poolIds: zod_1.z.array(zod_1.z.string()).optional(),
});
const AI_CONFIG_BASE_SCHEMA = {
    figmaToken: stringField,
    figmaTokens: zod_1.z
        .preprocess((value) => (Array.isArray(value) ? value : undefined), zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        name: stringField,
        token: stringField,
    }))
        .max(figma_token_projection_1.MAX_FIGMA_TOKENS)
        .optional()),
    activeFigmaTokenId: stringField,
    apifoxToken: stringField,
    gitlabToken: stringField,
    textApiKey: stringField,
    textBaseURL: stringField,
    textModel: stringField,
    visionApiKey: stringField,
    visionBaseURL: stringField,
    visionModel: stringField,
    unifiedApiKey: stringField,
    unifiedBaseURL: stringField,
    unifiedModel: stringField,
    visionTemperature: temperatureField,
    textTemperature: temperatureField,
    unifiedTemperature: temperatureField,
    modelMode: zod_1.z
        .preprocess((value) => {
        if (value === undefined || value === null)
            return undefined;
        if (typeof value !== 'string')
            return value;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }, zod_1.z.enum(['text', 'vision', 'unified', 'separate']).optional()),
    textProviderType: zod_1.z
        .preprocess((value) => {
        if (value === undefined || value === null)
            return undefined;
        if (typeof value !== 'string')
            return value;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }, zod_1.z.enum(['openai-compatible', 'anthropic', 'auto']).optional()),
    visionProviderType: zod_1.z
        .preprocess((value) => {
        if (value === undefined || value === null)
            return undefined;
        if (typeof value !== 'string')
            return value;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }, zod_1.z.enum(['openai-compatible', 'anthropic', 'auto']).optional()),
    unifiedProviderType: zod_1.z
        .preprocess((value) => {
        if (value === undefined || value === null)
            return undefined;
        if (typeof value !== 'string')
            return value;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }, zod_1.z.enum(['openai-compatible', 'anthropic', 'auto']).optional()),
    outputPath: stringField,
    requestConcurrency: numberField(1, 10),
    requestQueueTimeoutMs: numberField(1_000, 300_000),
    requestTimeoutMs: numberField(10_000, 900_000),
    requestMaxRetries: numberField(0, 5),
    providers: zod_1.z
        .preprocess((value) => (Array.isArray(value) ? value : undefined), zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        apiKey: stringField,
        name: stringField,
        baseURL: stringField,
        model: stringField,
        providerType: zod_1.z
            .preprocess((value) => (value === undefined || value === null || value === '' ? undefined : value), zod_1.z.enum(['openai-compatible', 'anthropic', 'auto']).optional()),
        role: zod_1.z
            .preprocess((value) => (value === undefined || value === null || value === '' ? undefined : value), zod_1.z.enum(['text', 'vision', 'both']).optional()),
        rpm: numberField(0, 1_000_000),
        tpm: numberField(0, 1_000_000_000),
        weight: numberField(0, 10_000),
        temperature: temperatureField,
    }))
        .optional()),
    circuitBreaker: zod_1.z
        .object({
        failureThreshold: numberField(0, 100),
        cooldownMs: numberField(0, 3_600_000),
    })
        .optional(),
    pickStrategy: zod_1.z
        .preprocess((value) => {
        if (value === undefined || value === null)
            return undefined;
        if (typeof value !== 'string')
            return value;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }, zod_1.z.enum(['primary-first', 'weighted-spread']).optional()),
    models: zod_1.z
        .preprocess((value) => (Array.isArray(value) ? value : undefined), zod_1.z.array(MODEL_ENTRY_SCHEMA).optional()),
    binding: zod_1.z
        .object({
        unified: SLOT_BINDING_SCHEMA.optional(),
        text: SLOT_BINDING_SCHEMA.optional(),
        vision: SLOT_BINDING_SCHEMA.optional(),
    })
        .optional(),
};
const AI_CONFIG_PROFILE_SCHEMA = {
    profiles: zod_1.z
        .preprocess((value) => (Array.isArray(value) ? value : undefined), zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        name: stringField,
        config: zod_1.z.object(AI_CONFIG_BASE_SCHEMA).passthrough().optional(),
    }))
        .optional()),
    activeProfileId: stringField,
    lastModifiedBy: stringField,
    updatedAt: stringField,
};
exports.AI_CONFIG_SCHEMA = zod_1.z
    .object({ ...AI_CONFIG_BASE_SCHEMA, ...AI_CONFIG_PROFILE_SCHEMA })
    .strict();
const TASK_CONFIG_SNAPSHOT_SCHEMA = zod_1.z
    .object({
    ...AI_CONFIG_BASE_SCHEMA,
    target: zod_1.z.enum(['microcode', 'vue3']).optional(),
    panelType: stringField,
    skipNodes: zod_1.z.array(zod_1.z.string()).optional(),
})
    .strict();
const AI_CONFIG_DEFAULTS = {
    requestConcurrency: 4,
    requestQueueTimeoutMs: 120_000,
    requestTimeoutMs: 300_000,
    requestMaxRetries: 1,
};
let AiConfigService = AiConfigService_1 = class AiConfigService {
    userAiConfigService;
    logger = new common_1.Logger(AiConfigService_1.name);
    constructor(userAiConfigService) {
        this.userAiConfigService = userAiConfigService;
    }
    getAiConfig() {
        try {
            const raw = this.readRawConfig();
            const { activeProfile } = this.resolveProfiles(raw);
            return this.applyDefaults(this.normalizeConfigInput(activeProfile.config || {}, '读取 AI 配置'));
        }
        catch (e) {
            this.logger.warn(`[AiConfigService] 读取 AI 配置失败: ${e.message}`);
            return this.applyDefaults({});
        }
    }
    resolveProfiles(raw) {
        let profiles = raw?.profiles;
        let activeProfileId = raw?.activeProfileId;
        if (!Array.isArray(profiles) || !profiles.length) {
            const { profiles: _p, activeProfileId: _a, lastModifiedBy: _l, updatedAt: _u, ...flat } = raw || {};
            profiles = [{ id: 'default', name: '默认配置', config: flat }];
            activeProfileId = 'default';
        }
        const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
        return { profiles, activeProfileId: activeProfile.id, activeProfile };
    }
    async getMergedAiConfig(userId) {
        let userCfg = {};
        if (userId) {
            try {
                const u = await this.userAiConfigService.getUserConfig(userId);
                userCfg = u || {};
            }
            catch (e) {
                this.logger.warn(`[AiConfigService] 读取用户 AI 配置失败(${userId}): ${e.message}`);
                userCfg = {};
            }
        }
        const merged = {};
        Object.assign(merged, userCfg);
        Object.assign(merged, (0, figma_token_projection_1.applyFigmaTokenProjection)(merged));
        if (merged.modelMode === 'unified') {
            for (const role of ['vision', 'text']) {
                merged[`${role}ApiKey`] = merged.unifiedApiKey;
                merged[`${role}BaseURL`] = merged.unifiedBaseURL;
                merged[`${role}Model`] = merged.unifiedModel;
                merged[`${role}ProviderType`] = merged.unifiedProviderType;
                merged[`${role}Temperature`] = merged.unifiedTemperature;
            }
        }
        const result = resolveBindingToLegacy(merged);
        if (Object.keys(userCfg).length > 0 && !Array.isArray(result.providers)) {
            result.providers = [];
        }
        return result;
    }
    async getUserMergedConfig(userId) {
        const merged = await this.getMergedAiConfig(userId);
        const withModels = migrateLegacyToModels(merged);
        return (0, figma_token_projection_1.materializeFigmaTokenSlots)(withModels);
    }
    buildTaskConfigSnapshot(input = {}) {
        const existing = this.getAiConfig();
        const patch = this.normalizeTaskSnapshotInput(input || {}, '构建任务配置快照');
        return resolveBindingToLegacy({
            ...this.applyDefaults({
                ...existing,
                ...patch,
            }),
            ...(patch.target ? { target: patch.target } : {}),
            ...(patch.panelType ? { panelType: patch.panelType } : {}),
        });
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
        return this.safeParseSchema(exports.AI_CONFIG_SCHEMA, input, scene);
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
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_ai_config_service_1.UserAiConfigService])
], AiConfigService);
function resolveBindingToLegacy(config) {
    const cfg = { ...config };
    const models = Array.isArray(cfg.models) ? cfg.models : [];
    if (!models.length)
        return cfg;
    const binding = cfg.binding || {};
    const hasAnyBinding = ['unified', 'text', 'vision'].some((s) => binding[s]?.primaryId);
    if (!hasAnyBinding)
        return cfg;
    const byId = new Map();
    for (const m of models)
        if (m && m.id)
            byId.set(m.id, m);
    const toTemp = (v) => v !== undefined && v !== null && v !== '' ? Number(v) : undefined;
    const applyPrimary = (slot) => {
        const b = cfg.binding?.[slot];
        if (!b?.primaryId)
            return;
        const m = byId.get(b.primaryId);
        if (!m)
            return;
        cfg[`${slot}ApiKey`] = m.apiKey ?? '';
        cfg[`${slot}BaseURL`] = m.baseURL ?? '';
        cfg[`${slot}Model`] = m.model ?? '';
        cfg[`${slot}ProviderType`] = m.providerType || 'auto';
        cfg[`${slot}Temperature`] = toTemp(m.temperature);
    };
    const buildPoolProviders = (slot, role) => {
        const b = cfg.binding?.[slot];
        const ids = Array.isArray(b?.poolIds) ? b.poolIds : [];
        return ids
            .map((id) => byId.get(id))
            .filter((m) => !!m)
            .map((m) => ({
            id: m.id,
            name: m.name,
            apiKey: m.apiKey,
            baseURL: m.baseURL,
            model: m.model,
            providerType: m.providerType || 'auto',
            role,
            ...(toTemp(m.temperature) !== undefined ? { temperature: toTemp(m.temperature) } : {}),
            ...(m.rpm !== undefined ? { rpm: Number(m.rpm) } : {}),
            ...(m.tpm !== undefined ? { tpm: Number(m.tpm) } : {}),
            ...(m.weight !== undefined ? { weight: Number(m.weight) } : {}),
        }));
    };
    if (cfg.modelMode === 'unified') {
        applyPrimary('unified');
        cfg.providers = buildPoolProviders('unified', 'both');
    }
    else {
        applyPrimary('text');
        applyPrimary('vision');
        cfg.providers = [
            ...buildPoolProviders('text', 'text'),
            ...buildPoolProviders('vision', 'vision'),
        ];
    }
    return cfg;
}
function migrateLegacyToModels(config) {
    const cfg = { ...config };
    if (Array.isArray(cfg.models) && cfg.models.length)
        return cfg;
    const models = [];
    const binding = {};
    const toEntry = (prefix, capability) => {
        const temp = cfg[`${prefix}Temperature`];
        return {
            id: `legacy-${prefix}`,
            name: prefix === 'unified' ? '主模型' : prefix === 'text' ? '文本模型' : '视觉模型',
            apiKey: cfg[`${prefix}ApiKey`] ?? '',
            baseURL: cfg[`${prefix}BaseURL`] ?? '',
            model: cfg[`${prefix}Model`] ?? '',
            providerType: cfg[`${prefix}ProviderType`] || 'auto',
            capability,
            ...(temp !== undefined && temp !== null && temp !== '' ? { temperature: Number(temp) } : {}),
        };
    };
    const providerToEntry = (p) => {
        const role = p.role || 'both';
        return {
            id: p.id || `legacy-provider-${models.length}`,
            name: p.name,
            apiKey: p.apiKey ?? '',
            baseURL: p.baseURL ?? '',
            model: p.model ?? '',
            providerType: p.providerType || 'auto',
            capability: role === 'text' ? 'text' : role === 'vision' ? 'vision' : 'both',
            ...(p.temperature !== undefined ? { temperature: Number(p.temperature) } : {}),
            ...(p.rpm !== undefined ? { rpm: Number(p.rpm) } : {}),
            ...(p.tpm !== undefined ? { tpm: Number(p.tpm) } : {}),
            ...(p.weight !== undefined ? { weight: Number(p.weight) } : {}),
        };
    };
    const providers = Array.isArray(cfg.providers) ? cfg.providers : [];
    if (cfg.modelMode === 'unified') {
        const primary = toEntry('unified', 'both');
        models.push(primary);
        const poolIds = [];
        for (const p of providers) {
            const entry = providerToEntry(p);
            models.push(entry);
            poolIds.push(entry.id);
        }
        binding.unified = { primaryId: primary.id, poolIds };
    }
    else {
        const textPrimary = toEntry('text', 'text');
        const visionPrimary = toEntry('vision', 'vision');
        models.push(textPrimary, visionPrimary);
        const textPool = [];
        const visionPool = [];
        for (const p of providers) {
            const role = p.role || 'both';
            const entry = providerToEntry(p);
            if (!models.some((m) => m.id === entry.id))
                models.push(entry);
        }
        binding.text = { primaryId: textPrimary.id, poolIds: textPool };
        binding.vision = { primaryId: visionPrimary.id, poolIds: visionPool };
    }
    cfg.models = models;
    cfg.binding = binding;
    return cfg;
}
//# sourceMappingURL=config.service.js.map