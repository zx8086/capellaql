"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deQuote = void 0;
function deQuote(s) {
    let res = s;
    if (res.startsWith('"') && res.endsWith('"')) {
        res = res.substring(1, res.length - 1);
    }
    if (res.startsWith("'") && res.endsWith("'")) {
        res = res.substring(1, res.length - 1);
    }
    return res;
}
exports.deQuote = deQuote;
//# sourceMappingURL=utils.js.map