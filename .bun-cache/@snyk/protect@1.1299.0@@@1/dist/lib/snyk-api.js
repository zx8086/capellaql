"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiBaseUrl = void 0;
function getApiBaseUrl() {
    let apiBaseUrl = 'https://snyk.io/api';
    if (process.env.SNYK_API) {
        if (process.env.SNYK_API.endsWith('/api')) {
            apiBaseUrl = process.env.SNYK_API;
        }
        else if (process.env.SNYK_API.endsWith('/api/v1')) {
            // snyk CI environment - we use `.../api/v1` though the norm is just `.../api`
            apiBaseUrl = process.env.SNYK_API.replace('/v1', '');
        }
        else {
            console.warn('Malformed SNYK_API value. Using default: https://snyk.io/api');
        }
    }
    return apiBaseUrl;
}
exports.getApiBaseUrl = getApiBaseUrl;
//# sourceMappingURL=snyk-api.js.map