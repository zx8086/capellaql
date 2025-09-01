import { dset } from 'dset';
import { createGraphQLError } from '@graphql-tools/utils';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { isContentTypeMatch } from './utils.js';
export function isPOSTMultipartRequest(request) {
    return request.method === 'POST' && isContentTypeMatch(request, 'multipart/form-data');
}
export function parsePOSTMultipartRequest(request) {
    return handleMaybePromise(() => request.formData(), (requestBody) => {
        const operationsStr = requestBody.get('operations');
        if (!operationsStr) {
            throw createGraphQLError('Missing multipart form field "operations"');
        }
        if (typeof operationsStr !== 'string') {
            throw createGraphQLError('Multipart form field "operations" must be a string');
        }
        let operations;
        try {
            operations = JSON.parse(operationsStr);
        }
        catch {
            throw createGraphQLError('Multipart form field "operations" must be a valid JSON string');
        }
        const mapStr = requestBody.get('map');
        if (mapStr != null) {
            if (typeof mapStr !== 'string') {
                throw createGraphQLError('Multipart form field "map" must be a string');
            }
            let map;
            try {
                map = JSON.parse(mapStr);
            }
            catch {
                throw createGraphQLError('Multipart form field "map" must be a valid JSON string');
            }
            for (const fileIndex in map) {
                const file = requestBody.get(fileIndex);
                const keys = map[fileIndex];
                for (const key of keys) {
                    dset(operations, key, file);
                }
            }
        }
        return operations;
    }, e => {
        if (e instanceof Error && e.message.startsWith('File size limit exceeded: ')) {
            throw createGraphQLError(e.message, {
                extensions: {
                    http: {
                        status: 413,
                    },
                },
            });
        }
        throw e;
    });
}
