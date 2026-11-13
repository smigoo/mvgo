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
exports.SaveDecisionsDto = exports.GenerateProjectDto = exports.FreezeProjectDto = exports.PickProjectDto = exports.ScanProjectDto = exports.InspectProjectDto = void 0;
const class_validator_1 = require("class-validator");
class InspectProjectDto {
    projectDir;
}
exports.InspectProjectDto = InspectProjectDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(1024),
    __metadata("design:type", String)
], InspectProjectDto.prototype, "projectDir", void 0);
class ScanProjectDto extends InspectProjectDto {
    note;
    vision;
    enrich;
}
exports.ScanProjectDto = ScanProjectDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ScanProjectDto.prototype, "note", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ScanProjectDto.prototype, "vision", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['defer', 'sync']),
    __metadata("design:type", String)
], ScanProjectDto.prototype, "enrich", void 0);
class PickProjectDto {
    projectDir;
}
exports.PickProjectDto = PickProjectDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1024),
    __metadata("design:type", String)
], PickProjectDto.prototype, "projectDir", void 0);
class FreezeProjectDto {
    runId;
}
exports.FreezeProjectDto = FreezeProjectDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], FreezeProjectDto.prototype, "runId", void 0);
class GenerateProjectDto {
    runId;
}
exports.GenerateProjectDto = GenerateProjectDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], GenerateProjectDto.prototype, "runId", void 0);
class SaveDecisionsDto {
    runId;
    entries;
}
exports.SaveDecisionsDto = SaveDecisionsDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], SaveDecisionsDto.prototype, "runId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], SaveDecisionsDto.prototype, "entries", void 0);
//# sourceMappingURL=project-pipeline.dto.js.map