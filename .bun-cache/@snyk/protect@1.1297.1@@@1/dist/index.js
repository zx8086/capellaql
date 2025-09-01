"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const lib_1 = require("./lib");
async function protect() {
    const projectPath = process.cwd();
    await (0, lib_1.default)(projectPath);
}
exports.protect = protect;
//# sourceMappingURL=index.js.map