"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiConfigController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const config_service_1 = require("./config.service");
const config_test_service_1 = require("./config-test.service");
const user_ai_config_service_1 = require("./user-ai-config.service");
const tasks_service_1 = require("../tasks/tasks.service");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const session_guard_1 = require("../auth/session.guard");
const model_config_js_1 = require("../ai-engine/utils/model-config.js");
function modelBindKey(apiKey, baseURL, model) {
    return (0, node_crypto_1.createHash)('sha256')
        .update(`${baseURL}|${apiKey}|${model}`)
        .digest('hex');
}
let AiConfigController = class AiConfigController {
    svc;
    testSvc;
    userAiConfigService;
    tasksService;
    constructor(svc, testSvc, userAiConfigService, tasksService) {
        this.svc = svc;
        this.testSvc = testSvc;
        this.userAiConfigService = userAiConfigService;
        this.tasksService = tasksService;
    }
    async getAi(userId) {
        const config = await this.svc.getUserMergedConfig(userId);
        return { success: true, config };
    }
    async saveAi(body, session, userId) {
        const action = body?.action || 'save-current';
        let result;
        switch (action) {
            case 'save-current':
            default:
                result = { config: await this.svc.getUserMergedConfig(userId) };
                break;
        }
        const userBody = { ...(body || {}) };
        delete userBody.action;
        delete userBody.profiles;
        delete userBody.activeProfileId;
        delete userBody.name;
        delete userBody.profileId;
        delete userBody.config;
        userBody.binding = this.normalizeBinding(userBody.modelMode, userBody.binding);
        if (userId) {
            const gate = await this.enforceModelVerification(userBody, userId);
            if (gate) {
                return { success: false, error: gate.error, details: gate.details };
            }
        }
        let visionCheck = [];
        if (userId) {
            visionCheck = await this.detectVisionCapabilityOnSave(userBody);
            await this.userAiConfigService.saveUserConfig(userId, userBody);
        }
        const hasRunningTasks = this.tasksService.countActiveTasks(userId) > 0;
        return {
            success: true,
            appliesTo: 'next-run',
            hasRunningTasks,
            ...(visionCheck.length ? { visionCheck } : {}),
            ...(visionCheck.some((v) => v.vision !== true)
                ? {
                    visionWarnings: visionCheck
                        .filter((v) => v.vision !== true)
                        .map((v) => v.message),
                }
                : {}),
            ...result,
        };
    }
    normalizeBinding(mode, binding) {
        const emptySlot = () => ({ primaryId: '', poolIds: [] });
        const b = { ...(binding || {}) };
        if (mode === 'unified') {
            return {
                unified: {
                    primaryId: String(b?.unified?.primaryId || ''),
                    poolIds: Array.isArray(b?.unified?.poolIds) ? [...b.unified.poolIds] : [],
                },
                text: emptySlot(),
                vision: emptySlot(),
            };
        }
        return {
            text: {
                primaryId: String(b?.text?.primaryId || ''),
                poolIds: Array.isArray(b?.text?.poolIds) ? [...b.text.poolIds] : [],
            },
            vision: {
                primaryId: String(b?.vision?.primaryId || ''),
                poolIds: Array.isArray(b?.vision?.poolIds) ? [...b.vision.poolIds] : [],
            },
            unified: emptySlot(),
        };
    }
    async enforceModelVerification(cfg, userId) {
        const models = Array.isArray(cfg?.models) ? cfg.models : [];
        if (!models.length)
            return null;
        const verified = await this.userAiConfigService.getModelVerifications(userId);
        const mode = String(cfg?.modelMode || 'separate');
        const binding = cfg?.binding || {};
        const visionSlotIds = new Set(mode === 'unified'
            ? [
                ...(binding?.unified?.primaryId ? [String(binding.unified.primaryId)] : []),
                ...(Array.isArray(binding?.unified?.poolIds) ? binding.unified.poolIds : []).map(String),
            ]
            : [
                ...(binding?.vision?.primaryId ? [String(binding.vision.primaryId)] : []),
                ...(Array.isArray(binding?.vision?.poolIds) ? binding.vision.poolIds : []).map(String),
            ]);
        const details = [];
        for (const m of models) {
            const apiKey = String(m?.apiKey || '').trim();
            const baseURL = String(m?.baseURL || '').trim();
            const model = String(m?.model || '').trim();
            if (/\*{3,}/.test(apiKey))
                continue;
            const label = String(m?.name || '').trim() || model;
            if (!apiKey && !baseURL && !model && !label)
                continue;
            const rec = verified[modelBindKey(apiKey, baseURL, model)];
            if (!rec || (typeof rec.text !== 'boolean' && typeof rec.vision !== 'boolean')) {
                details.push(`「${label}」（${model}）尚未执行「自动识别能力」检测，请点击模型卡片内该按钮完成检测后再保存`);
                continue;
            }
            if (visionSlotIds.has(String(m?.id || '')) && rec.vision !== true) {
                details.push(`「${label}」（${model}）实测不支持视觉输入，不能挂到视觉/统一槽位；请更换支持视觉的模型，或把它改挂到「仅文本」槽位`);
            }
        }
        if (!details.length)
            return null;
        return {
            error: `保存被拦截：${details[0]}`,
            details,
        };
    }
    collectVisionRoleModels(cfg) {
        const models = Array.isArray(cfg?.models) ? cfg.models : [];
        const byId = new Map(models.map((m) => [String(m?.id || ''), m]));
        const out = [];
        const push = (id, slot) => {
            const entry = byId.get(String(id || ''));
            const name = String(entry?.model || '').trim();
            if (name)
                out.push({ name, slot, entry: entry || {} });
        };
        const binding = cfg?.binding || {};
        const mode = String(cfg?.modelMode || 'separate');
        if (mode === 'unified') {
            if (binding?.unified?.primaryId)
                push(binding.unified.primaryId, 'unified');
        }
        else {
            if (binding?.vision?.primaryId)
                push(binding.vision.primaryId, 'vision');
        }
        if (mode === 'unified' && cfg?.unifiedModel) {
            out.push({
                name: String(cfg.unifiedModel).trim(),
                slot: 'unified',
                entry: {
                    apiKey: cfg.unifiedApiKey,
                    baseURL: cfg.unifiedBaseURL,
                    providerType: cfg.unifiedProviderType,
                },
            });
        }
        if (mode !== 'unified' && cfg?.visionModel) {
            out.push({
                name: String(cfg.visionModel).trim(),
                slot: 'vision',
                entry: {
                    apiKey: cfg.visionApiKey,
                    baseURL: cfg.visionBaseURL,
                    providerType: cfg.visionProviderType,
                },
            });
        }
        const seen = new Set();
        return out.filter((m) => (seen.has(m.name) ? false : (seen.add(m.name), true)));
    }
    async detectVisionCapabilityOnSave(cfg) {
        const targets = this.collectVisionRoleModels(cfg);
        if (!targets.length)
            return [];
        return Promise.all(targets.map(async (t) => {
            const cap = (0, model_config_js_1.resolveVisionCapability)(t.name);
            if (cap.vision === true) {
                return {
                    model: t.name,
                    slot: t.slot,
                    vision: true,
                    message: `模型「${t.name}」视觉能力已检测：支持`,
                };
            }
            if (cap.vision === false) {
                return {
                    model: t.name,
                    slot: t.slot,
                    vision: false,
                    message: `模型「${t.name}」（${t.slot} 槽位）实测不支持视觉，配置已保存，但不能用它进行组件生成。` +
                        `该模型仍可用于纯文本任务；若要生成组件，请更换为支持视觉的模型，或把它改挂到「仅文本」槽位。`,
                };
            }
            const apiKey = String(t.entry?.apiKey || '');
            if (!apiKey || /\*{3,}/.test(apiKey)) {
                return {
                    model: t.name,
                    slot: t.slot,
                    vision: null,
                    message: `模型「${t.name}」视觉能力未检测（无可用密钥，可能是脱敏回传值），暂时不能用于组件生成。` +
                        `请到「设置 - 模型配置」点击「检测」完成识别。`,
                };
            }
            try {
                const r = await this.testSvc.testVisionLLM({
                    apiKey,
                    baseURL: String(t.entry?.baseURL || ''),
                    model: t.name,
                    providerType: t.entry?.providerType,
                    timeoutMs: 20000,
                });
                (0, model_config_js_1.markModelCapabilityIdentified)(t.name, {
                    source: 'save-gate',
                    vision: !!r?.success,
                });
                if (r?.success) {
                    return {
                        model: t.name,
                        slot: t.slot,
                        vision: true,
                        message: `模型「${t.name}」视觉能力检测通过：支持`,
                    };
                }
                return {
                    model: t.name,
                    slot: t.slot,
                    vision: false,
                    message: `模型「${t.name}」（${t.slot} 槽位）不支持视觉输入${r?.error ? `：${r.error}` : ''}。` +
                        `配置已保存，但不能用它进行组件生成；请更换为支持视觉的模型，或改挂到「仅文本」槽位。`,
                };
            }
            catch (e) {
                return {
                    model: t.name,
                    slot: t.slot,
                    vision: null,
                    message: `模型「${t.name}」视觉能力检测未完成（${e?.message || '未知错误'}），暂时不能用于组件生成。` +
                        `配置已保存，请稍后到「设置 - 模型配置」点击「检测」重试。`,
                };
            }
        }));
    }
    async testText(body) {
        const { apiKey, baseURL, model, temperature, providerType } = body || {};
        if (!apiKey || !baseURL || !model) {
            return { success: false, error: '请填写 API Key、Base URL 和 Model' };
        }
        const result = await this.testSvc.testTextLLM({ apiKey, baseURL, model, temperature, providerType });
        return { success: true, data: result };
    }
    async testVision(body) {
        const { apiKey, baseURL, model, temperature, providerType } = body || {};
        if (!apiKey || !baseURL || !model) {
            return { success: false, error: '请填写 API Key、Base URL 和 Model' };
        }
        const result = await this.testSvc.testVisionLLM({ apiKey, baseURL, model, temperature, providerType });
        return { success: true, data: result };
    }
    async testModelCapability(body, userId) {
        const { apiKey, baseURL, model, temperature, providerType } = body || {};
        if (!apiKey || !baseURL || !model) {
            return { success: false, error: '请填写 API Key、Base URL 和 Model' };
        }
        const result = await this.testSvc.testModelCapability({ apiKey, baseURL, model, temperature, providerType });
        if (userId) {
            await this.userAiConfigService.recordModelVerification(userId, modelBindKey(String(apiKey), String(baseURL), String(model)), { text: !!result?.text?.success, vision: !!result?.vision?.success });
        }
        return { success: true, data: result };
    }
    async testProvider(body, userId) {
        const { apiKey, baseURL, model, temperature, providerType } = body || {};
        if (!apiKey || !baseURL || !model) {
            return { success: false, error: '请填写 API Key、Base URL 和 Model' };
        }
        const [textResult, visionResult] = await Promise.all([
            this.testSvc.testTextLLM({ apiKey, baseURL, model, temperature, providerType }),
            this.testSvc.testVisionLLM({ apiKey, baseURL, model, temperature, providerType }),
        ]);
        if (userId) {
            await this.userAiConfigService.recordModelVerification(userId, modelBindKey(String(apiKey), String(baseURL), String(model)), { text: !!textResult?.success, vision: !!visionResult?.success });
        }
        return {
            success: textResult.success || visionResult.success,
            text: textResult,
            vision: visionResult,
        };
    }
    async testFigma(body) {
        const { token } = body || {};
        if (!token) {
            return {
                success: false,
                error: '请填写 Figma Token',
            };
        }
        return this.testSvc.testFigmaToken({ token });
    }
    async testApifox(body) {
        const { token } = body || {};
        if (!token) {
            return {
                success: false,
                error: '请填写 Apifox Token',
            };
        }
        return this.testSvc.testApifoxToken({ token });
    }
    async testGitlab(body) {
        const { token } = body || {};
        if (!token) {
            return {
                success: false,
                error: '请填写 GitLab Token',
            };
        }
        return this.testSvc.testGitlabToken({ token });
    }
};
exports.AiConfigController = AiConfigController;
__decorate([
    (0, common_1.Get)('ai'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "getAi", null);
__decorate([
    (0, common_1.Post)('ai'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Session)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "saveAi", null);
__decorate([
    (0, common_1.Post)('test-text'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "testText", null);
__decorate([
    (0, common_1.Post)('test-vision'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "testVision", null);
__decorate([
    (0, common_1.Post)('test-model-capability'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "testModelCapability", null);
__decorate([
    (0, common_1.Post)('test-provider'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "testProvider", null);
__decorate([
    (0, common_1.Post)('test-figma'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "testFigma", null);
__decorate([
    (0, common_1.Post)('test-apifox'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "testApifox", null);
__decorate([
    (0, common_1.Post)('test-gitlab'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiConfigController.prototype, "testGitlab", null);
exports.AiConfigController = AiConfigController = __decorate([
    (0, common_1.Controller)('config'),
    __metadata("design:paramtypes", [config_service_1.AiConfigService,
        config_test_service_1.ConfigTestService,
        user_ai_config_service_1.UserAiConfigService,
        tasks_service_1.TasksService])
], AiConfigController);
//# sourceMappingURL=config.controller.js.map