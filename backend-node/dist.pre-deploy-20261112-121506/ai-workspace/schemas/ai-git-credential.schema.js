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
exports.AiGitCredentialSchema = exports.AiGitCredential = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const field_encryption_1 = require("../../common/crypto/field-encryption");
let AiGitCredential = class AiGitCredential {
    userId;
    type;
    tokenEnc;
    description;
};
exports.AiGitCredential = AiGitCredential;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AiGitCredential.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'pat' }),
    __metadata("design:type", String)
], AiGitCredential.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: null }),
    __metadata("design:type", Object)
], AiGitCredential.prototype, "tokenEnc", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], AiGitCredential.prototype, "description", void 0);
exports.AiGitCredential = AiGitCredential = __decorate([
    (0, mongoose_1.Schema)({ collection: 'ai_git_credentials', timestamps: true })
], AiGitCredential);
exports.AiGitCredentialSchema = mongoose_1.SchemaFactory.createForClass(AiGitCredential);
exports.AiGitCredentialSchema.virtual('token')
    .get(function () {
    if (this.tokenEnc == null)
        return '';
    try {
        return (0, field_encryption_1.decryptField)(this.tokenEnc);
    }
    catch {
        return '';
    }
})
    .set(function (val) {
    this.tokenEnc = val ? (0, field_encryption_1.encryptField)(val) : null;
});
exports.AiGitCredentialSchema.set('toJSON', { virtuals: true });
exports.AiGitCredentialSchema.set('toObject', { virtuals: true });
//# sourceMappingURL=ai-git-credential.schema.js.map