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
exports.BindApiDto = exports.BindingSlotDto = exports.BindingSlotChildDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const SAFE_ROLE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,127}$/;
const SOURCE_KIND_VALUES = ['template', 'script', 'echarts', 'props', 'computed'];
class BindingSlotChildDto {
    role;
    refName;
    label;
    sourceKind;
    sourceContext;
}
exports.BindingSlotChildDto = BindingSlotChildDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(SAFE_ROLE_PATTERN),
    __metadata("design:type", String)
], BindingSlotChildDto.prototype, "role", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BindingSlotChildDto.prototype, "refName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BindingSlotChildDto.prototype, "label", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(SOURCE_KIND_VALUES),
    __metadata("design:type", String)
], BindingSlotChildDto.prototype, "sourceKind", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BindingSlotChildDto.prototype, "sourceContext", void 0);
class BindingSlotDto {
    slotId;
    slotType;
    refName;
    label;
    role;
    sourceKind;
    bindable;
    children;
    moduleName;
    functionName;
    parameterValues;
    status;
    stubReason;
    skipReason;
}
exports.BindingSlotDto = BindingSlotDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(SAFE_ID_PATTERN),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "slotId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['table', 'chart', 'select', 'list', 'stat', 'form']),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "slotType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(SAFE_IDENTIFIER_PATTERN),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "refName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "label", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(SAFE_ROLE_PATTERN),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "role", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(SOURCE_KIND_VALUES),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "sourceKind", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], BindingSlotDto.prototype, "bindable", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BindingSlotChildDto),
    __metadata("design:type", Array)
], BindingSlotDto.prototype, "children", void 0);
__decorate([
    (0, class_validator_1.ValidateIf)((slot) => slot.status === 'bound'),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(SAFE_ID_PATTERN),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "moduleName", void 0);
__decorate([
    (0, class_validator_1.ValidateIf)((slot) => slot.status === 'bound'),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(SAFE_IDENTIFIER_PATTERN),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "functionName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], BindingSlotDto.prototype, "parameterValues", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['bound', 'stub', 'skipped']),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "stubReason", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BindingSlotDto.prototype, "skipReason", void 0);
class BindApiDto {
    catalogId;
    componentId;
    groupId;
    componentName;
    bindings;
    aiConfig;
}
exports.BindApiDto = BindApiDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(SAFE_ID_PATTERN),
    __metadata("design:type", String)
], BindApiDto.prototype, "catalogId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(SAFE_ID_PATTERN),
    __metadata("design:type", String)
], BindApiDto.prototype, "componentId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(SAFE_ID_PATTERN),
    __metadata("design:type", String)
], BindApiDto.prototype, "groupId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BindApiDto.prototype, "componentName", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BindingSlotDto),
    __metadata("design:type", Array)
], BindApiDto.prototype, "bindings", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], BindApiDto.prototype, "aiConfig", void 0);
//# sourceMappingURL=bind-api.dto.js.map