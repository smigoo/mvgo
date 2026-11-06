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
exports.AiSkillSchema = exports.AiSkill = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let AiSkill = class AiSkill {
    name;
    description;
    promptTemplate;
    type;
    visibility;
    ownerUserId;
    groupIds;
    status;
    sortOrder;
    reviewRequired;
    reviewedBy;
};
exports.AiSkill = AiSkill;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], AiSkill.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], AiSkill.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], AiSkill.prototype, "promptTemplate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'template' }),
    __metadata("design:type", String)
], AiSkill.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'all' }),
    __metadata("design:type", String)
], AiSkill.prototype, "visibility", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AiSkill.prototype, "ownerUserId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_2.Types.ObjectId], ref: 'Group', default: [] }),
    __metadata("design:type", Array)
], AiSkill.prototype, "groupIds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'active' }),
    __metadata("design:type", String)
], AiSkill.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], AiSkill.prototype, "sortOrder", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], AiSkill.prototype, "reviewRequired", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AiSkill.prototype, "reviewedBy", void 0);
exports.AiSkill = AiSkill = __decorate([
    (0, mongoose_1.Schema)({ collection: 'ai_skills', timestamps: true })
], AiSkill);
exports.AiSkillSchema = mongoose_1.SchemaFactory.createForClass(AiSkill);
exports.AiSkillSchema.index({ visibility: 1, status: 1 });
exports.AiSkillSchema.index({ sortOrder: 1 });
//# sourceMappingURL=ai-skill.schema.js.map