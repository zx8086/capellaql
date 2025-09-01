"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPatchMetadata = void 0;
const utils_1 = require("./utils");
const lineRegex = /^(\s*)(.*):(?:$| )+(.*)$/i;
function extractPatchMetadata(dotSnykFileContent) {
    let writingPatches = false;
    let writingTo;
    // .snyk parsing => snyk-policy ( or js-yaml )
    const patches = dotSnykFileContent
        .split('\n')
        .filter((l) => l.length && !l.trimStart().startsWith('#'))
        .map((line) => lineRegex.exec(line.trimEnd()))
        .filter(Boolean)
        .reduce((acc, thing) => {
        var _a, _b;
        const [, prefix, key, value] = thing;
        if (writingPatches && prefix === '') {
            writingPatches = false;
        }
        else if (prefix === '' && key === 'patch' && value === '') {
            writingPatches = true;
        }
        else if (writingPatches) {
            if (prefix.length === 2) {
                writingTo = key;
                acc[key] = [];
            }
            else {
                if (key.startsWith('-')) {
                    const destination = (_b = (_a = key
                        .substring(1)
                        .split('>')
                        .pop()) === null || _a === void 0 ? void 0 : _a.trim()) === null || _b === void 0 ? void 0 : _b.replace(/['"]/g, '');
                    if (!acc[writingTo].includes(destination)) {
                        acc[writingTo].push(destination);
                    }
                }
            }
        }
        return acc;
    }, {});
    const vulnIdAndPackageNames = [];
    for (const vulnId of Object.keys(patches)) {
        const packageNames = patches[vulnId];
        if (packageNames.length === 0) {
            throw new Error('should never have no package names for a vulnId in a .snyk file');
        }
        else if (packageNames.length > 1) {
            throw new Error('should never have more than one package name for a vulnId in a .snyk file');
        }
        else {
            vulnIdAndPackageNames.push({
                vulnId: (0, utils_1.deQuote)(vulnId.trim()),
                packageName: packageNames[0],
            });
        }
    }
    return vulnIdAndPackageNames;
}
exports.extractPatchMetadata = extractPatchMetadata;
//# sourceMappingURL=snyk-file.js.map