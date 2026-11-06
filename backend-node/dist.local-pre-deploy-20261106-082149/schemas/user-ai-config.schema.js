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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserAiConfigSchema = exports.UserAiConfig = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const field_encryption_1 = require("../common/crypto/field-encryption");
let UserAiConfig = class UserAiConfig {
    userId;
    configEnc;
    verifiedModels;
};
exports.UserAiConfig = UserAiConfig;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, unique: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], UserAiConfig.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: null }),
    __metadata("design:type", Object)
], UserAiConfig.prototype, "configEnc", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], UserAiConfig.prototype, "verifiedModels", void 0);
exports.UserAiConfig = UserAiConfig = __decorate([
    (0, mongoose_1.Schema)({ collection: 'user_ai_configs', timestamps: true })
], UserAiConfig);
exports.UserAiConfigSchema = mongoose_1.SchemaFactory.createForClass(UserAiConfig);
exports.UserAiConfigSchema.virtual('config')
    .get(function () {
    if (this.configEnc == null)
        return {};
    try {
        return JSON.parse((0, field_encryption_1.decryptField)(this.configEnc));
    }
    catch (e) {
        console.error(`[UserAiConfig] configEnc 解密失败(userId=${this.userId}): ${e instanceof Error ? e.message : e}. 请检查 FIELD_ENCRYPTION_KEY 是否与写入时一致。`);
        return {};
    }
})
    .set(function (val) {
    this.configEnc =
        val && Object.keys(val ?? {}).length ? (0, field_encryption_1.encryptField)(JSON.stringify(val)) : null;
});
exports.UserAiConfigSchema.set('toJSON', { virtuals: true });
exports.UserAiConfigSchema.set('toObject', { virtuals: true });
//# sourceMappingURL=user-ai-config.schema.js.map