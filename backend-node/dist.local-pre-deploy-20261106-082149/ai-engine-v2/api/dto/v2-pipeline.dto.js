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
exports.GenerateV2Dto = exports.PreviewV2Dto = void 0;
const class_validator_1 = require("class-validator");
class PreviewV2Dto {
    spec;
    tier;
    sourceType;
    specOverrides;
    tierOverrides;
    modelOverrides;
    config;
}
exports.PreviewV2Dto = PreviewV2Dto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PreviewV2Dto.prototype, "spec", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PreviewV2Dto.prototype, "tier", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['screenshot', 'figma']),
    __metadata("design:type", String)
], PreviewV2Dto.prototype, "sourceType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], PreviewV2Dto.prototype, "specOverrides", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], PreviewV2Dto.prototype, "tierOverrides", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], PreviewV2Dto.prototype, "modelOverrides", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], PreviewV2Dto.prototype, "config", void 0);
class GenerateV2Dto extends PreviewV2Dto {
    imageBase64;
    figmaUrl;
    componentName;
    groupId;
    promptInjectionMode;
}
exports.GenerateV2Dto = GenerateV2Dto;
__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.sourceType !== 'figma'),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GenerateV2Dto.prototype, "imageBase64", void 0);
__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.sourceType === 'figma'),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GenerateV2Dto.prototype, "figmaUrl", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateV2Dto.prototype, "componentName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateV2Dto.prototype, "groupId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['replace', 'append']),
    __metadata("design:type", String)
], GenerateV2Dto.prototype, "promptInjectionMode", void 0);
//# sourceMappingURL=v2-pipeline.dto.js.map