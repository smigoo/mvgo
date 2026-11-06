"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiteLabModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../../auth/auth.module");
const config_module_1 = require("../../config/config.module");
const progress_module_1 = require("../../progress/progress.module");
const tasks_module_1 = require("../../tasks/tasks.module");
const lite_module_1 = require("../../lite/lite.module");
const lite_lab_controller_1 = require("./lite-lab.controller");
const lite_lab_service_1 = require("./lite-lab.service");
let LiteLabModule = class LiteLabModule {
};
exports.LiteLabModule = LiteLabModule;
exports.LiteLabModule = LiteLabModule = __decorate([
    (0, common_1.Module)({
        imports: [tasks_module_1.TasksModule, progress_module_1.ProgressModule, auth_module_1.AuthModule, config_module_1.AiConfigModule, lite_module_1.LiteModule],
        controllers: [lite_lab_controller_1.LiteLabController],
        providers: [lite_lab_service_1.LiteLabService],
        exports: [lite_lab_service_1.LiteLabService],
    })
], LiteLabModule);
//# sourceMappingURL=lite-lab.module.js.map