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
exports.PurgeRetentionDto = exports.SetRetentionDto = exports.ComposeDto = exports.WithdrawConsentDto = exports.ConsentDecisionsDto = exports.DeclareConsentDto = exports.ConsentDecisionDto = exports.PatchFieldDto = exports.AttachAudioDto = exports.CreateRunDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const meeting_state_1 = require("../meeting-state");
const MEETING_TYPES = Object.keys(meeting_state_1.TEMPLATE_SCHEMAS);
class CreateRunDto {
    meetingType;
    title;
    outputLanguage;
    participants;
    inputs;
}
exports.CreateRunDto = CreateRunDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(MEETING_TYPES),
    __metadata("design:type", String)
], CreateRunDto.prototype, "meetingType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRunDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRunDto.prototype, "outputLanguage", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateRunDto.prototype, "participants", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateRunDto.prototype, "inputs", void 0);
class AttachAudioDto {
    audioRef;
    durationMs;
    participants;
}
exports.AttachAudioDto = AttachAudioDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AttachAudioDto.prototype, "audioRef", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AttachAudioDto.prototype, "durationMs", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], AttachAudioDto.prototype, "participants", void 0);
class PatchFieldDto {
    value;
    confirmState;
    note;
    reason;
}
exports.PatchFieldDto = PatchFieldDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], PatchFieldDto.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(meeting_state_1.CONFIRM_STATES),
    __metadata("design:type", String)
], PatchFieldDto.prototype, "confirmState", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PatchFieldDto.prototype, "note", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PatchFieldDto.prototype, "reason", void 0);
class ConsentDecisionDto {
    participantId;
    decision;
}
exports.ConsentDecisionDto = ConsentDecisionDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ConsentDecisionDto.prototype, "participantId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['accepted', 'declined']),
    __metadata("design:type", String)
], ConsentDecisionDto.prototype, "decision", void 0);
class DeclareConsentDto {
    participants;
    disclosureVersion;
    summary;
}
exports.DeclareConsentDto = DeclareConsentDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], DeclareConsentDto.prototype, "participants", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeclareConsentDto.prototype, "disclosureVersion", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeclareConsentDto.prototype, "summary", void 0);
class ConsentDecisionsDto {
    decisions;
    disclosureVersion;
}
exports.ConsentDecisionsDto = ConsentDecisionsDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ConsentDecisionDto),
    __metadata("design:type", Array)
], ConsentDecisionsDto.prototype, "decisions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConsentDecisionsDto.prototype, "disclosureVersion", void 0);
class WithdrawConsentDto {
    participantId;
    reason;
}
exports.WithdrawConsentDto = WithdrawConsentDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WithdrawConsentDto.prototype, "participantId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WithdrawConsentDto.prototype, "reason", void 0);
class ComposeDto {
    outputLanguage;
    lengthTarget;
}
exports.ComposeDto = ComposeDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ComposeDto.prototype, "outputLanguage", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ComposeDto.prototype, "lengthTarget", void 0);
class SetRetentionDto {
    days;
}
exports.SetRetentionDto = SetRetentionDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(3650),
    __metadata("design:type", Number)
], SetRetentionDto.prototype, "days", void 0);
class PurgeRetentionDto {
    runIds;
    dryRun;
}
exports.PurgeRetentionDto = PurgeRetentionDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], PurgeRetentionDto.prototype, "runIds", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PurgeRetentionDto.prototype, "dryRun", void 0);
//# sourceMappingURL=meeting.dto.js.map