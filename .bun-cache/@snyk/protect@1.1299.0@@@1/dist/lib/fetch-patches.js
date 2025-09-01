"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPatches = exports.fetchPatches = void 0;
const http_1 = require("./http");
const snyk_api_1 = require("./snyk-api");
async function fetchPatches(vulnId, packageName, packageVersion) {
    const apiBaseUrl = (0, snyk_api_1.getApiBaseUrl)();
    const apiUrl = `${apiBaseUrl}/v1/patches/${vulnId}?packageVersion=${packageVersion}`;
    const { res, body } = await (0, http_1.request)(apiUrl);
    if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(JSON.parse(body).error);
    }
    const jsonRes = JSON.parse(body);
    if (jsonRes.packageName !== packageName) {
        throw new Error('packageName in response not equal to packageName');
    }
    const patches = jsonRes.patches;
    const patchInfos = patches; // patchInfos is an array and each element has a .url which is also an array
    const patchDiffs = [];
    for (const p of patchInfos) {
        const diffs = [];
        for (const url of p.urls) {
            const { body: diff } = await (0, http_1.request)(url);
            diffs.push(diff);
        }
        patchDiffs.push({
            patchableVersions: p.patchableVersions,
            patchDiffs: diffs,
        });
    }
    return patchDiffs;
}
exports.fetchPatches = fetchPatches;
// Note that, for any given package@version, there might be N `VulnPatches`, each of which can have multiple `Patch`es, each of which can have multiple actual diffs.
// This is because the backend data model for a vuln is such that a vuln can have N patches (logical patches) and each patch can have N urls (corresponding to physical patches).
async function getAllPatches(vulnIdAndPackageNames, packageNameToVersionsMap) {
    var _a;
    const packageAtVersionsToPatches = new Map();
    for (const vpn of vulnIdAndPackageNames) {
        const packageVersions = packageNameToVersionsMap.get(vpn.packageName);
        if (packageVersions) {
            for (const packageVersion of packageVersions) {
                const packageNameAtVersion = `${vpn.packageName}@${packageVersion}`;
                const patches = await fetchPatches(vpn.vulnId, vpn.packageName, packageVersion);
                const vulnIdAndDiffs = {
                    vulnId: vpn.vulnId,
                    patches,
                };
                if (packageAtVersionsToPatches.has(packageNameAtVersion)) {
                    (_a = packageAtVersionsToPatches
                        .get(packageNameAtVersion)) === null || _a === void 0 ? void 0 : _a.push(vulnIdAndDiffs); // TODO what if this is a duplicate?
                }
                else {
                    packageAtVersionsToPatches.set(packageNameAtVersion, [
                        vulnIdAndDiffs,
                    ]);
                }
            }
        }
    }
    return packageAtVersionsToPatches;
}
exports.getAllPatches = getAllPatches;
//# sourceMappingURL=fetch-patches.js.map