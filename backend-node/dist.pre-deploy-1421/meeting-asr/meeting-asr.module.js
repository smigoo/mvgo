"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingAsrModule = void 0;
const common_1 = require("@nestjs/common");
const meeting_asr_controller_1 = require("./meeting-asr.controller");
const meeting_asr_service_1 = require("./meeting-asr.service");
let MeetingAsrModule = class MeetingAsrModule {
};
exports.MeetingAsrModule = MeetingAsrModule;
exports.MeetingAsrModule = MeetingAsrModule = __decorate([
    (0, common_1.Module)({
        controllers: [meeting_asr_controller_1.MeetingAsrController],
        providers: [meeting_asr_service_1.MeetingAsrService],
        exports: [meeting_asr_service_1.MeetingAsrService],
    })
], MeetingAsrModule);
//# sourceMappingURL=meeting-asr.module.js.map