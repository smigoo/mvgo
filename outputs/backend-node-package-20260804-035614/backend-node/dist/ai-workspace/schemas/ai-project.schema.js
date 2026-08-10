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
exports.AiProjectSchema = exports.AiProject = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let AiProject = class AiProject {
    name;
    description;
    gitUrl;
    gitBranch;
    gitDefaultPath;
    adminUserIds;
    authorizedGroupIds;
    status;
};
exports.AiProject = AiProject;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], AiProject.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], AiProject.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], AiProject.prototype, "gitUrl", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'main' }),
    __metadata("design:type", String)
], AiProject.prototype, "gitBranch", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'docs/' }),
    __metadata("design:type", String)
], AiProject.prototype, "gitDefaultPath", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_2.Types.ObjectId], ref: 'User', default: [] }),
    __metadata("design:type", Array)
], AiProject.prototype, "adminUserIds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_2.Types.ObjectId], ref: 'Group', default: [] }),
    __metadata("design:type", Array)
], AiProject.prototype, "authorizedGroupIds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'active' }),
    __metadata("design:type", String)
], AiProject.prototype, "status", void 0);
exports.AiProject = AiProject = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], AiProject);
exports.AiProjectSchema = mongoose_1.SchemaFactory.createForClass(AiProject);
exports.AiProjectSchema.index({ status: 1 });
exports.AiProjectSchema.index({ authorizedGroupIds: 1 });
//# sourceMappingURL=ai-project.schema.js.map