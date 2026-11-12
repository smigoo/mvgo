"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingStore = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const backend_root_1 = require("../config/backend-root");
class MeetingStore {
    root;
    constructor(root) {
        this.root = root || process.env.MEETING_DATA_DIR?.trim() || (0, path_1.join)(backend_root_1.dataDir, 'meeting');
    }
    path(name) {
        return (0, path_1.join)(this.root, name);
    }
    read(name, fallback) {
        const p = this.path(name);
        if (!(0, fs_1.existsSync)(p))
            return fallback;
        try {
            const raw = (0, fs_1.readFileSync)(p, 'utf-8');
            if (!raw.trim())
                return fallback;
            return JSON.parse(raw);
        }
        catch {
            return fallback;
        }
    }
    write(name, value) {
        if (!(0, fs_1.existsSync)(this.root))
            (0, fs_1.mkdirSync)(this.root, { recursive: true });
        (0, fs_1.writeFileSync)(this.path(name), JSON.stringify(value, null, 2), 'utf-8');
    }
}
exports.MeetingStore = MeetingStore;
//# sourceMappingURL=meeting.store.js.map