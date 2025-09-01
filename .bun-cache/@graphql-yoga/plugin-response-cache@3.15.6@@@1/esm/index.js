import { print } from 'graphql';
import { getDocumentString } from '@envelop/core';
import { defaultBuildResponseCacheKey, createInMemoryCache as envelopCreateInMemoryCache, resultWithMetadata, useResponseCache as useEnvelopResponseCache, } from '@envelop/response-cache';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
export { cacheControlDirective, hashSHA256 } from '@envelop/response-cache';
const operationIdByContext = new WeakMap();
const sessionByRequest = new WeakMap();
function sessionFactoryForEnvelop({ request }) {
    return sessionByRequest.get(request);
}
const cacheKeyFactoryForEnvelop = function cacheKeyFactoryForEnvelop({ context }) {
    const operationId = operationIdByContext.get(context);
    if (operationId == null) {
        throw new Error('[useResponseCache] This plugin is not configured correctly. Make sure you use this plugin with GraphQL Yoga');
    }
    return operationId;
};
const getDocumentStringForEnvelop = executionArgs => {
    const context = executionArgs.contextValue;
    return context.params.query || getDocumentString(executionArgs.document, print);
};
export function useResponseCache(options) {
    const buildResponseCacheKey = options?.buildResponseCacheKey || defaultBuildResponseCacheKey;
    const cache = options.cache ?? createInMemoryCache();
    const enabled = options.enabled ?? (() => true);
    let logger;
    return {
        onYogaInit({ yoga }) {
            logger = yoga.logger;
        },
        onPluginInit({ addPlugin }) {
            addPlugin(useEnvelopResponseCache({
                ...options,
                enabled: (context) => enabled(context.request, context),
                cache,
                getDocumentString: getDocumentStringForEnvelop,
                session: sessionFactoryForEnvelop,
                buildResponseCacheKey: cacheKeyFactoryForEnvelop,
                shouldCacheResult({ cacheKey, result }) {
                    let shouldCache;
                    if (options.shouldCacheResult) {
                        shouldCache = options.shouldCacheResult({ cacheKey, result });
                    }
                    else {
                        shouldCache = !result.errors?.length;
                        if (!shouldCache) {
                            logger.debug('[useResponseCache] Decided not to cache the response because it contains errors');
                        }
                    }
                    if (shouldCache) {
                        const extensions = (result.extensions ||= {});
                        const httpExtensions = (extensions.http ||= {});
                        const headers = (httpExtensions.headers ||= {});
                        headers['ETag'] = cacheKey;
                        headers['Last-Modified'] = new Date().toUTCString();
                    }
                    return shouldCache;
                },
            }));
        },
        onRequest({ request, serverContext, fetchAPI, endResponse }) {
            if (enabled(request, serverContext)) {
                const operationId = request.headers.get('If-None-Match');
                if (operationId) {
                    return handleMaybePromise(() => cache.get(operationId), cachedResponse => {
                        if (cachedResponse) {
                            const lastModifiedFromClient = request.headers.get('If-Modified-Since');
                            const lastModifiedFromCache = cachedResponse.extensions?.http?.headers?.['Last-Modified'];
                            if (
                            // This should be in the extensions already but we check it here to make sure
                            lastModifiedFromCache != null &&
                                // If the client doesn't send If-Modified-Since header, we assume the cache is valid
                                (lastModifiedFromClient == null ||
                                    new Date(lastModifiedFromClient).getTime() >=
                                        new Date(lastModifiedFromCache).getTime())) {
                                const okResponse = new fetchAPI.Response(null, {
                                    status: 304,
                                    headers: {
                                        ETag: operationId,
                                    },
                                });
                                endResponse(okResponse);
                            }
                        }
                    });
                }
            }
        },
        onParams({ params, request, context, setResult }) {
            return handleMaybePromise(() => options.session(request, context), sessionId => handleMaybePromise(() => buildResponseCacheKey({
                documentString: params.query || '',
                variableValues: params.variables,
                operationName: params.operationName,
                sessionId,
                request,
                context,
            }), operationId => {
                operationIdByContext.set(context, operationId);
                sessionByRequest.set(request, sessionId);
                if (enabled(request, context)) {
                    return handleMaybePromise(() => cache.get(operationId), cachedResponse => {
                        if (cachedResponse) {
                            const responseWithSymbol = {
                                ...cachedResponse,
                                [Symbol.for('servedFromResponseCache')]: true,
                            };
                            if (options.includeExtensionMetadata) {
                                setResult(resultWithMetadata(responseWithSymbol, { hit: true }));
                            }
                            else {
                                setResult(responseWithSymbol);
                            }
                            return;
                        }
                    });
                }
            }));
        },
    };
}
export const createInMemoryCache = envelopCreateInMemoryCache;
