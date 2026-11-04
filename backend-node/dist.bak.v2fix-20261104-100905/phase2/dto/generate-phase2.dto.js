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
exports.GeneratePhase2Dto = exports.ThemeNodeDto = exports.SecondaryNodeDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class SecondaryNodeDto {
    fileKey;
    nodeId;
}
exports.SecondaryNodeDto = SecondaryNodeDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SecondaryNodeDto.prototype, "fileKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SecondaryNodeDto.prototype, "nodeId", void 0);
class ThemeNodeDto {
    fileKey;
    nodeId;
    name;
    brightness;
    panelType;
    previewImageUrl;
}
exports.ThemeNodeDto = ThemeNodeDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ThemeNodeDto.prototype, "fileKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ThemeNodeDto.prototype, "nodeId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ThemeNodeDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['light', 'dark']),
    __metadata("design:type", String)
], ThemeNodeDto.prototype, "brightness", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['default-panel', 'model-panels', 'aio-panel', 'empty']),
    __metadata("design:type", String)
], ThemeNodeDto.prototype, "panelType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ThemeNodeDto.prototype, "previewImageUrl", void 0);
class GeneratePhase2Dto {
    componentName;
    fileKey;
    nodeId;
    themeNodes;
    secondaryNode;
    primaryRole = 'first';
    businessTextRules;
    groupId;
    componentId;
    userComponentId;
    extraPrompt;
    requirementDocText;
    previewToken;
    panelType = 'default-panel';
    target = 'microcode';
    requirementDoc;
    reuseCache;
    docAnalysis;
    config;
}
exports.GeneratePhase2Dto = GeneratePhase2Dto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "componentName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "fileKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "nodeId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(8, { message: 'themeNodes 最多 8 项（每主题一套 mixin）' }),
    (0, class_validator_1.ValidateIf)((o) => Array.isArray(o.themeNodes)),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ThemeNodeDto),
    __metadata("design:type", Array)
], GeneratePhase2Dto.prototype, "themeNodes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((o) => !!o.secondaryNode),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", SecondaryNodeDto)
], GeneratePhase2Dto.prototype, "secondaryNode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['first', 'second']),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "primaryRole", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], GeneratePhase2Dto.prototype, "businessTextRules", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "groupId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "componentId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "userComponentId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "extraPrompt", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "requirementDocText", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "previewToken", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "panelType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['microcode', 'vue3']),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "target", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePhase2Dto.prototype, "requirementDoc", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], GeneratePhase2Dto.prototype, "reuseCache", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], GeneratePhase2Dto.prototype, "docAnalysis", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], GeneratePhase2Dto.prototype, "config", void 0);
//# sourceMappingURL=generate-phase2.dto.js.map