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
var UserAiConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserAiConfigService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const zod_1 = require("zod");
const user_ai_config_schema_1 = require("../schemas/user-ai-config.schema");
const field_encryption_1 = require("../common/crypto/field-encryption");
function aiConfigSchema() {
    return require('./config.service').AI_CONFIG_SCHEMA;
}
let UserAiConfigService = UserAiConfigService_1 = class UserAiConfigService {
    model;
    logger = new common_1.Logger(UserAiConfigService_1.name);
    constructor(model) {
        this.model = model;
    }
    async saveUserConfig(userId, input) {
        let parsed;
        try {
            parsed = aiConfigSchema().parse(input || {});
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                const message = err.issues
                    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
                    .join('; ');
                throw new common_1.BadRequestException(`保存用户 AI 配置失败，字段不合法：${message}`);
            }
            throw err;
        }
        await this.model
            .updateOne({ userId: new mongoose_2.Types.ObjectId(userId) }, { $set: { userId: new mongoose_2.Types.ObjectId(userId), configEnc: (0, field_encryption_1.encryptField)(JSON.stringify(parsed)) } }, { upsert: true })
            .exec();
        this.logger.log(`[UserAiConfigService] 已保存用户 ${userId} 的 AI 配置`);
    }
    async findAll() {
        return this.model.find().exec();
    }
    async getUserConfig(userId) {
        if (!userId)
            return null;
        try {
            const doc = await this.model
                .findOne({ userId: new mongoose_2.Types.ObjectId(userId) })
                .exec();
            return doc?.config || null;
        }
        catch (e) {
            this.logger.warn(`[UserAiConfigService] 读取用户 ${userId} 配置失败: ${e?.message || e}`);
            return null;
        }
    }
    async getModelVerifications(userId) {
        if (!userId)
            return {};
        try {
            const doc = await this.model
                .findOne({ userId: new mongoose_2.Types.ObjectId(userId) })
                .select('verifiedModels')
                .lean()
                .exec();
            return (doc?.verifiedModels || {});
        }
        catch (e) {
            this.logger.warn(`[UserAiConfigService] 读取用户 ${userId} 实测记录失败: ${e?.message || e}`);
            return {};
        }
    }
    async recordModelVerification(userId, bindKey, result) {
        if (!userId || !bindKey)
            return;
        try {
            await this.model
                .updateOne({ userId: new mongoose_2.Types.ObjectId(userId) }, {
                $set: {
                    [`verifiedModels.${bindKey}`]: {
                        text: !!result.text,
                        vision: !!result.vision,
                        at: Date.now(),
                    },
                },
            }, { upsert: true })
                .exec();
        }
        catch (e) {
            this.logger.warn(`[UserAiConfigService] 记录模型实测结论失败(userId=${userId}): ${e?.message || e}`);
        }
    }
};
exports.UserAiConfigService = UserAiConfigService;
exports.UserAiConfigService = UserAiConfigService = UserAiConfigService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_ai_config_schema_1.UserAiConfig.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], UserAiConfigService);
//# sourceMappingURL=user-ai-config.service.js.map