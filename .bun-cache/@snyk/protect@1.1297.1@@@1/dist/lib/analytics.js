"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAnalytics = void 0;
const http_1 = require("./http");
const snyk_api_1 = require("./snyk-api");
const os = require("os");
const fs_1 = require("fs");
const path = require("path");
function getVersion() {
    return JSON.parse((0, fs_1.readFileSync)(path.resolve(__dirname, '../../package.json'), 'utf-8')).version;
}
function getAnalyticsData(result) {
    return {
        command: `@snyk/protect`,
        args: [],
        version: getVersion(),
        nodeVersion: process.version,
        metadata: {
            protectResult: result,
        },
    };
}
async function sendAnalytics(result) {
    if (!allowAnalytics()) {
        return;
    }
    try {
        const apiBaseUrl = (0, snyk_api_1.getApiBaseUrl)();
        const apiUrl = `${apiBaseUrl}/v1/analytics/cli`;
        const data = {
            data: getAnalyticsData(result),
        };
        await (0, http_1.postJson)(apiUrl, data);
    }
    catch (err) {
        // do nothing and log nothing
    }
}
exports.sendAnalytics = sendAnalytics;
function allowAnalytics() {
    try {
        const snykConfigFile = getSnykConfigFilePath();
        if ((0, fs_1.existsSync)(snykConfigFile)) {
            const config = JSON.parse((0, fs_1.readFileSync)(snykConfigFile, 'utf-8'));
            if (config['disable-analytics'] === '1' ||
                config['disable-analytics'] === 1) {
                return false;
            }
        }
        if (process.env.SNYK_DISABLE_ANALYTICS) {
            return false;
        }
    }
    catch (err) {
        // do nothing and log nothing
    }
    return true;
}
function getSnykConfigFilePath() {
    return (process.env.SNYK_CONFIG_FILE ||
        path.resolve(os.homedir(), '.config', 'configstore', 'snyk.json'));
}
//# sourceMappingURL=analytics.js.map