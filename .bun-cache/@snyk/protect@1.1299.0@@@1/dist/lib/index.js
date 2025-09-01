"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersion = exports.getHelp = void 0;
const fs = require("fs");
const path = require("path");
const snyk_file_1 = require("./snyk-file");
const patch_1 = require("./patch");
const explore_node_modules_1 = require("./explore-node-modules");
const types_1 = require("./types");
const fetch_patches_1 = require("./fetch-patches");
const analytics_1 = require("./analytics");
async function protect(projectFolderPath) {
    // Handle runs with flags
    if (process.argv.includes('--help')) {
        console.log(getHelp());
        return;
    }
    if (process.argv.includes('--version')) {
        console.log(getVersion());
        return;
    }
    const snykFilePath = path.resolve(projectFolderPath, '.snyk');
    if (!fs.existsSync(snykFilePath)) {
        console.log('No .snyk file found.');
        (0, analytics_1.sendAnalytics)({
            type: types_1.ProtectResultType.NO_SNYK_FILE,
        });
        return;
    }
    const snykFileContents = fs.readFileSync(snykFilePath, 'utf8');
    const snykFilePatchMetadata = (0, snyk_file_1.extractPatchMetadata)(snykFileContents);
    const vulnIdAndPackageNames = snykFilePatchMetadata;
    const targetPackageNames = [
        ...new Set(snykFilePatchMetadata.map((vpn) => vpn.packageName)), // get a list of unique package names by converting to Set and then back to array
    ];
    // find instances of the target packages by spelunking through the node_modules looking for modules with a target packageName
    const foundPhysicalPackages = (0, explore_node_modules_1.findPhysicalModules)(projectFolderPath, targetPackageNames);
    // Map of package name to versions (for the target package names).
    // For each package name, we might have found multiple versions and we'll need to fetch patches for each version.
    // We will use this to lookup the versions of packages to get patches for.
    const packageNameToVersionsMap = new Map();
    foundPhysicalPackages.forEach((p) => {
        if (packageNameToVersionsMap.has(p.packageName)) {
            const versions = packageNameToVersionsMap.get(p.packageName);
            if (!(versions === null || versions === void 0 ? void 0 : versions.includes(p.packageVersion))) {
                versions === null || versions === void 0 ? void 0 : versions.push(p.packageVersion);
            }
        }
        else {
            packageNameToVersionsMap.set(p.packageName, [p.packageVersion]);
        }
    });
    const packageAtVersionsToPatches = await (0, fetch_patches_1.getAllPatches)(vulnIdAndPackageNames, packageNameToVersionsMap);
    if (packageAtVersionsToPatches.size === 0) {
        console.log('Nothing to patch.');
        (0, analytics_1.sendAnalytics)({
            type: types_1.ProtectResultType.NOTHING_TO_PATCH,
        });
        return;
    }
    const patchedModules = [];
    foundPhysicalPackages.forEach((fpp) => {
        const packageNameAtVersion = `${fpp.packageName}@${fpp.packageVersion}`;
        const vuldIdAndPatches = packageAtVersionsToPatches.get(packageNameAtVersion);
        vuldIdAndPatches === null || vuldIdAndPatches === void 0 ? void 0 : vuldIdAndPatches.forEach((vp) => {
            vp.patches.forEach((patchDiffs) => {
                patchDiffs.patchDiffs.forEach((diff) => {
                    const patchedPath = (0, patch_1.applyPatchToFile)(diff, fpp.path, vp.vulnId);
                    console.log(`Patched: ${patchedPath}`);
                });
            });
            patchedModules.push({
                vulnId: vp.vulnId,
                packageName: fpp.packageName,
                packageVersion: fpp.packageVersion,
            });
        });
    });
    console.log('Applied Snyk patches.');
    (0, analytics_1.sendAnalytics)({
        type: types_1.ProtectResultType.APPLIED_PATCHES,
        patchedModules,
    });
}
function getHelp() {
    const filePath = path.resolve(__dirname, '../../help.txt');
    const helpText = fs.readFileSync(filePath, 'utf8');
    return helpText;
}
exports.getHelp = getHelp;
function getVersion() {
    const filePath = path.resolve(__dirname, '../../package.json');
    const rawData = fs.readFileSync(filePath, 'utf8');
    const packageJSON = JSON.parse(rawData);
    return packageJSON.version;
}
exports.getVersion = getVersion;
exports.default = protect;
//# sourceMappingURL=index.js.map