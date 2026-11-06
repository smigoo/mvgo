"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenLayoutModule = void 0;
const common_1 = require("@nestjs/common");
const screen_layout_controller_1 = require("./screen-layout.controller");
const screen_layout_service_1 = require("./screen-layout.service");
let ScreenLayoutModule = class ScreenLayoutModule {
};
exports.ScreenLayoutModule = ScreenLayoutModule;
exports.ScreenLayoutModule = ScreenLayoutModule = __decorate([
    (0, common_1.Module)({
        controllers: [screen_layout_controller_1.ScreenLayoutController],
        providers: [screen_layout_service_1.ScreenLayoutService],
        exports: [screen_layout_service_1.ScreenLayoutService],
    })
], ScreenLayoutModule);
//# sourceMappingURL=screen-layout.module.js.map