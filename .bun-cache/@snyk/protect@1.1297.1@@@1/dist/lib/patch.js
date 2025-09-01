"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchString = exports.extractTargetFilePathFromPatch = exports.applyPatchToFile = exports.createOldStylePatchAppliedFlagFilename = void 0;
const path = require("path");
const fs = require("fs");
function createOldStylePatchAppliedFlagFilename(vulnId) {
    const fileSafeVulnId = vulnId.replace(/:/g, '-'); // replace colon with dash for windows compatibility
    return `.snyk-${fileSafeVulnId}.flag`;
}
exports.createOldStylePatchAppliedFlagFilename = createOldStylePatchAppliedFlagFilename;
function applyPatchToFile(patchContents, baseFolder, vulnId) {
    const targetFilePath = path.join(baseFolder, extractTargetFilePathFromPatch(patchContents));
    const flagPath = `${targetFilePath}.snyk-protect.flag`;
    const origPatchFlagPath = `${targetFilePath}.orig`;
    if (fs.existsSync(flagPath) || fs.existsSync(origPatchFlagPath)) {
        return targetFilePath;
    }
    const contentsToPatch = fs.readFileSync(targetFilePath, 'utf-8');
    const patchedContents = patchString(patchContents, contentsToPatch);
    fs.writeFileSync(targetFilePath, patchedContents);
    fs.writeFileSync(flagPath, '');
    const oldStyleFlagFilenamePath = path.resolve(baseFolder, createOldStylePatchAppliedFlagFilename(vulnId));
    const now = new Date().toISOString();
    fs.writeFileSync(oldStyleFlagFilenamePath, now);
    return targetFilePath;
}
exports.applyPatchToFile = applyPatchToFile;
function extractTargetFilePathFromPatch(patchContents) {
    const patchContentLines = patchContents
        .slice(patchContents.search(/^--- a\//m))
        .split('\n');
    const filename = patchContentLines[0].replace('--- a/', '');
    return filename;
}
exports.extractTargetFilePathFromPatch = extractTargetFilePathFromPatch;
const getNextLine = (currentLine, patchLine) => {
    const maybeCarriageReturn = currentLine.endsWith('\r') && !patchLine.endsWith('\r') ? '\r' : '';
    return patchLine.substring(1) + maybeCarriageReturn;
};
const getPatchType = (patchLine) => patchLine.charAt(0);
function patchString(patchContents, contentsToPatch) {
    const patchContentLines = patchContents
        .slice(patchContents.search(/^--- a\//m))
        .split('\n');
    const contentsToPatchLines = contentsToPatch.split('\n');
    if (!patchContentLines[2]) {
        throw new Error('Invalid patch.');
    }
    const unparsedLineToPatch = /^@@ -(\d*),.*@@/.exec(patchContentLines[2]);
    if (!unparsedLineToPatch || !unparsedLineToPatch[1]) {
        throw new Error('Invalid patch.');
    }
    let lineToPatch = parseInt(unparsedLineToPatch[1], 10) - 2;
    const patchLines = patchContentLines.slice(3, patchContentLines.length - 2);
    for (const patchLine of patchLines) {
        lineToPatch += 1;
        const currentLine = contentsToPatchLines[lineToPatch];
        const nextLine = getNextLine(currentLine, patchLine);
        switch (getPatchType(patchLine)) {
            case '-': {
                contentsToPatchLines.splice(lineToPatch, 1);
                break;
            }
            case '+': {
                contentsToPatchLines.splice(lineToPatch, 0, nextLine);
                break;
            }
            case ' ': {
                if (currentLine !== nextLine) {
                    throw new Error('File does not match patch contents.' +
                        '  Expected\n' +
                        '    line from local file\n' +
                        `      ${JSON.stringify(currentLine)}\n` +
                        '    to match patch line\n' +
                        `      ${JSON.stringify(nextLine)}\n`);
                }
                break;
            }
        }
    }
    return contentsToPatchLines.join('\n');
}
exports.patchString = patchString;
//# sourceMappingURL=patch.js.map