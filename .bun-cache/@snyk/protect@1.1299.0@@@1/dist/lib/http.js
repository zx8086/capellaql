"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postJson = exports.request = void 0;
const http = require("http");
const https = require("https");
async function request(url, data, options = {}) {
    return new Promise((resolve, reject) => {
        const client = new URL(url).protocol === 'https:' ? https : http;
        const requestOptions = {
            ...options,
            agent: new client.Agent({ keepAlive: true }),
        };
        const request = client.request(url, requestOptions, (response) => {
            const body = [];
            response.on('data', (chunk) => body.push(Buffer.from(chunk)));
            response.on('end', () => resolve({ res: response, body: Buffer.concat(body).toString('utf-8') }));
        });
        request.on('error', reject);
        if (data) {
            request.write(data);
        }
        request.end();
    });
}
exports.request = request;
function postJson(url, jsonData, options = {}) {
    const jsonString = JSON.stringify(jsonData);
    const requestOptions = {
        ...options,
        method: 'POST',
        headers: {
            ...options.headers,
            'Content-Type': 'application/json',
        },
    };
    return request(url, jsonString, requestOptions);
}
exports.postJson = postJson;
//# sourceMappingURL=http.js.map